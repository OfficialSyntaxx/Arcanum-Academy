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

  it('unlocks A Clear Copy only after the Archive work is complete', () => {
    const sideQuest = questById('quest.clear_copy');
    expect(sideQuest).toMatchObject({
      title: 'A Clear Copy',
      rewardCoins: 35,
      prerequisites: ['quest.embers_for_the_archive'],
    });
    expect(questIsUnlocked(sideQuest!, {})).toBe(false);
    expect(
      questIsUnlocked(sideQuest!, {
        'quest.embers_for_the_archive': {
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

  it('unlocks the Saltwake expedition after A Clear Copy and preserves its proof item', () => {
    const quest = questById('quest.beneath_the_saltline');
    expect(quest).toMatchObject({ rewardCoins: 100, prerequisites: ['quest.clear_copy'] });
    expect(
      questIsUnlocked(quest!, {
        'quest.clear_copy': {
          status: QuestStatus.Completed,
          acceptedAtMs: 1,
          completedAtMs: 2,
          objectiveCounts: {},
        },
      }),
    ).toBe(true);
    expect(
      quest?.objectives.find((objective) => objective.id === 'saltline.tideglass'),
    ).toMatchObject({
      kind: 'ITEM',
      consume: false,
    });
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
