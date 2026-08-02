/**
 * Skills and the experience curve.
 *
 * One curve serves every skill. A per-skill curve would let one discipline
 * quietly become the efficient path to account progress, and balancing that
 * back out means editing curves rather than the rewards that caused it.
 * Differentiation belongs in what a skill unlocks and what it yields, not in
 * how much experience a level costs.
 */

import type { RecipeId, SkillId } from '../ids.js';
import type { ProgressionTunables } from '../config/tunables.js';

export const SkillCategory = {
  Gathering: 'GATHERING',
  Crafting: 'CRAFTING',
} as const;
export type SkillCategory = (typeof SkillCategory)[keyof typeof SkillCategory];

/** Something a level makes available. Purely declarative; gates read it. */
export interface SkillUnlock {
  readonly atLevel: number;
  readonly description: string;
  /** Present when the unlock admits a gathering node kind. */
  readonly nodeKind?: string;
  /** Present when the unlock admits a recipe. */
  readonly recipeId?: RecipeId;
}

export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly category: SkillCategory;
  readonly unlocks: readonly SkillUnlock[];
}

/** A player's standing in one skill. */
export interface SkillProgress {
  readonly level: number;
  /** Cumulative experience, not experience within the level. */
  readonly xp: number;
}

/**
 * Cumulative experience required to stand at `level`.
 *
 * Level 1 costs nothing, so the curve is anchored at the level above it:
 * `base * (level - 1) ^ exponent`. Anchoring at `level` itself would demand
 * experience of a player who has never done anything.
 *
 * Floored to keep the curve in integers - fractional experience has no meaning
 * to a player and invites drift between client prediction and server truth.
 */
export function xpForLevel(level: number, tunables: ProgressionTunables): number {
  if (level <= 1) return 0;
  const capped = Math.min(level, tunables.maxSkillLevel);
  return Math.floor(tunables.xpCurveBase * Math.pow(capped - 1, tunables.xpCurveExponent));
}

/**
 * The highest level whose cost `xp` covers.
 *
 * Walks upward rather than inverting the curve algebraically: the exponent is
 * a tunable and may become a piecewise curve later, at which point an inverse
 * derived from today's formula would silently disagree with `xpForLevel`. The
 * loop is bounded by the level cap and runs once per award.
 */
export function levelForXp(xp: number, tunables: ProgressionTunables): number {
  let level = 1;
  while (level < tunables.maxSkillLevel && xp >= xpForLevel(level + 1, tunables)) {
    level += 1;
  }
  return level;
}
