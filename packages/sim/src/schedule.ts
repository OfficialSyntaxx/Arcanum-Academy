/**
 * The world clock and NPC schedule evaluation.
 *
 * An NPC's whereabouts is a pure function of the world clock, not a piece of
 * replicated state. That decision has a large payoff: the server never sends a
 * single byte about where Professor Vosk is standing, yet every player sees her
 * at the same lectern at the same moment, and a player who reconnects mid-session
 * resolves the world instantly instead of waiting for a crowd of position
 * updates. The cost is that NPC routine cannot react to events, which is
 * acceptable for ambient life; anything that must react becomes a real
 * server-owned actor instead.
 *
 * The world runs faster than real time so that a player in a single session sees
 * the academy change around them. One in-world day defaults to one real hour.
 */

import type { NpcDefinition, ScheduleEntry } from '@arcanum/shared';

export const MINUTES_PER_DAY = 1440;

/** Minute of the in-world day, 0..1439, from a real epoch timestamp. */
export function worldMinuteOf(epochMs: number, dayLengthMs: number): number {
  const phase = ((epochMs % dayLengthMs) + dayLengthMs) % dayLengthMs;
  return Math.floor((phase / dayLengthMs) * MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Fractional day progress, 0..1. Used to drive sun angle and sky tint. */
export function worldDayFractionOf(epochMs: number, dayLengthMs: number): number {
  const phase = ((epochMs % dayLengthMs) + dayLengthMs) % dayLengthMs;
  return phase / dayLengthMs;
}

/**
 * The schedule entry in force at a given world minute.
 *
 * Schedules wrap: before the first entry of the day, an NPC is still doing
 * whatever the last entry said, because that is what "overnight" means. Callers
 * are guaranteed a result for any non-empty schedule, which is enforced at
 * content validation time.
 */
export function currentScheduleEntry(
  schedule: readonly ScheduleEntry[],
  worldMinute: number,
): ScheduleEntry {
  if (schedule.length === 0) {
    throw new Error('currentScheduleEntry called with an empty schedule');
  }
  let chosen = schedule[schedule.length - 1]!;
  for (const entry of schedule) {
    if (entry.startMinute <= worldMinute) chosen = entry;
    else break;
  }
  return chosen;
}

/** Minutes until the schedule next changes; drives repath timing. */
export function minutesUntilNextEntry(
  schedule: readonly ScheduleEntry[],
  worldMinute: number,
): number {
  for (const entry of schedule) {
    if (entry.startMinute > worldMinute) return entry.startMinute - worldMinute;
  }
  const first = schedule[0];
  if (first === undefined) return MINUTES_PER_DAY;
  return MINUTES_PER_DAY - worldMinute + first.startMinute;
}

/**
 * Picks a bark deterministically from an NPC's list.
 *
 * Seeded by the NPC id and a rotation counter rather than by a random number, so
 * two players standing next to the same professor hear the same line. Ambient
 * dialogue that disagrees between clients is a small thing that makes a shared
 * world feel fake.
 */
export function selectBark(definition: NpcDefinition, rotation: number): string {
  const { barks } = definition;
  if (barks.length === 0) return '';
  let hash = 2166136261;
  for (let i = 0; i < definition.id.length; i += 1) {
    hash ^= definition.id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= Math.floor(rotation);
  hash = Math.imul(hash, 16777619);
  const index = (hash >>> 0) % barks.length;
  return barks[index]!;
}
