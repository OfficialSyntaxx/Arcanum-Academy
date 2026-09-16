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

const STYLE_LABEL = {
  ACCURATE: 'Accurate',
  AGGRESSIVE: 'Aggressive',
  DEFENSIVE: 'Defensive',
  RANGED: 'Ranged',
  MAGIC: 'Magic',
} as const;

/**
 * The fight card: a slim strip at the bottom edge, not a panel over the fight.
 *
 * There is no attack button. Blows trade themselves on the tick once a
 * creature is engaged, exactly as in OSRS; the card only shows the two health
 * pools, lets the player switch stance or eat, and offers recovery after a fall.
 */
export function CombatHud({
  onRecover,
  onEat,
}: {
  readonly onRecover: () => void;
  readonly onEat: (interactableId: string, itemId: string) => void;
}) {
  const combat = useAppStore((state) => state.economy.combat);
  const player = useAppStore((state) => state.economy.hitpoints);
  const stacks = useAppStore((state) => state.economy.stacks);
  const style = useAppStore((state) => state.combatStyle);
  const setStyle = useAppStore((state) => state.setCombatStyle);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (player.respawnAtMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [player.respawnAtMs]);
  if (combat === null) return null;
  const pct = Math.max(0, Math.min(100, (combat.hitpoints / combat.maxHitpoints) * 100));
  const playerPct = Math.max(0, Math.min(100, (player.current / Math.max(1, player.max)) * 100));
  const foods = COMBAT_FOODS.flatMap((item) => {
    const quantity = stacks
      .filter((stack) => stack.definitionId === item.id)
      .reduce((total, stack) => total + stack.quantity, 0);
    return quantity > 0 && item.consumable !== undefined
      ? [{ id: item.id, label: item.name, healAmount: item.consumable.healAmount, quantity }]
      : [];
  });
  const styleSkillName =
    combat.styleSkillId === undefined
      ? 'Combat'
      : (SKILL_TABLE.get(asId<SkillId>(combat.styleSkillId))?.name ?? 'Combat');
  const fallen = player.current === 0;

  return (
    <section className="combat-hud" aria-label={`${combat.label} combat`}>
      <div className="combat-hud__pools">
        <div className="combat-hud__pool">
          <div className="combat-hud__title">
            <span>{combat.label}</span>
            <span>
              {combat.hitpoints}/{combat.maxHitpoints}
            </span>
          </div>
          <div className="combat-hud__track">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="combat-hud__pool">
          <div className="combat-hud__title">
            <span>You</span>
            <span>
              {player.current}/{player.max}
            </span>
          </div>
          <div className="combat-hud__track combat-hud__track--player">
            <span style={{ width: `${playerPct}%` }} />
          </div>
        </div>
      </div>
      {combat.bossPhase !== undefined && (
        <p className="combat-hud__phase">
          Warden phase {combat.bossPhase} ·{' '}
          {combat.bossPhase === 1
            ? 'The tideglass shell is holding.'
            : 'Undertow empowered—Defensive stance blunts it.'}
        </p>
      )}
      {fallen ? (
        player.respawnAtMs !== null && now < player.respawnAtMs ? (
          <p>Recovering… {Math.ceil((player.respawnAtMs - now) / 1_000)}s</p>
        ) : (
          <button type="button" onClick={onRecover}>
            Recover
          </button>
        )
      ) : combat.defeated ? (
        <p className="combat-hud__log" aria-live="polite">
          {combat.label} defeated · +{combat.coinsGained} coins ·{' '}
          {combat.drops
            .map(
              (drop) =>
                `${drop.quantity} ${ITEM_CATALOG.get(asId<ItemDefinitionId>(drop.itemId))?.name ?? drop.itemId}`,
            )
            .join(', ')}{' '}
          · +{combat.combatXpGained} {styleSkillName} XP
          {combat.hitpointsXpGained !== undefined && combat.hitpointsXpGained > 0
            ? ` · +${combat.hitpointsXpGained} Hitpoints XP`
            : ''}
        </p>
      ) : (
        <div className="combat-hud__actions">
          <div className="combat-hud__styles" role="radiogroup" aria-label="Attack stance">
            {(['ACCURATE', 'AGGRESSIVE', 'DEFENSIVE', 'RANGED', 'MAGIC'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={style === option}
                onClick={() => setStyle(option)}
              >
                {STYLE_LABEL[option]}
              </button>
            ))}
          </div>
          {foods.map((food) => (
            <button
              key={food.id}
              type="button"
              className="combat-hud__eat"
              onClick={() => onEat(combat.interactableId, food.id)}
            >
              Eat {food.label} +{food.healAmount} ({food.quantity})
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
