import { asId, type InteractableId } from '../ids.js';

/** Shared authored values for server-authoritative practice encounters. */
export interface CombatEncounterDefinition {
  readonly interactableId: InteractableId;
  readonly label: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly maxHitpoints: number;
  readonly playerDamage: number;
  readonly enemyDamage: number;
  readonly rewardCoins: number;
  readonly respawnMs: number;
  readonly playerRecoveryMs: number;
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

export const COMBAT_ENCOUNTERS = Object.freeze([PRACTICE_WISP]);

export function combatEncounterByInteractable(id: string): CombatEncounterDefinition | undefined {
  return COMBAT_ENCOUNTERS.find((encounter) => encounter.interactableId === id);
}
