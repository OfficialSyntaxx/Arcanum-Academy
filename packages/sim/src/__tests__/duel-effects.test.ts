import { describe, expect, it } from 'vitest';
import {
  CARD_CATALOG,
  DEFAULT_TUNABLES,
  asId,
  type CardDefinition,
  type CardDefinitionId,
  type CardEffect,
} from '@arcanum/shared';
import { applyDuelCommand, startDuel, type DuelSetup, type DuelState } from '../combat/duel.js';

const combat = DEFAULT_TUNABLES.combat;
const TEST_CARD = asId<CardDefinitionId>('card.test');

function spell(effects: CardEffect[], type: CardDefinition['type'] = 'CANTRIP'): CardDefinition {
  return {
    id: TEST_CARD,
    nameKey: 'card.test.name',
    textKey: 'card.test.text',
    schoolId: 'school.stone',
    type,
    rarity: 'COMMON',
    cost: 0,
    effects,
    scribeInputs: [{ itemId: 'item.ink.azure', quantity: 1 }],
    scribeSkillLevel: 1,
    artKey: 'test',
  };
}

function lookupWith(definition: CardDefinition) {
  return (id: CardDefinitionId) => (id === TEST_CARD ? definition : CARD_CATALOG.get(id));
}

function setup(definition: CardDefinition): DuelSetup {
  const deck = new Array<CardDefinitionId>(combat.deckSize).fill(CARD_CATALOG.cards[0]!.id);
  return { decks: [deck, deck], seed: 'effects', lookup: lookupWith(definition), tunables: combat };
}

/** A duel with the test card in hand and both sides in a stated position. */
function primed(
  definition: CardDefinition,
  you: Partial<DuelState['sides'][0]> = {},
  them: Partial<DuelState['sides'][1]> = {},
): DuelState {
  const base = startDuel(setup(definition));
  return {
    ...base,
    sides: [
      {
        ...base.sides[0],
        resonance: combat.maxResonance,
        resonanceCeiling: combat.maxResonance,
        hand: [TEST_CARD],
        life: combat.startingLife,
        ward: 0,
        board: [],
        ...you,
      },
      { ...base.sides[1], life: 40, ward: 0, board: [], ...them },
    ],
  };
}

function cast(definition: CardDefinition, state: DuelState): DuelState {
  const result = applyDuelCommand(
    state,
    { kind: 'PLAY_CARD', handIndex: 0 },
    { lookup: lookupWith(definition), tunables: combat },
  );
  if (!result.ok) throw new Error(`cast rejected: ${result.error.reason}`);
  return result.value;
}

describe('PIERCE', () => {
  it('ignores a ward entirely rather than spending it', () => {
    const definition = spell([{ kind: 'PIERCE', target: 'OPPONENT', magnitude: 5 }]);
    const after = cast(definition, primed(definition, {}, { ward: 10 }));
    expect(after.sides[1].life).toBe(35);
    // The ward is untouched: pierce goes around it, it does not chew through.
    expect(after.sides[1].ward).toBe(10);
  });
});

describe('ordinary damage', () => {
  it('spends the ward first and spills the rest to life', () => {
    const definition = spell([{ kind: 'DAMAGE', target: 'OPPONENT', magnitude: 6 }]);
    const after = cast(definition, primed(definition, {}, { ward: 4 }));
    expect(after.sides[1].ward).toBe(0);
    expect(after.sides[1].life).toBe(38);
  });
});

describe('conditions', () => {
  it('skips a clause whose condition does not hold', () => {
    const definition = spell([
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 2, condition: 'IF_WARDED' },
    ]);
    const after = cast(definition, primed(definition, { ward: 0 }));
    expect(after.sides[1].life).toBe(40);
  });

  it('applies the same clause when it does hold', () => {
    const definition = spell([
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 2, condition: 'IF_WARDED' },
    ]);
    const after = cast(definition, primed(definition, { ward: 3 }));
    expect(after.sides[1].life).toBe(38);
  });

  it('reads IF_WOUNDED against the starting life, not a fixed number', () => {
    const definition = spell([
      { kind: 'HEAL', target: 'SELF', magnitude: 3, condition: 'IF_WOUNDED' },
    ]);
    expect(cast(definition, primed(definition)).sides[0].life).toBe(combat.startingLife);
    const hurt = primed(definition, { life: combat.startingLife - 1 });
    expect(cast(definition, hurt).sides[0].life).toBe(combat.startingLife + 2);
  });

  it('compares IF_OPPONENT_BLOODIED against its own threshold', () => {
    const definition = spell([
      {
        kind: 'DAMAGE',
        target: 'OPPONENT',
        magnitude: 4,
        condition: 'IF_OPPONENT_BLOODIED',
        conditionValue: 12,
      },
    ]);
    expect(cast(definition, primed(definition, {}, { life: 13 })).sides[1].life).toBe(13);
    expect(cast(definition, primed(definition, {}, { life: 12 })).sides[1].life).toBe(8);
  });

  it('evaluates a clause against the state its predecessors left behind', () => {
    // Ward, then strike because you are warded: the second clause sees the
    // first, which is what makes a card able to set up its own condition.
    const definition = spell([
      { kind: 'WARD', target: 'SELF', magnitude: 2 },
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 3, condition: 'IF_WARDED' },
    ]);
    const after = cast(definition, primed(definition, { ward: 0 }));
    expect(after.sides[0].ward).toBe(2);
    expect(after.sides[1].life).toBe(37);
  });
});

describe('scaling', () => {
  it('multiplies by the caster wards', () => {
    const definition = spell([
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 2, scale: 'PER_WARD' },
    ]);
    // Three wards held, two damage each: six, and nothing on the far side to
    // absorb it.
    const after = cast(definition, primed(definition, { ward: 3 }, { ward: 0 }));
    expect(after.sides[1].life).toBe(34);
  });

  it('reads the caster wards rather than the target wards', () => {
    const definition = spell([
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 2, scale: 'PER_WARD' },
    ]);
    // The caster holds none, so this scales to nothing however heavily warded
    // the opponent is - the scale is a property of who cast it.
    const after = cast(definition, primed(definition, { ward: 0 }, { ward: 9 }));
    expect(after.sides[1].life).toBe(40);
    expect(after.sides[1].ward).toBe(9);
  });

  it('resolves to nothing when the quantity is zero', () => {
    const definition = spell([
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 4, scale: 'PER_CONSTRUCT' },
    ]);
    const after = cast(definition, primed(definition, { board: [] }));
    expect(after.sides[1].life).toBe(40);
  });

  it('counts the caster hand for PER_CARD_IN_HAND', () => {
    const definition = spell([
      { kind: 'DAMAGE', target: 'OPPONENT', magnitude: 1, scale: 'PER_CARD_IN_HAND' },
    ]);
    // The card is removed from hand before its effects resolve, so a hand of
    // three counts the two that remain.
    const state = primed(definition, {
      hand: [TEST_CARD, CARD_CATALOG.cards[0]!.id, CARD_CATALOG.cards[1]!.id],
    });
    const after = cast(definition, state);
    expect(after.sides[1].life).toBe(38);
  });
});

describe('DESTROY_CONSTRUCT', () => {
  const board = [
    { definitionId: CARD_CATALOG.cards[0]!.id, placedOnTurn: 1, sequence: 1 },
    { definitionId: CARD_CATALOG.cards[1]!.id, placedOnTurn: 2, sequence: 2 },
  ];

  it('takes the longest-standing construct first', () => {
    const definition = spell([{ kind: 'DESTROY_CONSTRUCT', target: 'OPPONENT', magnitude: 1 }]);
    const after = cast(definition, primed(definition, {}, { board }));
    expect(after.sides[1].board).toHaveLength(1);
    expect(after.sides[1].board[0]!.sequence).toBe(2);
  });

  it('does nothing against an empty board rather than failing', () => {
    const definition = spell([{ kind: 'DESTROY_CONSTRUCT', target: 'OPPONENT', magnitude: 2 }]);
    const after = cast(definition, primed(definition, {}, { board: [] }));
    expect(after.sides[1].board).toEqual([]);
  });

  it('never removes more than are there', () => {
    const definition = spell([{ kind: 'DESTROY_CONSTRUCT', target: 'OPPONENT', magnitude: 9 }]);
    const after = cast(definition, primed(definition, {}, { board }));
    expect(after.sides[1].board).toEqual([]);
  });
});

describe('DISCARD', () => {
  it('takes the oldest cards in hand', () => {
    const definition = spell([{ kind: 'DISCARD', target: 'OPPONENT', magnitude: 2 }]);
    const hand = [CARD_CATALOG.cards[0]!.id, CARD_CATALOG.cards[1]!.id, CARD_CATALOG.cards[2]!.id];
    const after = cast(definition, primed(definition, {}, { hand }));
    expect(after.sides[1].hand).toEqual([CARD_CATALOG.cards[2]!.id]);
  });

  it('empties a hand rather than going negative', () => {
    const definition = spell([{ kind: 'DISCARD', target: 'OPPONENT', magnitude: 9 }]);
    const after = cast(definition, primed(definition, {}, { hand: [CARD_CATALOG.cards[0]!.id] }));
    expect(after.sides[1].hand).toEqual([]);
  });
});
