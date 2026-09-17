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
  {
    id: 'diary.reach.pack',
    title: 'The Reach Answers',
    description: 'Fell the Emberwood pack and an armabee in the glade.',
    requiredDiscoveryIds: ['discovery.combat.emberwood_wolf', 'discovery.combat.emberwing'],
    rewardCoins: 15,
  },
  {
    id: 'diary.cinderfell.tally',
    title: 'A Cinderfell Tally',
    description: 'Clear the ridge pack and lay a wisp to rest.',
    // Both wisps share one discovery, so this and the Frostgate ledger below
    // can be half-answered by the same kill. Separating them would need a
    // discovery per wisp, which is more bookkeeping than the difference earns.
    requiredDiscoveryIds: ['discovery.combat.ridge_wolf', 'discovery.combat.wisp'],
    rewardCoins: 15,
  },
  {
    id: 'diary.frostgate.ledger',
    title: 'The Frostgate Ledger',
    description: 'Work the snowline: the frost pack, and a wisp laid to rest.',
    requiredDiscoveryIds: ['discovery.combat.frost_wolf', 'discovery.combat.wisp'],
    rewardCoins: 15,
  },
  {
    id: 'diary.saltwake.first_descent',
    title: 'The Saltwake Remembers',
    description: 'Enter the ruins, clear its guardians, and recover the Tideglass Charm.',
    requiredDiscoveryIds: [
      'discovery.dungeon.saltwake_entered',
      'discovery.dungeon.sentinel',
      'discovery.dungeon.warden',
      'discovery.dungeon.tideglass',
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
