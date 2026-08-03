/**
 * Loading and mutating player state under optimistic concurrency.
 *
 * Every command reads a record, applies a pure rule to it and writes it back
 * with the version it read. If another connection committed in between, the
 * write is refused and the whole operation is retried against fresh state
 * rather than merged - merging two inventories after the fact is guesswork,
 * whereas re-running the rule is exact.
 *
 * The retry matters because `Gateway.receive` does not serialise commands per
 * player: two frames arriving together run concurrently, and a phone with a
 * flaky connection resending is the ordinary case rather than the exotic one.
 */

import {
  err,
  failure,
  FailureCode,
  ok,
  type Failure,
  type PlayerId,
  type Result,
} from '@arcanum/shared';
import type { PlayerRepository } from '../persistence/repository.js';
import {
  createInitialState,
  emptyRecord,
  parsePlayerState,
  PLAYER_SCHEMA_VERSION,
  serialisePlayerState,
  type PlayerState,
} from './player-state.js';

/**
 * Attempts before giving up on a contended record.
 *
 * Three is chosen because a fourth conflict almost always means sustained
 * contention rather than a collision, and retrying into that only delays the
 * error the client needs to see.
 */
const MAX_ATTEMPTS = 3;

export interface PlayerServiceOptions {
  readonly repository: PlayerRepository;
  readonly slotCapacity: number;
  readonly now: () => number;
}

/** What a mutation produced, alongside the state to store. */
export interface Mutation<T> {
  readonly state: PlayerState;
  readonly value: T;
}

export class PlayerService {
  constructor(private readonly options: PlayerServiceOptions) {}

  /** Loads a player, creating them on first sight. */
  async load(playerId: PlayerId): Promise<Result<PlayerState, Failure>> {
    const found = await this.options.repository.find(playerId);
    if (!found.ok) return err(found.error);

    if (found.value !== null) {
      return parsePlayerState(found.value, this.options.slotCapacity);
    }

    const initial = createInitialState(this.options.slotCapacity, this.options.now());
    const created = await this.options.repository.create(emptyRecord(playerId, initial));
    if (created.ok) return ok(initial);

    // Losing the race to create is not an error: another connection for the
    // same player got there first, and its record is as good as ours.
    if (created.error.reason === 'repository.already_exists') {
      const reread = await this.options.repository.find(playerId);
      if (!reread.ok) return err(reread.error);
      if (reread.value !== null) {
        return parsePlayerState(reread.value, this.options.slotCapacity);
      }
    }
    return err(created.error);
  }

  /**
   * Applies a pure mutation and stores the result.
   *
   * `mutate` may be called more than once. It must not have side effects of its
   * own - everything it changes has to travel in the state it returns.
   */
  async update<T>(
    playerId: PlayerId,
    mutate: (state: PlayerState) => Result<Mutation<T>, Failure>,
  ): Promise<Result<T, Failure>> {
    let lastConflict: Failure | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const found = await this.options.repository.find(playerId);
      if (!found.ok) return err(found.error);

      let expectedVersion: number;
      let current: PlayerState;

      if (found.value === null) {
        const initial = createInitialState(this.options.slotCapacity, this.options.now());
        const created = await this.options.repository.create(emptyRecord(playerId, initial));
        if (!created.ok) {
          if (created.error.reason === 'repository.already_exists') continue;
          return err(created.error);
        }
        expectedVersion = created.value.version;
        current = initial;
      } else {
        const parsed = parsePlayerState(found.value, this.options.slotCapacity);
        if (!parsed.ok) return err(parsed.error);
        expectedVersion = found.value.version;
        current = parsed.value;
      }

      const mutated = mutate(current);
      // A rejected rule is final. Retrying would only ask the same question of
      // the same state and get the same answer.
      if (!mutated.ok) return err(mutated.error);

      const saved = await this.options.repository.save(
        {
          playerId,
          schemaVersion: PLAYER_SCHEMA_VERSION,
          data: serialisePlayerState(mutated.value.state),
        },
        expectedVersion,
      );
      if (saved.ok) return ok(mutated.value.value);

      if (saved.error.reason !== 'repository.version_conflict') return err(saved.error);
      lastConflict = saved.error;
    }

    return err(
      lastConflict ??
        failure(FailureCode.Conflict, 'player.write_contended', {
          detail: 'the record changed under every attempt',
        }),
    );
  }
}
