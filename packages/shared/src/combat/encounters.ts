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
  readonly zoneId?: string;
  readonly requiredQuestId?: string;
  readonly boss?: boolean;
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

/** A second, small encounter that teaches target variety without a level wall. */
export const EMBERWING_ARMABEE: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.emberwing_armabee'),
  label: 'Emberwing Armabee',
  position: { x: -7, z: 19 },
  maxHitpoints: 5,
  playerDamage: 1,
  enemyDamage: 1,
  rewardCoins: 8,
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.armabee_wax'), quantity: 1 },
  ]),
  respawnMs: 5_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 1,
});

export const DROWNED_SENTINEL: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.drowned_sentinel'),
  label: 'Drowned Sentinel',
  position: { x: 0, z: -5 },
  maxHitpoints: 9,
  playerDamage: 1,
  enemyDamage: 2,
  rewardCoins: 12,
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.saltworn_fragment'), quantity: 1 },
  ]),
  respawnMs: 8_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 2,
  zoneId: 'zone.saltwake_ruins',
  requiredQuestId: 'quest.beneath_the_saltline',
});

export const DROWNED_WARDEN: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.drowned_warden'),
  label: 'Drowned Warden',
  position: { x: 0, z: 6.5 },
  maxHitpoints: 18,
  playerDamage: 1,
  enemyDamage: 2,
  rewardCoins: 24,
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.warden_scale'), quantity: 1 },
  ]),
  respawnMs: 15_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 3,
  zoneId: 'zone.saltwake_ruins',
  requiredQuestId: 'quest.beneath_the_saltline',
  boss: true,
});

export const COMBAT_ENCOUNTERS = Object.freeze([
  SHORE_WOLF,
  EMBERWING_ARMABEE,
  DROWNED_SENTINEL,
  DROWNED_WARDEN,
]);

export function combatEncounterByInteractable(id: string): CombatEncounterDefinition | undefined {
  return COMBAT_ENCOUNTERS.find((encounter) => encounter.interactableId === id);
}
