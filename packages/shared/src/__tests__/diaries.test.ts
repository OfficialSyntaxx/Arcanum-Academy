import { describe, expect, it } from 'vitest';
import { DIARY_CATALOG, DISCOVERY_CATALOG, diaryIsComplete, settleDiaryRewards } from '../index.js';

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

  it('keeps every diary at the approved reward', () => {
    // Fifteen coins is an owner-approved figure, so a new diary matches it
    // rather than setting its own. Paying more for the outer zones is a
    // reasonable idea and a balance decision, not something content authoring
    // gets to decide on the way past.
    expect(DIARY_CATALOG.map((diary) => diary.id)).toContain('diary.cinderhollow.first_forge');
    expect(DIARY_CATALOG.every((diary) => diary.rewardCoins === 15)).toBe(true);
  });

  it('names a real discovery in every diary requirement', () => {
    const known = new Set(DISCOVERY_CATALOG.map((entry) => entry.id));
    const problems = DIARY_CATALOG.flatMap((diary) =>
      diary.requiredDiscoveryIds
        .filter((id) => !known.has(id))
        .map((id) => `${diary.id}: unknown discovery "${id}"`),
    );
    expect(problems).toEqual([]);
  });
});
