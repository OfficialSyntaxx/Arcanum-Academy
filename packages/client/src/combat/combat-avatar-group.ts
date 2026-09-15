/** Visible creature presentation for authored combat encounters.
 *
 * Combat state is never decided here. The server projection only selects the
 * idle/hit/defeated presentation, so an unloaded model cannot affect a fight.
 */
import {
  AnimationMixer,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  type AnimationAction,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt, InteractableKind, type Zone } from '@alderfell/shared';
// Quaternius, "Wolf", CC0 1.0: https://poly.pizza/m/P1gU3Qkr9r
import shoreWolfUrl from '../../../../assets/quaternius/low-poly-animated-animals/wolf.glb?url';
// PolyPizza, "Armabee Evolved", CC0 1.0: https://poly.pizza/m/GcttdvsqsQ
import armabeeUrl from '../../../../assets/poly-pizza/armabee-evolved.glb?url';
// Quaternius, "Ghost" and "Ghost Skull", CC0 1.0 (Ultimate Monsters):
// https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6
import drownedSentinelUrl from '../../../../assets/quaternius/ultimate-monsters/ghost.glb?url';
import drownedWardenUrl from '../../../../assets/quaternius/ultimate-monsters/ghost-skull.glb?url';

interface Avatar {
  readonly id: string;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Map<string, AnimationAction>;
  current: AnimationAction | null;
  currentIntent: 'idle' | 'hit' | 'attack' | 'death';
  defeated: boolean;
  lastStrikeAtMs: number;
  retaliationAtMs: number | null;
  attackStartedAtMs: number;
}

const models = {
  'int.combat.shore_wolf': new GLTFLoader().loadAsync(shoreWolfUrl),
  'int.combat.emberwing_armabee': new GLTFLoader().loadAsync(armabeeUrl),
  'int.combat.drowned_sentinel': new GLTFLoader().loadAsync(drownedSentinelUrl),
  'int.combat.drowned_warden': new GLTFLoader().loadAsync(drownedWardenUrl),
} as const;

export class CombatAvatarGroup {
  readonly root = new Group();
  private readonly avatars = new Map<string, Avatar>();
  private disposed = false;

  constructor(
    private readonly zone: Zone,
    private readonly shadowsEnabled: boolean,
  ) {
    this.root.name = 'combat-encounter-avatars';
    for (const encounter of zone.interactables.filter(
      (entry) => entry.kind === InteractableKind.CombatEncounter,
    )) {
      const model = models[encounter.id as keyof typeof models];
      if (model !== undefined)
        void model.then((gltf) =>
          this.create(encounter.id, encounter.position.x, encounter.position.z, gltf),
        );
    }
  }

  update(
    dtSeconds: number,
    combat: {
      readonly interactableId: string;
      readonly defeated: boolean;
      readonly enemyDamage: number;
    } | null,
    lastStrikeAtMs: number,
  ): void {
    if (this.disposed) return;
    const now = Date.now();
    for (const avatar of this.avatars.values()) {
      const defeated = combat?.interactableId === avatar.id && combat.defeated;
      if (defeated !== avatar.defeated) {
        avatar.defeated = defeated;
        this.play(avatar, defeated ? 'death' : 'idle');
      }
      if (
        !defeated &&
        combat?.interactableId === avatar.id &&
        lastStrikeAtMs > avatar.lastStrikeAtMs
      ) {
        avatar.lastStrikeAtMs = lastStrikeAtMs;
        this.play(avatar, 'hit');
        avatar.retaliationAtMs = combat.enemyDamage > 0 ? now + 280 : null;
      }
      if (!defeated && avatar.retaliationAtMs !== null && now >= avatar.retaliationAtMs) {
        avatar.retaliationAtMs = null;
        avatar.attackStartedAtMs = now;
        this.play(avatar, 'attack');
      }
      if (!defeated && avatar.currentIntent === 'hit' && now - avatar.lastStrikeAtMs > 380) {
        this.play(avatar, 'idle');
      }
      if (
        !defeated &&
        avatar.currentIntent === 'attack' &&
        now - avatar.attackStartedAtMs > 1_100
      ) {
        this.play(avatar, 'idle');
      }
      avatar.mixer.update(Math.min(dtSeconds, 0.05));
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const avatar of this.avatars.values()) {
      avatar.mixer.stopAllAction();
      if (
        avatar.id === 'int.combat.drowned_sentinel' ||
        avatar.id === 'int.combat.drowned_warden'
      ) {
        avatar.root.traverse((node) => {
          if (node instanceof Mesh && node.material instanceof MeshStandardMaterial)
            node.material.dispose();
        });
      }
    }
    this.avatars.clear();
    this.root.clear();
  }

  private create(
    id: string,
    x: number,
    z: number,
    gltf: Awaited<(typeof models)[keyof typeof models]>,
  ): void {
    if (this.disposed || this.avatars.has(id)) return;
    const model = clone(gltf.scene);
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
    const scale = 1.75 / height;
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
    model.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = this.shadowsEnabled;
        node.receiveShadow = this.shadowsEnabled;
        if (id === 'int.combat.drowned_sentinel' || id === 'int.combat.drowned_warden') {
          const source = node.material;
          if (source instanceof MeshStandardMaterial) {
            const material = source.clone();
            material.color.multiplyScalar(id === 'int.combat.drowned_warden' ? 0.62 : 0.78);
            material.emissive.set(id === 'int.combat.drowned_warden' ? 0x166f72 : 0x124d58);
            material.emissiveIntensity = id === 'int.combat.drowned_warden' ? 0.55 : 0.28;
            node.material = material;
          }
        }
      }
    });
    const root = new Group();
    root.name = `combat-avatar:${id}`;
    root.position.set(x, heightAt(this.zone.terrain, { x, z }), z);
    root.add(model);
    const mixer = new AnimationMixer(model);
    const actions = new Map<string, AnimationAction>();
    for (const clip of gltf.animations)
      actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));
    const avatar: Avatar = {
      id,
      root,
      mixer,
      actions,
      current: null,
      currentIntent: 'idle',
      defeated: false,
      lastStrikeAtMs: 0,
      retaliationAtMs: null,
      attackStartedAtMs: 0,
    };
    this.avatars.set(id, avatar);
    this.root.add(root);
    this.play(avatar, 'idle');
  }

  private play(avatar: Avatar, intent: 'idle' | 'hit' | 'attack' | 'death'): void {
    const exact =
      intent === 'death'
        ? 'animalarmature|death'
        : intent === 'hit'
          ? 'animalarmature|idle_hitreact_left'
          : intent === 'attack'
            ? 'animalarmature|attack'
            : 'animalarmature|idle';
    const tokens =
      intent === 'hit'
        ? ['hit']
        : intent === 'attack'
          ? ['attack', 'punch', 'headbutt']
          : intent === 'idle'
            ? ['idle']
            : ['death'];
    const next =
      avatar.actions.get(exact) ??
      [...avatar.actions.entries()].find(([name]) =>
        tokens.some((token) => name.includes(token)),
      )?.[1] ??
      (intent === 'idle' ? [...avatar.actions.values()][0] : undefined);
    if (!next || next === avatar.current) return;
    next.reset().play();
    avatar.current?.crossFadeTo(next, 0.16, false);
    avatar.current = next;
    avatar.currentIntent = intent;
  }
}
