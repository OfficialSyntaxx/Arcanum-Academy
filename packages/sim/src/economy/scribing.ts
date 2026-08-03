/**
 * Scribing a card.
 *
 * Materials in, one card instance out, with a grade rolled at the moment of
 * creation. This is where Phase 3's economy finally pays for something: inks
 * exist to be spent here.
 *
 * The whole resolution is atomic and pure. Inputs are only consumed once the
 * roll is known to be possible, and nothing here mints a serial - that needs a
 * single global writer and belongs to the server, which is also the only place
 * that can honestly claim a card is the Nth ever slabbed.
 */

import {
  err,
  failure,
  FailureCode,
  isSlabbed,
  ok,
  rollGrade,
  type CardDefinition,
  type Failure,
  type GradingTunables,
  type ItemCatalog,
  type ItemDefinitionId,
  type ProgressionTunables,
  type Result,
  type Rng,
} from '@arcanum/shared';
import { hasAll, removeItems, type Inventory } from './inventory.js';

const BASIS_POINTS = 10_000;

export interface ScribeOutcome {
  readonly inventory: Inventory;
  readonly grade: number;
  /** The raw appraisal score, kept so a disputed grade can be audited. */
  readonly score: number;
  readonly foil: boolean;
  /** Whether the grade earns a slab, and therefore a serial. */
  readonly slabbed: boolean;
}

/** Whether a player may scribe a card at all. */
export function assertCanScribe(
  card: CardDefinition,
  skillLevel: number,
  inventory: Inventory,
): Result<true, Failure> {
  if (skillLevel < card.scribeSkillLevel) {
    return err(
      failure(FailureCode.Validation, 'scribing.skill_too_low', {
        detail: `requires scribing level ${card.scribeSkillLevel}`,
        context: { cardId: card.id, required: card.scribeSkillLevel, actual: skillLevel },
      }),
    );
  }
  const inputs = card.scribeInputs.map((input) => ({
    itemId: input.itemId as ItemDefinitionId,
    quantity: input.quantity,
  }));
  if (!hasAll(inventory, inputs)) {
    return err(
      failure(FailureCode.Conflict, 'scribing.missing_materials', {
        detail: 'the inventory does not hold every material',
        context: { cardId: card.id },
      }),
    );
  }
  return ok(true);
}

export interface ResolveScribeOptions {
  readonly card: CardDefinition;
  readonly skillLevel: number;
  readonly inventory: Inventory;
  readonly catalog: ItemCatalog;
  readonly grading: GradingTunables;
  readonly progression: ProgressionTunables;
  readonly rng: Rng;
}

/**
 * Consumes the materials and rolls the card's grade.
 *
 * Unlike refining there is no waste roll: a scribed card always exists. Its
 * quality is the variable, which is the entire point of grading - a failed
 * scribe that produced nothing would make grading a second tax on top of an
 * existing one.
 */
export function resolveScribe(options: ResolveScribeOptions): Result<ScribeOutcome, Failure> {
  const { card, skillLevel, inventory, grading, progression, rng } = options;

  const allowed = assertCanScribe(card, skillLevel, inventory);
  if (!allowed.ok) return err(allowed.error);

  let bag = inventory;
  for (const input of card.scribeInputs) {
    const removed = removeItems(bag, input.itemId as ItemDefinitionId, input.quantity);
    if (!removed.ok) return err(removed.error);
    bag = removed.value;
  }

  // Grade first, then foil, always in that order: the sequence of draws is
  // what an audit replays, and reordering them would invalidate every past
  // card's reproducibility.
  const { grade, score } = rollGrade(rng, skillLevel, grading, progression);
  const foil = rng.nextInt(0, BASIS_POINTS - 1) < grading.foilChanceBasisPoints;

  return ok({
    inventory: bag,
    grade,
    score,
    foil,
    slabbed: isSlabbed(grade, grading),
  });
}
