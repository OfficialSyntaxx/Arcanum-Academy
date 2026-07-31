import { failure, FailureCode, type Failure } from '@arcanum/shared';
import { err, ok, type Result } from '@arcanum/shared';

/**
 * Explicit finite state machine.
 *
 * The game has one high-level phase at a time (exploring, duelling, browsing the
 * market). Making that explicit - with a declared transition table rather than
 * scattered booleans - is what prevents the classic bugs: the deck builder
 * opening mid-duel, input reaching the world while a modal is up, two loading
 * screens racing each other.
 */

export interface TransitionContext<S extends string> {
  readonly from: S;
  readonly to: S;
  readonly reason: string;
}

export interface StateMachineOptions<S extends string> {
  readonly initial: S;
  /** Declared adjacency. Anything not listed is rejected, not silently allowed. */
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  /** Optional veto, e.g. "cannot leave a duel with an action pending". */
  readonly guard?: (context: TransitionContext<S>) => boolean;
  readonly onEnter?: (context: TransitionContext<S>) => void;
  readonly onExit?: (context: TransitionContext<S>) => void;
  /** Number of past states retained for debugging and crash reports. */
  readonly historyLimit?: number;
}

export class StateMachine<S extends string> {
  private state: S;
  private readonly history: TransitionContext<S>[] = [];
  private readonly historyLimit: number;

  constructor(private readonly options: StateMachineOptions<S>) {
    this.state = options.initial;
    this.historyLimit = options.historyLimit ?? 32;
  }

  get current(): S {
    return this.state;
  }

  get recentTransitions(): readonly TransitionContext<S>[] {
    return this.history;
  }

  can(to: S): boolean {
    return (this.options.transitions[this.state] ?? []).includes(to);
  }

  transition(to: S, reason = 'unspecified'): Result<TransitionContext<S>, Failure> {
    const context: TransitionContext<S> = { from: this.state, to, reason };
    if (!this.can(to)) {
      return err(
        failure(FailureCode.Conflict, 'fsm.illegal_transition', {
          detail: `${this.state} -> ${to}`,
          context: { from: this.state, to, reason },
        }),
      );
    }
    if (this.options.guard && !this.options.guard(context)) {
      return err(
        failure(FailureCode.Conflict, 'fsm.transition_vetoed', {
          detail: `${this.state} -> ${to}`,
          context: { from: this.state, to, reason },
        }),
      );
    }
    this.options.onExit?.(context);
    this.state = to;
    this.history.push(context);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.options.onEnter?.(context);
    return ok(context);
  }
}
