/**
 * World service.
 *
 * Owns everything about the currently loaded zone: its validated navigation
 * graph, its geometry, its actor pool and its lighting. One object to construct
 * and one to dispose, so switching zones later cannot leak a scene graph.
 *
 * Zone content is validated at load rather than trusted. A zone that fails
 * validation is a hard failure that surfaces in the fault screen, because
 * silently loading a broken courtyard produces bugs that look like physics
 * problems and are diagnosed for hours.
 */

import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Fog,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Object3D,
  type Scene,
} from 'three';
import {
  buildNavGraph,
  distanceSquared,
  heightAt,
  type Failure,
  type Interactable,
  type NavGraph,
  type Vec2,
  type Zone,
  err,
  ok,
  type Result,
} from '@alderfell/shared';
import { Pathfinder } from '@alderfell/sim';

import type { QualitySettings } from '../core/device.js';
import { ActorPool } from './actor-pool.js';
import {
  authoredObstacles,
  isPointWalkable,
  resolveMovement,
  type WorldObstacle,
} from './collision.js';
import { environmentCollisionPlacements } from './environment-assets.js';
import { Palette, atmosphereFor, daylight, sunElevation, type Atmosphere } from './palette.js';
import { buildZoneGeometry, type ZoneGeometry } from './scene-builder.js';
import { WeatherEffect } from './weather-effect.js';
import { weatherForDay } from './weather.js';

export interface NearestInteractable {
  readonly interactable: Interactable;
  readonly distance: number;
}

export class WorldService {
  readonly root = new Group();
  readonly graph: NavGraph;
  readonly pathfinder: Pathfinder;
  readonly actors: ActorPool;
  private readonly obstacles: readonly WorldObstacle[];

  private readonly geometry: ZoneGeometry;
  private readonly atmosphere: Atmosphere;
  private readonly sun: DirectionalLight;
  private readonly sky: HemisphereLight;
  private readonly navigationMarker: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly weather: WeatherEffect;
  private readonly skyColour = new Color();
  private readonly fogColour = new Color();
  private readonly weatherColour = new Color();
  private readonly nightColour = new Color(0x17223d);
  private readonly nightFogColour = new Color(0x27334a);
  private scene: Scene | null = null;
  private fog: Fog | null = null;

  private constructor(
    readonly zone: Zone,
    graph: NavGraph,
    quality: QualitySettings,
  ) {
    this.graph = graph;
    this.pathfinder = new Pathfinder(graph);
    this.geometry = buildZoneGeometry(zone, quality);
    // Collision mirrors exactly the scenery the zone renders; a zone without a
    // scenery pack gets no invisible obstacles.
    const scenery = environmentCollisionPlacements(zone, quality);
    this.obstacles = [
      ...authoredObstacles(zone),
      ...(scenery?.trees ?? []).map(([x, z, size]): WorldObstacle => ({
        kind: 'circle',
        centre: { x, z },
        radius: Math.max(0.55, size * 0.22),
      })),
      ...(scenery?.rocks ?? []).map(([x, z, size]): WorldObstacle => ({
        kind: 'circle',
        centre: { x, z },
        radius: Math.max(0.32, size * 0.28),
      })),
      ...(scenery?.homes ?? []).map(([x, z, size]): WorldObstacle => ({
        kind: 'circle',
        centre: { x, z },
        radius: Math.max(0.9, size * 0.38),
      })),
    ];
    this.atmosphere = atmosphereFor(zone.atmosphere);

    // The player plus the named cast plus the crowd the device can afford.
    const capacity =
      1 + zone.npcs.length + Math.min(zone.ambientPopulation, quality.maxAmbientActors);
    this.actors = new ActorPool(capacity, quality.shadowsEnabled);

    this.sun = new DirectionalLight(this.atmosphere.sunColour, this.atmosphere.sunIntensity);
    this.sun.castShadow = quality.shadowsEnabled;
    if (quality.shadowsEnabled) {
      this.sun.shadow.mapSize.set(
        quality.tier === 'high' ? 1024 : 512,
        quality.tier === 'high' ? 1024 : 512,
      );
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 90;
      this.sun.shadow.camera.left = -30;
      this.sun.shadow.camera.right = 30;
      this.sun.shadow.camera.top = 30;
      this.sun.shadow.camera.bottom = -30;
    }
    this.sky = new HemisphereLight(
      this.atmosphere.ambientColour,
      this.atmosphere.fog,
      this.atmosphere.ambientIntensity,
    );

    // A world-space travel cue reads instantly on a phone and, unlike a HUD
    // arrow, stays honest when the player rotates or zooms the camera.
    const markerGeometry = new RingGeometry(0.38, 0.56, 20);
    const markerMaterial = new MeshBasicMaterial({
      color: Palette.gilt,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.navigationMarker = new Mesh(markerGeometry, markerMaterial);
    this.navigationMarker.rotation.x = -Math.PI / 2;
    this.navigationMarker.visible = false;
    this.weather = new WeatherEffect(quality);

    this.root.add(
      this.geometry.group,
      this.navigationMarker,
      this.weather.group,
      this.actors.group,
      this.sun,
      this.sun.target,
      this.sky,
    );
  }

  /** Validates and loads a zone. */
  static load(zone: Zone, quality: QualitySettings): Result<WorldService, Failure> {
    const graph = buildNavGraph(zone);
    if (!graph.ok) return err(graph.error);
    return ok(new WorldService(zone, graph.value, quality));
  }

  attach(scene: Scene): void {
    this.scene = scene;
    scene.add(this.root);
    this.skyColour.set(this.atmosphere.sky);
    this.fogColour.set(this.atmosphere.fog);
    this.fog = new Fog(this.fogColour, this.atmosphere.fogNear, this.atmosphere.fogFar);
    scene.background = this.skyColour;
    scene.fog = this.fog;
  }

  /** Ground height at a point, from the zone's authored terraces. */
  heightAt(point: Vec2): number {
    return heightAt(this.zone.terrain, point);
  }

  /** Resolves a free-form player step against solid scenery and zone bounds. */
  resolvePlayerMovement(from: Vec2, requested: Vec2) {
    return resolveMovement(from, requested, this.zone.bounds, this.obstacles, 0.38);
  }

  /**
   * Finds a free-form route around scenery when a straight run is blocked.
   *
   * This is intentionally a small local grid rather than the authored NPC
   * graph: players may cut across grass anywhere, but long taps never strand
   * them against a tree, rock, building or canal. The result is line-of-sight
   * simplified before it reaches the mover, so it still looks like natural
   * direct movement rather than tile-by-tile path following.
   */
  planPlayerPath(from: Vec2, destination: Vec2): readonly Vec2[] {
    const radius = 0.38;
    const target = this.nearestWalkable(destination, radius);
    if (target === null) return [];
    if (!this.resolvePlayerMovement(from, target).collided) return [target];

    const cell = 0.9;
    const minX = this.zone.bounds.minX + radius;
    const minZ = this.zone.bounds.minZ + radius;
    const width = Math.floor((this.zone.bounds.maxX - radius - minX) / cell) + 1;
    const height = Math.floor((this.zone.bounds.maxZ - radius - minZ) / cell) + 1;
    const pointFor = (x: number, z: number): Vec2 => ({ x: minX + x * cell, z: minZ + z * cell });
    const toCell = (point: Vec2) => ({
      x: Math.max(0, Math.min(width - 1, Math.round((point.x - minX) / cell))),
      z: Math.max(0, Math.min(height - 1, Math.round((point.z - minZ) / cell))),
    });
    const start = toCell(from);
    const goal = toCell(target);
    const key = (x: number, z: number) => `${x},${z}`;
    const startKey = key(start.x, start.z);
    const goalKey = key(goal.x, goal.z);
    const open = [{ ...start, score: 0 }];
    const cost = new Map<string, number>([[startKey, 0]]);
    const cameFrom = new Map<string, string>();
    const cells = new Map<string, { x: number; z: number }>([[startKey, start]]);
    const steps = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ] as const;
    let found = false;

    while (open.length > 0) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (open[i]!.score < open[bestIndex]!.score) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0]!;
      const currentKey = key(current.x, current.z);
      if (currentKey === goalKey) {
        found = true;
        break;
      }
      const currentCost = cost.get(currentKey)!;
      for (const [dx, dz] of steps) {
        const nx = current.x + dx;
        const nz = current.z + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        const next = pointFor(nx, nz);
        if (!isPointWalkable(next, this.zone.bounds, this.obstacles, radius)) continue;
        // Diagonals may not cut through two touching obstacles.
        if (this.resolvePlayerMovement(pointFor(current.x, current.z), next).collided) continue;
        const nextKey = key(nx, nz);
        const nextCost = currentCost + (dx === 0 || dz === 0 ? 1 : Math.SQRT2);
        if (nextCost >= (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
        cost.set(nextKey, nextCost);
        cameFrom.set(nextKey, currentKey);
        cells.set(nextKey, { x: nx, z: nz });
        const heuristic = Math.hypot(goal.x - nx, goal.z - nz);
        open.push({ x: nx, z: nz, score: nextCost + heuristic });
      }
    }
    if (!found) return [];

    const route: Vec2[] = [target];
    let cursor = goalKey;
    while (cursor !== startKey) {
      const previous = cameFrom.get(cursor);
      if (previous === undefined) return [];
      const cellPosition = cells.get(cursor)!;
      route.unshift(pointFor(cellPosition.x, cellPosition.z));
      cursor = previous;
    }
    route.unshift(from);

    const simplified: Vec2[] = [];
    let anchor = 0;
    while (anchor < route.length - 1) {
      let farthest = route.length - 1;
      while (
        farthest > anchor + 1 &&
        this.resolvePlayerMovement(route[anchor]!, route[farthest]!).collided
      )
        farthest -= 1;
      simplified.push(route[farthest]!);
      anchor = farthest;
    }
    return simplified;
  }

  private nearestWalkable(destination: Vec2, radius: number): Vec2 | null {
    if (isPointWalkable(destination, this.zone.bounds, this.obstacles, radius)) return destination;
    for (let ring = 1; ring <= 12; ring += 1) {
      const distance = ring * 0.45;
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        const candidate = {
          x: destination.x + Math.cos(angle) * distance,
          z: destination.z + Math.sin(angle) * distance,
        };
        if (isPointWalkable(candidate, this.zone.bounds, this.obstacles, radius)) return candidate;
      }
    }
    return null;
  }

  /**
   * The interactable a player at `position` could use, or null.
   *
   * Proximity is measured to the *approach waypoint* rather than to the prop, so
   * the prompt appears where a player would naturally stand rather than when
   * they clip the corner of a stall.
   */
  nearestInteractable(position: Vec2, radius: number): NearestInteractable | null {
    let best: NearestInteractable | null = null;
    const limit = radius * radius;
    for (const interactable of this.zone.interactables) {
      const node = this.graph.nodes[this.graph.indexOf(interactable.approach)];
      if (node === undefined) continue;
      const d2 = distanceSquared(position, node.position);
      if (d2 > limit) continue;
      if (best === null || d2 < best.distance * best.distance) {
        best = { interactable, distance: Math.sqrt(d2) };
      }
    }
    return best;
  }

  /** Resolves an object hit by a raycast to its authored world interaction. */
  interactableFromObject(object: Object3D): Interactable | null {
    let current: Object3D | null = object;
    while (current !== null && current !== this.root) {
      const id = current.userData['interactableId'];
      if (typeof id === 'string') {
        return this.zone.interactables.find((interactable) => interactable.id === id) ?? null;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Fades any building standing between the camera and the player.
   *
   * Under a shallow orthographic pitch a roof between the camera and the
   * player hides the one thing the player is steering, which was the single
   * worst thing about the old high camera. Buildings are axis-aligned boxes in
   * authored data, so this is a segment/box test rather than a raycast: no
   * scene traversal, no allocation, and it cannot disagree with collision.
   */
  /**
   * How many meshes of this zone's scenery are actually being drawn.
   *
   * Exposed for the smoke suite's world check. Total renderer draw calls cannot
   * distinguish a dressed zone from an empty one - characters and HUD dominate
   * them - so the check needs a number that goes to zero when the world does.
   */
  get drawnMeshCount(): number {
    let drawn = 0;
    this.geometry.group.traverseVisible((node) => {
      if ((node as { isMesh?: boolean }).isMesh === true) drawn += 1;
    });
    return drawn;
  }

  updateOcclusion(
    camera: { readonly x: number; readonly y: number; readonly z: number },
    player: Vec2,
    playerY: number,
    dtSeconds: number,
  ): void {
    if (this.geometry.occluders.length === 0) return;
    // Aim at the player's chest: a roof clipping their feet is not worth a fade.
    const targetY = playerY + 1.2;
    const rate = 1 - Math.exp(-9 * dtSeconds);
    // The view direction along the ground, from the camera toward the player.
    const viewX = player.x - camera.x;
    const viewZ = player.z - camera.z;
    const viewLength = Math.hypot(viewX, viewZ) || 1;
    const dirX = viewX / viewLength;
    const dirZ = viewZ / viewLength;
    for (const occluder of this.geometry.occluders) {
      const blocking =
        segmentHitsBox(camera, { x: player.x, y: targetY, z: player.z }, occluder.box) ||
        this.crowdsForeground(camera, occluder.box, dirX, dirZ, viewLength);
      const target = blocking ? 0.22 : 1;
      for (const material of occluder.materials) {
        if (!('opacity' in material)) continue;
        const next = material.opacity + (target - material.opacity) * rate;
        material.opacity = Math.abs(next - target) < 0.01 ? target : next;
        // Staying opaque while fully solid keeps the normal case on the fast
        // path: a transparent material is sorted and blended every frame.
        const wantsTransparency = material.opacity < 0.999;
        if (material.transparent !== wantsTransparency) {
          material.transparent = wantsTransparency;
          material.depthWrite = !wantsTransparency;
          material.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Whether a building stands between the camera and the player in depth.
   *
   * The sight-line test alone is not enough under an orthographic camera. The
   * Scribing Hall's roof passes comfortably below the camera->player segment
   * and still filled the bottom third of a phone screen, because "not blocking
   * the player" and "not eating the frame" are different questions. Anything
   * nearer the camera than the player, and close enough to the view axis to be
   * on screen, is foreground and fades for the same reason.
   */
  private crowdsForeground(
    camera: { readonly x: number; readonly z: number },
    box: {
      readonly minX: number;
      readonly maxX: number;
      readonly minZ: number;
      readonly maxZ: number;
    },
    dirX: number,
    dirZ: number,
    playerDepth: number,
  ): boolean {
    const centreX = (box.minX + box.maxX) / 2;
    const centreZ = (box.minZ + box.maxZ) / 2;
    const offsetX = centreX - camera.x;
    const offsetZ = centreZ - camera.z;
    const depth = offsetX * dirX + offsetZ * dirZ;
    if (depth <= 0 || depth >= playerDepth) return false;
    // Lateral distance from the view axis, against the building's own half
    // width: a hall off to one side is scenery, not an obstruction.
    const lateral = Math.abs(offsetX * dirZ - offsetZ * dirX);
    const halfSpan = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2;
    return lateral < halfSpan + FOREGROUND_MARGIN;
  }

  /**
   * Swings every building door toward open or shut based on the player's
   * distance from its trigger waypoint. Purely visual — there is no collision
   * system to gate, so a door is a proximity cue, not an obstacle.
   */
  updateDoors(playerPosition: Vec2, dtSeconds: number): void {
    if (this.geometry.doors.length === 0) return;
    const OPEN_MARGIN = 1.5;
    const LERP_RATE = 6;
    const t = 1 - Math.exp(-LERP_RATE * dtSeconds);
    for (const door of this.geometry.doors) {
      const node = this.graph.nodes[this.graph.indexOf(door.triggerWaypoint)];
      if (node === undefined) continue;
      const d2 = distanceSquared(playerPosition, node.position);
      const openRadius = node.radius + OPEN_MARGIN;
      const shouldOpen = d2 <= openRadius * openRadius;
      const target = shouldOpen ? door.openAngle : door.closedAngle;
      door.pivot.rotation.y += (target - door.pivot.rotation.y) * t;
    }
  }

  /** Shows a small pulsing ring at the reachable end of the active route. */
  updateNavigationMarker(destination: Vec2 | null, nowMs: number): void {
    if (destination === null) {
      this.navigationMarker.visible = false;
      return;
    }
    const pulse = 1 + Math.sin(nowMs * 0.008) * 0.12;
    this.navigationMarker.visible = true;
    this.navigationMarker.position.set(
      destination.x,
      this.heightAt(destination) + 0.075,
      destination.z,
    );
    this.navigationMarker.scale.setScalar(pulse);
  }

  /**
   * Moves the key light for the time of day and keeps it centred on the player,
   * which lets a small shadow map cover the whole visible area.
   */
  updateAtmosphere(dayFraction: number, focus: Vec2, dayNumber: number, nowMs: number): void {
    const elevation = sunElevation(dayFraction);
    const azimuth = dayFraction * Math.PI * 2;
    const radius = 40;
    this.sun.position.set(
      focus.x + Math.cos(azimuth) * radius * Math.cos(elevation),
      Math.max(6, Math.sin(elevation) * radius),
      focus.z + Math.sin(azimuth) * radius * Math.cos(elevation),
    );
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();

    // Night never goes fully black: an unreadable hub is worse than an
    // implausible one, and this is a mobile screen in daylight.
    const light = daylight(dayFraction);
    const weather = weatherForDay(dayNumber);
    this.sun.intensity = this.atmosphere.sunIntensity * (0.25 + light * 0.75) * weather.sunScale;
    this.sky.intensity =
      this.atmosphere.ambientIntensity * (0.55 + light * 0.45) * weather.ambientScale;

    // The original implementation only moved the sun. Grade the sky and fog
    // as well so dawn, dusk, night, mist, and rain read as different moments
    // without a full-screen post-processing pass.
    const night = 1 - light;
    this.weatherColour.set(weather.skyTint);
    this.skyColour
      .set(this.atmosphere.sky)
      .lerp(this.weatherColour, 0.24)
      .lerp(this.nightColour, night * 0.84);
    this.weatherColour.set(weather.fogTint);
    this.fogColour
      .set(this.atmosphere.fog)
      .lerp(this.weatherColour, 0.28)
      .lerp(this.nightFogColour, night * 0.62);
    if (this.scene !== null && this.fog !== null) {
      this.fog.near = this.atmosphere.fogNear * weather.fogNearScale;
      this.fog.far = this.atmosphere.fogFar * weather.fogFarScale;
    }
    this.weather.update(weather, focus.x, focus.z, nowMs);
  }

  dispose(): void {
    this.geometry.dispose();
    this.actors.dispose();
    this.navigationMarker.geometry.dispose();
    this.navigationMarker.material.dispose();
    this.weather.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.root.clear();
  }
}

/**
 * How far beyond a building's own footprint still counts as blocking the view,
 * in metres. Sized for the phone frustum, where the view is narrow enough that
 * a building a few metres off the axis is still across the frame.
 */
const FOREGROUND_MARGIN = 3;

/**
 * Slab method: does the segment from `a` to `b` pass through the box?
 *
 * Standard three-axis slab clip. Returns false the moment the surviving
 * parameter range collapses, so the common case of no overlap on the first
 * axis costs two divisions.
 */
function segmentHitsBox(
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
  box: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly minZ: number;
    readonly maxZ: number;
  },
): boolean {
  let enter = 0;
  let exit = 1;
  const axes: readonly [number, number, number, number][] = [
    [a.x, b.x - a.x, box.minX, box.maxX],
    [a.y, b.y - a.y, box.minY, box.maxY],
    [a.z, b.z - a.z, box.minZ, box.maxZ],
  ];
  for (const [origin, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const t1 = (min - origin) / delta;
    const t2 = (max - origin) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return false;
  }
  return true;
}
