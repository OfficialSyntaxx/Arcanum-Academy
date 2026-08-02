import { describe, expect, it } from 'vitest';
import {
  buildItemCatalog,
  buildSkillTable,
  DEFAULT_TUNABLES,
  ItemCategory,
  SkillCategory,
  asId,
  type ItemCatalog,
  type ItemDefinition,
  type ItemDefinitionId,
  type SkillId,
} from '@arcanum/shared';
import {
  addItems,
  createInventory,
  hasAll,
  quantityOf,
  removeItems,
  spaceFor,
  usedSlots,
  type Inventory,
} from '../economy/inventory.js';

const ORE = asId<ItemDefinitionId>('item.ore');
const GEM = asId<ItemDefinitionId>('item.gem');
const PICK = asId<ItemDefinitionId>('item.pick');
const ABSENT = asId<ItemDefinitionId>('item.absent');

function material(id: ItemDefinitionId, stackCap: number): ItemDefinition {
  return {
    id,
    name: `Material ${id}`,
    description: 'test',
    category: ItemCategory.Material,
    rarity: 'COMMON',
    stackCap,
    baseValue: 1,
    iconKey: 'test',
  };
}

function catalog(): ItemCatalog {
  const skills = buildSkillTable(
    [
      {
        id: asId<SkillId>('skill.mining'),
        name: 'Mining',
        category: SkillCategory.Gathering,
        unlocks: [],
      },
    ],
    DEFAULT_TUNABLES.progression.maxSkillLevel,
  );
  if (!skills.ok) throw new Error('fixture skill table should build');

  const built = buildItemCatalog(
    [
      material(ORE, 10),
      material(GEM, 5),
      {
        id: PICK,
        name: 'Pick',
        description: 'test',
        category: ItemCategory.Tool,
        rarity: 'COMMON',
        stackCap: 1,
        baseValue: 10,
        iconKey: 'test',
        tool: {
          maxDurability: 100,
          yieldMultiplierBasisPoints: 10_000,
          boundSkillId: asId<SkillId>('skill.mining'),
          repairCost: 5,
        },
      },
    ],
    skills.value,
  );
  if (!built.ok) throw new Error('fixture item catalog should build');
  return built.value;
}

function filled(inventory: Inventory, itemId: ItemDefinitionId, quantity: number): Inventory {
  const result = addItems(inventory, itemId, quantity, catalog());
  if (!result.ok) throw new Error(`fixture add should succeed: ${result.error.reason}`);
  return result.value;
}

describe('addItems', () => {
  it('opens a slot for the first of an item', () => {
    const inventory = filled(createInventory(4), ORE, 3);
    expect(quantityOf(inventory, ORE)).toBe(3);
    expect(usedSlots(inventory)).toBe(1);
  });

  it('tops up a partial stack before opening another slot', () => {
    const inventory = filled(filled(createInventory(4), ORE, 6), ORE, 3);
    expect(usedSlots(inventory)).toBe(1);
    expect(inventory.stacks[0]!.quantity).toBe(9);
  });

  it('spills into a second slot once the cap is reached', () => {
    const inventory = filled(createInventory(4), ORE, 13);
    expect(usedSlots(inventory)).toBe(2);
    expect(inventory.stacks[0]!.quantity).toBe(10);
    expect(inventory.stacks[1]!.quantity).toBe(3);
    expect(quantityOf(inventory, ORE)).toBe(13);
  });

  it('fills every slot exactly when the amount matches capacity', () => {
    const inventory = filled(createInventory(2), ORE, 20);
    expect(usedSlots(inventory)).toBe(2);
    expect(quantityOf(inventory, ORE)).toBe(20);
  });

  it('refuses an amount that would not fit, changing nothing', () => {
    const inventory = filled(createInventory(2), ORE, 20);
    const result = addItems(inventory, ORE, 1, catalog());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('inventory.slot_full');
    expect(quantityOf(inventory, ORE)).toBe(20);
  });

  it('counts room left in partial stacks as available space', () => {
    // One slot holding 6 of 10, one slot free: 4 + 10 = 14.
    const inventory = filled(createInventory(2), ORE, 6);
    expect(spaceFor(inventory, ORE, catalog())).toBe(14);
    expect(addItems(inventory, ORE, 14, catalog()).ok).toBe(true);
    expect(addItems(inventory, ORE, 15, catalog()).ok).toBe(false);
  });

  it('rejects an unknown item rather than inventing a stack cap', () => {
    const result = addItems(createInventory(4), ABSENT, 1, catalog());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('inventory.unknown_item');
    expect(spaceFor(createInventory(4), ABSENT, catalog())).toBe(0);
  });

  it('rejects a zero, negative or fractional amount', () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = addItems(createInventory(4), ORE, quantity, catalog());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.reason).toBe('inventory.invalid_quantity');
    }
  });

  it('gives a tool its own slot each time, since tools never stack', () => {
    const inventory = filled(filled(createInventory(4), PICK, 1), PICK, 1);
    expect(usedSlots(inventory)).toBe(2);
    expect(quantityOf(inventory, PICK)).toBe(2);
  });

  it('leaves the original inventory untouched', () => {
    const before = filled(createInventory(4), ORE, 3);
    const after = addItems(before, ORE, 2, catalog());
    expect(after.ok).toBe(true);
    expect(quantityOf(before, ORE)).toBe(3);
  });
});

describe('removeItems', () => {
  it('takes from the smallest stack first', () => {
    // 13 ore becomes a stack of 10 and a stack of 3; taking 3 empties the small one.
    const inventory = filled(createInventory(4), ORE, 13);
    const result = removeItems(inventory, ORE, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(usedSlots(result.value)).toBe(1);
    expect(quantityOf(result.value, ORE)).toBe(10);
  });

  it('releases a slot emptied to zero rather than keeping a husk', () => {
    const inventory = filled(createInventory(4), ORE, 4);
    const result = removeItems(inventory, ORE, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(usedSlots(result.value)).toBe(0);
  });

  it('spans stacks when one is not enough', () => {
    const inventory = filled(createInventory(4), ORE, 13);
    const result = removeItems(inventory, ORE, 12);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(quantityOf(result.value, ORE)).toBe(1);
    expect(usedSlots(result.value)).toBe(1);
  });

  it('refuses to remove more than is held, changing nothing', () => {
    const inventory = filled(createInventory(4), ORE, 5);
    const result = removeItems(inventory, ORE, 6);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('inventory.insufficient_items');
      expect(result.error.context).toMatchObject({ held: 5, requested: 6 });
    }
    expect(quantityOf(inventory, ORE)).toBe(5);
  });

  it('leaves other items alone', () => {
    const inventory = filled(filled(createInventory(4), ORE, 5), GEM, 4);
    const result = removeItems(inventory, ORE, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(quantityOf(result.value, GEM)).toBe(4);
    expect(quantityOf(result.value, ORE)).toBe(0);
  });
});

describe('hasAll', () => {
  it('is satisfied only when every ingredient is covered', () => {
    const inventory = filled(filled(createInventory(6), ORE, 5), GEM, 2);
    expect(hasAll(inventory, [{ itemId: ORE, quantity: 5 }])).toBe(true);
    expect(
      hasAll(inventory, [
        { itemId: ORE, quantity: 5 },
        { itemId: GEM, quantity: 2 },
      ]),
    ).toBe(true);
    expect(
      hasAll(inventory, [
        { itemId: ORE, quantity: 5 },
        { itemId: GEM, quantity: 3 },
      ]),
    ).toBe(false);
  });

  it('counts a total spread across several stacks', () => {
    const inventory = filled(createInventory(4), ORE, 15);
    expect(usedSlots(inventory)).toBe(2);
    expect(hasAll(inventory, [{ itemId: ORE, quantity: 15 }])).toBe(true);
  });

  it('is trivially satisfied by an empty requirement', () => {
    expect(hasAll(createInventory(1), [])).toBe(true);
  });
});
