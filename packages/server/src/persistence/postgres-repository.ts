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
import type { PlayerRecord, PlayerRepository } from './repository.js';

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

export class PostgresPlayerRepository implements PlayerRepository {
  private readonly pool: pg.Pool;
  private readonly now: () => number;

  constructor(private readonly options: PostgresPlayerRepositoryOptions) {
    this.now = options.now ?? (() => Date.now());
    this.pool = new pg.Pool({
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
    this.pool.on('error', (error) => {
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
      await this.pool.query(CREATE_TABLE);
      return ok(true);
    } catch (error) {
      return err(storageFailure('initialise', error));
    }
  }

  async find(playerId: PlayerId): Promise<Result<PlayerRecord | null, Failure>> {
    try {
      const result = await this.pool.query<Row>(
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
      const result = await this.pool.query<Row>(
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
      const result = await this.pool.query<Row>(
        `UPDATE player_records
            SET schema_version = $2, version = version + 1, updated_at_ms = $3, data = $4
          WHERE player_id = $1 AND version = $5
      RETURNING player_id, schema_version, version, updated_at_ms, data`,
        [record.playerId, record.schemaVersion, updatedAtMs, record.data, expectedVersion],
      );
      const row = result.rows[0];
      if (row !== undefined) return ok(toRecord(row));

      // The predicate failed. Only now is a second read worth doing, and only
      // to tell the caller which of the two reasons applies - a missing row and
      // a stale version call for different handling.
      const current = await this.pool.query<{ version: number }>(
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
