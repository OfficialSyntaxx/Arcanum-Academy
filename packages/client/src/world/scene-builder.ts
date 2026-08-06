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
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import {
  BuildingDoorSide,
  heightAt,
  InteractableKind,
  type Building,
  type Interactable,
  type WaypointId,
  type Zone,
} from '@arcanum/shared';

import { Palette } from './palette.js';

/** A door's swing pivot, and the waypoint whose proximity opens it. */
export interface DoorHandle {
  readonly pivot: Object3D;
  readonly triggerWaypoint: WaypointId;
  /** `pivot.rotation.y` when shut. */
  readonly closedAngle: number;
  /** `pivot.rotation.y` when swung open. */
  readonly openAngle: number;
}

export interface ZoneGeometry {
  readonly group: Group;
  /** Marker objects keyed by interactable id, so prompts can highlight them. */
  readonly markers: ReadonlyMap<string, Object3D>;
  /** Every building door in the zone, for `WorldService` to animate. */
  readonly doors: readonly DoorHandle[];
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
  const water = track(
    new MeshStandardMaterial({
      color: Palette.canal,
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.72,
    }),
  );
  const wood = track(
    new MeshStandardMaterial({ color: Palette.wood, roughness: 0.8, metalness: 0.05 }),
  );
  const flame = track(
    new MeshStandardMaterial({
      color: Palette.flame,
      roughness: 0.4,
      metalness: 0,
      emissive: Palette.flame,
      emissiveIntensity: 1.1,
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

  // --- Canals -------------------------------------------------------------
  // Flat, still water. A river is authored as a chain of adjoining segments;
  // there is no flow or current yet, so a canal and a river are the same
  // renderer feature at this stage — only the shape authored differs.
  for (const canal of terrain.canals) {
    const width = canal.maxX - canal.minX;
    const depth = canal.maxZ - canal.minZ;
    const geometry = track(new BoxGeometry(width, 0.05, depth));
    const surface = new Mesh(geometry, water);
    surface.position.set(
      (canal.minX + canal.maxX) / 2,
      canal.waterHeight,
      (canal.minZ + canal.maxZ) / 2,
    );
    group.add(surface);
  }

  // --- Buildings ----------------------------------------------------------
  // Walls, a hip roof and a hinged door per authored `Building`. Unlike the
  // instanced props above, each building is its own handful of meshes: there
  // are only ever a few per zone, so the draw-call budget that justifies
  // instancing everything else does not apply here, and a building's shape
  // (footprint, door side, wall/roof height) varies enough that instancing
  // would not actually share anything.
  const doors: DoorHandle[] = [];
  for (const building of zone.buildings) {
    const floorY = heightAt(terrain, {
      x: (building.minX + building.maxX) / 2,
      z: (building.minZ + building.maxZ) / 2,
    });
    const built = buildBuilding(building, floorY, { wood, track });
    doors.push(built.door);
    group.add(built.object);
  }

  // --- Walkways -----------------------------------------------------------
  // One thin strip per link in the waypoint graph, so the paths the player can
  // actually walk are the paths the player can actually see. A link is only
  // rendered when both ends sit at the same floor height: a link that climbs
  // from one terrace to another is a stair the world does not model yet, and
  // a flat strip drawn straight through the riser between them would read as
  // a bug rather than as level design.
  const pathMaterial = track(
    new MeshStandardMaterial({ color: Palette.path, roughness: 0.88, metalness: 0.03 }),
  );
  const seenEdges = new Set<string>();
  const walkwaySegments: Array<{ from: Vector3; to: Vector3 }> = [];
  for (const waypoint of zone.waypoints) {
    for (const linkId of waypoint.links) {
      const edgeKey = [waypoint.id, linkId].sort().join('|');
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      const target = zone.waypoints.find((candidate) => candidate.id === linkId);
      if (!target) continue;
      const fromHeight = heightAt(terrain, waypoint.position);
      const toHeight = heightAt(terrain, target.position);
      if (fromHeight !== toHeight) continue;
      walkwaySegments.push({
        from: new Vector3(waypoint.position.x, fromHeight, waypoint.position.z),
        to: new Vector3(target.position.x, toHeight, target.position.z),
      });
    }
  }

  if (walkwaySegments.length > 0) {
    const WALKWAY_WIDTH = 1.8;
    const WALKWAY_THICKNESS = 0.06;
    const walkwayGeometry = track(new BoxGeometry(1, 1, 1));
    const walkways = new InstancedMesh(walkwayGeometry, pathMaterial, walkwaySegments.length);
    walkways.receiveShadow = quality.shadowsEnabled;
    walkwaySegments.forEach((segment, index) => {
      const dx = segment.to.x - segment.from.x;
      const dz = segment.to.z - segment.from.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(-dz, dx);
      scratchQuaternion.setFromAxisAngle(UP_AXIS, angle);
      const midpoint = new Vector3(
        (segment.from.x + segment.to.x) / 2,
        (segment.from.y + segment.to.y) / 2 + WALKWAY_THICKNESS / 2 + 0.02,
        (segment.from.z + segment.to.z) / 2,
      );
      scratchMatrix.compose(
        midpoint,
        scratchQuaternion,
        new Vector3(length, WALKWAY_THICKNESS, WALKWAY_WIDTH),
      );
      walkways.setMatrixAt(index, scratchMatrix);
      scratchQuaternion.identity();
    });
    walkways.instanceMatrix.needsUpdate = true;
    group.add(walkways);
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

  // --- Lighting decor -----------------------------------------------------
  // Emissive-only glow, not dynamic point lights: a lantern on every column and
  // a torch at every gate reads as lit without one `PointLight` per fixture,
  // which is what keeps this affordable on a mobile GPU.
  const lampPositions = columnPositions.map((p) => new Vector3(p.x, p.y, p.z));
  const gateTorchPositions: Vector3[] = [];
  for (const waypoint of zone.waypoints) {
    if (!waypoint.tags?.includes('portal')) continue;
    const y = heightAt(terrain, waypoint.position);
    const flank = waypoint.radius * 0.6 + 0.6;
    gateTorchPositions.push(
      new Vector3(waypoint.position.x - flank, y, waypoint.position.z),
      new Vector3(waypoint.position.x + flank, y, waypoint.position.z),
    );
  }
  const doorTorchPositions: Vector3[] = [];
  for (const building of zone.buildings) {
    const y = heightAt(terrain, {
      x: (building.minX + building.maxX) / 2,
      z: (building.minZ + building.maxZ) / 2,
    });
    const flanks = doorFlankPoints(building);
    doorTorchPositions.push(new Vector3(flanks[0].x, y, flanks[0].z));
    doorTorchPositions.push(new Vector3(flanks[1].x, y, flanks[1].z));
  }

  if (lampPositions.length > 0) {
    const finialGeometry = track(new SphereGeometry(0.22, 10, 8));
    const finials = new InstancedMesh(finialGeometry, flame, lampPositions.length);
    writeInstances(finials, lampPositions, 5.4);
    group.add(finials);
  }

  const torchPositions = [...gateTorchPositions, ...doorTorchPositions];
  if (torchPositions.length > 0) {
    const poleGeometry = track(new CylinderGeometry(0.06, 0.08, 1.6, 6));
    const poles = new InstancedMesh(poleGeometry, wood, torchPositions.length);
    writeInstances(poles, torchPositions, 0.8);
    group.add(poles);

    const emberGeometry = track(new SphereGeometry(0.16, 10, 8));
    const embers = new InstancedMesh(emberGeometry, flame, torchPositions.length);
    writeInstances(embers, torchPositions, 1.65);
    group.add(embers);
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
    doors,
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

interface DoorLayout {
  readonly spanIsX: boolean;
  readonly spanMin: number;
  readonly spanMax: number;
  readonly wallFixed: number;
  readonly gapStart: number;
  readonly gapEnd: number;
  readonly hinge: { readonly x: number; readonly z: number };
  readonly baseRotationY: number;
  /** Additional swing on top of `baseRotationY` when open. */
  readonly openAngle: number;
}

/**
 * The doorway geometry for a building, derived once and shared by both the
 * wall/door mesh construction and the doorway torch placement, so the two
 * can never describe two different doorways.
 */
function doorLayout(building: Building): DoorLayout {
  const spanIsX =
    building.doorSide === BuildingDoorSide.North || building.doorSide === BuildingDoorSide.South;
  const spanMin = spanIsX ? building.minX : building.minZ;
  const spanMax = spanIsX ? building.maxX : building.maxZ;
  const gapStart = (spanMin + spanMax) / 2 - building.doorWidth / 2;
  const gapEnd = gapStart + building.doorWidth;
  const OPEN = Math.PI * 0.5;

  switch (building.doorSide) {
    case BuildingDoorSide.North:
      return {
        spanIsX,
        spanMin,
        spanMax,
        wallFixed: building.minZ,
        gapStart,
        gapEnd,
        hinge: { x: gapStart, z: building.minZ },
        baseRotationY: 0,
        openAngle: -OPEN,
      };
    case BuildingDoorSide.South:
      return {
        spanIsX,
        spanMin,
        spanMax,
        wallFixed: building.maxZ,
        gapStart,
        gapEnd,
        hinge: { x: gapStart, z: building.maxZ },
        baseRotationY: 0,
        openAngle: OPEN,
      };
    case BuildingDoorSide.East:
      return {
        spanIsX,
        spanMin,
        spanMax,
        wallFixed: building.maxX,
        gapStart,
        gapEnd,
        hinge: { x: building.maxX, z: gapStart },
        baseRotationY: -Math.PI / 2,
        openAngle: -OPEN,
      };
    case BuildingDoorSide.West:
      return {
        spanIsX,
        spanMin,
        spanMax,
        wallFixed: building.minX,
        gapStart,
        gapEnd,
        hinge: { x: building.minX, z: gapStart },
        baseRotationY: -Math.PI / 2,
        openAngle: OPEN,
      };
    default: {
      const exhaustive: never = building.doorSide;
      throw new Error(`unhandled door side ${String(exhaustive)}`);
    }
  }
}

/** Two points just outside a building's doorway, for flanking torches. */
function doorFlankPoints(
  building: Building,
): readonly [
  { readonly x: number; readonly z: number },
  { readonly x: number; readonly z: number },
] {
  const layout = doorLayout(building);
  const outward = 0.35;
  if (layout.spanIsX) {
    const z =
      building.doorSide === BuildingDoorSide.North
        ? layout.wallFixed - outward
        : layout.wallFixed + outward;
    return [
      { x: layout.gapStart, z },
      { x: layout.gapEnd, z },
    ];
  }
  const x =
    building.doorSide === BuildingDoorSide.West
      ? layout.wallFixed - outward
      : layout.wallFixed + outward;
  return [
    { x, z: layout.gapStart },
    { x, z: layout.gapEnd },
  ];
}

interface BuildingParts {
  readonly wood: Material;
  readonly track: <T extends BufferGeometry | Material>(item: T) => T;
}

/**
 * Walls (split around the doorway), a hand-built hip roof and a hinged door
 * panel for one authored `Building`. Not instanced — a zone has a handful of
 * buildings at most, each a different footprint, so there is nothing to
 * share between them.
 */
function buildBuilding(
  building: Building,
  floorY: number,
  parts: BuildingParts,
): { readonly object: Object3D; readonly door: DoorHandle } {
  const object = new Group();
  const layout = doorLayout(building);
  const wallThickness = 0.25;
  const width = building.maxX - building.minX;
  const depth = building.maxZ - building.minZ;
  const centerX = (building.minX + building.maxX) / 2;
  const centerZ = (building.minZ + building.maxZ) / 2;

  const addWall = (cx: number, cz: number, sx: number, sz: number): void => {
    if (sx <= 0.02 || sz <= 0.02) return;
    const geometry = parts.track(new BoxGeometry(sx, building.wallHeight, sz));
    const wall = new Mesh(geometry, parts.wood);
    wall.position.set(cx, floorY + building.wallHeight / 2, cz);
    object.add(wall);
  };

  const sides = [
    BuildingDoorSide.North,
    BuildingDoorSide.South,
    BuildingDoorSide.East,
    BuildingDoorSide.West,
  ] as const;
  for (const side of sides) {
    if (side === building.doorSide) {
      if (layout.spanIsX) {
        addWall(
          (layout.spanMin + layout.gapStart) / 2,
          layout.wallFixed,
          layout.gapStart - layout.spanMin,
          wallThickness,
        );
        addWall(
          (layout.gapEnd + layout.spanMax) / 2,
          layout.wallFixed,
          layout.spanMax - layout.gapEnd,
          wallThickness,
        );
      } else {
        addWall(
          layout.wallFixed,
          (layout.spanMin + layout.gapStart) / 2,
          wallThickness,
          layout.gapStart - layout.spanMin,
        );
        addWall(
          layout.wallFixed,
          (layout.gapEnd + layout.spanMax) / 2,
          wallThickness,
          layout.spanMax - layout.gapEnd,
        );
      }
      continue;
    }
    switch (side) {
      case BuildingDoorSide.North:
        addWall(centerX, building.minZ, width, wallThickness);
        break;
      case BuildingDoorSide.South:
        addWall(centerX, building.maxZ, width, wallThickness);
        break;
      case BuildingDoorSide.East:
        addWall(building.maxX, centerZ, wallThickness, depth);
        break;
      case BuildingDoorSide.West:
        addWall(building.minX, centerZ, wallThickness, depth);
        break;
    }
  }

  // Roof — four true triangular faces to an apex, built by hand rather than
  // `ConeGeometry(radialSegments=4)`, whose square cross-section does not
  // stay square once a rectangular footprint stretches it non-uniformly.
  const roofGeometry = parts.track(
    buildHipRoofGeometry(width + 0.6, depth + 0.6, building.roofHeight),
  );
  const roof = new Mesh(roofGeometry, parts.wood);
  roof.position.set(centerX, floorY + building.wallHeight, centerZ);
  object.add(roof);

  // Door — a hinged panel, closed by default. `WorldService` swings it open
  // as the player approaches its trigger waypoint; this is a presentational
  // door with no collision, per the current engine.
  const doorHeight = building.wallHeight * 0.86;
  const doorThickness = 0.1;
  const doorGeometry = parts.track(new BoxGeometry(building.doorWidth, doorHeight, doorThickness));
  const doorMesh = new Mesh(doorGeometry, parts.wood);
  doorMesh.position.set(building.doorWidth / 2, doorHeight / 2, 0);

  const pivot = new Group();
  pivot.position.set(layout.hinge.x, floorY, layout.hinge.z);
  pivot.rotation.y = layout.baseRotationY;
  pivot.add(doorMesh);
  object.add(pivot);

  return {
    object,
    door: {
      pivot,
      triggerWaypoint: building.doorTrigger,
      closedAngle: layout.baseRotationY,
      openAngle: layout.baseRotationY + layout.openAngle,
    },
  };
}

/**
 * A rectangular hip roof — four flat-shaded triangles from the footprint
 * corners to a centred apex. Vertices are not shared between faces, which is
 * what gives `computeVertexNormals()` a genuine facet per side rather than an
 * averaged, smoothed one.
 */
function buildHipRoofGeometry(width: number, depth: number, height: number): BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const c0 = [-hw, 0, -hd];
  const c1 = [hw, 0, -hd];
  const c2 = [hw, 0, hd];
  const c3 = [-hw, 0, hd];
  const apex = [0, height, 0];

  const positions = new Float32Array(
    [
      c1,
      c0,
      apex, // north face
      c2,
      c1,
      apex, // east face
      c3,
      c2,
      apex, // south face
      c0,
      c3,
      apex, // west face
    ].flat(),
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const scratchMatrix = new Matrix4();
const scratchQuaternion = new Quaternion();
const unitScale = new Vector3(1, 1, 1);
const UP_AXIS = new Vector3(0, 1, 0);

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
