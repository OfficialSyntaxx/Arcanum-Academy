import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { heightAt, type Zone } from '@alderfell/shared';
import type { QualitySettings } from '../core/device.js';

type Placement = readonly [x: number, z: number, height: number, yaw: number];

/** Bundled model upgrades, with visible geometry from the very first frame.
 * Each source mesh becomes ONE instance batch. Textures and geometry are shared,
 * and a disposed zone can never be resurrected by a late fetch.
 */
export function buildEnvironment(zone: Zone, quality: QualitySettings) {
  const group = new Group();
  group.name = 'shorelands-environment';
  // Decoration must never steal ground taps, including low rocks and flowers.
  const noRaycast = () => {};
  const resources = new Set<BufferGeometry | Material>();
  const textures = new Set<Texture>();
  const instances: InstancedMesh[] = [];
  const decoder = new DRACOLoader().setDecoderPath('/assets/draco/').setWorkerLimit(1);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  let disposed = false;
  const dummy = new Object3D();

  function batch(
    geometry: BufferGeometry,
    material: Material | Material[],
    matrices: Matrix4[],
    parent: Group,
  ) {
    resources.add(geometry);
    for (const m of Array.isArray(material) ? material : [material]) {
      resources.add(m);
      if (m instanceof MeshStandardMaterial && m.map) textures.add(m.map);
    }
    const mesh = new InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = quality.shadowsEnabled;
    mesh.receiveShadow = quality.shadowsEnabled;
    mesh.raycast = noRaycast;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    instances.push(mesh);
  }

  function matricesFor(placements: Placement[], offsetY = 0, scaleY = 1) {
    return placements.map(([x, z, h, yaw]) => {
      dummy.position.set(x, heightAt(zone.terrain, { x, z }) + offsetY * h, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(h, h * scaleY, h);
      dummy.updateMatrix();
      return dummy.matrix.clone();
    });
  }

  function upgrade(name: string, placements: Placement[], fallback: Group) {
    if (placements.length === 0) return;
    group.add(fallback);
    void loader
      .loadAsync(`/assets/environment/${name}.glb`)
      .then(({ scene }) => {
        scene.updateMatrixWorld(true);
        const box = new Box3().setFromObject(scene);
        const size = box.getSize(new Vector3());
        const centre = box.getCenter(new Vector3());
        const normalize = new Matrix4()
          .makeScale(1 / size.y, 1 / size.y, 1 / size.y)
          .multiply(new Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
        const loaded = new Group();
        const placementsMatrices = matricesFor(placements);
        scene.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          batch(
            node.geometry,
            node.material,
            placementsMatrices.map((m) => m.clone().multiply(normalize).multiply(node.matrixWorld)),
            loaded,
          );
        });
        if (disposed) {
          disposeResources();
          return;
        }
        group.remove(fallback);
        group.add(loaded);
      })
      .catch(() => {
        // The locally bundled model is an upgrade, never a prerequisite to play.
        // Keep the complete fallback when offline, evicted, or decoding fails.
      });
  }

  const bark = new MeshStandardMaterial({ color: 0x725038, roughness: 1 });
  const leaves = new MeshStandardMaterial({ color: 0x759449, roughness: 1, flatShading: true });
  const rock = new MeshStandardMaterial({ color: 0x9c9985, roughness: 1, flatShading: true });
  const plaster = new MeshStandardMaterial({ color: 0xe1c894, roughness: 1 });
  const roof = new MeshStandardMaterial({ color: 0x985c43, roughness: 1 });
  [bark, leaves, rock, plaster, roof].forEach((m) => resources.add(m));

  // Hand-composed pockets between existing routes. No navigation or gameplay
  // content is changed by this scenery layer.
  const treeSpots: Placement[] = [
    [-5, -4, 4.4, 0],
    [5, -4, 4.1, 1],
    [-5, 4, 4.0, 2],
    [5, 4, 3.7, 0.5],
    [-11, 5, 4.8, 0],
    [-11, -5, 4.2, 1],
    [11, 6, 4.5, 2],
    [11, -6, 4.3, 0.2],
    [-23, 10, 5.2, 1],
    [-24, 15, 4.3, 0],
    [-16, 23, 5.4, 1],
    [-11, 22, 4.5, 2],
    [-22, -7, 4.9, 2],
    [-25, -3, 4.0, 1],
    [-25, 1, 4.5, 0],
    [24, 8, 4.9, 0],
    [25, 0, 4.4, 1],
    [24, -8, 4.8, 2],
    [12, -22, 4.9, 0],
    [22, 23, 4.3, 0],
    [15, 24, 4.1, 1],
    [-24, -25, 3.8, 2],
  ];
  const trees = treeSpots.slice(0, quality.tier === 'low' ? 14 : treeSpots.length);
  const treeFallback = new Group();
  batch(new CylinderGeometry(0.045, 0.075, 0.48, 7), bark, matricesFor(trees, 0.24), treeFallback);
  batch(new SphereGeometry(0.31, 7, 5), leaves, matricesFor(trees, 0.69, 1.1), treeFallback);
  upgrade('tree', trees, treeFallback);

  const rocks: Placement[] = [
    [-24, -19, 1.8, 0],
    [-22, -21, 2, 1],
    [-17, -23, 1.7, 2],
    [-12, -21, 1.3, 0],
    [-8, 24, 1.3, 2],
    [9, 24, 1.8, 1],
    [25, 19, 2.2, 0],
    [25, 13, 1.2, 1],
    [-8, -10, 0.8, 0],
    [9, -10, 0.9, 2],
    [-8, 10, 0.7, 1],
    [8, 10, 0.8, 0],
  ];
  const rockFallback = new Group();
  batch(new SphereGeometry(0.6, 7, 4), rock, matricesFor(rocks, 0.45, 0.8), rockFallback);
  upgrade('rock', rocks, rockFallback);

  const homes: Placement[] = [
    [17, 8, 4.0, Math.PI],
    [8, 19, 3.8, -Math.PI / 2],
  ];
  const homeFallback = new Group();
  batch(new BoxGeometry(0.8, 0.6, 0.8), plaster, matricesFor(homes, 0.3), homeFallback);
  batch(new ConeGeometry(0.65, 0.4, 4), roof, matricesFor(homes, 0.8), homeFallback);
  upgrade('home', homes, homeFallback);

  // Wildflower clumps: shared geometry, stable placements, capped by device tier.
  const flowers: Placement[] = [];
  const limit = quality.tier === 'low' ? 36 : quality.tier === 'medium' ? 72 : 108;
  for (let i = 0; i < limit; i++) {
    const centreSpot = trees[i % trees.length]!;
    const a = i * 2.399963;
    const r = 1.1 + (i % 5) * 0.2;
    flowers.push([
      centreSpot[0] + Math.cos(a) * r,
      centreSpot[1] + Math.sin(a) * r,
      0.12 + (i % 3) * 0.035,
      a,
    ]);
  }
  const flowerMat = new MeshStandardMaterial({ color: 0xeac573, roughness: 1 });
  batch(new SphereGeometry(0.55, 4, 3), flowerMat, matricesFor(flowers, 0.5), group);

  function disposeResources() {
    instances.forEach((mesh) => mesh.dispose());
    instances.length = 0;
    resources.forEach((resource) => resource.dispose());
    resources.clear();
    textures.forEach((texture) => texture.dispose());
    textures.clear();
  }
  return {
    group,
    dispose() {
      disposed = true;
      decoder.dispose();
      disposeResources();
      group.clear();
    },
  };
}
