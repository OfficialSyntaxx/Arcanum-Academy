/** Visible creature presentation for authored combat encounters.
 *
 * Combat state is never decided here. The server projection only selects the
 * idle/hit/defeated presentation, so an unloaded model cannot affect a fight.
 */
import { AnimationMixer, Box3, Group, Mesh, type AnimationAction } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { heightAt, InteractableKind, type Zone } from '@alderfell/shared';
import armabeeUrl from '../../../../assets/poly-pizza/armabee-evolved.glb?url';

interface Avatar {
  readonly id: string;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Map<string, AnimationAction>;
  current: AnimationAction | null;
  defeated: boolean;
  lastStrikeAtMs: number;
}

const modelPromise = new GLTFLoader().loadAsync(armabeeUrl);

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
      void modelPromise.then((gltf) =>
        this.create(encounter.id, encounter.position.x, encounter.position.z, gltf),
      );
    }
  }

  update(
    dtSeconds: number,
    combat: { readonly interactableId: string; readonly defeated: boolean } | null,
    lastStrikeAtMs: number,
  ): void {
    if (this.disposed) return;
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
      }
      if (
        !defeated &&
        avatar.current === avatar.actions.get('characterarmature|hitreact') &&
        Date.now() - avatar.lastStrikeAtMs > 380
      ) {
        this.play(avatar, 'idle');
      }
      avatar.mixer.update(Math.min(dtSeconds, 0.05));
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const avatar of this.avatars.values()) avatar.mixer.stopAllAction();
    this.avatars.clear();
    this.root.clear();
  }

  private create(id: string, x: number, z: number, gltf: Awaited<typeof modelPromise>): void {
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
      defeated: false,
      lastStrikeAtMs: 0,
    };
    this.avatars.set(id, avatar);
    this.root.add(root);
    this.play(avatar, 'idle');
  }

  private play(avatar: Avatar, intent: 'idle' | 'hit' | 'death'): void {
    const next =
      intent === 'death'
        ? avatar.actions.get('characterarmature|death')
        : intent === 'hit'
          ? avatar.actions.get('characterarmature|hitreact')
          : (avatar.actions.get('characterarmature|flying_idle') ??
            avatar.actions.get('characterarmature|fast_flying'));
    if (!next || next === avatar.current) return;
    next.reset().play();
    avatar.current?.crossFadeTo(next, 0.16, false);
    avatar.current = next;
  }
}
