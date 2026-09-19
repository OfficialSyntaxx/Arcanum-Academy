/** Authored, server-enforced quest objectives and progression rules. */
import { asId, type InteractableId, type ItemDefinitionId } from '../ids.js';
import { QuestStatus, type QuestProgress } from './types.js';

export interface QuestItemObjectiveDefinition {
  readonly kind: 'ITEM';
  readonly id: string;
  /** One objective can accept any of these equivalent resource variants. */
  readonly itemIds: readonly ItemDefinitionId[];
  readonly requiredQuantity: number;
  readonly label: string;
  /** Short in-world destination shown by the compact mobile journey tracker. */
  readonly location: string;
  /** Defaults true. Permanent proof items remain in the satchel on turn-in. */
  readonly consume?: boolean;
}
export interface QuestKillObjectiveDefinition {
  readonly kind: 'KILL';
  readonly id: string;
  readonly encounterIds: readonly InteractableId[];
  readonly requiredQuantity: number;
  readonly label: string;
  /** Short in-world destination shown by the compact mobile journey tracker. */
  readonly location: string;
}
export type QuestObjectiveDefinition = QuestItemObjectiveDefinition | QuestKillObjectiveDefinition;

export interface QuestDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly hint: string;
  readonly prerequisites: readonly string[];
  readonly objectives: readonly QuestObjectiveDefinition[];
  readonly rewardCoins: number;
}

export const QUEST_CATALOG: readonly QuestDefinition[] = [
  {
    id: 'quest.first_kindling',
    title: 'The First Kindling',
    description:
      'Groundskeeper Bram is tending the garden beds. He needs three Mystic Mushrooms before the evening lamps can be lit.',
    hint: 'Find the patch in the Alchemy Gardens, west of the plaza. Bring the mushrooms back here for 40 coins.',
    prerequisites: [],
    objectives: [
      {
        kind: 'ITEM',
        id: 'kindling.mushrooms',
        itemIds: [
          asId<ItemDefinitionId>('item.mushroom.cap'),
          asId<ItemDefinitionId>('item.mushroom.glowspore'),
          asId<ItemDefinitionId>('item.mushroom.dreamveil'),
        ],
        requiredQuantity: 3,
        label: 'Gather 3 Mystic Mushrooms',
        location: 'Alchemy Gardens',
      },
    ],
    rewardCoins: 40,
  },
  {
    id: 'quest.first_hunt',
    title: 'The First Hunt',
    description:
      'Warden Ilya wants proof that you can feed yourself beyond the garden paths. Hunt the Shore Wolves, then cook a meal at the campfire.',
    hint: 'Defeat two Shore Wolves on the Duelling Terrace. Cook one Raw Shore Wolf Meat at the nearby campfire and return here.',
    prerequisites: ['quest.first_kindling'],
    objectives: [
      {
        kind: 'KILL',
        id: 'hunt.shore_wolves',
        encounterIds: [asId<InteractableId>('int.combat.shore_wolf')],
        requiredQuantity: 2,
        label: 'Defeat 2 Shore Wolves',
        location: 'Duelling Terrace',
      },
      {
        kind: 'ITEM',
        id: 'hunt.cooked_shore_wolf_meat',
        itemIds: [asId<ItemDefinitionId>('item.meat.cooked_shore_wolf')],
        requiredQuantity: 1,
        label: 'Cook 1 Shore Wolf Meat',
        location: 'Terrace Campfire',
      },
    ],
    rewardCoins: 60,
  },
  {
    id: 'quest.embers_for_the_archive',
    title: 'Embers for the Archive',
    description:
      'Archivist Onn is restoring a heat-safe record case. He needs emberwood and resonant crystal to seal it against the coastal damp.',
    hint: 'Chop Emberwood at the stand east of the plaza, then mine Crystal Shards at the Resonance Seam. Return here for 75 coins.',
    prerequisites: ['quest.first_hunt'],
    objectives: [
      {
        kind: 'ITEM',
        id: 'archive.emberwood',
        itemIds: [asId<ItemDefinitionId>('item.emberwood.branch')],
        requiredQuantity: 4,
        label: 'Gather 4 Emberwood Branches',
        location: 'Emberwood Stand',
      },
      {
        kind: 'ITEM',
        id: 'archive.crystal_shards',
        itemIds: [asId<ItemDefinitionId>('item.crystal.shard')],
        requiredQuantity: 2,
        label: 'Mine 2 Crystal Shards',
        location: 'Resonance Seam',
      },
    ],
    rewardCoins: 75,
  },
  {
    id: 'quest.clear_copy',
    title: 'A Clear Copy',
    description:
      'Professor Vosk is restoring a salt-damaged survey of the old coast. Distil a vial of Azure Ink so the map can be copied before its markings fade.',
    hint: 'Gather Pale Caps in the Alchemy Gardens and Crystal Shards at the Resonance Seam. Grind the shards, then distil Azure Ink at the Scribing Hall and return here for 35 coins.',
    prerequisites: ['quest.embers_for_the_archive'],
    objectives: [
      {
        kind: 'ITEM',
        id: 'copy.azure_ink',
        itemIds: [asId<ItemDefinitionId>('item.ink.azure')],
        requiredQuantity: 1,
        label: 'Distil 1 Azure Ink',
        location: 'Scribing Hall',
      },
    ],
    rewardCoins: 35,
  },
  {
    id: 'quest.beneath_the_saltline',
    title: 'Beneath the Saltline',
    description:
      'Archivist Onn has restored the coast survey. Its final mark points below the Library shore, where the Saltwake Warden still guards a drowned vault.',
    hint: 'Enter the Saltwake Ruins from the Library shore, defeat a Drowned Sentinel and the Drowned Warden, open the Tideglass Reliquary, then return here.',
    prerequisites: ['quest.clear_copy'],
    objectives: [
      {
        kind: 'KILL',
        id: 'saltline.sentinel',
        encounterIds: [asId<InteractableId>('int.combat.drowned_sentinel')],
        requiredQuantity: 1,
        label: 'Defeat a Drowned Sentinel',
        location: 'Saltwake Ruins',
      },
      {
        kind: 'KILL',
        id: 'saltline.warden',
        encounterIds: [asId<InteractableId>('int.combat.drowned_warden')],
        requiredQuantity: 1,
        label: 'Defeat the Drowned Warden',
        location: 'Saltwake Ruins',
      },
      {
        kind: 'ITEM',
        id: 'saltline.tideglass',
        itemIds: [asId<ItemDefinitionId>('item.charm.tideglass')],
        requiredQuantity: 1,
        label: 'Claim the Tideglass Charm',
        location: 'Tideglass Reliquary',
        consume: false,
      },
    ],
    rewardCoins: 100,
  },
  {
    id: 'quest.the_reach_pack',
    title: 'The Reach Pack',
    description:
      'Warden Ilya has had word of a pack working the Emberwood Reach. She wants the numbers thinned and a bundle of heartwood brought back to prove you got that far in.',
    hint: 'Travel to the Emberwood Reach. Defeat 3 Emberwood Wolves and fell 3 Heartwood, then return here.',
    prerequisites: ['quest.first_hunt'],
    objectives: [
      {
        kind: 'KILL',
        id: 'reach.wolves',
        encounterIds: [
          asId<InteractableId>('int.combat.emberwood_wolf_a'),
          asId<InteractableId>('int.combat.emberwood_wolf_b'),
        ],
        requiredQuantity: 3,
        label: 'Defeat 3 Emberwood Wolves',
        location: 'Emberwood Reach',
      },
      {
        kind: 'ITEM',
        id: 'reach.heartwood',
        itemIds: [asId<ItemDefinitionId>('item.emberwood.heartwood')],
        requiredQuantity: 3,
        label: 'Fell 3 Heartwood',
        location: 'Emberwood Reach',
      },
    ],
    rewardCoins: 90,
  },
  {
    id: 'quest.the_foothill_forge',
    title: 'The Foothill Forge',
    description:
      'The forge above the ridge has been cold since the pack moved in below it. Clear the approach, then prove the fire still takes by drawing a resonant ingot from it.',
    hint: 'Travel to the Cinderfell Ridge. Defeat 2 Ridge Wolves and a Cinder Wisp, then smelt 1 Resonant Ingot at the foothill forge.',
    prerequisites: ['quest.the_reach_pack'],
    objectives: [
      {
        kind: 'KILL',
        id: 'forge.ridge_wolves',
        encounterIds: [
          asId<InteractableId>('int.combat.ridge_wolf_a'),
          asId<InteractableId>('int.combat.ridge_wolf_b'),
        ],
        requiredQuantity: 2,
        label: 'Defeat 2 Ridge Wolves',
        location: 'Cinderfell Ridge',
      },
      {
        kind: 'KILL',
        id: 'forge.cinder_wisp',
        encounterIds: [asId<InteractableId>('int.combat.cinder_wisp')],
        requiredQuantity: 1,
        label: 'Defeat a Cinder Wisp',
        location: 'Cinderfell Ridge',
      },
      {
        kind: 'ITEM',
        id: 'forge.ingot',
        itemIds: [asId<ItemDefinitionId>('item.ingot.resonant')],
        requiredQuantity: 1,
        label: 'Smelt 1 Resonant Ingot',
        location: 'Foothill Forge',
      },
    ],
    rewardCoins: 120,
  },
  {
    id: 'quest.heart_of_cinderhollow',
    title: 'Heart of Cinderhollow',
    description:
      'Prospector Brix has heard the old crucible stirring beneath the Cindermark. Mine enough Cinder Ore to feed it, unbind its keeper, and bring back proof that the heart has finally cooled.',
    hint: 'Descend from the Foothill Camp into Cinderhollow. Mine 6 Cinder Ore, defeat a Cinderbound Wisp, then challenge Cinderheart in the Crucible Chamber.',
    prerequisites: ['quest.the_foothill_forge'],
    objectives: [
      {
        kind: 'ITEM',
        id: 'cinderhollow.ore',
        itemIds: [asId<ItemDefinitionId>('item.ore.cinder')],
        requiredQuantity: 6,
        label: 'Mine 6 Cinder Ore',
        location: 'Cinderhollow',
      },
      {
        kind: 'KILL',
        id: 'cinderhollow.wisp',
        encounterIds: [asId<InteractableId>('int.combat.cinderbound_wisp')],
        requiredQuantity: 1,
        label: 'Defeat a Cinderbound Wisp',
        location: 'Cinderhollow',
      },
      {
        kind: 'KILL',
        id: 'cinderhollow.heart',
        encounterIds: [asId<InteractableId>('int.combat.cinderheart')],
        requiredQuantity: 1,
        label: 'Defeat Cinderheart',
        location: 'Crucible Chamber',
      },
      {
        kind: 'ITEM',
        id: 'cinderhollow.sigil',
        itemIds: [asId<ItemDefinitionId>('item.charm.cinderheart')],
        requiredQuantity: 1,
        label: 'Claim the Cinderheart Sigil',
        location: 'Crucible Chamber',
        consume: false,
      },
    ],
    rewardCoins: 150,
  },
  {
    id: 'quest.the_long_winter',
    title: 'The Long Winter',
    description:
      'Nothing keeps past the frostgate without help. Bring back preserve enough for a season, and the scale of whatever objects to you picking the berries.',
    hint: 'Travel to the Frostgate. Defeat 2 Frost Wolves and a Rime Wisp, gather Frost Berries, and put up 2 Berry Preserve at the workshop.',
    prerequisites: ['quest.the_foothill_forge'],
    objectives: [
      {
        kind: 'KILL',
        id: 'winter.frost_wolves',
        encounterIds: [
          asId<InteractableId>('int.combat.frost_wolf_a'),
          asId<InteractableId>('int.combat.frost_wolf_b'),
        ],
        requiredQuantity: 2,
        label: 'Defeat 2 Frost Wolves',
        location: 'Frostgate',
      },
      {
        kind: 'KILL',
        id: 'winter.rime_wisp',
        encounterIds: [asId<InteractableId>('int.combat.rime_wisp')],
        requiredQuantity: 1,
        label: 'Defeat a Rime Wisp',
        location: 'Frostgate',
      },
      {
        kind: 'ITEM',
        id: 'winter.preserve',
        itemIds: [asId<ItemDefinitionId>('item.food.berry_preserve')],
        requiredQuantity: 2,
        label: 'Put up 2 Berry Preserve',
        location: 'Frostgate Workshop',
      },
    ],
    rewardCoins: 150,
  },
];

export function questById(id: string): QuestDefinition | undefined {
  return QUEST_CATALOG.find((quest) => quest.id === id);
}

export function questIsUnlocked(
  quest: QuestDefinition,
  progress: Readonly<Record<string, QuestProgress>>,
): boolean {
  return quest.prerequisites.every((id) => progress[id]?.status === QuestStatus.Completed);
}

/** Records only server-confirmed encounter defeats for active authored quests. */
export function recordEncounterDefeat(
  progress: Readonly<Record<string, QuestProgress>>,
  encounterId: InteractableId,
): Readonly<Record<string, QuestProgress>> {
  let changed = false;
  const next: Record<string, QuestProgress> = { ...progress };
  for (const quest of QUEST_CATALOG) {
    const current = progress[quest.id];
    if (current?.status !== QuestStatus.Active) continue;
    let objectiveCounts = current.objectiveCounts;
    for (const objective of quest.objectives) {
      if (objective.kind !== 'KILL' || !objective.encounterIds.includes(encounterId)) continue;
      const count = objectiveCounts[objective.id] ?? 0;
      if (count >= objective.requiredQuantity) continue;
      objectiveCounts = { ...objectiveCounts, [objective.id]: count + 1 };
      changed = true;
    }
    if (objectiveCounts !== current.objectiveCounts)
      next[quest.id] = { ...current, objectiveCounts };
  }
  return changed ? next : progress;
}
