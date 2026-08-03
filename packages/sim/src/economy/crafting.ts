/**
 * Recipe resolution.
 *
 * Crafting is atomic: either the inputs are consumed and the roll is made, or
 * nothing changes at all. There is no partial state in which a player has paid
 * for a craft that did not happen, because a failure here is a rejected command
 * and the caller keeps the inventory it started with.
 *
 * Waste is rolled per unit of output rather than once for the whole craft. With
 * an output of one the two are identical, but the per-unit form means a recipe
 * that yields five does not become all-or-nothing the moment its quantity
 * changes - the balance of a recipe should not depend on where a roll happens
 * to sit in the code.
 */

import {
  err,
  failure,
  FailureCode,
  ok,
  wasteRateBasisPoints,
  type CraftingTunables,
  type Failure,
  type ItemCatalog,
  type RecipeDefinition,
  type Result,
  type Rng,
} from '@arcanum/shared';
import { addItems, hasAll, removeItems, spaceFor, type Inventory } from './inventory.js';

const BASIS_POINTS = 10_000;

export interface CraftOutcome {
  readonly inventory: Inventory;
  /** Units that survived the waste roll. May be zero on an unlucky craft. */
  readonly produced: number;
  /** Units lost to spoilage. `produced + wasted` is always the recipe's yield. */
  readonly wasted: number;
  readonly xpGained: number;
  /** The effective rate this craft was rolled against, after skill. */
  readonly wasteRateBasisPoints: number;
}

/**
 * Whether a player may attempt a recipe.
 *
 * Separate from resolution so a client can grey out a recipe it cannot craft
 * and show why, using the same reason the server would return.
 */
export function assertCanCraft(
  recipe: RecipeDefinition,
  skillLevel: number,
  inventory: Inventory,
): Result<true, Failure> {
  if (skillLevel < recipe.requiredSkillLevel) {
    return err(
      failure(FailureCode.Validation, 'crafting.skill_too_low', {
        detail: `requires ${recipe.requiredSkillId} level ${recipe.requiredSkillLevel}`,
        context: {
          recipeId: recipe.id,
          skillId: recipe.requiredSkillId,
          required: recipe.requiredSkillLevel,
          actual: skillLevel,
        },
      }),
    );
  }
  if (!hasAll(inventory, recipe.inputs)) {
    return err(
      failure(FailureCode.Conflict, 'crafting.missing_ingredients', {
        detail: 'the inventory does not hold every input',
        context: { recipeId: recipe.id },
      }),
    );
  }
  return ok(true);
}

export interface ResolveCraftOptions {
  readonly recipe: RecipeDefinition;
  readonly skillLevel: number;
  readonly inventory: Inventory;
  readonly catalog: ItemCatalog;
  readonly tunables: CraftingTunables;
  readonly rng: Rng;
}

/**
 * Consumes the inputs, rolls waste, and stores whatever survived.
 *
 * Room for the output is checked before anything is consumed. Taking the
 * ingredients and then discovering the result will not fit would destroy them
 * for nothing, which is the one outcome a player would rightly call a bug.
 */
export function resolveCraft(options: ResolveCraftOptions): Result<CraftOutcome, Failure> {
  const { recipe, skillLevel, inventory, catalog, tunables, rng } = options;

  const allowed = assertCanCraft(recipe, skillLevel, inventory);
  if (!allowed.ok) return err(allowed.error);

  // Consume first so the space check sees the room the inputs free up: a
  // recipe refining three ore into one ingot must be craftable with a full bag.
  let bag = inventory;
  for (const input of recipe.inputs) {
    const removed = removeItems(bag, input.itemId, input.quantity);
    if (!removed.ok) return err(removed.error);
    bag = removed.value;
  }

  if (spaceFor(bag, recipe.output.itemId, catalog) < recipe.output.quantity) {
    return err(
      failure(FailureCode.Conflict, 'crafting.no_room_for_output', {
        detail: 'the inventory cannot hold the result',
        context: { recipeId: recipe.id, itemId: recipe.output.itemId },
      }),
    );
  }

  const rate = wasteRateBasisPoints(recipe, skillLevel, tunables);
  let produced = 0;
  for (let unit = 0; unit < recipe.output.quantity; unit += 1) {
    if (rng.nextInt(0, BASIS_POINTS - 1) >= rate) produced += 1;
  }

  if (produced > 0) {
    const added = addItems(bag, recipe.output.itemId, produced, catalog);
    // Room was confirmed above for the full yield, so a partial one always fits.
    if (!added.ok) return err(added.error);
    bag = added.value;
  }

  return ok({
    inventory: bag,
    produced,
    wasted: recipe.output.quantity - produced,
    // Experience is earned for the work, not the luck - the same rule gathering
    // applies when a bag is full. The materials are the cost of a bad roll.
    xpGained: recipe.xpPerCraft,
    wasteRateBasisPoints: rate,
  });
}
