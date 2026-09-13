import { useAppStore } from '../state/app-store.js';

/** Compact, mobile-safe combat feedback for the initial practice encounter. */
export function CombatHud({ onAttack }: { readonly onAttack: (interactableId: string) => void }) {
  const combat = useAppStore((state) => state.economy.combat);
  const player = useAppStore((state) => state.economy.hitpoints);
  if (combat === null) return null;
  const pct = Math.max(0, Math.min(100, (combat.hitpoints / combat.maxHitpoints) * 100));
  return (
    <section className="combat-hud" aria-label={`${combat.label} combat`}>
      <div className="combat-hud__title">
        <span>{combat.label}</span>
        <span>{combat.hitpoints}/{combat.maxHitpoints}</span>
      </div>
      <div className="combat-hud__track"><span style={{ width: `${pct}%` }} /></div>
      <div className="combat-hud__title combat-hud__player">
        <span>You</span><span>{player.current}/{player.max} HP</span>
      </div>
      {combat.defeated ? (
        <p>Defeated · +{combat.coinsGained} coins · Reforming…</p>
      ) : (
        <button type="button" onClick={() => onAttack(combat.interactableId)}>Attack</button>
      )}
    </section>
  );
}
