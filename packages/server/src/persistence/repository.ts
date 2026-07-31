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

export interface PlayerRepository {
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

export class InMemoryPlayerRepository implements PlayerRepository {
  private readonly records = new Map<PlayerId, PlayerRecord>();

  constructor(private readonly now: () => number = () => Date.now()) {}

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
