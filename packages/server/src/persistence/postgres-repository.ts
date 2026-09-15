import pg from 'pg';
import {
  failure,
  FailureCode,
  err,
  ok,
  type Failure,
  type Logger,
  type PlayerId,
  type Result,
} from '@alderfell/shared';
import {
  SAVE_SNAPSHOT_RETENTION,
  type PlayerRecord,
  type PlayerRepository,
  type PlayerStore,
  type RestoreAuditReceipt,
  type SaveSnapshot,
} from './repository.js';

/**
 * Postgres adapter for the persistence port.
 *
 * The interesting part is `save`. Optimistic concurrency is enforced by the
 * `WHERE version = $n` clause rather than by reading the row first and
 * comparing in JavaScript: a read-then-write leaves a window in which another
 * connection can commit between the two statements, which is exactly the lost
 * update the port exists to prevent. A conditional UPDATE has no such window,
 * because the database evaluates the predicate and the write atomically.
 *
 * Player state is stored as `jsonb` in one column. The repository is
 * deliberately incurious about its shape - the domain layer owns validation and
 * migration - and this keeps adding a field to inventory from becoming a schema
 * change. `schema_version` travels with the row so the domain layer can migrate
 * forward on read.
 */

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS player_records (
    player_id      TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    version        INTEGER NOT NULL,
    updated_at_ms  BIGINT  NOT NULL,
    data           JSONB   NOT NULL
  )
`;

export const CREATE_SNAPSHOT_TABLES = `
  CREATE TABLE IF NOT EXISTS player_save_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    player_id       TEXT NOT NULL,
    source_version  INTEGER NOT NULL,
    schema_version  INTEGER NOT NULL,
    created_at_ms   BIGINT NOT NULL,
    reason          TEXT NOT NULL CHECK (reason IN ('SAVE', 'PRE_RESTORE')),
    data            JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS player_save_snapshots_owner_idx
    ON player_save_snapshots (player_id, id DESC);
  CREATE TABLE IF NOT EXISTS player_restore_audit (
    id              BIGSERIAL PRIMARY KEY,
    player_id       TEXT NOT NULL,
    snapshot_id     BIGINT NOT NULL,
    actor           TEXT NOT NULL,
    reason          TEXT NOT NULL,
    before_version  INTEGER NOT NULL,
    after_version   INTEGER NOT NULL,
    restored_at_ms  BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS player_restore_audit_owner_idx
    ON player_restore_audit (player_id, id ASC)
`;

interface Row {
  readonly player_id: string;
  readonly schema_version: number;
  readonly version: number;
  readonly updated_at_ms: string;
  readonly data: Record<string, unknown>;
}

function toRecord(row: Row): PlayerRecord {
  return {
    playerId: row.player_id as PlayerId,
    schemaVersion: row.schema_version,
    version: row.version,
    // node-postgres returns BIGINT as a string to avoid silently truncating
    // values beyond Number's exact range. Millisecond timestamps are far
    // inside it, so the conversion is safe.
    updatedAtMs: Number(row.updated_at_ms),
    data: row.data,
  };
}

/** Wraps a driver error so a connection string can never reach a client. */
function storageFailure(operation: string, error: unknown): Failure {
  return failure(FailureCode.Storage, 'repository.query_failed', {
    detail: `${operation}: ${error instanceof Error ? error.message : String(error)}`,
  });
}

export interface PostgresPlayerRepositoryOptions {
  readonly connectionString: string;
  readonly poolMax: number;
  readonly logger: Logger;
  readonly now?: () => number;
}

/**
 * Render's private Postgres hostnames resolve only inside its network and use
 * a managed self-signed certificate. Keep that exception constrained to the
 * internal `dpg-*` hostname shape; every other remote database stays verified.
 */
export function postgresSslConfiguration(connectionString: string): pg.PoolConfig['ssl'] {
  const hostname = new URL(connectionString).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;

  return /^dpg-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hostname)
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true };
}

/**
 * The queries, bound to whichever connection is executing them.
 *
 * A transaction must run every statement on the *same* checked-out client:
 * `BEGIN` on one connection and an `UPDATE` on another are two unrelated
 * sessions, and the update would commit on its own. Binding the queries to a
 * client rather than to the pool is what makes that impossible to get wrong.
 */
class PostgresPlayerStore implements PlayerStore {
  constructor(
    private readonly client: Pick<pg.Pool, 'query'> | pg.PoolClient,
    private readonly now: () => number,
  ) {}

  async find(playerId: PlayerId): Promise<Result<PlayerRecord | null, Failure>> {
    try {
      const result = await this.client.query<Row>(
        'SELECT player_id, schema_version, version, updated_at_ms, data FROM player_records WHERE player_id = $1',
        [playerId],
      );
      const row = result.rows[0];
      return ok(row === undefined ? null : toRecord(row));
    } catch (error) {
      return err(storageFailure('find', error));
    }
  }

  async create(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
  ): Promise<Result<PlayerRecord, Failure>> {
    const updatedAtMs = this.now();
    try {
      const result = await this.client.query<Row>(
        `INSERT INTO player_records (player_id, schema_version, version, updated_at_ms, data)
         VALUES ($1, $2, 1, $3, $4)
         ON CONFLICT (player_id) DO NOTHING
         RETURNING player_id, schema_version, version, updated_at_ms, data`,
        [record.playerId, record.schemaVersion, updatedAtMs, record.data],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return err(
          failure(FailureCode.Conflict, 'repository.already_exists', {
            context: { playerId: record.playerId },
          }),
        );
      }
      return ok(toRecord(row));
    } catch (error) {
      return err(storageFailure('create', error));
    }
  }

  async save(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
    expectedVersion: number,
  ): Promise<Result<PlayerRecord, Failure>> {
    const updatedAtMs = this.now();
    try {
      await this.client.query(
        `INSERT INTO player_save_snapshots
          (player_id, source_version, schema_version, created_at_ms, reason, data)
         SELECT player_id, version, schema_version, $3, 'SAVE', data
           FROM player_records
          WHERE player_id = $1 AND version = $2`,
        [record.playerId, expectedVersion, updatedAtMs],
      );
      const result = await this.client.query<Row>(
        `UPDATE player_records
            SET schema_version = $2, version = version + 1, updated_at_ms = $3, data = $4
          WHERE player_id = $1 AND version = $5
      RETURNING player_id, schema_version, version, updated_at_ms, data`,
        [record.playerId, record.schemaVersion, updatedAtMs, record.data, expectedVersion],
      );
      const row = result.rows[0];
      if (row !== undefined) {
        await this.client.query(
          `DELETE FROM player_save_snapshots
            WHERE player_id = $1 AND id NOT IN (
              SELECT id FROM player_save_snapshots
               WHERE player_id = $1 ORDER BY id DESC LIMIT $2
            )`,
          [record.playerId, SAVE_SNAPSHOT_RETENTION],
        );
        return ok(toRecord(row));
      }

      const current = await this.client.query<{ version: number }>(
        'SELECT version FROM player_records WHERE player_id = $1',
        [record.playerId],
      );
      const existing = current.rows[0];
      if (existing === undefined) {
        return err(
          failure(FailureCode.NotFound, 'repository.not_found', {
            context: { playerId: record.playerId },
          }),
        );
      }
      return err(
        failure(FailureCode.Conflict, 'repository.version_conflict', {
          detail: 'the record was modified by another session',
          context: { expected: expectedVersion, actual: existing.version },
        }),
      );
    } catch (error) {
      return err(storageFailure('save', error));
    }
  }
}

export class PostgresPlayerRepository implements PlayerRepository {
  /**
   * Shared with the serial minter so both use one connection budget. Free
   * Postgres tiers cap connections well below what two pools would open.
   */
  readonly client: pg.Pool;
  private readonly now: () => number;

  constructor(options: PostgresPlayerRepositoryOptions) {
    this.now = options.now ?? (() => Date.now());
    this.client = new pg.Pool({
      connectionString: options.connectionString,
      max: options.poolMax,
      ssl: postgresSslConfiguration(options.connectionString),
    });

    // An idle client erroring is normal - managed providers recycle
    // connections - and must not take the process down as an unhandled error.
    this.client.on('error', (error) => {
      options.logger.warn('idle pool client errored', { error: error.message });
    });
  }

  /**
   * Creates the table if it is absent.
   *
   * These additive, idempotent tables are adequate while no deployed column is
   * changed or removed. The first destructive alteration must graduate to ordered
   * migration files; `createMigrationRunner` already models that forward-only chain.
   */
  async initialise(): Promise<Result<true, Failure>> {
    try {
      await this.client.query(CREATE_TABLE);
      await this.client.query(CREATE_SNAPSHOT_TABLES);
      return ok(true);
    } catch (error) {
      return err(storageFailure('initialise', error));
    }
  }

  private get pooled(): PlayerStore {
    return new PostgresPlayerStore(this.client, this.now);
  }

  async find(playerId: PlayerId): Promise<Result<PlayerRecord | null, Failure>> {
    return this.pooled.find(playerId);
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
    try {
      const literalQuery = (input.query ?? '')
        .replaceAll('\\', '\\\\')
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
      const result = await this.client.query<Row>(
        `SELECT player_id, schema_version, version, updated_at_ms, data
           FROM player_records
          WHERE player_id ILIKE $1 ESCAPE '\\' AND player_id > $2
          ORDER BY player_id ASC LIMIT $3`,
        [`%${literalQuery}%`, input.cursor ?? '', input.limit + 1],
      );
      const hasMore = result.rows.length > input.limit;
      const records = result.rows.slice(0, input.limit).map(toRecord);
      return ok({
        records,
        nextCursor: hasMore ? (records.at(-1)?.playerId ?? null) : null,
      });
    } catch (error) {
      return err(storageFailure('list players', error));
    }
  }

  async create(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
  ): Promise<Result<PlayerRecord, Failure>> {
    return this.pooled.create(record);
  }

  async save(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
    expectedVersion: number,
  ): Promise<Result<PlayerRecord, Failure>> {
    return this.transaction((tx) => tx.save(record, expectedVersion));
  }

  async listSnapshots(playerId: PlayerId): Promise<Result<readonly SaveSnapshot[], Failure>> {
    try {
      const result = await this.client.query<{
        id: string;
        player_id: string;
        source_version: number;
        schema_version: number;
        created_at_ms: string;
        reason: 'SAVE' | 'PRE_RESTORE';
        data: Record<string, unknown>;
      }>(
        `SELECT id, player_id, source_version, schema_version, created_at_ms, reason, data
           FROM player_save_snapshots WHERE player_id = $1 ORDER BY id DESC LIMIT $2`,
        [playerId, SAVE_SNAPSHOT_RETENTION],
      );
      return ok(
        result.rows.map((row) => ({
          id: row.id,
          playerId: row.player_id as PlayerId,
          sourceVersion: row.source_version,
          schemaVersion: row.schema_version,
          createdAtMs: Number(row.created_at_ms),
          reason: row.reason,
          data: row.data,
        })),
      );
    } catch (error) {
      return err(storageFailure('list snapshots', error));
    }
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
    let client: pg.PoolClient;
    try {
      client = await this.client.connect();
    } catch (error) {
      return err(storageFailure('open restore transaction', error));
    }
    try {
      await client.query('BEGIN');
      const snapshotResult = await client.query<{
        id: string;
        schema_version: number;
        data: Record<string, unknown>;
      }>(
        `SELECT id, schema_version, data FROM player_save_snapshots
          WHERE id = $1 AND player_id = $2`,
        [input.snapshotId, input.playerId],
      );
      const snapshot = snapshotResult.rows[0];
      if (!snapshot) {
        await client.query('ROLLBACK');
        return err(failure(FailureCode.NotFound, 'snapshot.not_found'));
      }
      const currentResult = await client.query<Row>(
        `SELECT player_id, schema_version, version, updated_at_ms, data
           FROM player_records WHERE player_id = $1 FOR UPDATE`,
        [input.playerId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return err(failure(FailureCode.NotFound, 'repository.not_found'));
      }
      if (current.version !== input.expectedVersion) {
        await client.query('ROLLBACK');
        return err(failure(FailureCode.Conflict, 'repository.version_conflict'));
      }
      const restoredAtMs = this.now();
      await client.query(
        `INSERT INTO player_save_snapshots
          (player_id, source_version, schema_version, created_at_ms, reason, data)
         VALUES ($1, $2, $3, $4, 'PRE_RESTORE', $5)`,
        [input.playerId, current.version, current.schema_version, restoredAtMs, current.data],
      );
      const restored = await client.query<Row>(
        `UPDATE player_records
            SET schema_version = $2, version = version + 1, updated_at_ms = $3, data = $4
          WHERE player_id = $1
      RETURNING player_id, schema_version, version, updated_at_ms, data`,
        [input.playerId, snapshot.schema_version, restoredAtMs, snapshot.data],
      );
      const record = toRecord(restored.rows[0]!);
      const auditResult = await client.query<{
        id: string;
        player_id: string;
        snapshot_id: string;
        actor: string;
        reason: string;
        before_version: number;
        after_version: number;
        restored_at_ms: string;
      }>(
        `INSERT INTO player_restore_audit
          (player_id, snapshot_id, actor, reason, before_version, after_version, restored_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.playerId,
          snapshot.id,
          input.actor.trim(),
          input.reason.trim(),
          current.version,
          record.version,
          restoredAtMs,
        ],
      );
      await client.query(
        `DELETE FROM player_save_snapshots
          WHERE player_id = $1 AND id NOT IN (
            SELECT id FROM player_save_snapshots
             WHERE player_id = $1 ORDER BY id DESC LIMIT $2
          )`,
        [input.playerId, SAVE_SNAPSHOT_RETENTION],
      );
      await client.query('COMMIT');
      const row = auditResult.rows[0]!;
      return ok({
        record,
        audit: {
          id: row.id,
          playerId: row.player_id as PlayerId,
          snapshotId: row.snapshot_id,
          actor: row.actor,
          reason: row.reason,
          beforeVersion: row.before_version,
          afterVersion: row.after_version,
          restoredAtMs: Number(row.restored_at_ms),
        },
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original restore failure remains the useful error if the connection is already lost.
      }
      return err(storageFailure('restore snapshot', error));
    } finally {
      client.release();
    }
  }

  async listRestoreAudit(
    playerId: PlayerId,
  ): Promise<Result<readonly RestoreAuditReceipt[], Failure>> {
    try {
      const result = await this.client.query<{
        id: string;
        player_id: string;
        snapshot_id: string;
        actor: string;
        reason: string;
        before_version: number;
        after_version: number;
        restored_at_ms: string;
      }>('SELECT * FROM player_restore_audit WHERE player_id = $1 ORDER BY id ASC', [playerId]);
      return ok(
        result.rows.map((row) => ({
          id: row.id,
          playerId: row.player_id as PlayerId,
          snapshotId: row.snapshot_id,
          actor: row.actor,
          reason: row.reason,
          beforeVersion: row.before_version,
          afterVersion: row.after_version,
          restoredAtMs: Number(row.restored_at_ms),
        })),
      );
    } catch (error) {
      return err(storageFailure('list restore audit', error));
    }
  }

  /**
   * Runs work inside a real database transaction.
   *
   * One client is checked out and every statement runs on it, so BEGIN and the
   * writes belong to the same session. An `Err` rolls back as surely as a
   * throw does: a refused trade must not leave behind the half of it that had
   * already been written.
   *
   * The client is released in every path. Leaking one from a pool capped at a
   * handful of connections takes the server down within minutes.
   */
  async transaction<T>(
    work: (tx: PlayerStore) => Promise<Result<T, Failure>>,
  ): Promise<Result<T, Failure>> {
    let client: pg.PoolClient;
    try {
      client = await this.client.connect();
    } catch (error) {
      return err(storageFailure('open transaction', error));
    }

    try {
      await client.query('BEGIN');
      const result = await work(new PostgresPlayerStore(client, this.now));
      await client.query(result.ok ? 'COMMIT' : 'ROLLBACK');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // A rollback that itself fails means the connection is already lost,
        // which the pool discards. The original error is the useful one.
      }
      return err(storageFailure('transaction', error));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
