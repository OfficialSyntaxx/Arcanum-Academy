import {
  AnimationMixer,
  Box3,
  Group,
  Mesh,
  Texture,
  type AnimationAction,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import archerUrl from '../../../../assets/kenney/mini-forest/character-archer.glb?url';

/**
 * A progressive replacement for the procedural player silhouette.
 *
 * The fallback actor remains visible until this small, verified Kenney model
 * has loaded. This avoids a blank player during a cold mobile start.
 */
export class PlayerAvatar {
  readonly root = new Group();
  private readonly actions = new Map<string, AnimationAction>();
  private mixer: AnimationMixer | null = null;
  private current: AnimationAction | null = null;
  private loaded = false;
  private disposed = false;

  constructor(
    shadowsEnabled: boolean,
    private readonly onReady: () => void,
  ) {
    this.root.name = 'player-avatar';
    void new GLTFLoader()
      .loadAsync(archerUrl)
      .then((gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model);
        const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
        const scale = 1.78 / height;
        model.scale.setScalar(scale);
        model.position.y = -bounds.min.y * scale;
        model.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          node.castShadow = shadowsEnabled;
          node.receiveShadow = shadowsEnabled;
        });
        this.root.add(model);
        this.mixer = new AnimationMixer(model);
        for (const clip of gltf.animations)
          this.actions.set(clip.name, this.mixer.clipAction(clip));
        this.loaded = true;
        this.play('idle');
        this.onReady();
      })
      .catch(() => {
        // The procedural actor stays active if the optional visual cannot load.
      });
  }

  get ready(): boolean {
    return this.loaded;
  }

  update(
    dtSeconds: number,
    position: { readonly x: number; readonly y: number; readonly z: number },
    facing: number,
    gait: number,
    gathering: boolean,
  ): void {
    if (!this.loaded || this.disposed) return;
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.y = facing;
    this.play(gathering ? 'interact-right' : gait > 0.08 ? 'walk' : 'idle');
    this.mixer?.update(Math.min(dtSeconds, 0.05));
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) disposeMaterial(material);
    });
    this.root.clear();
    this.actions.clear();
    this.mixer = null;
  }

  private play(name: string): void {
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (next === undefined || next === this.current) return;
    next.reset().play();
    this.current?.crossFadeTo(next, 0.14, false);
    this.current = next;
  }
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}
