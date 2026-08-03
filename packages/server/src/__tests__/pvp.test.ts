import { describe, expect, it } from 'vitest';
import {
  CARD_CATALOG,
  DEFAULT_TUNABLES,
  asId,
  type CardDefinitionId,
  type PlayerId,
} from '@arcanum/shared';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import { InMemoryLiveDuelStore, PvpService } from '../domain/pvp.js';
import { STARTING_RATING, type Match } from '../domain/matchmaking.js';
import {
  createInitialState,
  parsePlayerState,
  serialisePlayerState,
  PLAYER_SCHEMA_VERSION,
} from '../domain/player-state.js';

const ALICE = asId<PlayerId>('alice');
const BOB = asId<PlayerId>('bob');
const combat = DEFAULT_TUNABLES.combat;
const SLOTS = DEFAULT_TUNABLES.gathering.baseInventorySlots;

function deck(): CardDefinitionId[] {
  const ids: CardDefinitionId[] = [];
  for (const entry of CARD_CATALOG.cards.slice(0, 7)) {
    while (ids.length < combat.deckSize) {
      if (ids.filter((id) => id === entry.id).length >= combat.maxCopiesPerSpell) break;
      ids.push(entry.id);
    }
  }
  return ids;
}

const match: Match = {
  id: 'match-1',
  participants: [ALICE, BOB],
  decks: { [ALICE]: 'deck.1', [BOB]: 'deck.1' },
  seed: 'pvp-seed',
  createdAtMs: 0,
};

async function harness() {
  const repository = new InMemoryPlayerRepository(() => 1_000);
  const duels = new InMemoryLiveDuelStore();
  const pvp = new PvpService({
    repository,
    duels,
    cards: CARD_CATALOG,
    tunables: combat,
    slotCapacity: SLOTS,
  });

  for (const playerId of [ALICE, BOB]) {
    await repository.create({
      playerId,
      schemaVersion: PLAYER_SCHEMA_VERSION,
      data: { ...serialisePlayerState(createInitialState(SLOTS, 0)), rating: STARTING_RATING },
    });
  }

  async function ratingOf(playerId: PlayerId) {
    const found = await repository.find(playerId);
    if (!found.ok || found.value === null) throw new Error('missing');
    const parsed = parsePlayerState(found.value, SLOTS);
    if (!parsed.ok) throw new Error('unparseable');
    return parsed.value.rating ?? STARTING_RATING;
  }

  return { repository, duels, pvp, ratingOf };
}

describe('opening a duel', () => {
  it('seats both players and starts on seat zero', async () => {
    const h = await harness();
    const opened = await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(h.pvp.seatOf(opened.value, ALICE)).toBe(0);
    expect(h.pvp.seatOf(opened.value, BOB)).toBe(1);
    expect(opened.value.state.active).toBe(0);
  });

  it('refuses when a deck is missing', async () => {
    const h = await harness();
    const opened = await h.pvp.open(match, { [ALICE]: deck() });
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.error.reason).toBe('pvp.deck_missing');
  });
});

describe('acting', () => {
  it('refuses a player acting out of turn', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    // Queuing it would resolve against a board Bob never saw.
    const result = await h.pvp.act(match.id, BOB, { kind: 'END_TURN' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('pvp.not_your_turn');
  });

  it('refuses a stranger entirely', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    const result = await h.pvp.act(match.id, asId<PlayerId>('mallory'), { kind: 'END_TURN' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('pvp.not_a_participant');
  });

  it('passes control to the other seat', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    const played = await h.pvp.act(match.id, ALICE, { kind: 'END_TURN' });
    expect(played.ok).toBe(true);
    if (played.ok) expect(played.value.state.active).toBe(1);
  });

  it('shares one state between both players rather than two copies', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    await h.pvp.act(match.id, ALICE, { kind: 'END_TURN' });
    await h.pvp.act(match.id, BOB, { kind: 'END_TURN' });
    const loaded = await h.duels.get(match.id);
    expect(loaded.ok).toBe(true);
    if (loaded.ok && loaded.value) expect(loaded.value.state.turn).toBe(3);
  });
});

describe('finishing', () => {
  it('gives the win and the rating to the opponent when a player concedes', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    const conceded = await h.pvp.act(match.id, ALICE, { kind: 'CONCEDE' });
    expect(conceded.ok).toBe(true);
    if (conceded.ok) expect(conceded.value.state.outcome?.winner).toBe(1);

    expect(await h.ratingOf(BOB)).toBeGreaterThan(STARTING_RATING);
    expect(await h.ratingOf(ALICE)).toBeLessThan(STARTING_RATING);
  });

  it('keeps the ladder zero-sum', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    await h.pvp.act(match.id, ALICE, { kind: 'CONCEDE' });
    // Inventing or destroying rating makes a ladder nobody trusts.
    expect((await h.ratingOf(ALICE)) + (await h.ratingOf(BOB))).toBe(STARTING_RATING * 2);
  });

  it('settles the ladder once, however many times it is asked', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    await h.pvp.act(match.id, ALICE, { kind: 'CONCEDE' });
    const after = await h.ratingOf(BOB);

    await h.pvp.abandon(match.id, ALICE);
    await h.pvp.act(match.id, ALICE, { kind: 'END_TURN' });
    expect(await h.ratingOf(BOB)).toBe(after);
  });

  it('refuses any further action once decided', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    await h.pvp.act(match.id, ALICE, { kind: 'CONCEDE' });
    const result = await h.pvp.act(match.id, BOB, { kind: 'END_TURN' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('pvp.already_decided');
  });

  it('awards an abandoned duel to whoever stayed', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    const ended = await h.pvp.abandon(match.id, BOB);
    expect(ended.ok).toBe(true);
    if (ended.ok)
      expect(ended.value.state.outcome).toMatchObject({ winner: 0, reason: 'ABANDONED' });
    expect(await h.ratingOf(ALICE)).toBeGreaterThan(STARTING_RATING);
  });

  it('stops reporting a finished duel as the player active one', async () => {
    const h = await harness();
    await h.pvp.open(match, { [ALICE]: deck(), [BOB]: deck() });
    await h.pvp.act(match.id, ALICE, { kind: 'CONCEDE' });
    const live = await h.duels.forPlayer(ALICE);
    expect(live.ok && live.value).toBeNull();
  });
});
