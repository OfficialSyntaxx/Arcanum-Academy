/**
 * Who a connection belongs to.
 *
 * Before this, the handshake believed whatever player id a client sent. That
 * is not identity: it means anyone who learns an id owns that account, and the
 * ids appear in logs. With slabs holding value, account theft stops being
 * theoretical, so a claim now has to be proved.
 *
 * The proof is a bearer token the server issues on first contact and the
 * client keeps. Only a hash of it is stored, so a leaked database does not
 * hand over working logins, and comparison is constant-time so the store
 * cannot be probed a byte at a time.
 *
 * This is deliberately not passwords. There is no email service to recover
 * one through, and a password nobody can reset is worse than a token that
 * cannot be phished. Recovery and device migration are the next step and are
 * recorded as such - they need a channel to send a challenge over.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  err,
  failure,
  FailureCode,
  generateId,
  ok,
  asId,
  type Failure,
  type PlayerId,
  type Result,
} from '@arcanum/shared';

/** 32 bytes: far beyond guessing, and short enough to sit in local storage. */
const TOKEN_BYTES = 32;

export interface IssuedIdentity {
  readonly playerId: PlayerId;
  /** Returned once, at creation. The server keeps only its hash. */
  readonly token: string;
}

export interface IdentityStore {
  /** Stores the hash of a new identity. Fails if the player already exists. */
  put(playerId: PlayerId, tokenHash: string): Promise<Result<true, Failure>>;
  /** Resolves a token hash to its player, or null when nothing matches. */
  find(tokenHash: string): Promise<Result<PlayerId | null, Failure>>;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Used where a store compares candidates itself rather than looking one up by
 * key. Comparing with `===` would return faster on an early mismatch, which
 * over enough attempts leaks the digest.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export class IdentityService {
  constructor(private readonly store: IdentityStore) {}

  /** Creates a player and the token that proves ownership of it. */
  async issue(): Promise<Result<IssuedIdentity, Failure>> {
    const playerId = asId<PlayerId>(generateId());
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const stored = await this.store.put(playerId, hashToken(token));
    if (!stored.ok) return err(stored.error);
    return ok({ playerId, token });
  }

  /**
   * Resolves a token to its player.
   *
   * An unknown token is refused rather than quietly issuing a new identity.
   * Minting an account for anyone presenting a wrong token would turn a typo
   * into silent data loss - the player would appear to log in and find an
   * empty satchel.
   */
  async resolve(token: string): Promise<Result<PlayerId, Failure>> {
    if (typeof token !== 'string' || token.length === 0) {
      return err(failure(FailureCode.Unauthorized, 'identity.token_missing'));
    }
    const found = await this.store.find(hashToken(token));
    if (!found.ok) return err(found.error);
    if (found.value === null) {
      return err(
        failure(FailureCode.Unauthorized, 'identity.token_unknown', {
          detail: 'this token does not belong to any account',
        }),
      );
    }
    return ok(found.value);
  }
}

export class InMemoryIdentityStore implements IdentityStore {
  private readonly byHash = new Map<string, PlayerId>();

  async put(playerId: PlayerId, tokenHash: string): Promise<Result<true, Failure>> {
    if ([...this.byHash.values()].includes(playerId)) {
      return err(failure(FailureCode.Conflict, 'identity.already_exists'));
    }
    this.byHash.set(tokenHash, playerId);
    return ok(true);
  }

  async find(tokenHash: string): Promise<Result<PlayerId | null, Failure>> {
    for (const [candidate, playerId] of this.byHash) {
      if (digestsMatch(candidate, tokenHash)) return ok(playerId);
    }
    return ok(null);
  }
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS player_identities (
    token_hash TEXT PRIMARY KEY,
    player_id  TEXT NOT NULL UNIQUE,
    issued_at  BIGINT NOT NULL
  )
`;

interface QueryClient {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export class PostgresIdentityStore implements IdentityStore {
  constructor(
    private readonly client: QueryClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async initialise(): Promise<Result<true, Failure>> {
    try {
      await this.client.query(CREATE_TABLE);
      return ok(true);
    } catch (error) {
      return err(storageFailure('initialise identities', error));
    }
  }

  async put(playerId: PlayerId, tokenHash: string): Promise<Result<true, Failure>> {
    try {
      const result = await this.client.query<{ player_id: string }>(
        `INSERT INTO player_identities (token_hash, player_id, issued_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING player_id`,
        [tokenHash, playerId, this.now()],
      );
      if (result.rows.length === 0) {
        return err(failure(FailureCode.Conflict, 'identity.already_exists'));
      }
      return ok(true);
    } catch (error) {
      return err(storageFailure('store identity', error));
    }
  }

  /**
   * Looks the hash up by primary key.
   *
   * A key lookup rather than a scan-and-compare: the database compares an
   * index entry, so there is no per-row timing to observe, and the hash is
   * already the product of a one-way function.
   */
  async find(tokenHash: string): Promise<Result<PlayerId | null, Failure>> {
    try {
      const result = await this.client.query<{ player_id: string }>(
        'SELECT player_id FROM player_identities WHERE token_hash = $1',
        [tokenHash],
      );
      const row = result.rows[0];
      return ok(row === undefined ? null : asId<PlayerId>(row.player_id));
    } catch (error) {
      return err(storageFailure('resolve identity', error));
    }
  }
}

function storageFailure(operation: string, error: unknown): Failure {
  return failure(FailureCode.Storage, 'identity.query_failed', {
    detail: `${operation}: ${error instanceof Error ? error.message : String(error)}`,
  });
}
