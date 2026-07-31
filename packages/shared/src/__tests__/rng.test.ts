import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from '../rng.js';

describe('Rng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = Rng.fromSeed('duel:0001');
    const b = Rng.fromSeed('duel:0001');
    const left = Array.from({ length: 64 }, () => a.nextUint32());
    const right = Array.from({ length: 64 }, () => b.nextUint32());
    expect(left).toEqual(right);
  });

  it('produces different sequences for different seeds', () => {
    const a = Rng.fromSeed('duel:0001');
    const b = Rng.fromSeed('duel:0002');
    expect(a.nextUint32()).not.toEqual(b.nextUint32());
  });

  it('resumes exactly from a serialised state', () => {
    const original = Rng.fromSeed('grading');
    for (let i = 0; i < 10; i += 1) original.nextUint32();
    const snapshot = original.getState();
    const expected = Array.from({ length: 20 }, () => original.nextUint32());

    const restored = new Rng(snapshot);
    const actual = Array.from({ length: 20 }, () => restored.nextUint32());
    expect(actual).toEqual(expected);
  });

  it('rejects the all-zero state', () => {
    const rng = new Rng({ s0: 0, s1: 0, s2: 0, s3: 0 });
    const draws = new Set(Array.from({ length: 8 }, () => rng.nextUint32()));
    expect(draws.size).toBeGreaterThan(1);
  });

  it('keeps nextInt inside inclusive bounds', () => {
    const rng = Rng.fromSeed('bounds');
    for (let i = 0; i < 5_000; i += 1) {
      const value = rng.nextInt(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  it('distributes nextInt without visible modulo bias', () => {
    const rng = Rng.fromSeed('distribution');
    const buckets = new Array<number>(10).fill(0);
    const samples = 200_000;
    for (let i = 0; i < samples; i += 1) {
      const bucket = rng.nextInt(0, 9);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    const expectedPerBucket = samples / 10;
    for (const count of buckets) {
      expect(Math.abs(count - expectedPerBucket) / expectedPerBucket).toBeLessThan(0.05);
    }
  });

  it('respects integer weights', () => {
    const rng = Rng.fromSeed('weights');
    const counts = [0, 0, 0];
    for (let i = 0; i < 60_000; i += 1) {
      const index = rng.weightedIndex([1, 3, 6]);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    expect((counts[0] ?? 0) / 60_000).toBeCloseTo(0.1, 1);
    expect((counts[1] ?? 0) / 60_000).toBeCloseTo(0.3, 1);
    expect((counts[2] ?? 0) / 60_000).toBeCloseTo(0.6, 1);
  });

  it('shuffles deterministically for a given seed', () => {
    const deck = () => Array.from({ length: 20 }, (_, i) => i);
    const a = Rng.fromSeed('shuffle').shuffle(deck());
    const b = Rng.fromSeed('shuffle').shuffle(deck());
    expect(a).toEqual(b);
    expect(a).not.toEqual(deck());
    expect([...a].sort((x, y) => x - y)).toEqual(deck());
  });

  it('forks independent streams', () => {
    const parent = Rng.fromSeed('root');
    const gathering = parent.fork('gathering');
    const grading = parent.fork('grading');
    expect(gathering.nextUint32()).not.toEqual(grading.nextUint32());
  });

  it('expands low-entropy seeds into a non-degenerate state', () => {
    const state = seedFromString('a');
    expect(state.s0 | state.s1 | state.s2 | state.s3).not.toBe(0);
  });
});
