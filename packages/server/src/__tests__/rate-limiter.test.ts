import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../net/rate-limiter.js';

describe('TokenBucket', () => {
  it('allows a burst up to capacity', () => {
    const clock = 0;
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 5, now: () => clock });
    for (let i = 0; i < 5; i += 1) expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills over time', () => {
    let clock = 0;
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 5, now: () => clock });
    for (let i = 0; i < 5; i += 1) bucket.tryConsume();
    clock += 400;
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('never exceeds capacity while idle', () => {
    let clock = 0;
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 5, now: () => clock });
    clock += 60_000;
    expect(bucket.available).toBe(5);
  });

  it('supports weighted costs', () => {
    const clock = 0;
    const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 1, now: () => clock });
    expect(bucket.tryConsume(8)).toBe(true);
    expect(bucket.tryConsume(3)).toBe(false);
    expect(bucket.tryConsume(2)).toBe(true);
  });

  it('rejects nonsensical configuration', () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new TokenBucket({ capacity: 1, refillPerSecond: 0 })).toThrow();
  });
});
