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
  type SparringState,
  type GatheringSession,
  type Inventory,
} from '@alderfell/sim';
import {
  asId,
  ok,
  type ItemInstanceId,
  type ItemDefinitionId,
  type ItemInstance,
  type ItemStack,
  type NodeId,
  type NodeState,
  type PlayerId,
  QuestStatus,
  type QuestProgress,
  type Result,
  type Failure,
  type DiscoveryProgress,
  type DiaryRewardReceipt,
  type SkillId,
  type SkillProgress,
  type SaltwakeProgress,
  EMPTY_SALTWAKE_PROGRESS,
} from '@alderfell/shared';
import type { PlayerRecord } from '../persistence/repository.js';

/**
 * The Academy issues one basic tool for each gathering discipline.  Tools are
 * equipped rather than stored in the satchel, so a first gathering session is
 * always useful without consuming one of the player's material slots.
 *
 * These instance ids are deliberately stable: a save written before tools
 * shipped is backfilled on read, and that migration must not mint a different
 * copy every time the player reconnects.
 */
const STARTER_TOOLS: Readonly<Record<string, ItemInstance>> = {
  'skill.mining': {
    instanceId: asId<ItemInstanceId>('academy-starter-pick'),
    definitionId: 'item.tool.pick' as ItemDefinitionId,
    durability: 500,
    acquiredAtMs: 0,
  },
  'skill.foraging': {
    instanceId: asId<ItemInstanceId>('academy-starter-sickle'),
    definitionId: 'item.tool.sickle' as ItemDefinitionId,
    durability: 500,
    acquiredAtMs: 0,
  },
  'skill.forestry': {
    instanceId: asId<ItemInstanceId>('academy-starter-axe'),
    definitionId: 'item.tool.axe' as ItemDefinitionId,
    durability: 500,
    acquiredAtMs: 0,
  },
  'skill.fishing': {
    instanceId: asId<ItemInstanceId>('academy-starter-net'),
    definitionId: 'item.tool.net' as ItemDefinitionId,
    durability: 500,
    acquiredAtMs: 0,
  },
};

function starterTools(acquiredAtMs: number): Record<string, ItemInstance> {
  return Object.fromEntries(
    Object.entries(STARTER_TOOLS).map(([skillId, tool]) => [skillId, { ...tool, acquiredAtMs }]),
  );
}

export const PLAYER_SCHEMA_VERSION = 8;
/** Deliberately roomy, but still bounded so a malformed save cannot grow forever. */
export const BANK_SLOT_CAPACITY = 400;
export interface GravestoneState {
  readonly zoneId: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly stacks: readonly ItemStack[];
  readonly createdAtMs: number;
  /** Null means permanent, the launch rule. */
  readonly expiresAtMs: number | null;
}
export interface PlayerState {
  /** Authoritative reconnect destination. Room progress is deliberately separate. */
  readonly location: { readonly zoneId: string; readonly roomId: string };
  readonly saltwake: SaltwakeProgress;
  readonly inventory: Inventory;
  /** Secure resource storage, accessed only through a world bank chest. */
  readonly bank: Inventory;
  /** Per-account soft currency, earned from sales and spent on services. */
  readonly coins: number;
  /** Durable combat vitality; reconnecting never grants a free heal. */
  readonly hitpoints: {
    readonly current: number;
    readonly max: number;
    readonly respawnAtMs: number | null;
  };
  /** Progress per skill. Absent means untouched, which reads as level one. */
  readonly skills: Readonly<Record<string, SkillProgress>>;
  /** The tool equipped for each gathering skill, keyed by skill id. */
  readonly tools: Readonly<Record<string, ItemInstance>>;
  /** Depletion and regrowth per node, tracked per player rather than globally. */
  readonly nodes: Readonly<Record<string, NodeState>>;
  readonly gathering: GatheringSession | null;
  /** Per-player encounter snapshots survive reconnects and server restarts. */
  readonly combatTargets: Readonly<Record<string, SparringState>>;
  /** One durable grave holds every unprotected stack from the player's deaths. */
  readonly grave: GravestoneState | null;
  /** Every card the player has scribed. The collection, not the deck. */
  /** Accepted/completed quests. An absent id is available but not accepted. */
  readonly quests: Readonly<Record<string, QuestProgress>>;
  /** First-time discoveries, earned from confirmed gameplay events only. */
  readonly discoveries: Readonly<Record<string, DiscoveryProgress>>;
  /** Payment receipts only; diary completion is derived from discoveries. */
  readonly diaryRewards: Readonly<Record<string, DiaryRewardReceipt>>;
  /**
   * Last moment the player was demonstrably present.
   *
   * The gap between this and a reconnect is the window an offline claim covers.
   */
  readonly lastSeenAtMs: number;
}

export function createInitialState(slotCapacity: number, nowMs: number): PlayerState {
  return {
    location: { zoneId: 'zone.courtyard', roomId: 'wp.plaza.center' },
    saltwake: EMPTY_SALTWAKE_PROGRESS,
    inventory: createInventory(slotCapacity),
    bank: createInventory(BANK_SLOT_CAPACITY),
    coins: 0,
    hitpoints: { current: 10, max: 10, respawnAtMs: null },
    skills: {},
    tools: starterTools(nowMs),
    nodes: {},
    quests: {},
    discoveries: {},
    diaryRewards: {},
    gathering: null,
    combatTargets: {},
    grave: null,
    lastSeenAtMs: nowMs,
  };
}

export function skillProgress(state: PlayerState, skillId: SkillId): SkillProgress {
  return state.skills[skillId] ?? initialProgress();
}

const HITPOINTS_SKILL = asId<SkillId>('skill.hitpoints');
const BASE_HITPOINTS = 10;

/** Every Hitpoints level adds one durable maximum-health point above the level-one baseline. */
export function maximumHitpoints(skills: Readonly<Record<string, SkillProgress>>): number {
  return BASE_HITPOINTS + Math.max(0, (skills[HITPOINTS_SKILL]?.level ?? 1) - 1);
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

function readHitpoints(value: unknown): PlayerState['hitpoints'] {
  if (!isRecord(value)) return { current: 10, max: 10, respawnAtMs: null };
  const max = Math.max(1, Math.floor(readNumber(value.max, 10)));
  const current = Math.max(0, Math.min(max, Math.floor(readNumber(value.current, max))));
  return {
    current,
    max,
    respawnAtMs:
      typeof value.respawnAtMs === 'number' && Number.isFinite(value.respawnAtMs)
        ? Math.max(0, value.respawnAtMs)
        : null,
  };
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
  const legacyCombat = skills['skill.combat'];
  if (legacyCombat !== undefined) {
    // G3 replaces the temporary shared Combat skill with real combat skills.
    // Seed each missing replacement with the existing progress so an older
    // save keeps its effective combat level and earns no accidental reset.
    for (const id of ['skill.attack', 'skill.strength', 'skill.defence', 'skill.hitpoints']) {
      skills[id] ??= legacyCombat;
    }
    delete skills['skill.combat'];
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

function readCombatTargets(value: unknown): Record<string, SparringState> {
  if (!isRecord(value)) return {};
  const targets: Record<string, SparringState> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const maxHitpoints = Math.max(1, Math.floor(readNumber(raw.maxHitpoints, 0)));
    const hitpoints = Math.max(
      0,
      Math.min(maxHitpoints, Math.floor(readNumber(raw.hitpoints, maxHitpoints))),
    );
    const nextAttackAtMs = Math.max(0, readNumber(raw.nextAttackAtMs, 0));
    const respawnAtMs =
      typeof raw.respawnAtMs === 'number' && Number.isFinite(raw.respawnAtMs)
        ? Math.max(0, raw.respawnAtMs)
        : null;
    targets[id] = {
      hitpoints,
      maxHitpoints,
      nextAttackAtMs,
      respawnAtMs,
      defeats: Math.max(0, Math.floor(readNumber(raw.defeats, 0))),
    };
  }
  return targets;
}

function readGrave(value: unknown): GravestoneState | null {
  if (!isRecord(value) || !isRecord(value.position) || !Array.isArray(value.stacks)) return null;
  const x = readNumber(value.position.x, Number.NaN);
  const z = readNumber(value.position.z, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const stacks: ItemStack[] = [];
  for (const entry of value.stacks) {
    if (!isRecord(entry) || typeof entry.definitionId !== 'string') continue;
    const quantity = entry.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) continue;
    stacks.push({ definitionId: entry.definitionId as ItemDefinitionId, quantity });
  }
  if (stacks.length === 0) return null;
  return {
    zoneId: typeof value.zoneId === 'string' ? value.zoneId : 'zone.courtyard',
    position: { x, z },
    stacks,
    createdAtMs: Math.max(0, readNumber(value.createdAtMs, 0)),
    expiresAtMs:
      typeof value.expiresAtMs === 'number' && Number.isFinite(value.expiresAtMs)
        ? Math.max(0, value.expiresAtMs)
        : null,
  };
}

function readQuests(value: unknown): Record<string, QuestProgress> {
  if (!isRecord(value)) return {};
  const quests: Record<string, QuestProgress> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (
      !isRecord(raw) ||
      (raw.status !== QuestStatus.Active && raw.status !== QuestStatus.Completed)
    )
      continue;
    quests[id] = {
      status: raw.status,
      acceptedAtMs: Math.max(0, readNumber(raw.acceptedAtMs, 0)),
      completedAtMs:
        typeof raw.completedAtMs === 'number' && Number.isFinite(raw.completedAtMs)
          ? Math.max(0, raw.completedAtMs)
          : null,
      objectiveCounts: isRecord(raw.objectiveCounts)
        ? Object.fromEntries(
            Object.entries(raw.objectiveCounts)
              .filter(
                ([, count]) => typeof count === 'number' && Number.isInteger(count) && count >= 0,
              )
              .map(([id, count]) => [id, count as number]),
          )
        : {},
    };
  }
  return quests;
}

function readDiscoveries(value: unknown): Record<string, DiscoveryProgress> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, raw]) => isRecord(raw) && typeof raw.unlockedAtMs === 'number')
      .map(([id, raw]) => [
        id,
        {
          unlockedAtMs: Math.max(0, Math.floor((raw as Record<string, number>).unlockedAtMs ?? 0)),
        },
      ]),
  );
}

function readDiaryRewards(value: unknown): Record<string, DiaryRewardReceipt> {
  if (!isRecord(value)) return {};
  const receipts: Record<string, DiaryRewardReceipt> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw) || typeof raw.paidAtMs !== 'number' || !Number.isFinite(raw.paidAtMs))
      continue;
    receipts[id] = { paidAtMs: Math.max(0, Math.floor(raw.paidAtMs)) };
  }
  return receipts;
}

function readLocation(value: unknown): PlayerState['location'] {
  if (!isRecord(value) || typeof value.zoneId !== 'string' || typeof value.roomId !== 'string')
    return { zoneId: 'zone.courtyard', roomId: 'wp.plaza.center' };
  return { zoneId: value.zoneId, roomId: value.roomId };
}

function readSaltwake(value: unknown): SaltwakeProgress {
  if (!isRecord(value)) return EMPTY_SALTWAKE_PROGRESS;
  return {
    enteredAtMs:
      typeof value.enteredAtMs === 'number' && Number.isFinite(value.enteredAtMs)
        ? Math.max(0, value.enteredAtMs)
        : null,
    galleryCleared: value.galleryCleared === true,
    bossDefeated: value.bossDefeated === true,
    chestClaimed: value.chestClaimed === true,
    shortcutUnlocked: value.shortcutUnlocked === true,
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
  const skills = readSkills(data.skills);
  const persistedHitpoints = readHitpoints(data.hitpoints);
  const maxHitpoints = maximumHitpoints(skills);
  return ok({
    location: readLocation(data.location),
    saltwake: readSaltwake(data.saltwake),
    inventory: readInventory(data.inventory, slotCapacity),
    bank: readInventory(data.bank, BANK_SLOT_CAPACITY),
    coins: Math.max(0, Math.floor(readNumber(data.coins, 0))),
    hitpoints: {
      current: Math.min(persistedHitpoints.current, maxHitpoints),
      max: maxHitpoints,
      respawnAtMs: persistedHitpoints.respawnAtMs,
    },
    skills,
    // Merge rather than replace so every pre-tool save receives the Academy
    // kit while preserving any future upgraded equipment it already owns.
    tools: { ...starterTools(record.updatedAtMs), ...readTools(data.tools) },
    nodes: readNodes(data.nodes),
    quests: readQuests(data.quests),
    discoveries: readDiscoveries(data.discoveries),
    diaryRewards: readDiaryRewards(data.diaryRewards),
    gathering: readGathering(data.gathering),
    combatTargets: readCombatTargets(data.combatTargets),
    grave: readGrave(data.grave),
    lastSeenAtMs: readNumber(data.lastSeenAtMs, record.updatedAtMs),
  });
}

/** The blob to hand back to the repository. */
export function serialisePlayerState(state: PlayerState): Readonly<Record<string, unknown>> {
  return {
    location: state.location,
    saltwake: state.saltwake,
    inventory: { stacks: state.inventory.stacks, slotCapacity: state.inventory.slotCapacity },
    bank: { stacks: state.bank.stacks, slotCapacity: state.bank.slotCapacity },
    coins: state.coins,
    hitpoints: state.hitpoints,
    skills: state.skills,
    tools: state.tools,
    nodes: state.nodes,
    quests: state.quests,
    discoveries: state.discoveries,
    diaryRewards: state.diaryRewards,
    gathering: state.gathering,
    combatTargets: state.combatTargets,
    grave: state.grave,
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
