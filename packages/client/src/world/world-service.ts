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

import { DirectionalLight, Group, HemisphereLight, Fog, type Scene } from 'three';
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
} from '@arcanum/shared';
import { Pathfinder } from '@arcanum/sim';

import type { QualitySettings } from '../core/device.js';
import { ActorPool } from './actor-pool.js';
import { atmosphereFor, daylight, sunElevation, type Atmosphere } from './palette.js';
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

  private readonly geometry: ZoneGeometry;
  private readonly atmosphere: Atmosphere;
  private readonly sun: DirectionalLight;
  private readonly sky: HemisphereLight;

  private constructor(
    readonly zone: Zone,
    graph: NavGraph,
    quality: QualitySettings,
  ) {
    this.graph = graph;
    this.pathfinder = new Pathfinder(graph);
    this.geometry = buildZoneGeometry(zone, quality);
    this.atmosphere = atmosphereFor(zone.atmosphere);

    // The player plus the named cast plus the crowd the device can afford.
    const capacity =
      1 + zone.npcs.length + Math.min(zone.ambientPopulation, quality.maxAmbientActors);
    this.actors = new ActorPool(capacity, quality.shadowsEnabled);

    this.sun = new DirectionalLight(this.atmosphere.sunColour, this.atmosphere.sunIntensity);
    this.sun.castShadow = quality.shadowsEnabled;
    if (quality.shadowsEnabled) {
      this.sun.shadow.mapSize.set(1024, 1024);
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

    this.root.add(this.geometry.group, this.actors.group, this.sun, this.sun.target, this.sky);
  }

  /** Validates and loads a zone. */
  static load(zone: Zone, quality: QualitySettings): Result<WorldService, Failure> {
    const graph = buildNavGraph(zone);
    if (!graph.ok) return err(graph.error);
    return ok(new WorldService(zone, graph.value, quality));
  }

  attach(scene: Scene): void {
    scene.add(this.root);
    scene.fog = new Fog(this.atmosphere.fog, this.atmosphere.fogNear, this.atmosphere.fogFar);
  }

  /** Ground height at a point, from the zone's authored terraces. */
  heightAt(point: Vec2): number {
    return heightAt(this.zone.terrain, point);
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
    this.sun.dispose();
    this.sky.dispose();
    this.root.clear();
  }
}
