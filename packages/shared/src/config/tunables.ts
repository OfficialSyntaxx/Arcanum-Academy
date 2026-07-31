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
  /**
   * Grade never touches duel resolution (ADR 0004). It scales post-match
   * rewards instead, interpolated linearly from grade 1 to grade 10 between
   * `rewardMultiplierMinBasisPoints` and `rewardMultiplierMaxBasisPoints`.
   */
  readonly rewardMultiplierMinBasisPoints: number;
  readonly rewardMultiplierMaxBasisPoints: number;
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

export interface WorldTunables {
  /** Metres per second at full joystick deflection, before modifiers. */
  readonly playerWalkSpeed: number;
  readonly playerRunSpeed: number;
  /** Radians per second the avatar may turn; caps visual snapping. */
  readonly playerTurnRate: number;
  /** Distance at which a tap-to-move path node counts as reached. */
  readonly waypointArrivalRadius: number;
  /** Distance within which an interactable shows its prompt. */
  readonly interactionRadius: number;
  readonly cameraFollowDistance: number;
  readonly cameraMinDistance: number;
  readonly cameraMaxDistance: number;
  readonly cameraHeight: number;
  /** Fraction of the gap closed per second by the camera's smoothing. */
  readonly cameraSmoothing: number;
  readonly cameraMinPitch: number;
  readonly cameraMaxPitch: number;
  /** Ambient NPC pause range at a schedule destination, in milliseconds. */
  readonly npcDwellMinMs: number;
  readonly npcDwellMaxMs: number;
  readonly npcWalkSpeed: number;
  /** Real milliseconds per in-world day. Drives NPC schedules and lighting. */
  readonly worldDayLengthMs: number;
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
  readonly world: WorldTunables;
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
    rewardMultiplierMinBasisPoints: 10_000,
    rewardMultiplierMaxBasisPoints: 12_500,
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
  world: Object.freeze({
    playerWalkSpeed: 2.6,
    playerRunSpeed: 4.4,
    playerTurnRate: 9,
    waypointArrivalRadius: 0.35,
    interactionRadius: 2.2,
    cameraFollowDistance: 9,
    cameraMinDistance: 5,
    cameraMaxDistance: 15,
    cameraHeight: 5.5,
    cameraSmoothing: 8,
    cameraMinPitch: 0.18,
    cameraMaxPitch: 1.15,
    npcDwellMinMs: 4_000,
    npcDwellMaxMs: 20_000,
    npcWalkSpeed: 1.5,
    worldDayLengthMs: 3_600_000,
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
