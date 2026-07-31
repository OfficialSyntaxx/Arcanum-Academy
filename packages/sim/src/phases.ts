/**
 * Top-level game phases and their legal transitions.
 *
 * Derived directly from the GDD's required state machine. Two additions the GDD
 * does not name but the implementation needs:
 *
 * - `Boot` separates "engine starting" from "loading content", so a failure
 *   during bootstrap can be reported without a half-initialised renderer.
 * - `Fault` is a terminal-but-recoverable phase. Without it, an unrecoverable
 *   error either crashes to a blank canvas or gets papered over; with it the UI
 *   can show a real message and offer a resync or reload.
 */

export const GamePhase = {
  Boot: 'BOOT',
  Loading: 'LOADING',
  Syncing: 'SYNCING',
  SocialHub: 'SOCIAL_HUB',
  WorldExploration: 'WORLD_EXPLORATION',
  IdleGathering: 'IDLE_GATHERING',
  Crafting: 'CRAFTING',
  DeckBuilding: 'DECK_BUILDING',
  CardCombat: 'CARD_COMBAT',
  Market: 'MARKET',
  QuestDialog: 'QUEST_DIALOG',
  Paused: 'PAUSED',
  Fault: 'FAULT',
} as const;

export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

/**
 * Adjacency table. Read it as "from this phase, the player can reach these".
 * Every phase can reach `Fault`; every phase except `Boot` can reach `Paused`.
 */
export const PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = Object.freeze({
  [GamePhase.Boot]: [GamePhase.Loading, GamePhase.Fault],
  [GamePhase.Loading]: [GamePhase.Syncing, GamePhase.WorldExploration, GamePhase.Fault],
  [GamePhase.Syncing]: [
    GamePhase.WorldExploration,
    GamePhase.SocialHub,
    GamePhase.CardCombat,
    GamePhase.Loading,
    GamePhase.Fault,
  ],
  [GamePhase.WorldExploration]: [
    GamePhase.SocialHub,
    GamePhase.IdleGathering,
    GamePhase.Crafting,
    GamePhase.DeckBuilding,
    GamePhase.CardCombat,
    GamePhase.Market,
    GamePhase.QuestDialog,
    GamePhase.Syncing,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  [GamePhase.SocialHub]: [
    GamePhase.WorldExploration,
    GamePhase.CardCombat,
    GamePhase.DeckBuilding,
    GamePhase.Market,
    GamePhase.Syncing,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  [GamePhase.IdleGathering]: [
    GamePhase.WorldExploration,
    GamePhase.Crafting,
    GamePhase.Syncing,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  [GamePhase.Crafting]: [
    GamePhase.WorldExploration,
    GamePhase.DeckBuilding,
    GamePhase.Syncing,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  [GamePhase.DeckBuilding]: [
    GamePhase.WorldExploration,
    GamePhase.SocialHub,
    GamePhase.CardCombat,
    GamePhase.Syncing,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  // Leaving a duel always routes through Syncing: the server owns the result.
  [GamePhase.CardCombat]: [GamePhase.Syncing, GamePhase.Paused, GamePhase.Fault],
  [GamePhase.Market]: [
    GamePhase.WorldExploration,
    GamePhase.SocialHub,
    GamePhase.Syncing,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  [GamePhase.QuestDialog]: [
    GamePhase.WorldExploration,
    GamePhase.SocialHub,
    GamePhase.Paused,
    GamePhase.Fault,
  ],
  [GamePhase.Paused]: [
    GamePhase.WorldExploration,
    GamePhase.SocialHub,
    GamePhase.IdleGathering,
    GamePhase.Crafting,
    GamePhase.DeckBuilding,
    GamePhase.CardCombat,
    GamePhase.Market,
    GamePhase.QuestDialog,
    GamePhase.Syncing,
    GamePhase.Fault,
  ],
  [GamePhase.Fault]: [GamePhase.Loading, GamePhase.Syncing],
});
