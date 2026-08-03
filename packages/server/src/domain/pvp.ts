/**
 * Player-versus-player duels.
 *
 * One duel state serves two sessions. The AI duel could live on a player
 * record because only one player could see it; a shared duel cannot, because
 * two records would be two copies and two copies of a duel diverge the moment
 * either is written.
 *
 * The engine is already seat-agnostic, so nothing about the rules changes -
 * this decides only who may act, and settles the ladder when it ends.
 */

import {
  abandonDuel,
  applyDuelCommand,
  startDuel,
  type DuelCommand,
  type DuelState,
} from '@arcanum/sim';
import {
  err,
  failure,
  FailureCode,
  ok,
  type CardCatalog,
  type CardDefinitionId,
  type CombatTunables,
  type Failure,
  type PlayerId,
  type Result,
} from '@arcanum/shared';
import type { PlayerRepository } from '../persistence/repository.js';
import {
  parsePlayerState,
  serialisePlayerState,
  PLAYER_SCHEMA_VERSION,
  type PlayerState,
} from './player-state.js';
import { applyRating, STARTING_RATING, type Match } from './matchmaking.js';

export interface LiveDuel {
  readonly matchId: string;
  readonly participants: readonly [PlayerId, PlayerId];
  readonly state: DuelState;
  /** Set once the ladder has been settled, so it is never settled twice. */
  readonly rated: boolean;
}

export interface LiveDuelStore {
  get(matchId: string): Promise<Result<LiveDuel | null, Failure>>;
  put(duel: LiveDuel): Promise<Result<true, Failure>>;
  forPlayer(playerId: PlayerId): Promise<Result<LiveDuel | null, Failure>>;
}

export class InMemoryLiveDuelStore implements LiveDuelStore {
  private readonly duels = new Map<string, LiveDuel>();

  async get(matchId: string): Promise<Result<LiveDuel | null, Failure>> {
    return ok(this.duels.get(matchId) ?? null);
  }

  async put(duel: LiveDuel): Promise<Result<true, Failure>> {
    this.duels.set(duel.matchId, duel);
    return ok(true);
  }

  async forPlayer(playerId: PlayerId): Promise<Result<LiveDuel | null, Failure>> {
    for (const duel of this.duels.values()) {
      if (duel.state.outcome === null && duel.participants.includes(playerId)) return ok(duel);
    }
    return ok(null);
  }
}

export interface PvpServiceOptions {
  readonly repository: PlayerRepository;
  readonly duels: LiveDuelStore;
  readonly cards: CardCatalog;
  readonly tunables: CombatTunables;
  readonly slotCapacity: number;
}

export class PvpService {
  constructor(private readonly options: PvpServiceOptions) {}

  private lookup = (id: CardDefinitionId) => this.options.cards.get(id);

  /** Which seat a player holds, or null if they are not in this duel. */
  seatOf(duel: LiveDuel, playerId: PlayerId): 0 | 1 | null {
    if (duel.participants[0] === playerId) return 0;
    if (duel.participants[1] === playerId) return 1;
    return null;
  }

  /** Opens the duel a completed pairing describes. */
  async open(
    match: Match,
    decks: Readonly<Record<string, readonly CardDefinitionId[]>>,
  ): Promise<Result<LiveDuel, Failure>> {
    const [first, second] = match.participants;
    const firstDeck = decks[first];
    const secondDeck = decks[second];
    if (firstDeck === undefined || secondDeck === undefined) {
      return err(failure(FailureCode.NotFound, 'pvp.deck_missing'));
    }

    const duel: LiveDuel = {
      matchId: match.id,
      participants: match.participants,
      state: startDuel({
        decks: [firstDeck, secondDeck],
        seed: match.seed,
        lookup: this.lookup,
        tunables: this.options.tunables,
      }),
      rated: false,
    };
    const stored = await this.options.duels.put(duel);
    return stored.ok ? ok(duel) : err(stored.error);
  }

  /**
   * Applies a command from one seat.
   *
   * Acting out of turn is refused rather than queued. A queued command would
   * resolve against a board the player never saw, which is indistinguishable
   * from the game playing itself.
   */
  async act(
    matchId: string,
    playerId: PlayerId,
    command: DuelCommand,
  ): Promise<Result<LiveDuel, Failure>> {
    const loaded = await this.options.duels.get(matchId);
    if (!loaded.ok) return err(loaded.error);
    const duel = loaded.value;
    if (duel === null) return err(failure(FailureCode.NotFound, 'pvp.no_such_duel'));
    if (duel.state.outcome !== null) {
      return err(failure(FailureCode.Validation, 'pvp.already_decided'));
    }

    const seat = this.seatOf(duel, playerId);
    if (seat === null) return err(failure(FailureCode.Unauthorized, 'pvp.not_a_participant'));
    if (duel.state.active !== seat) {
      return err(failure(FailureCode.Validation, 'pvp.not_your_turn'));
    }

    const applied = applyDuelCommand(duel.state, command, {
      lookup: this.lookup,
      tunables: this.options.tunables,
    });
    if (!applied.ok) return err(applied.error);

    return this.commit({ ...duel, state: applied.value });
  }

  /** Ends a duel a player left. The opponent takes the win and the rating. */
  async abandon(matchId: string, playerId: PlayerId): Promise<Result<LiveDuel, Failure>> {
    const loaded = await this.options.duels.get(matchId);
    if (!loaded.ok) return err(loaded.error);
    const duel = loaded.value;
    if (duel === null) return err(failure(FailureCode.NotFound, 'pvp.no_such_duel'));
    if (duel.state.outcome !== null) return ok(duel);

    const seat = this.seatOf(duel, playerId);
    if (seat === null) return err(failure(FailureCode.Unauthorized, 'pvp.not_a_participant'));
    return this.commit({ ...duel, state: abandonDuel(duel.state, seat) });
  }

  private async commit(duel: LiveDuel): Promise<Result<LiveDuel, Failure>> {
    if (duel.state.outcome === null || duel.rated) {
      const stored = await this.options.duels.put(duel);
      return stored.ok ? ok(duel) : err(stored.error);
    }

    const rated = await this.settleRatings(duel);
    if (!rated.ok) return err(rated.error);

    const finished: LiveDuel = { ...duel, rated: true };
    const stored = await this.options.duels.put(finished);
    return stored.ok ? ok(finished) : err(stored.error);
  }

  /**
   * Moves both ratings in one transaction.
   *
   * Elo is zero-sum: writing one side and failing on the other would invent or
   * destroy rating, and a ladder that does not add up is one nobody trusts.
   */
  private async settleRatings(duel: LiveDuel): Promise<Result<true, Failure>> {
    const outcome = duel.state.outcome;
    if (outcome === null) return ok(true);

    return this.options.repository.transaction(async (tx) => {
      const loaded: { playerId: PlayerId; state: PlayerState; version: number }[] = [];
      for (const playerId of duel.participants) {
        const found = await tx.find(playerId);
        if (!found.ok) return err(found.error);
        if (found.value === null) {
          return err(
            failure(FailureCode.NotFound, 'pvp.player_missing', { context: { playerId } }),
          );
        }
        const parsed = parsePlayerState(found.value, this.options.slotCapacity);
        if (!parsed.ok) return err(parsed.error);
        loaded.push({ playerId, state: parsed.value, version: found.value.version });
      }

      const [first, second] = loaded as [(typeof loaded)[0], (typeof loaded)[0]];
      const ratings = [
        first.state.rating ?? STARTING_RATING,
        second.state.rating ?? STARTING_RATING,
      ];

      for (const [index, entry] of [first, second].entries()) {
        const seat = index as 0 | 1;
        const result = outcome.winner === null ? 'DRAW' : outcome.winner === seat ? 'WIN' : 'LOSS';
        const changed = applyRating(ratings[seat]!, ratings[seat === 0 ? 1 : 0]!, result);
        const next: PlayerState = { ...entry.state, rating: changed.rating };
        const saved = await tx.save(
          {
            playerId: entry.playerId,
            schemaVersion: PLAYER_SCHEMA_VERSION,
            data: serialisePlayerState(next),
          },
          entry.version,
        );
        if (!saved.ok) return err(saved.error);
      }
      return ok(true);
    });
  }
}
