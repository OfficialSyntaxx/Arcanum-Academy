/**
 * Awarding experience.
 *
 * Level is derived from cumulative experience rather than stored independently
 * and incremented. Two sources of truth for the same fact drift, and the
 * drifted one is always the level - which is what gates content, so a drift
 * shows up as a player being locked out of something they earned.
 */

import {
  levelForXp,
  type ProgressionTunables,
  type SkillDefinition,
  type SkillProgress,
  type SkillUnlock,
  xpForLevel,
} from '@arcanum/shared';

export interface XpAward {
  readonly progress: SkillProgress;
  readonly levelsGained: number;
  /** Unlocks crossed by this award, in ascending level order. */
  readonly unlocked: readonly SkillUnlock[];
}

export function initialProgress(): SkillProgress {
  return { level: 1, xp: 0 };
}

/**
 * Adds experience and recomputes the level it implies.
 *
 * A non-positive award is a no-op rather than an error: callers award the XP a
 * harvest produced, and a harvest that produced none is ordinary.
 */
export function awardXp(
  progress: SkillProgress,
  amount: number,
  tunables: ProgressionTunables,
  definition?: SkillDefinition,
): XpAward {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { progress, levelsGained: 0, unlocked: [] };
  }

  // Experience stops accumulating at the cap. Letting it climb forever would
  // leave a hidden buffer that a later cap increase would cash in all at once.
  const ceiling = xpForLevel(tunables.maxSkillLevel, tunables);
  const xp = Math.min(progress.xp + Math.floor(amount), ceiling);
  const level = levelForXp(xp, tunables);

  const unlocked =
    definition === undefined
      ? []
      : definition.unlocks.filter(
          (unlock) => unlock.atLevel > progress.level && unlock.atLevel <= level,
        );

  return {
    progress: { level, xp },
    levelsGained: level - progress.level,
    unlocked,
  };
}

/** Fraction of the way from the current level to the next, in [0, 1]. */
export function levelProgressFraction(
  progress: SkillProgress,
  tunables: ProgressionTunables,
): number {
  if (progress.level >= tunables.maxSkillLevel) return 1;
  const floorXp = xpForLevel(progress.level, tunables);
  const nextXp = xpForLevel(progress.level + 1, tunables);
  const span = nextXp - floorXp;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (progress.xp - floorXp) / span));
}
