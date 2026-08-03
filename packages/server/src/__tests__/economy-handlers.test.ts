import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  NODE_CATALOG,
  RECIPE_BOOK,
  SKILL_TABLE,
  CARD_CATALOG,
  SCHOOL_TABLE,
  asId,
  type Failure,
  type ItemDefinitionId,
  type PlayerId,
  type SessionId,
  type SkillId,
  type CardInstanceId,
} from '@arcanum/shared';
import { RegistryCommandRouter } from '../net/gateway.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import { PlayerService } from '../domain/player-service.js';
import { InMemorySerialMinter } from '../domain/serial-minter.js';
import { registerEconomyHandlers } from '../net/handlers/economy.js';
import {
  parsePlayerState,
  serialisePlayerState,
  PLAYER_SCHEMA_VERSION,
} from '../domain/player-state.js';
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
  cards: CARD_CATALOG,
  schools: SCHOOL_TABLE,
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
  let instances = 0;
  const repository = new InMemoryPlayerRepository(() => clock);
  const players = new PlayerService({ repository, slotCapacity: SLOTS, now: () => clock });
  const router = new RegistryCommandRouter();
  registerEconomyHandlers(router, {
    players,
    catalogs: { ...SHIPPED_CATALOGS, ...catalogOverrides },
    serials: new InMemorySerialMinter(),
    newInstanceId: () => asId<CardInstanceId>(`card-instance-${(instances += 1)}`),
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
    // Measured over exactly the presence window, so the online arm is entitled
    // to every tick in it and the comparison is of rates rather than of how
    // far online collection is allowed to reach.
    const window = DEFAULT_TUNABLES.gathering.presenceGraceMs;
    const onlineTicks = Math.floor(window / CRYSTAL.harvestIntervalMs);

    const online = harness();
    await online.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    online.advance(window);
    const onlineResult = await online.dispatch('gathering.collect');

    const offline = harness();
    await offline.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    offline.advance(window);
    const offlineResult = await offline.dispatch('gathering.claimOffline');

    expect(onlineResult.ok && offlineResult.ok).toBe(true);
    if (!onlineResult.ok || !offlineResult.ok) return;
    expect((onlineResult.value as HarvestPatch).ticksResolved).toBe(onlineTicks);
    expect((offlineResult.value as HarvestPatch).ticksResolved).toBe(onlineTicks / 4);
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

describe('presence', () => {
  it('does not pay the online rate for time the player was away', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });

    // Eight hours with no contact, then a collect. Being away must not be
    // worth the same as being present, whichever command the client sends.
    h.advance(8 * 60 * 60 * 1000);
    const result = await h.dispatch('gathering.collect');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const grace = DEFAULT_TUNABLES.gathering.presenceGraceMs;
    const reachable = Math.floor(grace / CRYSTAL.harvestIntervalMs) + 1;
    expect((result.value as HarvestPatch).ticksResolved).toBeLessThanOrEqual(reachable);
  });

  it('pays that same window through the offline claim instead', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(8 * 60 * 60 * 1000);

    const claimed = await h.dispatch('gathering.claimOffline');
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect((claimed.value as HarvestPatch).ticksResolved).toBeGreaterThan(100);
  });

  it('leaves a continuously present player collecting at the full rate', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });

    // Collecting keeps presence fresh, which is what a running client does.
    let total = 0;
    for (let round = 0; round < 4; round += 1) {
      h.advance(CRYSTAL.harvestIntervalMs * 5);
      const result = await h.dispatch('gathering.collect');
      if (!result.ok) throw new Error(result.error.reason);
      total += (result.value as HarvestPatch).ticksResolved;
    }
    expect(total).toBe(20);
  });

  it('has nothing to claim while the player never left', async () => {
    const h = harness();
    await h.dispatch('gathering.start', { interactableId: CRYSTAL.interactableId });
    h.advance(CRYSTAL.harvestIntervalMs * 5);
    await h.dispatch('gathering.collect');

    const claimed = await h.dispatch('gathering.claimOffline');
    expect(claimed.ok).toBe(false);
    if (!claimed.ok) expect(claimed.error.reason).toBe('gathering.nothing_to_claim');
  });
});

describe('scribing.scribe', () => {
  const CHEAP = CARD_CATALOG.cards.find(
    (entry) => entry.scribeSkillLevel === 1 && entry.scribeInputs.length === 1,
  )!;

  /** Fills the satchel directly, so scribing is tested without a long harvest. */
  async function stocked(h: ReturnType<typeof harness>) {
    await h.dispatch('player.sync');
    const state = await h.state();
    const stacks = CHEAP.scribeInputs.map((input) => ({
      definitionId: input.itemId,
      quantity: input.quantity * 5,
    }));
    await h.repository.save(
      {
        playerId: PLAYER,
        schemaVersion: PLAYER_SCHEMA_VERSION,
        data: {
          ...serialisePlayerState(state),
          inventory: { stacks, slotCapacity: SLOTS },
          skills: { 'skill.scribing': { level: 1, xp: 0 } },
        },
      },
      1,
    );
  }

  it('refuses a card nobody defined', async () => {
    const h = harness();
    const result = await h.dispatch('scribing.scribe', { cardId: 'card.imaginary' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('scribing.unknown_card');
  });

  it('refuses without the materials', async () => {
    const h = harness();
    const result = await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('scribing.missing_materials');
  });

  it('consumes materials and adds a graded card to the collection', async () => {
    const h = harness();
    await stocked(h);

    const result = await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const patch = result.value as { scribed: { grade: number; definitionId: string } };
    expect(patch.scribed.definitionId).toBe(CHEAP.id);
    expect(patch.scribed.grade).toBeGreaterThanOrEqual(DEFAULT_TUNABLES.grading.minGrade);
    expect(patch.scribed.grade).toBeLessThanOrEqual(DEFAULT_TUNABLES.grading.maxGrade);

    const state = await h.state();
    expect(state.cards).toHaveLength(1);
    const held = state.inventory.stacks
      .filter((stack) => stack.definitionId === CHEAP.scribeInputs[0]!.itemId)
      .reduce((sum, stack) => sum + stack.quantity, 0);
    expect(held).toBe(CHEAP.scribeInputs[0]!.quantity * 4);
  });

  it('records the tunables version the grade was rolled under', async () => {
    const h = harness();
    await stocked(h);
    await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    const state = await h.state();
    expect(state.cards[0]!.gradedUnderTunablesVersion).toBe(DEFAULT_TUNABLES.version);
  });

  it('awards scribing experience', async () => {
    const h = harness();
    await stocked(h);
    await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    const state = await h.state();
    expect(state.skills['skill.scribing']!.xp).toBeGreaterThan(0);
  });

  it('mints a serial only when the grade earns a slab', async () => {
    const h = harness();
    await stocked(h);
    await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    const card = (await h.state()).cards[0]!;
    // A novice cannot slab, so this card must carry no serial at all - an
    // unslabbed card with a serial would be a claim of scarcity it never earned.
    expect(DEFAULT_TUNABLES.grading.slabThreshold).toBeGreaterThan(card.grade);
    expect(card.serial).toBeNull();
  });

  it('gives every scribed card a distinct instance id', async () => {
    const h = harness();
    await stocked(h);
    await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    await h.dispatch('scribing.scribe', { cardId: CHEAP.id });
    const state = await h.state();
    expect(state.cards).toHaveLength(2);
    expect(state.cards[0]!.instanceId).not.toBe(state.cards[1]!.instanceId);
  });
});

describe('deck.save', () => {
  const SPELL = CARD_CATALOG.cards[0]!;

  /** Puts `copies` of each named card straight into the collection. */
  async function withCollection(h: ReturnType<typeof harness>, entries: [string, number][]) {
    await h.dispatch('player.sync');
    const state = await h.state();
    const cards = entries.flatMap(([definitionId, copies]) =>
      Array.from({ length: copies }, (_unused, n) => ({
        instanceId: `${definitionId}-${n}`,
        definitionId,
        grade: 5,
        foil: false,
        serial: null,
        scribedBy: PLAYER,
        scribedAtMs: 0,
        gradedUnderTunablesVersion: DEFAULT_TUNABLES.version,
      })),
    );
    await h.repository.save(
      {
        playerId: PLAYER,
        schemaVersion: PLAYER_SCHEMA_VERSION,
        data: { ...serialisePlayerState(state), cards },
      },
      1,
    );
  }

  /** Twenty cards drawn from seven distinct spells, three copies each bar one. */
  function legalList(): string[] {
    const pool = CARD_CATALOG.cards.slice(0, 7).map((entry) => entry.id);
    const ids: string[] = [];
    for (const id of pool) {
      while (ids.length < DEFAULT_TUNABLES.combat.deckSize) {
        const used = ids.filter((entry) => entry === id).length;
        if (used >= DEFAULT_TUNABLES.combat.maxCopiesPerSpell) break;
        ids.push(id);
      }
    }
    return ids;
  }

  it('refuses a deck that is not exactly the required size', async () => {
    const h = harness();
    const result = await h.dispatch('deck.save', {
      deckId: 'deck.1',
      name: 'Short',
      cardDefinitionIds: [SPELL.id],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('deck.illegal');
  });

  it('refuses more copies of a spell than the limit permits', async () => {
    const h = harness();
    const result = await h.dispatch('deck.save', {
      deckId: 'deck.1',
      name: 'Stacked',
      cardDefinitionIds: new Array(DEFAULT_TUNABLES.combat.deckSize).fill(SPELL.id),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('at most');
  });

  it('refuses cards the player has never scribed', async () => {
    const h = harness();
    await withCollection(h, []);
    const result = await h.dispatch('deck.save', {
      deckId: 'deck.1',
      name: 'Borrowed',
      cardDefinitionIds: legalList(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('deck.cards_not_owned');
  });

  it('counts copies owned, so one card is never three', async () => {
    const h = harness();
    // One copy of each spell, but the deck asks for three of some.
    await withCollection(
      h,
      CARD_CATALOG.cards.slice(0, 7).map((entry) => [entry.id, 1] as [string, number]),
    );
    const result = await h.dispatch('deck.save', {
      deckId: 'deck.1',
      name: 'Wishful',
      cardDefinitionIds: legalList(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('deck.cards_not_owned');
  });

  it('saves a legal deck the player owns', async () => {
    const h = harness();
    await withCollection(
      h,
      CARD_CATALOG.cards.slice(0, 7).map((entry) => [entry.id, 3] as [string, number]),
    );
    const result = await h.dispatch('deck.save', {
      deckId: 'deck.1',
      name: 'First Twenty',
      cardDefinitionIds: legalList(),
    });
    expect(result.ok).toBe(true);

    const state = await h.state();
    expect(state.decks['deck.1']!.name).toBe('First Twenty');
    expect(state.decks['deck.1']!.cardDefinitionIds).toHaveLength(DEFAULT_TUNABLES.combat.deckSize);
  });
});
