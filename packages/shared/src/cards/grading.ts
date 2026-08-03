/**
 * Appraisal.
 *
 * A grade is a uniform draw over a window whose centre rises with skill and
 * whose width narrows with it. That shape is chosen so a master is reliably
 * excellent without being guaranteed perfect, and a novice's spread sits in the
 * low grades rather than pinned at one.
 *
 * The odds are derived from the same window the roll uses, not authored
 * alongside it. Published odds that are maintained separately from the roll
 * drift, and a grading system whose stated odds are wrong is worse than one
 * that publishes nothing - which is why `gradeOdds` computes them analytically
 * and a test holds a million simulated rolls against it.
 *
 * Only materials the player gathered and crafted may ever influence this. Per
 * the resolved decision of 2026-07-31, purchased randomness on grade outcomes
 * is a loot box in several jurisdictions; nothing here takes a currency input,
 * and nothing added later should.
 */

import type { GradingTunables, ProgressionTunables } from '../config/tunables.js';
import type { Rng } from '../rng.js';

const MAX_SCORE = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Width of the appraisal window at a given skill. Never narrower than one. */
export function appraisalVariance(skillLevel: number, tunables: GradingTunables): number {
  const reduction = (skillLevel - 1) * tunables.varianceReductionPerSkillLevel;
  return Math.max(tunables.minVariance, tunables.baseVariance - reduction);
}

/** Centre of the appraisal window, interpolated from novice to master. */
export function appraisalCentre(
  skillLevel: number,
  grading: GradingTunables,
  progression: ProgressionTunables,
): number {
  const span = Math.max(1, progression.maxSkillLevel - 1);
  const position = clamp((skillLevel - 1) / span, 0, 1);
  const range = grading.masterCentreScore - grading.noviceCentreScore;
  return Math.round(grading.noviceCentreScore + position * range);
}

/** Inclusive score bounds a roll at this skill can produce. */
export function appraisalWindow(
  skillLevel: number,
  grading: GradingTunables,
  progression: ProgressionTunables,
): { readonly lowest: number; readonly highest: number; readonly variance: number } {
  const variance = appraisalVariance(skillLevel, grading);
  const centre = appraisalCentre(skillLevel, grading, progression);
  const lowest = centre - Math.floor(variance / 2);
  return { lowest, highest: lowest + variance, variance };
}

/** The grade a score falls in. Ten bands of equal width over 0..100. */
export function gradeForScore(score: number, tunables: GradingTunables): number {
  const bands = tunables.maxGrade - tunables.minGrade + 1;
  const width = MAX_SCORE / bands;
  const clamped = clamp(score, 0, MAX_SCORE);
  const band = Math.min(bands - 1, Math.floor(clamped / width));
  return tunables.minGrade + band;
}

/**
 * Rolls a grade.
 *
 * Takes an `Rng` rather than reading one, so the server resolves the roll and
 * the same generator state reproduces it during an audit.
 */
export function rollGrade(
  rng: Rng,
  skillLevel: number,
  grading: GradingTunables,
  progression: ProgressionTunables,
): { readonly grade: number; readonly score: number } {
  const window = appraisalWindow(skillLevel, grading, progression);
  const raw = window.lowest + rng.nextInt(0, window.variance);
  const score = clamp(raw, 0, MAX_SCORE);
  return { grade: gradeForScore(score, grading), score };
}

/**
 * The published odds at a skill level, as probabilities indexed from `minGrade`.
 *
 * Derived by walking the same window the roll draws from, so the published
 * table and the implementation cannot disagree. Clamping is accounted for:
 * scores outside 0..100 pile onto the end bands exactly as they do in play.
 */
export function gradeOdds(
  skillLevel: number,
  grading: GradingTunables,
  progression: ProgressionTunables,
): readonly number[] {
  const window = appraisalWindow(skillLevel, grading, progression);
  const outcomes = window.variance + 1;
  const bands = grading.maxGrade - grading.minGrade + 1;
  const counts = new Array<number>(bands).fill(0);

  for (let offset = 0; offset < outcomes; offset += 1) {
    const score = clamp(window.lowest + offset, 0, MAX_SCORE);
    const band = gradeForScore(score, grading) - grading.minGrade;
    counts[band] = (counts[band] ?? 0) + 1;
  }

  return counts.map((count) => count / outcomes);
}

/** Whether a grade earns a slab and a serial. */
export function isSlabbed(grade: number, tunables: GradingTunables): boolean {
  return grade >= tunables.slabThreshold;
}

/**
 * Reward multiplier for a grade, in basis points.
 *
 * This is the only place grade is permitted to matter mechanically, and it is
 * post-match reward rather than duel resolution (ADR-0004). Interpolated
 * linearly so there is no cliff a player could farm around.
 */
export function gradeRewardMultiplierBasisPoints(grade: number, tunables: GradingTunables): number {
  const span = Math.max(1, tunables.maxGrade - tunables.minGrade);
  const position = clamp((grade - tunables.minGrade) / span, 0, 1);
  const range = tunables.rewardMultiplierMaxBasisPoints - tunables.rewardMultiplierMinBasisPoints;
  return Math.round(tunables.rewardMultiplierMinBasisPoints + position * range);
}
