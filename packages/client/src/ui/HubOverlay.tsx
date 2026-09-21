import { useAppStore } from '../state/app-store.js';
import {
  QUEST_CATALOG,
  QuestStatus,
  TIDEGLASS_TRAIL,
  questIsUnlocked,
  type ItemDefinitionId,
} from '@alderfell/shared';

/**
 * The single contextual action button.
 *
 * One primary action per screen is the rule the hub is built around: whatever
 * the player is standing next to, the same thumb-reachable button on the right
 * engages it. It sits opposite the stick so both are usable at once, and it is
 * a real `button` so keyboard and switch access work without a second code path.
 *
 * The verb comes from content ("Mine", "Scribe", "Duel") rather than a generic
 * "Interact", because a player glancing at the button should learn what is in
 * front of them without reading the label above it.
 */
export function InteractionPrompt({ onEngage }: { onEngage: (id?: string) => void }) {
  const prompt = useAppStore((state) => state.interactionPrompt);
  if (prompt === null) return null;

  return (
    <div className="prompt">
      <span className="prompt__label">{prompt.label}</span>
      <button
        type="button"
        className="prompt__button"
        onClick={() => onEngage()}
        data-kind={prompt.kind}
      >
        {prompt.verb}
      </button>
      {prompt.alternatives !== undefined && (
        <div className="prompt__alternatives" aria-label="Other nearby actions">
          {prompt.alternatives.map((alternative) => (
            <button
              key={alternative.id}
              type="button"
              className="prompt__alternative"
              onClick={() => onEngage(alternative.id)}
            >
              {alternative.verb}: {alternative.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Server-confirmed guidance for the first ordered treasure trail. */
export function clueProgressLabel(startedAtMs: number | null, step: number): string {
  return startedAtMs === null
    ? 'New treasure trail'
    : `Clue ${step + 1} of ${TIDEGLASS_TRAIL.steps.length}`;
}

export function ClueTracker() {
  const progress = useAppStore((state) => state.economy.tideglassTrail);
  const quests = useAppStore((state) => state.economy.quests);
  const combat = useAppStore((state) => state.economy.combat);
  if (
    quests[TIDEGLASS_TRAIL.prerequisiteQuestId]?.status !== QuestStatus.Completed ||
    combat !== null ||
    progress.rewardClaimed
  )
    return null;
  const step = TIDEGLASS_TRAIL.steps[progress.step];
  if (step === undefined) return null;
  return (
    <aside className="clue-tracker" aria-label="Treasure trail clue">
      <span className="journey-tracker__eyebrow">
        {clueProgressLabel(progress.startedAtMs, progress.step)}
      </span>
      <strong>{TIDEGLASS_TRAIL.title}</strong>
      <p>{step.hint}</p>
      <span>Reward: {TIDEGLASS_TRAIL.rewardCoins}-coin casket</span>
    </aside>
  );
}

const PERIODS = [
  { until: 5 * 60, name: 'Night' },
  { until: 8 * 60, name: 'Dawn' },
  { until: 12 * 60, name: 'Morning' },
  { until: 17 * 60, name: 'Afternoon' },
  { until: 20 * 60, name: 'Evening' },
  { until: 24 * 60, name: 'Night' },
] as const;

function periodOf(minute: number): string {
  return PERIODS.find((period) => minute < period.until)?.name ?? 'Night';
}

function formatClock(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Zone name, in-world time and how busy the courtyard is. */
export function HubHud() {
  const worldMinute = useAppStore((state) => state.worldMinute);
  const population = useAppStore((state) => state.ambientPopulation);
  const zoneName = useAppStore((state) => state.currentZoneName);

  return (
    <div className="hub-hud">
      <span className="hub-hud__zone">
        {zoneName === 'Courtyard of the Arcanum' ? 'The Shorelands' : zoneName}
      </span>
      <span className="hub-hud__clock">
        <time>{formatClock(worldMinute)}</time> · {periodOf(worldMinute)}
      </span>
      <span className="hub-hud__population">{population} present</span>
    </div>
  );
}

/**
 * The notice board remains the place where quests are accepted and turned in.
 * This compact card only answers the phone-first question players ask after
 * closing it: "what should I do next?" It never calculates progression locally.
 */
export function JourneyTracker({ onOpenJournal }: { onOpenJournal: () => void }) {
  const economy = useAppStore((state) => state.economy);
  const inCombat = economy.combat !== null && !economy.combat.defeated;
  const quest =
    QUEST_CATALOG.find(
      (candidate) => economy.quests[candidate.id]?.status === QuestStatus.Active,
    ) ??
    QUEST_CATALOG.find(
      (candidate) =>
        economy.quests[candidate.id] === undefined && questIsUnlocked(candidate, economy.quests),
    );
  if (inCombat || quest === undefined) return null;

  const progress = economy.quests[quest.id];
  const accepted = progress?.status === QuestStatus.Active;
  const objective = quest.objectives.find((candidate) => {
    const count =
      candidate.kind === 'ITEM'
        ? economy.stacks
            .filter((stack) => candidate.itemIds.includes(stack.definitionId as ItemDefinitionId))
            .reduce((total, stack) => total + stack.quantity, 0)
        : (progress?.objectiveCounts[candidate.id] ?? 0);
    return count < candidate.requiredQuantity;
  });
  const nextStep = accepted
    ? (objective?.label ?? 'Return to the notice board to turn in your work.')
    : `Visit the Library notice board to begin ${quest.title}.`;
  const eyebrow = accepted
    ? objective === undefined
      ? 'Journey'
      : `Journey · ${objective.location}`
    : 'Next';

  // One line, not a card: the world is what should fill the phone. Tapping
  // it opens the journal for the full objective list.
  return (
    <button
      type="button"
      className="journey-tracker"
      onClick={onOpenJournal}
      aria-label="Open the quest journal"
    >
      <span className="journey-tracker__eyebrow">{eyebrow}</span>
      <strong>{quest.title}</strong>
      <p>{nextStep}</p>
    </button>
  );
}
