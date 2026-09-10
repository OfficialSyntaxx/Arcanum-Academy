import { describe, expect, it } from 'vitest';
import { resolveSparringAttack } from '../combat.js';

describe('sparring combat rules', () => {
  const initial = { hitpoints: 6, maxHitpoints: 6, nextAttackAtMs: 0, defeats: 0 };
  it('enforces the combat tick before resolving another hit', () => {
    expect(resolveSparringAttack(initial, 0, 600, 2)?.state.hitpoints).toBe(4);
    expect(resolveSparringAttack({ ...initial, nextAttackAtMs: 600 }, 599, 600, 2)).toBeNull();
  });
  it('respawns the target and records one defeat on a killing hit', () => {
    const outcome = resolveSparringAttack({ ...initial, hitpoints: 2 }, 1_200, 600, 2)!;
    expect(outcome.defeated).toBe(true);
    expect(outcome.state).toMatchObject({ hitpoints: 6, defeats: 1, nextAttackAtMs: 1_800 });
  });
});
