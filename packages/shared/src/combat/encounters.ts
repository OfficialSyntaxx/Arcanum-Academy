import { asId, type InteractableId } from '../ids.js';

/** Content definitions for the first live combat slice. Rules still execute on
 * the server; this data only tells both ends what may exist in the world. */
export interface CombatEncounterDefinition {
  readonly interactableId: InteractableId;
  readonly label: string;
  readonly maxHitpoints: number;
  readonly playerDamage: number;
  readonly enemyDamage: number;
  readonly respawnMs: number;
  readonly playerRecoveryMs: number;
}

export const PRACTICE_WISP: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.duel.training_wisp'),
  label: 'Practice Wisp',
  maxHitpoints: 8,
  playerDamage: 1,
  enemyDamage: 1,
  respawnMs: 4_000,
  playerRecoveryMs: 5_000,
});

export const COMBAT_ENCOUNTERS: readonly CombatEncounterDefinition[] = Object.freeze([
  PRACTICE_WISP,
]);

export function combatEncounterByInteractable(
  interactableId: string,
): CombatEncounterDefinition | undefined {
  return COMBAT_ENCOUNTERS.find((entry) => entry.interactableId === interactableId);
}
