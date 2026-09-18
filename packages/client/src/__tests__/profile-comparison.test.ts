import { describe, expect, it } from 'vitest';
import { SKILL_TABLE } from '@alderfell/shared';

import { comparePublicProfile } from '../ui/profile-comparison.js';

describe('public profile comparison', () => {
  it('compares a public record with server-confirmed local progression only', () => {
    const first = SKILL_TABLE.skills[0]!;
    const comparison = comparePublicProfile(
      { [first.id]: { level: 7, xp: 123 } },
      { 'discovery.gather.mushrooms': { unlockedAtMs: 1 } },
      { 'diary.shorelands.gatherer': { paidAtMs: 1 } },
      {
        totalLevel: 18,
        totalXp: 222,
        discoveries: 4,
        diaryHighlights: ['A Shorelands Circuit'],
        skills: [{ name: first.name, level: 9, xp: 222 }],
      },
    );

    expect(comparison.totals).toMatchObject({
      ownDiscoveries: 1,
      otherDiscoveries: 4,
      ownDiaries: 1,
      otherDiaries: 1,
      otherLevel: 18,
    });
    expect(comparison.skills[0]).toMatchObject({ name: first.name, own: { level: 7, xp: 123 } });
    expect(comparison.ownDiaryTitles).toEqual(['A Shorelands Circuit']);
  });

  it('uses neutral defaults for skills omitted from the public response', () => {
    const comparison = comparePublicProfile(
      {},
      {},
      {},
      {
        totalLevel: 0,
        totalXp: 0,
        discoveries: 0,
        diaryHighlights: [],
        skills: [],
      },
    );

    expect(comparison.skills).toHaveLength(SKILL_TABLE.skills.length);
    expect(
      comparison.skills.every((skill) => skill.own.level === 1 && skill.other.level === 1),
    ).toBe(true);
  });
});
