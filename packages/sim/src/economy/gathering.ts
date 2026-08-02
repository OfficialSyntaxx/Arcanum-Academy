/**
 * Harvest resolution.
 *
 * A gathering session is a seed and a tick count, never a list of rolled
 * results. Given the same seed and the same number of ticks, this produces the
 * identical yield on the client predicting it and the server confirming it -
 * which is what lets the client show a harvest immediately without the server
 * having to trust it.
 *
 * Time is a parameter, never read from a clock. The offline claim resolves the
 * same code over a window that has already passed, so "now" has to be supplied
 * rather than observed.
 */

import {
  Rng,
  type GatheringTunables,
  type ItemCatalog,
  type ItemDefinitionId,
  type NodeDefinition,
  type NodeState,
  type NodeId,
  type RngState,
} from '@arcanum/shared';
import { addItems, spaceFor, type Inventory } from './inventory.js';

/** Basis points are integers out of 10000; 2500 is a quarter. */
const BASIS_POINTS = 10_000;

export const HarvestMode = {
  /** The player is connected and watching. */
  Online: 'ONLINE',
  /** Accrued while away, at a reduced share of the online rate. */
  Offline: 'OFFLINE',
} as const;
export type HarvestMode = (typeof HarvestMode)[keyof typeof HarvestMode];

export interface GatheringSession {
  readonly nodeId: NodeId;
  /** Serialised generator state; the session resumes exactly where it stopped. */
  readonly rngState: RngState;
  readonly ticksResolved: number;
  /** Wall clock of the last tick already accounted for. */
  readonly resolvedThroughMs: number;
}

export interface HarvestYield {
  readonly itemId: ItemDefinitionId;
  readonly quantity: number;
}

export interface EquippedTool {
  readonly durability: number;
  readonly yieldMultiplierBasisPoints: number;
}

export interface HarvestOutcome {
  readonly session: GatheringSession;
  readonly inventory: Inventory;
  readonly nodeState: NodeState;
  /** Yields merged per item, in first-seen order. */
  readonly yields: readonly HarvestYield[];
  readonly xpGained: number;
  readonly durabilitySpent: number;
  readonly ticksResolved: number;
  /**
   * True when the bag filled and some yield was dropped.
   *
   * The session is not stopped by a full bag. Halting unattended progress is
   * the pattern tool durability was explicitly designed to avoid, and a full
   * inventory is no better a reason for it than a worn pick.
   */
  readonly overflowed: boolean;
}

export function startSession(nodeId: NodeId, seed: string, startedAtMs: number): GatheringSession {
  return {
    nodeId,
    rngState: Rng.fromSeed(seed).getState(),
    ticksResolved: 0,
    resolvedThroughMs: startedAtMs,
  };
}

/**
 * Milliseconds between harvests in a given mode.
 *
 * The offline share is applied by stretching the interval rather than by
 * shrinking each yield. Both would produce "25% of the online rate", but only
 * this one leaves a rare drop exactly as rare offline as online - there are
 * simply fewer chances at it. Scaling yields would have made rarity itself
 * depend on whether the app was open.
 */
export function harvestIntervalMs(
  node: NodeDefinition,
  mode: HarvestMode,
  tunables: GatheringTunables,
): number {
  const base = Math.max(node.harvestIntervalMs, tunables.minHarvestIntervalMs);
  if (mode === HarvestMode.Online) return base;
  return Math.ceil((base * BASIS_POINTS) / tunables.offlineAccrualRateBasisPoints);
}

/**
 * Scales a quantity by basis points without losing the remainder to rounding.
 *
 * A flat floor would make a 20% tool bonus worth nothing at all on a drop of
 * one, which is most drops. The fractional part becomes a weighted chance of
 * one extra, so the bonus is exact on average and still an integer every time.
 * The draw is taken from the session generator, so it stays reproducible.
 */
function scaleQuantity(quantity: number, basisPoints: number, rng: Rng): number {
  const scaled = quantity * basisPoints;
  const whole = Math.floor(scaled / BASIS_POINTS);
  const remainder = scaled % BASIS_POINTS;
  if (remainder === 0) return whole;
  return rng.nextInt(0, BASIS_POINTS - 1) < remainder ? whole + 1 : whole;
}

export interface ResolveHarvestOptions {
  readonly session: GatheringSession;
  readonly node: NodeDefinition;
  readonly nodeState: NodeState;
  readonly inventory: Inventory;
  readonly catalog: ItemCatalog;
  readonly tunables: GatheringTunables;
  readonly mode: HarvestMode;
  /** Wall clock to resolve up to. Ticks after this are left for next time. */
  readonly nowMs: number;
  /** Absent when nothing is equipped, which is allowed but slower. */
  readonly tool: EquippedTool | null;
}

/**
 * Advances a session to `nowMs`, applying every whole tick that has come due.
 *
 * Node depletion and regeneration are evaluated against each tick's own
 * timestamp rather than the end of the window. Over a long offline claim a node
 * can deplete, sit dormant, come back and be worked again - resolving against
 * the final moment would either grant all of it or none.
 */
export function resolveHarvest(options: ResolveHarvestOptions): HarvestOutcome {
  const { session, node, inventory, catalog, tunables, mode, nowMs, tool } = options;

  const interval = harvestIntervalMs(node, mode, tunables);
  const elapsed = Math.max(0, nowMs - session.resolvedThroughMs);
  const window =
    mode === HarvestMode.Offline ? Math.min(elapsed, tunables.offlineAccrualCapMs) : elapsed;
  const dueTicks = Math.floor(window / interval);

  if (dueTicks === 0) {
    return {
      session,
      inventory,
      nodeState: options.nodeState,
      yields: [],
      xpGained: 0,
      durabilitySpent: 0,
      ticksResolved: 0,
      overflowed: false,
    };
  }

  const rng = new Rng(session.rngState);
  const weights = node.dropTable.map((entry) => entry.weight);
  const merged = new Map<ItemDefinitionId, number>();

  let bag = inventory;
  let harvests = options.nodeState.harvestsSinceRegen;
  let dormantUntilMs = options.nodeState.dormantUntilMs;
  let durabilityLeft = tool?.durability ?? 0;
  let durabilitySpent = 0;
  let xpGained = 0;
  let overflowed = false;
  let resolved = 0;

  for (let tick = 1; tick <= dueTicks; tick += 1) {
    const tickAtMs = session.resolvedThroughMs + tick * interval;
    resolved += 1;

    // A dormant node yields nothing until it has regrown. The tick still
    // passes, which is what lets a long window cover a full regeneration.
    if (dormantUntilMs !== null) {
      if (tickAtMs < dormantUntilMs) continue;
      dormantUntilMs = null;
      harvests = 0;
    }

    const index = rng.weightedIndex(weights);
    const entry = node.dropTable[index];
    if (entry === undefined) continue;

    const rolled = rng.nextInt(entry.minQuantity, entry.maxQuantity);
    // A worn tool reduces the next session's take rather than halting this one.
    const multiplier =
      tool === null
        ? BASIS_POINTS
        : durabilityLeft > 0
          ? tool.yieldMultiplierBasisPoints
          : tunables.depletedToolYieldMultiplierBasisPoints;
    const quantity = scaleQuantity(rolled, multiplier, rng);

    if (durabilityLeft > 0) {
      const spent = Math.min(durabilityLeft, tunables.toolDurabilityLossPerHarvest);
      durabilityLeft -= spent;
      durabilitySpent += spent;
    }

    // Experience is earned for the work, not for what the bag could hold, so a
    // full inventory costs the materials and not the progress.
    xpGained += node.xpPerHarvest;

    harvests += 1;
    if (harvests >= node.depletionHarvests) {
      dormantUntilMs = tickAtMs + node.regenerationMs;
    }

    if (quantity <= 0) continue;

    const room = spaceFor(bag, entry.itemId, catalog);
    const storable = Math.min(quantity, room);
    if (storable < quantity) overflowed = true;
    if (storable <= 0) continue;

    const added = addItems(bag, entry.itemId, storable, catalog);
    // spaceFor was just consulted, so this cannot fail for lack of room; an
    // unknown item is filtered out by content validation long before here.
    if (!added.ok) {
      overflowed = true;
      continue;
    }
    bag = added.value;
    merged.set(entry.itemId, (merged.get(entry.itemId) ?? 0) + storable);
  }

  return {
    session: {
      ...session,
      rngState: rng.getState(),
      ticksResolved: session.ticksResolved + resolved,
      resolvedThroughMs: session.resolvedThroughMs + resolved * interval,
    },
    inventory: bag,
    nodeState: { harvestsSinceRegen: harvests, dormantUntilMs },
    yields: [...merged].map(([itemId, quantity]) => ({ itemId, quantity })),
    xpGained,
    durabilitySpent,
    ticksResolved: resolved,
    overflowed,
  };
}
