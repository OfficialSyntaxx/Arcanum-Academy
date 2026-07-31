/**
 * Token-bucket rate limiter.
 *
 * Every inbound command passes through one of these. A bucket allows a short
 * burst (a player tapping quickly) while capping the sustained rate, which is
 * what actually stops scripted market sniping and gathering macros. Time is
 * injected so the behaviour is unit-testable without sleeping.
 */

export interface RateLimiterOptions {
  readonly capacity: number;
  readonly refillPerSecond: number;
  readonly now?: () => number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    if (options.capacity <= 0) throw new Error('capacity must be positive');
    if (options.refillPerSecond <= 0) throw new Error('refillPerSecond must be positive');
    this.now = options.now ?? (() => Date.now());
    this.tokens = options.capacity;
    this.lastRefillMs = this.now();
  }

  /** Consumes one token. Returns false when the caller is over budget. */
  tryConsume(cost = 1): boolean {
    this.refill();
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  /** Remaining budget, for diagnostics and for `Retry-After` style responses. */
  get available(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const current = this.now();
    const elapsedMs = current - this.lastRefillMs;
    if (elapsedMs <= 0) return;
    this.lastRefillMs = current;
    this.tokens = Math.min(
      this.options.capacity,
      this.tokens + (elapsedMs / 1000) * this.options.refillPerSecond,
    );
  }
}
