/**
 * Canonical failure taxonomy. Every module reports failures using these codes so
 * that logging, analytics and the client UI can react without string matching.
 */

export const FailureCode = {
  Validation: 'validation',
  NotFound: 'not_found',
  Conflict: 'conflict',
  Unauthorized: 'unauthorized',
  RateLimited: 'rate_limited',
  Desync: 'desync',
  Transport: 'transport',
  Storage: 'storage',
  Migration: 'migration',
  Internal: 'internal',
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

export interface Failure {
  readonly code: FailureCode;
  /** Stable, machine-readable reason, e.g. `deck.duplicate_limit_exceeded`. */
  readonly reason: string;
  /** Human-readable detail for logs and developer tooling. Never shown raw to players. */
  readonly detail?: string;
  /** Structured context for analytics and debugging. Must be JSON-serialisable. */
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export function failure(
  code: FailureCode,
  reason: string,
  options: { detail?: string; context?: Record<string, string | number | boolean> } = {},
): Failure {
  const base: Failure = { code, reason };
  return {
    ...base,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.context === undefined ? {} : { context: options.context }),
  };
}

export function describeFailure(f: Failure): string {
  return f.detail ? `[${f.code}] ${f.reason}: ${f.detail}` : `[${f.code}] ${f.reason}`;
}
