import { useAppStore } from '../state/app-store.js';

/** Short, mobile-friendly dialogue surfaced by a nearby named NPC. */
export function NpcDialogue({ onClose }: { readonly onClose: () => void }) {
  const dialogue = useAppStore((state) => state.openDialogue);
  if (dialogue === null) return null;
  return (
    <section className="panel npc-dialogue" role="dialog" aria-modal="true" aria-label={`Talk to ${dialogue.name}`}>
      <header className="notice-board__head">
        <div>
          <p className="panel__eyebrow">{dialogue.role.toLowerCase()}</p>
          <h2>{dialogue.name}</h2>
        </div>
        <button type="button" className="panel__close" onClick={onClose} aria-label="Close dialogue">
          ×
        </button>
      </header>
      <p className="npc-dialogue__line">“{dialogue.line}”</p>
      <button type="button" className="prompt__button notice-board__close" onClick={onClose}>
        Continue
      </button>
    </section>
  );
}
