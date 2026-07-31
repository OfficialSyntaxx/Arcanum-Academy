/**
 * Balance tunables.
 *
 * Every number a designer might want to change lives here, versioned and frozen.
 * Gameplay code reads tunables through the `Tunables` type; it never hardcodes a
 * literal. This makes balance changes a data change (shippable without a client
 * release, once the remote-config service lands in Phase 7) and makes replay
 * verification exact: a match replay records `tunablesVersion` and is only valid
 * against that version.
 */

export interface CombatTunables {
  readonly deckSize: number;
  readonly maxCopiesPerSpell: number;
  readonly openingHandSize: number;
  readonly cardsDrawnPerTurn: number;
  readonly startingResonance: number;
  readonly maxResonance: number;
  readonly resonanceGainPerTurn: number;
  readonly turnTimerMs: number;
  /** Grace window added to the server-side timer to absorb network jitter. */
  readonly turnTimerNetworkGraceMs: number;
  readonly maxTurnsBeforeDraw: number;
  readonly startingLife: number;
  readonly maxHandSize: number;
  readonly maxBoardSlots: number;
}

export interface GradingTunables {
  /** Inclusive upper bound of each grade band, indexed by grade 1..10. */
  readonly minGrade: number;
  readonly maxGrade: number;
  readonly slabThreshold: number;
  /** Appraisal roll is `skillFloor + rng(0, variance)`; both scale with skill. */
  readonly baseVariance: number;
  readonly varianceReductionPerSkillLevel: number;
  readonly regradeMaxAttempts: number;
}

export interface EconomyTunables {
  readonly marketListingTaxBasisPoints: number;
  readonly marketMaxActiveListings: number;
  readonly marketListingDurationMs: number;
  readonly gradingFeeBase: number;
  readonly slabCertificationFee: number;
  readonly deckRegistrationFee: number;
  /** Hard cap on soft currency to bound integer arithmetic and exploit blast radius. */
  readonly currencyCap: number;
}

export interface ProgressionTunables {
  readonly maxSkillLevel: number;
  readonly maxAccountLevel: number;
  /** XP required for level n is `xpCurveBase * n^xpCurveExponent`, rounded down. */
  readonly xpCurveBase: number;
  readonly xpCurveExponent: number;
}

export interface GatheringTunables {
  readonly baseHarvestIntervalMs: number;
  readonly minHarvestIntervalMs: number;
  /** Offline accrual is capped so idle progression cannot replace play sessions. */
  readonly offlineAccrualCapMs: number;
  readonly baseInventorySlots: number;
  readonly maxInventorySlots: number;
}

export interface NetworkTunables {
  readonly simulationTickHz: number;
  readonly hubPresenceBroadcastHz: number;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly reconnectBaseDelayMs: number;
  readonly reconnectMaxDelayMs: number;
  readonly sessionResumeWindowMs: number;
  readonly maxCommandsPerSecond: number;
}

export interface Tunables {
  readonly version: number;
  readonly combat: CombatTunables;
  readonly grading: GradingTunables;
  readonly economy: EconomyTunables;
  readonly progression: ProgressionTunables;
  readonly gathering: GatheringTunables;
  readonly network: NetworkTunables;
}

export const DEFAULT_TUNABLES: Tunables = Object.freeze({
  version: 1,
  combat: Object.freeze({
    deckSize: 20,
    maxCopiesPerSpell: 3,
    openingHandSize: 5,
    cardsDrawnPerTurn: 1,
    startingResonance: 1,
    maxResonance: 10,
    resonanceGainPerTurn: 1,
    turnTimerMs: 30_000,
    turnTimerNetworkGraceMs: 3_000,
    maxTurnsBeforeDraw: 60,
    startingLife: 30,
    maxHandSize: 10,
    maxBoardSlots: 5,
  }),
  grading: Object.freeze({
    minGrade: 1,
    maxGrade: 10,
    slabThreshold: 9,
    baseVariance: 40,
    varianceReductionPerSkillLevel: 3,
    regradeMaxAttempts: 2,
  }),
  economy: Object.freeze({
    marketListingTaxBasisPoints: 500,
    marketMaxActiveListings: 20,
    marketListingDurationMs: 172_800_000,
    gradingFeeBase: 250,
    slabCertificationFee: 2_000,
    deckRegistrationFee: 100,
    currencyCap: 2_000_000_000,
  }),
  progression: Object.freeze({
    maxSkillLevel: 99,
    maxAccountLevel: 120,
    xpCurveBase: 60,
    xpCurveExponent: 2.2,
  }),
  gathering: Object.freeze({
    baseHarvestIntervalMs: 3_000,
    minHarvestIntervalMs: 900,
    offlineAccrualCapMs: 28_800_000,
    baseInventorySlots: 60,
    maxInventorySlots: 240,
  }),
  network: Object.freeze({
    simulationTickHz: 20,
    hubPresenceBroadcastHz: 8,
    heartbeatIntervalMs: 5_000,
    heartbeatTimeoutMs: 15_000,
    reconnectBaseDelayMs: 500,
    reconnectMaxDelayMs: 15_000,
    sessionResumeWindowMs: 120_000,
    maxCommandsPerSecond: 30,
  }),
});
