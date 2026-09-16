/**
 * Items, split the same way cards are split in ADR-0004.
 *
 * `ItemDefinition` is rules: what a thing is, how it stacks, what it does. It
 * is shared by every copy in the world and is the only half content and
 * recipes ever reference.
 *
 * `ItemInstance` is provenance: the wear on one particular pickaxe. Only items
 * carrying per-copy state need one. Materials stack and are counted, so a
 * thousand crystal shards are a quantity rather than a thousand identities -
 * which keeps inventories small and their comparisons cheap.
 *
 * Keeping the halves apart is what stops a recipe from ever depending on who
 * owned an ingredient or how worn it was, exactly as ADR-0004 stops the combat
 * resolver depending on a card's grade.
 */

import type { ItemDefinitionId, ItemInstanceId, SkillId } from '../ids.js';

export const ItemCategory = {
  /** Stacks, is consumed by recipes, carries no per-copy state. */
  Material: 'MATERIAL',
  /** Does not stack; wears down independently of every other copy. */
  Tool: 'TOOL',
  /** Worn in one equipment slot; never occupies a bag slot while equipped. */
  Equipment: 'EQUIPMENT',
} as const;
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const ItemRarity = {
  Common: 'COMMON',
  Uncommon: 'UNCOMMON',
  Rare: 'RARE',
  Epic: 'EPIC',
} as const;
export type ItemRarity = (typeof ItemRarity)[keyof typeof ItemRarity];

export interface ToolProperties {
  readonly maxDurability: number;
  /** Yield multiplier while the tool holds durability above zero. */
  readonly yieldMultiplierBasisPoints: number;
  /** The gathering skill this tool equips against. One tool per skill. */
  readonly boundSkillId: SkillId;
  /** Minimum level needed to equip or buy this tool. */
  readonly requiredSkillLevel?: number;
  /** Currency to restore full durability. Durability is a sink, not a wall. */
  readonly repairCost: number;
}

/**
 * Where a piece of worn gear sits.
 *
 * Worn gear lives on the equipment screen and never occupies bag slots (D13).
 * The full launch list is in AI_HANDOVER §3.2; slots are added here as gear
 * for them exists, so the equipment screen never shows a row nothing can fill.
 */
export const EquipmentSlot = {
  Weapon: 'WEAPON',
  Body: 'BODY',
  Shield: 'SHIELD',
} as const;
export type EquipmentSlot = (typeof EquipmentSlot)[keyof typeof EquipmentSlot];

/**
 * What wearing a piece of gear is worth in a fight.
 *
 * These are the `attackBonus`, `strengthBonus` and `defenceBonus` the OSRS
 * rolls in `@alderfell/sim` already take: attack raises how often you land,
 * strength raises your maximum hit, defence raises how often a creature
 * misses you. Every one of them was zero before gear existed.
 */
export interface EquipmentProperties {
  readonly slot: EquipmentSlot;
  readonly attackBonus: number;
  readonly strengthBonus: number;
  readonly defenceBonus: number;
  /** The combat skill gating this piece, with the level it demands. */
  readonly requiredSkillId: SkillId;
  readonly requiredSkillLevel: number;
}

/** A stackable item that can be consumed directly from the combat HUD. */
export interface ConsumableProperties {
  /** Hitpoints restored by one use. */
  readonly healAmount: number;
}

export interface ItemDefinition {
  readonly id: ItemDefinitionId;
  readonly name: string;
  readonly description: string;
  readonly category: ItemCategory;
  readonly rarity: ItemRarity;
  /** Maximum quantity in one inventory slot. Always 1 for a tool. */
  readonly stackCap: number;
  /** Baseline value used by vendors and as a floor reference for the market. */
  readonly baseValue: number;
  readonly iconKey: string;
  /** Present exactly when `category` is `Tool`. */
  readonly tool?: ToolProperties;
  /** Present for a material that can be consumed for an immediate effect. */
  readonly consumable?: ConsumableProperties;
  /** Present exactly when `category` is `Equipment`. */
  readonly equipment?: EquipmentProperties;
}

/** One owned tool. Never appears in content, only in player state. */
export interface ItemInstance {
  readonly instanceId: ItemInstanceId;
  readonly definitionId: ItemDefinitionId;
  readonly durability: number;
  readonly acquiredAtMs: number;
}

/** A counted pile of one material occupying a single inventory slot. */
export interface ItemStack {
  readonly definitionId: ItemDefinitionId;
  readonly quantity: number;
}
