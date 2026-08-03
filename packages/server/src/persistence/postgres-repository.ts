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
} from '@arcanum/shared';
import type { PlayerRecord, PlayerRepository, PlayerStore } from './repository.js';

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
      const result = await this.client.query<Row>(
        `UPDATE player_records
            SET schema_version = $2, version = version + 1, updated_at_ms = $3, data = $4
          WHERE player_id = $1 AND version = $5
      RETURNING player_id, schema_version, version, updated_at_ms, data`,
        [record.playerId, record.schemaVersion, updatedAtMs, record.data, expectedVersion],
      );
      const row = result.rows[0];
      if (row !== undefined) return ok(toRecord(row));

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
      // Managed Postgres requires TLS and presents a valid certificate, so it
      // is verified rather than waved through. A local database does not.
      ssl: /localhost|127\.0\.0\.1/.test(options.connectionString)
        ? false
        : { rejectUnauthorized: true },
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
   * Adequate while there is exactly one table and no column has ever changed.
   * The moment a second table or a destructive alteration appears this must
   * graduate to ordered migration files - `createMigrationRunner` in
   * `@arcanum/shared` already models the forward-only chain to follow.
   */
  async initialise(): Promise<Result<true, Failure>> {
    try {
      await this.client.query(CREATE_TABLE);
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

  async create(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
  ): Promise<Result<PlayerRecord, Failure>> {
    return this.pooled.create(record);
  }

  async save(
    record: Omit<PlayerRecord, 'version' | 'updatedAtMs'>,
    expectedVersion: number,
  ): Promise<Result<PlayerRecord, Failure>> {
    return this.pooled.save(record, expectedVersion);
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
