import { describe, expect, it } from 'vitest';
import { createSparringState, resolveSparringAttack, respawnSparringTarget } from '../combat.js';

describe('encounter combat', () => {
  const target = createSparringState(6);

  it('enforces a 600 ms combat tick with an explicit rejection', () => {
    expect(resolveSparringAttack(target, 0, 600, 4_000, 2)).toMatchObject({
      kind: 'hit',
      state: { hitpoints: 4 },
    });
    expect(
      resolveSparringAttack({ ...target, nextAttackAtMs: 600 }, 599, 600, 4_000, 2),
    ).toMatchObject({
      kind: 'rejected',
      reason: 'cooldown',
    });
  });

  it('keeps a defeated target down through its respawn window', () => {
    const hit = resolveSparringAttack({ ...target, hitpoints: 2 }, 1_200, 600, 4_000, 2);
    expect(hit).toMatchObject({
      kind: 'hit',
      defeated: true,
      state: { hitpoints: 0, respawnAtMs: 5_200, defeats: 1 },
    });
    if (hit.kind !== 'hit') throw new Error('expected a successful hit');

    expect(resolveSparringAttack(hit.state, 1_800, 600, 4_000, 2)).toMatchObject({
      kind: 'rejected',
      reason: 'defeated',
    });
    expect(respawnSparringTarget(hit.state, 5_199)).toEqual(hit.state);
    expect(respawnSparringTarget(hit.state, 5_200)).toMatchObject({
      hitpoints: 6,
      nextAttackAtMs: 5_200,
      respawnAtMs: null,
      defeats: 1,
    });
  });

  it('rejects browser-supplied invalid damage', () => {
    expect(resolveSparringAttack(target, 0, 600, 4_000, 0)).toMatchObject({
      kind: 'rejected',
      reason: 'invalid_damage',
    });
  });
});
