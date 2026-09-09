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
  /**
   * Length of one simulation tick.
   *
   * 600 ms, matching OSRS. The tick is a *simulation* property: it decides when
   * outcomes resolve, never how responsive the game looks. Input is
   * acknowledged on the frame it arrives and only resolved on the tick, so the
   * fix for "combat feels sluggish" is presentation work, not a shorter tick -
   * shortening it silently changes every ported combat formula.
   */
  readonly tickMs: number;
  /** Attack-roll and max-hit bonuses granted by the chosen attack style. */
  readonly accurateAccuracyBonus: number;
  readonly aggressiveMaxHitBonus: number;
  readonly defensiveDefenceBonus: number;
  /** Hitpoints XP earned per point of damage dealt, on top of the style skill. */
  readonly hitpointsXpPerDamage: number;
  /** Items kept on death; everything else goes to the gravestone. */
  readonly itemsKeptOnDeath: number;
  /**
   * How long a gravestone persists, in milliseconds.
   *
   * `null` means it never expires, which is the launch setting. A timer can be
   * turned on later without a code change. While it is null a player may die
   * again before recovering one, so there is exactly one gravestone per player
   * and a second death merges into it - nothing is ever destroyed by dying
   * twice.
   */
  readonly graveExpiryMs: number | null;
  /** Ticks a monster stays aggressive after losing sight of the player. */
  readonly aggressionMemoryTicks: number;
}

export interface EconomyTunables {
  /**
   * Coins charged to repair one point of tool durability.
   *
   * The primary coin sink, and the reason durability exists at all. Shops sell
   * utilities and services; they never sell gear or materials, because a player
   * who can buy past a production chain makes the chain decoration.
   */
  readonly toolRepairCostPerDurability: number;
  /** Fraction of an item's value a shop pays when buying it, in basis points. */
  readonly shopSellRateBasisPoints: number;
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
   * Collection may only reach this far past the last command. Beyond it the
   * time is simply not earned: there is no offline accrual, so a client that
   * closes for the night and sends one collect on waking is paid for the grace
   * window and nothing more.
   *
   * Generous relative to the client's collection poll, so an ordinary hitch in
   * a mobile connection never costs a player anything.
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
  /**
   * Half-extent of the visible world in metres along the shorter screen axis,
   * at the default zoom.
   *
   * The camera is orthographic, so this - not a distance - is what decides how
   * much of the world is on screen. Measured on the short axis so portrait and
   * landscape render at the same scale.
   */
  readonly cameraViewSize: number;
  readonly cameraMinViewSize: number;
  readonly cameraMaxViewSize: number;
  /**
   * How far back the camera sits. Purely a clipping concern under orthographic
   * projection: far enough that terrain never comes through the near plane.
   */
  readonly cameraBoomLength: number;
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
  /** Metres within which another player is reported as present. */
  readonly presenceRadius: number;
  /**
   * Most other players reported to one client.
   *
   * The radius is what makes a crowded courtyard affordable; this is what stops
   * everyone standing on one tile from undoing it.
   */
  readonly maxVisibleNeighbours: number;
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
  readonly economy: EconomyTunables;
  readonly progression: ProgressionTunables;
  readonly gathering: GatheringTunables;
  readonly crafting: CraftingTunables;
  readonly world: WorldTunables;
  readonly network: NetworkTunables;
}

export const DEFAULT_TUNABLES: Tunables = Object.freeze({
  // Bumped to 5 when the card game was cut: the card, grading and deck tunables
  // were removed and combat became tick-based. Per ADR-0002 the version travels
  // with every replay, so a result produced under one version is never silently
  // compared against another version's numbers.
  version: 5,
  combat: Object.freeze({
    tickMs: 600,
    accurateAccuracyBonus: 3,
    aggressiveMaxHitBonus: 3,
    defensiveDefenceBonus: 3,
    hitpointsXpPerDamage: 1,
    itemsKeptOnDeath: 3,
    // Never expires at launch. See CombatTunables.graveExpiryMs.
    graveExpiryMs: null,
    aggressionMemoryTicks: 16,
  }),
  economy: Object.freeze({
    toolRepairCostPerDurability: 2,
    // A shop pays a quarter of value: selling junk is a convenience that keeps
    // the bag clear, never a strategy that outpaces gathering.
    shopSellRateBasisPoints: 2_500,
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
    // The old close, shallow opening framed one oversized academy roof and
    // hid the paths, trees and landmarks that make the zone readable. Start
    // high enough to show a living district on a portrait phone.
    cameraViewSize: 13,
    cameraMinViewSize: 7,
    cameraMaxViewSize: 26,
    cameraBoomLength: 120,
    cameraHeight: 5.5,
    cameraSmoothing: 8,
    // A high isometric opening keeps the player, routes and landmarks in one
    // composition. The player can still drag down for a closer ground view.
    cameraMinPitch: 0.78,
    cameraMaxPitch: 1.2,
    npcDwellMinMs: 4_000,
    npcDwellMaxMs: 20_000,
    npcWalkSpeed: 1.5,
    worldDayLengthMs: 3_600_000,
    presenceRadius: 40,
    maxVisibleNeighbours: 24,
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
