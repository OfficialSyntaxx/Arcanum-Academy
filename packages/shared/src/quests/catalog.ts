/** Authored, server-enforced resource quests. */
import { asId, type ItemDefinitionId } from '../ids.js';
import { QuestStatus, type QuestProgress } from './types.js';

export interface QuestObjectiveDefinition {
  /** One objective can accept any of these equivalent resource variants. */
  readonly itemIds: readonly ItemDefinitionId[];
  readonly requiredQuantity: number;
  readonly label: string;
}

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
    id: 'quest.embers_for_the_archive',
    title: 'Embers for the Archive',
    description:
      'Archivist Onn is restoring a heat-safe record case. He needs emberwood and resonant crystal to seal it against the coastal damp.',
    hint: 'Chop Emberwood at the stand east of the plaza, then mine Crystal Shards at the Resonance Seam. Return here for 75 coins.',
    prerequisites: ['quest.first_kindling'],
    objectives: [
      {
        itemIds: [asId<ItemDefinitionId>('item.emberwood.branch')],
        requiredQuantity: 4,
        label: 'Gather 4 Emberwood Branches',
      },
      {
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
  return quest.prerequisites.every(
    (id) => progress[id]?.status === QuestStatus.Completed,
  );
}
