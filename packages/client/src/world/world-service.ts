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

  private constructor(
    readonly zone: Zone,
    graph: NavGraph,
    quality: QualitySettings,
  ) {
    this.graph = graph;
    this.pathfinder = new Pathfinder(graph);
    this.geometry = buildZoneGeometry(zone, quality);
    // This scenery pack currently renders in the Courtyard only. Do not give
    // other zones invisible collision until their own prop packs exist.
    const scenery = zone.id === 'zone.courtyard' ? environmentCollisionPlacements(quality) : null;
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

    this.root.add(
      this.geometry.group,
      this.navigationMarker,
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
    scene.add(this.root);
    scene.background = new Color(this.atmosphere.sky);
    scene.fog = new Fog(this.atmosphere.fog, this.atmosphere.fogNear, this.atmosphere.fogFar);
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
  updateAtmosphere(dayFraction: number, focus: Vec2): void {
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
    this.sun.intensity = this.atmosphere.sunIntensity * (0.25 + light * 0.75);
    this.sky.intensity = this.atmosphere.ambientIntensity * (0.55 + light * 0.45);
  }

  dispose(): void {
    this.geometry.dispose();
    this.actors.dispose();
    this.navigationMarker.geometry.dispose();
    this.navigationMarker.material.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.root.clear();
  }
}
