import { describe, expect, it } from 'vitest';
import {
  buildItemCatalog,
  buildSkillTable,
  DEFAULT_TUNABLES,
  ItemCategory,
  SkillCategory,
  asId,
  type GatheringTunables,
  type ItemCatalog,
  type ItemDefinitionId,
  type NodeDefinition,
  type NodeId,
  type NodeState,
  type SkillId,
} from '@arcanum/shared';
import { createInventory, quantityOf, type Inventory } from '../economy/inventory.js';
import {
  HarvestMode,
  harvestIntervalMs,
  resolveHarvest,
  startSession,
  type EquippedTool,
} from '../economy/gathering.js';

const COMMON = asId<ItemDefinitionId>('item.common');
const RARE = asId<ItemDefinitionId>('item.rare');
const NODE_ID = asId<NodeId>('node.test');

const gathering: GatheringTunables = DEFAULT_TUNABLES.gathering;

function catalog(stackCap = 999): ItemCatalog {
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
  if (!skills.ok) throw new Error('fixture skills should build');
  const items = buildItemCatalog(
    [COMMON, RARE].map((id) => ({
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

function node(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: NODE_ID,
    interactableId: asId('int.node.crystal'),
    kind: 'CRYSTAL',
    requiredSkillId: asId<SkillId>('skill.mining'),
    requiredSkillLevel: 1,
    harvestIntervalMs: 1_000,
    dropTable: [
      { itemId: COMMON, weight: 9, minQuantity: 1, maxQuantity: 1 },
      { itemId: RARE, weight: 1, minQuantity: 1, maxQuantity: 1 },
    ],
    xpPerHarvest: 10,
    depletionHarvests: 1_000_000,
    regenerationMs: 60_000,
    ...overrides,
  };
}

const FRESH: NodeState = { harvestsSinceRegen: 0, dormantUntilMs: null };

function run(options: {
  ticks: number;
  seed?: string;
  node?: NodeDefinition;
  nodeState?: NodeState;
  inventory?: Inventory;
  catalog?: ItemCatalog;
  tool?: EquippedTool | null;
  mode?: HarvestMode;
}) {
  const definition = options.node ?? node();
  const mode = options.mode ?? HarvestMode.Online;
  const interval = harvestIntervalMs(definition, mode, gathering);
  const session = startSession(NODE_ID, options.seed ?? 'seed-a', 0);
  return resolveHarvest({
    session,
    node: definition,
    nodeState: options.nodeState ?? FRESH,
    inventory: options.inventory ?? createInventory(40),
    catalog: options.catalog ?? catalog(),
    tunables: gathering,
    mode,
    nowMs: options.ticks * interval,
    tool: options.tool ?? null,
  });
}

describe('determinism', () => {
  it('replays a seed to an identical yield', () => {
    const a = run({ ticks: 50 });
    const b = run({ ticks: 50 });
    expect(a.yields).toEqual(b.yields);
    expect(a.xpGained).toBe(b.xpGained);
    expect(a.session.rngState).toEqual(b.session.rngState);
  });

  it('produces a different yield from a different seed', () => {
    const a = run({ ticks: 50, seed: 'seed-a' });
    const b = run({ ticks: 50, seed: 'seed-b' });
    expect(a.yields).not.toEqual(b.yields);
  });

  it('reaches the same place resolved in one pass or in several', () => {
    const whole = run({ ticks: 20 });

    const definition = node();
    const interval = harvestIntervalMs(definition, HarvestMode.Online, gathering);
    let session = startSession(NODE_ID, 'seed-a', 0);
    let inventory = createInventory(40);
    let nodeState = FRESH;
    let xp = 0;
    for (const step of [5, 5, 10]) {
      const outcome = resolveHarvest({
        session,
        node: definition,
        nodeState,
        inventory,
        catalog: catalog(),
        tunables: gathering,
        mode: HarvestMode.Online,
        nowMs: session.resolvedThroughMs + step * interval,
        tool: null,
      });
      session = outcome.session;
      inventory = outcome.inventory;
      nodeState = outcome.nodeState;
      xp += outcome.xpGained;
    }

    expect(quantityOf(inventory, COMMON)).toBe(quantityOf(whole.inventory, COMMON));
    expect(quantityOf(inventory, RARE)).toBe(quantityOf(whole.inventory, RARE));
    expect(xp).toBe(whole.xpGained);
    expect(session.rngState).toEqual(whole.session.rngState);
  });
});

describe('ticking', () => {
  it('resolves nothing before a whole interval has passed', () => {
    const outcome = run({ ticks: 0 });
    expect(outcome.ticksResolved).toBe(0);
    expect(outcome.yields).toEqual([]);
  });

  it('leaves a partial tick for next time rather than rounding it up', () => {
    const definition = node();
    const session = startSession(NODE_ID, 'seed-a', 0);
    const outcome = resolveHarvest({
      session,
      node: definition,
      nodeState: FRESH,
      inventory: createInventory(40),
      catalog: catalog(),
      tunables: gathering,
      mode: HarvestMode.Online,
      nowMs: 2_500,
      tool: null,
    });
    expect(outcome.ticksResolved).toBe(2);
    // The unconsumed 500ms stays available to the next resolution.
    expect(outcome.session.resolvedThroughMs).toBe(2_000);
  });

  it('awards experience for every tick worked', () => {
    const outcome = run({ ticks: 7 });
    expect(outcome.xpGained).toBe(7 * 10);
  });
});

describe('offline accrual', () => {
  it('stretches the interval instead of shrinking the yield', () => {
    const definition = node();
    const online = harvestIntervalMs(definition, HarvestMode.Online, gathering);
    const offline = harvestIntervalMs(definition, HarvestMode.Offline, gathering);
    // 25% of the rate means four times as long between harvests.
    expect(offline).toBe(online * 4);
    expect(gathering.offlineAccrualRateBasisPoints).toBe(2_500);
  });

  it('yields a quarter as many ticks over the same wall-clock window', () => {
    const definition = node();
    const session = startSession(NODE_ID, 'seed-a', 0);
    const shared = {
      session,
      node: definition,
      nodeState: FRESH,
      inventory: createInventory(400),
      catalog: catalog(),
      tunables: gathering,
      nowMs: 40_000,
      tool: null,
    } as const;

    const online = resolveHarvest({ ...shared, mode: HarvestMode.Online });
    const offline = resolveHarvest({ ...shared, mode: HarvestMode.Offline });
    expect(online.ticksResolved).toBe(40);
    expect(offline.ticksResolved).toBe(10);
  });

  it('stops accruing at the cap however long the player was away', () => {
    const definition = node();
    const session = startSession(NODE_ID, 'seed-a', 0);
    const atCap = resolveHarvest({
      session,
      node: definition,
      nodeState: FRESH,
      inventory: createInventory(4_000),
      catalog: catalog(),
      tunables: gathering,
      mode: HarvestMode.Offline,
      nowMs: gathering.offlineAccrualCapMs,
      tool: null,
    });
    const wellPast = resolveHarvest({
      session,
      node: definition,
      nodeState: FRESH,
      inventory: createInventory(4_000),
      catalog: catalog(),
      tunables: gathering,
      mode: HarvestMode.Offline,
      nowMs: gathering.offlineAccrualCapMs * 5,
      tool: null,
    });
    expect(wellPast.ticksResolved).toBe(atCap.ticksResolved);
  });
});

describe('tools', () => {
  const tool = (durability: number): EquippedTool => ({
    durability,
    yieldMultiplierBasisPoints: 20_000,
  });

  it('spends one durability per harvest', () => {
    const outcome = run({ ticks: 5, tool: tool(100) });
    expect(outcome.durabilitySpent).toBe(5 * gathering.toolDurabilityLossPerHarvest);
  });

  it('never spends past zero', () => {
    const outcome = run({ ticks: 20, tool: tool(3) });
    expect(outcome.durabilitySpent).toBe(3);
  });

  it('raises the take while it holds durability', () => {
    const without = run({ ticks: 30, tool: null });
    const with2x = run({ ticks: 30, tool: tool(1_000) });
    const total = (outcome: { yields: readonly { quantity: number }[] }) =>
      outcome.yields.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total(with2x)).toBeGreaterThan(total(without));
  });

  it('keeps working at a reduced rate once worn out, never halting the session', () => {
    const outcome = run({ ticks: 30, tool: tool(0) });
    expect(outcome.ticksResolved).toBe(30);
    expect(outcome.xpGained).toBe(300);
    expect(outcome.yields.length).toBeGreaterThan(0);
  });
});

describe('depletion', () => {
  it('goes dormant once the node is worked out', () => {
    const outcome = run({ ticks: 5, node: node({ depletionHarvests: 3 }) });
    expect(outcome.nodeState.dormantUntilMs).not.toBeNull();
  });

  it('yields nothing while dormant but keeps the clock running', () => {
    const definition = node({ depletionHarvests: 3, regenerationMs: 10_000 });
    const outcome = run({ ticks: 6, node: definition });
    // Three ticks work the node out; the rest fall inside the dormant window.
    expect(outcome.ticksResolved).toBe(6);
    const total = outcome.yields.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBeLessThanOrEqual(3);
  });

  it('regrows and can be worked again within one long window', () => {
    const definition = node({ depletionHarvests: 2, regenerationMs: 5_000 });
    const outcome = run({ ticks: 30, node: definition });
    expect(outcome.xpGained).toBeGreaterThan(2 * definition.xpPerHarvest);
  });
});

describe('a full bag', () => {
  it('reports overflow without stopping the session', () => {
    const tiny = createInventory(1);
    const outcome = run({ ticks: 40, inventory: tiny, catalog: catalog(5) });
    expect(outcome.overflowed).toBe(true);
    expect(outcome.ticksResolved).toBe(40);
    // Progress is still earned; only the materials are lost.
    expect(outcome.xpGained).toBe(400);
  });

  it('never exceeds the slots it was given', () => {
    const outcome = run({ ticks: 60, inventory: createInventory(2), catalog: catalog(3) });
    expect(outcome.inventory.stacks.length).toBeLessThanOrEqual(2);
  });
});
