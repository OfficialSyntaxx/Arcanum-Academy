/**
 * Zone geometry construction.
 *
 * Builds a `Group` for a zone entirely from that zone's authored data — terraces
 * become floors, waypoint tags become props, interactables become markers. There
 * is no hand-placed geometry, which means a designer moving a waypoint moves the
 * architecture with it and the two can never drift apart.
 *
 * Everything repeated is an `InstancedMesh` sharing one geometry and one
 * material. The whole courtyard is a handful of draw calls, which is what keeps
 * a mid-range phone at its frame budget with room left for actors and UI.
 */

import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RingGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { heightAt, InteractableKind, type Interactable, type Zone } from '@arcanum/shared';

import { Palette } from './palette.js';

export interface ZoneGeometry {
  readonly group: Group;
  /** Marker objects keyed by interactable id, so prompts can highlight them. */
  readonly markers: ReadonlyMap<string, Object3D>;
  dispose(): void;
}

const MARKER_COLOURS: Readonly<Record<string, number>> = {
  [InteractableKind.GatheringNode]: Palette.verdigris,
  [InteractableKind.CraftingStation]: Palette.hazeDim,
  [InteractableKind.ScribingTable]: Palette.haze,
  [InteractableKind.GradingDesk]: Palette.gilt,
  [InteractableKind.DuelCircle]: Palette.alarm,
  [InteractableKind.MerchantStall]: Palette.hazeDim,
  [InteractableKind.DisplayPedestal]: Palette.gilt,
  [InteractableKind.ZonePortal]: Palette.verdigris,
  [InteractableKind.QuestBoard]: Palette.haze,
};

export function buildZoneGeometry(zone: Zone, quality: { shadowsEnabled: boolean }): ZoneGeometry {
  const group = new Group();
  group.name = `zone:${zone.id}`;

  const disposables: Array<BufferGeometry | Material> = [];
  const track = <T extends BufferGeometry | Material>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const stone = track(
    new MeshStandardMaterial({ color: Palette.slate, roughness: 0.92, metalness: 0.02 }),
  );
  const stoneRaised = track(
    new MeshStandardMaterial({ color: Palette.slateRaised, roughness: 0.85, metalness: 0.04 }),
  );
  const crystal = track(
    new MeshStandardMaterial({
      color: Palette.verdigris,
      roughness: 0.25,
      metalness: 0.1,
      emissive: Palette.verdigris,
      emissiveIntensity: 0.35,
    }),
  );

  // --- Floors -----------------------------------------------------------
  const { bounds, terrain } = zone;
  const baseGeometry = track(
    new BoxGeometry(bounds.maxX - bounds.minX, 0.4, bounds.maxZ - bounds.minZ),
  );
  const baseFloor = new Mesh(baseGeometry, stone);
  baseFloor.position.set(
    (bounds.minX + bounds.maxX) / 2,
    terrain.baseHeight - 0.2,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  baseFloor.receiveShadow = quality.shadowsEnabled;
  group.add(baseFloor);

  for (const terrace of terrain.terraces) {
    const width = terrace.maxX - terrace.minX;
    const depth = terrace.maxZ - terrace.minZ;
    const thickness = Math.abs(terrace.height - terrain.baseHeight) + 0.4;
    const geometry = track(new BoxGeometry(width, thickness, depth));
    const slab = new Mesh(geometry, stoneRaised);
    slab.position.set(
      (terrace.minX + terrace.maxX) / 2,
      terrace.height - thickness / 2,
      (terrace.minZ + terrace.maxZ) / 2,
    );
    slab.receiveShadow = quality.shadowsEnabled;
    group.add(slab);
  }

  // --- Colonnade --------------------------------------------------------
  // Columns ring the plaza and mark the avenues. Placement is derived from the
  // plaza waypoints so the architecture always frames the walkable routes.
  const plaza = zone.waypoints.filter((w) => w.tags?.includes('plaza'));
  const columnPositions: Vector3[] = [];
  for (const waypoint of plaza) {
    const ring = waypoint.radius + 2.2;
    const count = waypoint.id.endsWith('center') ? 12 : 6;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const x = waypoint.position.x + Math.cos(angle) * ring;
      const z = waypoint.position.z + Math.sin(angle) * ring;
      if (x < bounds.minX + 1 || x > bounds.maxX - 1) continue;
      if (z < bounds.minZ + 1 || z > bounds.maxZ - 1) continue;
      columnPositions.push(new Vector3(x, heightAt(terrain, { x, z }), z));
    }
  }

  if (columnPositions.length > 0) {
    const columnGeometry = track(new CylinderGeometry(0.32, 0.4, 5.2, 7));
    const columns = new InstancedMesh(columnGeometry, stoneRaised, columnPositions.length);
    columns.castShadow = quality.shadowsEnabled;
    columns.receiveShadow = quality.shadowsEnabled;
    writeInstances(columns, columnPositions, 2.6);
    group.add(columns);
  }

  // --- Crystal spires ---------------------------------------------------
  // One spire per corner precinct, tall enough to be a landmark from the plaza.
  const spirePositions = zone.waypoints
    .filter((w) => w.links.length === 1)
    .map((w) => new Vector3(w.position.x, heightAt(terrain, w.position), w.position.z));

  if (spirePositions.length > 0) {
    const spireGeometry = track(new ConeGeometry(1.1, 7.5, 6));
    const spires = new InstancedMesh(spireGeometry, crystal, spirePositions.length);
    spires.castShadow = quality.shadowsEnabled;
    writeInstances(
      spires,
      spirePositions.map((p) => new Vector3(p.x, p.y, p.z - 3.4)),
      3.75,
    );
    group.add(spires);
  }

  // --- Interactable markers --------------------------------------------
  const markers = new Map<string, Object3D>();
  const markerRing = track(new RingGeometry(0.85, 1.15, 24));
  const markerPost = track(new BoxGeometry(0.5, 1.4, 0.5));
  const markerHalo = track(new TorusGeometry(0.55, 0.05, 6, 20));

  for (const interactable of zone.interactables) {
    const marker = buildMarker(interactable, {
      ring: markerRing,
      post: markerPost,
      halo: markerHalo,
      material: track(
        new MeshStandardMaterial({
          color: MARKER_COLOURS[interactable.kind] ?? Palette.haze,
          emissive: MARKER_COLOURS[interactable.kind] ?? Palette.haze,
          emissiveIntensity: 0.4,
          roughness: 0.5,
        }),
      ),
    });
    const y = heightAt(terrain, interactable.position);
    marker.position.set(interactable.position.x, y, interactable.position.z);
    marker.rotation.y = interactable.facing;
    markers.set(interactable.id, marker);
    group.add(marker);
  }

  // --- Duel circle inlays ----------------------------------------------
  const circleGeometry = track(new CircleGeometry(2.6, 28));
  const circleMaterial = track(
    new MeshStandardMaterial({ color: Palette.ink, roughness: 1, metalness: 0 }),
  );
  for (const interactable of zone.interactables) {
    if (interactable.kind !== InteractableKind.DuelCircle) continue;
    const inlay = new Mesh(circleGeometry, circleMaterial);
    const approach = zone.waypoints.find((w) => w.id === interactable.approach);
    const at = approach?.position ?? interactable.position;
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(at.x, heightAt(terrain, at) + 0.02, at.z);
    group.add(inlay);
  }

  return {
    group,
    markers,
    dispose(): void {
      group.traverse((child) => {
        if (child instanceof InstancedMesh) child.dispose();
      });
      group.clear();
      for (const item of disposables) item.dispose();
    },
  };
}

interface MarkerParts {
  readonly ring: BufferGeometry;
  readonly post: BufferGeometry;
  readonly halo: BufferGeometry;
  readonly material: Material;
}

function buildMarker(interactable: Interactable, parts: MarkerParts): Object3D {
  const marker = new Group();
  marker.name = `interactable:${interactable.id}`;

  const ring = new Mesh(parts.ring, parts.material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  marker.add(ring);

  // Gathering nodes are read at a glance by silhouette, not by colour alone —
  // colour-blind players get the same information as everyone else.
  if (interactable.kind === InteractableKind.GatheringNode) {
    const halo = new Mesh(parts.halo, parts.material);
    halo.position.y = 1.6;
    halo.rotation.x = Math.PI / 2;
    marker.add(halo);
  } else {
    const post = new Mesh(parts.post, parts.material);
    post.position.y = 0.7;
    marker.add(post);
  }

  return marker;
}

const scratchMatrix = new Matrix4();
const scratchQuaternion = new Quaternion();
const unitScale = new Vector3(1, 1, 1);

function writeInstances(mesh: InstancedMesh, positions: Vector3[], yOffset: number): void {
  positions.forEach((position, index) => {
    scratchMatrix.compose(
      new Vector3(position.x, position.y + yOffset, position.z),
      scratchQuaternion,
      unitScale,
    );
    mesh.setMatrixAt(index, scratchMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}
