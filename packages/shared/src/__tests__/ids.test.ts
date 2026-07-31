import { describe, expect, it } from 'vitest';
import { generateId, isValidId, timestampOf } from '../ids.js';

describe('ids', () => {
  it('generates ids of the expected shape', () => {
    const id = generateId();
    expect(id).toHaveLength(26);
    expect(isValidId(id)).toBe(true);
  });

  it('encodes a recoverable timestamp', () => {
    const now = 1_770_000_000_000;
    expect(timestampOf(generateId(now))).toBe(now);
  });

  it('sorts lexicographically by creation time', () => {
    const earlier = generateId(1_000_000_000_000);
    const later = generateId(1_000_000_001_000);
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('does not collide across a large batch', () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => generateId()));
    expect(ids.size).toBe(20_000);
  });

  it('rejects malformed ids', () => {
    expect(isValidId('too-short')).toBe(false);
    expect(isValidId('I'.repeat(26))).toBe(false);
  });
});
