/**
 * World content vocabulary.
 *
 * These types describe the *authored* world: where the ground is, where an actor
 * may walk, what can be interacted with, and who lives here. They contain no
 * rendering data — a waypoint has a position, not a mesh — because the server
 * needs the same graph the client does in order to validate movement, and the
 * server has no renderer.
 *
 * All positions are on the XZ plane in metres. Ground height is sampled from the
 * zone's terrain description rather than authored per point, so a designer moving
 * a waypoint cannot desynchronise it from the floor.
 */

import type { InteractableId, NpcDefinitionId, WaypointId, ZoneId } from '../ids.js';

/** A point on the walkable plane. Y is derived, never authored. */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/**
 * A navigation node. Movement is graph-based rather than mesh-based: the hub is
 * a designed courtyard with clear routes, so a hand-authored graph is smaller to
 * ship, exact to validate server-side, and cheaper to path over on a phone than
 * a navmesh would be.
 *
 * `radius` is the free space around the node. An actor standing anywhere inside
 * it is considered to be at the node, which lets several actors occupy a plaza
 * without stacking on one coordinate.
 */
export interface Waypoint {
  readonly id: WaypointId;
  readonly position: Vec2;
  readonly radius: number;
  /** Bidirectional neighbours. Validated for symmetry at load time. */
  readonly links: readonly WaypointId[];
  /** Optional tag used by NPC schedules and quest targeting. */
  readonly tags?: readonly string[];
}

export const InteractableKind = {
  GatheringNode: 'GATHERING_NODE',
  CraftingStation: 'CRAFTING_STATION',
  ScribingTable: 'SCRIBING_TABLE',
  GradingDesk: 'GRADING_DESK',
  DuelCircle: 'DUEL_CIRCLE',
  MerchantStall: 'MERCHANT_STALL',
  DisplayPedestal: 'DISPLAY_PEDESTAL',
  ZonePortal: 'ZONE_PORTAL',
  QuestBoard: 'QUEST_BOARD',
} as const;

export type InteractableKind = (typeof InteractableKind)[keyof typeof InteractableKind];

/**
 * Something the player can walk up to and use. The interactable declares *what*
 * it is and *where*; the systems that own the behaviour (gathering, crafting,
 * combat) attach to it by kind in their own phases. That keeps the world data
 * free of gameplay logic and lets Phase 3 add gathering without editing Phase 2.
 */
export interface Interactable {
  readonly id: InteractableId;
  readonly kind: InteractableKind;
  readonly position: Vec2;
  /** Where an actor stands to use it; must be a waypoint in the same zone. */
  readonly approach: WaypointId;
  /** Facing in radians the avatar adopts on arrival, for a composed shot. */
  readonly facing: number;
  readonly label: string;
  /** Verb shown on the prompt button: "Gather", "Scribe", "Duel". */
  readonly verb: string;
  /** Account level required before the prompt appears. */
  readonly requiredLevel?: number;
  /** For ZonePortal only: the zone this leads to. */
  readonly targetZone?: ZoneId;
}

/**
 * A slot in an NPC's day. Schedules are evaluated as pure functions of the world
 * clock, so an NPC's location is reproducible on any client without syncing it —
 * every player sees the same professor at the same lectern.
 */
export interface ScheduleEntry {
  /** Minutes from midnight, world time, at which this entry becomes current. */
  readonly startMinute: number;
  readonly waypoint: WaypointId;
  /** Idle behaviour once there. */
  readonly activity: NpcActivity;
}

export const NpcActivity = {
  Idle: 'IDLE',
  Wander: 'WANDER',
  Teach: 'TEACH',
  Tend: 'TEND',
  Trade: 'TRADE',
  Study: 'STUDY',
  Spar: 'SPAR',
} as const;

export type NpcActivity = (typeof NpcActivity)[keyof typeof NpcActivity];

export const NpcRole = {
  Professor: 'PROFESSOR',
  Student: 'STUDENT',
  Rival: 'RIVAL',
  Merchant: 'MERCHANT',
  Archivist: 'ARCHIVIST',
  Referee: 'REFEREE',
  Groundskeeper: 'GROUNDSKEEPER',
} as const;

export type NpcRole = (typeof NpcRole)[keyof typeof NpcRole];

/**
 * A named inhabitant. Distinct from the anonymous ambient crowd, which the
 * client generates to fill the courtyard and which carries no identity, no
 * dialogue and no persistence.
 */
export interface NpcDefinition {
  readonly id: NpcDefinitionId;
  readonly name: string;
  readonly role: NpcRole;
  readonly homeZone: ZoneId;
  /** Ordered by `startMinute`; wraps at midnight. Validated non-empty. */
  readonly schedule: readonly ScheduleEntry[];
  /** Lines used for ambient barks, chosen deterministically per actor. */
  readonly barks: readonly string[];
  /** Palette key resolved by the renderer into robe and trim colours. */
  readonly appearance: string;
}

/**
 * Terrain is described, not sculpted: a flat base plus explicit terraces. A
 * courtyard is architectural, so this covers it exactly while staying tiny on the
 * wire and giving both client and server the same `heightAt` answer.
 */
export interface Terrace {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly height: number;
}

export interface ZoneTerrain {
  readonly baseHeight: number;
  readonly terraces: readonly Terrace[];
}

export interface ZoneBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface Zone {
  readonly id: ZoneId;
  readonly name: string;
  readonly bounds: ZoneBounds;
  readonly terrain: ZoneTerrain;
  readonly spawn: WaypointId;
  readonly waypoints: readonly Waypoint[];
  readonly interactables: readonly Interactable[];
  readonly npcs: readonly NpcDefinition[];
  /** How many anonymous ambient actors to populate, before quality budgeting. */
  readonly ambientPopulation: number;
  /** Sky and light preset key resolved by the renderer. */
  readonly atmosphere: string;
}

/** Height of the ground at a point, from the zone's terrace description. */
export function heightAt(terrain: ZoneTerrain, point: Vec2): number {
  let height = terrain.baseHeight;
  for (const terrace of terrain.terraces) {
    if (
      point.x >= terrace.minX &&
      point.x <= terrace.maxX &&
      point.z >= terrace.minZ &&
      point.z <= terrace.maxZ &&
      terrace.height > height
    ) {
      height = terrace.height;
    }
  }
  return height;
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
