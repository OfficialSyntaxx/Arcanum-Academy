/**
 * Deck legality.
 *
 * Two rules, both asserted on `CardDefinitionId`: a deck holds exactly the
 * required number of cards, and no more than the permitted copies of any one
 * spell.
 *
 * "Exactly", not "at least". The initialization report flagged the ambiguity:
 * a minimum invites deck-thinning, which makes every draw effect scale with
 * how far under the cap you are and turns consistency into a currency. A fixed
 * size keeps draw maths stable and comparable between players.
 *
 * Counting definitions rather than instances is the whole point of the split.
 * A player who owns one grade 10 slab of a spell owns one copy of that spell,
 * however many times they select it - registering the same physical card three
 * times is exactly the bug the report warned about.
 */

import type { CombatTunables } from '../config/tunables.js';
import { failure, type Failure } from '../errors.js';
import type { CardDefinitionId } from '../ids.js';
import { err, ok, type Result } from '../result.js';
import type { CardDefinition } from './types.js';

export interface DeckLegality {
  readonly cardCount: number;
  readonly requiredCount: number;
  /** Definition ids appearing more often than the copy limit permits. */
  readonly overCopies: readonly { readonly definitionId: string; readonly count: number }[];
  readonly unknown: readonly string[];
}

/**
 * Reports every problem at once.
 *
 * A deck builder that surfaces one error at a time makes fixing a deck a
 * guessing game, and the exit criteria ask for legality feedback fast enough
 * to run on every edit - so this is a pure count over the list with no
 * allocation per card beyond the tally.
 */
export function inspectDeck(
  cardDefinitionIds: readonly CardDefinitionId[],
  lookup: (id: CardDefinitionId) => CardDefinition | undefined,
  tunables: CombatTunables,
): DeckLegality {
  const counts = new Map<string, number>();
  const unknown: string[] = [];

  for (const id of cardDefinitionIds) {
    if (lookup(id) === undefined && !unknown.includes(id)) unknown.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const overCopies: { definitionId: string; count: number }[] = [];
  for (const [definitionId, count] of counts) {
    if (count > tunables.maxCopiesPerSpell) overCopies.push({ definitionId, count });
  }

  return {
    cardCount: cardDefinitionIds.length,
    requiredCount: tunables.deckSize,
    overCopies,
    unknown,
  };
}

export function isLegal(legality: DeckLegality): boolean {
  return (
    legality.cardCount === legality.requiredCount &&
    legality.overCopies.length === 0 &&
    legality.unknown.length === 0
  );
}

/** The same check as a `Result`, for the server's last word on a submitted deck. */
export function assertLegalDeck(
  cardDefinitionIds: readonly CardDefinitionId[],
  lookup: (id: CardDefinitionId) => CardDefinition | undefined,
  tunables: CombatTunables,
): Result<true, Failure> {
  const legality = inspectDeck(cardDefinitionIds, lookup, tunables);
  if (isLegal(legality)) return ok(true);

  const problems: string[] = [];
  if (legality.cardCount !== legality.requiredCount) {
    problems.push(
      `deck holds ${legality.cardCount} cards, exactly ${legality.requiredCount} required`,
    );
  }
  for (const entry of legality.overCopies) {
    problems.push(
      `${entry.definitionId} appears ${entry.count} times, at most ${tunables.maxCopiesPerSpell} permitted`,
    );
  }
  for (const id of legality.unknown) {
    problems.push(`${id} is not a card`);
  }

  return err(
    failure('validation', 'deck.illegal', {
      detail: problems.join('; '),
      context: { cardCount: legality.cardCount, requiredCount: legality.requiredCount },
    }),
  );
}

/**
 * How many more copies of a card may be added.
 *
 * Drives the deck builder's per-card affordance so a player is never offered a
 * card the rules would then refuse.
 */
export function remainingCopies(
  cardDefinitionIds: readonly CardDefinitionId[],
  definitionId: CardDefinitionId,
  tunables: CombatTunables,
): number {
  let used = 0;
  for (const id of cardDefinitionIds) {
    if (id === definitionId) used += 1;
  }
  return Math.max(0, tunables.maxCopiesPerSpell - used);
}
