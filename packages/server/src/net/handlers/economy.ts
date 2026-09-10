/**
 * Gathering and crafting commands.
 *
 * Every handler is the same shape: validate the payload, load the player, run
 * a rule from `@alderfell/sim`, and return either the authoritative state to
 * patch or a `Failure` the client can explain. The rules themselves live in
 * `sim` so the client runs identical logic when predicting - these handlers
 * add only the things a prediction cannot have: the real clock, the stored
 * state, and the last word.
 *
 * Returning the whole of the touched state rather than a delta is deliberate
 * while the state is this small. A patch a client can apply wrongly is worse
 * than one it cannot, and correctness here is worth more than the bytes.
 */

import {
  addItems,
  assertCanCraft,
  assertCanWork,
  awardXp,
  quantityOf,
  removeItems,
  resolveCraft,
  resolveHarvest,
  startSession,
  type HarvestOutcome,
} from '@alderfell/sim';
import {
  err,
  failure,
  FailureCode,
  ItemCategory,
  ok,
  Rng,
  type Failure,
  type InteractableId,
  type ItemCatalog,
  type NodeCatalog,
  type NodeDefinition,
  type RecipeBook,
  type RecipeId,
  type Result,
  type SkillId,
  type SkillTable,
  type Tunables,
} from '@alderfell/shared';
import type { Session } from '../../session/session-store.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import { nodeState, skillProgress, type PlayerState } from '../../domain/player-state.js';
import type { Mutation, PlayerService } from '../../domain/player-service.js';

/**
 * The content these handlers rule against.
 *
 * Injected rather than imported so the composition root stays the only place
 * that decides which content is live, and so a test can drive a rule with
 * content built for it. Reaching for the shipped catalogs from in here would
 * make the skill gate, for one, untestable without shipping a node nobody can
 * reach.
 */
export interface EconomyCatalogs {
  readonly items: ItemCatalog;
  readonly nodes: NodeCatalog;
  readonly recipes: RecipeBook;
  readonly skills: SkillTable;
}

export interface EconomyHandlerOptions {
  readonly players: PlayerService;
  readonly catalogs: EconomyCatalogs;
  readonly tunables: Tunables;
  readonly now: () => number;
}

function invalid(reason: string, detail: string): Failure {
  return failure(FailureCode.Validation, reason, { detail });
}

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPositiveInteger(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** The public shape of player state, safe to send and simple to apply. */
function project(state: PlayerState) {
  return {
    inventory: { stacks: state.inventory.stacks, slotCapacity: state.inventory.slotCapacity },
    bank: { stacks: state.bank.stacks, slotCapacity: state.bank.slotCapacity },
    coins: state.coins,
    skills: state.skills,
    tools: state.tools,
    gathering: state.gathering,
  };
}

function harvestPatch(state: PlayerState, outcome: HarvestOutcome) {
  return {
    ...project(state),
    yields: outcome.yields,
    xpGained: outcome.xpGained,
    ticksResolved: outcome.ticksResolved,
    overflowed: outcome.overflowed,
  };
}

/**
 * Applies a resolved harvest to player state.
 *
 * Shared by the online collection and the offline claim because they differ
 * only in which rate they resolve at - duplicating the bookkeeping would be a
 * standing invitation for the two to drift apart.
 */
function applyHarvest(
  state: PlayerState,
  node: NodeDefinition,
  outcome: HarvestOutcome,
  catalogs: EconomyCatalogs,
  tunables: Tunables,
  nowMs: number,
): PlayerState {
  const skillId = node.requiredSkillId;
  const award = awardXp(
    skillProgress(state, skillId),
    outcome.xpGained,
    tunables.progression,
    catalogs.skills.get(skillId),
  );

  const tools = { ...state.tools };
  const equipped = tools[skillId];
  if (equipped !== undefined && outcome.durabilitySpent > 0) {
    tools[skillId] = {
      ...equipped,
      durability: Math.max(0, equipped.durability - outcome.durabilitySpent),
    };
  }

  return {
    ...state,
    inventory: outcome.inventory,
    skills: { ...state.skills, [skillId]: award.progress },
    tools,
    nodes: { ...state.nodes, [node.id]: outcome.nodeState },
    gathering: outcome.session,
    lastSeenAtMs: nowMs,
  };
}

function equippedTool(state: PlayerState, skillId: SkillId, catalogs: EconomyCatalogs) {
  const instance = state.tools[skillId];
  if (instance === undefined) return null;
  const definition = catalogs.items.get(instance.definitionId);
  if (definition?.tool === undefined) return null;
  return {
    durability: instance.durability,
    yieldMultiplierBasisPoints: definition.tool.yieldMultiplierBasisPoints,
  };
}

function resolveActive(
  state: PlayerState,
  catalogs: EconomyCatalogs,
  tunables: Tunables,
  nowMs: number,
): Result<{ node: NodeDefinition; outcome: HarvestOutcome }, Failure> {
  const session = state.gathering;
  if (session === null) {
    return err(invalid('gathering.not_active', 'no gathering session is running'));
  }
  const node = catalogs.nodes.get(session.nodeId);
  if (node === undefined) {
    // The session names a node that content no longer defines. That is a
    // content change under a live session, not player error.
    return err(
      failure(FailureCode.NotFound, 'gathering.node_retired', {
        detail: 'the node this session was working no longer exists',
        context: { nodeId: session.nodeId },
      }),
    );
  }
  return ok({
    node,
    outcome: resolveHarvest({
      session,
      node,
      nodeState: nodeState(state, node.id),
      inventory: state.inventory,
      catalog: catalogs.items,
      tunables: tunables.gathering,
      nowMs,
      tool: equippedTool(state, node.requiredSkillId, catalogs),
    }),
  });
}

export function registerEconomyHandlers(
  router: RegistryCommandRouter,
  options: EconomyHandlerOptions,
): void {
  const { players, catalogs, tunables, now } = options;

  const start: CommandHandler = async (session: Session, payload: unknown) => {
    const interactableId = readString(payload, 'interactableId');
    if (interactableId === null) {
      return err(invalid('gathering.interactable_missing', 'interactableId is required'));
    }
    const node = catalogs.nodes.byInteractable(interactableId as InteractableId);
    if (node === undefined) {
      return err(
        failure(FailureCode.NotFound, 'gathering.not_a_node', {
          detail: 'nothing is gathered at that interactable',
          context: { interactableId },
        }),
      );
    }

    const nowMs = now();
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const allowed = assertCanWork(node, skillProgress(state, node.requiredSkillId).level);
      if (!allowed.ok) return err(allowed.error);

      const dormant = nodeState(state, node.id).dormantUntilMs;
      if (dormant !== null && nowMs < dormant) {
        return err(
          failure(FailureCode.Conflict, 'gathering.node_dormant', {
            detail: 'the node is still regrowing',
            context: { nodeId: node.id, readyAtMs: dormant },
          }),
        );
      }

      // The seed binds the session to this player, node and moment, so two
      // players working the same node never share a sequence of drops.
      const seed = `${session.playerId}:${node.id}:${nowMs}`;
      const next: PlayerState = {
        ...state,
        gathering: startSession(node.id, seed, nowMs),
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(next) });
    });
  };

  const collect: CommandHandler = async (session: Session) => {
    const nowMs = now();
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      // Online collection reaches only as far as the player was demonstrably
      // present. The ledger is the session's resolvedThroughMs, so whatever
      // this leaves behind stays available to the offline claim rather than
      // being lost - and cannot be taken at the attended rate by asking again.
      const presentUntilMs = Math.min(
        nowMs,
        state.lastSeenAtMs + tunables.gathering.presenceGraceMs,
      );
      const resolved = resolveActive(state, catalogs, tunables, presentUntilMs);
      if (!resolved.ok) return err(resolved.error);
      const next = applyHarvest(
        state,
        resolved.value.node,
        resolved.value.outcome,
        catalogs,
        tunables,
        nowMs,
      );
      return ok({ state: next, value: harvestPatch(next, resolved.value.outcome) });
    });
  };
  const stop: CommandHandler = async (session: Session) => {
    const nowMs = now();
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      // Stopping settles what was earned first, so ending a session never
      // discards the ticks that ran since the last collection. It settles only
      // the attended portion, for the same reason collect does.
      const presentUntilMs = Math.min(
        nowMs,
        state.lastSeenAtMs + tunables.gathering.presenceGraceMs,
      );
      const resolved = resolveActive(state, catalogs, tunables, presentUntilMs);
      if (!resolved.ok) return err(resolved.error);
      const settled = applyHarvest(
        state,
        resolved.value.node,
        resolved.value.outcome,
        catalogs,
        tunables,
        nowMs,
      );
      const next: PlayerState = { ...settled, gathering: null };
      return ok({ state: next, value: harvestPatch(next, resolved.value.outcome) });
    });
  };

  const craft: CommandHandler = async (session: Session, payload: unknown) => {
    const recipeId = readString(payload, 'recipeId');
    if (recipeId === null) {
      return err(invalid('crafting.recipe_missing', 'recipeId is required'));
    }
    const recipe = catalogs.recipes.get(recipeId as RecipeId);
    if (recipe === undefined) {
      return err(
        failure(FailureCode.NotFound, 'crafting.unknown_recipe', { context: { recipeId } }),
      );
    }

    const nowMs = now();
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const level = skillProgress(state, recipe.requiredSkillId).level;
      const allowed = assertCanCraft(recipe, level, state.inventory);
      if (!allowed.ok) return err(allowed.error);

      // Seeded per craft so the outcome is reproducible from the command log
      // without carrying a generator across commands that may never come.
      const outcome = resolveCraft({
        recipe,
        skillLevel: level,
        inventory: state.inventory,
        catalog: catalogs.items,
        tunables: tunables.crafting,
        rng: Rng.fromSeed(`${session.playerId}:${recipe.id}:${nowMs}`),
      });
      if (!outcome.ok) return err(outcome.error);

      const award = awardXp(
        skillProgress(state, recipe.requiredSkillId),
        outcome.value.xpGained,
        tunables.progression,
        catalogs.skills.get(recipe.requiredSkillId),
      );
      const next: PlayerState = {
        ...state,
        inventory: outcome.value.inventory,
        skills: { ...state.skills, [recipe.requiredSkillId]: award.progress },
        lastSeenAtMs: nowMs,
      };
      return ok({
        state: next,
        value: {
          ...project(next),
          produced: outcome.value.produced,
          wasted: outcome.value.wasted,
          xpGained: outcome.value.xpGained,
          unlocked: award.unlocked,
        },
      });
    });
  };
  const moveBankItem =
    (direction: 'deposit' | 'withdraw'): CommandHandler =>
    async (session: Session, payload: unknown) => {
      const itemId = readString(payload, 'itemId');
      const quantity = readPositiveInteger(payload, 'quantity');
      if (itemId === null || quantity === null) {
        return err(
          invalid('bank.item_or_quantity_missing', 'itemId and a positive quantity are required'),
        );
      }
      const definition = catalogs.items.get(itemId as never);
      if (definition === undefined) {
        return err(failure(FailureCode.NotFound, 'bank.unknown_item', { context: { itemId } }));
      }

      return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
        const from = direction === 'deposit' ? state.inventory : state.bank;
        const to = direction === 'deposit' ? state.bank : state.inventory;
        const held = quantityOf(from, definition.id);
        if (held < quantity) {
          return err(
            failure(FailureCode.Conflict, 'bank.insufficient_items', {
              context: { itemId, quantity, held },
            }),
          );
        }
        const removed = removeItems(from, definition.id, quantity);
        if (!removed.ok) return err(removed.error);
        const added = addItems(to, definition.id, quantity, catalogs.items);
        if (!added.ok) return err(added.error);
        const next: PlayerState =
          direction === 'deposit'
            ? { ...state, inventory: removed.value, bank: added.value }
            : { ...state, bank: removed.value, inventory: added.value };
        return ok({ state: next, value: project(next) });
      });
    };
  const sell: CommandHandler = async (session: Session, payload: unknown) => {
    const itemId = readString(payload, 'itemId');
    const quantity = readPositiveInteger(payload, 'quantity');
    if (itemId === null || quantity === null) {
      return err(
        invalid('merchant.item_or_quantity_missing', 'itemId and a positive quantity are required'),
      );
    }
    const definition = catalogs.items.get(itemId as never);
    if (definition === undefined)
      return err(failure(FailureCode.NotFound, 'merchant.unknown_item'));
    if (definition.category !== ItemCategory.Material) {
      return err(invalid('merchant.unsellable_item', 'only gathered materials can be sold'));
    }
    const coins = Math.floor(
      (definition.baseValue * quantity * tunables.economy.shopSellRateBasisPoints) / 10_000,
    );
    if (coins < 1) return err(invalid('merchant.value_too_low', 'this quantity has no sale value'));
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const removed = removeItems(state.inventory, definition.id, quantity);
      if (!removed.ok) return err(removed.error);
      const next: PlayerState = {
        ...state,
        inventory: removed.value,
        coins: Math.min(tunables.economy.currencyCap, state.coins + coins),
      };
      return ok({ state: next, value: { ...project(next), coinsGained: coins } });
    });
  };
  const repair: CommandHandler = async (session: Session, payload: unknown) => {
    const skillId = readString(payload, 'skillId');
    if (skillId === null) return err(invalid('repair.skill_missing', 'skillId is required'));
    return players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const tool = state.tools[skillId];
      if (tool === undefined) return err(failure(FailureCode.NotFound, 'repair.tool_missing'));
      const definition = catalogs.items.get(tool.definitionId);
      if (definition?.tool === undefined)
        return err(failure(FailureCode.NotFound, 'repair.tool_unknown'));
      const missing = Math.max(0, definition.tool.maxDurability - tool.durability);
      const cost = missing * tunables.economy.toolRepairCostPerDurability;
      if (cost === 0) return err(invalid('repair.not_needed', 'this tool is already pristine'));
      if (state.coins < cost)
        return err(
          failure(FailureCode.Conflict, 'repair.insufficient_coins', {
            context: { cost, held: state.coins },
          }),
        );
      const next: PlayerState = {
        ...state,
        coins: state.coins - cost,
        tools: {
          ...state.tools,
          [skillId]: { ...tool, durability: definition.tool.maxDurability },
        },
      };
      return ok({ state: next, value: { ...project(next), repairCost: cost } });
    });
  };
  const sync: CommandHandler = async (session: Session) => {
    const loaded = await players.load(session.playerId);
    if (!loaded.ok) return err(loaded.error);
    return ok(project(loaded.value));
  };

  router
    .register('player.sync', sync)
    .register('gathering.start', start)
    .register('gathering.collect', collect)
    .register('gathering.stop', stop)
    .register('crafting.craft', craft)
    .register('bank.deposit', moveBankItem('deposit'))
    .register('bank.withdraw', moveBankItem('withdraw'))
    .register('merchant.sell', sell)
    .register('merchant.repair', repair);
}
