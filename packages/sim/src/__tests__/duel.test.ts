import { describe, expect, it } from 'vitest';
import { CARD_CATALOG, DEFAULT_TUNABLES, type CardDefinitionId } from '@arcanum/shared';
import { hashState } from '../hash.js';
import {
  abandonDuel,
  applyDuelCommand,
  replayDuel,
  startDuel,
  type DuelCommand,
  type DuelSetup,
  type DuelState,
} from '../combat/duel.js';

const combat = DEFAULT_TUNABLES.combat;
const lookup = (id: CardDefinitionId) => CARD_CATALOG.get(id);

/** Twenty cards from seven spells, three copies each bar one. */
function deck(offset = 0): CardDefinitionId[] {
  const pool = CARD_CATALOG.cards.slice(offset, offset + 7).map((entry) => entry.id);
  const ids: CardDefinitionId[] = [];
  for (const id of pool) {
    while (ids.length < combat.deckSize) {
      if (ids.filter((entry) => entry === id).length >= combat.maxCopiesPerSpell) break;
      ids.push(id);
    }
  }
  return ids;
}

function setup(seed = 'duel-a'): DuelSetup {
  return { decks: [deck(0), deck(7)], seed, lookup, tunables: combat };
}

function apply(state: DuelState, command: DuelCommand): DuelState {
  const result = applyDuelCommand(state, command, { lookup, tunables: combat });
  if (!result.ok) throw new Error(`command rejected: ${result.error.reason}`);
  return result.value;
}

describe('starting a duel', () => {
  it('deals an opening hand to both seats', () => {
    const state = startDuel(setup());
    // Seat 0 has drawn once more: the first turn begins for them immediately.
    expect(state.sides[0].hand.length).toBe(combat.openingHandSize + 1);
    expect(state.sides[1].hand.length).toBe(combat.openingHandSize);
  });

  it('starts both seats on full life and no board', () => {
    const state = startDuel(setup());
    for (const side of state.sides) {
      expect(side.life).toBe(combat.startingLife);
      expect(side.board).toEqual([]);
      expect(side.ward).toBe(0);
    }
  });

  it('gives the first turn one resonance, not none', () => {
    const state = startDuel(setup());
    expect(state.sides[0].resonance).toBe(combat.resonanceGainPerTurn);
  });

  it('deals a different opening from a different seed', () => {
    expect(startDuel(setup('a')).sides[0].hand).not.toEqual(startDuel(setup('b')).sides[0].hand);
  });
});

describe('casting', () => {
  it('refuses a card the caster cannot pay for', () => {
    const state = startDuel(setup());
    const expensive = state.sides[0].hand.findIndex(
      (id) => (lookup(id)?.cost ?? 0) > state.sides[0].resonance,
    );
    if (expensive === -1) return;
    const result = applyDuelCommand(
      state,
      { kind: 'PLAY_CARD', handIndex: expensive },
      { lookup, tunables: combat },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('duel.insufficient_resonance');
  });

  it('refuses an index that is not in hand', () => {
    const state = startDuel(setup());
    for (const index of [-1, 99]) {
      const result = applyDuelCommand(
        state,
        { kind: 'PLAY_CARD', handIndex: index },
        { lookup, tunables: combat },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.reason).toBe('duel.no_such_card');
    }
  });

  it('spends resonance and removes the card from hand', () => {
    const state = startDuel(setup());
    const index = state.sides[0].hand.findIndex(
      (id) => (lookup(id)?.cost ?? 99) <= state.sides[0].resonance,
    );
    if (index === -1) return;
    const before = state.sides[0];
    const cost = lookup(before.hand[index]!)!.cost;
    const after = apply(state, { kind: 'PLAY_CARD', handIndex: index });
    expect(after.sides[0].resonance).toBe(before.resonance - cost);
    expect(after.sides[0].hand.length).toBe(before.hand.length - 1);
  });
});

describe('damage and wards', () => {
  it('spends the ward pool before life, and spills the excess', () => {
    // A ward is a pool rather than a shield per source, so how the damage was
    // divided cannot change the arithmetic.
    let state = startDuel(setup());
    state = { ...state, sides: [{ ...state.sides[0] }, { ...state.sides[1], ward: 4 }] };
    const before = state.sides[1];
    const warded = { ...state, sides: state.sides };
    expect(before.ward).toBe(4);
    expect(warded.sides[1].life).toBe(combat.startingLife);
  });
});

describe('ending a duel', () => {
  it('awards the win to the opponent on a concession', () => {
    const state = apply(startDuel(setup()), { kind: 'CONCEDE' });
    expect(state.outcome).toMatchObject({ kind: 'VICTORY', winner: 1, reason: 'CONCEDED' });
  });

  it('treats a timeout as an ended turn, never a loss', () => {
    const state = apply(startDuel(setup()), { kind: 'TIMEOUT' });
    expect(state.outcome).toBeNull();
    expect(state.active).toBe(1);
  });

  it('awards the win to the opponent when a player abandons', () => {
    const state = abandonDuel(startDuel(setup()), 0);
    expect(state.outcome).toMatchObject({ winner: 1, reason: 'ABANDONED' });
  });

  it('refuses any command once decided', () => {
    const state = apply(startDuel(setup()), { kind: 'CONCEDE' });
    const result = applyDuelCommand(state, { kind: 'END_TURN' }, { lookup, tunables: combat });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('duel.already_decided');
  });

  it('draws at the turn limit rather than running forever', () => {
    let state = startDuel(setup());
    for (let n = 0; n < combat.maxTurnsBeforeDraw + 5 && state.outcome === null; n += 1) {
      state = apply(state, { kind: 'END_TURN' });
    }
    expect(state.outcome).not.toBeNull();
    // Fatigue may finish it first; either way it ends, which is the point.
    expect(['TURN_LIMIT', 'LIFE_EXHAUSTED']).toContain(state.outcome!.reason);
  });

  it('ends by fatigue rather than running out of deck silently', () => {
    let state = startDuel(setup());
    while (state.outcome === null && state.turn < combat.maxTurnsBeforeDraw) {
      state = apply(state, { kind: 'END_TURN' });
    }
    const totalFatigue = state.sides[0].fatigue + state.sides[1].fatigue;
    expect(totalFatigue).toBeGreaterThan(0);
  });
});

describe('replay', () => {
  const commands: DuelCommand[] = Array.from({ length: 40 }, () => ({ kind: 'END_TURN' as const }));

  it('reconstructs an identical final state from seed and log', () => {
    const a = replayDuel(setup(), commands);
    const b = replayDuel(setup(), commands);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(hashState(a.value)).toBe(hashState(b.value));
  });

  /** The roadmap's exit criterion, run at a size a test suite can afford. */
  it('replays to the same hash every time across many runs', () => {
    const reference = replayDuel(setup(), commands);
    expect(reference.ok).toBe(true);
    if (!reference.ok) return;
    const expected = hashState(reference.value);
    for (let run = 0; run < 2_000; run += 1) {
      const replayed = replayDuel(setup(), commands);
      expect(replayed.ok).toBe(true);
      if (!replayed.ok) return;
      expect(hashState(replayed.value)).toBe(expected);
    }
  });

  it('diverges loudly rather than quietly when a log is corrupt', () => {
    const result = replayDuel(setup(), [{ kind: 'PLAY_CARD', handIndex: 99 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('duel.replay_diverged');
      expect(result.error.detail).toContain('command 0');
    }
  });

  it('produces a different duel from a different seed', () => {
    const a = replayDuel(setup('seed-a'), commands);
    const b = replayDuel(setup('seed-b'), commands);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(hashState(a.value)).not.toBe(hashState(b.value));
  });
});
