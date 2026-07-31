import { describe, expect, it } from 'vitest';
import { FixedClock } from '../clock.js';

describe('FixedClock', () => {
  it('accumulates partial frames into whole steps', () => {
    const clock = new FixedClock({ tickHz: 20 }); // 50ms per step
    expect(clock.advance(30).steps).toBe(0);
    expect(clock.advance(30).steps).toBe(1);
    expect(clock.currentTick).toBe(1);
  });

  it('reports interpolation alpha', () => {
    const clock = new FixedClock({ tickHz: 20 });
    const result = clock.advance(75);
    expect(result.steps).toBe(1);
    expect(result.alpha).toBeCloseTo(0.5, 5);
  });

  it('caps catch-up after a long stall and reports dropped time', () => {
    const clock = new FixedClock({ tickHz: 20, maxCatchUpSteps: 5 });
    const result = clock.advance(10_000);
    expect(result.steps).toBe(5);
    expect(result.droppedMs).toBeGreaterThan(9_000);
    expect(clock.advance(0).steps).toBe(0);
  });

  it('ignores negative deltas', () => {
    const clock = new FixedClock({ tickHz: 20 });
    expect(clock.advance(-100).steps).toBe(0);
  });

  it('resets to an authoritative tick', () => {
    const clock = new FixedClock({ tickHz: 20 });
    clock.advance(500);
    clock.reset(1_000);
    expect(clock.currentTick).toBe(1_000);
    expect(clock.advance(10).steps).toBe(0);
  });
});
