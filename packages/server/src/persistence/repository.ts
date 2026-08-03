import {
  failure,
  FailureCode,
  err,
  ok,
  type Failure,
  type PlayerId,
  type Result,
} from '@arcanum/shared';

/**
 * Persistence port.
 *
 * The server depends on this interface, never on a database driver. Phase 1
 * ships the in-memory adapter (used by tests and local development); Phase 6
 * adds a Postgres adapter behind the same interface without touching a single
 * call site.
 *
 * `expectedVersion` implements optimistic concurrency. Two devices writing the
 * same account is not an edge case in a mobile game - it is Tuesday - and
 * last-write-wins is how players lose inventories.
 */

export interface PlayerRecord {
  readonly playerId: PlayerId;
  readonly schemaVersion: number;
  /** Incremented on every successful write. Used for optimistic concurrency. */
  readonly version: number;
  readonly updatedAtMs: number;
  /** Opaque to the repository; validated and migrated by the domain layer. */
  readonly data: Readonly<Record<string, unknown>>;
}

/** The reads and writes available both inside and outside a transaction. */
export interface PlayerStore {
  find(playerId: PlayerId): Promise<Result<PlayerRecord | null, Failure>>;
  /** Creates a record. Fails if one already exists. */
  create(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
  ): Promise<Result<PlayerRecord, Failure>>;
  /** Writes only if the stored version matches `expectedVersion`. */
  save(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
    expectedVersion: number,
  ): Promise<Result<PlayerRecord, Failure>>;
}

export interface PlayerRepository extends PlayerStore {
  /**
   * Runs work atomically: every write inside commits together or none does.
   *
   * This exists because trading moves assets between two records, and an
   * invariant that spans two rows cannot be held by being careful about the
   * order of single-row writes. Remove from the giver first and a failure
   * loses their items; record the offer first and a failure delivers items the
   * giver still holds, which is item duplication - a currency printer in a game
   * with a market.
   *
   * Returning `Err` from `work` rolls back, so a rule that refuses a trade
   * undoes everything it had already written without the caller unwinding by
   * hand. A thrown error rolls back too, and is then rethrown.
   */
  transaction<T>(
    work: (tx: PlayerStore) => Promise<Result<T, Failure>>,
  ): Promise<Result<T, Failure>>;
}

export class InMemoryPlayerRepository implements PlayerRepository {
  private records = new Map<PlayerId, PlayerRecord>();
  /**
   * Serialises transactions.
   *
   * The work inside is async, so two transactions would otherwise interleave
   * and each commit a snapshot taken before the other's writes - losing one of
   * them silently. A queue is heavy-handed for a store meant for tests and
   * local development, and it is exactly right for correctness there.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async transaction<T>(
    work: (tx: PlayerStore) => Promise<Result<T, Failure>>,
  ): Promise<Result<T, Failure>> {
    const run = this.queue.then(async () => {
      const snapshot = new Map(this.records);
      // The work sees a copy. Committing is a swap; rolling back is simply
      // not swapping, so a failed transaction cannot leave a partial write.
      const scratch = new InMemoryPlayerRepository(this.now);
      scratch.records = new Map(this.records);
      try {
        const result = await work(scratch);
        if (result.ok) this.records = scratch.records;
        else this.records = snapshot;
        return result;
      } catch (error) {
        this.records = snapshot;
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async find(playerId: PlayerId): Promise<Result<PlayerRecord | null, Failure>> {
    return ok(this.records.get(playerId) ?? null);
  }

  async create(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
  ): Promise<Result<PlayerRecord, Failure>> {
    if (this.records.has(record.playerId)) {
      return err(
        failure(FailureCode.Conflict, 'repository.already_exists', {
          context: { playerId: record.playerId },
        }),
      );
    }
    const stored: PlayerRecord = { ...record, version: 1, updatedAtMs: this.now() };
    this.records.set(record.playerId, stored);
    return ok(stored);
  }

  async save(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
    expectedVersion: number,
  ): Promise<Result<PlayerRecord, Failure>> {
    const existing = this.records.get(record.playerId);
    if (!existing) {
      return err(
        failure(FailureCode.NotFound, 'repository.not_found', {
          context: { playerId: record.playerId },
        }),
      );
    }
    if (existing.version !== expectedVersion) {
      return err(
        failure(FailureCode.Conflict, 'repository.version_conflict', {
          detail: 'the record was modified by another session',
          context: { expected: expectedVersion, actual: existing.version },
        }),
      );
    }
    const stored: PlayerRecord = {
      ...record,
      version: existing.version + 1,
      updatedAtMs: this.now(),
    };
    this.records.set(record.playerId, stored);
    return ok(stored);
  }

  /** Test and local-development helper. Not part of the port. */
  clear(): void {
    this.records.clear();
  }
}
