import { describe, expect, it } from 'vitest';
import { DIARY_CATALOG, diaryIsComplete, settleDiaryRewards } from '../index.js';

describe('Shorelands diaries', () => {
  it('derives completion and pays each 15-coin reward only once', () => {
    const diary = DIARY_CATALOG[0]!;
    const discoveries = Object.fromEntries(
      diary.requiredDiscoveryIds.map((id) => [id, { unlockedAtMs: 1 }]),
    );
    expect(diaryIsComplete(diary, discoveries)).toBe(true);
    const first = settleDiaryRewards({}, discoveries, 10);
    expect(first.coins).toBe(15);
    expect(first.receipts[diary.id]).toEqual({ paidAtMs: 10 });
    expect(settleDiaryRewards(first.receipts, discoveries, 20)).toEqual({
      receipts: first.receipts,
      coins: 0,
    });
  });

  it('keeps every starter diary at the approved reward', () => {
    expect(DIARY_CATALOG).toHaveLength(4);
    expect(DIARY_CATALOG.every((diary) => diary.rewardCoins === 15)).toBe(true);
  });
});
