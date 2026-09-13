import { useEffect, useState } from 'react';
import { useAppStore } from '../state/app-store.js';

/** Compact, mobile-safe combat feedback for the initial practice encounter. */
export function CombatHud({
  onAttack,
  onRecover,
}: {
  readonly onAttack: (
    interactableId: string,
    style?: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE',
  ) => void;
  readonly onRecover: () => void;
}) {
  const combat = useAppStore((state) => state.economy.combat);
  const player = useAppStore((state) => state.economy.hitpoints);
  const [now, setNow] = useState(Date.now());
  const [style, setStyle] = useState<'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE'>('ACCURATE');
  useEffect(() => {
    if (player.respawnAtMs === null && combat?.nextAttackAtMs === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [player.respawnAtMs, combat?.nextAttackAtMs]);
  if (combat === null) return null;
  const pct = Math.max(0, Math.min(100, (combat.hitpoints / combat.maxHitpoints) * 100));
  const attackReadyInMs = Math.max(0, combat.nextAttackAtMs - now);
  const strikeMessage = combat.rolledHit
    ? `You hit for ${combat.damage}.`
    : `Your swing glanced, but the starter strike still deals ${combat.damage}.`;
  return (
    <section className="combat-hud" aria-label={`${combat.label} combat`}>
      <div className="combat-hud__title">
        <span>{combat.label}</span>
        <span>
          {combat.hitpoints}/{combat.maxHitpoints}
        </span>
      </div>
      <div className="combat-hud__track">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="combat-hud__title combat-hud__player">
        <span>You</span>
        <span>
          {player.current}/{player.max} HP
        </span>
      </div>
      <div className="combat-hud__styles" aria-label="Combat style">
        {(['ACCURATE', 'AGGRESSIVE', 'DEFENSIVE'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={style === option}
            onClick={() => setStyle(option)}
          >
            {option === 'ACCURATE'
              ? 'Accurate +XP'
              : option === 'AGGRESSIVE'
                ? 'Aggressive +DMG'
                : 'Defensive -DMG'}
          </button>
        ))}
      </div>
      <p className="combat-hud__log" aria-live="polite">
        {combat.defeated
          ? 'The Shore Wolf is defeated.'
          : `${strikeMessage}${combat.enemyDamage > 0 ? ` The Shore Wolf hits you for ${combat.enemyDamage}.` : ''}`}
      </p>
      {player.current === 0 ? (
        player.respawnAtMs !== null && now < player.respawnAtMs ? (
          <p>Recovering… {Math.ceil((player.respawnAtMs - now) / 1_000)}s</p>
        ) : (
          <button type="button" onClick={onRecover}>
            Recover
          </button>
        )
      ) : combat.defeated ? (
        <p>
          Defeated · +{combat.coinsGained} coins ·{' '}
          {combat.drops
            .map(
              (drop) =>
                `${drop.quantity} ${drop.itemId === 'item.meat.raw_shore_wolf' ? 'Raw Shore Wolf Meat' : drop.itemId}`,
            )
            .join(', ')}{' '}
          · +{combat.combatXpGained} Combat XP · Reforming…
        </p>
      ) : (
        <button
          type="button"
          disabled={attackReadyInMs > 0}
          onClick={() => onAttack(combat.interactableId, style)}
        >
          {attackReadyInMs > 0 ? `Ready in ${Math.ceil(attackReadyInMs / 1_000)}s` : 'Attack'}
        </button>
      )}
    </section>
  );
}
