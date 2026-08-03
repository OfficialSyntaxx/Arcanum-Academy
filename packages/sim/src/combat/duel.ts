/**
 * The duel engine.
 *
 * A duel is a pure function of its seed and its command log. Nothing here
 * reads a clock, allocates an id, or touches a card a player owns - only
 * `CardDefinition`, which is the half ADR-0004 permits. The boundary linter
 * enforces that: `sim/combat` may not import `CardInstance` or `SlabSerial`,
 * so a grade cannot reach this file even through a type.
 *
 * Every state transition appends to a log. The log is the replay: given the
 * same deck lists, seed and commands, `replay` reconstructs the identical
 * final state, which is what lets the server verify a duel it did not watch
 * turn by turn.
 *
 * Resolution order is fixed and stated once, because "what happens first" is
 * the question every card argues about:
 *
 *   1. Turn begins: constructs act, oldest first.
 *   2. Resonance rises by one, to its ceiling.
 *   3. The active player draws.
 *   4. The active player casts, in the order they choose.
 *   5. Turn ends.
 *
 * Damage meets wards before life. A ward is a pool, not a shield per source,
 * so two small hits spend it exactly as one large one does - anything else
 * makes ward maths depend on how an opponent happens to divide their turn.
 */

import {
  Rng,
  err,
  failure,
  FailureCode,
  ok,
  type CardDefinition,
  type CardDefinitionId,
  type CardEffect,
  type CombatTunables,
  type Failure,
  type Result,
  type RngState,
} from '@arcanum/shared';

export const DuelCommandKind = {
  PlayCard: 'PLAY_CARD',
  EndTurn: 'END_TURN',
  Concede: 'CONCEDE',
  /** The turn timer expired. Resolves as an end of turn, never as a loss. */
  Timeout: 'TIMEOUT',
} as const;
export type DuelCommandKind = (typeof DuelCommandKind)[keyof typeof DuelCommandKind];

export interface DuelCommand {
  readonly kind: DuelCommandKind;
  /** Index into the caster's hand. Present for PlayCard. */
  readonly handIndex?: number;
}

export const DuelOutcomeKind = {
  Victory: 'VICTORY',
  Draw: 'DRAW',
} as const;
export type DuelOutcomeKind = (typeof DuelOutcomeKind)[keyof typeof DuelOutcomeKind];

export const DuelEndReason = {
  LifeExhausted: 'LIFE_EXHAUSTED',
  Conceded: 'CONCEDED',
  TurnLimit: 'TURN_LIMIT',
  /** A player left and did not return inside the resume window. */
  Abandoned: 'ABANDONED',
} as const;
export type DuelEndReason = (typeof DuelEndReason)[keyof typeof DuelEndReason];

export interface DuelOutcome {
  readonly kind: DuelOutcomeKind;
  /** The winning seat, or null for a draw. */
  readonly winner: 0 | 1 | null;
  readonly reason: DuelEndReason;
  readonly turn: number;
}

/** A construct on the board, with the turn it arrived so order is stable. */
export interface BoardSlot {
  readonly definitionId: CardDefinitionId;
  readonly placedOnTurn: number;
  readonly sequence: number;
}

export interface DuelSide {
  readonly life: number;
  readonly resonance: number;
  /** Rises by one a turn to the ceiling; this is the per-duel cap reached so far. */
  readonly resonanceCeiling: number;
  /** Remaining draw pile, in draw order. */
  readonly deck: readonly CardDefinitionId[];
  readonly hand: readonly CardDefinitionId[];
  readonly board: readonly BoardSlot[];
  /** Absorbs damage before life. A pool, not a per-source shield. */
  readonly ward: number;
  /** Damage taken from drawing on an empty deck, rising each time. */
  readonly fatigue: number;
}

export type Seat = 0 | 1;

export interface DuelState {
  readonly turn: number;
  readonly active: Seat;
  readonly sides: readonly [DuelSide, DuelSide];
  readonly rngState: RngState;
  readonly outcome: DuelOutcome | null;
  readonly log: readonly string[];
  /** Increments on every card placed, so board order never depends on sorting. */
  readonly sequence: number;
}

export interface DuelSetup {
  readonly decks: readonly [readonly CardDefinitionId[], readonly CardDefinitionId[]];
  readonly seed: string;
  readonly lookup: (id: CardDefinitionId) => CardDefinition | undefined;
  readonly tunables: CombatTunables;
}

function opponentOf(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

function withSide(state: DuelState, seat: Seat, side: DuelSide): DuelState {
  const sides: [DuelSide, DuelSide] = seat === 0 ? [side, state.sides[1]] : [state.sides[0], side];
  return { ...state, sides };
}

/**
 * Applies damage: wards first, then life.
 *
 * Wards absorb from a single pool so the arithmetic does not depend on how the
 * damage was divided. Overkill past the ward spills to life in the same step,
 * because holding it back would let a 1-point ward blank a 9-point spell.
 */
function damage(side: DuelSide, amount: number): DuelSide {
  const absorbed = Math.min(side.ward, amount);
  return { ...side, ward: side.ward - absorbed, life: side.life - (amount - absorbed) };
}

/**
 * Draws one card.
 *
 * An empty deck deals rising fatigue rather than ending the duel outright. A
 * deck-out loss makes the last few turns a formality; fatigue makes them a
 * clock both players can see and play around.
 */
function draw(side: DuelSide, tunables: CombatTunables, log: string[], seat: Seat): DuelSide {
  const next = side.deck[0];
  if (next === undefined) {
    const fatigue = side.fatigue + 1;
    log.push(`seat ${seat} draws on an empty deck and takes ${fatigue} fatigue`);
    return damage({ ...side, fatigue }, fatigue);
  }
  if (side.hand.length >= tunables.maxHandSize) {
    log.push(`seat ${seat} draws ${next} and discards it: hand is full`);
    return { ...side, deck: side.deck.slice(1) };
  }
  return { ...side, deck: side.deck.slice(1), hand: [...side.hand, next] };
}

/**
 * Whether an effect's condition holds.
 *
 * Every condition reads public state - the caster's own position, or the
 * opponent's life and board. None reads a hidden hand, which is what keeps the
 * client able to predict a cast without information it was never sent.
 */
export function conditionHolds(
  effect: CardEffect,
  state: DuelState,
  caster: Seat,
  tunables: CombatTunables,
): boolean {
  const self = state.sides[caster];
  const foe = state.sides[opponentOf(caster)];
  switch (effect.condition ?? 'ALWAYS') {
    case 'ALWAYS':
      return true;
    case 'IF_WARDED':
      return self.ward > 0;
    case 'IF_WOUNDED':
      return self.life < tunables.startingLife;
    case 'IF_OPPONENT_BLOODIED':
      return foe.life <= (effect.conditionValue ?? 0);
    case 'IF_CONSTRUCTED':
      return self.board.length > 0;
    default:
      return true;
  }
}

/**
 * The magnitude an effect actually applies.
 *
 * Scaling reads the caster's side, never the target's, so "for every ward you
 * hold" means the caster's wards whichever way the effect points.
 */
export function scaledMagnitude(effect: CardEffect, state: DuelState, caster: Seat): number {
  const self = state.sides[caster];
  switch (effect.scale ?? 'FLAT') {
    case 'FLAT':
      return effect.magnitude;
    case 'PER_WARD':
      return effect.magnitude * self.ward;
    case 'PER_CONSTRUCT':
      return effect.magnitude * self.board.length;
    case 'PER_CARD_IN_HAND':
      return effect.magnitude * self.hand.length;
    default:
      return effect.magnitude;
  }
}

/** Applies one card's effects. Order within a card is the order authored. */
function applyEffects(
  state: DuelState,
  caster: Seat,
  definition: CardDefinition,
  tunables: CombatTunables,
  log: string[],
): DuelState {
  let next = state;
  for (const effect of definition.effects) {
    // Conditions and scaling are both evaluated against the state as it stands
    // when this clause resolves, not as the card was cast. A card that wards
    // and then strikes for its wards counts the ward it just raised.
    if (!conditionHolds(effect, next, caster, tunables)) continue;
    const magnitude = scaledMagnitude(effect, next, caster);
    if (magnitude <= 0) continue;

    const target = effect.target === 'SELF' ? caster : opponentOf(caster);
    const side = next.sides[target];
    switch (effect.kind) {
      case 'DAMAGE':
        log.push(`seat ${target} takes ${magnitude}`);
        next = withSide(next, target, damage(side, magnitude));
        break;
      case 'PIERCE':
        // Ignores wards entirely rather than spending them, which is what
        // makes it an answer to a turtle rather than merely more damage.
        log.push(`seat ${target} is pierced for ${magnitude}`);
        next = withSide(next, target, { ...side, life: side.life - magnitude });
        break;
      case 'HEAL':
        log.push(`seat ${target} restores ${magnitude}`);
        next = withSide(next, target, { ...side, life: side.life + magnitude });
        break;
      case 'WARD':
        log.push(`seat ${target} wards ${magnitude}`);
        next = withSide(next, target, { ...side, ward: side.ward + magnitude });
        break;
      case 'RESONANCE_GAIN':
        next = withSide(next, target, {
          ...side,
          resonance: Math.min(side.resonance + magnitude, next.sides[target].resonanceCeiling),
        });
        break;
      case 'DRAW': {
        let drawn = side;
        for (let n = 0; n < magnitude; n += 1) {
          drawn = draw(drawn, tunables, log, target);
        }
        next = withSide(next, target, drawn);
        break;
      }
      case 'DESTROY_CONSTRUCT': {
        // Oldest first, by placement sequence. Choosing by any other rule -
        // strongest, newest - needs a valuation the resolver has no business
        // holding, and one the client would have to reproduce exactly.
        if (side.board.length === 0) break;
        const doomed = new Set(
          [...side.board].sort((a, b) => a.sequence - b.sequence).slice(0, magnitude),
        );
        for (const slot of doomed) log.push(`seat ${target} loses ${slot.definitionId}`);
        next = withSide(next, target, {
          ...side,
          board: side.board.filter((slot) => !doomed.has(slot)),
        });
        break;
      }
      case 'DISCARD': {
        // Oldest card first, for the same reason.
        const lost = Math.min(magnitude, side.hand.length);
        if (lost === 0) break;
        log.push(`seat ${target} discards ${lost}`);
        next = withSide(next, target, { ...side, hand: side.hand.slice(lost) });
        break;
      }
    }
  }
  return next;
}

/** Checks for a decided duel. Called after every state change. */
function settle(state: DuelState, tunables: CombatTunables): DuelState {
  if (state.outcome !== null) return state;

  const [first, second] = state.sides;
  const firstDead = first.life <= 0;
  const secondDead = second.life <= 0;

  // Simultaneous death is a draw rather than a win for whoever is checked
  // first. Deciding it by evaluation order would make the result depend on an
  // implementation detail nobody can see.
  if (firstDead && secondDead) {
    return {
      ...state,
      outcome: { kind: 'DRAW', winner: null, reason: 'LIFE_EXHAUSTED', turn: state.turn },
    };
  }
  if (firstDead || secondDead) {
    return {
      ...state,
      outcome: {
        kind: 'VICTORY',
        winner: firstDead ? 1 : 0,
        reason: 'LIFE_EXHAUSTED',
        turn: state.turn,
      },
    };
  }
  if (state.turn > tunables.maxTurnsBeforeDraw) {
    return {
      ...state,
      outcome: { kind: 'DRAW', winner: null, reason: 'TURN_LIMIT', turn: state.turn },
    };
  }
  return state;
}

/** Begins a turn: constructs act oldest first, resonance rises, then a draw. */
function beginTurn(
  state: DuelState,
  tunables: CombatTunables,
  lookup: DuelSetup['lookup'],
): DuelState {
  const seat = state.active;
  const log: string[] = [`— turn ${state.turn}, seat ${seat} —`];
  let next = state;

  for (const slot of [...next.sides[seat].board].sort((a, b) => a.sequence - b.sequence)) {
    const definition = lookup(slot.definitionId);
    if (definition === undefined) continue;
    next = applyEffects(next, seat, definition, tunables, log);
    next = settle(next, tunables);
    if (next.outcome !== null) break;
  }

  if (next.outcome === null) {
    const side = next.sides[seat];
    const ceiling = Math.min(
      side.resonanceCeiling + tunables.resonanceGainPerTurn,
      tunables.maxResonance,
    );
    next = withSide(next, seat, { ...side, resonanceCeiling: ceiling, resonance: ceiling });
    next = withSide(next, seat, draw(next.sides[seat], tunables, log, seat));
    next = settle(next, tunables);
  }

  return { ...next, log: [...next.log, ...log] };
}

/** Deals an opening hand to each seat and begins the first turn. */
export function startDuel(setup: DuelSetup): DuelState {
  const rng = Rng.fromSeed(setup.seed);
  const sides = setup.decks.map((deck) => {
    const shuffled = [...deck];
    rng.shuffle(shuffled);
    return {
      life: setup.tunables.startingLife,
      resonance: 0,
      resonanceCeiling: 0,
      deck: shuffled,
      hand: [],
      board: [],
      ward: 0,
      fatigue: 0,
    } as DuelSide;
  }) as [DuelSide, DuelSide];

  const log: string[] = [];
  const dealt = sides.map((side, index) => {
    let held = side;
    for (let n = 0; n < setup.tunables.openingHandSize; n += 1) {
      held = draw(held, setup.tunables, log, index as Seat);
    }
    return held;
  }) as [DuelSide, DuelSide];

  const opening: DuelState = {
    turn: 1,
    active: 0,
    sides: dealt,
    rngState: rng.getState(),
    outcome: null,
    log,
    sequence: 0,
  };

  return beginTurn(opening, setup.tunables, setup.lookup);
}

/**
 * Applies one command.
 *
 * Returns `Err` for a move the rules forbid, so an illegal command is a
 * rejection the caller can explain rather than a state that silently ignored
 * it. A duel that quietly dropped an illegal play would desync the moment a
 * client predicted differently.
 */
export function applyDuelCommand(
  state: DuelState,
  command: DuelCommand,
  setup: Pick<DuelSetup, 'lookup' | 'tunables'>,
): Result<DuelState, Failure> {
  if (state.outcome !== null) {
    return err(failure(FailureCode.Validation, 'duel.already_decided'));
  }

  const seat = state.active;
  const side = state.sides[seat];
  const { tunables, lookup } = setup;

  switch (command.kind) {
    case 'CONCEDE':
      return ok({
        ...state,
        outcome: {
          kind: 'VICTORY',
          winner: opponentOf(seat),
          reason: 'CONCEDED',
          turn: state.turn,
        },
        log: [...state.log, `seat ${seat} concedes`],
      });

    case 'TIMEOUT':
    case 'END_TURN': {
      // A timeout ends the turn rather than the duel. Losing outright to a
      // dropped connection or a moment of hesitation punishes the network more
      // than the player.
      const reason = command.kind === 'TIMEOUT' ? 'times out' : 'ends the turn';
      const passed: DuelState = {
        ...state,
        turn: state.turn + 1,
        active: opponentOf(seat),
        log: [...state.log, `seat ${seat} ${reason}`],
      };
      const settled = settle(passed, tunables);
      if (settled.outcome !== null) return ok(settled);
      return ok(beginTurn(settled, tunables, lookup));
    }

    case 'PLAY_CARD': {
      const index = command.handIndex;
      if (index === undefined || index < 0 || index >= side.hand.length) {
        return err(
          failure(FailureCode.Validation, 'duel.no_such_card', {
            context: { index: index ?? -1, handSize: side.hand.length },
          }),
        );
      }
      const definitionId = side.hand[index]!;
      const definition = lookup(definitionId);
      if (definition === undefined) {
        return err(
          failure(FailureCode.NotFound, 'duel.unknown_card', { context: { definitionId } }),
        );
      }
      if (definition.cost > side.resonance) {
        return err(
          failure(FailureCode.Validation, 'duel.insufficient_resonance', {
            context: { cost: definition.cost, available: side.resonance },
          }),
        );
      }
      const persists = definition.type === 'CONSTRUCT';
      if (persists && side.board.length >= tunables.maxBoardSlots) {
        return err(
          failure(FailureCode.Conflict, 'duel.board_full', {
            context: { slots: tunables.maxBoardSlots },
          }),
        );
      }

      const log: string[] = [`seat ${seat} casts ${definitionId}`];
      const sequence = state.sequence + 1;
      let next = withSide(state, seat, {
        ...side,
        resonance: side.resonance - definition.cost,
        hand: [...side.hand.slice(0, index), ...side.hand.slice(index + 1)],
        board: persists
          ? [...side.board, { definitionId, placedOnTurn: state.turn, sequence }]
          : side.board,
      });
      next = { ...next, sequence };

      // A construct's effects begin on the turn after it arrives, so a board
      // presence is a commitment rather than an immediate burst.
      if (!persists) next = applyEffects(next, seat, definition, tunables, log);

      next = settle(next, tunables);
      return ok({ ...next, log: [...next.log, ...log] });
    }
  }
}

/** Ends a duel a player abandoned. Kept explicit so the outcome is defined. */
export function abandonDuel(state: DuelState, seat: Seat): DuelState {
  if (state.outcome !== null) return state;
  return {
    ...state,
    outcome: {
      kind: 'VICTORY',
      winner: opponentOf(seat),
      reason: 'ABANDONED',
      turn: state.turn,
    },
    log: [...state.log, `seat ${seat} abandoned the duel`],
  };
}

/**
 * Rebuilds a duel from its seed and command log.
 *
 * The verification the roadmap asks for: a duel must replay to an identical
 * final state. Illegal commands in a log are a corrupt log, not a recoverable
 * condition, so the whole replay fails rather than diverging quietly.
 */
export function replayDuel(
  setup: DuelSetup,
  commands: readonly DuelCommand[],
): Result<DuelState, Failure> {
  let state = startDuel(setup);
  for (const [index, command] of commands.entries()) {
    if (state.outcome !== null) break;
    const applied = applyDuelCommand(state, command, setup);
    if (!applied.ok) {
      return err(
        failure(FailureCode.Validation, 'duel.replay_diverged', {
          detail: `command ${index} (${command.kind}) was rejected: ${applied.error.reason}`,
          context: { index },
        }),
      );
    }
    state = applied.value;
  }
  return ok(state);
}
