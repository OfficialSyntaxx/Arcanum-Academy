import { useState } from 'react';
import { ITEM_CATALOG, STRINGS, CARD_CATALOG } from '@arcanum/shared';
import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from './LabelStrip.js';

/**
 * Ladder and trading surfaces.
 *
 * Both show the server's copy and nothing else. Trading in particular must
 * never render an optimistic state: showing a player an item they are about to
 * receive, before the trade settles, is the shape every trade scam takes.
 */

export function LadderPanel({
  deckId,
  onQueue,
  onLeaveQueue,
  onClose,
}: {
  deckId: string | undefined;
  onQueue: (deckId: string) => void;
  onLeaveQueue: () => void;
  onClose: () => void;
}) {
  const queued = useAppStore((state) => state.queued);

  return (
    <div className="panel ladder-panel">
      <LabelStrip title="Duelling Terrace" serial={queued ? 'searching' : 'idle'} />
      {deckId === undefined ? (
        <p className="inventory-panel__empty">Save a deck before entering the ladder.</p>
      ) : queued !== null ? (
        <>
          <p className="inventory-panel__empty">
            Waiting for an opponent. {queued.queueSize} in the queue.
          </p>
          <button type="button" className="prompt__button" onClick={onLeaveQueue}>
            Leave queue
          </button>
        </>
      ) : (
        <button type="button" className="prompt__button" onClick={() => onQueue(deckId)}>
          Find a duel
        </button>
      )}
      <button type="button" className="prompt__button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/**
 * The trade window.
 *
 * Both offers are shown side by side with each side's confirmation state,
 * because a trade you cannot inspect before agreeing to is how people are
 * defrauded. Confirming is disabled until the other side has actually offered
 * something, so an empty trade cannot be rushed through.
 */
export function TradePanel({
  playerId,
  onOffer,
  onConfirm,
  onCancel,
}: {
  playerId: string;
  onOffer: (
    tradeId: string,
    stacks: { definitionId: string; quantity: number }[],
    cardInstanceIds: string[],
  ) => void;
  onConfirm: (tradeId: string) => void;
  onCancel: (tradeId: string) => void;
}) {
  const trade = useAppStore((state) => state.trade);
  const economy = useAppStore((state) => state.economy);
  const [picked, setPicked] = useState<string[]>([]);

  if (trade === null || trade.state !== 'OPEN') return null;

  const partner = trade.participants.find((id) => id !== playerId) ?? 'opponent';
  const yours = trade.offers[playerId];
  const theirs = trade.offers[partner];
  const theyOffered = (theirs?.stacks.length ?? 0) > 0 || (theirs?.cardInstanceIds.length ?? 0) > 0;

  function itemName(definitionId: string): string {
    return ITEM_CATALOG.get(definitionId as never)?.name ?? definitionId;
  }

  function cardName(instanceId: string): string {
    const owned = economy.cards.find((entry) => entry.definitionId === instanceId);
    const definition = CARD_CATALOG.get((owned?.definitionId ?? instanceId) as never);
    return definition === undefined ? instanceId : STRINGS.get(definition.nameKey);
  }

  return (
    <div className="panel trade-panel">
      <LabelStrip title="Trade" serial={yours?.confirmed === true ? 'you agreed' : 'open'} />

      <div className="trade-panel__sides">
        <section>
          <h3 className="collection-panel__owned">You offer</h3>
          <ul className="inventory-panel__list">
            {(yours?.stacks ?? []).map((stack) => (
              <li key={stack.definitionId}>
                <span>{itemName(stack.definitionId)}</span>
                <span className="inventory-panel__count">{stack.quantity}</span>
              </li>
            ))}
            {(yours?.cardInstanceIds ?? []).map((id) => (
              <li key={id}>
                <span>{cardName(id)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="collection-panel__owned">
            They offer {theirs?.confirmed === true ? '(agreed)' : ''}
          </h3>
          <ul className="inventory-panel__list">
            {(theirs?.stacks ?? []).map((stack) => (
              <li key={stack.definitionId}>
                <span>{itemName(stack.definitionId)}</span>
                <span className="inventory-panel__count">{stack.quantity}</span>
              </li>
            ))}
            {(theirs?.cardInstanceIds ?? []).map((id) => (
              <li key={id}>
                <span>{cardName(id)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <h3 className="collection-panel__owned">Add from your satchel</h3>
      <ul className="inventory-panel__list">
        {economy.stacks.map((stack) => {
          const chosen = picked.includes(stack.definitionId);
          return (
            <li key={stack.definitionId}>
              <span>{itemName(stack.definitionId)}</span>
              <button
                type="button"
                className="collection-panel__filter"
                data-active={chosen}
                onClick={() =>
                  setPicked(
                    chosen
                      ? picked.filter((id) => id !== stack.definitionId)
                      : [...picked, stack.definitionId],
                  )
                }
              >
                {chosen ? 'Remove' : `Offer ${stack.quantity}`}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="collection-panel__footer">
        <button
          type="button"
          className="prompt__button"
          onClick={() =>
            onOffer(
              trade.id,
              economy.stacks
                .filter((stack) => picked.includes(stack.definitionId))
                .map((stack) => ({ definitionId: stack.definitionId, quantity: stack.quantity })),
              [],
            )
          }
        >
          Update offer
        </button>
        <button
          type="button"
          className="prompt__button"
          disabled={!theyOffered || yours?.confirmed === true}
          onClick={() => onConfirm(trade.id)}
        >
          Agree
        </button>
        <button type="button" className="prompt__button" onClick={() => onCancel(trade.id)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
