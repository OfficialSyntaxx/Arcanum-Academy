/**
 * The one humanoid rig (AI_HANDOVER §6.1.1), driven at runtime.
 *
 * Every human in the world is a Quaternius outfit on the same 65-joint
 * skeleton, built by `tools/scripts/build-characters.mjs`. Action clips
 * (attack, chop, harvest, eat, flinch) come from one shared animation GLB and
 * bind by bone name. The free animation library carries no plain idle or
 * walk, so locomotion is procedural: a breathing idle and a run cycle posed
 * directly on the hip, knee, shoulder, elbow and spine bones. That is also
 * what lets the gait blend continuously with speed instead of snapping
 * between two clips.
 *
 * Clips and the procedural pose are blended by hand rather than through the
 * mixer's fades, because the mixer fades toward the bind pose (a T-pose), not
 * toward whatever the procedural layer is doing.
 */
import {
  AnimationMixer,
  Bone,
  Box3,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Quaternion,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { createShadowBlob } from '../world/shadow-blob.js';
import peasantMaleUrl from '../../../../assets/derived/characters/peasant-m.glb?url';
import peasantFemaleUrl from '../../../../assets/derived/characters/peasant-f.glb?url';
import rangerMaleUrl from '../../../../assets/derived/characters/ranger-m.glb?url';
import animationsUrl from '../../../../assets/derived/characters/animations.glb?url';

export type CharacterOutfit = 'peasant-m' | 'peasant-f' | 'ranger-m';

/** What the character is doing with its hands; locomotion is separate. */
export type CharacterAction = 'none' | 'attack' | 'chop' | 'harvest' | 'eat' | 'flinch';

/** Reference height. Everything else in the world is scaled against it. */
export const CHARACTER_HEIGHT = 1.8;

const OUTFIT_URL: Readonly<Record<CharacterOutfit, string>> = {
  'peasant-m': peasantMaleUrl,
  'peasant-f': peasantFemaleUrl,
  'ranger-m': rangerMaleUrl,
};

const CLIP_FOR_ACTION: Readonly<Record<Exclude<CharacterAction, 'none'>, readonly string[]>> = {
  attack: ['Melee_Hook', 'Sword_Regular_A'],
  chop: ['TreeChopping_Loop'],
  harvest: ['Farm_Harvest'],
  eat: ['Consume'],
  flinch: ['Hit_Knockback'],
};

const LOOPING_ACTIONS: ReadonlySet<CharacterAction> = new Set(['chop', 'harvest']);

/** Strides per second at full run; the swing amplitude scales with gait. */
const RUN_STRIDE_HZ = 2.3;
/** Seconds to blend between the procedural pose and a clip, either way. */
const BLEND_SECONDS = 0.12;

const loader = new GLTFLoader();
const outfitCache = new Map<CharacterOutfit, Promise<GLTF>>();
let animationCache: Promise<AnimationClip[]> | null = null;

function loadOutfit(outfit: CharacterOutfit): Promise<GLTF> {
  let promise = outfitCache.get(outfit);
  if (!promise) {
    promise = loader.loadAsync(OUTFIT_URL[outfit]);
    outfitCache.set(outfit, promise);
  }
  return promise;
}

function loadAnimations(): Promise<AnimationClip[]> {
  animationCache ??= loader.loadAsync(animationsUrl).then((gltf) => gltf.animations);
  return animationCache;
}

interface RigBone {
  readonly node: Object3D;
  readonly bind: Quaternion;
}

const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

export class CharacterRig {
  readonly root = new Group();
  private model: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly bones = new Map<string, RigBone>();
  private current: { action: CharacterAction; clip: AnimationAction } | null = null;
  /** 0 = fully procedural, 1 = fully the clip. */
  private clipWeight = 0;
  private phase = 0;
  private loaded = false;
  private disposed = false;
  private readonly scratchQ = new Quaternion();
  private readonly parentQ = new Quaternion();
  private readonly procedural = new Map<string, Quaternion>();

  constructor(
    readonly outfit: CharacterOutfit,
    private readonly options: {
      readonly shadowsEnabled: boolean;
      /** Optional lerp toward a colour, to tell named roles apart at a glance. */
      readonly tint?: number;
      readonly onReady?: () => void;
    },
  ) {
    this.root.name = `character:${outfit}`;
    void Promise.all([loadOutfit(outfit), loadAnimations()])
      .then(([gltf, clips]) => {
        if (this.disposed) return;
        this.build(gltf, clips);
      })
      .catch(() => {
        // The caller keeps its procedural fallback if the model cannot load.
      });
  }

  get ready(): boolean {
    return this.loaded;
  }

  /**
   * Advances one frame.
   *
   * `gait` is 0 when still and 1 at full run. `action` is what the hands are
   * doing; it is re-asserted every frame so a caller never has to remember to
   * stop an animation when the world state that caused it goes away.
   */
  update(
    dtSeconds: number,
    position: { readonly x: number; readonly y: number; readonly z: number },
    facing: number,
    gait: number,
    action: CharacterAction,
  ): void {
    if (!this.loaded || this.disposed || this.mixer === null) return;
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.y = facing;

    this.syncAction(action);
    this.phase += dtSeconds * RUN_STRIDE_HZ * Math.PI * 2 * Math.max(0.35, gait);
    this.posePrecedural(gait, dtSeconds);

    const targetWeight = this.current === null ? 0 : 1;
    const step = dtSeconds / BLEND_SECONDS;
    this.clipWeight += Math.max(-step, Math.min(step, targetWeight - this.clipWeight));

    if (this.current !== null || this.clipWeight > 0) {
      this.mixer.update(Math.min(dtSeconds, 0.05));
      if (this.clipWeight < 1) {
        // The mixer just wrote the clip pose; pull every bone back toward the
        // procedural pose by the remaining weight.
        for (const [name, bone] of this.bones) {
          const procedural = this.procedural.get(name) ?? bone.bind;
          bone.node.quaternion.slerpQuaternions(procedural, bone.node.quaternion, this.clipWeight);
        }
      }
    }
    if (this.current !== null && !this.current.clip.isRunning()) this.current = null;
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
    this.actions.clear();
    this.bones.clear();
    this.mixer = null;
  }

  private build(gltf: GLTF, clips: AnimationClip[]): void {
    const model = clone(gltf.scene) as Group;
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
    const scale = CHARACTER_HEIGHT / height;
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
    model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = this.options.shadowsEnabled;
      node.receiveShadow = this.options.shadowsEnabled;
      node.frustumCulled = false;
      // Clones share source materials; each character owns its own so a tint
      // never repaints another character or the cached scene.
      const sources: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      const owned = sources.map((source) => {
        const material = source.clone() as MeshStandardMaterial;
        if (this.options.tint !== undefined && material.color)
          material.color.lerp(new Color(this.options.tint), 0.18);
        return material;
      });
      node.material = Array.isArray(node.material) ? owned : owned[0]!;
    });
    model.traverse((node) => {
      if (node instanceof Bone) this.bones.set(node.name, { node, bind: node.quaternion.clone() });
    });
    this.root.add(model);
    this.root.add(createShadowBlob(0.42));
    this.model = model;
    this.mixer = new AnimationMixer(model);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.loaded = true;
    this.options.onReady?.();
  }

  private syncAction(action: CharacterAction): void {
    if (action === 'none') {
      if (this.current !== null && LOOPING_ACTIONS.has(this.current.action)) {
        this.current.clip.stop();
        this.current = null;
      }
      return;
    }
    if (this.current?.action === action) return;
    const names = CLIP_FOR_ACTION[action];
    const name = names[Math.floor(Math.random() * names.length)] ?? names[0]!;
    const clip = this.actions.get(name);
    if (!clip) return;
    this.current?.clip.stop();
    clip.reset();
    clip.setLoop(LOOPING_ACTIONS.has(action) ? LoopRepeat : LoopOnce, Infinity);
    clip.clampWhenFinished = false;
    clip.play();
    this.current = { action, clip };
  }

  /**
   * Writes the idle or run pose onto the bones.
   *
   * Rotations are expressed about the character's own side axis (X, for a
   * hip or shoulder swing) and forward axis (Z, for letting the T-posed arms
   * hang), then carried into each bone's local space through its parent's
   * current orientation, so the maths never has to know how the rig authored
   * its bone axes.
   */
  private posePrecedural(gait: number, dtSeconds: number): void {
    const swing = Math.sin(this.phase);
    const lift = Math.max(0, Math.sin(this.phase - 0.9));
    const liftOpposite = Math.max(0, Math.sin(this.phase - 0.9 + Math.PI));
    const legAmplitude = 0.62 * gait;
    const armAmplitude = 0.55 * gait;
    const breath = Math.sin(this.phase * 0.28) * 0.025 * (1 - gait);
    const armHang = 1.28 - 0.08 * gait;
    const elbow = 0.35 + 0.75 * gait;

    this.pose('spine_02', X, 0.06 * gait + breath);
    this.pose('spine_03', X, 0.05 * gait);
    this.pose('thigh_l', X, swing * legAmplitude);
    this.pose('thigh_r', X, -swing * legAmplitude);
    this.pose('calf_l', X, -liftOpposite * 1.15 * gait - 0.04);
    this.pose('calf_r', X, -lift * 1.15 * gait - 0.04);
    this.pose('upperarm_l', Z, -armHang, X, -swing * armAmplitude - 0.15);
    this.pose('upperarm_r', Z, armHang, X, swing * armAmplitude - 0.15);
    this.pose('lowerarm_l', X, elbow);
    this.pose('lowerarm_r', X, elbow);
    void dtSeconds;
  }

  /** local' = (P⁻¹ · R · P) · bind, with P the parent's orientation in model space. */
  private pose(name: string, axisA: Vector3, angleA: number, axisB?: Vector3, angleB = 0): void {
    const bone = this.bones.get(name);
    if (!bone || this.model === null) return;
    this.modelSpaceQuaternion(bone.node.parent, this.parentQ);
    const rotation = this.scratchQ.setFromAxisAngle(axisA, angleA);
    if (axisB) rotation.multiply(new Quaternion().setFromAxisAngle(axisB, angleB));
    const parentInverse = this.parentQ.clone().invert();
    const local = parentInverse.multiply(rotation).multiply(this.parentQ).multiply(bone.bind);
    bone.node.quaternion.copy(local);
    let stored = this.procedural.get(name);
    if (!stored) {
      stored = new Quaternion();
      this.procedural.set(name, stored);
    }
    stored.copy(local);
  }

  /** Product of quaternions from the model root down to `node`, using current values. */
  private modelSpaceQuaternion(node: Object3D | null, out: Quaternion): Quaternion {
    out.identity();
    const chain: Object3D[] = [];
    let current = node;
    while (current !== null && current !== this.model) {
      chain.push(current);
      current = current.parent;
    }
    for (let i = chain.length - 1; i >= 0; i -= 1) out.multiply(chain[i]!.quaternion);
    return out;
  }
}
