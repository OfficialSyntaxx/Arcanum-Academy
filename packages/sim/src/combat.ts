/** Deterministic rule set used by server-authoritative combat encounters. */
export interface SparringState {
  readonly hitpoints: number;
  readonly maxHitpoints: number;
  readonly nextAttackAtMs: number;
  /** Null while the target is alive; otherwise the earliest time it may return. */
  readonly respawnAtMs: number | null;
  readonly defeats: number;
}

export interface AttackOutcome {
  readonly kind: 'hit';
  readonly state: SparringState;
  readonly damage: number;
  readonly defeated: boolean;
}

export interface AttackRejected {
  readonly kind: 'rejected';
  readonly state: SparringState;
  readonly reason: 'cooldown' | 'defeated' | 'invalid_damage';
}

export type SparringAttackResult = AttackOutcome | AttackRejected;

/** Creates a live encounter with one source of truth for its initial state. */
export function createSparringState(maxHitpoints: number, nowMs = 0): SparringState {
  if (!Number.isInteger(maxHitpoints) || maxHitpoints < 1) {
    throw new Error('Sparring maxHitpoints must be a positive integer.');
  }
  return {
    hitpoints: maxHitpoints,
    maxHitpoints,
    nextAttackAtMs: nowMs,
    respawnAtMs: null,
    defeats: 0,
  };
}

/**
 * Returns a restored target only once its respawn window has elapsed.
 *
 * Call this before resolving an attack. Keeping it separate from a hit ensures
 * a defeat can be rewarded exactly once by the authoritative server.
 */
export function respawnSparringTarget(state: SparringState, nowMs: number): SparringState {
  if (state.respawnAtMs === null || nowMs < state.respawnAtMs) return state;
  return {
    ...state,
    hitpoints: state.maxHitpoints,
    nextAttackAtMs: nowMs,
    respawnAtMs: null,
  };
}

/**
 * Applies one server-calculated combat hit.
 *
 * Damage deliberately remains an input to this pure rule: the server computes
 * it from player/enemy stats and never accepts it from a browser command.
 */
export function resolveSparringAttack(
  state: SparringState,
  nowMs: number,
  tickMs: number,
  respawnMs: number,
  damage: number,
): SparringAttackResult {
  if (!Number.isInteger(damage) || damage < 1) {
    return { kind: 'rejected', state, reason: 'invalid_damage' };
  }
  if (state.hitpoints < 1 || state.respawnAtMs !== null) {
    return { kind: 'rejected', state, reason: 'defeated' };
  }
  if (nowMs < state.nextAttackAtMs) {
    return { kind: 'rejected', state, reason: 'cooldown' };
  }

  const remaining = Math.max(0, state.hitpoints - damage);
  const defeated = remaining === 0;
  return {
    kind: 'hit',
    damage,
    defeated,
    state: defeated
      ? {
          ...state,
          hitpoints: 0,
          nextAttackAtMs: nowMs + tickMs,
          respawnAtMs: nowMs + respawnMs,
          defeats: state.defeats + 1,
        }
      : { ...state, hitpoints: remaining, nextAttackAtMs: nowMs + tickMs },
  };
}
