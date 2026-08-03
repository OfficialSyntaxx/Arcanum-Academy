import { describe, expect, it } from 'vitest';
import {
  CARD_CATALOG,
  DEFAULT_TUNABLES,
  asId,
  type PlayerId,
  type SessionId,
} from '@arcanum/shared';
import { Difficulty } from '@arcanum/sim';
import { RegistryCommandRouter } from '../net/gateway.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import { PlayerService } from '../domain/player-service.js';
import { registerDuelHandlers } from '../net/handlers/duel.js';
import { serialisePlayerState, PLAYER_SCHEMA_VERSION } from '../domain/player-state.js';
import type { Session } from '../session/session-store.js';

const PLAYER = asId<PlayerId>('duellist-1');
const combat = DEFAULT_TUNABLES.combat;
const SLOTS = DEFAULT_TUNABLES.gathering.baseInventorySlots;

function session(): Session {
  return {
    id: asId<SessionId>('session-1'),
    playerId: PLAYER,
    resumeToken: 'token',
    createdAtMs: 0,
    disconnectedAtMs: null,
    lastClientSeq: 0,
  };
}

function legalList(): string[] {
  const ids: string[] = [];
  for (const entry of CARD_CATALOG.cards.slice(0, 7)) {
    while (ids.length < combat.deckSize) {
      if (ids.filter((id) => id === entry.id).length >= combat.maxCopiesPerSpell) break;
      ids.push(entry.id);
    }
  }
  return ids;
}

function harness() {
  const clock = 1_000_000;
  const repository = new InMemoryPlayerRepository(() => clock);
  const players = new PlayerService({ repository, slotCapacity: SLOTS, now: () => clock });
  const router = new RegistryCommandRouter();
  registerDuelHandlers(router, {
    players,
    cards: CARD_CATALOG,
    tunables: DEFAULT_TUNABLES,
    now: () => clock,
  });
  return {
    players,
    repository,
    dispatch: (kind: string, payload: unknown = {}) => router.dispatch(session(), kind, payload),
    async state() {
      const loaded = await players.load(PLAYER);
      if (!loaded.ok) throw new Error(loaded.error.reason);
      return loaded.value;
    },
    async withDeck() {
      const loaded = await players.load(PLAYER);
      if (!loaded.ok) throw new Error(loaded.error.reason);
      await repository.save(
        {
          playerId: PLAYER,
          schemaVersion: PLAYER_SCHEMA_VERSION,
          data: {
            ...serialisePlayerState(loaded.value),
            decks: { 'deck.1': { id: 'deck.1', name: 'Test', cardDefinitionIds: legalList() } },
          },
        },
        1,
      );
    },
  };
}

interface DuelPatch {
  readonly turn: number;
  readonly active: number;
  readonly outcome: { winner: number | null; reason: string } | null;
  readonly you: { life: number; hand: readonly string[]; deck: number };
  readonly opponent: { life: number; handCount: number; deck: number };
}

describe('duel.start', () => {
  it('refuses a deck the player has not saved', async () => {
    const h = harness();
    const result = await h.dispatch('duel.start', { deckId: 'deck.absent' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('duel.unknown_deck');
  });

  it('opens a duel from a saved deck', async () => {
    const h = harness();
    await h.withDeck();
    const result = await h.dispatch('duel.start', { deckId: 'deck.1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as DuelPatch;
    expect(patch.turn).toBe(1);
    expect(patch.you.life).toBe(combat.startingLife);
    expect(patch.you.hand.length).toBeGreaterThan(0);
  });

  it('never sends the opponent hand, only its size', async () => {
    const h = harness();
    await h.withDeck();
    const result = await h.dispatch('duel.start', { deckId: 'deck.1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as DuelPatch & { opponent: Record<string, unknown> };
    // Sending it and trusting the interface not to draw it would put the game
    // one devtools panel away from being solved.
    expect(patch.opponent.hand).toBeUndefined();
    expect(patch.opponent.handCount).toBe(combat.openingHandSize);
  });

  it('refuses to open a second duel while one is running', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    const again = await h.dispatch('duel.start', { deckId: 'deck.1' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.reason).toBe('duel.already_running');
  });

  it('survives a reconnect, because the duel lives on the record', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    // No socket involved: a fresh load is what a resumed session performs.
    const resumed = await h.dispatch('duel.state');
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect((resumed.value as DuelPatch).turn).toBeGreaterThan(0);
  });
});

describe('duel.act', () => {
  it('refuses when no duel is running', async () => {
    const h = harness();
    const result = await h.dispatch('duel.act', { command: 'END_TURN' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('duel.not_running');
  });

  it('advances the duel and lets the opponent answer', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    const result = await h.dispatch('duel.act', { command: 'END_TURN' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as DuelPatch;
    // Control comes back to the player, or the duel finished in the meantime.
    expect(patch.active === 0 || patch.outcome !== null).toBe(true);
  });

  it('surfaces an illegal play as its real reason', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    const result = await h.dispatch('duel.act', { command: 'PLAY_CARD', handIndex: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('duel.no_such_card');
  });

  it('plays through to a finished duel', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    let outcome: DuelPatch['outcome'] = null;
    for (let turn = 0; turn < 200 && outcome === null; turn += 1) {
      const result = await h.dispatch('duel.act', { command: 'END_TURN' });
      if (!result.ok) break;
      outcome = (result.value as DuelPatch).outcome;
    }
    expect(outcome).not.toBeNull();
  });
});

describe('duel.forfeit', () => {
  it('gives the duel to the opponent and records why', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    const result = await h.dispatch('duel.forfeit');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const patch = result.value as DuelPatch;
    expect(patch.outcome).toMatchObject({ winner: 1, reason: 'ABANDONED' });
  });

  it('frees the player to start another duel', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1' });
    await h.dispatch('duel.forfeit');
    const again = await h.dispatch('duel.start', { deckId: 'deck.1' });
    expect(again.ok).toBe(true);
  });
});

describe('difficulty', () => {
  it('is recorded so the opponent plays the same way after a reconnect', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1', difficulty: Difficulty.Master });
    const state = await h.state();
    expect(state.duel?.difficulty).toBe(Difficulty.Master);
  });

  it('falls back to a sensible default rather than refusing an unknown one', async () => {
    const h = harness();
    await h.withDeck();
    await h.dispatch('duel.start', { deckId: 'deck.1', difficulty: 'IMPOSSIBLE' });
    const state = await h.state();
    expect(state.duel?.difficulty).toBe(Difficulty.Adept);
  });
});
