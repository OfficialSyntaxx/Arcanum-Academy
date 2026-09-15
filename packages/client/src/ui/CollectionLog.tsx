import {
  DIARY_CATALOG,
  DISCOVERY_CATALOG,
  DiscoveryCategory,
  diaryIsComplete,
} from '@alderfell/shared';
import { useAppStore } from '../state/app-store.js';

const headings: Readonly<Record<DiscoveryCategory, string>> = {
  [DiscoveryCategory.Gathering]: 'Gathering',
  [DiscoveryCategory.Crafting]: 'Crafting',
  [DiscoveryCategory.Combat]: 'Combat',
  [DiscoveryCategory.Recovery]: 'Recovery',
};

/** Read-only ledger of milestones the server has already confirmed. */
export function CollectionLog({ onClose }: { readonly onClose: () => void }) {
  const discoveries = useAppStore((state) => state.economy.discoveries);
  const rewards = useAppStore((state) => state.economy.diaryRewards);
  const complete = DISCOVERY_CATALOG.filter((entry) => discoveries[entry.id] !== undefined).length;
  return (
    <section
      className="panel quest-journal collection-log"
      role="dialog"
      aria-modal="true"
      aria-label="Collection log"
    >
      <header className="quest-journal__head">
        <div>
          <p className="panel__eyebrow">Shorelands discoveries</p>
          <h2>Collection log</h2>
        </div>
        <button
          type="button"
          className="panel__close"
          onClick={onClose}
          aria-label="Close collection log"
        >
          ×
        </button>
      </header>
      <p className="quest-journal__intro">
        {complete}/{DISCOVERY_CATALOG.length} discoveries recorded. Progress is saved when the world
        confirms the action.
      </p>
      <section className="collection-log__group" aria-label="Shorelands diaries">
        <h3>Shorelands diaries</h3>
        <ul className="quest-journal__list">
          {DIARY_CATALOG.map((diary) => {
            const completed = diaryIsComplete(diary, discoveries);
            const done = diary.requiredDiscoveryIds.filter(
              (id) => discoveries[id] !== undefined,
            ).length;
            return (
              <li key={diary.id} data-status={completed ? 'completed' : 'active'}>
                <div className="quest-journal__row">
                  <strong>{diary.title}</strong>
                  <span>
                    {completed ? 'Complete' : `${done}/${diary.requiredDiscoveryIds.length}`}
                  </span>
                </div>
                <p>{diary.description}</p>
                <p>
                  {rewards[diary.id]
                    ? `Reward paid · ${diary.rewardCoins} coins`
                    : `Reward · ${diary.rewardCoins} coins`}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
      {(Object.values(DiscoveryCategory) as DiscoveryCategory[]).map((category) => {
        const entries = DISCOVERY_CATALOG.filter((entry) => entry.category === category);
        return (
          <section key={category} className="collection-log__group" aria-label={headings[category]}>
            <h3>{headings[category]}</h3>
            <ul className="quest-journal__list">
              {entries.map((entry) => {
                const unlocked = discoveries[entry.id] !== undefined;
                return (
                  <li key={entry.id} data-status={unlocked ? 'completed' : 'locked'}>
                    <div className="quest-journal__row">
                      <strong>{unlocked ? entry.title : 'Unknown discovery'}</strong>
                      <span>{unlocked ? 'Found' : 'Hidden'}</span>
                    </div>
                    <p>{unlocked ? entry.description : 'Keep exploring Shorelands.'}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
