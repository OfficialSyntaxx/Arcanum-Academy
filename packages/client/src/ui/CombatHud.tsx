import { useEffect, useState } from 'react';
import { useAppStore } from '../state/app-store.js';

/** Compact, mobile-safe combat feedback for the initial practice encounter. */
export function CombatHud({
  onAttack,
  onRecover,
}: {
  readonly onAttack: (interactableId: string, style?: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE') => void;
  readonly onRecover: () => void;
}) {
  const combat = useAppStore((state) => state.economy.combat);
  const player = useAppStore((state) => state.economy.hitpoints);
  const [now, setNow] = useState(Date.now());
  const [style, setStyle] = useState<'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE'>('ACCURATE');
  useEffect(() => {
    if (player.respawnAtMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [player.respawnAtMs]);
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
      <div className="combat-hud__styles" aria-label="Combat style">{(['ACCURATE', 'AGGRESSIVE', 'DEFENSIVE'] as const).map((option) => (<button key={option} type="button" aria-pressed={style === option} onClick={() => setStyle(option)}>{option === 'ACCURATE' ? 'Accurate +XP' : option === 'AGGRESSIVE' ? 'Aggressive +DMG' : 'Defensive -DMG'}</button>))}</div>
      {player.current === 0 ? (
        player.respawnAtMs !== null && now < player.respawnAtMs ? (
          <p>Recovering… {Math.ceil((player.respawnAtMs - now) / 1_000)}s</p>
        ) : (
          <button type="button" onClick={onRecover}>Recover</button>
        )
      ) : combat.defeated ? (
        <p>Defeated · +{combat.coinsGained} coins · +{combat.combatXpGained} Combat XP · Reforming…</p>
      ) : (
        <button type="button" onClick={() => onAttack(combat.interactableId, style)}>Attack</button>
      )}
    </section>
  );
}
