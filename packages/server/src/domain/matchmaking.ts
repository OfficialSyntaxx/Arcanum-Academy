/**
 * Matchmaking and rating.
 *
 * A queue rather than a lobby: players ask for a match and are paired, which
 * needs no shared room state and reconnects trivially - a client that dropped
 * simply asks again.
 *
 * Pairing widens over time. Insisting on an exact rating match leaves the first
 * and last players in a small population waiting forever, so the acceptable
 * gap grows the longer someone has been waiting. That is the whole trade: a
 * fair match you never get is worse than a slightly uneven one you get now.
 */

import {
  err,
  failure,
  FailureCode,
  generateId,
  ok,
  type Failure,
  type PlayerId,
  type Result,
} from '@arcanum/shared';

/** Everyone starts here, which is also the population's centre of mass. */
export const STARTING_RATING = 1_200;

export interface QueueEntry {
  readonly playerId: PlayerId;
  readonly deckId: string;
  readonly rating: number;
  readonly queuedAtMs: number;
}

export interface Match {
  readonly id: string;
  readonly participants: readonly [PlayerId, PlayerId];
  readonly decks: Readonly<Record<string, string>>;
  readonly seed: string;
  readonly createdAtMs: number;
}

export interface MatchmakingOptions {
  /** Rating gap accepted immediately. */
  readonly baseSpread: number;
  /** Extra gap accepted for each second spent waiting. */
  readonly spreadPerSecond: number;
  /** Ceiling on the gap, so a queue never pairs wildly mismatched players. */
  readonly maxSpread: number;
  readonly now: () => number;
}

export class Matchmaker {
  private readonly waiting = new Map<PlayerId, QueueEntry>();

  constructor(private readonly options: MatchmakingOptions) {}

  get queued(): number {
    return this.waiting.size;
  }

  isQueued(playerId: PlayerId): boolean {
    return this.waiting.has(playerId);
  }

  leave(playerId: PlayerId): void {
    this.waiting.delete(playerId);
  }

  /** The rating gap a player will currently accept. */
  private tolerance(entry: QueueEntry): number {
    const waitedSeconds = Math.max(0, (this.options.now() - entry.queuedAtMs) / 1_000);
    return Math.min(
      this.options.maxSpread,
      this.options.baseSpread + waitedSeconds * this.options.spreadPerSecond,
    );
  }

  /**
   * Joins the queue, pairing immediately if someone suitable is waiting.
   *
   * Either side's tolerance is enough. Requiring both would make the widening
   * pointless: a newcomer's narrow range would block every long-waiting player,
   * which is precisely the starvation the widening exists to prevent. The
   * player who has waited has earned a wider search, and in a small population
   * an uneven match now beats a fair one that never arrives.
   */
  join(playerId: PlayerId, deckId: string, rating: number): Result<Match | null, Failure> {
    if (this.waiting.has(playerId)) {
      return err(failure(FailureCode.Conflict, 'match.already_queued'));
    }

    const entry: QueueEntry = { playerId, deckId, rating, queuedAtMs: this.options.now() };

    // Nearest rating first, with the player id breaking ties so two servers
    // replaying the same queue reach the same pairing.
    const candidates = [...this.waiting.values()].sort(
      (a, b) =>
        Math.abs(a.rating - rating) - Math.abs(b.rating - rating) ||
        a.playerId.localeCompare(b.playerId),
    );

    for (const candidate of candidates) {
      const gap = Math.abs(candidate.rating - rating);
      if (gap <= Math.max(this.tolerance(candidate), this.tolerance(entry))) {
        this.waiting.delete(candidate.playerId);
        return ok({
          id: generateId(),
          participants: [candidate.playerId, playerId],
          decks: { [candidate.playerId]: candidate.deckId, [playerId]: deckId },
          // Seeded from both players and the moment, so neither can predict
          // the shuffle by choosing when to queue.
          seed: `${candidate.playerId}:${playerId}:${this.options.now()}`,
          createdAtMs: this.options.now(),
        });
      }
    }

    this.waiting.set(playerId, entry);
    return ok(null);
  }
}

/**
 * Elo, with a fixed K.
 *
 * A rating system whose adjustments a player cannot predict feels arbitrary,
 * and Elo is the one most people already understand. The K factor is constant
 * rather than tapering with games played: tapering makes an established
 * player's rating stubborn, which reads as the ladder ignoring recent results.
 */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export interface RatingChange {
  readonly rating: number;
  readonly delta: number;
}

export function applyRating(
  rating: number,
  opponentRating: number,
  outcome: 'WIN' | 'LOSS' | 'DRAW',
  kFactor = 24,
): RatingChange {
  const score = outcome === 'WIN' ? 1 : outcome === 'DRAW' ? 0.5 : 0;
  const delta = Math.round(kFactor * (score - expectedScore(rating, opponentRating)));
  // Ratings are integers: a fractional rating is not something a player can
  // reason about, and rounding once here keeps the ladder's arithmetic exact.
  return { rating: Math.max(0, rating + delta), delta };
}
