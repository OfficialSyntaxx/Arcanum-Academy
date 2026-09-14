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
}
export interface QuestKillObjectiveDefinition {
  readonly kind: 'KILL';
  readonly id: string;
  readonly encounterIds: readonly InteractableId[];
  readonly requiredQuantity: number;
  readonly label: string;
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
      },
      {
        kind: 'ITEM',
        id: 'hunt.cooked_shore_wolf_meat',
        itemIds: [asId<ItemDefinitionId>('item.meat.cooked_shore_wolf')],
        requiredQuantity: 1,
        label: 'Cook 1 Shore Wolf Meat',
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
      },
      {
        kind: 'ITEM',
        id: 'archive.crystal_shards',
        itemIds: [asId<ItemDefinitionId>('item.crystal.shard')],
        requiredQuantity: 2,
        label: 'Mine 2 Crystal Shards',
      },
    ],
    rewardCoins: 75,
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
