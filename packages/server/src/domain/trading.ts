/**
 * Player-to-player trading.
 *
 * Every mutation runs inside one transaction, so assets exist in exactly one
 * place at every observable moment. That is the whole design: an item is in a
 * satchel or it is in escrow, never both and never neither, and no partial
 * write can be observed because none is ever committed.
 *
 * The flow is deliberately four steps rather than one atomic swap. Both sides
 * must see what they are getting before either commits, and a trade nobody can
 * inspect before agreeing to it is how people are defrauded.
 *
 *   open    - one player proposes to another
 *   offer   - each moves assets out of their satchel and into escrow
 *   confirm - each agrees to what is on the table
 *   settle  - on the second confirmation, escrow crosses over
 *
 * Any change to an offer clears both confirmations. Otherwise a player could
 * confirm, watch the other swap a slab for a shard, and be held to it.
 */

import {
  err,
  failure,
  FailureCode,
  generateId,
  ok,
  type CardInstance,
  type Failure,
  type ItemCatalog,
  type ItemStack,
  type PlayerId,
  type Result,
} from '@arcanum/shared';
import { addItems, removeItems, type Inventory } from '@arcanum/sim';
import type { PlayerRepository, PlayerStore } from '../persistence/repository.js';
import {
  parsePlayerState,
  serialisePlayerState,
  PLAYER_SCHEMA_VERSION,
  type PlayerState,
} from './player-state.js';

export const TradeState = {
  Open: 'OPEN',
  Settled: 'SETTLED',
  Cancelled: 'CANCELLED',
} as const;
export type TradeState = (typeof TradeState)[keyof typeof TradeState];

export interface TradeOffer {
  readonly stacks: readonly ItemStack[];
  readonly cardInstanceIds: readonly string[];
  readonly confirmed: boolean;
}

export interface Trade {
  readonly id: string;
  readonly participants: readonly [PlayerId, PlayerId];
  readonly offers: Readonly<Record<string, TradeOffer>>;
  /**
   * The card instances actually held in escrow, per player.
   *
   * Carried on the trade rather than referenced by id on a player record, so
   * settlement never has to trust either side's copy for what was offered.
   * `offers` says what was promised; this is what is held.
   */
  readonly escrow: Readonly<Record<string, readonly CardInstance[]>>;
  readonly state: TradeState;
  readonly openedAtMs: number;
  /**
   * Append-only record of everything that happened.
   *
   * A trade dispute is unanswerable without one, and reconstructing it from
   * two players' inventories after the fact is guesswork.
   */
  readonly ledger: readonly string[];
}

export interface TradeStore {
  get(tradeId: string): Promise<Result<Trade | null, Failure>>;
  put(trade: Trade): Promise<Result<true, Failure>>;
  /** The open trade a player is engaged in, if any. */
  openFor(playerId: PlayerId): Promise<Result<Trade | null, Failure>>;
}

export class InMemoryTradeStore implements TradeStore {
  private readonly trades = new Map<string, Trade>();

  async get(tradeId: string): Promise<Result<Trade | null, Failure>> {
    return ok(this.trades.get(tradeId) ?? null);
  }

  async put(trade: Trade): Promise<Result<true, Failure>> {
    this.trades.set(trade.id, trade);
    return ok(true);
  }

  async openFor(playerId: PlayerId): Promise<Result<Trade | null, Failure>> {
    for (const trade of this.trades.values()) {
      if (trade.state === TradeState.Open && trade.participants.includes(playerId)) {
        return ok(trade);
      }
    }
    return ok(null);
  }
}

function emptyOffer(): TradeOffer {
  return { stacks: [], cardInstanceIds: [], confirmed: false };
}

function otherParty(trade: Trade, playerId: PlayerId): PlayerId {
  return trade.participants[0] === playerId ? trade.participants[1] : trade.participants[0];
}

export interface TradingServiceOptions {
  readonly repository: PlayerRepository;
  readonly trades: TradeStore;
  readonly catalog: ItemCatalog;
  readonly slotCapacity: number;
  readonly now: () => number;
}

export class TradingService {
  constructor(private readonly options: TradingServiceOptions) {}

  private async load(tx: PlayerStore, playerId: PlayerId) {
    const found = await tx.find(playerId);
    if (!found.ok) return err(found.error);
    if (found.value === null) {
      return err(failure(FailureCode.NotFound, 'trade.player_missing', { context: { playerId } }));
    }
    const parsed = parsePlayerState(found.value, this.options.slotCapacity);
    if (!parsed.ok) return err(parsed.error);
    return ok({ record: found.value, state: parsed.value });
  }

  private async store(
    tx: PlayerStore,
    playerId: PlayerId,
    state: PlayerState,
    version: number,
  ): Promise<Result<true, Failure>> {
    const saved = await tx.save(
      { playerId, schemaVersion: PLAYER_SCHEMA_VERSION, data: serialisePlayerState(state) },
      version,
    );
    return saved.ok ? ok(true) : err(saved.error);
  }

  /** Proposes a trade. Neither side may already be in one. */
  async open(initiator: PlayerId, partner: PlayerId): Promise<Result<Trade, Failure>> {
    if (initiator === partner) {
      return err(failure(FailureCode.Validation, 'trade.self_trade'));
    }
    for (const playerId of [initiator, partner]) {
      const existing = await this.options.trades.openFor(playerId);
      if (!existing.ok) return err(existing.error);
      if (existing.value !== null) {
        return err(
          failure(FailureCode.Conflict, 'trade.already_trading', { context: { playerId } }),
        );
      }
    }

    const trade: Trade = {
      id: generateId(),
      participants: [initiator, partner],
      offers: { [initiator]: emptyOffer(), [partner]: emptyOffer() },
      escrow: { [initiator]: [], [partner]: [] },
      state: TradeState.Open,
      openedAtMs: this.options.now(),
      ledger: [`${this.options.now()} opened by ${initiator} with ${partner}`],
    };
    const stored = await this.options.trades.put(trade);
    if (!stored.ok) return err(stored.error);
    return ok(trade);
  }

  /**
   * Moves assets from a satchel into escrow.
   *
   * The removal and the escrow record commit together, so an item is never
   * counted twice and never lost between the two.
   */
  async offer(
    tradeId: string,
    playerId: PlayerId,
    stacks: readonly ItemStack[],
    cardInstanceIds: readonly string[],
  ): Promise<Result<Trade, Failure>> {
    const loaded = await this.options.trades.get(tradeId);
    if (!loaded.ok) return err(loaded.error);
    const trade = loaded.value;
    if (trade === null || trade.state !== TradeState.Open) {
      return err(failure(FailureCode.NotFound, 'trade.not_open', { context: { tradeId } }));
    }
    if (!trade.participants.includes(playerId)) {
      return err(failure(FailureCode.Unauthorized, 'trade.not_a_participant'));
    }

    const outcome = await this.options.repository.transaction(async (tx) => {
      const loadedPlayer = await this.load(tx, playerId);
      if (!loadedPlayer.ok) return err(loadedPlayer.error);
      const { record, state } = loadedPlayer.value;

      let inventory: Inventory = state.inventory;
      // Anything previously escrowed goes back first, so an offer replaces
      // rather than accumulates - otherwise offering twice quietly doubles it.
      const previous = trade.offers[playerId] ?? emptyOffer();
      for (const stack of previous.stacks) {
        const returned = addItems(
          inventory,
          stack.definitionId,
          stack.quantity,
          this.options.catalog,
        );
        if (!returned.ok) return err(returned.error);
        inventory = returned.value;
      }
      let cards = [...state.cards, ...(trade.escrow[playerId] ?? [])];

      for (const stack of stacks) {
        const taken = removeItems(inventory, stack.definitionId, stack.quantity);
        if (!taken.ok) return err(taken.error);
        inventory = taken.value;
      }

      const escrowedCards: CardInstance[] = [];
      for (const instanceId of cardInstanceIds) {
        const index = cards.findIndex((card) => card.instanceId === instanceId);
        if (index === -1) {
          return err(
            failure(FailureCode.Conflict, 'trade.card_not_owned', { context: { instanceId } }),
          );
        }
        escrowedCards.push(cards[index]!);
        cards = [...cards.slice(0, index), ...cards.slice(index + 1)];
      }

      const next: PlayerState = { ...state, inventory, cards };
      const stored = await this.store(tx, playerId, next, record.version);
      if (!stored.ok) return err(stored.error);

      // Both confirmations are cleared: agreeing to one set of terms must not
      // survive the terms changing.
      const updated: Trade = {
        ...trade,
        offers: {
          ...clearedConfirmations(trade),
          [playerId]: { stacks, cardInstanceIds, confirmed: false },
        },
        escrow: { ...trade.escrow, [playerId]: escrowedCards },
        ledger: [
          ...trade.ledger,
          `${this.options.now()} ${playerId} offered ${stacks.length} stack(s), ${cardInstanceIds.length} card(s)`,
        ],
      };
      return ok({ trade: updated });
    });

    if (!outcome.ok) return err(outcome.error);
    const stored = await this.options.trades.put(outcome.value.trade);
    if (!stored.ok) return err(stored.error);
    return ok(outcome.value.trade);
  }

  /** Agrees to what is on the table. The second confirmation settles. */
  async confirm(tradeId: string, playerId: PlayerId): Promise<Result<Trade, Failure>> {
    const loaded = await this.options.trades.get(tradeId);
    if (!loaded.ok) return err(loaded.error);
    const trade = loaded.value;
    if (trade === null || trade.state !== TradeState.Open) {
      return err(failure(FailureCode.NotFound, 'trade.not_open'));
    }
    if (!trade.participants.includes(playerId)) {
      return err(failure(FailureCode.Unauthorized, 'trade.not_a_participant'));
    }

    const confirmed: Trade = {
      ...trade,
      offers: {
        ...trade.offers,
        [playerId]: { ...(trade.offers[playerId] ?? emptyOffer()), confirmed: true },
      },
      ledger: [...trade.ledger, `${this.options.now()} ${playerId} confirmed`],
    };

    const bothAgreed = confirmed.participants.every(
      (party) => confirmed.offers[party]?.confirmed === true,
    );
    if (!bothAgreed) {
      const stored = await this.options.trades.put(confirmed);
      return stored.ok ? ok(confirmed) : err(stored.error);
    }

    return this.settle(confirmed);
  }

  /**
   * Delivers both escrows in one transaction.
   *
   * Either both players receive what they were promised or neither does and
   * everything stays in escrow to be cancelled back. There is no arrangement
   * of two separate writes that achieves this, which is why the transactional
   * port exists.
   */
  private async settle(trade: Trade): Promise<Result<Trade, Failure>> {
    const settled = await this.options.repository.transaction(async (tx) => {
      for (const receiver of trade.participants) {
        const giver = otherParty(trade, receiver);
        const incoming = trade.offers[giver] ?? emptyOffer();

        const loaded = await this.load(tx, receiver);
        if (!loaded.ok) return err(loaded.error);
        const { record, state } = loaded.value;

        let inventory = state.inventory;
        for (const stack of incoming.stacks) {
          const added = addItems(
            inventory,
            stack.definitionId,
            stack.quantity,
            this.options.catalog,
          );
          // A full satchel refuses the whole trade rather than dropping the
          // overflow. Silently destroying something a player just agreed to
          // receive is worse than making them clear a slot.
          if (!added.ok) {
            return err(
              failure(FailureCode.Conflict, 'trade.no_room', {
                detail: 'a participant cannot hold what they were offered',
                context: { playerId: receiver },
              }),
            );
          }
          inventory = added.value;
        }

        const next: PlayerState = {
          ...state,
          inventory,
          cards: [...state.cards, ...(trade.escrow[giver] ?? [])],
        };
        const stored = await this.store(tx, receiver, next, record.version);
        if (!stored.ok) return err(stored.error);
      }
      return ok(true);
    });

    if (!settled.ok) return err(settled.error);

    const done: Trade = {
      ...trade,
      state: TradeState.Settled,
      ledger: [...trade.ledger, `${this.options.now()} settled`],
    };
    const stored = await this.options.trades.put(done);
    return stored.ok ? ok(done) : err(stored.error);
  }

  /** Cancels an open trade, returning every escrowed asset to its owner. */
  async cancel(tradeId: string, playerId: PlayerId): Promise<Result<Trade, Failure>> {
    const loaded = await this.options.trades.get(tradeId);
    if (!loaded.ok) return err(loaded.error);
    const trade = loaded.value;
    if (trade === null || trade.state !== TradeState.Open) {
      return err(failure(FailureCode.NotFound, 'trade.not_open'));
    }
    if (!trade.participants.includes(playerId)) {
      return err(failure(FailureCode.Unauthorized, 'trade.not_a_participant'));
    }

    const returned = await this.options.repository.transaction(async (tx) => {
      for (const owner of trade.participants) {
        const offer = trade.offers[owner] ?? emptyOffer();
        if (offer.stacks.length === 0 && offer.cardInstanceIds.length === 0) continue;

        const loadedOwner = await this.load(tx, owner);
        if (!loadedOwner.ok) return err(loadedOwner.error);
        const { record, state } = loadedOwner.value;

        let inventory = state.inventory;
        for (const stack of offer.stacks) {
          const added = addItems(
            inventory,
            stack.definitionId,
            stack.quantity,
            this.options.catalog,
          );
          if (!added.ok) return err(added.error);
          inventory = added.value;
        }
        const next: PlayerState = {
          ...state,
          inventory,
          cards: [...state.cards, ...(trade.escrow[owner] ?? [])],
        };
        const stored = await this.store(tx, owner, next, record.version);
        if (!stored.ok) return err(stored.error);
      }
      return ok(true);
    });

    if (!returned.ok) return err(returned.error);

    const cancelled: Trade = {
      ...trade,
      state: TradeState.Cancelled,
      ledger: [...trade.ledger, `${this.options.now()} cancelled by ${playerId}`],
    };
    const stored = await this.options.trades.put(cancelled);
    return stored.ok ? ok(cancelled) : err(stored.error);
  }
}

function clearedConfirmations(trade: Trade): Record<string, TradeOffer> {
  const cleared: Record<string, TradeOffer> = {};
  for (const [party, offer] of Object.entries(trade.offers)) {
    cleared[party] = { ...offer, confirmed: false };
  }
  return cleared;
}
