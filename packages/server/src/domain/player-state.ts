/**
 * The shape of the blob the repository stores, and the rules for reading it.
 *
 * `PlayerRecord.data` is deliberately opaque to persistence: the domain owns
 * its meaning. That means this module is the only place that knows a stored
 * record is a player, and the only place that has to cope with one written by
 * an older build.
 *
 * Parsing is total. Anything unrecognised becomes a default rather than an
 * exception, because the alternative is a player who cannot log in because one
 * field of their save went strange. Losing a node's regrowth timer is
 * recoverable; locking someone out of their account is not.
 */

import {
  createInventory,
  initialProgress,
  type GatheringSession,
  type Inventory,
} from '@arcanum/sim';
import {
  ok,
  type ItemDefinitionId,
  type ItemInstance,
  type ItemStack,
  type NodeId,
  type NodeState,
  type PlayerId,
  type Result,
  type Failure,
  type SkillId,
  type SkillProgress,
} from '@arcanum/shared';
import type { PlayerRecord } from '../persistence/repository.js';

export const PLAYER_SCHEMA_VERSION = 1;

export interface PlayerState {
  readonly inventory: Inventory;
  /** Progress per skill. Absent means untouched, which reads as level one. */
  readonly skills: Readonly<Record<string, SkillProgress>>;
  /** The tool equipped for each gathering skill, keyed by skill id. */
  readonly tools: Readonly<Record<string, ItemInstance>>;
  /** Depletion and regrowth per node, tracked per player rather than globally. */
  readonly nodes: Readonly<Record<string, NodeState>>;
  readonly gathering: GatheringSession | null;
  /**
   * Last moment the player was demonstrably present.
   *
   * The gap between this and a reconnect is the window an offline claim covers.
   */
  readonly lastSeenAtMs: number;
}

export function createInitialState(slotCapacity: number, nowMs: number): PlayerState {
  return {
    inventory: createInventory(slotCapacity),
    skills: {},
    tools: {},
    nodes: {},
    gathering: null,
    lastSeenAtMs: nowMs,
  };
}

export function skillProgress(state: PlayerState, skillId: SkillId): SkillProgress {
  return state.skills[skillId] ?? initialProgress();
}

export function nodeState(state: PlayerState, nodeId: NodeId): NodeState {
  return state.nodes[nodeId] ?? { harvestsSinceRegen: 0, dormantUntilMs: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readInventory(value: unknown, slotCapacity: number): Inventory {
  if (!isRecord(value) || !Array.isArray(value.stacks)) return createInventory(slotCapacity);
  const stacks: ItemStack[] = [];
  for (const entry of value.stacks) {
    if (!isRecord(entry)) continue;
    const definitionId = entry.definitionId;
    const quantity = entry.quantity;
    if (typeof definitionId !== 'string') continue;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) continue;
    stacks.push({ definitionId: definitionId as ItemDefinitionId, quantity });
  }
  return { stacks, slotCapacity: readNumber(value.slotCapacity, slotCapacity) };
}

function readSkills(value: unknown): Record<string, SkillProgress> {
  if (!isRecord(value)) return {};
  const skills: Record<string, SkillProgress> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const level = readNumber(raw.level, 1);
    const xp = readNumber(raw.xp, 0);
    skills[id] = { level: Math.max(1, Math.floor(level)), xp: Math.max(0, Math.floor(xp)) };
  }
  return skills;
}

function readTools(value: unknown): Record<string, ItemInstance> {
  if (!isRecord(value)) return {};
  const tools: Record<string, ItemInstance> = {};
  for (const [skillId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const { instanceId, definitionId } = raw;
    if (typeof instanceId !== 'string' || typeof definitionId !== 'string') continue;
    tools[skillId] = {
      instanceId: instanceId as ItemInstance['instanceId'],
      definitionId: definitionId as ItemDefinitionId,
      durability: Math.max(0, Math.floor(readNumber(raw.durability, 0))),
      acquiredAtMs: readNumber(raw.acquiredAtMs, 0),
    };
  }
  return tools;
}

function readNodes(value: unknown): Record<string, NodeState> {
  if (!isRecord(value)) return {};
  const nodes: Record<string, NodeState> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const dormant = raw.dormantUntilMs;
    nodes[id] = {
      harvestsSinceRegen: Math.max(0, Math.floor(readNumber(raw.harvestsSinceRegen, 0))),
      dormantUntilMs: typeof dormant === 'number' && Number.isFinite(dormant) ? dormant : null,
    };
  }
  return nodes;
}

function readGathering(value: unknown): GatheringSession | null {
  if (!isRecord(value)) return null;
  const { nodeId, rngState } = value;
  if (typeof nodeId !== 'string' || !isRecord(rngState)) return null;
  const parts = ['s0', 's1', 's2', 's3'].map((key) => readNumber(rngState[key], 0));
  // An all-zero generator state is the algorithm's fixed point and would return
  // the same draw forever. Treat it as no session rather than a stuck one.
  if (parts.every((part) => part === 0)) return null;
  return {
    nodeId: nodeId as NodeId,
    rngState: { s0: parts[0]!, s1: parts[1]!, s2: parts[2]!, s3: parts[3]! },
    ticksResolved: Math.max(0, Math.floor(readNumber(value.ticksResolved, 0))),
    resolvedThroughMs: readNumber(value.resolvedThroughMs, 0),
  };
}

/**
 * Reads a stored record into player state.
 *
 * Returns a `Result` for symmetry with the rest of the domain even though it
 * cannot currently fail; when a future schema version needs a migration that
 * genuinely can fail, callers will already be handling it.
 */
export function parsePlayerState(
  record: PlayerRecord,
  slotCapacity: number,
): Result<PlayerState, Failure> {
  const data = record.data;
  return ok({
    inventory: readInventory(data.inventory, slotCapacity),
    skills: readSkills(data.skills),
    tools: readTools(data.tools),
    nodes: readNodes(data.nodes),
    gathering: readGathering(data.gathering),
    lastSeenAtMs: readNumber(data.lastSeenAtMs, record.updatedAtMs),
  });
}

/** The blob to hand back to the repository. */
export function serialisePlayerState(state: PlayerState): Readonly<Record<string, unknown>> {
  return {
    inventory: { stacks: state.inventory.stacks, slotCapacity: state.inventory.slotCapacity },
    skills: state.skills,
    tools: state.tools,
    nodes: state.nodes,
    gathering: state.gathering,
    lastSeenAtMs: state.lastSeenAtMs,
  };
}

export function emptyRecord(
  playerId: PlayerId,
  state: PlayerState,
): Omit<PlayerRecord, 'version' | 'updatedAtMs'> {
  return {
    playerId,
    schemaVersion: PLAYER_SCHEMA_VERSION,
    data: serialisePlayerState(state),
  };
}
