import { asId, type InteractableId, type ItemDefinitionId } from '../ids.js';

/** Shared authored values for server-authoritative practice encounters. */
export interface CombatEncounterDefinition {
  readonly interactableId: InteractableId;
  readonly label: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly maxHitpoints: number;
  readonly playerDamage: number;
  readonly enemyDamage: number;
  readonly rewardCoins: number;
  /** Guaranteed material loot, awarded only on a confirmed defeat. */
  readonly drops: readonly { readonly itemId: ItemDefinitionId; readonly quantity: number }[];
  readonly respawnMs: number;
  readonly playerRecoveryMs: number;
  readonly requiredCombatLevel: number;
}

export const SHORE_WOLF: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.shore_wolf'),
  label: 'Shore Wolf',
  position: { x: 0, z: 12.8 },
  // The first real fight should teach the loop, not punish a new arrival.
  maxHitpoints: 4,
  playerDamage: 1,
  enemyDamage: 1,
  rewardCoins: 6,
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.meat.raw_shore_wolf'), quantity: 1 },
  ]),
  respawnMs: 4_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 1,
});

export const COMBAT_ENCOUNTERS = Object.freeze([SHORE_WOLF]);

export function combatEncounterByInteractable(id: string): CombatEncounterDefinition | undefined {
  return COMBAT_ENCOUNTERS.find((encounter) => encounter.interactableId === id);
}
