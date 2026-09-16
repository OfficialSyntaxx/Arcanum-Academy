/** Authored, presentation-ready milestones earned only by confirmed game events. */

export const DiscoveryCategory = {
  Gathering: 'GATHERING',
  Crafting: 'CRAFTING',
  Combat: 'COMBAT',
  Recovery: 'RECOVERY',
  Dungeon: 'DUNGEON',
} as const;
export type DiscoveryCategory = (typeof DiscoveryCategory)[keyof typeof DiscoveryCategory];

export interface DiscoveryDefinition {
  readonly id: string;
  readonly category: DiscoveryCategory;
  readonly title: string;
  readonly description: string;
}

export interface DiscoveryProgress {
  readonly unlockedAtMs: number;
}

export const DISCOVERY_CATALOG: readonly DiscoveryDefinition[] = [
  {
    id: 'discovery.gather.mushrooms',
    category: DiscoveryCategory.Gathering,
    title: 'Garden Forager',
    description: 'Gather from the Mystic Mushroom Patch.',
  },
  {
    id: 'discovery.gather.crystal',
    category: DiscoveryCategory.Gathering,
    title: 'Seam Seeker',
    description: 'Mine the Resonance Seam.',
  },
  {
    id: 'discovery.gather.emberwood',
    category: DiscoveryCategory.Gathering,
    title: 'Emberwood Tender',
    description: 'Gather from the Emberwood Stand.',
  },
  {
    id: 'discovery.gather.tidepool',
    category: DiscoveryCategory.Gathering,
    title: 'Tidepool Cast',
    description: 'Fish the Starlit Tide Pool.',
  },
  {
    id: 'discovery.craft.campfire',
    category: DiscoveryCategory.Crafting,
    title: 'Shore Cook',
    description: 'Cook a meal at the Shorelands Campfire.',
  },
  {
    id: 'discovery.craft.resonant_dust',
    category: DiscoveryCategory.Crafting,
    title: 'Fine Resonance',
    description: 'Grind Resonant Dust.',
  },
  {
    id: 'discovery.craft.azure_ink',
    category: DiscoveryCategory.Crafting,
    title: 'A Clear Hand',
    description: 'Distil Azure Ink.',
  },
  {
    id: 'discovery.combat.shore_wolf',
    category: DiscoveryCategory.Combat,
    title: 'First Hunt',
    description: 'Defeat a Shore Wolf.',
  },
  {
    id: 'discovery.combat.emberwing',
    category: DiscoveryCategory.Combat,
    title: 'Wings of Amber',
    description: 'Defeat an Emberwing Armabee.',
  },
  {
    id: 'discovery.combat.emberwood_wolf',
    category: DiscoveryCategory.Combat,
    title: 'Pack Hunter',
    description: 'Defeat an Emberwood Wolf in the Reach.',
  },
  {
    id: 'discovery.recovery.grave',
    category: DiscoveryCategory.Recovery,
    title: 'Returned to the Shore',
    description: 'Recover your items from a gravestone.',
  },
  {
    id: 'discovery.dungeon.saltwake_entered',
    category: DiscoveryCategory.Dungeon,
    title: 'Below the Saltline',
    description: 'Enter the Saltwake Ruins.',
  },
  {
    id: 'discovery.dungeon.sentinel',
    category: DiscoveryCategory.Dungeon,
    title: 'Gallery Unbound',
    description: 'Defeat a Drowned Sentinel in the Broken Gallery.',
  },
  {
    id: 'discovery.dungeon.warden',
    category: DiscoveryCategory.Dungeon,
    title: 'The Tide Recedes',
    description: 'Defeat the Drowned Warden.',
  },
  {
    id: 'discovery.dungeon.tideglass',
    category: DiscoveryCategory.Dungeon,
    title: 'Light Beneath Water',
    description: 'Claim the Tideglass Charm from the reliquary.',
  },
];

const DISCOVERY_BY_SOURCE: Readonly<Record<string, string>> = {
  'node.courtyard.mushroom': 'discovery.gather.mushrooms',
  'node.courtyard.crystal': 'discovery.gather.crystal',
  'node.courtyard.emberwood': 'discovery.gather.emberwood',
  'node.courtyard.tidepool': 'discovery.gather.tidepool',
  'recipe.meat.cooked_shore_wolf': 'discovery.craft.campfire',
  'recipe.fish.cooked_tidefin': 'discovery.craft.campfire',
  'recipe.fish.cooked_moonray': 'discovery.craft.campfire',
  'recipe.fish.cooked_stargill': 'discovery.craft.campfire',
  'recipe.dust.resonant': 'discovery.craft.resonant_dust',
  'recipe.ink.azure': 'discovery.craft.azure_ink',
  'int.combat.shore_wolf': 'discovery.combat.shore_wolf',
  'int.combat.emberwing_armabee': 'discovery.combat.emberwing',
  'int.combat.emberwood_wolf_a': 'discovery.combat.emberwood_wolf',
  'int.combat.emberwood_wolf_b': 'discovery.combat.emberwood_wolf',
  'int.combat.glade_armabee': 'discovery.combat.emberwing',
  'event.grave.reclaimed': 'discovery.recovery.grave',
  'event.saltwake.entered': 'discovery.dungeon.saltwake_entered',
  'int.combat.drowned_sentinel': 'discovery.dungeon.sentinel',
  'int.combat.drowned_warden': 'discovery.dungeon.warden',
  'event.saltwake.tideglass_claimed': 'discovery.dungeon.tideglass',
};

export function discoveryForSource(sourceId: string): string | undefined {
  return DISCOVERY_BY_SOURCE[sourceId];
}

/** Idempotent so a retry or repeated action can never mint a second discovery. */
export function recordDiscovery(
  progress: Readonly<Record<string, DiscoveryProgress>>,
  discoveryId: string | undefined,
  unlockedAtMs: number,
): Readonly<Record<string, DiscoveryProgress>> {
  if (discoveryId === undefined || progress[discoveryId] !== undefined) return progress;
  return { ...progress, [discoveryId]: { unlockedAtMs } };
}
