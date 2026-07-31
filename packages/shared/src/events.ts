/**
 * Typed, synchronous event bus.
 *
 * Modules communicate through events rather than direct references, which is
 * what keeps the dependency graph acyclic (see docs/ARCHITECTURE.md). The bus is
 * synchronous and ordered: a handler observes the world exactly as it was when
 * the event was emitted, which keeps simulation replay deterministic.
 */

/** Any object type mapping event names to payload types. */
export type EventMap = object;

export type Handler<T> = (payload: T) => void;

export interface Subscription {
  /** Idempotent. Safe to call from inside a handler. */
  unsubscribe(): void;
}

export interface EventBusOptions {
  /** Invoked when a handler throws, so one bad listener cannot halt the frame. */
  onHandlerError?: (error: unknown, event: string) => void;
}

export class EventBus<E extends EventMap> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();
  private readonly onHandlerError: (error: unknown, event: string) => void;

  constructor(options: EventBusOptions = {}) {
    this.onHandlerError =
      options.onHandlerError ??
      ((error, event) => {
        // Default policy: never swallow silently.
        console.error(`[event-bus] handler failed for "${event}"`, error);
      });
  }

  on<K extends keyof E & string>(event: K, handler: Handler<E[K]>): Subscription {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    let active = true;
    return {
      unsubscribe: () => {
        if (!active) return;
        active = false;
        this.handlers.get(event)?.delete(handler as Handler<never>);
      },
    };
  }

  once<K extends keyof E & string>(event: K, handler: Handler<E[K]>): Subscription {
    const subscription = this.on(event, (payload) => {
      subscription.unsubscribe();
      handler(payload);
    });
    return subscription;
  }

  emit<K extends keyof E & string>(event: K, payload: E[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    // Copy so that subscribe/unsubscribe during dispatch cannot mutate iteration.
    for (const handler of [...set]) {
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (error) {
        this.onHandlerError(error, event);
      }
    }
  }

  listenerCount(event: keyof E & string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Removes every listener. Called on scene teardown and hot reload. */
  clear(): void {
    this.handlers.clear();
  }
}
