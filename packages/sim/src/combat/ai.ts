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
import { applyDuelCommand, type DuelCommand, type DuelState, type Seat } from './duel.js';

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

/** Damage a card would deal to the opponent this instant. */
function immediateDamage(definition: CardDefinition): number {
  return definition.effects
    .filter((effect) => effect.kind === 'DAMAGE' && effect.target === 'OPPONENT')
    .reduce((sum, effect) => sum + effect.magnitude, 0);
}

/**
 * How much a card is worth right now.
 *
 * Deliberately simple and legible rather than a tuned evaluation: healing at
 * full life is worth nothing, a ward is worth less when already warded, and
 * damage is worth more when the opponent is nearly dead. An AI whose
 * reasoning cannot be read is one nobody can tell is broken.
 */
function valueOf(definition: CardDefinition, state: DuelState, seat: Seat): number {
  const self = state.sides[seat];
  const foe = state.sides[seat === 0 ? 1 : 0];
  let value = 0;

  for (const effect of definition.effects) {
    switch (effect.kind) {
      case 'DAMAGE':
        value += effect.magnitude * (foe.life <= effect.magnitude ? 10 : 2);
        break;
      case 'HEAL':
        // Healing above the starting total is thrown away.
        value += Math.min(effect.magnitude, Math.max(0, 30 - self.life));
        break;
      case 'WARD':
        value += self.ward > 0 ? effect.magnitude / 2 : effect.magnitude;
        break;
      case 'DRAW':
        value += effect.magnitude * 2;
        break;
      case 'RESONANCE_GAIN':
        value += effect.magnitude;
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
        (entry) => immediateDamage(entry.definition) >= foe.life + foe.ward,
      );
      if (lethal) return { kind: 'PLAY_CARD', handIndex: lethal.handIndex };

      const dearest = [...playable].sort(
        (a, b) => b.definition.cost - a.definition.cost || a.handIndex - b.handIndex,
      )[0]!;
      return { kind: 'PLAY_CARD', handIndex: dearest.handIndex };
    }

    case Difficulty.Master: {
      const lethal = playable.find(
        (entry) => immediateDamage(entry.definition) >= foe.life + foe.ward,
      );
      if (lethal) return { kind: 'PLAY_CARD', handIndex: lethal.handIndex };

      // Index breaks ties so two equally valued cards never depend on sort
      // stability - the same duel must produce the same play every time.
      const best = [...playable].sort((a, b) => {
        const difference = valueOf(b.definition, state, seat) - valueOf(a.definition, state, seat);
        return difference !== 0 ? difference : a.handIndex - b.handIndex;
      })[0]!;

      if (valueOf(best.definition, state, seat) <= 0) return { kind: 'END_TURN' };
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
