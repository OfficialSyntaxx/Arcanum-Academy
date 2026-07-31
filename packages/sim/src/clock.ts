/**
 * Fixed-timestep accumulator.
 *
 * Rendering runs at whatever rate the device manages; simulation must not.
 * A fixed step is what makes the simulation deterministic and replayable, and it
 * keeps a 120 Hz tablet and a throttled background tab producing identical state.
 *
 * `maxCatchUpSteps` bounds the work done after a long stall (backgrounded tab,
 * modal dialog). Beyond that the clock reports dropped time and the caller
 * resynchronises from the server rather than simulating minutes of backlog.
 */

export interface FixedClockOptions {
  readonly tickHz: number;
  /** Upper bound on steps consumed in one advance() call. */
  readonly maxCatchUpSteps?: number;
}

export interface ClockAdvance {
  /** Number of whole simulation steps to run now. */
  readonly steps: number;
  /** Fraction of a step already accumulated, for render interpolation. [0, 1) */
  readonly alpha: number;
  /** Milliseconds discarded because the catch-up limit was hit. */
  readonly droppedMs: number;
}

export class FixedClock {
  readonly stepMs: number;
  private readonly maxCatchUpSteps: number;
  private accumulatorMs = 0;
  private tick = 0;

  constructor(options: FixedClockOptions) {
    if (options.tickHz <= 0) throw new Error('tickHz must be positive');
    this.stepMs = 1000 / options.tickHz;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 5;
  }

  get currentTick(): number {
    return this.tick;
  }

  /** Feeds elapsed wall-clock time and reports how much simulation to run. */
  advance(deltaMs: number): ClockAdvance {
    if (deltaMs < 0) deltaMs = 0;
    this.accumulatorMs += deltaMs;

    let steps = Math.floor(this.accumulatorMs / this.stepMs);
    let droppedMs = 0;
    if (steps > this.maxCatchUpSteps) {
      const excess = steps - this.maxCatchUpSteps;
      droppedMs = excess * this.stepMs;
      steps = this.maxCatchUpSteps;
    }
    this.accumulatorMs -= steps * this.stepMs + droppedMs;
    this.tick += steps;
    return { steps, alpha: this.accumulatorMs / this.stepMs, droppedMs };
  }

  /** Discards pending time. Used after a resync so the client does not fast-forward. */
  reset(tick = 0): void {
    this.accumulatorMs = 0;
    this.tick = tick;
  }
}
