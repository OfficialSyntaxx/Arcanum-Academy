import { z } from 'zod';
import type pg from 'pg';

export const diagnosticReportSchema = z.object({
  level: z.enum(['info', 'warn', 'error']),
  source: z.enum(['world', 'network', 'economy']),
  message: z.string().min(1).max(500),
  clientAtMs: z.number().int().nonnegative().optional(),
});

export type DiagnosticReport = z.infer<typeof diagnosticReportSchema> & {
  receivedAtMs: number;
  ip: string;
};

/**
 * A small operational feed, intentionally separate from game-state storage.
 *
 * Reports are short lived and capped so an error loop can never turn the
 * diagnostics feature into an unbounded log database.
 */
export interface DiagnosticStore {
  initialise(): Promise<void>;
  add(report: DiagnosticReport): Promise<void>;
  list(): Promise<readonly DiagnosticReport[]>;
}

/** Local-development fallback when Postgres has not been configured. */
export class DiagnosticBuffer implements DiagnosticStore {
  private readonly entries: DiagnosticReport[] = [];

  async initialise(): Promise<void> {}

  async add(report: DiagnosticReport): Promise<void> {
    this.entries.push(report);
    if (this.entries.length > 250) this.entries.splice(0, this.entries.length - 250);
  }

  async list(): Promise<readonly DiagnosticReport[]> {
    return this.entries.slice();
  }
}

const RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_VISIBLE_EVENTS = 250;

interface DiagnosticRow {
  readonly level: 'info' | 'warn' | 'error';
  readonly source: 'world' | 'network' | 'economy';
  readonly message: string;
  readonly client_at_ms: string | null;
  readonly received_at_ms: string;
  readonly ip: string;
}

/** Durable production store. The same pool is shared with player persistence. */
export class PostgresDiagnosticStore implements DiagnosticStore {
  constructor(private readonly client: Pick<pg.Pool, 'query'>) {}

  async initialise(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS diagnostic_events (
        id BIGSERIAL PRIMARY KEY,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        client_at_ms BIGINT,
        received_at_ms BIGINT NOT NULL,
        ip TEXT NOT NULL
      )
    `);
    await this.client.query(
      'CREATE INDEX IF NOT EXISTS diagnostic_events_recent_idx ON diagnostic_events (received_at_ms DESC)',
    );
  }

  async add(report: DiagnosticReport): Promise<void> {
    await this.client.query(
      `INSERT INTO diagnostic_events
        (level, source, message, client_at_ms, received_at_ms, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        report.level,
        report.source,
        report.message,
        report.clientAtMs ?? null,
        report.receivedAtMs,
        report.ip,
      ],
    );
    await this.client.query('DELETE FROM diagnostic_events WHERE received_at_ms < $1', [
      report.receivedAtMs - RETENTION_MS,
    ]);
  }

  async list(): Promise<readonly DiagnosticReport[]> {
    const result = await this.client.query<DiagnosticRow>(
      `SELECT level, source, message, client_at_ms, received_at_ms, ip
         FROM (
           SELECT level, source, message, client_at_ms, received_at_ms, ip, id
             FROM diagnostic_events
            ORDER BY id DESC
            LIMIT $1
         ) AS recent
        ORDER BY id ASC`,
      [MAX_VISIBLE_EVENTS],
    );
    return result.rows.map((row) => ({
      level: row.level,
      source: row.source,
      message: row.message,
      ...(row.client_at_ms === null ? {} : { clientAtMs: Number(row.client_at_ms) }),
      receivedAtMs: Number(row.received_at_ms),
      ip: row.ip,
    }));
  }
}
