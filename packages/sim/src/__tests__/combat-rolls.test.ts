import { describe, expect, it } from 'vitest';
import { maxMeleeHit, resolveMeleeRoll, type CombatRng } from '../combat-rolls.js';

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
});
