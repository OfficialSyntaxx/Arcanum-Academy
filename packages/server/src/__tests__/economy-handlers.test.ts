import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  NODE_CATALOG,
  RECIPE_BOOK,
  SKILL_TABLE,
  asId,
  type Failure,
  type ItemDefinitionId,
  type PlayerId,
  type SessionId,
  type SkillId,
} from '@arcanum/shared';
import { RegistryCommandRouter } from '../net/gateway.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import { PlayerService } from '../domain/player-service.js';
import { registerEconomyHandlers } from '../net/handlers/economy.js';
import { parsePlayerState, PLAYER_SCHEMA_VERSION } from '../domain/player-state.js';
import type { Session } from '../session/session-store.js';

const PLAYER = asId<PlayerId>('player-1');
const SLOTS = DEFAULT_TUNABLES.gathering.baseInventorySlots;

/** The crystal node the shipped content places in the courtyard. */
const CRYSTAL = NODE_CATALOG.nodes.find((node) => node.kind === 'CRYSTAL')!;
const DUST_RECIPE = RECIPE_BOOK.recipes[0]!;

/** The crystal node, but demanding a level a new player cannot have. */
const demandingNode = { ...CRYSTAL, requiredSkillLevel: 50 };

const SHIPPED_CATALOGS = {
  items: ITEM_CATALOG,
  nodes: NODE_CATALOG,
  recipes: RECIPE_BOOK,
  skills: SKILL_TABLE,
};

function session(playerId: PlayerId = PLAYER): Session {
  return {
    id: asId<SessionId>('session-1'),
    playerId,
    resumeToken: 'token',
    createdAtMs: 0,
    disconnectedAtMs: null,
    lastClientSeq: 0,
  };
}

function harness(catalogOverrides: Partial<typeof SHIPPED_CATALOGS> = {}, startAtMs = 1_000_000) {
  let clock = startAtMs;
  const repository = new InMemoryPlayerRepository(() => clock);
  const players = new PlayerService({ repository, slotCapacity: SLOTS, now: () => clock });
  const router = new RegistryCommandRouter();
  registerEconomyHandlers(router, {
    players,
    catalogs: { ...SHIPPED_CATALOGS, ...catalogOverrides },
    tunables: DEFAULT_TUNABLES,
    now: () => clock,
  });
  return {
    router,
    repository,
    players,
    advance: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
    dispatch: (kind: string, payload: unknown = {}) => router.dispatch(session(), kind, payload),
    async state() {
      const loaded = await players.load(PLAYER);
      if (!loaded.ok) throw new Error(`load failed: ${loaded.error.reason}`);
      return loaded.value;
    },
  };
}

interface HarvestPatch {
  readonly yields: readonly { itemId: ItemDefinitionId; quantity: number }[];
  readonly xpGained: number;
  readonly ticksResolved: number;
  readonly overflowed: boolean;
  readonly skills: Record<string, { level: number; xp: number }>;
  readonly inventory: { stacks: readonly { definitionId: string; quantity: number }[] };
}

describe('player.sync', () => {
  it('creates a player on first sight and returns an empty bag', async () => {
    const h = harness();
    const result = await h.dispatch('player.sync');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as { inventory: { stacks: unknown[]; slotCapacity: number } };
    expect(patch.inventory.stacks).toEqual([]);
    expect(patch.inventory.slotCapacity).toBe(SLOTS);
  });

  it('persists that player, so a second sync reads rather than recreates', async () => {
    const h = harness();
    await h.dispatch('player.sync');
    const stored = await h.repository.find(PLAYER);
    expect(stored.ok).toBe(true);
    if (!stored.ok || stored.value === null) throw new Error('expected a stored record');
    expect(stored.value.schemaVersion).toBe(PLAYER_SCHEMA_VERSION);
    expect(parsePlayerState(stored.value, SLOTS).ok).toBe(true);
  });
});

describe('gathering.start', () => {
  it('refuses an interactable that is not a gathering node', async () => {
    const h = harness();
    const result = await h.dispatch('gathering.start', {
      interactableId: 'int.station.distillery',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('gathering.not_a_node');
  });

  it('refuses a payload with no interactable', async () => {
    const h = harness();
    const result = await h.dispatch('gathering.start', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('gathering.interactable_missing');
  });

  it('starts a session and stores it', async () => {
    const h = harness();
    const result = await h.dispatch('gathering.start', {
      interactableId: CRYSTAL.interactableId,
    });
    expect(result.ok).toBe(true);
    const state = await h.state();
    expect(state.gathering).not.toBeNull();
    expect(state.gathering!.nodeId).toBe(CRYSTAL.id);
  });

  it('refuses a node the player has not levelled for', async () => {
    // Catalogs are injected, so the gate can be exercised through the real
    // handler with a node that demands more than a new player has.
    const gated = harness({
      nodes: { ...NODE_CATALOG, get: () => undefined, byInteractable: () => demandingNode },
    });
    const result = await gated.dispatch('gathering.start', {
      interactableId: CRYSTAL.interactableId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('gathering.skill_too_low');
      expect(result.error.context).toMatchObject({ required: 50, actual: 1 });
    }

    // Nothing was started, so the refusal left no session behind.
    const state = await gated.state();
    expect(state.gathering).toBeNull();
  });
});

describe('gathering.collect', () => {
  it('refuses when nothing is running', async () => {
    const h = harness();
    const result = await h.dispatch('gathering.collect');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('gathering.not_active');
  });

  it('yields materials and experience once ticks have passed', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(CRYSTAL.harvestIntervalMs * 10);

    const result = await h.dispatch('gathering.collect');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as HarvestPatch;
    expect(patch.ticksResolved).toBe(10);
    expect(patch.xpGained).toBe(10 * CRYSTAL.xpPerHarvest);
    expect(patch.yields.length).toBeGreaterThan(0);
    expect(patch.inventory.stacks.length).toBeGreaterThan(0);

    const state = await h.state();
    expect(state.skills[CRYSTAL.requiredSkillId]!.xp).toBe(10 * CRYSTAL.xpPerHarvest);
  });

  it('does not pay twice for the same elapsed time', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(CRYSTAL.harvestIntervalMs * 5);

    const first = await h.dispatch('gathering.collect');
    const second = await h.dispatch('gathering.collect');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect((first.value as HarvestPatch).ticksResolved).toBe(5);
    expect((second.value as HarvestPatch).ticksResolved).toBe(0);
  });

  it('resumes the same sequence across separate collections', async () => {
    const runOnce = async (splits: number[]) => {
      const h = harness();
      await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
      let xp = 0;
      for (const ticks of splits) {
        h.advance(CRYSTAL.harvestIntervalMs * ticks);
        const result = await h.dispatch('gathering.collect');
        if (!result.ok) throw new Error(result.error.reason);
        xp += (result.value as HarvestPatch).xpGained;
      }
      const state = await h.state();
      return { xp, stacks: state.inventory.stacks };
    };

    // Same clock, same seed - only the number of round trips differs.
    const whole = await runOnce([12]);
    const split = await runOnce([4, 8]);
    expect(split.xp).toBe(whole.xp);
    expect(split.stacks).toEqual(whole.stacks);
  });
});

describe('gathering.claimOffline', () => {
  it('refuses before a whole offline harvest has accrued', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(CRYSTAL.harvestIntervalMs);
    const result = await h.dispatch('gathering.claimOffline');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('gathering.nothing_to_claim');
  });

  it('accrues at a quarter of the online rate', async () => {
    const online = harness();
    await online.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    online.advance(CRYSTAL.harvestIntervalMs * 40);
    const onlineResult = await online.dispatch('gathering.collect');

    const offline = harness();
    await offline.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    offline.advance(CRYSTAL.harvestIntervalMs * 40);
    const offlineResult = await offline.dispatch('gathering.claimOffline');

    expect(onlineResult.ok && offlineResult.ok).toBe(true);
    if (!onlineResult.ok || !offlineResult.ok) return;
    expect((onlineResult.value as HarvestPatch).ticksResolved).toBe(40);
    expect((offlineResult.value as HarvestPatch).ticksResolved).toBe(10);
  });

  it('stops at the cap however long the player was away', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(DEFAULT_TUNABLES.gathering.offlineAccrualCapMs * 10);
    const result = await h.dispatch('gathering.claimOffline');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const interval = Math.ceil(
      (CRYSTAL.harvestIntervalMs * 10_000) /
        DEFAULT_TUNABLES.gathering.offlineAccrualRateBasisPoints,
    );
    const maxTicks = Math.floor(DEFAULT_TUNABLES.gathering.offlineAccrualCapMs / interval);
    expect((result.value as HarvestPatch).ticksResolved).toBe(maxTicks);
  });
});

describe('gathering.stop', () => {
  it('settles what was earned before clearing the session', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(CRYSTAL.harvestIntervalMs * 6);

    const result = await h.dispatch('gathering.stop');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as HarvestPatch).ticksResolved).toBe(6);

    const state = await h.state();
    expect(state.gathering).toBeNull();
    expect(state.inventory.stacks.length).toBeGreaterThan(0);
  });
});

describe('crafting.craft', () => {
  it('refuses an unknown recipe', async () => {
    const h = harness();
    const result = await h.dispatch('crafting.craft', { recipeId: 'recipe.imaginary' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('crafting.unknown_recipe');
  });

  it('refuses without the ingredients, naming the reason', async () => {
    const h = harness();
    const result = await h.dispatch('crafting.craft', { recipeId: DUST_RECIPE.id });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The failure survives the router verbatim rather than becoming a
      // generic internal error, which is the whole point of the Result channel.
      const error = result.error as Failure;
      expect(['crafting.missing_ingredients', 'crafting.skill_too_low']).toContain(error.reason);
    }
  });

  it('consumes inputs and awards experience once the materials are gathered', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    // Long enough that the common shard drop covers the recipe several times.
    h.advance(CRYSTAL.harvestIntervalMs * 400);
    await h.dispatch('gathering.collect');

    const before = await h.state();
    const input = DUST_RECIPE.inputs[0]!;
    const held = before.inventory.stacks
      .filter((stack) => stack.definitionId === input.itemId)
      .reduce((sum, stack) => sum + stack.quantity, 0);
    expect(held).toBeGreaterThanOrEqual(input.quantity);

    const result = await h.dispatch('crafting.craft', { recipeId: DUST_RECIPE.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as { produced: number; wasted: number; xpGained: number };
    expect(patch.produced + patch.wasted).toBe(DUST_RECIPE.output.quantity);
    expect(patch.xpGained).toBe(DUST_RECIPE.xpPerCraft);

    const after = await h.state();
    const refining = asId<SkillId>(DUST_RECIPE.requiredSkillId);
    expect(after.skills[refining]!.xp).toBe(DUST_RECIPE.xpPerCraft);
  });
});

describe('concurrent writes', () => {
  it('does not lose a harvest to a simultaneous command', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(CRYSTAL.harvestIntervalMs * 8);

    // Both run against the same version; one must retry rather than clobber.
    const [a, b] = await Promise.all([h.dispatch('gathering.collect'), h.dispatch('player.sync')]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const state = await h.state();
    expect(state.skills[CRYSTAL.requiredSkillId]!.xp).toBe(8 * CRYSTAL.xpPerHarvest);
  });
});
