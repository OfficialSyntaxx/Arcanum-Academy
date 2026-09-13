import { QUEST_CATALOG, QuestStatus, questIsUnlocked, type ItemDefinitionId } from '@alderfell/shared';
import { useAppStore } from '../state/app-store.js';

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
  const quest =
    QUEST_CATALOG.find((candidate) => economy.quests[candidate.id]?.status === QuestStatus.Active) ??
    QUEST_CATALOG.find(
      (candidate) =>
        economy.quests[candidate.id] === undefined && questIsUnlocked(candidate, economy.quests),
    ) ??
    QUEST_CATALOG.at(-1)!;
  const progress = economy.quests[quest.id];
  const accepted = progress?.status === QuestStatus.Active;
  const completed = progress?.status === QuestStatus.Completed;
  const objectives = quest.objectives.map((objective) => {
    const count = economy.stacks
      .filter((stack) => objective.itemIds.includes(stack.definitionId as ItemDefinitionId))
      .reduce((total, stack) => total + stack.quantity, 0);
    return { ...objective, count, complete: count >= objective.requiredQuantity };
  });
  const ready = objectives.every((objective) => objective.complete);

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
          <h2>{quest.title}</h2>
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
        {quest.description}
      </p>
      {objectives.map((objective) => (
        <div className="notice-board__objective" data-complete={completed || (accepted && objective.complete)} key={objective.label}>
          <span>{completed || (accepted && objective.complete) ? '✓' : '○'}</span>
          <span>{objective.label}</span>
          <strong>{completed ? 'Complete' : `${Math.min(objective.count, objective.requiredQuantity)}/${objective.requiredQuantity}`}</strong>
        </div>
      ))}
      <p className="notice-board__hint">{quest.hint}</p>
      {!accepted && !completed && (
        <button
          type="button"
          className="prompt__button notice-board__close"
          onClick={() => onAccept(quest.id)}
        >
          Accept quest
        </button>
      )}
      {accepted && ready && (
        <button
          type="button"
          className="prompt__button notice-board__close"
          onClick={() => onComplete(quest.id)}
        >
          Turn in · {quest.rewardCoins} coins
        </button>
      )}
      {(accepted && !ready) || completed ? (
        <button type="button" className="prompt__button notice-board__close" onClick={onClose}>
          {completed ? 'Quest complete' : 'Continue exploring'}
        </button>
      ) : null}
    </section>
  );
}
