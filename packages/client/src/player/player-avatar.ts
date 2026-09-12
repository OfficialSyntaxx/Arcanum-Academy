import {
  AnimationMixer,
  Box3,
  Group,
  LoadingManager,
  Mesh,
  Texture,
  type AnimationAction,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import archerUrl from '../../../../assets/kenney/mini-forest/character-archer.glb?url';

// Mini Forest stores a shared external palette. This compressed copy retains
// the model's intended colours while keeping the client package self-contained.
const avatarPaletteUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC5ElEQVR42u1ZPYsUQRDtXtcLbpU70MhARIMLBBE0FREuVTQzuwONTPRXiGBoJEYXG2ikYGYiaHQ/wMBwuewCwe2PauOqgXk0Nb3Xs9Od1TY90/v6vVfVNdYYk8yEx8xMfDQAGgANgAZAA6AB0ABoADQAGgANgAZAA2CKY3685O2AEHn8+90JiyMRix/Ntvm8eMHum926AZA/rFzsXeCDmN8S8yPrr3QAcJ6UAJhxA7DymQwQI2w6AwIAYPQSWDlSMWD0EnBCAueyARg7A4QEtqfGAAxA6Acgjd0EnTYLbBgDZLW88R7gOnXAbGJp0E89DarrgNEzoJngpBhgPx8+YDuWf3//4CmLSfQDLu7d5gsSn3++/MH7BaLfcPTvG19/6RqPP/7h8VUeHn9dsPjWlVMWv9h7L7aX+hkQwQESKIQSRdVlyoDnG7A8ku3fXyAdAFEJgJcSk/tFAFFhAEgJgEmAARKArYEZkAozQCsBHwAAvrQEkAeYshIIIMtACdTuAUgCvrQJ1i4ByABfOwMiOKFcD8hlQOksgDygOAM6z7d1SQCaYMqsA6AJztebBdR1AAVdJdhJg/O6PICGrgSHToO1SyDUb4JWKQElA3zll6FsCcxyGbBeCdjXb49S33359M6SX9cv8PlPr76weGfnMovv7z8WAPEN/Pr5nZ/IeX45ePjkGYuv37jJ4nt3F6JO4c//++GlYAhgQAJpAB2gbJh0KUqAQaAj5Z34ZZHFsACvw2ADiKEpEbCIqALQ+5UqzQbx/i4Doo4BCXwaI2CSlHIZ0A+AzQWAkASiVTFAajRbAs4BgCLotyAPABvEDDhrCVA/AFoGRNSyI50E0sASQPMFPEDLgKQCwHtkgsWzQFKlQSgBlyeB4RmgNEHEgPw6YOA0SIULISiB0h4QM7OArU0CIAv4zG+bsBS2azZBbR2gl4DwgNmaPaC4BGAhRNpCKOk84qzvAgSzgPI2WFgCyAMkAP8B3GAcT1B6x5AAAAAASUVORK5CYII=';

/** Shared model URL and loader for the player plus the authored NPC cast. */
export const miniForestArcherUrl = archerUrl;

export function createMiniForestCharacterLoader(): GLTFLoader {
  const manager = new LoadingManager();
  manager.setURLModifier((url) =>
    url.endsWith('Textures/colormap.png') ? avatarPaletteUrl : url,
  );
  return new GLTFLoader(manager);
}

// The Mini Forest archer is deliberately chibi-proportioned. Giving the
// player's version a stronger silhouette lets it read above nearby NPCs and
// foliage on a portrait phone without changing its collision footprint.
const PLAYER_DISPLAY_HEIGHT = 2.25;

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
    void createMiniForestCharacterLoader()
      .loadAsync(miniForestArcherUrl)
      .then((gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model);
        const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
        const scale = PLAYER_DISPLAY_HEIGHT / height;
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
