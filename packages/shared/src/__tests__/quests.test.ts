import { describe, expect, it } from 'vitest';
import { QUEST_CATALOG, QuestStatus, questById, questIsUnlocked } from '../index.js';

describe('resource quest catalog', () => {
  it('keeps the follow-up quest locked until the first turn-in is complete', () => {
    const followUp = questById('quest.embers_for_the_archive');
    expect(followUp).toBeDefined();
    expect(questIsUnlocked(followUp!, {})).toBe(false);
    expect(
      questIsUnlocked(followUp!, {
        'quest.first_kindling': {
          status: QuestStatus.Completed,
          acceptedAtMs: 1,
          completedAtMs: 2,
        },
      }),
    ).toBe(true);
  });

  it('has positive rewards and objectives for every shipped quest', () => {
    for (const quest of QUEST_CATALOG) {
      expect(quest.rewardCoins).toBeGreaterThan(0);
      expect(quest.objectives.length).toBeGreaterThan(0);
      for (const objective of quest.objectives) {
        expect(objective.itemIds.length).toBeGreaterThan(0);
        expect(objective.requiredQuantity).toBeGreaterThan(0);
      }
    }
  });
});
