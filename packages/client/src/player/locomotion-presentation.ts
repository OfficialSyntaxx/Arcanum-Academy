const TAU = Math.PI * 2;

/** One complete procedural stride per this much ground travelled. */
export const STRIDE_METRES = 1.65;
/** Visual turns settle quickly enough that the feet never skate sideways. */
export const VISUAL_TURN_RATE = 24;

export function shortestAngle(from: number, to: number): number {
  return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function turnVisualFacing(
  current: number,
  target: number,
  dtSeconds: number,
  turnRate = VISUAL_TURN_RATE,
): number {
  const delta = shortestAngle(current, target);
  const step = Math.max(0, turnRate * dtSeconds);
  return current + Math.max(-step, Math.min(step, delta));
}

/** Drives footfalls from actual ground covered instead of wall-clock time. */
export function advanceStridePhase(phase: number, distance: number, gait: number): number {
  if (gait <= 0.02 || distance <= 0) return phase;
  // A zone transition is a teleport, not a hundred instantaneous strides.
  if (distance > 5) return phase;
  return (phase + (distance / STRIDE_METRES) * TAU) % TAU;
}
