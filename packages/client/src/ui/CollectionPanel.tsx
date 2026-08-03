import { useMemo, useState } from 'react';
import {
  CARD_CATALOG,
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  SCHOOL_TABLE,
  STRINGS,
  inspectDeck,
  isLegal,
  remainingCopies,
  type CardDefinitionId,
} from '@arcanum/shared';
import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from './LabelStrip.js';

/**
 * The collection and the deck builder, on one surface.
 *
 * They are the same screen because building a deck is choosing from a
 * collection, and a builder that hides the collection behind a tab makes the
 * player hold both in their head. Legality is recomputed on every edit from
 * the same rule the server enforces, so the count and the warnings are never a
 * guess at what the server will say.
 *
 * No string here is a literal: every card name and rules text is resolved by
 * key, which is what makes the set translatable without touching a component.
 */

const combat = DEFAULT_TUNABLES.combat;

function schoolOf(schoolId: string) {
  return SCHOOL_TABLE.get(schoolId);
}

/**
 * The scribing table has two jobs and they share a surface.
 *
 * `scribe` browses every card in the game and makes the ones the satchel can
 * pay for; `collection` browses what has actually been scribed and builds a
 * deck from it. Splitting them across two interactables would put a walk
 * between deciding you need a third Emberbolt and making one.
 */
type Mode = 'scribe' | 'collection';

export function CollectionPanel({
  onScribe,
  onSaveDeck,
  onClose,
}: {
  onScribe: (cardId: string) => void;
  onSaveDeck: (deckId: string, name: string, cardDefinitionIds: string[]) => void;
  onClose: () => void;
}) {
  const cards = useAppStore((state) => state.economy.cards);
  const stacks = useAppStore((state) => state.economy.stacks);
  const skills = useAppStore((state) => state.economy.skills);
  const [mode, setMode] = useState<Mode>('scribe');
  const [deck, setDeck] = useState<CardDefinitionId[]>([]);
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);

  const held = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stack of stacks) {
      counts.set(stack.definitionId, (counts.get(stack.definitionId) ?? 0) + stack.quantity);
    }
    return counts;
  }, [stacks]);

  const scribingLevel = skills['skill.scribing']?.level ?? 1;

  /** Every card in the game, for the scribing side. */
  const scribable = useMemo(
    () =>
      CARD_CATALOG.cards
        .filter((definition) => schoolFilter === null || definition.schoolId === schoolFilter)
        .sort((a, b) => a.scribeSkillLevel - b.scribeSkillLevel || a.cost - b.cost),
    [schoolFilter],
  );

  /** Distinct spells owned, with how many copies of each. */
  const owned = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      counts.set(card.definitionId, (counts.get(card.definitionId) ?? 0) + 1);
    }
    return [...counts]
      .map(([definitionId, copies]) => ({
        definition: CARD_CATALOG.get(definitionId as CardDefinitionId),
        copies,
      }))
      .filter(
        (entry): entry is { definition: NonNullable<typeof entry.definition>; copies: number } =>
          entry.definition !== undefined,
      )
      .filter((entry) => schoolFilter === null || entry.definition.schoolId === schoolFilter)
      .sort((a, b) => a.definition.cost - b.definition.cost);
  }, [cards, schoolFilter]);

  const legality = useMemo(() => inspectDeck(deck, (id) => CARD_CATALOG.get(id), combat), [deck]);
  const legal = isLegal(legality);

  function add(definitionId: CardDefinitionId, copiesOwned: number) {
    const inDeck = deck.filter((id) => id === definitionId).length;
    // Capped by both rules at once: the copy limit and how many the player
    // actually owns. Offering a card the server would refuse is worse than not
    // offering it.
    if (inDeck >= combat.maxCopiesPerSpell || inDeck >= copiesOwned) return;
    if (deck.length >= combat.deckSize) return;
    setDeck([...deck, definitionId]);
  }

  function removeOne(definitionId: CardDefinitionId) {
    const index = deck.lastIndexOf(definitionId);
    if (index === -1) return;
    setDeck([...deck.slice(0, index), ...deck.slice(index + 1)]);
  }

  return (
    <div className="panel collection-panel">
      <LabelStrip
        title={mode === 'scribe' ? 'Scribing Table' : 'Collection'}
        serial={mode === 'scribe' ? `lv ${scribingLevel}` : `${deck.length}/${combat.deckSize}`}
        seal={mode === 'collection' && legal ? 'gilt' : 'verdigris'}
      />

      <div className="collection-panel__filters">
        <button
          type="button"
          className="collection-panel__filter"
          data-active={mode === 'scribe'}
          onClick={() => setMode('scribe')}
        >
          Scribe
        </button>
        <button
          type="button"
          className="collection-panel__filter"
          data-active={mode === 'collection'}
          onClick={() => setMode('collection')}
        >
          Collection
        </button>
      </div>

      <div className="collection-panel__filters">
        <button
          type="button"
          className="collection-panel__filter"
          data-active={schoolFilter === null}
          onClick={() => setSchoolFilter(null)}
        >
          All
        </button>
        {SCHOOL_TABLE.schools.map((school) => (
          <button
            key={school.id}
            type="button"
            className="collection-panel__filter"
            data-active={schoolFilter === school.id}
            style={{ color: `var(${school.colorToken})` }}
            onClick={() => setSchoolFilter(school.id)}
          >
            <span aria-hidden="true">{school.glyph}</span> {STRINGS.get(`${school.id}.name`)}
          </button>
        ))}
      </div>

      {mode === 'scribe' ? (
        <ul className="collection-panel__list">
          {scribable.map((definition) => {
            const school = schoolOf(definition.schoolId);
            const levelMet = scribingLevel >= definition.scribeSkillLevel;
            const materialsMet = definition.scribeInputs.every(
              (input) => (held.get(input.itemId) ?? 0) >= input.quantity,
            );
            return (
              <li key={definition.id} className="collection-panel__card">
                <div className="collection-panel__card-head">
                  <span
                    className="collection-panel__glyph"
                    style={{ color: `var(${school?.colorToken ?? '--haze'})` }}
                    aria-hidden="true"
                  >
                    {school?.glyph ?? '·'}
                  </span>
                  <span className="inventory-panel__name">{STRINGS.get(definition.nameKey)}</span>
                  <span className="collection-panel__cost">{definition.cost}</span>
                </div>
                <p className="collection-panel__text">{STRINGS.get(definition.textKey)}</p>
                <ul className="crafting-panel__inputs">
                  {definition.scribeInputs.map((input) => (
                    <li
                      key={input.itemId}
                      data-met={(held.get(input.itemId) ?? 0) >= input.quantity}
                    >
                      {ITEM_CATALOG.get(input.itemId as never)?.name ?? input.itemId}{' '}
                      {held.get(input.itemId) ?? 0}/{input.quantity}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="prompt__button"
                  disabled={!levelMet || !materialsMet}
                  onClick={() => onScribe(definition.id)}
                >
                  {levelMet ? 'Scribe' : `Needs scribing ${definition.scribeSkillLevel}`}
                </button>
              </li>
            );
          })}
        </ul>
      ) : owned.length === 0 ? (
        <p className="inventory-panel__empty">Nothing scribed yet.</p>
      ) : (
        <ul className="collection-panel__list">
          {owned.map(({ definition, copies }) => {
            const inDeck = deck.filter((id) => id === definition.id).length;
            const school = schoolOf(definition.schoolId);
            const headroom = Math.min(
              remainingCopies(deck, definition.id, combat),
              copies - inDeck,
            );
            return (
              <li key={definition.id} className="collection-panel__card">
                <div className="collection-panel__card-head">
                  <span
                    className="collection-panel__glyph"
                    style={{ color: `var(${school?.colorToken ?? '--haze'})` }}
                    aria-hidden="true"
                  >
                    {school?.glyph ?? '·'}
                  </span>
                  <span className="inventory-panel__name">{STRINGS.get(definition.nameKey)}</span>
                  <span className="collection-panel__cost">{definition.cost}</span>
                </div>
                <p className="collection-panel__text">{STRINGS.get(definition.textKey)}</p>
                <div className="collection-panel__actions">
                  <span className="collection-panel__owned">
                    {inDeck}/{copies} in deck
                  </span>
                  <button
                    type="button"
                    className="prompt__button"
                    disabled={headroom <= 0 || deck.length >= combat.deckSize}
                    onClick={() => add(definition.id, copies)}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="prompt__button"
                    disabled={inDeck === 0}
                    onClick={() => removeOne(definition.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mode === 'collection' && !legal && deck.length > 0 && (
        <p className="collection-panel__warning">
          {legality.cardCount !== legality.requiredCount
            ? `${legality.requiredCount - legality.cardCount} more card${
                legality.requiredCount - legality.cardCount === 1 ? '' : 's'
              } needed`
            : 'Too many copies of one spell'}
        </p>
      )}

      <div className="collection-panel__footer">
        {mode === 'collection' && (
          <button
            type="button"
            className="prompt__button"
            disabled={!legal}
            onClick={() => onSaveDeck('deck.1', 'First Twenty', [...deck])}
          >
            Save deck
          </button>
        )}
        <button type="button" className="prompt__button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
