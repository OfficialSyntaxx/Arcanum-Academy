import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  asId,
  type CardDefinitionId,
  type CardInstance,
  type CardInstanceId,
  type ItemDefinitionId,
  type PlayerId,
} from '@arcanum/shared';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import { InMemoryTradeStore, TradingService, TradeState } from '../domain/trading.js';
import {
  createInitialState,
  parsePlayerState,
  serialisePlayerState,
  PLAYER_SCHEMA_VERSION,
} from '../domain/player-state.js';

const ALICE = asId<PlayerId>('alice');
const BOB = asId<PlayerId>('bob');
const SHARD = asId<ItemDefinitionId>('item.crystal.shard');
const CAP = asId<ItemDefinitionId>('item.mushroom.cap');
const SLOTS = DEFAULT_TUNABLES.gathering.baseInventorySlots;

function card(id: string, owner: PlayerId): CardInstance {
  return {
    instanceId: asId<CardInstanceId>(id),
    definitionId: asId<CardDefinitionId>('card.stone.shardward'),
    grade: 7,
    foil: false,
    serial: null,
    scribedBy: owner,
    scribedAtMs: 0,
    gradedUnderTunablesVersion: DEFAULT_TUNABLES.version,
  };
}

async function harness() {
  const repository = new InMemoryPlayerRepository(() => 1_000);
  const trades = new InMemoryTradeStore();
  const trading = new TradingService({
    repository,
    trades,
    catalog: ITEM_CATALOG,
    slotCapacity: SLOTS,
    now: () => 1_000,
  });

  async function seed(
    playerId: PlayerId,
    stacks: { definitionId: ItemDefinitionId; quantity: number }[],
    cards: CardInstance[],
  ) {
    const base = createInitialState(SLOTS, 0);
    await repository.create({
      playerId,
      schemaVersion: PLAYER_SCHEMA_VERSION,
      data: {
        ...serialisePlayerState(base),
        inventory: { stacks, slotCapacity: SLOTS },
        cards,
      },
    });
  }

  async function state(playerId: PlayerId) {
    const found = await repository.find(playerId);
    if (!found.ok || found.value === null) throw new Error('missing');
    const parsed = parsePlayerState(found.value, SLOTS);
    if (!parsed.ok) throw new Error('unparseable');
    return parsed.value;
  }

  function held(
    inventory: { stacks: readonly { definitionId: string; quantity: number }[] },
    id: string,
  ) {
    return inventory.stacks
      .filter((stack) => stack.definitionId === id)
      .reduce((sum, stack) => sum + stack.quantity, 0);
  }

  await seed(ALICE, [{ definitionId: SHARD, quantity: 10 }], [card('a-card', ALICE)]);
  await seed(BOB, [{ definitionId: CAP, quantity: 6 }], []);

  return { repository, trades, trading, state, held };
}

describe('opening a trade', () => {
  it('refuses trading with yourself', async () => {
    const h = await harness();
    const result = await h.trading.open(ALICE, ALICE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('trade.self_trade');
  });

  it('refuses a second trade while one is open', async () => {
    const h = await harness();
    await h.trading.open(ALICE, BOB);
    const again = await h.trading.open(ALICE, BOB);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.reason).toBe('trade.already_trading');
  });
});

describe('offering', () => {
  it('moves assets out of the satchel and into escrow', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    const offered = await h.trading.offer(
      opened.value.id,
      ALICE,
      [{ definitionId: SHARD, quantity: 4 }],
      [],
    );
    expect(offered.ok).toBe(true);

    // Gone from the satchel: an asset is in one place or the other, never both.
    const alice = await h.state(ALICE);
    expect(h.held(alice.inventory, SHARD)).toBe(6);
  });

  it('refuses to offer more than is held, changing nothing', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    const offered = await h.trading.offer(
      opened.value.id,
      ALICE,
      [{ definitionId: SHARD, quantity: 99 }],
      [],
    );
    expect(offered.ok).toBe(false);
    const alice = await h.state(ALICE);
    expect(h.held(alice.inventory, SHARD)).toBe(10);
  });

  it('refuses a card the player does not own', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');
    const offered = await h.trading.offer(opened.value.id, ALICE, [], ['not-mine']);
    expect(offered.ok).toBe(false);
    if (!offered.ok) expect(offered.error.reason).toBe('trade.card_not_owned');
  });

  it('replaces a previous offer rather than accumulating it', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    await h.trading.offer(opened.value.id, ALICE, [{ definitionId: SHARD, quantity: 4 }], []);
    await h.trading.offer(opened.value.id, ALICE, [{ definitionId: SHARD, quantity: 2 }], []);

    // Offering twice must not quietly escrow six.
    const alice = await h.state(ALICE);
    expect(h.held(alice.inventory, SHARD)).toBe(8);
  });

  it('returns an escrowed card when the offer is replaced', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    await h.trading.offer(opened.value.id, ALICE, [], ['a-card']);
    expect((await h.state(ALICE)).cards).toHaveLength(0);

    await h.trading.offer(opened.value.id, ALICE, [], []);
    expect((await h.state(ALICE)).cards).toHaveLength(1);
  });

  it('clears both confirmations when the terms change', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    await h.trading.offer(opened.value.id, ALICE, [{ definitionId: SHARD, quantity: 1 }], []);
    await h.trading.confirm(opened.value.id, BOB);
    // Confirming and then watching the other side swap a slab for a shard must
    // not be binding.
    const changed = await h.trading.offer(
      opened.value.id,
      ALICE,
      [{ definitionId: SHARD, quantity: 2 }],
      [],
    );
    expect(changed.ok).toBe(true);
    if (changed.ok) expect(changed.value.offers[BOB]!.confirmed).toBe(false);
  });
});

describe('settling', () => {
  it('crosses both escrows over on the second confirmation', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    await h.trading.offer(
      opened.value.id,
      ALICE,
      [{ definitionId: SHARD, quantity: 4 }],
      ['a-card'],
    );
    await h.trading.offer(opened.value.id, BOB, [{ definitionId: CAP, quantity: 3 }], []);
    await h.trading.confirm(opened.value.id, ALICE);
    const settled = await h.trading.confirm(opened.value.id, BOB);

    expect(settled.ok).toBe(true);
    if (settled.ok) expect(settled.value.state).toBe(TradeState.Settled);

    const alice = await h.state(ALICE);
    const bob = await h.state(BOB);
    expect(h.held(alice.inventory, SHARD)).toBe(6);
    expect(h.held(alice.inventory, CAP)).toBe(3);
    expect(h.held(bob.inventory, CAP)).toBe(3);
    expect(h.held(bob.inventory, SHARD)).toBe(4);
    expect(bob.cards.map((entry) => entry.instanceId)).toEqual(['a-card']);
    expect(alice.cards).toHaveLength(0);
  });

  it('conserves every asset across the trade', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    await h.trading.offer(opened.value.id, ALICE, [{ definitionId: SHARD, quantity: 7 }], []);
    await h.trading.offer(opened.value.id, BOB, [{ definitionId: CAP, quantity: 6 }], []);
    await h.trading.confirm(opened.value.id, ALICE);
    await h.trading.confirm(opened.value.id, BOB);

    const alice = await h.state(ALICE);
    const bob = await h.state(BOB);
    // Duplication is the failure that matters: totals must not change.
    expect(h.held(alice.inventory, SHARD) + h.held(bob.inventory, SHARD)).toBe(10);
    expect(h.held(alice.inventory, CAP) + h.held(bob.inventory, CAP)).toBe(6);
  });

  it('does not settle on one confirmation alone', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');
    await h.trading.offer(opened.value.id, ALICE, [{ definitionId: SHARD, quantity: 1 }], []);
    const confirmed = await h.trading.confirm(opened.value.id, ALICE);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.value.state).toBe(TradeState.Open);
    expect(h.held((await h.state(BOB)).inventory, SHARD)).toBe(0);
  });
});

describe('cancelling', () => {
  it('returns every escrowed asset to its owner', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');

    await h.trading.offer(
      opened.value.id,
      ALICE,
      [{ definitionId: SHARD, quantity: 5 }],
      ['a-card'],
    );
    await h.trading.offer(opened.value.id, BOB, [{ definitionId: CAP, quantity: 2 }], []);
    const cancelled = await h.trading.cancel(opened.value.id, BOB);

    expect(cancelled.ok).toBe(true);
    const alice = await h.state(ALICE);
    const bob = await h.state(BOB);
    expect(h.held(alice.inventory, SHARD)).toBe(10);
    expect(alice.cards).toHaveLength(1);
    expect(h.held(bob.inventory, CAP)).toBe(6);
  });

  it('frees both players to trade again', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');
    await h.trading.cancel(opened.value.id, ALICE);
    const again = await h.trading.open(ALICE, BOB);
    expect(again.ok).toBe(true);
  });

  it('refuses a stranger acting on a trade', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');
    const result = await h.trading.cancel(opened.value.id, asId<PlayerId>('mallory'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('trade.not_a_participant');
  });
});

describe('the ledger', () => {
  it('records every step, so a dispute is answerable', async () => {
    const h = await harness();
    const opened = await h.trading.open(ALICE, BOB);
    if (!opened.ok) throw new Error('open failed');
    await h.trading.offer(opened.value.id, ALICE, [{ definitionId: SHARD, quantity: 1 }], []);
    await h.trading.confirm(opened.value.id, ALICE);
    const settled = await h.trading.confirm(opened.value.id, BOB);

    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const ledger = settled.value.ledger.join('\n');
    expect(ledger).toContain('opened');
    expect(ledger).toContain('offered');
    expect(ledger).toContain('confirmed');
    expect(ledger).toContain('settled');
  });
});
