import { describe, expect, it } from 'vitest';
import { QuestStatus, type QuestProgress } from '@alderfell/shared';

import { questDialogueForNpc } from '../npc/quest-dialogue.js';

const quest = (status: QuestStatus): QuestProgress => ({
  status,
  acceptedAtMs: 0,
  completedAtMs: status === QuestStatus.Completed ? 1 : null,
  objectiveCounts: {},
});

describe('quest-aware NPC dialogue', () => {
  it('guides a new player to the notice board without changing quest state', () => {
    expect(questDialogueForNpc('npc.bram', {}, 'Fallback')).toContain('Library notice board');
    expect(questDialogueForNpc('npc.onn', {}, 'Fallback')).toContain('notice board');
  });

  it('guides active quest steps through the relevant named NPCs', () => {
    expect(
      questDialogueForNpc(
        'npc.bram',
        { 'quest.first_kindling': quest(QuestStatus.Active) },
        'Fallback',
      ),
    ).toContain('Mystic Mushroom');
    expect(
      questDialogueForNpc(
        'npc.dun',
        {
          'quest.first_kindling': quest(QuestStatus.Completed),
          'quest.first_hunt': quest(QuestStatus.Active),
        },
        'Fallback',
      ),
    ).toContain('Two Shore Wolves');
  });

  it('preserves authored barks where no quest response applies', () => {
    expect(questDialogueForNpc('npc.vell', {}, 'Resin, sleeves.')).toBe('Resin, sleeves.');
  });
});
