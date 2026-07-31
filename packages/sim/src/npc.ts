/**
 * NPC agents.
 *
 * An agent is a named `NpcDefinition` plus the mutable state needed to walk it
 * around: where it is, where it is going, and how long it intends to stand still.
 * Stepping is deterministic — the only randomness comes from an `Rng` seeded from
 * the NPC's own id, so every client computes the identical wander offset and
 * dwell duration without any of it crossing the network.
 *
 * Ambient crowd actors reuse the same struct with a generated definition. The
 * distinction is one of content, not of code: a named NPC has dialogue and quest
 * hooks attached elsewhere, an ambient actor does not.
 */

import { Rng, seedFromString, type NavGraph, type NpcDefinition, type Vec2 } from '@arcanum/shared';

import {
  createMover,
  followPath,
  isMoving,
  setPath,
  type LocomotionParams,
  type Mover,
} from './locomotion.js';
import type { Pathfinder } from './nav.js';
import { currentScheduleEntry } from './schedule.js';

export interface NpcAgent {
  readonly definition: NpcDefinition;
  readonly mover: Mover;
  /** Node index the agent is currently routed to. */
  readonly targetNode: number;
  /** World-clock minute of the schedule entry currently being served. */
  readonly servingMinute: number;
  /** Elapsed milliseconds remaining before the agent will move again. */
  readonly dwellRemainingMs: number;
  readonly rng: Rng;
}

export interface NpcStepContext {
  readonly graph: NavGraph;
  readonly pathfinder: Pathfinder;
  readonly locomotion: LocomotionParams;
  readonly worldMinute: number;
  readonly dwellMinMs: number;
  readonly dwellMaxMs: number;
}

export function createNpcAgent(
  definition: NpcDefinition,
  graph: NavGraph,
  worldMinute: number,
): NpcAgent {
  const entry = currentScheduleEntry(definition.schedule, worldMinute);
  const node = graph.indexOf(entry.waypoint);
  const safeNode = node >= 0 ? node : 0;
  const position = graph.nodes[safeNode]!.position;
  return {
    definition,
    // Agents pop into existence already at their post rather than walking there
    // from a spawn point, so the world looks settled the instant it loads.
    mover: createMover(position, 0),
    targetNode: safeNode,
    servingMinute: entry.startMinute,
    dwellRemainingMs: 0,
    rng: new Rng(seedFromString(definition.id)),
  };
}

/**
 * Advances an agent by one simulation step.
 *
 * Three things can happen, in priority order: the schedule changed and the agent
 * must relocate; the agent is walking and continues; the agent has arrived and
 * dwells, occasionally shuffling to a nearby spot so a crowd does not look like
 * a set of statues.
 */
export function stepNpcAgent(agent: NpcAgent, ctx: NpcStepContext, dtMs: number): NpcAgent {
  const entry = currentScheduleEntry(agent.definition.schedule, ctx.worldMinute);

  if (entry.startMinute !== agent.servingMinute) {
    const destination = ctx.graph.indexOf(entry.waypoint);
    if (destination >= 0 && destination !== agent.targetNode) {
      const path = ctx.pathfinder.positions(
        ctx.pathfinder.find(ctx.graph.nearest(agent.mover.position), destination),
      );
      return {
        ...agent,
        mover: setPath(agent.mover, path, ctx.locomotion.arrivalRadius),
        targetNode: destination,
        servingMinute: entry.startMinute,
        dwellRemainingMs: 0,
      };
    }
    return { ...agent, servingMinute: entry.startMinute };
  }

  if (isMoving(agent.mover)) {
    return { ...agent, mover: followPath(agent.mover, ctx.locomotion, dtMs / 1000) };
  }

  const remaining = agent.dwellRemainingMs - dtMs;
  if (remaining > 0) {
    return {
      ...agent,
      mover: followPath(agent.mover, ctx.locomotion, dtMs / 1000),
      dwellRemainingMs: remaining,
    };
  }

  // Dwell expired: drift to a new spot inside the waypoint's radius. Sampling a
  // point in the disc rather than picking another node keeps the agent visually
  // "at" its post while removing the frozen-statue look.
  const node = ctx.graph.nodes[agent.targetNode]!;
  const drift = samplePointInDisc(agent.rng, node.position, node.radius * 0.75);
  return {
    ...agent,
    mover: setPath(agent.mover, [drift], ctx.locomotion.arrivalRadius),
    dwellRemainingMs: agent.rng.nextInt(ctx.dwellMinMs, ctx.dwellMaxMs),
  };
}

/** Uniform sample inside a circle; the sqrt avoids clustering at the centre. */
export function samplePointInDisc(rng: Rng, centre: Vec2, radius: number): Vec2 {
  const angle = rng.nextFloat() * Math.PI * 2;
  const distance = Math.sqrt(rng.nextFloat()) * radius;
  return {
    x: centre.x + Math.cos(angle) * distance,
    z: centre.z + Math.sin(angle) * distance,
  };
}
