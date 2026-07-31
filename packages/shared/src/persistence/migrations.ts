import { failure, FailureCode, type Failure } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Forward-only save migration runner.
 *
 * A live-service game accumulates save formats for years. Two rules keep this
 * survivable:
 *
 * 1. Every persisted document carries `schemaVersion`.
 * 2. Every schema change ships a migration from `n` to `n + 1` that is pure and
 *    unit-tested against a captured fixture of the old shape.
 *
 * The runner refuses to touch a document from the future (a player who used a
 * newer client on another device), because silently downgrading would destroy
 * data. The client surfaces that as "update required" instead.
 */

export interface VersionedDocument {
  readonly schemaVersion: number;
  readonly [key: string]: unknown;
}

export interface Migration {
  /** Version this migration reads. Produces `from + 1`. */
  readonly from: number;
  readonly description: string;
  migrate(document: VersionedDocument): VersionedDocument;
}

export interface MigrationReport {
  readonly document: VersionedDocument;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly string[];
}

export function createMigrationRunner(migrations: readonly Migration[], targetVersion: number) {
  const byFrom = new Map<number, Migration>();
  for (const migration of migrations) {
    if (byFrom.has(migration.from)) {
      throw new Error(`Duplicate migration from version ${migration.from}`);
    }
    byFrom.set(migration.from, migration);
  }

  return {
    targetVersion,

    /** Verifies at boot that the chain is complete. Fails fast rather than at 3am. */
    validateChain(minimumSupportedVersion: number): Result<true, Failure> {
      for (let v = minimumSupportedVersion; v < targetVersion; v += 1) {
        if (!byFrom.has(v)) {
          return err(
            failure(FailureCode.Migration, 'migration.chain_incomplete', {
              detail: `no migration registered from version ${v}`,
              context: { missingFrom: v, targetVersion },
            }),
          );
        }
      }
      return ok(true);
    },

    run(document: VersionedDocument): Result<MigrationReport, Failure> {
      const fromVersion = document.schemaVersion;
      if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) || fromVersion < 0) {
        return err(failure(FailureCode.Migration, 'migration.missing_schema_version'));
      }
      if (fromVersion > targetVersion) {
        return err(
          failure(FailureCode.Migration, 'migration.document_from_future', {
            detail: 'save was written by a newer client',
            context: { documentVersion: fromVersion, targetVersion },
          }),
        );
      }

      let current = document;
      const applied: string[] = [];
      while (current.schemaVersion < targetVersion) {
        const migration = byFrom.get(current.schemaVersion);
        if (!migration) {
          return err(
            failure(FailureCode.Migration, 'migration.step_missing', {
              context: { from: current.schemaVersion },
            }),
          );
        }
        let next: VersionedDocument;
        try {
          next = migration.migrate(current);
        } catch (error) {
          return err(
            failure(FailureCode.Migration, 'migration.step_threw', {
              detail: error instanceof Error ? error.message : String(error),
              context: { from: migration.from },
            }),
          );
        }
        if (next.schemaVersion !== migration.from + 1) {
          return err(
            failure(FailureCode.Migration, 'migration.version_not_advanced', {
              context: { from: migration.from, produced: next.schemaVersion },
            }),
          );
        }
        applied.push(migration.description);
        current = next;
      }

      return ok({ document: current, fromVersion, toVersion: current.schemaVersion, applied });
    },
  };
}

export type MigrationRunner = ReturnType<typeof createMigrationRunner>;
