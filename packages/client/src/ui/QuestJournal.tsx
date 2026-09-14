import {
  QUEST_CATALOG,
  QuestStatus,
  questIsUnlocked,
  type ItemDefinitionId,
} from '@alderfell/shared';

import { useAppStore } from '../state/app-store.js';

/** Read-only view of the authored quest chain and server-confirmed progress. */
export function QuestJournal({ onClose }: { onClose: () => void }) {
  const economy = useAppStore((state) => state.economy);
  return (
    <section
      className="panel quest-journal"
      role="dialog"
      aria-modal="true"
      aria-label="Journey log"
    >
      <header className="quest-journal__head">
        <div>
          <p className="panel__eyebrow">Shorelands journey</p>
          <h2>Quest journal</h2>
        </div>
        <button type="button" className="panel__close" onClick={onClose} aria-label="Close journal">
          ×
        </button>
      </header>
      <p className="quest-journal__intro">
        Progress is recorded when the world confirms your work. Visit the Library notice board to
        accept or turn in a quest.
      </p>
      <ol className="quest-journal__list">
        {QUEST_CATALOG.map((quest) => {
          const progress = economy.quests[quest.id];
          const status = progress?.status;
          const unlocked = questIsUnlocked(quest, economy.quests);
          return (
            <li
              key={quest.id}
              data-status={
                status === QuestStatus.Completed
                  ? 'completed'
                  : status === QuestStatus.Active
                    ? 'active'
                    : unlocked
                      ? 'available'
                      : 'locked'
              }
            >
              <div className="quest-journal__row">
                <strong>{quest.title}</strong>
                <span>
                  {status === QuestStatus.Completed
                    ? 'Complete'
                    : status === QuestStatus.Active
                      ? 'Active'
                      : unlocked
                        ? 'Available'
                        : 'Locked'}
                </span>
              </div>
              {(status === QuestStatus.Active || status === QuestStatus.Completed) && (
                <ul>
                  {quest.objectives.map((objective) => {
                    const count =
                      objective.kind === 'ITEM'
                        ? economy.stacks
                            .filter((stack) =>
                              objective.itemIds.includes(stack.definitionId as ItemDefinitionId),
                            )
                            .reduce((total, stack) => total + stack.quantity, 0)
                        : (progress?.objectiveCounts[objective.id] ?? 0);
                    const complete =
                      status === QuestStatus.Completed || count >= objective.requiredQuantity;
                    return (
                      <li key={objective.id} data-complete={complete}>
                        <span>{complete ? '✓' : '○'}</span> {objective.label}
                        <strong>
                          {complete ? 'Complete' : `${count}/${objective.requiredQuantity}`}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              )}
              {status !== QuestStatus.Completed && (
                <p>{unlocked ? quest.hint : 'Finish the prior journal entry to unlock this.'}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
