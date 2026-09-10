import { useAppStore } from '../state/app-store.js';

/**
 * First content-facing quest surface. Its state intentionally remains local
 * presentation until the server-authoritative quest ledger lands in G5.
 */
export function NoticeBoard({ onClose }: { readonly onClose: () => void }) {
  const economy = useAppStore((state) => state.economy);
  const mushroomCount = economy.stacks
    .filter((stack) => stack.definitionId.startsWith('item.mushroom.'))
    .reduce((total, stack) => total + stack.quantity, 0);
  const hasMushrooms = mushroomCount >= 3;

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
      <div className="notice-board__objective" data-complete={hasMushrooms}>
        <span>{hasMushrooms ? '✓' : '○'}</span>
        <span>Gather 3 Mystic Mushrooms</span>
        <strong>{hasMushrooms ? 'Ready to turn in' : `${mushroomCount}/3`}</strong>
      </div>
      <p className="notice-board__hint">
        Find the patch in the Alchemy Gardens, west of the plaza. Quest turn-in and durable quest
        progress arrive with the server quest ledger.
      </p>
      <button type="button" className="prompt__button notice-board__close" onClick={onClose}>
        Continue exploring
      </button>
    </section>
  );
}
