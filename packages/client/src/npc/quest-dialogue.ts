/** Quest-aware flavour lines for named NPCs. Presentation only; no quest mutation lives here. */

import { QuestStatus, type QuestProgress } from '@alderfell/shared';

type QuestRecord = Readonly<Record<string, QuestProgress>>;

const active = (quests: QuestRecord, id: string) => quests[id]?.status === QuestStatus.Active;
const complete = (quests: QuestRecord, id: string) => quests[id]?.status === QuestStatus.Completed;

/**
 * Returns a short contextual line when this named NPC can help with the first
 * journey. The caller owns deterministic bark rotation as the neutral fallback.
 */
export function questDialogueForNpc(npcId: string, quests: QuestRecord, fallback: string): string {
  switch (npcId) {
    case 'npc.bram':
      if (active(quests, 'quest.first_kindling')) {
        return 'The Mystic Mushroom patch is west in the Alchemy Gardens. Bring three to the Library board.';
      }
      if (!complete(quests, 'quest.first_kindling')) {
        return 'Looking for honest work? The Library notice board has a first task, and the garden has what it needs.';
      }
      if (active(quests, 'quest.first_hunt')) {
        return 'The terrace campfire will cook a Shore Wolf meal once you have earned the meat.';
      }
      return fallback;
    case 'npc.dun':
      if (active(quests, 'quest.first_hunt')) {
        return 'Two Shore Wolves on the Duelling Terrace, then one cooked meal at the campfire. Keep your footing.';
      }
      if (complete(quests, 'quest.first_kindling') && !complete(quests, 'quest.first_hunt')) {
        return 'The notice board has a hunt ready. The Shore Wolves are just beyond this terrace entrance.';
      }
      return fallback;
    case 'npc.onn':
      if (active(quests, 'quest.embers_for_the_archive')) {
        return 'The Archive needs Emberwood Branches from the east stand and Crystal Shards from the northwest seam.';
      }
      if (
        complete(quests, 'quest.first_hunt') &&
        !complete(quests, 'quest.embers_for_the_archive')
      ) {
        return 'You have proved yourself. Read the board again; there is Archive work waiting for steady hands.';
      }
      if (!complete(quests, 'quest.first_kindling')) {
        return 'The notice board is in these stacks. Start there when you are ready to make your mark.';
      }
      return fallback;
    default:
      return fallback;
  }
}
