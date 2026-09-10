import { z } from 'zod';

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

/** Bounded in-process retention: enough to debug a live deploy, never a log sink. */
export class DiagnosticBuffer {
  private readonly entries: DiagnosticReport[] = [];

  add(report: DiagnosticReport): void {
    this.entries.push(report);
    if (this.entries.length > 250) this.entries.splice(0, this.entries.length - 250);
  }

  list(): readonly DiagnosticReport[] {
    return this.entries.slice();
  }
}
