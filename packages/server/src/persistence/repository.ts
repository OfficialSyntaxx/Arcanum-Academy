import {
  failure,
  FailureCode,
  err,
  ok,
  type Failure,
  type PlayerId,
  type Result,
} from '@alderfell/shared';

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

export const SAVE_SNAPSHOT_RETENTION = 20;

export interface SaveSnapshot {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly sourceVersion: number;
  readonly schemaVersion: number;
  readonly createdAtMs: number;
  readonly reason: 'SAVE' | 'PRE_RESTORE';
  readonly data: Readonly<Record<string, unknown>>;
}

export interface RestoreAuditReceipt {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly snapshotId: string;
  readonly actor: string;
  readonly reason: string;
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly restoredAtMs: number;
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
  listPlayers(input: {
    readonly query?: string;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<
    Result<
      { readonly records: readonly PlayerRecord[]; readonly nextCursor: string | null },
      Failure
    >
  >;
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
  listSnapshots(playerId: PlayerId): Promise<Result<readonly SaveSnapshot[], Failure>>;
  restoreSnapshot(input: {
    readonly playerId: PlayerId;
    readonly snapshotId: string;
    readonly expectedVersion: number;
    readonly actor: string;
    readonly reason: string;
  }): Promise<
    Result<{ readonly record: PlayerRecord; readonly audit: RestoreAuditReceipt }, Failure>
  >;
  listRestoreAudit(playerId: PlayerId): Promise<Result<readonly RestoreAuditReceipt[], Failure>>;
}

export class InMemoryPlayerRepository implements PlayerRepository {
  private records = new Map<PlayerId, PlayerRecord>();
  private snapshots: SaveSnapshot[] = [];
  private restoreAudit: RestoreAuditReceipt[] = [];
  private nextSnapshotId = 1;
  private nextAuditId = 1;
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
      scratch.snapshots = this.snapshots.slice();
      scratch.restoreAudit = this.restoreAudit.slice();
      scratch.nextSnapshotId = this.nextSnapshotId;
      scratch.nextAuditId = this.nextAuditId;
      try {
        const result = await work(scratch);
        if (result.ok) {
          this.records = scratch.records;
          this.snapshots = scratch.snapshots;
          this.restoreAudit = scratch.restoreAudit;
          this.nextSnapshotId = scratch.nextSnapshotId;
          this.nextAuditId = scratch.nextAuditId;
        } else this.records = snapshot;
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

  async listPlayers(input: {
    readonly query?: string;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<
    Result<
      { readonly records: readonly PlayerRecord[]; readonly nextCursor: string | null },
      Failure
    >
  > {
    const query = input.query?.toLowerCase() ?? '';
    const matches = [...this.records.values()]
      .filter((record) => record.playerId.toLowerCase().includes(query))
      .filter((record) => input.cursor === undefined || record.playerId > input.cursor)
      .sort((a, b) => a.playerId.localeCompare(b.playerId));
    const records = matches.slice(0, input.limit);
    return ok({
      records,
      nextCursor: matches.length > input.limit ? (records.at(-1)?.playerId ?? null) : null,
    });
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
    this.capture(existing, 'SAVE');
    const stored: PlayerRecord = {
      ...record,
      version: existing.version + 1,
      updatedAtMs: this.now(),
    };
    this.records.set(record.playerId, stored);
    return ok(stored);
  }

  async listSnapshots(playerId: PlayerId): Promise<Result<readonly SaveSnapshot[], Failure>> {
    return ok(
      this.snapshots
        .filter((snapshot) => snapshot.playerId === playerId)
        .slice()
        .reverse(),
    );
  }

  async restoreSnapshot(input: {
    readonly playerId: PlayerId;
    readonly snapshotId: string;
    readonly expectedVersion: number;
    readonly actor: string;
    readonly reason: string;
  }): Promise<
    Result<{ readonly record: PlayerRecord; readonly audit: RestoreAuditReceipt }, Failure>
  > {
    if (input.actor.trim() === '' || input.reason.trim() === '')
      return err(failure(FailureCode.Validation, 'snapshot.restore_context_required'));
    const snapshot = this.snapshots.find(
      (candidate) => candidate.id === input.snapshotId && candidate.playerId === input.playerId,
    );
    if (!snapshot) return err(failure(FailureCode.NotFound, 'snapshot.not_found'));
    const current = this.records.get(input.playerId);
    if (!current) return err(failure(FailureCode.NotFound, 'repository.not_found'));
    if (current.version !== input.expectedVersion)
      return err(failure(FailureCode.Conflict, 'repository.version_conflict'));
    this.capture(current, 'PRE_RESTORE');
    const record: PlayerRecord = {
      playerId: current.playerId,
      schemaVersion: snapshot.schemaVersion,
      version: current.version + 1,
      updatedAtMs: this.now(),
      data: structuredClone(snapshot.data),
    };
    this.records.set(input.playerId, record);
    const audit: RestoreAuditReceipt = {
      id: `audit-${this.nextAuditId++}`,
      playerId: input.playerId,
      snapshotId: snapshot.id,
      actor: input.actor.trim(),
      reason: input.reason.trim(),
      beforeVersion: current.version,
      afterVersion: record.version,
      restoredAtMs: record.updatedAtMs,
    };
    this.restoreAudit.push(audit);
    return ok({ record, audit });
  }

  async listRestoreAudit(
    playerId: PlayerId,
  ): Promise<Result<readonly RestoreAuditReceipt[], Failure>> {
    return ok(this.restoreAudit.filter((receipt) => receipt.playerId === playerId));
  }

  private capture(record: PlayerRecord, reason: SaveSnapshot['reason']): void {
    this.snapshots.push({
      id: `snapshot-${this.nextSnapshotId++}`,
      playerId: record.playerId,
      sourceVersion: record.version,
      schemaVersion: record.schemaVersion,
      createdAtMs: this.now(),
      reason,
      data: structuredClone(record.data),
    });
    const owned = this.snapshots.filter((snapshot) => snapshot.playerId === record.playerId);
    if (owned.length <= SAVE_SNAPSHOT_RETENTION) return;
    const remove = new Set(
      owned.slice(0, owned.length - SAVE_SNAPSHOT_RETENTION).map((item) => item.id),
    );
    this.snapshots = this.snapshots.filter((snapshot) => !remove.has(snapshot.id));
  }

  /** Test and local-development helper. Not part of the port. */
  clear(): void {
    this.records.clear();
    this.snapshots = [];
    this.restoreAudit = [];
  }
}
