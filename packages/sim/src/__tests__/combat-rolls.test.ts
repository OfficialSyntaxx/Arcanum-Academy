import { describe, expect, it } from 'vitest';
import { effectiveLevel, maxMeleeHit, resolveMeleeRoll, type CombatRng } from '../combat-rolls.js';

function scripted(...draws: number[]): CombatRng & { calls: readonly [number, number][] } {
  const calls: [number, number][] = [];
  return {
    calls,
    nextInt(min, max) {
      calls.push([min, max]);
      const value = draws.shift();
      if (value === undefined || value < min || value > max) throw new Error('unexpected RNG draw');
      return value;
    },
  };
}

const equalStats = {
  attackLevel: 10,
  strengthLevel: 10,
  defenceLevel: 10,
  attackBonus: 0,
  strengthBonus: 0,
  defenceBonus: 0,
};

describe('OSRS-shaped combat rolls', () => {
  it('uses only accuracy and defence draws for a miss', () => {
    const rng = scripted(100, 100);
    expect(resolveMeleeRoll(equalStats, rng)).toMatchObject({
      hit: false,
      damage: 0,
      attackRoll: 640,
      defenceRoll: 640,
      maxHit: 1,
    });
    expect(rng.calls).toEqual([
      [0, 640],
      [0, 640],
    ]);
  });

  it('draws max hit only after a confirmed hit', () => {
    const rng = scripted(640, 0, 1);
    expect(resolveMeleeRoll(equalStats, rng)).toMatchObject({ hit: true, damage: 1 });
    expect(rng.calls).toEqual([
      [0, 640],
      [0, 640],
      [0, 1],
    ]);
  });

  it('keeps max-hit arithmetic integer-only and validates bad content', () => {
    expect(maxMeleeHit(10, 0)).toBe(1);
    expect(maxMeleeHit(99, 100)).toBe(25);
    expect(() => maxMeleeHit(1.5, 0)).toThrow('strengthLevel');
  });

  it('turns worn gear into a better attack roll and a harder roll to hit through', () => {
    const bare = resolveMeleeRoll(equalStats, scripted(0, 0, 0));
    const geared = resolveMeleeRoll({ ...equalStats, attackBonus: 12 }, scripted(0, 0, 0));
    // Accuracy is where early gear is felt: +12 on a base of 64 is about a
    // fifth more attack roll, immediately, at any level.
    expect(geared.attackRoll).toBeGreaterThan(bare.attackRoll);
    // Armour is the same lever from the other side.
    const armoured = resolveMeleeRoll({ ...equalStats, defenceBonus: 20 }, scripted(0, 0, 0));
    expect(armoured.defenceRoll).toBeGreaterThan(bare.defenceRoll);
  });

  it('needs real Strength behind a strength bonus before the maximum hit moves', () => {
    // The OSRS divisor is 640, so at low levels a strength bonus rounds away
    // entirely. This is faithful, and it is why the first gear tier is sold on
    // accuracy rather than damage.
    expect(maxMeleeHit(10, 0)).toBe(maxMeleeHit(10, 10));
    expect(maxMeleeHit(60, 10)).toBeGreaterThan(maxMeleeHit(60, 0));
  });

  it('raises the effective level by eight plus the style bonus, so level one can hit', () => {
    expect(effectiveLevel(1)).toBe(9);
    expect(effectiveLevel(1, 3)).toBe(12);
    expect(maxMeleeHit(effectiveLevel(1), 0)).toBe(1);
    expect(maxMeleeHit(effectiveLevel(40), 0)).toBe(5);
    expect(maxMeleeHit(effectiveLevel(99, 3), 0)).toBe(11);
    expect(() => effectiveLevel(-1)).toThrow('level');
  });
});
