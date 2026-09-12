import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Texture,
  TorusGeometry,
  type AnimationAction,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import archerUrl from '../../../../assets/kenney/mini-forest/character-archer.glb?url';
import type { ActorTool } from '../world/actor-pool.js';

// Mini Forest stores a shared external palette. This compressed copy retains
// the model's intended colours while keeping the client package self-contained.
const avatarPaletteUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAC5ElEQVR42u1ZPYsUQRDtXtcLbpU70MhARIMLBBE0FREuVTQzuwONTPRXiGBoJEYXG2ikYGYiaHQ/wMBwuewCwe2PauOqgXk0Nb3Xs9Od1TY90/v6vVfVNdYYk8yEx8xMfDQAGgANgAZAA6AB0ABoADQAGgANgAZAA2CKY3685O2AEHn8+90JiyMRix/Ntvm8eMHum926AZA/rFzsXeCDmN8S8yPrr3QAcJ6UAJhxA7DymQwQI2w6AwIAYPQSWDlSMWD0EnBCAueyARg7A4QEtqfGAAxA6Acgjd0EnTYLbBgDZLW88R7gOnXAbGJp0E89DarrgNEzoJngpBhgPx8+YDuWf3//4CmLSfQDLu7d5gsSn3++/MH7BaLfcPTvG19/6RqPP/7h8VUeHn9dsPjWlVMWv9h7L7aX+hkQwQESKIQSRdVlyoDnG7A8ku3fXyAdAFEJgJcSk/tFAFFhAEgJgEmAARKArYEZkAozQCsBHwAAvrQEkAeYshIIIMtACdTuAUgCvrQJ1i4ByABfOwMiOKFcD8hlQOksgDygOAM6z7d1SQCaYMqsA6AJztebBdR1AAVdJdhJg/O6PICGrgSHToO1SyDUb4JWKQElA3zll6FsCcxyGbBeCdjXb49S33359M6SX9cv8PlPr76weGfnMovv7z8WAPEN/Pr5nZ/IeX45ePjkGYuv37jJ4nt3F6JO4c//++GlYAhgQAJpAB2gbJh0KUqAQaAj5Z34ZZHFsACvw2ADiKEpEbCIqALQ+5UqzQbx/i4Doo4BCXwaI2CSlHIZ0A+AzQWAkASiVTFAajRbAs4BgCLotyAPABvEDDhrCVA/AFoGRNSyI50E0sASQPMFPEDLgKQCwHtkgsWzQFKlQSgBlyeB4RmgNEHEgPw6YOA0SIULISiB0h4QM7OArU0CIAv4zG+bsBS2azZBbR2gl4DwgNmaPaC4BGAhRNpCKOk84qzvAgSzgPI2WFgCyAMkAP8B3GAcT1B6x5AAAAAASUVORK5CYII=';

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
  private toolAnchor: Group | null = null;
  private heldTool: ActorTool = 'none';
  private toolPhase = 0;
  private loaded = false;
  private disposed = false;

  constructor(
    shadowsEnabled: boolean,
    private readonly onReady: () => void,
  ) {
    this.root.name = 'player-avatar';
    const manager = new LoadingManager();
    manager.setURLModifier((url) =>
      url.endsWith('Textures/colormap.png') ? avatarPaletteUrl : url,
    );
    void new GLTFLoader(manager)
      .loadAsync(archerUrl)
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
        // The character's chibi hands are often hidden by its body from the
        // overhead camera. Mount the tool beside the hand on the model root so
        // its silhouette stays readable; update() supplies the visible swing.
        this.toolAnchor = new Group();
        this.toolAnchor.name = 'held-skill-tool';
        this.toolAnchor.position.set(-0.17, 0.31, 0.12);
        model.add(this.toolAnchor);
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
    tool: ActorTool,
  ): void {
    if (!this.loaded || this.disposed) return;
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.y = facing;
    this.setHeldTool(tool);
    this.updateToolMotion(dtSeconds, gathering);
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
    this.toolAnchor = null;
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

  /** Keeps a deliberately readable tool silhouette beside the animated model. */
  private setHeldTool(tool: ActorTool): void {
    if (tool === this.heldTool || this.toolAnchor === null) return;
    this.heldTool = tool;
    disposeChildren(this.toolAnchor);
    if (tool === 'none') return;

    const wood = new MeshStandardMaterial({ color: 0x70472c, roughness: 0.86 });
    const steel = new MeshStandardMaterial({ color: 0x8397a0, roughness: 0.54, metalness: 0.16 });
    const teal = new MeshStandardMaterial({ color: 0x1d9b91, roughness: 0.68 });
    const toolRoot = new Group();
    toolRoot.rotation.z = -0.66;

    const handle = new Mesh(new BoxGeometry(0.052, 0.52, 0.052), wood);
    handle.position.y = -0.26;
    toolRoot.add(handle);

    if (tool === 'axe' || tool === 'pick') {
      const head = new Mesh(
        new BoxGeometry(tool === 'axe' ? 0.22 : 0.28, 0.09, tool === 'axe' ? 0.1 : 0.065),
        steel,
      );
      head.position.y = -0.49;
      toolRoot.add(head);
    } else if (tool === 'sickle') {
      const blade = new Mesh(new TorusGeometry(0.14, 0.026, 5, 8, Math.PI * 1.3), steel);
      blade.rotation.x = Math.PI / 2;
      blade.position.y = -0.48;
      toolRoot.add(blade);
    } else if (tool === 'net') {
      const hoop = new Mesh(new TorusGeometry(0.17, 0.024, 5, 8), teal);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = -0.52;
      toolRoot.add(hoop);
    }
    this.toolAnchor.add(toolRoot);
  }

  private updateToolMotion(dtSeconds: number, gathering: boolean): void {
    const anchor = this.toolAnchor;
    if (anchor === null || this.heldTool === 'none') return;
    this.toolPhase += Math.min(dtSeconds, 0.05);
    const swing = gathering ? Math.sin(this.toolPhase * 9) * 0.64 - 0.28 : 0;
    anchor.rotation.z = swing;
    anchor.rotation.x = gathering ? Math.cos(this.toolPhase * 9) * 0.12 : 0;
  }
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

function disposeChildren(parent: Group): void {
  parent.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) disposeMaterial(material);
  });
  parent.clear();
}
