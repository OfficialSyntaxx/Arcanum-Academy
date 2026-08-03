/**
 * Duel commands.
 *
 * The server owns every outcome. A client sends what it wants to do; the
 * engine in `@arcanum/sim` decides what happens, and the resulting state is
 * patched back. The client runs the identical engine for prediction, so the
 * two agree unless something is wrong - and when they disagree the server's
 * copy is the one that counts.
 *
 * A duel lives on the player record rather than in process memory. That is
 * what makes a dropped connection survivable: the session resume window
 * already exists, and a duel held only in memory would vanish with the socket
 * even though the player is entitled to come back to it.
 */

import {
  Difficulty,
  abandonDuel,
  applyDuelCommand,
  playAiTurn,
  startDuel,
  type DuelCommand,
  type DuelState,
} from '@arcanum/sim';
import {
  Rng,
  assertLegalDeck,
  err,
  failure,
  FailureCode,
  ok,
  type CardCatalog,
  type CardDefinitionId,
  type Failure,
  type Result,
  type Tunables,
} from '@arcanum/shared';
import type { Session } from '../../session/session-store.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { PlayerState } from '../../domain/player-state.js';
import type { Mutation, PlayerService } from '../../domain/player-service.js';

export interface DuelHandlerOptions {
  readonly players: PlayerService;
  readonly cards: CardCatalog;
  readonly tunables: Tunables;
  readonly now: () => number;
}

/** The player always takes seat 0; the AI answers from seat 1. */
const PLAYER_SEAT = 0;
const AI_SEAT = 1;

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function difficultyFrom(payload: unknown): Difficulty {
  const raw = readString(payload, 'difficulty');
  const known: string[] = Object.values(Difficulty);
  return raw !== null && known.includes(raw) ? (raw as Difficulty) : Difficulty.Adept;
}

/**
 * What the client is told about a duel.
 *
 * The opponent's hand is withheld. Sending it and trusting the interface not
 * to draw it would put the whole game one devtools panel away from being
 * solved, so the deck and hand are reduced to counts.
 */
function project(state: DuelState) {
  return {
    turn: state.turn,
    active: state.active,
    outcome: state.outcome,
    log: state.log.slice(-24),
    you: {
      ...state.sides[PLAYER_SEAT],
      deck: state.sides[PLAYER_SEAT].deck.length,
    },
    opponent: {
      life: state.sides[AI_SEAT].life,
      ward: state.sides[AI_SEAT].ward,
      resonance: state.sides[AI_SEAT].resonance,
      board: state.sides[AI_SEAT].board,
      handCount: state.sides[AI_SEAT].hand.length,
      deck: state.sides[AI_SEAT].deck.length,
    },
  };
}

export function registerDuelHandlers(
  router: RegistryCommandRouter,
  options: DuelHandlerOptions,
): void {
  const { players, cards, tunables, now } = options;
  const lookup = (id: CardDefinitionId) => cards.get(id);
  const engine = { lookup, tunables: tunables.combat };

  /**
   * Runs the AI's turns until control returns to the player or the duel ends.
   *
   * Bounded rather than looping until the state settles: a bug that left the
   * AI holding priority would otherwise hang the command, and a duel that
   * stops advancing is easier to diagnose than one that never answers.
   */
  function answer(state: DuelState, seed: string, difficulty: Difficulty): DuelState {
    let current = state;
    let guard = 0;
    while (current.outcome === null && current.active === AI_SEAT && guard < 32) {
      guard += 1;
      current = playAiTurn(current, AI_SEAT, {
        lookup,
        tunables: tunables.combat,
        difficulty,
        rng: Rng.fromSeed(`${seed}:ai:${current.turn}:${guard}`),
      });
    }
    return current;
  }

  const start: CommandHandler = async (session: Session, payload: unknown) => {
    const deckId = readString(payload, 'deckId');
    if (deckId === null) return err(invalid('duel.deck_missing', 'deckId is required'));
    const difficulty = difficultyFrom(payload);
    const nowMs = now();

    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.duel !== null && state.duel.state.outcome === null) {
        return err(
          failure(FailureCode.Conflict, 'duel.already_running', {
            detail: 'finish or concede the current duel first',
          }),
        );
      }

      const saved = state.decks[deckId];
      if (saved === undefined) {
        return err(failure(FailureCode.NotFound, 'duel.unknown_deck', { context: { deckId } }));
      }

      // Re-checked here even though deck.save checked it: a card could have
      // been retired from content since the deck was saved, and starting a
      // duel with an illegal deck is worse than refusing to start.
      const legal = assertLegalDeck(saved.cardDefinitionIds, lookup, tunables.combat);
      if (!legal.ok) return err(legal.error);

      // The AI mirrors the player's deck so a first duel is always winnable
      // and always fair. Archetype decks arrive with the card set.
      const seed = `${session.playerId}:${deckId}:${nowMs}`;
      const opened = startDuel({
        decks: [saved.cardDefinitionIds, saved.cardDefinitionIds],
        seed,
        lookup,
        tunables: tunables.combat,
      });

      const duel = { state: opened, seed, difficulty };
      const next: PlayerState = { ...state, duel, lastSeenAtMs: nowMs };
      return ok({ state: next, value: project(opened) });
    });
  };

  const act: CommandHandler = async (session: Session, payload: unknown) => {
    const kind = readString(payload, 'command');
    if (kind === null) return err(invalid('duel.command_missing', 'command is required'));
    const handIndexRaw = (payload as { handIndex?: unknown }).handIndex;
    const command = {
      kind,
      ...(typeof handIndexRaw === 'number' ? { handIndex: handIndexRaw } : {}),
    } as DuelCommand;

    const nowMs = now();
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const duel = state.duel;
      if (duel === null || duel.state.outcome !== null) {
        return err(invalid('duel.not_running', 'no duel is in progress'));
      }
      if (duel.state.active !== PLAYER_SEAT) {
        return err(invalid('duel.not_your_turn', 'the opponent is acting'));
      }

      const applied = applyDuelCommand(duel.state, command, engine);
      if (!applied.ok) return err(applied.error);

      const answered = answer(applied.value, duel.seed, duel.difficulty);
      const next: PlayerState = {
        ...state,
        duel: { ...duel, state: answered },
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(answered) });
    });
  };

  const forfeit: CommandHandler = async (session: Session) => {
    const nowMs = now();
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const duel = state.duel;
      if (duel === null || duel.state.outcome !== null) {
        return err(invalid('duel.not_running', 'no duel is in progress'));
      }
      // Abandoning is distinct from conceding: it is what a duel resolves to
      // when the player never comes back, and the outcome says which happened.
      const ended = abandonDuel(duel.state, PLAYER_SEAT);
      const next: PlayerState = { ...state, duel: { ...duel, state: ended }, lastSeenAtMs: nowMs };
      return ok({ state: next, value: project(ended) });
    });
  };

  const state: CommandHandler = async (session: Session) => {
    const loaded = await players.load(session.playerId);
    if (!loaded.ok) return err(loaded.error);
    if (loaded.value.duel === null) {
      return err(invalid('duel.not_running', 'no duel is in progress'));
    }
    return ok(project(loaded.value.duel.state));
  };

  router
    .register('duel.start', start)
    .register('duel.act', act)
    .register('duel.forfeit', forfeit)
    .register('duel.state', state);
}

function invalid(reason: string, detail: string): Failure {
  return failure(FailureCode.Validation, reason, { detail });
}
