import { describe, expect, it } from 'vitest';
import { postgresSslConfiguration } from '../persistence/postgres-repository.js';

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
