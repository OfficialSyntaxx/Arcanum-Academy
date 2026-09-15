import type { InteractableId, ZoneId } from '../ids.js';

export interface ClueStep {
  readonly interactableId: InteractableId;
  readonly zoneId: ZoneId;
  readonly title: string;
  readonly hint: string;
  readonly position: { readonly x: number; readonly z: number };
}

export interface ClueProgress {
  readonly startedAtMs: number | null;
  readonly step: number;
  readonly completedAtMs: number | null;
  readonly rewardClaimed: boolean;
}

export const EMPTY_CLUE_PROGRESS: ClueProgress = Object.freeze({
  startedAtMs: null,
  step: 0,
  completedAtMs: null,
  rewardClaimed: false,
});

export const TIDEGLASS_TRAIL = Object.freeze({
  id: 'clue.tideglass_trail',
  title: 'The Tideglass Trail',
  prerequisiteQuestId: 'quest.beneath_the_saltline',
  rewardCoins: 45,
  steps: [
    {
      interactableId: 'int.clue.warden_bearings' as InteractableId,
      zoneId: 'zone.saltwake_ruins' as ZoneId,
      title: "The Warden's Bearings",
      hint: 'Inspect the tide-cut bearings beside the Warden’s vault.',
      position: { x: -5.5, z: 6 },
    },
    {
      interactableId: 'int.clue.library_plinth' as InteractableId,
      zoneId: 'zone.courtyard' as ZoneId,
      title: 'An Echo in Glass',
      hint: 'Follow the bearing home to the Library’s weathered plinth.',
      position: { x: 15.5, z: -17.5 },
    },
    {
      interactableId: 'int.clue.resonance_mark' as InteractableId,
      zoneId: 'zone.courtyard' as ZoneId,
      title: 'Where Stone Sings',
      hint: 'Seek a tideglass mark near the entrance to the Resonance Mines.',
      position: { x: -14, z: -14 },
    },
    {
      interactableId: 'int.clue.tidepool_cache' as InteractableId,
      zoneId: 'zone.courtyard' as ZoneId,
      title: 'The Shore Remembers',
      hint: 'The final bearing points to the bank of the Starlit Tide Pool.',
      position: { x: 13, z: -5.5 },
    },
  ] satisfies readonly ClueStep[],
});

export function clueStep(index: number): ClueStep | undefined {
  return TIDEGLASS_TRAIL.steps[index];
}
