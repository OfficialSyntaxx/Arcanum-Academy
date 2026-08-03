/**
 * Slab serial minting.
 *
 * A serial is a public claim that this is the Nth copy of a spell ever
 * slabbed. The claim is worth exactly as much as its uniqueness, so the
 * initialization report singles this out: serials need a single writer, and a
 * duplicate is not a cosmetic bug but a broken promise.
 *
 * Uniqueness is enforced by the database, not by this code. A unique index on
 * the serial and an atomic increment mean two connections racing produce two
 * different numbers; any scheme that read a counter and then wrote it back
 * would have a window between the two, and that window is exactly where a
 * duplicate is born.
 */

import {
  err,
  failure,
  FailureCode,
  ok,
  type CardDefinitionId,
  type Failure,
  type Result,
  type SlabSerial,
} from '@arcanum/shared';

/**
 * The port. Kept separate from the player repository because serials are
 * global to a card, not owned by a player - the two have different lifetimes
 * and different contention.
 */
export interface SerialMinter {
  /** Mints the next serial for a definition. Never returns the same one twice. */
  mint(definitionId: CardDefinitionId): Promise<Result<SlabSerial, Failure>>;
}

/**
 * Formats a serial as `<definition>#<ordinal>`, zero-padded.
 *
 * Padding is presentational but fixed here so a serial sorts lexically in the
 * same order it was minted, which is what makes a collection list sortable
 * without parsing every value.
 */
export function formatSerial(definitionId: CardDefinitionId, ordinal: number): SlabSerial {
  return `${definitionId}#${String(ordinal).padStart(6, '0')}` as SlabSerial;
}

/** In-memory minter for tests and local development. */
export class InMemorySerialMinter implements SerialMinter {
  private readonly ordinals = new Map<string, number>();

  async mint(definitionId: CardDefinitionId): Promise<Result<SlabSerial, Failure>> {
    const next = (this.ordinals.get(definitionId) ?? 0) + 1;
    this.ordinals.set(definitionId, next);
    return ok(formatSerial(definitionId, next));
  }
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS slab_serials (
    definition_id TEXT PRIMARY KEY,
    minted        BIGINT NOT NULL DEFAULT 0
  )
`;

interface QueryClient {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Postgres minter.
 *
 * The increment and the read are one statement. `INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING` is atomic, so concurrent minters serialise on the row
 * lock and each leaves with a distinct ordinal - no advisory lock, no
 * read-modify-write, and no window in between.
 */
export class PostgresSerialMinter implements SerialMinter {
  constructor(private readonly client: QueryClient) {}

  async initialise(): Promise<Result<true, Failure>> {
    try {
      await this.client.query(CREATE_TABLE);
      return ok(true);
    } catch (error) {
      return err(storageFailure('initialise serials', error));
    }
  }

  async mint(definitionId: CardDefinitionId): Promise<Result<SlabSerial, Failure>> {
    try {
      const result = await this.client.query<{ minted: string }>(
        `INSERT INTO slab_serials (definition_id, minted)
         VALUES ($1, 1)
         ON CONFLICT (definition_id) DO UPDATE SET minted = slab_serials.minted + 1
         RETURNING minted`,
        [definitionId],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return err(
          failure(FailureCode.Storage, 'serial.mint_returned_nothing', {
            detail: 'the minting statement produced no row',
          }),
        );
      }
      return ok(formatSerial(definitionId, Number(row.minted)));
    } catch (error) {
      return err(storageFailure('mint serial', error));
    }
  }
}

function storageFailure(operation: string, error: unknown): Failure {
  return failure(FailureCode.Storage, 'serial.query_failed', {
    detail: `${operation}: ${error instanceof Error ? error.message : String(error)}`,
  });
}
