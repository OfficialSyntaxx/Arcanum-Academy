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
  type Failure,
  type ItemDefinitionId,
  type ItemStack,
  type PlayerId,
} from '@alderfell/shared';
import type { Session } from '../../session/session-store.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { TradingService } from '../../domain/trading.js';

export interface SocialHandlerOptions {
  readonly trading: TradingService;
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

export function registerSocialHandlers(
  router: RegistryCommandRouter,
  options: SocialHandlerOptions,
): void {
  const { trading } = options;

  const openTrade: CommandHandler = async (session: Session, payload: unknown) => {
    const partnerId = readString(payload, 'partnerId');
    if (partnerId === null) return err(invalid('trade.partner_missing', 'partnerId is required'));
    const opened = await trading.open(session.playerId, partnerId as PlayerId);
    return opened.ok ? ok(opened.value) : err(opened.error);
  };

  const offer: CommandHandler = async (session: Session, payload: unknown) => {
    const tradeId = readString(payload, 'tradeId');
    const stacks = readStacks(payload);
    if (tradeId === null || stacks === null) {
      return err(invalid('trade.offer_malformed', 'tradeId and stacks are required'));
    }
    const offered = await trading.offer(tradeId, session.playerId, stacks);
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
  router
    .register('trade.open', openTrade)
    .register('trade.offer', offer)
    .register('trade.confirm', confirm)
    .register('trade.cancel', cancel);
}
