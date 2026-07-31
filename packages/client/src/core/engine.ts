import { FixedClock, Simulation, StateMachine, GamePhase, PHASE_TRANSITIONS } from '@arcanum/sim';
import type { Logger } from '@arcanum/shared';

/**
 * The frame loop.
 *
 * Rendering and simulation are deliberately decoupled: the browser drives frames
 * at whatever rate it manages, the simulation advances in fixed steps, and the
 * renderer interpolates between them. This is what keeps a 120 Hz tablet and a
 * throttled mid-range phone producing identical game state.
 *
 * The engine owns the phase state machine, so exactly one component decides what
 * the game is currently doing, and every transition is logged and auditable.
 */

export interface ClientWorldState {
  /** Simulation steps executed locally. The first field of the world model. */
  readonly simulatedTicks: number;
}

export interface EngineHooks {
  /** Called once per rendered frame with the interpolation factor in [0, 1). */
  onRender(alpha: number, deltaSeconds: number): void;
  /** Called when the loop drops simulation time after a long stall. */
  onTimeDropped?(droppedMs: number): void;
}

export interface EngineOptions {
  readonly logger: Logger;
  readonly tickHz: number;
  readonly seed: string;
  readonly hooks: EngineHooks;
  readonly requestFrame?: (callback: (timeMs: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly now?: () => number;
}

export interface FrameStats {
  readonly fps: number;
  readonly frameMs: number;
  readonly simulationTick: number;
  readonly droppedFrames: number;
}

export class Engine {
  readonly phases: StateMachine<GamePhase>;
  readonly simulation: Simulation<ClientWorldState>;

  private readonly clock: FixedClock;
  private readonly requestFrame: (callback: (timeMs: number) => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;

  private frameHandle: number | null = null;
  private lastFrameMs = 0;
  private smoothedFps = 0;
  private droppedFrames = 0;
  private lastFrameDurationMs = 0;

  constructor(private readonly options: EngineOptions) {
    this.clock = new FixedClock({ tickHz: options.tickHz });
    this.now = options.now ?? (() => performance.now());
    this.requestFrame =
      options.requestFrame ?? ((callback) => globalThis.requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((handle) => globalThis.cancelAnimationFrame(handle));

    this.phases = new StateMachine<GamePhase>({
      initial: GamePhase.Boot,
      transitions: PHASE_TRANSITIONS,
      onEnter: (context) =>
        options.logger.info('phase changed', {
          from: context.from,
          to: context.to,
          reason: context.reason,
        }),
    });

    this.simulation = new Simulation<ClientWorldState>({
      initialState: { simulatedTicks: 0 },
      seed: options.seed,
      step: (state) => ({ ...state, simulatedTicks: state.simulatedTicks + 1 }),
    });
  }

  get isRunning(): boolean {
    return this.frameHandle !== null;
  }

  get stats(): FrameStats {
    return {
      fps: Math.round(this.smoothedFps),
      frameMs: Math.round(this.lastFrameDurationMs * 100) / 100,
      simulationTick: this.simulation.currentTick,
      droppedFrames: this.droppedFrames,
    };
  }

  start(): void {
    if (this.frameHandle !== null) return;
    this.lastFrameMs = this.now();
    this.frameHandle = this.requestFrame(this.tick);
  }

  stop(): void {
    if (this.frameHandle === null) return;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  dispose(): void {
    this.stop();
  }

  private readonly tick = (): void => {
    const current = this.now();
    const deltaMs = current - this.lastFrameMs;
    this.lastFrameMs = current;
    this.lastFrameDurationMs = deltaMs;

    // Exponential moving average: a single long frame should not make the
    // readout unusable, but a sustained drop must be visible immediately.
    const instantaneousFps = deltaMs > 0 ? 1000 / deltaMs : 0;
    this.smoothedFps =
      this.smoothedFps === 0 ? instantaneousFps : this.smoothedFps * 0.9 + instantaneousFps * 0.1;

    const advance = this.clock.advance(deltaMs);
    if (advance.droppedMs > 0) {
      this.droppedFrames += 1;
      this.options.hooks.onTimeDropped?.(advance.droppedMs);
    }
    this.simulation.run(advance.steps);
    this.options.hooks.onRender(advance.alpha, deltaMs / 1000);

    this.frameHandle = this.requestFrame(this.tick);
  };
}
