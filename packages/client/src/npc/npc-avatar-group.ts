/**
 * Animated presentation for the authored NPC cast.
 *
 * Named characters deserve a readable silhouette and locomotion, while the
 * anonymous crowd remains in the instanced pool. This layer replaces only
 * those named pool slots once the small CC0 character asset is ready; until
 * then the existing procedural figures remain visible as a graceful fallback.
 */

import {
  AnimationMixer,
  Box3,
  Color,
  Group,
  Mesh,
  type AnimationAction,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { NpcRole } from '@alderfell/shared';

import {
  createMiniForestCharacterLoader,
  miniForestArcherUrl,
  PLAYER_DISPLAY_HEIGHT,
} from '../player/player-avatar.js';
import { createShadowBlob } from '../world/shadow-blob.js';
import type { WorldService } from '../world/world-service.js';
import type { NamedNpcPresentation } from './npc-director.js';
import dungeonHumanUrl from '../../../../assets/kenney/mini-dungeon/character-human.glb?url';
import dungeonOrcUrl from '../../../../assets/kenney/mini-dungeon/character-orc.glb?url';

const NAMED_NPC_HEIGHT = PLAYER_DISPLAY_HEIGHT;
const COLOURS: Readonly<Record<string, number>> = {
  'robe.indigo': 0xadb8df,
  'robe.slate': 0xc4d7dd,
  'robe.crimson': 0xe0afb0,
  'coat.umber': 0xd6b78f,
  'apron.moss': 0xb7d5a9,
  'sash.gilt': 0xf2d794,
};

interface Avatar {
  readonly id: string;
  readonly slot: number;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Map<string, AnimationAction>;
  current: AnimationAction | null;
}

type CharacterVariant = 'scholar' | 'townsfolk' | 'warden';

const VARIANT_URL: Readonly<Record<CharacterVariant, string>> = {
  scholar: miniForestArcherUrl,
  townsfolk: dungeonHumanUrl,
  warden: dungeonOrcUrl,
};

const modelPromises = new Map<CharacterVariant, Promise<GLTF>>();

function loadCharacter(variant: CharacterVariant): Promise<GLTF> {
  let promise = modelPromises.get(variant);
  if (!promise) {
    // Every Kenney mini-kit character uses a compatible palette layout. The
    // loader supplies the embedded palette rather than relying on a texture
    // directory that Vite does not serve in production.
    promise = createMiniForestCharacterLoader().loadAsync(VARIANT_URL[variant]);
    modelPromises.set(variant, promise);
  }
  return promise;
}

function variantFor(role: NpcRole): CharacterVariant {
  if (role === NpcRole.Merchant || role === NpcRole.Groundskeeper) return 'townsfolk';
  if (role === NpcRole.Referee || role === NpcRole.Rival) return 'warden';
  return 'scholar';
}

export class NpcAvatarGroup {
  readonly root = new Group();
  private readonly avatars = new Map<string, Avatar>();
  private disposed = false;

  constructor(
    private readonly world: WorldService,
    private readonly shadowsEnabled: boolean,
    named: readonly NamedNpcPresentation[],
  ) {
    this.root.name = 'named-npc-avatars';
    for (const presentation of named) {
      void loadCharacter(variantFor(presentation.role))
        .then((gltf) => {
          if (!this.disposed) this.createAvatar(gltf, presentation);
        })
        .catch(() => {
          // Keep the existing procedural named NPC if an optional GLB fails.
        });
    }
  }

  update(dtSeconds: number, named: readonly NamedNpcPresentation[]): void {
    if (this.disposed) return;
    for (const presentation of named) {
      const avatar = this.avatars.get(presentation.id);
      if (!avatar) continue;
      avatar.root.position.set(
        presentation.position.x,
        presentation.elevation,
        presentation.position.z,
      );
      avatar.root.rotation.y = presentation.facing;
      this.play(avatar, presentation.gait > 0.08 ? 'walk' : 'idle');
      avatar.mixer.update(Math.min(dtSeconds, 0.05));
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const avatar of this.avatars.values()) {
      avatar.mixer.stopAllAction();
      this.world.actors.setVisualVisible(avatar.slot, true);
    }
    this.avatars.clear();
    this.root.clear();
  }

  private createAvatar(gltf: GLTF, presentation: NamedNpcPresentation): void {
    if (presentation.role === NpcRole.Student || this.avatars.has(presentation.id)) return;
    const model = clone(gltf.scene);
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
    const scale = NAMED_NPC_HEIGHT / height;
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;
    this.tintAndShadow(model, presentation.appearance);

    const root = new Group();
    root.name = `npc-avatar:${presentation.id}:${variantFor(presentation.role)}`;
    root.add(model);
    root.add(createShadowBlob(0.42));
    const mixer = new AnimationMixer(model);
    const actions = new Map<string, AnimationAction>();
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    const avatar: Avatar = {
      id: presentation.id,
      slot: presentation.slot,
      root,
      mixer,
      actions,
      current: null,
    };
    this.root.add(root);
    this.avatars.set(avatar.id, avatar);
    this.world.actors.setVisualVisible(avatar.slot, false);
    this.play(avatar, 'idle');
  }

  private play(avatar: Avatar, name: string): void {
    const next = avatar.actions.get(name) ?? avatar.actions.get('idle');
    if (!next || next === avatar.current) return;
    next.reset().play();
    avatar.current?.crossFadeTo(next, 0.14, false);
    avatar.current = next;
  }

  private tintAndShadow(model: Object3D, appearance: string): void {
    const tint = COLOURS[appearance];
    model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = this.shadowsEnabled;
      node.receiveShadow = this.shadowsEnabled;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      // SkeletonUtils deliberately shares source materials. NPCs need their
      // own copy or a later role's colour would silently repaint everyone
      // already in the scene (and potentially the source model cache).
      const uniqueMaterials = materials.map((material) => material.clone());
      node.material = Array.isArray(node.material) ? uniqueMaterials : uniqueMaterials[0]!;
      if (tint === undefined) return;
      for (const material of uniqueMaterials) {
        // The model is texture-led. A light tint keeps faces and equipment
        // legible while allowing named roles to be distinguished at a glance.
        material.color = material.color.clone().lerp(new Color(tint), 0.16);
      }
    });
  }
}
