import { describe, expect, it } from 'vitest';
import { asId, type CardDefinitionId } from '@arcanum/shared';
import {
  InMemorySerialMinter,
  PostgresSerialMinter,
  formatSerial,
} from '../domain/serial-minter.js';

const SPELL = asId<CardDefinitionId>('card.emberbolt');
const OTHER = asId<CardDefinitionId>('card.wardstone');

describe('formatSerial', () => {
  it('pads so serials sort in the order they were minted', () => {
    const ordinals = [1, 2, 10, 99, 100, 1_000];
    const serials = ordinals.map((n) => formatSerial(SPELL, n));
    expect([...serials].sort()).toEqual(serials);
  });

  it('names the spell it certifies', () => {
    expect(formatSerial(SPELL, 7)).toBe('card.emberbolt#000007');
  });
});

describe('InMemorySerialMinter', () => {
  it('never issues the same serial twice', async () => {
    const minter = new InMemorySerialMinter();
    const seen = new Set<string>();
    for (let n = 0; n < 500; n += 1) {
      const result = await minter.mint(SPELL);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(seen.has(result.value)).toBe(false);
      seen.add(result.value);
    }
    expect(seen.size).toBe(500);
  });

  it('counts each spell separately', async () => {
    const minter = new InMemorySerialMinter();
    await minter.mint(SPELL);
    await minter.mint(SPELL);
    const other = await minter.mint(OTHER);
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.value).toBe(formatSerial(OTHER, 1));
  });

  it('holds under concurrent minting', async () => {
    const minter = new InMemorySerialMinter();
    const results = await Promise.all(Array.from({ length: 200 }, () => minter.mint(SPELL)));
    const serials = results.map((result) => (result.ok ? result.value : 'failed'));
    expect(new Set(serials).size).toBe(200);
  });
});

describe('PostgresSerialMinter', () => {
  /**
   * Stands in for the database, asserting the property the real one provides:
   * the increment and the read are one statement, so concurrent callers cannot
   * observe the same value. A client that returned a stale count would be
   * exactly the read-modify-write window this design exists to avoid.
   */
  function atomicClient() {
    const counters = new Map<string, number>();
    const statements: string[] = [];
    return {
      statements,
      async query<T>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
        statements.push(text.trim().split('\n')[0]!.trim());
        if (text.includes('CREATE TABLE')) return { rows: [] };
        const key = String(values[0]);
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return { rows: [{ minted: String(next) } as T] };
      },
    };
  }

  it('mints in a single statement rather than reading then writing', async () => {
    const client = atomicClient();
    const minter = new PostgresSerialMinter(client);
    await minter.mint(SPELL);
    const mintStatements = client.statements.filter((text) => !text.includes('CREATE TABLE'));
    expect(mintStatements).toHaveLength(1);
    expect(mintStatements[0]).toContain('INSERT INTO slab_serials');
  });

  it('issues distinct serials to concurrent callers', async () => {
    const minter = new PostgresSerialMinter(atomicClient());
    const results = await Promise.all(Array.from({ length: 300 }, () => minter.mint(SPELL)));
    const serials = results.map((result) => (result.ok ? result.value : 'failed'));
    expect(new Set(serials).size).toBe(300);
  });

  it('reports a driver failure rather than inventing a serial', async () => {
    const minter = new PostgresSerialMinter({
      async query() {
        throw new Error('connection reset');
      },
    });
    const result = await minter.mint(SPELL);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('serial.query_failed');
      expect(result.error.detail).toContain('connection reset');
    }
  });

  it('refuses to guess when the statement returns nothing', async () => {
    const minter = new PostgresSerialMinter({
      async query<T>(): Promise<{ rows: T[] }> {
        return { rows: [] };
      },
    });
    const result = await minter.mint(SPELL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('serial.mint_returned_nothing');
  });
});
