import { describe, expect, it } from 'vitest';
import {
  buildItemCatalog,
  buildSkillTable,
  DEFAULT_TUNABLES,
  ItemCategory,
  Rng,
  SkillCategory,
  asId,
  type ItemCatalog,
  type ItemDefinitionId,
  type RecipeDefinition,
  type RecipeId,
  type SkillDefinition,
  type SkillId,
} from '@arcanum/shared';
import { addItems, createInventory, quantityOf, type Inventory } from '../economy/inventory.js';
import { assertCanCraft, resolveCraft } from '../economy/crafting.js';
import { awardXp, initialProgress, levelProgressFraction } from '../economy/skills.js';

const ORE = asId<ItemDefinitionId>('item.ore');
const INGOT = asId<ItemDefinitionId>('item.ingot');
const crafting = DEFAULT_TUNABLES.crafting;
const progression = DEFAULT_TUNABLES.progression;

function catalog(stackCap = 99): ItemCatalog {
  const skills = buildSkillTable(
    [
      {
        id: asId<SkillId>('skill.refining'),
        name: 'Refining',
        category: SkillCategory.Crafting,
        unlocks: [],
      },
    ],
    progression.maxSkillLevel,
  );
  if (!skills.ok) throw new Error('fixture skills should build');
  const items = buildItemCatalog(
    [ORE, INGOT].map((id) => ({
      id,
      name: `Item ${id}`,
      description: 'test',
      category: ItemCategory.Material,
      rarity: 'COMMON' as const,
      stackCap,
      baseValue: 1,
      iconKey: 'test',
    })),
    skills.value,
  );
  if (!items.ok) throw new Error('fixture items should build');
  return items.value;
}

function recipe(overrides: Partial<RecipeDefinition> = {}): RecipeDefinition {
  return {
    id: asId<RecipeId>('recipe.ingot'),
    name: 'Smelt Ingot',
    stationInteractableId: asId('int.station.grinder'),
    requiredSkillId: asId<SkillId>('skill.refining'),
    requiredSkillLevel: 5,
    inputs: [{ itemId: ORE, quantity: 3 }],
    output: { itemId: INGOT, quantity: 1 },
    craftDurationMs: 1_000,
    baseWasteRateBasisPoints: 0,
    wasteReductionPerSkillLevelBasisPoints: 0,
    xpPerCraft: 25,
    ...overrides,
  };
}

function withOre(quantity: number, slots = 20, stackCap = 99): Inventory {
  const added = addItems(createInventory(slots), ORE, quantity, catalog(stackCap));
  if (!added.ok) throw new Error('fixture add should succeed');
  return added.value;
}

describe('assertCanCraft', () => {
  it('refuses an under-levelled crafter', () => {
    const result = assertCanCraft(recipe(), 4, withOre(3));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('crafting.skill_too_low');
      expect(result.error.context).toMatchObject({ required: 5, actual: 4 });
    }
  });

  it('refuses when an ingredient is short', () => {
    const result = assertCanCraft(recipe(), 5, withOre(2));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('crafting.missing_ingredients');
  });

  it('allows a crafter at exactly the required level with the inputs', () => {
    expect(assertCanCraft(recipe(), 5, withOre(3)).ok).toBe(true);
  });
});

describe('resolveCraft', () => {
  it('consumes inputs and stores the output', () => {
    const result = resolveCraft({
      recipe: recipe(),
      skillLevel: 5,
      inventory: withOre(3),
      catalog: catalog(),
      tunables: crafting,
      rng: Rng.fromSeed('craft'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(quantityOf(result.value.inventory, ORE)).toBe(0);
    expect(quantityOf(result.value.inventory, INGOT)).toBe(1);
    expect(result.value.produced).toBe(1);
    expect(result.value.xpGained).toBe(25);
  });

  it('leaves the inventory untouched when it refuses', () => {
    const before = withOre(2);
    const result = resolveCraft({
      recipe: recipe(),
      skillLevel: 5,
      inventory: before,
      catalog: catalog(),
      tunables: crafting,
      rng: Rng.fromSeed('craft'),
    });
    expect(result.ok).toBe(false);
    expect(quantityOf(before, ORE)).toBe(2);
  });

  it('is craftable with a full bag when the inputs free the room', () => {
    // Two slots, cap 3: six ore fills the bag exactly. Consuming three frees a
    // slot, which is where the ingot goes.
    const full = withOre(6, 2, 3);
    const result = resolveCraft({
      recipe: recipe(),
      skillLevel: 5,
      inventory: full,
      catalog: catalog(3),
      tunables: crafting,
      rng: Rng.fromSeed('craft'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(quantityOf(result.value.inventory, INGOT)).toBe(1);
  });

  it('refuses rather than destroying inputs it cannot pay out', () => {
    // One slot of cap 3 holding three ore; the ingot is a different item and
    // would need a slot that consuming the ore does not free.
    const cramped = withOre(3, 1, 3);
    const result = resolveCraft({
      recipe: recipe({ inputs: [{ itemId: ORE, quantity: 1 }] }),
      skillLevel: 5,
      inventory: cramped,
      catalog: catalog(3),
      tunables: crafting,
      rng: Rng.fromSeed('craft'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('crafting.no_room_for_output');
    expect(quantityOf(cramped, ORE)).toBe(3);
  });

  function rateAtMastery(baseWasteRateBasisPoints: number): number {
    const result = resolveCraft({
      recipe: recipe({
        baseWasteRateBasisPoints,
        wasteReductionPerSkillLevelBasisPoints: 1_000,
      }),
      skillLevel: progression.maxSkillLevel,
      inventory: withOre(3),
      catalog: catalog(),
      tunables: crafting,
      rng: Rng.fromSeed('craft'),
    });
    if (!result.ok) throw new Error(`craft should resolve: ${result.error.reason}`);
    return result.value.wasteRateBasisPoints;
  }

  it('bottoms out at the floor when the reduction cap allows reaching it', () => {
    // Reduction is capped at 4000, so a base of 4000 would reach zero and is
    // held at the floor instead.
    expect(rateAtMastery(4_000)).toBe(crafting.minWasteRateBasisPoints);
    expect(rateAtMastery(4_000)).toBeGreaterThan(0);
  });

  it('is limited by the reduction cap before the floor on a wasteful recipe', () => {
    // The cap and the floor are independent guards: a base above cap + floor
    // can never reach the floor however high the skill, which is what stops a
    // deliberately lossy recipe from becoming as clean as a cheap one.
    expect(rateAtMastery(5_000)).toBe(5_000 - crafting.wasteReductionCapBasisPoints);
    expect(rateAtMastery(5_000)).toBeGreaterThan(crafting.minWasteRateBasisPoints);
  });

  it('rolls waste per unit, so produced and wasted always sum to the yield', () => {
    const definition = recipe({
      output: { itemId: INGOT, quantity: 5 },
      baseWasteRateBasisPoints: 5_000,
    });
    for (const seed of ['a', 'b', 'c', 'd']) {
      const result = resolveCraft({
        recipe: definition,
        skillLevel: 5,
        inventory: withOre(3),
        catalog: catalog(),
        tunables: crafting,
        rng: Rng.fromSeed(seed),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.produced + result.value.wasted).toBe(5);
    }
  });

  it('still awards experience when every unit spoils', () => {
    const result = resolveCraft({
      recipe: recipe({ baseWasteRateBasisPoints: 10_000 }),
      skillLevel: 5,
      inventory: withOre(3),
      catalog: catalog(),
      tunables: crafting,
      rng: Rng.fromSeed('craft'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.produced).toBe(0);
    expect(result.value.xpGained).toBe(25);
    expect(quantityOf(result.value.inventory, ORE)).toBe(0);
  });

  it('is reproducible from the same generator state', () => {
    const build = () =>
      resolveCraft({
        recipe: recipe({ output: { itemId: INGOT, quantity: 5 }, baseWasteRateBasisPoints: 4_000 }),
        skillLevel: 5,
        inventory: withOre(3),
        catalog: catalog(),
        tunables: crafting,
        rng: Rng.fromSeed('same'),
      });
    const a = build();
    const b = build();
    expect(a.ok && b.ok && a.value.produced).toBe(b.ok ? b.value.produced : -1);
  });
});

describe('awardXp', () => {
  const definition: SkillDefinition = {
    id: asId<SkillId>('skill.refining'),
    name: 'Refining',
    category: SkillCategory.Crafting,
    unlocks: [
      { atLevel: 2, description: 'first' },
      { atLevel: 3, description: 'second' },
      { atLevel: 40, description: 'far off' },
    ],
  };

  it('starts every skill at level one with no experience', () => {
    expect(initialProgress()).toEqual({ level: 1, xp: 0 });
  });

  it('accumulates and recomputes the level from total experience', () => {
    const award = awardXp(initialProgress(), progression.xpCurveBase, progression);
    expect(award.progress.xp).toBe(progression.xpCurveBase);
    expect(award.progress.level).toBe(2);
    expect(award.levelsGained).toBe(1);
  });

  it('treats a zero or negative award as nothing happening', () => {
    const before = { level: 3, xp: 500 };
    for (const amount of [0, -10, Number.NaN]) {
      const award = awardXp(before, amount, progression);
      expect(award.progress).toEqual(before);
      expect(award.levelsGained).toBe(0);
    }
  });

  it('reports every unlock crossed by a single large award', () => {
    const award = awardXp(initialProgress(), 10_000, progression, definition);
    expect(award.levelsGained).toBeGreaterThan(1);
    const levels = award.unlocked.map((unlock) => unlock.atLevel);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
  });

  it('does not re-report an unlock already passed', () => {
    const first = awardXp(initialProgress(), 10_000, progression, definition);
    const second = awardXp(first.progress, 100, progression, definition);
    expect(second.unlocked).toEqual([]);
  });

  it('stops accumulating at the cap rather than banking a hidden surplus', () => {
    const award = awardXp({ level: 1, xp: 0 }, Number.MAX_SAFE_INTEGER, progression);
    expect(award.progress.level).toBe(progression.maxSkillLevel);
    const again = awardXp(award.progress, 1_000_000, progression);
    expect(again.progress.xp).toBe(award.progress.xp);
  });
});

describe('levelProgressFraction', () => {
  it('is zero the moment a level is reached', () => {
    const award = awardXp(initialProgress(), progression.xpCurveBase, progression);
    expect(levelProgressFraction(award.progress, progression)).toBe(0);
  });

  it('is one at the cap', () => {
    const capped = awardXp(initialProgress(), Number.MAX_SAFE_INTEGER, progression);
    expect(levelProgressFraction(capped.progress, progression)).toBe(1);
  });

  it('stays within zero and one partway through a level', () => {
    const award = awardXp(initialProgress(), progression.xpCurveBase + 10, progression);
    const fraction = levelProgressFraction(award.progress, progression);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(1);
  });
});
