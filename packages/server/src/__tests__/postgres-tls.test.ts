import { describe, expect, it } from 'vitest';
import {
  CREATE_SNAPSHOT_TABLES,
  postgresSslConfiguration,
} from '../persistence/postgres-repository.js';

describe('postgresSslConfiguration', () => {
  it('does not use TLS for a local database', () => {
    expect(postgresSslConfiguration('postgresql://localhost:5432/alderfell')).toBe(false);
  });

  it('accepts Render’s self-signed certificate only on its private database hostname', () => {
    expect(
      postgresSslConfiguration(
        'postgresql://user:password@dpg-dahbg4qjnfac7394eis0-a/alderfell_postgres',
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('continues to verify certificates for every other remote database', () => {
    expect(postgresSslConfiguration('postgresql://user:password@db.example.com/alderfell')).toEqual(
      { rejectUnauthorized: true },
    );
  });
});

describe('Postgres snapshot schema', () => {
  it('defines separate immutable snapshot and restore-audit tables', () => {
    expect(CREATE_SNAPSHOT_TABLES).toContain('player_save_snapshots');
    expect(CREATE_SNAPSHOT_TABLES).toContain('player_restore_audit');
    expect(CREATE_SNAPSHOT_TABLES).toContain('PRE_RESTORE');
  });
});
