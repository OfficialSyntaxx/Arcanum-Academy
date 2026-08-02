import { describe, expect, it } from 'vitest';
import {
  buildItemCatalog,
  buildNodeCatalog,
  buildRecipeBook,
  buildSkillTable,
  ITEM_CATALOG,
  NODE_CATALOG,
  RECIPE_BOOK,
  SKILL_TABLE,
  CONTENT_SCHEMA_VERSION,
  DEFAULT_TUNABLES,
  COURTYARD,
  InteractableKind,
  ItemCategory,
  SkillCategory,
  asId,
  type ItemDefinition,
  type NodeDefinition,
  type RecipeDefinition,
  type SkillDefinition,
  type ItemDefinitionId,
  type NodeId,
  type RecipeId,
  type SkillId,
  type InteractableId,
} from '../index.js';

const MAX_LEVEL = DEFAULT_TUNABLES.progression.maxSkillLevel;

function skill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: asId<SkillId>('skill.test'),
    name: 'Test',
    category: SkillCategory.Gathering,
    unlocks: [],
    ...overrides,
  };
}

function item(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: asId<ItemDefinitionId>('item.test'),
    name: 'Test Item',
    description: 'A test item.',
    category: ItemCategory.Material,
    rarity: 'COMMON',
    stackCap: 99,
    baseValue: 1,
    iconKey: 'test',
    ...overrides,
  };
}

/** The first gathering node and crafting station the courtyard actually places. */
const NODE_INTERACTABLE = COURTYARD.interactables.find(
  (entry) => entry.kind === InteractableKind.GatheringNode,
)!.id;
const STATION_INTERACTABLE = COURTYARD.interactables.find(
  (entry) => entry.kind === InteractableKind.CraftingStation,
)!.id;

function node(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: asId<NodeId>('node.test'),
    interactableId: NODE_INTERACTABLE,
    kind: 'CRYSTAL',
    requiredSkillId: asId<SkillId>('skill.test'),
    requiredSkillLevel: 1,
    harvestIntervalMs: 1_000,
    dropTable: [
      { itemId: asId<ItemDefinitionId>('item.test'), weight: 1, minQuantity: 1, maxQuantity: 1 },
    ],
    xpPerHarvest: 1,
    depletionHarvests: 10,
    regenerationMs: 1_000,
    ...overrides,
  };
}

function recipe(overrides: Partial<RecipeDefinition> = {}): RecipeDefinition {
  return {
    id: asId<RecipeId>('recipe.test'),
    name: 'Test Recipe',
    stationInteractableId: STATION_INTERACTABLE,
    requiredSkillId: asId<SkillId>('skill.crafter'),
    requiredSkillLevel: 1,
    inputs: [{ itemId: asId<ItemDefinitionId>('item.test'), quantity: 1 }],
    output: { itemId: asId<ItemDefinitionId>('item.output'), quantity: 1 },
    craftDurationMs: 1_000,
    baseWasteRateBasisPoints: 1_000,
    wasteReductionPerSkillLevelBasisPoints: 10,
    xpPerCraft: 1,
    ...overrides,
  };
}

function gatheringTable() {
  const built = buildSkillTable([skill()], MAX_LEVEL);
  if (!built.ok) throw new Error('fixture skill table should build');
  return built.value;
}

function craftingContext() {
  const skills = buildSkillTable(
    [skill({ id: asId<SkillId>('skill.crafter'), category: SkillCategory.Crafting })],
    MAX_LEVEL,
  );
  if (!skills.ok) throw new Error('fixture skill table should build');
  const items = buildItemCatalog(
    [item(), item({ id: asId<ItemDefinitionId>('item.output') })],
    skills.value,
  );
  if (!items.ok) throw new Error('fixture item catalog should build');
  return { skills: skills.value, items: items.value, zone: COURTYARD };
}

describe('shipped content', () => {
  it('compiles every catalog', () => {
    expect(SKILL_TABLE.skills.length).toBeGreaterThan(0);
    expect(ITEM_CATALOG.items.length).toBeGreaterThan(0);
    expect(NODE_CATALOG.nodes.length).toBeGreaterThan(0);
    expect(RECIPE_BOOK.recipes.length).toBeGreaterThan(0);
    expect(CONTENT_SCHEMA_VERSION).toBe(1);
  });

  it('binds every gathering node to a gathering interactable in the courtyard', () => {
    for (const definition of NODE_CATALOG.nodes) {
      const interactable = COURTYARD.interactables.find(
        (entry) => entry.id === definition.interactableId,
      );
      expect(interactable, `${definition.id} names a real interactable`).toBeDefined();
      expect(interactable!.kind).toBe(InteractableKind.GatheringNode);
      expect(NODE_CATALOG.byInteractable(definition.interactableId)).toBe(definition);
    }
  });

  it('resolves every drop, input and output to a defined item', () => {
    for (const definition of NODE_CATALOG.nodes) {
      for (const drop of definition.dropTable) {
        expect(
          ITEM_CATALOG.get(drop.itemId),
          `${definition.id} drops ${drop.itemId}`,
        ).toBeDefined();
      }
    }
    for (const definition of RECIPE_BOOK.recipes) {
      for (const input of definition.inputs) {
        expect(ITEM_CATALOG.get(input.itemId)).toBeDefined();
      }
      expect(ITEM_CATALOG.get(definition.output.itemId)).toBeDefined();
    }
  });

  it('groups recipes by the station they are crafted at', () => {
    for (const definition of RECIPE_BOOK.recipes) {
      expect(RECIPE_BOOK.atStation(definition.stationInteractableId)).toContain(definition);
    }
    expect(RECIPE_BOOK.atStation(asId<InteractableId>('int.node.crystal'))).toEqual([]);
  });

  it('gives every tool a stack cap of one and a real gathering skill', () => {
    for (const definition of ITEM_CATALOG.items) {
      if (definition.category !== ItemCategory.Tool) continue;
      expect(definition.tool).toBeDefined();
      expect(definition.stackCap).toBe(1);
      const bound = SKILL_TABLE.get(definition.tool!.boundSkillId);
      expect(bound, `${definition.id} binds to a real skill`).toBeDefined();
      expect(bound!.category).toBe(SkillCategory.Gathering);
    }
  });
});

describe('buildSkillTable', () => {
  it('rejects an empty catalogue with its own reason', () => {
    const built = buildSkillTable([], MAX_LEVEL);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.reason).toBe('content.skills_empty');
  });

  it('rejects a duplicate id', () => {
    const built = buildSkillTable([skill(), skill()], MAX_LEVEL);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.reason).toBe('content.skills_duplicate_id');
  });

  it('rejects unlocks listed out of order', () => {
    const built = buildSkillTable(
      [
        skill({
          unlocks: [
            { atLevel: 20, description: 'later' },
            { atLevel: 5, description: 'earlier' },
          ],
        }),
      ],
      MAX_LEVEL,
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('after level 20');
  });

  it('rejects an unlock beyond the level cap', () => {
    const built = buildSkillTable(
      [skill({ unlocks: [{ atLevel: MAX_LEVEL + 1, description: 'unreachable' }] })],
      MAX_LEVEL,
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.reason).toBe('content.skills_invalid');
  });
});

describe('buildItemCatalog', () => {
  it('rejects a tool that stacks', () => {
    const built = buildItemCatalog(
      [
        item({
          category: ItemCategory.Tool,
          stackCap: 5,
          tool: {
            maxDurability: 10,
            yieldMultiplierBasisPoints: 10_000,
            boundSkillId: asId<SkillId>('skill.test'),
            repairCost: 1,
          },
        }),
      ],
      gatheringTable(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('stack cap of 1');
  });

  it('rejects a tool bound to a skill nobody defined', () => {
    const built = buildItemCatalog(
      [
        item({
          category: ItemCategory.Tool,
          stackCap: 1,
          tool: {
            maxDurability: 10,
            yieldMultiplierBasisPoints: 10_000,
            boundSkillId: asId<SkillId>('skill.absent'),
            repairCost: 1,
          },
        }),
      ],
      gatheringTable(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('unknown skill');
  });

  it('rejects a material carrying tool properties', () => {
    const built = buildItemCatalog(
      [
        item({
          tool: {
            maxDurability: 10,
            yieldMultiplierBasisPoints: 10_000,
            boundSkillId: asId<SkillId>('skill.test'),
            repairCost: 1,
          },
        }),
      ],
      gatheringTable(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('not a tool');
  });
});

describe('buildNodeCatalog', () => {
  function context() {
    const skills = gatheringTable();
    const items = buildItemCatalog([item()], skills);
    if (!items.ok) throw new Error('fixture item catalog should build');
    return { skills, items: items.value, zone: COURTYARD };
  }

  it('rejects a node bound to a crafting station', () => {
    const built = buildNodeCatalog([node({ interactableId: STATION_INTERACTABLE })], context());
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('CRAFTING_STATION');
  });

  it('rejects a node bound to an interactable that does not exist', () => {
    const built = buildNodeCatalog(
      [node({ interactableId: asId<InteractableId>('int.node.imaginary') })],
      context(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('unknown interactable');
  });

  it('rejects a drop table with fractional weights', () => {
    const built = buildNodeCatalog(
      [
        node({
          dropTable: [
            {
              itemId: asId<ItemDefinitionId>('item.test'),
              weight: 0.5,
              minQuantity: 1,
              maxQuantity: 1,
            },
          ],
        }),
      ],
      context(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('fractional weight');
  });

  it('rejects a drop whose minimum exceeds its maximum', () => {
    const built = buildNodeCatalog(
      [
        node({
          dropTable: [
            {
              itemId: asId<ItemDefinitionId>('item.test'),
              weight: 1,
              minQuantity: 5,
              maxQuantity: 2,
            },
          ],
        }),
      ],
      context(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('min above max');
  });

  it('rejects two nodes claiming the same interactable', () => {
    const built = buildNodeCatalog([node(), node({ id: asId<NodeId>('node.other') })], context());
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('claimed by two nodes');
  });

  it('rejects a node requiring a crafting skill', () => {
    const skills = buildSkillTable([skill({ category: SkillCategory.Crafting })], MAX_LEVEL);
    if (!skills.ok) throw new Error('fixture skill table should build');
    const items = buildItemCatalog([item()], skills.value);
    if (!items.ok) throw new Error('fixture item catalog should build');
    const built = buildNodeCatalog([node()], {
      skills: skills.value,
      items: items.value,
      zone: COURTYARD,
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('not a gathering skill');
  });
});

describe('buildRecipeBook', () => {
  it('rejects a recipe that consumes what it produces', () => {
    const built = buildRecipeBook(
      [
        recipe({
          inputs: [{ itemId: asId<ItemDefinitionId>('item.output'), quantity: 1 }],
        }),
      ],
      craftingContext(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('consumes the item it produces');
  });

  it('rejects a recipe listing one input twice', () => {
    const built = buildRecipeBook(
      [
        recipe({
          inputs: [
            { itemId: asId<ItemDefinitionId>('item.test'), quantity: 1 },
            { itemId: asId<ItemDefinitionId>('item.test'), quantity: 2 },
          ],
        }),
      ],
      craftingContext(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('as an input twice');
  });

  it('rejects a recipe bound to a gathering node', () => {
    const built = buildRecipeBook(
      [recipe({ stationInteractableId: NODE_INTERACTABLE })],
      craftingContext(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('GATHERING_NODE');
  });

  it('rejects a recipe requiring a gathering skill', () => {
    const built = buildRecipeBook(
      [recipe({ requiredSkillId: asId<SkillId>('skill.absent') })],
      craftingContext(),
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.detail).toContain('unknown skill');
  });
});
