import {
  asId,
  ITEM_CATALOG,
  SKILL_TABLE,
  type ItemDefinitionId,
  type SkillId,
} from '@alderfell/shared';
import { useEffect, useState } from 'react';
import { useAppStore } from '../state/app-store.js';

const COMBAT_FOODS = ITEM_CATALOG.items.filter((item) => item.consumable !== undefined);

/** Persistent recovery affordance, separate from a transient active-target HUD. */
export function GravestoneHud({ onReclaim }: { readonly onReclaim: () => void }) {
  const grave = useAppStore((state) => state.economy.grave);
  if (grave === null) return null;
  const itemCount = grave.stacks.reduce((total, stack) => total + stack.quantity, 0);
  return (
    <section className="combat-hud combat-hud--grave" aria-label="Gravestone recovery">
      <strong>
        Gravestone · {itemCount} item{itemCount === 1 ? '' : 's'} held
      </strong>
      <p>Follow the amber marker back to where you fell, then recover your items.</p>
      <button type="button" onClick={onReclaim}>
        Recover gravestone
      </button>
    </section>
  );
}

/** Compact, mobile-safe combat feedback for the initial practice encounter. */
export function CombatHud({
  onAttack,
  onRecover,
  onEat,
}: {
  readonly onAttack: (
    interactableId: string,
    style?: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE',
  ) => void;
  readonly onRecover: () => void;
  readonly onEat: (interactableId: string, itemId: string) => void;
}) {
  const combat = useAppStore((state) => state.economy.combat);
  const player = useAppStore((state) => state.economy.hitpoints);
  const stacks = useAppStore((state) => state.economy.stacks);
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
  const foods = COMBAT_FOODS.flatMap((item) => {
    const quantity = stacks
      .filter((stack) => stack.definitionId === item.id)
      .reduce((total, stack) => total + stack.quantity, 0);
    return quantity > 0 && item.consumable !== undefined
      ? [{ id: item.id, label: item.name, healAmount: item.consumable.healAmount, quantity }]
      : [];
  });
  const strikeMessage = combat.rolledHit
    ? `You hit for ${combat.damage}.`
    : `Your swing glanced, but the starter strike still deals ${combat.damage}.`;
  const styleSkillName =
    combat.styleSkillId === undefined
      ? 'Combat'
      : (SKILL_TABLE.get(asId<SkillId>(combat.styleSkillId))?.name ?? 'Combat');
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
      {combat.bossPhase !== undefined && (
        <p className="combat-hud__phase">
          Warden phase {combat.bossPhase} ·{' '}
          {combat.bossPhase === 1
            ? 'The tideglass shell is holding.'
            : 'Undertow empowered—Defensive style reduces the pressure.'}
        </p>
      )}
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
              ? 'Accurate +ACC'
              : option === 'AGGRESSIVE'
                ? 'Aggressive +DMG'
                : 'Defensive -DMG'}
          </button>
        ))}
      </div>
      <p className="combat-hud__training">
        Training:{' '}
        {style === 'ACCURATE' ? 'Attack' : style === 'AGGRESSIVE' ? 'Strength' : 'Defence'}
        {' + Hitpoints'}
      </p>
      <p className="combat-hud__log" aria-live="polite">
        {combat.foodConsumed !== undefined
          ? `You eat ${ITEM_CATALOG.get(asId<ItemDefinitionId>(combat.foodConsumed.itemId))?.name ?? 'food'} and restore ${combat.foodConsumed.healAmount} HP.`
          : combat.defeated
            ? `The ${combat.label} is defeated.`
            : `${strikeMessage}${combat.enemyDamage > 0 ? ` The ${combat.label} hits you for ${combat.enemyDamage}.` : ''}`}
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
                `${drop.quantity} ${ITEM_CATALOG.get(asId<ItemDefinitionId>(drop.itemId))?.name ?? drop.itemId}`,
            )
            .join(', ')}{' '}
          · +{combat.combatXpGained} {styleSkillName} XP
          {combat.hitpointsXpGained !== undefined && combat.hitpointsXpGained > 0
            ? ` · +${combat.hitpointsXpGained} Hitpoints XP`
            : ''}{' '}
          · Reforming…
        </p>
      ) : (
        <div className="combat-hud__actions">
          <button
            type="button"
            disabled={attackReadyInMs > 0}
            onClick={() => onAttack(combat.interactableId, style)}
          >
            {attackReadyInMs > 0 ? `Ready in ${Math.ceil(attackReadyInMs / 1_000)}s` : 'Attack'}
          </button>
          {foods.map((food) => (
            <button
              key={food.id}
              type="button"
              onClick={() => onEat(combat.interactableId, food.id)}
            >
              Eat {food.label} +{food.healAmount} HP ({food.quantity})
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Persistent, server-confirmed room objective card for the first dungeon. */
export function DungeonHud() {
  const zoneId = useAppStore((state) => state.currentZoneId);
  const progress = useAppStore((state) => state.economy.saltwake);
  const combat = useAppStore((state) => state.economy.combat);
  if (zoneId !== 'zone.saltwake_ruins' || combat !== null) return null;
  const objective = !progress.galleryCleared
    ? 'Clear the Drowned Sentinel from the Broken Gallery.'
    : !progress.bossDefeated
      ? 'The Warden’s Vault is open. Challenge the Drowned Warden.'
      : !progress.chestClaimed
        ? 'Open the Tideglass Reliquary in the vault.'
        : 'The Tideglass Charm is yours. Return to Archivist Onn.';
  return (
    <section className="dungeon-hud" aria-label="Saltwake Ruins progress">
      <p className="panel__eyebrow">The Saltwake Ruins</p>
      <strong>{objective}</strong>
      <span>
        {progress.chestClaimed
          ? 'Library shortcut restored'
          : 'First-clear reward: Tideglass Charm'}
      </span>
    </section>
  );
}
