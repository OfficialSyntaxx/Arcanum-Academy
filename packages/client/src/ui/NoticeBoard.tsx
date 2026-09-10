import { QuestStatus } from '@alderfell/shared';
import { useAppStore } from '../state/app-store.js';

const FIRST_KINDLING_QUEST_ID = 'quest.first_kindling';

/**
 * First content-facing quest surface. Progress comes only from the server.
 */
export function NoticeBoard({
  onClose,
  onAccept,
  onComplete,
}: {
  readonly onClose: () => void;
  readonly onAccept: (questId: string) => void;
  readonly onComplete: (questId: string) => void;
}) {
  const economy = useAppStore((state) => state.economy);
  const mushroomCount = economy.stacks
    .filter((stack) => stack.definitionId.startsWith('item.mushroom.'))
    .reduce((total, stack) => total + stack.quantity, 0);
  const hasMushrooms = mushroomCount >= 3;
  const progress = economy.quests[FIRST_KINDLING_QUEST_ID];
  const accepted = progress?.status === QuestStatus.Active;
  const completed = progress?.status === QuestStatus.Completed;

  return (
    <section
      className="panel notice-board"
      role="dialog"
      aria-modal="true"
      aria-label="Notice board"
    >
      <header className="notice-board__head">
        <div>
          <p className="panel__eyebrow">Library notice board</p>
          <h2>The First Kindling</h2>
        </div>
        <button
          type="button"
          className="panel__close"
          onClick={onClose}
          aria-label="Close notice board"
        >
          ×
        </button>
      </header>
      <p>
        Groundskeeper Bram is tending the garden beds. He needs three Mystic Mushrooms before the
        evening lamps can be lit.
      </p>
      <div
        className="notice-board__objective"
        data-complete={completed || (accepted && hasMushrooms)}
      >
        <span>{completed || (accepted && hasMushrooms) ? '✓' : '○'}</span>
        <span>Gather 3 Mystic Mushrooms</span>
        <strong>
          {completed
            ? 'Complete'
            : accepted && hasMushrooms
              ? 'Ready to turn in'
              : `${mushroomCount}/3`}
        </strong>
      </div>
      <p className="notice-board__hint">
        Find the patch in the Alchemy Gardens, west of the plaza. Bring the mushrooms back here for
        40 coins once the objective is ready.
      </p>
      {!accepted && !completed && (
        <button
          type="button"
          className="prompt__button notice-board__close"
          onClick={() => onAccept(FIRST_KINDLING_QUEST_ID)}
        >
          Accept quest
        </button>
      )}
      {accepted && hasMushrooms && (
        <button
          type="button"
          className="prompt__button notice-board__close"
          onClick={() => onComplete(FIRST_KINDLING_QUEST_ID)}
        >
          Turn in · 40 coins
        </button>
      )}
      {(accepted && !hasMushrooms) || completed ? (
        <button type="button" className="prompt__button notice-board__close" onClick={onClose}>
          {completed ? 'Quest complete' : 'Continue exploring'}
        </button>
      ) : null}
    </section>
  );
}
