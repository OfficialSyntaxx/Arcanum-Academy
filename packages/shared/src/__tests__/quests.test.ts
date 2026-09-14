import { describe, expect, it } from 'vitest';
import {
  asId,
  QUEST_CATALOG,
  QuestStatus,
  questById,
  questIsUnlocked,
  recordEncounterDefeat,
  type InteractableId,
} from '../index.js';

describe('resource quest catalog', () => {
  it('keeps the archive quest locked until The First Hunt is complete', () => {
    const followUp = questById('quest.embers_for_the_archive');
    expect(followUp).toBeDefined();
    expect(questIsUnlocked(followUp!, {})).toBe(false);
    expect(
      questIsUnlocked(followUp!, {
        'quest.first_hunt': {
          status: QuestStatus.Completed,
          acceptedAtMs: 1,
          completedAtMs: 2,
          objectiveCounts: {},
        },
      }),
    ).toBe(true);
  });

  it('records only active matching encounter defeats for The First Hunt', () => {
    const progress = recordEncounterDefeat(
      {
        'quest.first_hunt': {
          status: QuestStatus.Active,
          acceptedAtMs: 1,
          completedAtMs: null,
          objectiveCounts: {},
        },
      },
      asId<InteractableId>('int.combat.shore_wolf'),
    );
    expect(progress['quest.first_hunt']?.objectiveCounts).toEqual({ 'hunt.shore_wolves': 1 });
  });

  it('has positive rewards and objectives for every shipped quest', () => {
    for (const quest of QUEST_CATALOG) {
      expect(quest.rewardCoins).toBeGreaterThan(0);
      expect(quest.objectives.length).toBeGreaterThan(0);
      for (const objective of quest.objectives) {
        if (objective.kind === 'ITEM') expect(objective.itemIds.length).toBeGreaterThan(0);
        else expect(objective.encounterIds.length).toBeGreaterThan(0);
        expect(objective.requiredQuantity).toBeGreaterThan(0);
      }
    }
  });
});
