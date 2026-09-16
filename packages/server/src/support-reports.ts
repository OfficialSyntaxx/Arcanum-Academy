import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type pg from 'pg';

export const supportReportCategorySchema = z.enum(['bug', 'gameplay', 'account', 'feedback']);

const diagnosticContextSchema = z.object({
  level: z.enum(['info', 'warn', 'error']),
  source: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(300),
  atMs: z.number().int().nonnegative(),
});

export const supportReportSubmissionSchema = z.object({
  category: supportReportCategorySchema,
  message: z.string().trim().min(20).max(2_000),
  playerId: z.string().trim().min(1).max(100).optional(),
  clientAtMs: z.number().int().nonnegative().optional(),
  diagnostics: z.array(diagnosticContextSchema).max(10).default([]),
});

export type SupportReportSubmission = z.infer<typeof supportReportSubmissionSchema>;

export interface SupportReport extends SupportReportSubmission {
  readonly id: string;
  readonly receivedAtMs: number;
  readonly status: 'open';
}

export interface SupportReportStore {
  initialise(): Promise<void>;
  add(submission: SupportReportSubmission, receivedAtMs: number): Promise<SupportReport>;
  list(limit?: number): Promise<readonly SupportReport[]>;
}

const MAX_REPORTS = 500;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

export class SupportReportBuffer implements SupportReportStore {
  private readonly reports: SupportReport[] = [];

  async initialise(): Promise<void> {}

  async add(submission: SupportReportSubmission, receivedAtMs: number): Promise<SupportReport> {
    const report: SupportReport = {
      ...submission,
      id: randomUUID(),
      receivedAtMs,
      status: 'open',
    };
    this.reports.unshift(report);
    if (this.reports.length > MAX_REPORTS) this.reports.length = MAX_REPORTS;
    return report;
  }

  async list(limit = 100): Promise<readonly SupportReport[]> {
    return this.reports.slice(0, Math.max(1, Math.min(250, limit)));
  }
}

interface SupportReportRow {
  readonly id: string;
  readonly category: SupportReport['category'];
  readonly message: string;
  readonly player_id: string | null;
  readonly client_at_ms: string | null;
  readonly diagnostics: SupportReport['diagnostics'];
  readonly received_at_ms: string;
}

export class PostgresSupportReportStore implements SupportReportStore {
  constructor(private readonly client: Pick<pg.Pool, 'query'>) {}

  async initialise(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS support_reports (
        id UUID PRIMARY KEY,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        player_id TEXT,
        client_at_ms BIGINT,
        diagnostics JSONB NOT NULL,
        received_at_ms BIGINT NOT NULL
      )
    `);
    await this.client.query(
      'CREATE INDEX IF NOT EXISTS support_reports_recent_idx ON support_reports (received_at_ms DESC)',
    );
  }

  async add(submission: SupportReportSubmission, receivedAtMs: number): Promise<SupportReport> {
    const report: SupportReport = {
      ...submission,
      id: randomUUID(),
      receivedAtMs,
      status: 'open',
    };
    await this.client.query(
      `INSERT INTO support_reports
        (id, category, message, player_id, client_at_ms, diagnostics, received_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        report.id,
        report.category,
        report.message,
        report.playerId ?? null,
        report.clientAtMs ?? null,
        JSON.stringify(report.diagnostics),
        report.receivedAtMs,
      ],
    );
    await this.client.query('DELETE FROM support_reports WHERE received_at_ms < $1', [
      receivedAtMs - RETENTION_MS,
    ]);
    return report;
  }

  async list(limit = 100): Promise<readonly SupportReport[]> {
    const result = await this.client.query<SupportReportRow>(
      `SELECT id, category, message, player_id, client_at_ms, diagnostics, received_at_ms
         FROM support_reports ORDER BY received_at_ms DESC LIMIT $1`,
      [Math.max(1, Math.min(250, limit))],
    );
    return result.rows.map((row) => ({
      id: row.id,
      category: row.category,
      message: row.message,
      ...(row.player_id === null ? {} : { playerId: row.player_id }),
      ...(row.client_at_ms === null ? {} : { clientAtMs: Number(row.client_at_ms) }),
      diagnostics: row.diagnostics,
      receivedAtMs: Number(row.received_at_ms),
      status: 'open',
    }));
  }
}
