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
    case 'npc.vosk':
      if (active(quests, 'quest.beneath_the_saltline')) {
        return 'Onn has the restored survey. Its last mark descends beneath the Library shore—take food before you follow it.';
      }
      if (active(quests, 'quest.clear_copy')) {
        return 'Azure Ink needs Pale Caps, ground Crystal Shards, and a patient hand at the Scribing Hall. The old coast cannot wait.';
      }
      if (
        complete(quests, 'quest.embers_for_the_archive') &&
        !complete(quests, 'quest.clear_copy')
      ) {
        return 'The notice board has a survey-copying job. A clear Azure Ink is worth more than a quick one.';
      }
      return fallback;
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
      if (active(quests, 'quest.beneath_the_saltline')) {
        return 'The Saltwake descent is beside the Library shore. Clear the gallery before you face its Warden, then bring the Tideglass Charm back to me.';
      }
      if (complete(quests, 'quest.clear_copy') && !complete(quests, 'quest.beneath_the_saltline')) {
        return 'Vosk’s clear copy revealed a drowned stair. The notice board carries the expedition charter.';
      }
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
    case 'npc.brix':
      if (active(quests, 'quest.heart_of_cinderhollow'))
        return 'The descent is east of this camp. Mine the black vein, unbind its wisp, then take that cooled Sigil from Cinderheart.';
      if (
        complete(quests, 'quest.the_foothill_forge') &&
        !complete(quests, 'quest.heart_of_cinderhollow')
      )
        return 'The forge is breathing again. Read the board before you follow that heat beneath the ridge.';
      if (complete(quests, 'quest.heart_of_cinderhollow'))
        return 'The Cinderhollow map now marks the Ore Rim, Crucible Chamber, and Ashen Rise. The last path climbs to the Overlook.';
      return fallback;
    case 'npc.wynn':
      if (active(quests, 'quest.the_long_winter')) {
        return 'The Frostgate map has marked the workshop and the shelf beyond the Spire. Take the survey route before the weather closes it.';
      }
      return 'Beyond the Spire clearing, the Aurora Shelf gives a clear view of every trail through the reach. It is marked on your local map.';
    default:
      return fallback;
  }
}
