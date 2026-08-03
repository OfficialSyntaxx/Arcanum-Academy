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
  /**
   * Narrowest the appraisal window may ever become.
   *
   * Without a meaningful floor the window collapses to a point and a master is
   * *guaranteed* the top grade, which would make every expert card a 10 and
   * leave serials certifying nothing. Skill past this point buys a higher
   * centre rather than more certainty - consistency is earned early, quality
   * for the rest of the curve.
   */
  readonly minVariance: number;
  readonly regradeMaxAttempts: number;
  /**
   * Grade never touches duel resolution (ADR 0004). It scales post-match
   * rewards instead, interpolated linearly from grade 1 to grade 10 between
   * `rewardMultiplierMinBasisPoints` and `rewardMultiplierMaxBasisPoints`.
   */
  readonly rewardMultiplierMinBasisPoints: number;
  readonly rewardMultiplierMaxBasisPoints: number;
  /**
   * Appraisal score a novice and a master are centred on, out of 100.
   *
   * The roll is `centre - variance/2 + rng(0, variance)`, clamped. Centring
   * rather than flooring is what lets a master reach grade 10 without being
   * guaranteed it, and keeps a novice's spread inside the low grades instead
   * of pinning them all at grade 1.
   */
  readonly noviceCentreScore: number;
  readonly masterCentreScore: number;
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
  /**
   * Share of the online rate earned while away, in basis points.
   *
   * Applied to the number of harvest ticks, not to the yield of each tick, so
   * a rare drop is exactly as rare offline as it is online - there are simply
   * fewer chances at it. Scaling the yield instead would quietly make rarity
   * itself depend on whether the app was open.
   */
  readonly offlineAccrualRateBasisPoints: number;
  readonly baseInventorySlots: number;
  readonly maxInventorySlots: number;
  /** Durability consumed per harvest tick by the equipped tool. */
  readonly toolDurabilityLossPerHarvest: number;
  /**
   * Yield multiplier while the equipped tool sits at zero durability.
   *
   * A worn tool reduces the next session rather than interrupting the current
   * one: an idle session set up before closing the app always runs to its cap.
   * Durability is a currency sink, never a silent halt to unattended progress.
   */
  readonly depletedToolYieldMultiplierBasisPoints: number;
  /**
   * How long after the last contact a player still counts as present.
   *
   * Online collection may only reach this far past the last command. Beyond it
   * the time is an absence, earnable at the offline rate through an explicit
   * claim and not before - otherwise a client could close for the night, send
   * one collect, and be paid the attended rate for all of it.
   *
   * Generous relative to the client's collection poll, so an ordinary hitch in
   * a mobile connection never costs a player the online rate.
   */
  readonly presenceGraceMs: number;
}

export interface CraftingTunables {
  readonly baseCraftDurationMs: number;
  readonly minCraftDurationMs: number;
  /** Floor on waste; skill reduces spoilage but never eliminates it. */
  readonly minWasteRateBasisPoints: number;
  /** Ceiling on the total reduction skill investment can buy. */
  readonly wasteReductionCapBasisPoints: number;
  readonly maxConcurrentCraftsPerStation: number;
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
  readonly crafting: CraftingTunables;
  readonly world: WorldTunables;
  readonly network: NetworkTunables;
}

export const DEFAULT_TUNABLES: Tunables = Object.freeze({
  // Bumped to 3 when grading gained its appraisal centres. Per ADR-0002 the
  // version travels with replays and with every graded card, so a grade rolled
  // under one version is never silently compared against another's odds.
  version: 3,
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
    // 60 narrowing by 1 a level to a floor of 24 reaches its narrowest around
    // level 37, so consistency is earned across a third of the curve rather
    // than in the first few levels.
    baseVariance: 60,
    varianceReductionPerSkillLevel: 1,
    minVariance: 24,
    regradeMaxAttempts: 2,
    rewardMultiplierMinBasisPoints: 10_000,
    rewardMultiplierMaxBasisPoints: 12_500,
    noviceCentreScore: 18,
    // 80 rather than the top of the scale: it places a master's window across
    // grades 8 to 10, so roughly half their work slabs and about one in eight
    // reaches a 10. A higher centre would make grade 10 routine and the slab
    // an expectation rather than an event.
    masterCentreScore: 80,
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
    // 25%: deliberately below the 50-60% an idle game would usually pay, at
    // the owner's direction, so that being present is meaningfully better than
    // being away without making absence feel punitive.
    offlineAccrualRateBasisPoints: 2_500,
    baseInventorySlots: 60,
    maxInventorySlots: 240,
    toolDurabilityLossPerHarvest: 1,
    depletedToolYieldMultiplierBasisPoints: 5_000,
    presenceGraceMs: 60_000,
  }),
  crafting: Object.freeze({
    baseCraftDurationMs: 6_000,
    minCraftDurationMs: 1_500,
    minWasteRateBasisPoints: 200,
    wasteReductionCapBasisPoints: 4_000,
    maxConcurrentCraftsPerStation: 1,
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
