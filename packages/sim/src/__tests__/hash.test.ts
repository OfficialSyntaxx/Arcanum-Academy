import { describe, expect, it } from 'vitest';
import { canonicalString, hashState } from '../hash.js';

describe('state hashing', () => {
  it('is independent of key insertion order', () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
  });

  it('distinguishes structurally different states', () => {
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
    expect(hashState({ a: [1, 2] })).not.toBe(hashState({ a: [2, 1] }));
  });

  it('does not confuse a number with its string form', () => {
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: '1' }));
  });

  it('treats absent and undefined keys identically', () => {
    expect(hashState({ a: 1, b: undefined })).toBe(hashState({ a: 1 }));
  });

  it('normalises negative zero', () => {
    expect(hashState({ a: -0 })).toBe(hashState({ a: 0 }));
  });

  it('hashes maps and sets by content, not iteration order', () => {
    const first = {
      m: new Map([
        ['a', 1],
        ['b', 2],
      ]),
      s: new Set([3, 1]),
    };
    const second = {
      m: new Map([
        ['b', 2],
        ['a', 1],
      ]),
      s: new Set([1, 3]),
    };
    expect(hashState(first)).toBe(hashState(second));
  });

  it('refuses values with no stable text form', () => {
    expect(() => hashState({ a: Number.NaN })).toThrow();
    expect(() => hashState({ a: () => 1 })).toThrow();
  });

  it('refuses cycles', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => hashState(cyclic)).toThrow();
  });

  it('produces a readable canonical form for desync debugging', () => {
    expect(canonicalString({ b: 1, a: 'x' })).toBe('{a:s1:x,b:d1}');
  });
});
