/**
 * Recipes and refining.
 *
 * Waste is the lever that makes crafting skill worth levelling: a novice
 * refining ore loses some of it, an expert loses less. It is expressed in basis
 * points and floored by `crafting.minWasteRateBasisPoints`, so mastery reduces
 * spoilage without ever eliminating it - a recipe that becomes lossless turns
 * every material into currency at a fixed rate and flattens the economy it was
 * meant to feed.
 *
 * Like nodes, a recipe binds to an `Interactable` already placed in the world
 * rather than describing its own station.
 */

import type { InteractableId, ItemDefinitionId, RecipeId, SkillId } from '../ids.js';

export interface RecipeIngredient {
  readonly itemId: ItemDefinitionId;
  readonly quantity: number;
}

export interface RecipeDefinition {
  readonly id: RecipeId;
  readonly name: string;
  /** Must name an `InteractableKind.CraftingStation` in the zone it belongs to. */
  readonly stationInteractableId: InteractableId;
  readonly requiredSkillId: SkillId;
  readonly requiredSkillLevel: number;
  readonly inputs: readonly RecipeIngredient[];
  readonly output: RecipeIngredient;
  readonly craftDurationMs: number;
  /** Chance an input is consumed without contributing to the output. */
  readonly baseWasteRateBasisPoints: number;
  /** Reduction earned per level above `requiredSkillLevel`. */
  readonly wasteReductionPerSkillLevelBasisPoints: number;
  readonly xpPerCraft: number;
}

/**
 * Effective waste for a crafter, clamped at both ends.
 *
 * The floor keeps refining from becoming lossless; the cap keeps a very high
 * level from making the floor unreachable by a wide margin and wasting further
 * investment.
 */
export function wasteRateBasisPoints(
  recipe: RecipeDefinition,
  skillLevel: number,
  bounds: {
    readonly minWasteRateBasisPoints: number;
    readonly wasteReductionCapBasisPoints: number;
  },
): number {
  const levelsAbove = Math.max(0, skillLevel - recipe.requiredSkillLevel);
  const earned = levelsAbove * recipe.wasteReductionPerSkillLevelBasisPoints;
  const reduction = Math.min(earned, bounds.wasteReductionCapBasisPoints);
  return Math.max(bounds.minWasteRateBasisPoints, recipe.baseWasteRateBasisPoints - reduction);
}
