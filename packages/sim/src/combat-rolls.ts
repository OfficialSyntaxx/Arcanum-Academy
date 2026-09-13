/**
 * Pure, integer-only OSRS-shaped combat rolls.
 *
 * Draw order is a compatibility contract: accuracy is always drawn first,
 * defence second, and max-hit only after a successful accuracy check. A miss
 * consumes exactly two RNG draws; a hit consumes three.
 */
export interface CombatRng {
  nextInt(min: number, max: number): number;
}

export interface CombatRollInput {
  readonly attackLevel: number;
  readonly strengthLevel: number;
  readonly defenceLevel: number;
  readonly attackBonus: number;
  readonly strengthBonus: number;
  readonly defenceBonus: number;
}

export interface CombatRollResult {
  readonly hit: boolean;
  readonly damage: number;
  readonly attackRoll: number;
  readonly defenceRoll: number;
  readonly maxHit: number;
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer.`);
}

/** Calculates the maximum integer damage from an effective strength and gear bonus. */
export function maxMeleeHit(strengthLevel: number, strengthBonus: number): number {
  nonNegativeInteger(strengthLevel, 'strengthLevel');
  nonNegativeInteger(strengthBonus, 'strengthBonus');
  return Math.floor((strengthLevel * (strengthBonus + 64)) / 640);
}

/** Resolves exactly one attack without accepting browser-provided damage. */
export function resolveMeleeRoll(input: CombatRollInput, rng: CombatRng): CombatRollResult {
  for (const [label, value] of Object.entries(input)) nonNegativeInteger(value, label);
  const attackRoll = input.attackLevel * (input.attackBonus + 64);
  const defenceRoll = input.defenceLevel * (input.defenceBonus + 64);
  const maxHit = maxMeleeHit(input.strengthLevel, input.strengthBonus);
  const attackDraw = rng.nextInt(0, attackRoll);
  const defenceDraw = rng.nextInt(0, defenceRoll);
  if (attackDraw <= defenceDraw) return { hit: false, damage: 0, attackRoll, defenceRoll, maxHit };
  return {
    hit: true,
    damage: rng.nextInt(0, maxHit),
    attackRoll,
    defenceRoll,
    maxHit,
  };
}
