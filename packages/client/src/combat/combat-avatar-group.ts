/** Visible creature presentation for authored combat encounters.
 *
 * Combat state is never decided here. The server projection only selects the
 * idle/hit/attack/defeated presentation, so an unloaded model cannot affect a
 * fight. What this layer does own is everything that makes a creature read as
 * alive rather than pinned: a real size against the player, a contact shadow,
 * an idle wander inside a small leash, squaring up to the player in a fight,
 * a health bar while targeted, and a fade rather than a corpse on defeat.
 */
import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  type AnimationAction,
  type Material,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt, InteractableKind, type Zone } from '@alderfell/shared';
import { createShadowBlob } from '../world/shadow-blob.js';
// Quaternius, "Wolf", CC0 1.0: https://poly.pizza/m/P1gU3Qkr9r
import shoreWolfUrl from '../../../../assets/quaternius/low-poly-animated-animals/wolf.glb?url';
// PolyPizza, "Armabee Evolved", CC0 1.0: https://poly.pizza/m/GcttdvsqsQ
import armabeeUrl from '../../../../assets/poly-pizza/armabee-evolved.glb?url';
// Quaternius, "Ghost" and "Ghost Skull", CC0 1.0 (Ultimate Monsters):
// https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6
import drownedSentinelUrl from '../../../../assets/quaternius/ultimate-monsters/ghost.glb?url';
import drownedWardenUrl from '../../../../assets/quaternius/ultimate-monsters/ghost-skull.glb?url';

type Intent = 'idle' | 'walk' | 'hit' | 'attack' | 'death';

interface Avatar {
  readonly id: string;
  readonly root: Group;
  readonly model: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Map<string, AnimationAction>;
  readonly display: CreatureDisplay;
  /** Model scale that fits `display.height`; restored after a defeat fade. */
  readonly baseScale: number;
  /** Model y that puts the feet on the ground (or at hover height). */
  readonly restY: number;
  readonly homeX: number;
  readonly homeZ: number;
  readonly healthBar: HealthBar;
  readonly flashMaterials: MeshStandardMaterial[];
  current: AnimationAction | null;
  currentIntent: Intent;
  defeated: boolean;
  defeatedAtMs: number;
  lastStrikeAtMs: number;
  retaliationAtMs: number | null;
  attackStartedAtMs: number;
  flashUntilMs: number;
  /** Idle wander target inside the leash, or null while resting. */
  wanderX: number;
  wanderZ: number;
  wanderRestUntilMs: number;
  yaw: number;
}

/**
 * Presentation scale for each creature, held against a 1.8 m player.
 *
 * A bounding box alone lies: a wolf's box is mostly length, an armabee's is
 * mostly wingspan. Heights are authored so a wolf comes to the player's hip
 * and a hovering armabee is a big insect rather than a shadow over the plaza.
 */
interface CreatureDisplay {
  readonly height: number;
  readonly shadowRadius: number;
  /** Hover height for flying creatures; 0 keeps the feet on the ground. */
  readonly hover: number;
  /** Radius of the idle wander around the authored position. */
  readonly leash: number;
  readonly walkSpeed: number;
  readonly tint?: { readonly darken: number; readonly emissive: number; readonly glow: number };
}

const DISPLAY: Readonly<Record<string, CreatureDisplay>> = {
  'int.combat.shore_wolf': {
    height: 0.95,
    shadowRadius: 0.62,
    hover: 0,
    leash: 1.1,
    walkSpeed: 0.7,
  },
  'int.combat.emberwing_armabee': {
    height: 0.72,
    shadowRadius: 0.4,
    hover: 0.55,
    leash: 0.9,
    walkSpeed: 0.9,
  },
  'int.combat.drowned_sentinel': {
    height: 1.9,
    shadowRadius: 0.55,
    hover: 0.12,
    leash: 0.6,
    walkSpeed: 0.4,
    tint: { darken: 0.78, emissive: 0x124d58, glow: 0.28 },
  },
  'int.combat.drowned_warden': {
    height: 2.35,
    shadowRadius: 0.75,
    hover: 0.15,
    leash: 0.4,
    walkSpeed: 0.3,
    tint: { darken: 0.62, emissive: 0x166f72, glow: 0.55 },
  },
};

const models = {
  'int.combat.shore_wolf': new GLTFLoader().loadAsync(shoreWolfUrl),
  'int.combat.emberwing_armabee': new GLTFLoader().loadAsync(armabeeUrl),
  'int.combat.drowned_sentinel': new GLTFLoader().loadAsync(drownedSentinelUrl),
  'int.combat.drowned_warden': new GLTFLoader().loadAsync(drownedWardenUrl),
} as const;

/** How long the death clip plays before the creature fades out of the world. */
const FADE_AFTER_MS = 900;
const FADE_MS = 500;
const HIT_FLASH_MS = 140;

export interface CombatProjection {
  readonly interactableId: string;
  readonly hitpoints: number;
  readonly maxHitpoints: number;
  readonly defeated: boolean;
  readonly enemyDamage: number;
}

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

  /** World-space point above a creature's head, for hitsplats. Null until loaded. */
  headPoint(id: string): { x: number; y: number; z: number } | null {
    const avatar = this.avatars.get(id);
    if (!avatar) return null;
    return {
      x: avatar.root.position.x,
      y: avatar.root.position.y + avatar.display.height + avatar.display.hover + 0.25,
      z: avatar.root.position.z,
    };
  }

  update(
    dtSeconds: number,
    combat: CombatProjection | null,
    lastStrikeAtMs: number,
    player: { readonly x: number; readonly z: number },
    nowMs: number,
  ): void {
    if (this.disposed) return;
    for (const avatar of this.avatars.values()) {
      const targeted = combat?.interactableId === avatar.id;
      const defeated = targeted && combat.defeated;
      if (defeated !== avatar.defeated) {
        avatar.defeated = defeated;
        avatar.defeatedAtMs = nowMs;
        this.play(avatar, defeated ? 'death' : 'idle');
        if (!defeated) avatar.model.scale.setScalar(avatar.baseScale);
      }
      if (targeted && !defeated && lastStrikeAtMs > avatar.lastStrikeAtMs) {
        avatar.lastStrikeAtMs = lastStrikeAtMs;
        avatar.flashUntilMs = nowMs + HIT_FLASH_MS;
        this.play(avatar, 'hit');
        avatar.retaliationAtMs = nowMs + 280;
      }
      if (!defeated && avatar.retaliationAtMs !== null && nowMs >= avatar.retaliationAtMs) {
        avatar.retaliationAtMs = null;
        avatar.attackStartedAtMs = nowMs;
        this.play(avatar, 'attack');
      }
      if (!defeated && avatar.currentIntent === 'hit' && nowMs - avatar.lastStrikeAtMs > 380)
        this.play(avatar, 'idle');
      if (
        !defeated &&
        avatar.currentIntent === 'attack' &&
        nowMs - avatar.attackStartedAtMs > 1_100
      )
        this.play(avatar, 'idle');

      this.updateFlash(avatar, nowMs);
      if (defeated) this.updateFade(avatar, nowMs);
      else if (targeted) this.squareUp(avatar, player, dtSeconds);
      else this.wander(avatar, dtSeconds, nowMs);

      avatar.root.rotation.y = avatar.yaw;
      if (avatar.display.hover > 0)
        avatar.model.position.y = avatar.restY + Math.sin(nowMs / 420 + avatar.homeX) * 0.06;

      avatar.healthBar.update(
        targeted && !defeated,
        targeted ? combat.hitpoints : 0,
        targeted ? combat.maxHitpoints : 1,
        avatar.display.height + avatar.display.hover + 0.35,
      );
      avatar.mixer.update(Math.min(dtSeconds, 0.05));
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const avatar of this.avatars.values()) {
      avatar.mixer.stopAllAction();
      avatar.healthBar.dispose();
      for (const material of avatar.flashMaterials) material.dispose();
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
    const display = DISPLAY[id] ?? DISPLAY['int.combat.shore_wolf']!;
    const model = clone(gltf.scene) as Group;
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
    const scale = display.height / height;
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale + display.hover;
    const flashMaterials: MeshStandardMaterial[] = [];
    model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = this.shadowsEnabled;
      node.receiveShadow = this.shadowsEnabled;
      // Every creature owns its materials so a hit flash on one never
      // repaints a sibling clone or the cached source scene.
      const sources: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      const owned = sources.map((source) => {
        if (!(source instanceof MeshStandardMaterial)) return source;
        const material = source.clone();
        if (display.tint) {
          material.color.multiplyScalar(display.tint.darken);
          material.emissive.set(display.tint.emissive);
          material.emissiveIntensity = display.tint.glow;
        }
        flashMaterials.push(material);
        return material;
      });
      node.material = Array.isArray(node.material) ? owned : owned[0]!;
    });
    const root = new Group();
    root.name = `combat-avatar:${id}`;
    // A tap on the creature itself is the attack; the model carries the id so
    // the world raycast resolves it without a separate marker.
    root.userData['interactableId'] = id;
    root.position.set(x, heightAt(this.zone.terrain, { x, z }), z);
    root.add(model);
    root.add(createShadowBlob(display.shadowRadius));
    const healthBar = new HealthBar();
    root.add(healthBar.sprite);
    const mixer = new AnimationMixer(model);
    const actions = new Map<string, AnimationAction>();
    for (const clip of gltf.animations)
      actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));
    const avatar: Avatar = {
      id,
      root,
      model,
      mixer,
      actions,
      display,
      baseScale: scale,
      restY: -bounds.min.y * scale + display.hover,
      homeX: x,
      homeZ: z,
      healthBar,
      flashMaterials,
      current: null,
      currentIntent: 'idle',
      defeated: false,
      defeatedAtMs: 0,
      lastStrikeAtMs: 0,
      retaliationAtMs: null,
      attackStartedAtMs: 0,
      flashUntilMs: 0,
      wanderX: x,
      wanderZ: z,
      wanderRestUntilMs: 0,
      yaw: Math.random() * Math.PI * 2,
    };
    this.avatars.set(id, avatar);
    this.root.add(root);
    this.play(avatar, 'idle');
  }

  /** Turns to face the player and closes to a natural striking distance. */
  private squareUp(avatar: Avatar, player: { x: number; z: number }, dtSeconds: number): void {
    const dx = player.x - avatar.root.position.x;
    const dz = player.z - avatar.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 1e-3) avatar.yaw = turnToward(avatar.yaw, Math.atan2(dx, dz), 8, dtSeconds);
    // Creatures step toward the player but stop shy of them and never leave
    // their leash, so the fight reads as contact without any actual collision.
    const reach = avatar.display.shadowRadius + 0.55;
    if (distance > reach) {
      const step = Math.min(distance - reach, avatar.display.walkSpeed * 1.6 * dtSeconds);
      this.moveWithinLeash(avatar, dx / distance, dz / distance, step);
      if (avatar.currentIntent === 'idle') this.play(avatar, 'walk');
    } else if (avatar.currentIntent === 'walk') {
      this.play(avatar, 'idle');
    }
  }

  /** Slow ambling inside the leash so a resting creature is never a statue. */
  private wander(avatar: Avatar, dtSeconds: number, nowMs: number): void {
    if (avatar.currentIntent === 'hit' || avatar.currentIntent === 'attack') return;
    const dx = avatar.wanderX - avatar.root.position.x;
    const dz = avatar.wanderZ - avatar.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08) {
      if (avatar.currentIntent === 'walk') this.play(avatar, 'idle');
      if (nowMs < avatar.wanderRestUntilMs) return;
      if (avatar.wanderRestUntilMs === 0) {
        avatar.wanderRestUntilMs = nowMs + 2_500 + Math.random() * 5_000;
        return;
      }
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * avatar.display.leash;
      avatar.wanderX = avatar.homeX + Math.cos(angle) * radius;
      avatar.wanderZ = avatar.homeZ + Math.sin(angle) * radius;
      avatar.wanderRestUntilMs = 0;
      return;
    }
    avatar.yaw = turnToward(avatar.yaw, Math.atan2(dx, dz), 4, dtSeconds);
    const step = Math.min(distance, avatar.display.walkSpeed * dtSeconds);
    avatar.root.position.x += (dx / distance) * step;
    avatar.root.position.z += (dz / distance) * step;
    avatar.root.position.y = heightAt(this.zone.terrain, {
      x: avatar.root.position.x,
      z: avatar.root.position.z,
    });
    if (avatar.currentIntent === 'idle') this.play(avatar, 'walk');
  }

  private moveWithinLeash(avatar: Avatar, nx: number, nz: number, step: number): void {
    const x = avatar.root.position.x + nx * step;
    const z = avatar.root.position.z + nz * step;
    const leash = avatar.display.leash + 0.6;
    if (Math.hypot(x - avatar.homeX, z - avatar.homeZ) > leash) return;
    avatar.root.position.x = x;
    avatar.root.position.z = z;
    avatar.root.position.y = heightAt(this.zone.terrain, { x, z });
  }

  private updateFlash(avatar: Avatar, nowMs: number): void {
    const flashing = nowMs < avatar.flashUntilMs;
    for (const material of avatar.flashMaterials) {
      const base = avatar.display.tint;
      if (flashing) {
        material.emissive.set(0xffffff);
        material.emissiveIntensity = 0.55;
      } else {
        material.emissive.set(base?.emissive ?? 0x000000);
        material.emissiveIntensity = base?.glow ?? 0;
      }
    }
  }

  /** Defeated creatures dissolve rather than lie there: PG by construction. */
  private updateFade(avatar: Avatar, nowMs: number): void {
    const since = nowMs - avatar.defeatedAtMs - FADE_AFTER_MS;
    if (since < 0) return;
    const t = Math.min(1, since / FADE_MS);
    avatar.model.scale.setScalar(avatar.baseScale * (1 - t * t));
  }

  private play(avatar: Avatar, intent: Intent): void {
    const exact = `animalarmature|${
      intent === 'death'
        ? 'death'
        : intent === 'hit'
          ? 'idle_hitreact_left'
          : intent === 'attack'
            ? 'attack'
            : intent === 'walk'
              ? 'walk'
              : 'idle'
    }`;
    const tokens =
      intent === 'hit'
        ? ['hit']
        : intent === 'attack'
          ? ['attack', 'punch', 'headbutt', 'bite']
          : intent === 'walk'
            ? ['walk', 'run', 'fly', 'move']
            : intent === 'idle'
              ? ['idle', 'fly', 'hover']
              : ['death', 'die'];
    const next =
      avatar.actions.get(exact) ??
      [...avatar.actions.entries()].find(([name]) =>
        tokens.some((token) => name.includes(token)),
      )?.[1] ??
      (intent === 'idle' || intent === 'walk' ? [...avatar.actions.values()][0] : undefined);
    if (!next) {
      avatar.currentIntent = intent;
      return;
    }
    if (next === avatar.current) {
      avatar.currentIntent = intent;
      return;
    }
    next.reset().play();
    if (intent === 'death') next.clampWhenFinished = true;
    avatar.current?.crossFadeTo(next, 0.16, false);
    avatar.current = next;
    avatar.currentIntent = intent;
  }
}

function turnToward(current: number, target: number, rate: number, dtSeconds: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const step = rate * dtSeconds;
  return current + Math.max(-step, Math.min(step, delta));
}

/** A billboard health bar shown only while the creature is the target. */
class HealthBar {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private drawnFraction = -1;

  constructor() {
    this.canvas.width = 128;
    this.canvas.height = 20;
    this.texture = new CanvasTexture(this.canvas);
    this.sprite = new Sprite(
      new SpriteMaterial({ map: this.texture, transparent: true, depthTest: false }),
    );
    this.sprite.scale.set(1.1, 0.17, 1);
    this.sprite.visible = false;
    this.sprite.renderOrder = 19;
    this.sprite.raycast = () => {};
  }

  update(visible: boolean, hitpoints: number, maxHitpoints: number, y: number): void {
    this.sprite.visible = visible;
    if (!visible) return;
    this.sprite.position.y = y;
    const fraction = Math.max(0, Math.min(1, hitpoints / Math.max(1, maxHitpoints)));
    if (fraction === this.drawnFraction) return;
    this.drawnFraction = fraction;
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, 128, 20);
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(0, 0, 128, 20);
    ctx.fillStyle = '#3fa34d';
    ctx.fillRect(0, 0, Math.round(128 * fraction), 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 125, 17);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
