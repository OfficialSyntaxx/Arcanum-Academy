/**
 * Seedable, serialisable pseudo-random number generator.
 *
 * The entire game economy (gathering rolls, grading outcomes, card draws) runs
 * through this generator. Two properties matter:
 *
 * 1. Determinism - the server can replay a command log and reach byte-identical
 *    state, which is what makes duels verifiable and grading non-forgeable.
 * 2. Serialisability - a stream's state is four 32-bit integers, so it can be
 *    persisted with a save file or shipped in a match snapshot.
 *
 * Algorithm: xoshiro128** (Blackman/Vigna). Fast, passes BigCrush, tiny state.
 * It is NOT cryptographically secure and must never be used for tokens.
 */

export interface RngState {
  readonly s0: number;
  readonly s1: number;
  readonly s2: number;
  readonly s3: number;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Deterministically expands an arbitrary string seed into generator state. */
export function seedFromString(seed: string): RngState {
  // splitmix32 expansion keeps low-entropy seeds ("tutorial") well distributed.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  const next = (): number => {
    h = (h + 0x9e3779b9) >>> 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  return { s0: next(), s1: next(), s2: next(), s3: next() };
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(state: RngState) {
    this.s0 = state.s0 >>> 0;
    this.s1 = state.s1 >>> 0;
    this.s2 = state.s2 >>> 0;
    this.s3 = state.s3 >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      // All-zero state is a fixed point of the algorithm; reject it.
      this.s3 = 1;
    }
  }

  static fromSeed(seed: string): Rng {
    return new Rng(seedFromString(seed));
  }

  /** Snapshot for persistence or transmission. */
  getState(): RngState {
    return { s0: this.s0, s1: this.s1, s2: this.s2, s3: this.s3 };
  }

  /** Raw 32-bit unsigned draw. */
  nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0) as number;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Uniform integer in [min, max] inclusive, rejection-sampled so the
   * distribution has no modulo bias. Bias matters: grading and rare-drop tables
   * are the economy's rarity guarantees.
   */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error('Rng.nextInt requires integer bounds');
    }
    if (max < min) throw new Error('Rng.nextInt requires max >= min');
    const range = max - min + 1;
    if (range === 1) return min;
    const limit = Math.floor(4294967296 / range) * range;
    let draw = this.nextUint32();
    while (draw >= limit) draw = this.nextUint32();
    return min + (draw % range);
  }

  /** Returns true with probability `chance` (clamped to [0, 1]). */
  chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  /** Fisher-Yates shuffle in place. Used for deck shuffles and node rotations. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(0, i);
      const a = items[i]!;
      items[i] = items[j]!;
      items[j] = a;
    }
    return items;
  }

  /** Picks one entry from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick requires a non-empty array');
    return items[this.nextInt(0, items.length - 1)]!;
  }

  /**
   * Picks an index using integer weights. Integer weights (not floats) keep the
   * result identical across platforms, which is required for replay parity.
   */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w < 0) throw new Error('weights must be non-negative integers');
      total += w;
    }
    if (total <= 0) throw new Error('weights must sum to a positive value');
    let roll = this.nextInt(0, total - 1);
    for (let i = 0; i < weights.length; i += 1) {
      roll -= weights[i]!;
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  /** Creates an independent child stream, so subsystems never interleave draws. */
  fork(label: string): Rng {
    const mixed = seedFromString(`${label}:${this.nextUint32()}:${this.nextUint32()}`);
    return new Rng(mixed);
  }
}
