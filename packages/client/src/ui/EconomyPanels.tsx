import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  NODE_CATALOG,
  RECIPE_BOOK,
  SKILL_TABLE,
  wasteRateBasisPoints,
  levelForXp,
  xpForLevel,
} from '@alderfell/shared';
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
export function GatheringHud({ onCollect, onStop }: { onCollect: () => void; onStop: () => void }) {
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
        <p className="gathering-hud__idle">Gathering resources…</p>
      )}

      {economy.lastXpGained > 0 && <p className="gathering-hud__xp">+{economy.lastXpGained} xp</p>}
      {economy.overflowed && (
        <p className="gathering-hud__warning">Bag full — some of the haul was left behind.</p>
      )}

      <div className="gathering-hud__actions">
        <button type="button" className="prompt__button" onClick={onCollect}>
          Collect
        </button>
        <button type="button" className="prompt__button" onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}

/** The bag, grouped by item with a slot count against capacity. */
export function InventoryPanel({
  onClose,
  onOpenEquipment,
}: {
  onClose: () => void;
  onOpenEquipment: () => void;
}) {
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
      <section className="skill-list" aria-label="Skill progress">
        <h3>Skills</h3>
        {SKILL_TABLE.skills
          .filter(
            (skill) =>
              NODE_CATALOG.nodes.some((node) => node.requiredSkillId === skill.id) ||
              RECIPE_BOOK.recipes.some((recipe) => recipe.requiredSkillId === skill.id),
          )
          .map((skill) => {
            const xp = economy.skills[skill.id]?.xp ?? 0;
            const level = levelForXp(xp, DEFAULT_TUNABLES.progression);
            const floor = xpForLevel(level, DEFAULT_TUNABLES.progression);
            const ceiling = xpForLevel(level + 1, DEFAULT_TUNABLES.progression);
            return (
              <div key={skill.id} className="skill-list__row">
                <span>{skill.name}</span>
                <span>
                  Level {level} · {xp} XP
                </span>
                <progress
                  aria-label={`${skill.name} level progress`}
                  value={ceiling === floor ? 1 : xp - floor}
                  max={Math.max(1, ceiling - floor)}
                />
              </div>
            );
          })}
      </section>
      <div className="panel-actions">
        <button type="button" className="prompt__button" onClick={onOpenEquipment}>
          Gear
        </button>
        <button type="button" className="prompt__button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Equipped tools live outside the satchel so material capacity stays legible. */
export function EquipmentPanel({ onBack }: { onBack: () => void }) {
  const tools = useAppStore((state) => state.economy.tools);
  const equipped = Object.entries(tools)
    .map(([skillId, tool]) => ({
      skillId,
      tool,
      definition: ITEM_CATALOG.get(tool.definitionId as never),
    }))
    .filter((entry) => entry.definition?.tool !== undefined);

  return (
    <div className="panel inventory-panel equipment-panel">
      <LabelStrip title="Gear" serial={`${equipped.length} equipped`} />
      {equipped.length === 0 ? (
        <p className="inventory-panel__empty">No gathering tools equipped.</p>
      ) : (
        <ul className="equipment-panel__list">
          {equipped.map(({ skillId, tool, definition }) => {
            const max = definition!.tool!.maxDurability;
            const skill = SKILL_TABLE.get(skillId as never);
            return (
              <li key={skillId}>
                <div className="equipment-panel__head">
                  <span>{definition!.name}</span>
                  <span>{skill?.name ?? skillId}</span>
                </div>
                <progress
                  aria-label={`${definition!.name} durability`}
                  value={tool.durability}
                  max={max}
                />
                <span className="equipment-panel__durability">
                  {tool.durability}/{max} durability
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="prompt__button" onClick={onBack}>
        Back to satchel
      </button>
    </div>
  );
}

/** Resource storage is opened at a bank chest in the world, never from the HUD. */
export function BankPanel({
  onDeposit,
  onWithdraw,
  onClose,
}: {
  onDeposit: (itemId: string, quantity: number) => void;
  onWithdraw: (itemId: string, quantity: number) => void;
  onClose: () => void;
}) {
  const economy = useAppStore((state) => state.economy);
  const grouped = (stacks: readonly { definitionId: string; quantity: number }[]) => {
    const totals = new Map<string, number>();
    for (const stack of stacks)
      totals.set(stack.definitionId, (totals.get(stack.definitionId) ?? 0) + stack.quantity);
    return [...totals];
  };
  const bag = grouped(economy.stacks);
  const bank = grouped(economy.bankStacks);

  return (
    <div className="panel bank-panel">
      <LabelStrip
        title="Reclaimer’s Cache"
        serial={`${economy.bankStacks.length}/${economy.bankSlotCapacity}`}
      />
      <p className="bank-panel__hint">
        Tap a bag stack to deposit it all. Tap stored resources to withdraw them all.
      </p>
      <section className="bank-panel__column" aria-label="Satchel resources">
        <h3>Satchel</h3>
        {bag.length === 0 ? (
          <p className="inventory-panel__empty">Nothing to deposit.</p>
        ) : (
          <ul className="bank-panel__list">
            {bag.map(([itemId, quantity]) => (
              <li key={itemId}>
                <span>{itemName(itemId)}</span>
                <button type="button" onClick={() => onDeposit(itemId, quantity)}>
                  Deposit {quantity}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bank-panel__column" aria-label="Stored resources">
        <h3>Stored</h3>
        {bank.length === 0 ? (
          <p className="inventory-panel__empty">The cache is empty.</p>
        ) : (
          <ul className="bank-panel__list">
            {bank.map(([itemId, quantity]) => (
              <li key={itemId}>
                <span>{itemName(itemId)}</span>
                <button type="button" onClick={() => onWithdraw(itemId, quantity)}>
                  Withdraw {quantity}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <button type="button" className="prompt__button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/**
 * The recipes craftable at a station, with what each costs and risks.
 *
 * Requirements are evaluated here from the same catalog and tunables the server
 * uses, so a recipe the server would refuse is shown as unavailable rather than
 * offered and then rejected. The server still has the last word - this only
 * spares the player a round trip to be told no.
 */
export function CraftingPanel({
  stationInteractableId,
  onCraft,
  onClose,
}: {
  stationInteractableId: string;
  onCraft: (recipeId: string) => void;
  onClose: () => void;
}) {
  const economy = useAppStore((state) => state.economy);
  const recipes = RECIPE_BOOK.atStation(stationInteractableId as never);

  const held = new Map<string, number>();
  for (const stack of economy.stacks) {
    held.set(stack.definitionId, (held.get(stack.definitionId) ?? 0) + stack.quantity);
  }

  return (
    <div className="panel crafting-panel">
      <LabelStrip title="Refining" serial={`${recipes.length} recipes`} />
      {recipes.length === 0 ? (
        <p className="inventory-panel__empty">Nothing is refined here.</p>
      ) : (
        <ul className="crafting-panel__list">
          {recipes.map((recipe) => {
            const level = economy.skills[recipe.requiredSkillId]?.level ?? 1;
            const levelMet = level >= recipe.requiredSkillLevel;
            const inputsMet = recipe.inputs.every(
              (input) => (held.get(input.itemId) ?? 0) >= input.quantity,
            );
            const waste = wasteRateBasisPoints(recipe, level, DEFAULT_TUNABLES.crafting);
            return (
              <li key={recipe.id} className="crafting-panel__recipe">
                <div className="crafting-panel__head">
                  <span className="inventory-panel__name">{recipe.name}</span>
                  <span className="inventory-panel__count">{(waste / 100).toFixed(1)}% waste</span>
                </div>
                <ul className="crafting-panel__inputs">
                  {recipe.inputs.map((input) => {
                    const have = held.get(input.itemId) ?? 0;
                    return (
                      <li key={input.itemId} data-met={have >= input.quantity}>
                        {itemName(input.itemId)} {have}/{input.quantity}
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className="prompt__button"
                  disabled={!levelMet || !inputsMet}
                  onClick={() => onCraft(recipe.id)}
                >
                  {levelMet
                    ? `Refine ${itemName(recipe.output.itemId)}`
                    : `Needs level ${recipe.requiredSkillLevel}`}
                </button>
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

export function MerchantPanel({
  onSell,
  onRepair,
  onClose,
}: {
  onSell: (itemId: string, quantity: number) => void;
  onRepair: (skillId: string) => void;
  onClose: () => void;
}) {
  const economy = useAppStore((state) => state.economy);
  return (
    <div className="panel bank-panel">
      <LabelStrip title="Quartermaster Vell" serial={`${economy.coins} coins`} />
      <p className="bank-panel__hint">
        Sell materials for coins. Repairs cost 2 coins per durability.
      </p>
      <section className="bank-panel__column">
        <h3>Sell from satchel</h3>
        <ul className="bank-panel__list">
          {economy.stacks.map((stack) => (
            <li key={stack.definitionId}>
              <span>
                {itemName(stack.definitionId)} × {stack.quantity}
              </span>
              <button type="button" onClick={() => onSell(stack.definitionId, stack.quantity)}>
                Sell all
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="bank-panel__column">
        <h3>Repair tools</h3>
        <ul className="bank-panel__list">
          {Object.entries(economy.tools).map(([skillId, tool]) => (
            <li key={skillId}>
              <span>
                {itemName(tool.definitionId)} · {tool.durability}
              </span>
              <button type="button" onClick={() => onRepair(skillId)}>
                Repair
              </button>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="prompt__button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
