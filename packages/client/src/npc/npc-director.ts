/**
 * NPC director.
 *
 * Populates the courtyard and steps it every frame. Two populations, one code
 * path:
 *
 * - **Named NPCs** come from zone content and have schedules, dialogue and, from
 *   Phase 5, decks.
 * - **The ambient crowd** is generated: anonymous students who wander the plaza
 *   so the academy is never empty. They are the reason the hub reads as a school
 *   rather than a lobby, and they cost nothing to author.
 *
 * Crowd size is a function of the device's quality tier, not of the zone. A
 * flagship shows a busy courtyard; a budget phone shows a quiet one and holds
 * frame rate. Both are legible; only one is possible on both devices.
 */

import {
  createNpcAgent,
  stepNpcAgent,
  worldMinuteOf,
  type LocomotionParams,
  type NpcAgent,
  type NpcStepContext,
} from '@alderfell/sim';
import {
  NpcActivity,
  NpcRole,
  type NpcDefinition,
  type Tunables,
  type WaypointId,
} from '@alderfell/shared';

import type { WorldService } from '../world/world-service.js';

interface DirectedActor {
  agent: NpcAgent;
  readonly slot: number;
}

/** Frame-ready state for the richer presentation of authored NPCs. */
export interface NamedNpcPresentation {
  readonly id: string;
  readonly role: NpcRole;
  readonly appearance: string;
  readonly slot: number;
  readonly position: { readonly x: number; readonly z: number };
  readonly elevation: number;
  readonly facing: number;
  readonly gait: number;
  /** The scheduled activity being served, so the body can act it out. */
  readonly activity: NpcActivity;
}

const AMBIENT_APPEARANCES = ['student.a', 'student.b', 'student.c'] as const;

export class NpcDirector {
  private readonly actors: DirectedActor[] = [];
  private readonly locomotion: LocomotionParams;

  constructor(
    private readonly world: WorldService,
    private readonly tunables: Tunables,
    nowMs: number,
  ) {
    this.locomotion = {
      speed: tunables.world.npcWalkSpeed,
      turnRate: tunables.world.playerTurnRate,
      arrivalRadius: tunables.world.waypointArrivalRadius,
    };

    const worldMinute = worldMinuteOf(nowMs, tunables.world.worldDayLengthMs);

    for (const definition of world.zone.npcs) {
      this.spawn(definition, worldMinute);
    }

    // The crowd fills whatever capacity the pool has left after the named cast.
    const crowdSize = Math.max(0, world.actors.capacity - world.actors.inUse - 1);
    for (let i = 0; i < crowdSize; i += 1) {
      this.spawn(ambientDefinition(i, world), worldMinute);
    }
  }

  get population(): number {
    return this.actors.length;
  }

  namedPresentations(): readonly NamedNpcPresentation[] {
    return this.presentations().filter((presentation) => presentation.role !== NpcRole.Student);
  }

  /** Frame-ready state for every directed actor, the anonymous crowd included. */
  presentations(): readonly NamedNpcPresentation[] {
    return this.actors.map((actor) => {
      const { position, facing, velocity } = actor.agent.mover;
      return {
        id: actor.agent.definition.id,
        role: actor.agent.definition.role,
        appearance: actor.agent.definition.appearance,
        slot: actor.slot,
        position,
        elevation: this.world.heightAt(position),
        facing,
        gait: Math.min(1, velocity / this.locomotion.speed),
        activity:
          actor.agent.definition.schedule.find(
            (entry) => entry.startMinute === actor.agent.servingMinute,
          )?.activity ?? NpcActivity.Idle,
      };
    });
  }

  /** Steps every agent and writes their transforms into the actor pool. */
  update(nowMs: number, dtMs: number): void {
    const ctx: NpcStepContext = {
      graph: this.world.graph,
      pathfinder: this.world.pathfinder,
      locomotion: this.locomotion,
      worldMinute: worldMinuteOf(nowMs, this.tunables.world.worldDayLengthMs),
      dwellMinMs: this.tunables.world.npcDwellMinMs,
      dwellMaxMs: this.tunables.world.npcDwellMaxMs,
    };

    for (const actor of this.actors) {
      actor.agent = stepNpcAgent(actor.agent, ctx, dtMs);
      const { position, facing } = actor.agent.mover;
      this.world.actors.setTransform(
        actor.slot,
        position.x,
        this.world.heightAt(position),
        position.z,
        facing,
        Math.min(1, actor.agent.mover.velocity / this.locomotion.speed),
        nowMs,
      );
    }
  }

  /** The named NPC nearest a point within `radius`, for dialogue prompts. */
  nearestNamed(x: number, z: number, radius: number): NpcDefinition | null {
    let best: NpcDefinition | null = null;
    let bestDistance = radius * radius;
    for (const actor of this.actors) {
      if (actor.agent.definition.role === NpcRole.Student) continue;
      const { position } = actor.agent.mover;
      const d2 = (position.x - x) ** 2 + (position.z - z) ** 2;
      if (d2 <= bestDistance) {
        bestDistance = d2;
        best = actor.agent.definition;
      }
    }
    return best;
  }

  /** Resolves a named NPC after a UI prompt has selected it. */
  namedById(id: string): NpcDefinition | null {
    return (
      this.actors.find(
        (actor) =>
          actor.agent.definition.id === id && actor.agent.definition.role !== NpcRole.Student,
      )?.agent.definition ?? null
    );
  }

  dispose(): void {
    for (const actor of this.actors) this.world.actors.release(actor.slot);
    this.actors.length = 0;
  }

  private spawn(definition: NpcDefinition, worldMinute: number): void {
    const slot = this.world.actors.acquire(definition.appearance);
    if (slot < 0) return;
    this.actors.push({
      agent: createNpcAgent(definition, this.world.graph, worldMinute),
      slot,
    });
  }
}

/**
 * Generates one anonymous student.
 *
 * Their "schedule" is three social waypoints spread across the day, which is
 * enough to keep the crowd circulating without any of them looking purposeful
 * enough to be worth talking to.
 */
function ambientDefinition(index: number, world: WorldService): NpcDefinition {
  const social = world.graph.nodes.filter(
    (node) => node.tags.includes('plaza') || node.tags.includes('social'),
  );
  const pick = (offset: number): WaypointId => {
    const node = social[(index * 3 + offset) % Math.max(1, social.length)];
    return (node?.id ?? world.zone.spawn) as WaypointId;
  };

  return {
    id: `npc.ambient.${String(index)}` as NpcDefinition['id'],
    name: 'Student',
    role: NpcRole.Student,
    homeZone: world.zone.id,
    appearance: AMBIENT_APPEARANCES[index % AMBIENT_APPEARANCES.length]!,
    schedule: [
      { startMinute: 0, waypoint: pick(0), activity: NpcActivity.Wander },
      { startMinute: 8 * 60 + (index % 5) * 30, waypoint: pick(1), activity: NpcActivity.Wander },
      { startMinute: 16 * 60 + (index % 7) * 20, waypoint: pick(2), activity: NpcActivity.Idle },
    ],
    barks: ['...'],
  };
}
