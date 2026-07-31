import { useAppStore } from '../state/app-store.js';

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
export function InteractionPrompt({ onEngage }: { onEngage: () => void }) {
  const prompt = useAppStore((state) => state.interactionPrompt);
  if (prompt === null) return null;

  return (
    <div className="prompt">
      <span className="prompt__label">{prompt.label}</span>
      <button type="button" className="prompt__button" onClick={onEngage} data-kind={prompt.kind}>
        {prompt.verb}
      </button>
    </div>
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

  return (
    <div className="hub-hud">
      <span className="hub-hud__zone">Courtyard of the Arcanum</span>
      <span className="hub-hud__clock">
        <time>{formatClock(worldMinute)}</time> · {periodOf(worldMinute)}
      </span>
      <span className="hub-hud__population">{population} present</span>
    </div>
  );
}
