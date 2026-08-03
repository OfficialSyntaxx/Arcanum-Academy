/**
 * Card data, split by ADR-0004.
 *
 * `CardDefinition` is the spell: cost, effect, school, type. It is the only
 * half the combat resolver is ever allowed to read, which is what keeps a
 * grade 10 slab and a grade 1 scrap of the same spell mechanically identical.
 *
 * `CardInstance` is the object a player owns: its grade, its serial, who
 * scribed it and when. It is the half the collection, the market and the
 * display cabinet care about, and the half combat must never see.
 *
 * Deck legality is asserted on `definitionId`, never on `instanceId`. The
 * distinction is not pedantry: conflating them lets a player register the same
 * physical slab three times and call it three copies.
 */

import type { CardDefinitionId, CardInstanceId, PlayerId, SlabSerial } from '../ids.js';

/**
 * A school of magic, authored as content rather than fixed in code.
 *
 * Schools carry identity, colour and eventually mechanical leanings, and no
 * design survives first contact with its own card list. Keeping them in a data
 * file means revising the set is a content edit and a validator run, not a
 * change to every switch statement that ever mentioned one.
 */
export interface SchoolDefinition {
  readonly id: string;
  readonly name: string;
  /**
   * Design token for the school's colour.
   *
   * A token rather than a hex value so light and dark themes resolve it
   * differently, and so colour is never the only carrier of meaning - each
   * school also has a distinct glyph, which is what keeps the card readable
   * for the ~8% of male players with a colour vision deficiency that risk M10
   * in the initialization report calls out.
   */
  readonly colorToken: string;
  readonly glyph: string;
  readonly description: string;
}

export const CardType = {
  /** Resolves once and leaves play. */
  Cantrip: 'CANTRIP',
  /** Persists on the board until removed. */
  Ward: 'WARD',
  /** Persists and acts each turn. */
  Construct: 'CONSTRUCT',
} as const;
export type CardType = (typeof CardType)[keyof typeof CardType];

export const CardRarity = {
  Common: 'COMMON',
  Uncommon: 'UNCOMMON',
  Rare: 'RARE',
  Mythic: 'MYTHIC',
} as const;
export type CardRarity = (typeof CardRarity)[keyof typeof CardRarity];

/**
 * One mechanical clause of a spell.
 *
 * Effects are data, not code, so a card is describable, diffable and
 * localisable, and so the Phase 5 resolver is a single interpreter rather than
 * one branch per card. `magnitude` is always an integer: fractional damage
 * cannot be hashed identically across platforms, and the state hash is what
 * makes a duel verifiable.
 */
export const EffectKind = {
  Damage: 'DAMAGE',
  Heal: 'HEAL',
  Draw: 'DRAW',
  Ward: 'WARD',
  ResonanceGain: 'RESONANCE_GAIN',
  /** Damage that ignores wards entirely. Flame's answer to a turtle. */
  Pierce: 'PIERCE',
  /** Destroys the longest-standing construct the target controls. */
  DestroyConstruct: 'DESTROY_CONSTRUCT',
  /** Target discards from hand, oldest card first. */
  Discard: 'DISCARD',
} as const;
export type EffectKind = (typeof EffectKind)[keyof typeof EffectKind];

/**
 * When an effect applies.
 *
 * Conditions are what let two cards with the same numbers be different cards.
 * They are evaluated against the caster's own position, never the opponent's
 * hand, so nothing here needs hidden information to resolve - which is what
 * keeps client prediction possible.
 */
export const EffectCondition = {
  Always: 'ALWAYS',
  /** The caster holds a ward. */
  IfWarded: 'IF_WARDED',
  /** The caster has taken damage. */
  IfWounded: 'IF_WOUNDED',
  /** The opponent is at or below the magnitude of the condition threshold. */
  IfOpponentBloodied: 'IF_OPPONENT_BLOODIED',
  /** The caster controls at least one construct. */
  IfConstructed: 'IF_CONSTRUCTED',
} as const;
export type EffectCondition = (typeof EffectCondition)[keyof typeof EffectCondition];

/**
 * What an effect's magnitude is multiplied by.
 *
 * Scaling is the other half of distinctness: "deal 2" and "deal 2 for every
 * ward you hold" cost the same to author and play completely differently.
 * Every scale reads from public state for the same reason conditions do.
 */
export const EffectScale = {
  Flat: 'FLAT',
  PerWard: 'PER_WARD',
  PerConstruct: 'PER_CONSTRUCT',
  PerCardInHand: 'PER_CARD_IN_HAND',
} as const;
export type EffectScale = (typeof EffectScale)[keyof typeof EffectScale];

export const EffectTarget = {
  Opponent: 'OPPONENT',
  Self: 'SELF',
} as const;
export type EffectTarget = (typeof EffectTarget)[keyof typeof EffectTarget];

export interface CardEffect {
  readonly kind: EffectKind;
  readonly target: EffectTarget;
  readonly magnitude: number;
  /** Defaults to ALWAYS when absent. */
  readonly condition?: EffectCondition;
  /** Threshold the condition compares against, where it needs one. */
  readonly conditionValue?: number;
  /** Defaults to FLAT when absent. */
  readonly scale?: EffectScale;
}

export interface CardDefinition {
  readonly id: CardDefinitionId;
  /** Localisation key, not a display string. Phase 4 exit criteria. */
  readonly nameKey: string;
  readonly textKey: string;
  readonly schoolId: string;
  readonly type: CardType;
  readonly rarity: CardRarity;
  /** Resonance cost to cast. */
  readonly cost: number;
  readonly effects: readonly CardEffect[];
  /** Materials consumed to scribe one copy. */
  readonly scribeInputs: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly scribeSkillLevel: number;
  readonly artKey: string;
}

/**
 * One owned copy of a card.
 *
 * Never referenced by content and never read by combat. `serial` is present
 * only on slabbed copies, because a serial is a claim of scarcity and minting
 * one for every card ever scribed would make the claim worthless.
 */
export interface CardInstance {
  readonly instanceId: CardInstanceId;
  readonly definitionId: CardDefinitionId;
  readonly grade: number;
  readonly foil: boolean;
  readonly serial: SlabSerial | null;
  readonly scribedBy: PlayerId;
  readonly scribedAtMs: number;
  /** Tunables version the grade was rolled under, so a regrade is comparable. */
  readonly gradedUnderTunablesVersion: number;
}

/** A saved deck. Legality is asserted on definition ids. */
export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly cardDefinitionIds: readonly CardDefinitionId[];
}
