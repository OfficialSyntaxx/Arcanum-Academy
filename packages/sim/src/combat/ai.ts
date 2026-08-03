/**
 * AI opponents.
 *
 * Deterministic by construction: every choice is a pure function of the duel
 * state, the difficulty and a seeded generator. The same duel replays to the
 * same AI decisions, which is what lets an AI match be verified from its log
 * exactly like a player match.
 *
 * The difficulties are not one algorithm with a knob. A novice that is simply
 * a master with worse dice still plays like a master occasionally; the point of
 * an easy opponent is that it makes recognisably human mistakes - it curves
 * badly, it forgets lethal, it holds cards it should spend.
 *
 * Every difficulty is bounded to at most one card per call, so the caller
 * drives the turn and can stop at any point. That keeps the AI inside the turn
 * timer by construction rather than by hoping.
 */

import {
  type CardDefinition,
  type CardDefinitionId,
  type CombatTunables,
  type Rng,
} from '@arcanum/shared';
import {
  applyDuelCommand,
  conditionHolds,
  scaledMagnitude,
  type DuelCommand,
  type DuelState,
  type Seat,
} from './duel.js';

export const Difficulty = {
  /** Plays something it can afford. Does not plan, does not count lethal. */
  Novice: 'NOVICE',
  /** Spends its resonance efficiently and finishes when it can. */
  Adept: 'ADEPT',
  /** Values the whole board and keeps wards for when they matter. */
  Master: 'MASTER',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export interface AiContext {
  readonly lookup: (id: CardDefinitionId) => CardDefinition | undefined;
  readonly tunables: CombatTunables;
  readonly difficulty: Difficulty;
  readonly rng: Rng;
}

interface Playable {
  readonly handIndex: number;
  readonly definition: CardDefinition;
}

function playableCards(state: DuelState, seat: Seat, context: AiContext): Playable[] {
  const side = state.sides[seat];
  const playable: Playable[] = [];
  side.hand.forEach((id, handIndex) => {
    const definition = context.lookup(id);
    if (definition === undefined) return;
    if (definition.cost > side.resonance) return;
    if (definition.type === 'CONSTRUCT' && side.board.length >= context.tunables.maxBoardSlots) {
      return;
    }
    playable.push({ handIndex, definition });
  });
  return playable;
}

/**
 * Damage a card would actually land right now, wards accounted for.
 *
 * Evaluated through the resolver's own condition and scaling functions rather
 * than re-derived here. An AI that reasoned about effects differently from the
 * engine would misjudge exactly the cards the new vocabulary makes
 * interesting - a conditional strike, a ward-scaled hit - and the divergence
 * would be silent.
 */
function lethalReach(
  definition: CardDefinition,
  state: DuelState,
  seat: Seat,
  tunables: CombatTunables,
): number {
  const foe = state.sides[seat === 0 ? 1 : 0];
  let throughWard = 0;
  let ignoringWard = 0;

  for (const effect of definition.effects) {
    if (effect.target !== 'OPPONENT') continue;
    if (!conditionHolds(effect, state, seat, tunables)) continue;
    const magnitude = scaledMagnitude(effect, state, seat);
    if (effect.kind === 'DAMAGE') throughWard += magnitude;
    if (effect.kind === 'PIERCE') ignoringWard += magnitude;
  }

  // Pierce skips the ward entirely; ordinary damage has to chew through it.
  return ignoringWard + Math.max(0, throughWard - foe.ward);
}

/**
 * How much a card is worth right now.
 *
 * Deliberately simple and legible rather than a tuned evaluation: healing at
 * full life is worth nothing, a ward is worth less when already warded, and
 * damage is worth more when the opponent is nearly dead. An AI whose
 * reasoning cannot be read is one nobody can tell is broken.
 */
function valueOf(
  definition: CardDefinition,
  state: DuelState,
  seat: Seat,
  tunables: CombatTunables,
): number {
  const self = state.sides[seat];
  const foe = state.sides[seat === 0 ? 1 : 0];
  let value = 0;

  for (const effect of definition.effects) {
    // A clause whose condition does not hold is worth nothing, which is what
    // stops the AI paying for a conditional it cannot currently satisfy.
    if (!conditionHolds(effect, state, seat, tunables)) continue;
    const magnitude = scaledMagnitude(effect, state, seat);
    if (magnitude <= 0) continue;

    switch (effect.kind) {
      case 'DAMAGE':
        value += magnitude * (foe.life <= magnitude ? 10 : 2);
        break;
      case 'PIERCE':
        // Worth more than plain damage against a warded opponent, because it
        // is the only thing that reaches them at all.
        value += magnitude * (foe.life <= magnitude ? 10 : foe.ward > 0 ? 3 : 2);
        break;
      case 'HEAL':
        // Healing above the starting total is thrown away.
        value += Math.min(magnitude, Math.max(0, tunables.startingLife - self.life));
        break;
      case 'WARD':
        value += self.ward > 0 ? magnitude / 2 : magnitude;
        break;
      case 'DRAW':
        value += magnitude * 2;
        break;
      case 'RESONANCE_GAIN':
        value += magnitude;
        break;
      case 'DESTROY_CONSTRUCT':
        // Only worth anything if there is something to destroy, and each
        // removal is worth roughly what a construct is worth to keep.
        value += Math.min(magnitude, foe.board.length) * 5;
        break;
      case 'DISCARD':
        value += Math.min(magnitude, foe.hand.length) * 2;
        break;
    }
  }

  // A construct pays out every turn it survives, so it is worth more early.
  if (definition.type === 'CONSTRUCT') value *= 2;
  return value;
}

/**
 * Chooses one command.
 *
 * Returns `END_TURN` when there is nothing worth doing, so a caller can loop
 * until the turn passes without needing to know how the AI thinks.
 */
export function chooseDuelCommand(state: DuelState, seat: Seat, context: AiContext): DuelCommand {
  if (state.outcome !== null || state.active !== seat) return { kind: 'END_TURN' };

  const playable = playableCards(state, seat, context);
  if (playable.length === 0) return { kind: 'END_TURN' };

  const foe = state.sides[seat === 0 ? 1 : 0];

  switch (context.difficulty) {
    case Difficulty.Novice: {
      // Sometimes simply passes with cards in hand, which is the single most
      // recognisable beginner mistake.
      if (context.rng.nextInt(0, 3) === 0) return { kind: 'END_TURN' };
      const pick = playable[context.rng.nextInt(0, playable.length - 1)]!;
      return { kind: 'PLAY_CARD', handIndex: pick.handIndex };
    }

    case Difficulty.Adept: {
      // Take a kill if one is on the table, otherwise spend the most resonance
      // available - curving out beats hoarding at this level.
      const lethal = playable.find(
        (entry) => lethalReach(entry.definition, state, seat, context.tunables) >= foe.life,
      );
      if (lethal) return { kind: 'PLAY_CARD', handIndex: lethal.handIndex };

      const dearest = [...playable].sort(
        (a, b) => b.definition.cost - a.definition.cost || a.handIndex - b.handIndex,
      )[0]!;
      return { kind: 'PLAY_CARD', handIndex: dearest.handIndex };
    }

    case Difficulty.Master: {
      const lethal = playable.find(
        (entry) => lethalReach(entry.definition, state, seat, context.tunables) >= foe.life,
      );
      if (lethal) return { kind: 'PLAY_CARD', handIndex: lethal.handIndex };

      // Index breaks ties so two equally valued cards never depend on sort
      // stability - the same duel must produce the same play every time.
      const value = (definition: CardDefinition) =>
        valueOf(definition, state, seat, context.tunables);
      const best = [...playable].sort((a, b) => {
        const difference = value(b.definition) - value(a.definition);
        return difference !== 0 ? difference : a.handIndex - b.handIndex;
      })[0]!;

      if (value(best.definition) <= 0) return { kind: 'END_TURN' };
      return { kind: 'PLAY_CARD', handIndex: best.handIndex };
    }
  }
}

/**
 * Plays an entire turn, stopping when the AI passes or the duel ends.
 *
 * Bounded by hand size rather than looping until nothing changes: a card that
 * somehow failed to leave hand would otherwise spin here forever, and a hang
 * inside the turn timer is worse than a turn that ends early.
 */
export function playAiTurn(state: DuelState, seat: Seat, context: AiContext): DuelState {
  let current = state;
  const limit = current.sides[seat].hand.length + 1;

  for (let step = 0; step < limit; step += 1) {
    if (current.outcome !== null || current.active !== seat) break;
    const command = chooseDuelCommand(current, seat, context);
    const applied = applyDuelCommand(current, command, {
      lookup: context.lookup,
      tunables: context.tunables,
    });
    // A rejected choice ends the turn rather than retrying: the AI proposing an
    // illegal move is a defect, and looping on it would hide the defect behind
    // a hang.
    if (!applied.ok) {
      const passed = applyDuelCommand(current, { kind: 'END_TURN' }, context);
      return passed.ok ? passed.value : current;
    }
    current = applied.value;
    if (command.kind === 'END_TURN') break;
  }

  return current;
}
