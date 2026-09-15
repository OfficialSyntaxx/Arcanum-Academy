import type { DiscoveryProgress } from '../discoveries/catalog.js';

export interface DiaryDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requiredDiscoveryIds: readonly string[];
  readonly rewardCoins: number;
}

export interface DiaryRewardReceipt {
  readonly paidAtMs: number;
}

export const DIARY_CATALOG: readonly DiaryDefinition[] = [
  {
    id: 'diary.shorelands.gatherer',
    title: 'A Shorelands Circuit',
    description: 'Discover all four Shorelands gathering sites.',
    requiredDiscoveryIds: [
      'discovery.gather.mushrooms',
      'discovery.gather.crystal',
      'discovery.gather.emberwood',
      'discovery.gather.tidepool',
    ],
    rewardCoins: 15,
  },
  {
    id: 'diary.shorelands.craft',
    title: 'Hands to Work',
    description: 'Cook a meal, grind Resonant Dust, and distil Azure Ink.',
    requiredDiscoveryIds: [
      'discovery.craft.campfire',
      'discovery.craft.resonant_dust',
      'discovery.craft.azure_ink',
    ],
    rewardCoins: 15,
  },
  {
    id: 'diary.shorelands.combat',
    title: 'The Terrace Remembers',
    description: 'Defeat both Shorelands creatures and reclaim a gravestone.',
    requiredDiscoveryIds: [
      'discovery.combat.shore_wolf',
      'discovery.combat.emberwing',
      'discovery.recovery.grave',
    ],
    rewardCoins: 15,
  },
];

export function diaryIsComplete(
  diary: DiaryDefinition,
  discoveries: Readonly<Record<string, DiscoveryProgress>>,
): boolean {
  return diary.requiredDiscoveryIds.every((id) => discoveries[id] !== undefined);
}

/** Pays newly completed diaries once; completion itself remains derived from discoveries. */
export function settleDiaryRewards(
  receipts: Readonly<Record<string, DiaryRewardReceipt>>,
  discoveries: Readonly<Record<string, DiscoveryProgress>>,
  nowMs: number,
): { readonly receipts: Readonly<Record<string, DiaryRewardReceipt>>; readonly coins: number } {
  let next = receipts;
  let coins = 0;
  for (const diary of DIARY_CATALOG) {
    if (next[diary.id] !== undefined || !diaryIsComplete(diary, discoveries)) continue;
    next = { ...next, [diary.id]: { paidAtMs: nowMs } };
    coins += diary.rewardCoins;
  }
  return { receipts: next, coins };
}
