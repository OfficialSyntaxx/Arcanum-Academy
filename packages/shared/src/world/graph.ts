/**
 * Navigation graph construction and zone validation.
 *
 * A zone as authored is a list of records; a zone as used is an indexed graph.
 * Building one from the other is where every authoring mistake gets caught —
 * a link to a deleted waypoint, an asymmetric edge, an island of geometry the
 * player can path into but not out of. Catching these at load time rather than
 * when a player walks into them is the whole point: this runs in a test over the
 * shipped content, so a broken zone fails CI instead of a support ticket.
 *
 * The graph is index-based rather than id-based. Pathfinding runs on typed
 * arrays over integer node indices, which keeps A* allocation-free on a phone.
 */

import { failure, type Failure } from '../errors.js';
import type { WaypointId } from '../ids.js';
import { err, ok, type Result } from '../result.js';
import { distance, type Vec2, type Zone } from './types.js';

export interface NavNode {
  readonly id: WaypointId;
  readonly position: Vec2;
  readonly radius: number;
  readonly tags: readonly string[];
}

export interface NavGraph {
  readonly zoneId: string;
  readonly nodes: readonly NavNode[];
  /** `neighbourOffsets[i]`..`neighbourOffsets[i + 1]` slices the flat arrays. */
  readonly neighbourOffsets: Uint32Array;
  readonly neighbourIndices: Uint32Array;
  readonly neighbourCosts: Float32Array;
  indexOf(id: WaypointId): number;
  /** Nearest node to an arbitrary point; used to snap tap-to-move targets. */
  nearest(point: Vec2): number;
}

function fail(reason: string, detail: string): Failure {
  return failure('validation', reason, { detail });
}

/**
 * Validates a zone and compiles its waypoints into a navigation graph.
 *
 * Validation is exhaustive rather than fail-fast for structural checks that can
 * be reported together, because a designer fixing content wants the whole list,
 * not one error per run.
 */
export function buildNavGraph(zone: Zone): Result<NavGraph, Failure> {
  const problems: string[] = [];
  const indexById = new Map<string, number>();

  zone.waypoints.forEach((waypoint, index) => {
    if (indexById.has(waypoint.id)) {
      problems.push(`duplicate waypoint id "${waypoint.id}"`);
      return;
    }
    indexById.set(waypoint.id, index);
    if (waypoint.radius <= 0) {
      problems.push(`waypoint "${waypoint.id}" has non-positive radius`);
    }
    const { bounds } = zone;
    const { x, z } = waypoint.position;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) {
      problems.push(`waypoint "${waypoint.id}" lies outside zone bounds`);
    }
  });

  if (zone.waypoints.length === 0) {
    return err(fail('world.zone_empty', `zone "${zone.id}" declares no waypoints`));
  }

  // Edge integrity: every link must resolve, and every link must be reciprocated.
  // One-way edges are almost always a typo, and they strand actors.
  for (const waypoint of zone.waypoints) {
    const seen = new Set<string>();
    for (const link of waypoint.links) {
      if (link === waypoint.id) {
        problems.push(`waypoint "${waypoint.id}" links to itself`);
        continue;
      }
      if (seen.has(link)) {
        problems.push(`waypoint "${waypoint.id}" links to "${link}" twice`);
        continue;
      }
      seen.add(link);
      const targetIndex = indexById.get(link);
      if (targetIndex === undefined) {
        problems.push(`waypoint "${waypoint.id}" links to unknown "${link}"`);
        continue;
      }
      const target = zone.waypoints[targetIndex]!;
      if (!target.links.includes(waypoint.id)) {
        problems.push(`edge "${waypoint.id}" -> "${link}" is not reciprocated`);
      }
    }
  }

  if (!indexById.has(zone.spawn)) {
    problems.push(`spawn waypoint "${zone.spawn}" does not exist`);
  }

  for (const interactable of zone.interactables) {
    if (!indexById.has(interactable.approach)) {
      problems.push(
        `interactable "${interactable.id}" approaches unknown waypoint "${interactable.approach}"`,
      );
    }
    if (interactable.kind === 'ZONE_PORTAL' && interactable.targetZone === undefined) {
      problems.push(`portal "${interactable.id}" has no target zone`);
    }
  }

  zone.buildings.forEach((building, index) => {
    if (!indexById.has(building.doorTrigger)) {
      problems.push(
        `building [${String(index)}] door triggers unknown waypoint "${building.doorTrigger}"`,
      );
    }
    if (building.minX >= building.maxX || building.minZ >= building.maxZ) {
      problems.push(`building [${String(index)}] has a degenerate footprint`);
    }
    if (building.doorWidth <= 0) {
      problems.push(`building [${String(index)}] has a non-positive door width`);
    }
  });

  for (const npc of zone.npcs) {
    if (npc.schedule.length === 0) {
      problems.push(`npc "${npc.id}" has an empty schedule`);
      continue;
    }
    let previousStart = -1;
    for (const entry of npc.schedule) {
      if (entry.startMinute < 0 || entry.startMinute >= 1440) {
        problems.push(`npc "${npc.id}" has a schedule entry outside the day`);
      }
      if (entry.startMinute <= previousStart) {
        problems.push(`npc "${npc.id}" schedule is not strictly ordered by start time`);
      }
      previousStart = entry.startMinute;
      if (!indexById.has(entry.waypoint)) {
        problems.push(`npc "${npc.id}" is scheduled at unknown waypoint "${entry.waypoint}"`);
      }
    }
    if (npc.barks.length === 0) {
      problems.push(`npc "${npc.id}" has no barks`);
    }
  }

  if (problems.length > 0) {
    return err(fail('world.zone_invalid', `${zone.id}: ${problems.join('; ')}`));
  }

  // Flatten adjacency into contiguous arrays.
  const count = zone.waypoints.length;
  const offsets = new Uint32Array(count + 1);
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    offsets[i] = total;
    total += zone.waypoints[i]!.links.length;
  }
  offsets[count] = total;

  const indices = new Uint32Array(total);
  const costs = new Float32Array(total);
  let cursor = 0;
  for (const waypoint of zone.waypoints) {
    for (const link of waypoint.links) {
      const targetIndex = indexById.get(link)!;
      indices[cursor] = targetIndex;
      costs[cursor] = distance(waypoint.position, zone.waypoints[targetIndex]!.position);
      cursor += 1;
    }
  }

  const nodes: NavNode[] = zone.waypoints.map((waypoint) => ({
    id: waypoint.id,
    position: waypoint.position,
    radius: waypoint.radius,
    tags: waypoint.tags ?? [],
  }));

  // Connectivity: an unreachable island means an interactable the player can see
  // and never reach, which reads as a bug rather than as level design.
  const spawnIndex = indexById.get(zone.spawn)!;
  const reached = floodFill(spawnIndex, offsets, indices, count);
  if (reached < count) {
    const orphan = firstUnreachable(spawnIndex, offsets, indices, nodes);
    return err(
      fail(
        'world.zone_disconnected',
        `${zone.id}: ${String(count - reached)} waypoint(s) unreachable from spawn, e.g. "${orphan}"`,
      ),
    );
  }

  return ok({
    zoneId: zone.id,
    nodes,
    neighbourOffsets: offsets,
    neighbourIndices: indices,
    neighbourCosts: costs,
    indexOf(id: WaypointId): number {
      return indexById.get(id) ?? -1;
    },
    nearest(point: Vec2): number {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]!;
        const dx = node.position.x - point.x;
        const dz = node.position.z - point.z;
        const d = dx * dx + dz * dz;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      return best;
    },
  });
}

function visit(
  start: number,
  offsets: Uint32Array,
  indices: Uint32Array,
  size: number,
): Uint8Array {
  const seen = new Uint8Array(size);
  const stack = [start];
  seen[start] = 1;
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (let i = offsets[current]!; i < offsets[current + 1]!; i += 1) {
      const next = indices[i]!;
      if (seen[next] === 0) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return seen;
}

function floodFill(
  start: number,
  offsets: Uint32Array,
  indices: Uint32Array,
  size: number,
): number {
  const seen = visit(start, offsets, indices, size);
  let reached = 0;
  for (const flag of seen) if (flag === 1) reached += 1;
  return reached;
}

function firstUnreachable(
  start: number,
  offsets: Uint32Array,
  indices: Uint32Array,
  nodes: readonly NavNode[],
): string {
  const seen = visit(start, offsets, indices, nodes.length);
  for (let i = 0; i < nodes.length; i += 1) {
    if (seen[i] === 0) return nodes[i]!.id;
  }
  return '';
}
