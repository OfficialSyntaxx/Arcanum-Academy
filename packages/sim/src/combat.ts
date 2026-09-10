/** Deterministic rules for the first repeatable combat encounter. */
export interface SparringState {
  readonly hitpoints: number;
  readonly maxHitpoints: number;
  readonly nextAttackAtMs: number;
  readonly defeats: number;
}

export interface AttackOutcome {
  readonly state: SparringState;
  readonly damage: number;
  readonly defeated: boolean;
}

/** Applies one fixed-tick attack. The caller owns clocks, persistence and rewards. */
export function resolveSparringAttack(
  state: SparringState,
  nowMs: number,
  tickMs: number,
  damage: number,
): AttackOutcome | null {
  if (nowMs < state.nextAttackAtMs || damage < 1) return null;
  const remaining = Math.max(0, state.hitpoints - Math.floor(damage));
  const defeated = remaining === 0;
  return {
    damage: Math.floor(damage),
    defeated,
    state: defeated
      ? {
          ...state,
          hitpoints: state.maxHitpoints,
          nextAttackAtMs: nowMs + tickMs,
          defeats: state.defeats + 1,
        }
      : { ...state, hitpoints: remaining, nextAttackAtMs: nowMs + tickMs },
  };
}
