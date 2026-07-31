import {
  failure,
  FailureCode,
  Rng,
  err,
  ok,
  type Failure,
  type Result,
  type RngState,
} from '@arcanum/shared';
import { hashState } from './hash.js';

/**
 * Deterministic simulation kernel.
 *
 * This is the spine of the whole game: the client and the server both build a
 * simulation from the same reducers, feed it the same ordered command log, and
 * must arrive at the same state hash. That single property buys:
 *
 * - server authority without writing the rules twice
 * - client prediction (apply locally, reconcile on the authoritative patch)
 * - verifiable duels and grading rolls (replay the log, compare the hash)
 * - free bug reports (a desync report is a seed plus a command log)
 *
 * The kernel knows nothing about cards, nodes or players. Rules arrive as
 * registered reducers in later phases.
 */

export interface Command<TKind extends string = string, TPayload = unknown> {
  readonly kind: TKind;
  /** Tick the command is scheduled to apply on. Ordering key, with `seq`. */
  readonly tick: number;
  /** Per-issuer monotonic sequence, used to break ties deterministically. */
  readonly seq: number;
  /** Stable issuer identity. Ties break by issuer then seq. */
  readonly issuer: string;
  readonly payload: TPayload;
}

export interface ReducerContext {
  readonly tick: number;
  /** Simulation-owned randomness. Never call Math.random inside a reducer. */
  readonly rng: Rng;
}

/**
 * A reducer returns the next state. It must be pure: no I/O, no Date.now(), no
 * Math.random, no mutation of the incoming state. `check-boundaries` and review
 * enforce this; determinism tests catch violations.
 */
export type Reducer<TState, TPayload> = (
  state: TState,
  payload: TPayload,
  context: ReducerContext,
) => TState;

export interface SimulationOptions<TState> {
  readonly initialState: TState;
  readonly seed: string | RngState;
  /** Applied every tick before commands. Use for timers and passive accrual. */
  readonly step?: (state: TState, context: ReducerContext) => TState;
  /** Retained command history for replay and desync reports. 0 disables. */
  readonly historyLimit?: number;
}

export interface SimulationSnapshot<TState> {
  readonly tick: number;
  readonly state: TState;
  readonly rngState: RngState;
  readonly hash: string;
}

export class Simulation<TState> {
  private state: TState;
  private tick = 0;
  private rng: Rng;
  private readonly reducers = new Map<string, Reducer<TState, never>>();
  private readonly pending: Command[] = [];
  private readonly history: Command[] = [];
  private readonly historyLimit: number;

  constructor(private readonly options: SimulationOptions<TState>) {
    this.state = options.initialState;
    this.rng =
      typeof options.seed === 'string' ? Rng.fromSeed(options.seed) : new Rng(options.seed);
    this.historyLimit = options.historyLimit ?? 4096;
  }

  get currentTick(): number {
    return this.tick;
  }

  getState(): TState {
    return this.state;
  }

  /** Registers the rule for one command kind. Duplicate kinds are a bug. */
  register<TKind extends string, TPayload>(kind: TKind, reducer: Reducer<TState, TPayload>): this {
    if (this.reducers.has(kind)) throw new Error(`Reducer already registered for "${kind}"`);
    this.reducers.set(kind, reducer as Reducer<TState, never>);
    return this;
  }

  hasReducer(kind: string): boolean {
    return this.reducers.has(kind);
  }

  /**
   * Queues a command. Commands scheduled for a tick that has already run are
   * rejected rather than applied late - applying them late is exactly how a
   * client and server drift apart.
   */
  enqueue(command: Command): Result<true, Failure> {
    if (!this.reducers.has(command.kind)) {
      return err(
        failure(FailureCode.Validation, 'sim.unknown_command', {
          context: { kind: command.kind },
        }),
      );
    }
    if (command.tick < this.tick) {
      return err(
        failure(FailureCode.Conflict, 'sim.command_in_the_past', {
          context: { commandTick: command.tick, currentTick: this.tick },
        }),
      );
    }
    this.pending.push(command);
    return ok(true);
  }

  /**
   * Advances exactly one tick: passive step first, then every command scheduled
   * for this tick in a total order (tick, issuer, seq, kind). The ordering is
   * total and independent of arrival order, which is what makes two machines
   * agree.
   */
  step(): void {
    const context: ReducerContext = { tick: this.tick, rng: this.rng };
    if (this.options.step) this.state = this.options.step(this.state, context);

    const due = this.pending.filter((command) => command.tick === this.tick);
    if (due.length > 0) {
      for (let i = this.pending.length - 1; i >= 0; i -= 1) {
        if (this.pending[i]!.tick === this.tick) this.pending.splice(i, 1);
      }
      due.sort(compareCommands);
      for (const command of due) {
        const reducer = this.reducers.get(command.kind);
        if (!reducer) continue;
        this.state = (reducer as Reducer<TState, unknown>)(this.state, command.payload, context);
        if (this.historyLimit > 0) {
          this.history.push(command);
          if (this.history.length > this.historyLimit) this.history.shift();
        }
      }
    }
    this.tick += 1;
  }

  /** Runs `count` ticks. Used by the fixed clock and by replay. */
  run(count: number): void {
    for (let i = 0; i < count; i += 1) this.step();
  }

  snapshot(): SimulationSnapshot<TState> {
    return {
      tick: this.tick,
      state: this.state,
      rngState: this.rng.getState(),
      hash: hashState({ tick: this.tick, state: this.state }),
    };
  }

  /** Replaces local state with an authoritative snapshot after a desync. */
  restore(snapshot: SimulationSnapshot<TState>): void {
    this.state = snapshot.state;
    this.tick = snapshot.tick;
    this.rng = new Rng(snapshot.rngState);
    this.pending.length = 0;
  }

  /** Ordered command log, for replay and for attaching to desync reports. */
  getHistory(): readonly Command[] {
    return this.history;
  }
}

/** Total order over commands. Deterministic and independent of arrival order. */
export function compareCommands(a: Command, b: Command): number {
  if (a.tick !== b.tick) return a.tick - b.tick;
  if (a.issuer !== b.issuer) return a.issuer < b.issuer ? -1 : 1;
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
}
