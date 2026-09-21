import { describe, expect, it } from 'vitest';

import {
  STRIDE_METRES,
  advanceStridePhase,
  shortestAngle,
  turnVisualFacing,
} from '../player/locomotion-presentation.js';

describe('locomotion presentation', () => {
  it('turns across the angle seam by the short route', () => {
    expect(shortestAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(shortestAngle(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2);
  });

  it('caps visual rotation while settling faster than simulation facing', () => {
    expect(turnVisualFacing(0, Math.PI, 1 / 60)).toBeCloseTo(-0.4);
    expect(turnVisualFacing(0, 0.1, 1 / 60)).toBeCloseTo(0.1);
  });

  it('ties a complete stride to ground distance', () => {
    expect(advanceStridePhase(0, STRIDE_METRES / 2, 1)).toBeCloseTo(Math.PI);
  });

  it('does not run in place or cycle through a teleport', () => {
    expect(advanceStridePhase(1.2, 0, 1)).toBe(1.2);
    expect(advanceStridePhase(1.2, 1, 0)).toBe(1.2);
    expect(advanceStridePhase(1.2, 100, 1)).toBe(1.2);
  });
});
