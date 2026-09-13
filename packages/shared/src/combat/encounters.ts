import { asId, type InteractableId } from '../ids.js';

/** Content definitions for the first live combat slice. Rules still execute on
 * the server; this data only tells both ends what may exist in the world. */
export interface CombatEncounterDefinition {
  readonly interactableId: InteractableId;
  readonly label: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly maxHitpoints: number;
  readonly playerDamage: number;
  readonly enemyDamage: number;
  /** Soft currency granted exactly once when this target is defeated. */
  readonly rewardCoins: number;
  readonly respawnMs: number;
  readonly playerRecoveryMs: number;
  /** Combat level required before this encounter may be attacked. */
  readonly requiredCombatLevel: number;
}

export const PRACTICE_WISP: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.duel.training_wisp'),
  label: 'Practice Wisp',
  position: { x: 0, z: 12.8 },
  maxHitpoints: 8,
  playerDamage: 1,
  enemyDamage: 1,
  rewardCoins: 6,
  respawnMs: 4_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 1,
});

export const ARCANE_WISP: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.duel.arcane_wisp'),
  label: 'Arcane Wisp',
  position: { x: -4, z: 17.5 },
  maxHitpoints: 10,
  playerDamage: 1,
  enemyDamage: 1,
  rewardCoins: 12,
  respawnMs: 5_500,
  playerRecoveryMs: 6_000,
  requiredCombatLevel: 2,
});

export const COMBAT_ENCOUNTERS: readonly CombatEncounterDefinition[] = Object.freeze([
  PRACTICE_WISP,
  ARCANE_WISP,
]);

export function combatEncounterByInteractable(
  interactableId: string,
): CombatEncounterDefinition | undefined {
  return COMBAT_ENCOUNTERS.find((entry) => entry.interactableId === interactableId);
}
