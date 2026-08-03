import { describe, expect, it } from 'vitest';
import {
  CARD_CATALOG,
  CONTENT_SCHEMA_VERSION,
  DEFAULT_TUNABLES,
  Rng,
  type CardDefinitionId,
} from '@arcanum/shared';
import { hashState } from '../hash.js';
import { applyDuelCommand, startDuel, type DuelCommand, type DuelSetup } from '../combat/duel.js';
import { Difficulty, chooseDuelCommand, playAiTurn } from '../combat/ai.js';
import { recordReplay, verifyReplay, REPLAY_FORMAT_VERSION } from '../combat/replay.js';

const combat = DEFAULT_TUNABLES.combat;
const lookup = (id: CardDefinitionId) => CARD_CATALOG.get(id);

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

function setup(seed = 'ai-duel'): DuelSetup {
  return { decks: [deck(0), deck(7)], seed, lookup, tunables: combat };
}

function context(difficulty: Difficulty, seed = 'ai') {
  return { lookup, tunables: combat, difficulty, rng: Rng.fromSeed(seed) };
}

/** Plays a whole duel between two AIs, returning the finished state and log. */
function playOut(difficulty: Difficulty, seed = 'ai-duel') {
  let state = startDuel(setup(seed));
  const commands: DuelCommand[] = [];
  let guard = 0;

  while (state.outcome === null && guard < 400) {
    guard += 1;
    const seat = state.active;
    const command = chooseDuelCommand(state, seat, context(difficulty, `${seed}:${guard}`));
    const applied = applyDuelCommand(state, command, { lookup, tunables: combat });
    if (!applied.ok) break;
    commands.push(command);
    state = applied.value;
  }
  return { state, commands };
}

describe('AI decisions', () => {
  it('is deterministic: the same state and seed choose the same command', () => {
    const state = startDuel(setup());
    for (const difficulty of Object.values(Difficulty)) {
      const a = chooseDuelCommand(state, 0, context(difficulty, 'fixed'));
      const b = chooseDuelCommand(state, 0, context(difficulty, 'fixed'));
      expect(a).toEqual(b);
    }
  });

  it('never proposes a command the rules refuse', () => {
    for (const difficulty of Object.values(Difficulty)) {
      let state = startDuel(setup(`legal-${difficulty}`));
      for (let step = 0; step < 120 && state.outcome === null; step += 1) {
        const command = chooseDuelCommand(state, state.active, context(difficulty, `s${step}`));
        const applied = applyDuelCommand(state, command, { lookup, tunables: combat });
        expect(applied.ok, `${difficulty} proposed an illegal ${command.kind}`).toBe(true);
        if (!applied.ok) break;
        state = applied.value;
      }
    }
  });

  it('passes rather than stalling when it can afford nothing', () => {
    const state = startDuel(setup());
    // Resonance at zero: nothing in hand is payable.
    const broke = {
      ...state,
      sides: [{ ...state.sides[0], resonance: 0 }, state.sides[1]] as typeof state.sides,
    };
    for (const difficulty of Object.values(Difficulty)) {
      expect(chooseDuelCommand(broke, 0, context(difficulty)).kind).toBe('END_TURN');
    }
  });

  it('takes a kill when one is on the table', () => {
    const state = startDuel(setup());
    const dying = {
      ...state,
      sides: [
        { ...state.sides[0], resonance: combat.maxResonance },
        { ...state.sides[1], life: 1, ward: 0 },
      ] as typeof state.sides,
    };
    for (const difficulty of [Difficulty.Adept, Difficulty.Master]) {
      const command = chooseDuelCommand(dying, 0, context(difficulty));
      // Only meaningful if something in hand actually deals damage.
      const damaging = dying.sides[0].hand.some((id) =>
        lookup(id)?.effects.some(
          (effect) => effect.kind === 'DAMAGE' && effect.target === 'OPPONENT',
        ),
      );
      if (damaging) expect(command.kind).toBe('PLAY_CARD');
    }
  });

  it('ends a turn rather than looping forever', () => {
    const state = startDuel(setup());
    const after = playAiTurn(state, 0, context(Difficulty.Master));
    expect(after.active === 1 || after.outcome !== null).toBe(true);
  });

  it('finishes a whole duel at every difficulty', () => {
    for (const difficulty of Object.values(Difficulty)) {
      const { state } = playOut(difficulty, `finish-${difficulty}`);
      expect(state.outcome, `${difficulty} left the duel unresolved`).not.toBeNull();
    }
  });

  it('makes a master beat a novice over a run of duels', () => {
    // Not a certainty - the shuffle decides some duels - but a difficulty that
    // is not actually harder is a difficulty in name only.
    let masterWins = 0;
    const rounds = 12;
    for (let round = 0; round < rounds; round += 1) {
      let state = startDuel(setup(`ladder-${round}`));
      let guard = 0;
      while (state.outcome === null && guard < 400) {
        guard += 1;
        const seat = state.active;
        const difficulty = seat === 0 ? Difficulty.Master : Difficulty.Novice;
        state = playAiTurn(state, seat, context(difficulty, `${round}:${guard}`));
      }
      if (state.outcome?.winner === 0) masterWins += 1;
    }
    expect(masterWins).toBeGreaterThan(rounds / 2);
  });
});

describe('replays', () => {
  function record(seed = 'replay-duel') {
    const { commands } = playOut(Difficulty.Adept, seed);
    return recordReplay({
      setup: setup(seed),
      commands,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      tunablesVersion: DEFAULT_TUNABLES.version,
    });
  }

  it('records the seed, log and both versions', () => {
    const recorded = record();
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(recorded.value.formatVersion).toBe(REPLAY_FORMAT_VERSION);
    expect(recorded.value.contentSchemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(recorded.value.tunablesVersion).toBe(DEFAULT_TUNABLES.version);
    expect(recorded.value.finalStateHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('verifies against the build it was played on', () => {
    const recorded = record();
    if (!recorded.ok) throw new Error('record should succeed');
    const verified = verifyReplay({
      replay: recorded.value,
      lookup,
      tunables: combat,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      tunablesVersion: DEFAULT_TUNABLES.version,
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(hashState(verified.value)).toBe(recorded.value.finalStateHash);
  });

  it('refuses a replay from different balance rather than guessing', () => {
    const recorded = record();
    if (!recorded.ok) throw new Error('record should succeed');
    const verified = verifyReplay({
      replay: recorded.value,
      lookup,
      tunables: combat,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      tunablesVersion: DEFAULT_TUNABLES.version + 1,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error.reason).toBe('replay.tunables_mismatch');
  });

  it('refuses a replay from different content', () => {
    const recorded = record();
    if (!recorded.ok) throw new Error('record should succeed');
    const verified = verifyReplay({
      replay: recorded.value,
      lookup,
      tunables: combat,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION + 1,
      tunablesVersion: DEFAULT_TUNABLES.version,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error.reason).toBe('replay.content_mismatch');
  });

  it('catches a tampered final hash', () => {
    const recorded = record();
    if (!recorded.ok) throw new Error('record should succeed');
    const verified = verifyReplay({
      replay: { ...recorded.value, finalStateHash: 'deadbeef' },
      lookup,
      tunables: combat,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      tunablesVersion: DEFAULT_TUNABLES.version,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error.reason).toBe('replay.hash_mismatch');
  });

  it('catches a command log altered mid-duel', () => {
    const recorded = record();
    if (!recorded.ok) throw new Error('record should succeed');
    // Conceding first changes the whole duel, so the recorded hash cannot hold.
    const verified = verifyReplay({
      replay: {
        ...recorded.value,
        commands: [{ kind: 'CONCEDE' }, ...recorded.value.commands],
      },
      lookup,
      tunables: combat,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      tunablesVersion: DEFAULT_TUNABLES.version,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error.reason).toBe('replay.hash_mismatch');
  });

  it('ignores commands appended after the duel was already decided', () => {
    // Not tampering: once an outcome exists nothing can change it, so a client
    // command that raced the final blow is harmless rather than a corrupt log.
    const recorded = record();
    if (!recorded.ok) throw new Error('record should succeed');
    const verified = verifyReplay({
      replay: { ...recorded.value, commands: [...recorded.value.commands, { kind: 'CONCEDE' }] },
      lookup,
      tunables: combat,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      tunablesVersion: DEFAULT_TUNABLES.version,
    });
    expect(verified.ok).toBe(true);
  });
});

/**
 * The roadmap asks for automated rules coverage of every card in the set.
 *
 * Rather than a bespoke test per card, each is cast in a controlled duel and
 * its stated effects are checked against what actually changed. A card added
 * without working effects fails here without anyone remembering to write a
 * test for it.
 */
describe('every card resolves', () => {
  for (const definition of CARD_CATALOG.cards) {
    it(`resolves ${definition.id}`, () => {
      const base = startDuel(setup(`card-${definition.id}`));
      const primed = {
        ...base,
        sides: [
          {
            ...base.sides[0],
            resonance: combat.maxResonance,
            resonanceCeiling: combat.maxResonance,
            hand: [definition.id],
            life: combat.startingLife,
          },
          { ...base.sides[1], life: 40, ward: 0, board: [] },
        ] as typeof base.sides,
      };

      const played = applyDuelCommand(
        primed,
        { kind: 'PLAY_CARD', handIndex: 0 },
        { lookup, tunables: combat },
      );
      expect(played.ok, `${definition.id} could not be cast`).toBe(true);
      if (!played.ok) return;

      const before = primed.sides;
      const after = played.value.sides;

      // A card may both cost resonance and give some back, and the total is
      // capped at the ceiling reached so far.
      const gained = definition.effects
        .filter(
          (effect) =>
            effect.kind === 'RESONANCE_GAIN' &&
            effect.target === 'SELF' &&
            effect.condition === undefined &&
            effect.scale === undefined,
        )
        .reduce((sum, effect) => sum + effect.magnitude, 0);
      const expectedResonance = Math.min(
        before[0].resonance - definition.cost + (definition.type === 'CONSTRUCT' ? 0 : gained),
        before[0].resonanceCeiling,
      );
      expect(after[0].resonance).toBe(expectedResonance);

      if (definition.type === 'CONSTRUCT') {
        // Constructs commit to the board and act from the next turn.
        expect(after[0].board.length).toBe(before[0].board.length + 1);
        return;
      }

      // The duel is primed so no condition holds and nothing scales: full
      // life, no ward, no constructs, a healthy opponent. Only unconditional,
      // flat clauses are asserted here - conditional and scaled ones are
      // covered by their own tests, where the condition is actually arranged.
      const unconditional = definition.effects.filter(
        (effect) => effect.condition === undefined && effect.scale === undefined,
      );
      const damage = unconditional
        .filter((effect) => effect.kind === 'DAMAGE' && effect.target === 'OPPONENT')
        .reduce((sum, effect) => sum + effect.magnitude, 0);
      const pierce = unconditional
        .filter((effect) => effect.kind === 'PIERCE' && effect.target === 'OPPONENT')
        .reduce((sum, effect) => sum + effect.magnitude, 0);
      const heal = unconditional
        .filter((effect) => effect.kind === 'HEAL')
        .reduce((sum, effect) => sum + effect.magnitude, 0);
      const ward = unconditional
        .filter((effect) => effect.kind === 'WARD')
        .reduce((sum, effect) => sum + effect.magnitude, 0);

      if (damage + pierce > 0) expect(after[1].life).toBe(before[1].life - damage - pierce);
      if (heal > 0) expect(after[0].life).toBe(before[0].life + heal);
      if (ward > 0) expect(after[0].ward).toBe(before[0].ward + ward);
    });
  }
});
