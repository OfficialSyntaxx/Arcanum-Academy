import {
  Box3,
  Color,
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

/** How far each region pulls the shared scenery models toward its own colour. */
const SCENERY_GRADE: Readonly<Record<string, { readonly tint: number; readonly amount: number }>> =
  {
    'zone.courtyard': { tint: 0xffffff, amount: 0 },
    'zone.forest': { tint: 0x2f5a33, amount: 0.25 },
    'zone.mountains': { tint: 0x9aa392, amount: 0.35 },
    'zone.snow': { tint: 0xe8f0f6, amount: 0.55 },
  };

export type EnvironmentPlacement = readonly [x: number, z: number, height: number, yaw: number];
type Placement = EnvironmentPlacement;

const TREE_SPOTS: Placement[] = [
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
const ROCK_SPOTS: Placement[] = [
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
const HOME_SPOTS: Placement[] = [
  [17, 8, 4.0, Math.PI],
  [8, 19, 3.8, -Math.PI / 2],
];

export interface EnvironmentPlacements {
  readonly trees: Placement[];
  readonly rocks: Placement[];
  readonly homes: Placement[];
}

/**
 * Physical footprints match the visible scenery across every quality tier.
 *
 * The Courtyard is hand-composed; the Emberwood Reach is scattered
 * deterministically around its authored routes. Any other zone has no
 * scenery pack yet and gets none, so it never carries invisible collision.
 */
export function environmentCollisionPlacements(
  zone: Zone,
  quality: QualitySettings,
): EnvironmentPlacements | null {
  if (zone.id === 'zone.courtyard') {
    return {
      trees: TREE_SPOTS.slice(0, quality.tier === 'low' ? 14 : TREE_SPOTS.length),
      rocks: ROCK_SPOTS,
      homes: HOME_SPOTS,
    };
  }
  if (zone.id === 'zone.forest')
    return scatterPlacements(zone, quality, { tree: 0.73, rock: 0.09 });
  if (zone.id === 'zone.mountains')
    return scatterPlacements(zone, quality, { tree: 0.22, rock: 0.42 });
  if (zone.id === 'zone.snow') return scatterPlacements(zone, quality, { tree: 0.4, rock: 0.16 });
  return null;
}

/** Small deterministic hash in [0, 1): the same zone scatters the same way on every device. */
function unit(seed: number, salt: number): number {
  let h = (seed * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * A region's scenery, from its routes.
 *
 * Trees are scattered on a jittered grid across the whole zone and then culled
 * wherever people need to walk or work: along every authored link, around every
 * waypoint and interactable, over water, and over any terrace that is a
 * worked platform rather than ground. Density drops by device tier, and the
 * grid is what keeps the cheap tier a sparser version of the same wood rather
 * than a different one.
 */
function scatterPlacements(
  zone: Zone,
  quality: QualitySettings,
  density: { readonly tree: number; readonly rock: number },
): EnvironmentPlacements {
  const byId = new Map(zone.waypoints.map((waypoint) => [waypoint.id, waypoint]));
  const links: Array<readonly [number, number, number, number, number]> = [];
  for (const waypoint of zone.waypoints) {
    for (const link of waypoint.links) {
      const other = byId.get(link);
      if (!other) continue;
      links.push([
        waypoint.position.x,
        waypoint.position.z,
        other.position.x,
        other.position.z,
        Math.max(waypoint.radius, other.radius) + 2.6,
      ]);
    }
  }
  const clear = (x: number, z: number, margin: number): boolean => {
    for (const [ax, az, bx, bz, width] of links)
      if (distanceToSegment(x, z, ax, az, bx, bz) < width + margin) return false;
    for (const waypoint of zone.waypoints)
      if (
        Math.hypot(x - waypoint.position.x, z - waypoint.position.z) <
        waypoint.radius + 3 + margin
      )
        return false;
    for (const interactable of zone.interactables)
      if (Math.hypot(x - interactable.position.x, z - interactable.position.z) < 4.5 + margin)
        return false;
    for (const canal of zone.terrain.canals)
      if (
        x > canal.minX - 1.5 &&
        x < canal.maxX + 1.5 &&
        z > canal.minZ - 1.5 &&
        z < canal.maxZ + 1.5
      )
        return false;
    for (const building of zone.buildings)
      if (
        x > building.minX - 2 &&
        x < building.maxX + 2 &&
        z > building.minZ - 2 &&
        z < building.maxZ + 2
      )
        return false;
    return true;
  };

  const step = quality.tier === 'low' ? 11 : quality.tier === 'medium' ? 8.5 : 7;
  const trees: Placement[] = [];
  const rocks: Placement[] = [];
  const { minX, maxX, minZ, maxZ } = zone.bounds;
  let seed = 0;
  for (let gx = minX + 4; gx < maxX - 4; gx += step) {
    for (let gz = minZ + 4; gz < maxZ - 4; gz += step) {
      seed += 1;
      const x = gx + (unit(seed, 1) - 0.5) * step * 0.9;
      const z = gz + (unit(seed, 2) - 0.5) * step * 0.9;
      if (!clear(x, z, 0)) continue;
      const roll = unit(seed, 3);
      if (roll < density.rock) {
        rocks.push([x, z, 0.9 + unit(seed, 4) * 1.3, unit(seed, 5) * Math.PI * 2]);
      } else if (roll < density.rock + density.tree) {
        trees.push([x, z, 4.2 + unit(seed, 4) * 2.4, unit(seed, 5) * Math.PI * 2]);
      }
    }
  }
  return { trees, rocks, homes: [] };
}

/** Bundled model upgrades, with visible geometry from the very first frame.
 * Each source mesh becomes ONE instance batch. Textures and geometry are shared,
 * and a disposed zone can never be resurrected by a late fetch.
 */
export function buildEnvironment(
  zone: Zone,
  quality: QualitySettings,
  placements: EnvironmentPlacements,
) {
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
          // Pull the shared model into the region's palette: frosted in the
          // snow, dusty on the scree, untouched on the coast.
          const graded = (Array.isArray(node.material) ? node.material : [node.material]).map(
            (material) => {
              if (!(material instanceof MeshStandardMaterial) || grade.amount === 0)
                return material;
              // The models are vertex-coloured under a white material, so a
              // colour lerp would do nothing; an emissive lift is what frosts
              // or dusts them without touching their shading.
              const copy = material.clone();
              copy.emissive.set(grade.tint).multiplyScalar(grade.amount * 0.5);
              return copy;
            },
          );
          batch(
            node.geometry,
            Array.isArray(node.material) ? graded : graded[0]!,
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

  const grade = SCENERY_GRADE[zone.id] ?? SCENERY_GRADE['zone.courtyard']!;
  const bark = new MeshStandardMaterial({ color: 0x725038, roughness: 1 });
  const leaves = new MeshStandardMaterial({
    color: new Color(0x759449).lerp(new Color(grade.tint), grade.amount),
    roughness: 1,
    flatShading: true,
  });
  const rock = new MeshStandardMaterial({
    color: new Color(0x9c9985).lerp(new Color(grade.tint), grade.amount * 0.6),
    roughness: 1,
    flatShading: true,
  });
  const plaster = new MeshStandardMaterial({ color: 0xe1c894, roughness: 1 });
  const roof = new MeshStandardMaterial({ color: 0x985c43, roughness: 1 });
  [bark, leaves, rock, plaster, roof].forEach((m) => resources.add(m));

  // Hand-composed pockets between existing routes. No navigation or gameplay
  // content is changed by this scenery layer.
  const trees = placements.trees;
  const treeFallback = new Group();
  batch(new CylinderGeometry(0.045, 0.075, 0.48, 7), bark, matricesFor(trees, 0.24), treeFallback);
  batch(new SphereGeometry(0.31, 7, 5), leaves, matricesFor(trees, 0.69, 1.1), treeFallback);
  upgrade('tree', trees, treeFallback);

  const rocks = placements.rocks;
  const rockFallback = new Group();
  batch(new SphereGeometry(0.6, 7, 4), rock, matricesFor(rocks, 0.45, 0.8), rockFallback);
  upgrade('rock', rocks, rockFallback);

  const homes = placements.homes;
  const homeFallback = new Group();
  batch(new BoxGeometry(0.8, 0.6, 0.8), plaster, matricesFor(homes, 0.3), homeFallback);
  batch(new ConeGeometry(0.65, 0.4, 4), roof, matricesFor(homes, 0.8), homeFallback);
  upgrade('home', homes, homeFallback);

  // Wildflower clumps: shared geometry, stable placements, capped by device tier.
  const flowers: Placement[] = [];
  const limit =
    trees.length === 0 ? 0 : quality.tier === 'low' ? 36 : quality.tier === 'medium' ? 72 : 108;
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
