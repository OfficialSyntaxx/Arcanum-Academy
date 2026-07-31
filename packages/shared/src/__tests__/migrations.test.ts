import { describe, expect, it } from 'vitest';
import { createMigrationRunner, type VersionedDocument } from '../persistence/migrations.js';

const migrations = [
  {
    from: 1,
    description: 'split inventory into stacks',
    migrate: (doc: VersionedDocument): VersionedDocument => ({
      ...doc,
      schemaVersion: 2,
      stacks: [],
    }),
  },
  {
    from: 2,
    description: 'add slab serial index',
    migrate: (doc: VersionedDocument): VersionedDocument => ({
      ...doc,
      schemaVersion: 3,
      slabSerials: [],
    }),
  },
];

describe('migration runner', () => {
  it('applies every step in order', () => {
    const runner = createMigrationRunner(migrations, 3);
    const result = runner.run({ schemaVersion: 1, gold: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toVersion).toBe(3);
    expect(result.value.applied).toHaveLength(2);
    expect(result.value.document.gold).toBe(10);
  });

  it('is a no-op for an already current document', () => {
    const runner = createMigrationRunner(migrations, 3);
    const result = runner.run({ schemaVersion: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.applied).toHaveLength(0);
  });

  it('refuses documents written by a newer client', () => {
    const runner = createMigrationRunner(migrations, 3);
    const result = runner.run({ schemaVersion: 9 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('migration.document_from_future');
  });

  it('detects a gap in the migration chain at boot', () => {
    const runner = createMigrationRunner([migrations[0]!], 3);
    const validation = runner.validateChain(1);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.reason).toBe('migration.chain_incomplete');
  });

  it('reports a throwing migration instead of corrupting the save', () => {
    const runner = createMigrationRunner(
      [
        {
          from: 1,
          description: 'broken',
          migrate: () => {
            throw new Error('bad data');
          },
        },
      ],
      2,
    );
    const result = runner.run({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('migration.step_threw');
  });

  it('rejects migrations that fail to advance the version', () => {
    const runner = createMigrationRunner(
      [{ from: 1, description: 'lazy', migrate: (doc) => doc }],
      2,
    );
    const result = runner.run({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('migration.version_not_advanced');
  });
});
