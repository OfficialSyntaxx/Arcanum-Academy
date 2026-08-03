/**
 * Trading, matchmaking and player-versus-player commands.
 *
 * Thin by design: every rule lives in the domain services, and these handlers
 * only translate a wire payload into a call and a projection back. A rule that
 * leaked in here would be one the tests for those services never see.
 */

import {
  err,
  failure,
  FailureCode,
  ok,
  type CardCatalog,
  type CardDefinitionId,
  type Failure,
  type ItemDefinitionId,
  type ItemStack,
  type PlayerId,
} from '@arcanum/shared';
import type { Session } from '../../session/session-store.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { PlayerService } from '../../domain/player-service.js';
import type { TradingService } from '../../domain/trading.js';
import { STARTING_RATING, type Matchmaker } from '../../domain/matchmaking.js';
import type { LiveDuel, PvpService } from '../../domain/pvp.js';

export interface SocialHandlerOptions {
  readonly players: PlayerService;
  readonly trading: TradingService;
  readonly matchmaker: Matchmaker;
  readonly pvp: PvpService;
  readonly cards: CardCatalog;
}

function invalid(reason: string, detail: string): Failure {
  return failure(FailureCode.Validation, reason, { detail });
}

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Reads an offered stack list, rejecting anything that is not a whole count. */
function readStacks(payload: unknown): ItemStack[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = (payload as { stacks?: unknown }).stacks;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;

  const stacks: ItemStack[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { definitionId, quantity } = entry as { definitionId?: unknown; quantity?: unknown };
    if (typeof definitionId !== 'string') return null;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) return null;
    stacks.push({ definitionId: definitionId as ItemDefinitionId, quantity });
  }
  return stacks;
}

function readIds(payload: unknown, key: string): string[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = (payload as Record<string, unknown>)[key];
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) return null;
  return raw as string[];
}

/**
 * What a duel looks like to one seat.
 *
 * The opponent's hand is a count. The rule is the same as the AI duel's and
 * matters more here: against a person, seeing their hand is not a spoiled
 * surprise, it is cheating.
 */
function projectDuel(duel: LiveDuel, seat: 0 | 1) {
  const you = duel.state.sides[seat];
  const them = duel.state.sides[seat === 0 ? 1 : 0];
  return {
    matchId: duel.matchId,
    seat,
    turn: duel.state.turn,
    active: duel.state.active,
    yourTurn: duel.state.active === seat,
    outcome: duel.state.outcome,
    log: duel.state.log.slice(-24),
    you: { ...you, deck: you.deck.length },
    opponent: {
      life: them.life,
      ward: them.ward,
      resonance: them.resonance,
      board: them.board,
      handCount: them.hand.length,
      deck: them.deck.length,
    },
  };
}

export function registerSocialHandlers(
  router: RegistryCommandRouter,
  options: SocialHandlerOptions,
): void {
  const { players, trading, matchmaker, pvp } = options;

  const openTrade: CommandHandler = async (session: Session, payload: unknown) => {
    const partnerId = readString(payload, 'partnerId');
    if (partnerId === null) return err(invalid('trade.partner_missing', 'partnerId is required'));
    const opened = await trading.open(session.playerId, partnerId as PlayerId);
    return opened.ok ? ok(opened.value) : err(opened.error);
  };

  const offer: CommandHandler = async (session: Session, payload: unknown) => {
    const tradeId = readString(payload, 'tradeId');
    const stacks = readStacks(payload);
    const cardInstanceIds = readIds(payload, 'cardInstanceIds');
    if (tradeId === null || stacks === null || cardInstanceIds === null) {
      return err(invalid('trade.offer_malformed', 'tradeId, stacks and cardInstanceIds required'));
    }
    const offered = await trading.offer(tradeId, session.playerId, stacks, cardInstanceIds);
    return offered.ok ? ok(offered.value) : err(offered.error);
  };

  const confirm: CommandHandler = async (session: Session, payload: unknown) => {
    const tradeId = readString(payload, 'tradeId');
    if (tradeId === null) return err(invalid('trade.id_missing', 'tradeId is required'));
    const confirmed = await trading.confirm(tradeId, session.playerId);
    return confirmed.ok ? ok(confirmed.value) : err(confirmed.error);
  };

  const cancel: CommandHandler = async (session: Session, payload: unknown) => {
    const tradeId = readString(payload, 'tradeId');
    if (tradeId === null) return err(invalid('trade.id_missing', 'tradeId is required'));
    const cancelled = await trading.cancel(tradeId, session.playerId);
    return cancelled.ok ? ok(cancelled.value) : err(cancelled.error);
  };

  /**
   * Joins the ladder queue, opening a duel if it pairs immediately.
   *
   * Both decks are re-read here rather than trusted from the queue entry: a
   * deck can be edited while its owner waits, and starting a duel from a stale
   * list would field cards the player no longer owns.
   */
  const queue: CommandHandler = async (session: Session, payload: unknown) => {
    const deckId = readString(payload, 'deckId');
    if (deckId === null) return err(invalid('match.deck_missing', 'deckId is required'));

    const loaded = await players.load(session.playerId);
    if (!loaded.ok) return err(loaded.error);
    if (loaded.value.decks[deckId] === undefined) {
      return err(failure(FailureCode.NotFound, 'match.unknown_deck', { context: { deckId } }));
    }

    const joined = matchmaker.join(
      session.playerId,
      deckId,
      loaded.value.rating ?? STARTING_RATING,
    );
    if (!joined.ok) return err(joined.error);
    if (joined.value === null) {
      return ok({ queued: true, queueSize: matchmaker.queued });
    }

    const match = joined.value;
    const decks: Record<string, readonly CardDefinitionId[]> = {};
    for (const playerId of match.participants) {
      const state = await players.load(playerId);
      if (!state.ok) return err(state.error);
      const chosen = state.value.decks[match.decks[playerId] ?? ''];
      if (chosen === undefined) {
        return err(
          failure(FailureCode.NotFound, 'match.deck_vanished', {
            detail: 'a deck was removed while its owner waited',
            context: { playerId },
          }),
        );
      }
      decks[playerId] = chosen.cardDefinitionIds;
    }

    const opened = await pvp.open(match, decks);
    if (!opened.ok) return err(opened.error);
    const seat = pvp.seatOf(opened.value, session.playerId);
    if (seat === null) return err(failure(FailureCode.Internal, 'match.seat_missing'));
    return ok(projectDuel(opened.value, seat));
  };

  const leaveQueue: CommandHandler = async (session: Session) => {
    matchmaker.leave(session.playerId);
    return ok({ queued: false, queueSize: matchmaker.queued });
  };

  const act: CommandHandler = async (session: Session, payload: unknown) => {
    const matchId = readString(payload, 'matchId');
    const kind = readString(payload, 'command');
    if (matchId === null || kind === null) {
      return err(invalid('pvp.command_missing', 'matchId and command are required'));
    }
    const handIndexRaw = (payload as { handIndex?: unknown }).handIndex;
    const acted = await pvp.act(matchId, session.playerId, {
      kind,
      ...(typeof handIndexRaw === 'number' ? { handIndex: handIndexRaw } : {}),
    } as never);
    if (!acted.ok) return err(acted.error);
    const seat = pvp.seatOf(acted.value, session.playerId);
    if (seat === null) return err(failure(FailureCode.Unauthorized, 'pvp.not_a_participant'));
    return ok(projectDuel(acted.value, seat));
  };

  const forfeit: CommandHandler = async (session: Session, payload: unknown) => {
    const matchId = readString(payload, 'matchId');
    if (matchId === null) return err(invalid('pvp.match_missing', 'matchId is required'));
    const ended = await pvp.abandon(matchId, session.playerId);
    if (!ended.ok) return err(ended.error);
    const seat = pvp.seatOf(ended.value, session.playerId);
    if (seat === null) return err(failure(FailureCode.Unauthorized, 'pvp.not_a_participant'));
    return ok(projectDuel(ended.value, seat));
  };

  router
    .register('trade.open', openTrade)
    .register('trade.offer', offer)
    .register('trade.confirm', confirm)
    .register('trade.cancel', cancel)
    .register('match.queue', queue)
    .register('match.leave', leaveQueue)
    .register('pvp.act', act)
    .register('pvp.forfeit', forfeit);
}
