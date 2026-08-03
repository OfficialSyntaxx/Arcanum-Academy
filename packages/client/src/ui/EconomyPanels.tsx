import { ITEM_CATALOG, NODE_CATALOG, SKILL_TABLE } from '@arcanum/shared';
import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from './LabelStrip.js';

/**
 * Economy overlays: the bag, the active harvest, and refusals.
 *
 * Item names are resolved from the shipped catalog rather than sent with every
 * patch. Content is identical on both sides and changes only with a deploy, so
 * transmitting names would be paying for the same strings on every collection.
 */

function itemName(definitionId: string): string {
  return ITEM_CATALOG.get(definitionId as never)?.name ?? definitionId;
}

/**
 * The active harvest, with the controls to settle or end it.
 *
 * Yields are shown from the last collection rather than counted up live: the
 * server owns the outcome, and a local counter would be a prediction the rest
 * of this layer deliberately avoids making.
 */
export function GatheringHud({
  onCollect,
  onStop,
  onClaimOffline,
}: {
  onCollect: () => void;
  onStop: () => void;
  onClaimOffline: () => void;
}) {
  const economy = useAppStore((state) => state.economy);
  if (economy.gatheringNodeId === null) return null;

  const node = NODE_CATALOG.get(economy.gatheringNodeId as never);
  const skill = node === undefined ? undefined : SKILL_TABLE.get(node.requiredSkillId);
  const progress = node === undefined ? undefined : economy.skills[node.requiredSkillId];

  return (
    <div className="panel gathering-hud">
      <LabelStrip title={skill?.name ?? 'Gathering'} serial={`lv ${progress?.level ?? 1}`} />

      {economy.lastYields.length > 0 ? (
        <ul className="gathering-hud__yields">
          {economy.lastYields.map((entry) => (
            <li key={entry.itemId}>
              <span>{itemName(entry.itemId)}</span>
              <span className="gathering-hud__count">+{entry.quantity}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gathering-hud__idle">Working the seam…</p>
      )}

      {economy.lastXpGained > 0 && <p className="gathering-hud__xp">+{economy.lastXpGained} xp</p>}
      {economy.overflowed && (
        <p className="gathering-hud__warning">Bag full — some of the haul was left behind.</p>
      )}

      <div className="gathering-hud__actions">
        <button type="button" className="prompt__button" onClick={onCollect}>
          Collect
        </button>
        <button type="button" className="prompt__button" onClick={onClaimOffline}>
          Claim away time
        </button>
        <button type="button" className="prompt__button" onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}

/** The bag, grouped by item with a slot count against capacity. */
export function InventoryPanel({ onClose }: { onClose: () => void }) {
  const economy = useAppStore((state) => state.economy);

  const totals = new Map<string, number>();
  for (const stack of economy.stacks) {
    totals.set(stack.definitionId, (totals.get(stack.definitionId) ?? 0) + stack.quantity);
  }

  return (
    <div className="panel inventory-panel">
      <LabelStrip title="Satchel" serial={`${economy.stacks.length}/${economy.slotCapacity}`} />
      {totals.size === 0 ? (
        <p className="inventory-panel__empty">Nothing gathered yet.</p>
      ) : (
        <ul className="inventory-panel__list">
          {[...totals].map(([definitionId, quantity]) => {
            const definition = ITEM_CATALOG.get(definitionId as never);
            return (
              <li key={definitionId} data-rarity={definition?.rarity ?? 'COMMON'}>
                <span className="inventory-panel__name">{itemName(definitionId)}</span>
                <span className="inventory-panel__count">{quantity}</span>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="prompt__button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/**
 * The reason the last command was refused.
 *
 * Shown verbatim from the server's reason string rather than mapped to a
 * friendlier sentence, because a wrong friendly message is harder to diagnose
 * than an unfamiliar exact one. Mapping belongs here once the set of reasons
 * has stopped moving.
 */
export function CommandError() {
  const reason = useAppStore((state) => state.lastCommandError);
  if (reason === null) return null;
  return (
    <div className="command-error" role="status">
      {reason}
    </div>
  );
}
