import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  levelForXp,
  wasteRateBasisPoints,
  xpForLevel,
  asId,
  type RecipeDefinition,
  type RecipeId,
  type SkillId,
  type InteractableId,
  type ItemDefinitionId,
} from '../index.js';

const progression = DEFAULT_TUNABLES.progression;
const crafting = DEFAULT_TUNABLES.crafting;

describe('xpForLevel', () => {
  it('asks nothing of a player at level one', () => {
    expect(xpForLevel(1, progression)).toBe(0);
    expect(xpForLevel(0, progression)).toBe(0);
    expect(xpForLevel(-5, progression)).toBe(0);
  });

  it('anchors the curve one level below, so level two costs the base', () => {
    expect(xpForLevel(2, progression)).toBe(progression.xpCurveBase);
  });

  it('rises strictly with level', () => {
    for (let level = 2; level <= progression.maxSkillLevel; level += 1) {
      expect(xpForLevel(level, progression)).toBeGreaterThan(xpForLevel(level - 1, progression));
    }
  });

  it('returns whole numbers throughout', () => {
    for (let level = 1; level <= progression.maxSkillLevel; level += 1) {
      expect(Number.isInteger(xpForLevel(level, progression))).toBe(true);
    }
  });

  it('clamps at the level cap rather than growing without bound', () => {
    const capped = xpForLevel(progression.maxSkillLevel, progression);
    expect(xpForLevel(progression.maxSkillLevel + 50, progression)).toBe(capped);
  });
});

describe('levelForXp', () => {
  it('starts every skill at level one', () => {
    expect(levelForXp(0, progression)).toBe(1);
  });

  it('is the exact inverse of the curve at every threshold', () => {
    for (let level = 1; level <= progression.maxSkillLevel; level += 1) {
      expect(levelForXp(xpForLevel(level, progression), progression)).toBe(level);
    }
  });

  it('does not promote a player one experience point short', () => {
    const threshold = xpForLevel(10, progression);
    expect(levelForXp(threshold - 1, progression)).toBe(9);
    expect(levelForXp(threshold, progression)).toBe(10);
  });

  it('never exceeds the cap however much experience is held', () => {
    expect(levelForXp(Number.MAX_SAFE_INTEGER, progression)).toBe(progression.maxSkillLevel);
  });
});

describe('wasteRateBasisPoints', () => {
  const recipe: RecipeDefinition = {
    id: asId<RecipeId>('recipe.test'),
    name: 'Test',
    stationInteractableId: asId<InteractableId>('int.station.grinder'),
    requiredSkillId: asId<SkillId>('skill.refining'),
    requiredSkillLevel: 10,
    inputs: [{ itemId: asId<ItemDefinitionId>('item.in'), quantity: 1 }],
    output: { itemId: asId<ItemDefinitionId>('item.out'), quantity: 1 },
    craftDurationMs: 1_000,
    baseWasteRateBasisPoints: 2_000,
    wasteReductionPerSkillLevelBasisPoints: 50,
    xpPerCraft: 1,
  };

  it('charges the full rate at the level the recipe unlocks', () => {
    expect(wasteRateBasisPoints(recipe, 10, crafting)).toBe(2_000);
  });

  it('gives no credit for levels below the requirement', () => {
    expect(wasteRateBasisPoints(recipe, 1, crafting)).toBe(2_000);
  });

  it('reduces waste for each level of mastery above the requirement', () => {
    expect(wasteRateBasisPoints(recipe, 20, crafting)).toBe(1_500);
  });

  it('never lets refining become lossless', () => {
    expect(wasteRateBasisPoints(recipe, progression.maxSkillLevel, crafting)).toBe(
      crafting.minWasteRateBasisPoints,
    );
    expect(wasteRateBasisPoints(recipe, progression.maxSkillLevel, crafting)).toBeGreaterThan(0);
  });

  it('caps the reduction mastery can buy', () => {
    const generous: RecipeDefinition = {
      ...recipe,
      baseWasteRateBasisPoints: 9_000,
      wasteReductionPerSkillLevelBasisPoints: 1_000,
    };
    // Ten levels of mastery would earn 10000 basis points, but the cap allows
    // only wasteReductionCapBasisPoints of it.
    expect(wasteRateBasisPoints(generous, 20, crafting)).toBe(
      9_000 - crafting.wasteReductionCapBasisPoints,
    );
  });

  it('decreases monotonically as skill rises', () => {
    let previous = wasteRateBasisPoints(recipe, 10, crafting);
    for (let level = 11; level <= progression.maxSkillLevel; level += 1) {
      const current = wasteRateBasisPoints(recipe, level, crafting);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });
});
