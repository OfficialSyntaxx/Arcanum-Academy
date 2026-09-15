/** Server-authoritative rules for the first quest vertical slice. */
import { quantityOf, removeItems } from '@alderfell/sim';
import {
  err,
  failure,
  FailureCode,
  ok,
  QuestStatus,
  questById,
  questIsUnlocked,
  type Failure,
  type ItemDefinitionId,
  type QuestObjectiveDefinition,
  type Result,
} from '@alderfell/shared';
import type { PlayerState } from '../../domain/player-state.js';
import type { Mutation, PlayerService } from '../../domain/player-service.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';

function project(state: PlayerState) {
  return {
    inventory: { stacks: state.inventory.stacks, slotCapacity: state.inventory.slotCapacity },
    bank: { stacks: state.bank.stacks, slotCapacity: state.bank.slotCapacity },
    coins: state.coins,
    skills: state.skills,
    tools: state.tools,
    gathering: state.gathering,
    quests: state.quests,
    location: state.location,
    saltwake: state.saltwake,
  };
}

function readQuestId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const questId = (payload as Record<string, unknown>).questId;
  return typeof questId === 'string' ? questId : null;
}

function itemObjectiveCount(state: PlayerState, itemIds: readonly ItemDefinitionId[]): number {
  return itemIds.reduce((total, itemId) => total + quantityOf(state.inventory, itemId), 0);
}

function objectiveComplete(
  state: PlayerState,
  questId: string,
  objective: QuestObjectiveDefinition,
): boolean {
  if (objective.kind === 'ITEM')
    return itemObjectiveCount(state, objective.itemIds) >= objective.requiredQuantity;
  return (state.quests[questId]?.objectiveCounts[objective.id] ?? 0) >= objective.requiredQuantity;
}

function takeObjective(
  state: PlayerState,
  itemIds: readonly ItemDefinitionId[],
  requiredQuantity: number,
): Result<PlayerState, Failure> {
  let inventory = state.inventory;
  let remaining = requiredQuantity;
  for (const itemId of itemIds) {
    if (remaining === 0) break;
    const count = quantityOf(inventory, itemId);
    const take = Math.min(count, remaining);
    if (take === 0) continue;
    const removed = removeItems(inventory, itemId, take);
    if (!removed.ok) return err(removed.error);
    inventory = removed.value;
    remaining -= take;
  }
  return remaining === 0
    ? ok({ ...state, inventory })
    : err(failure(FailureCode.Conflict, 'quest.objective_incomplete'));
}

function takeObjectives(state: PlayerState, questId: string): Result<PlayerState, Failure> {
  const quest = questById(questId);
  if (!quest) return err(failure(FailureCode.NotFound, 'quest.unknown'));
  let next = state;
  for (const objective of quest.objectives) {
    if (objective.kind !== 'ITEM' || objective.consume === false) continue;
    const consumed = takeObjective(next, objective.itemIds, objective.requiredQuantity);
    if (!consumed.ok) return err(consumed.error);
    next = consumed.value;
  }
  return ok(next);
}

export function registerQuestHandlers(
  router: RegistryCommandRouter,
  options: { readonly players: PlayerService; readonly now: () => number },
): void {
  const accept: CommandHandler = async (session, payload) => {
    const questId = readQuestId(payload);
    const quest = questId ? questById(questId) : undefined;
    if (!quest) {
      return err(failure(FailureCode.NotFound, 'quest.unknown'));
    }
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.quests[quest.id] !== undefined) {
        return err(failure(FailureCode.Conflict, 'quest.already_accepted'));
      }
      if (!questIsUnlocked(quest, state.quests)) {
        return err(failure(FailureCode.Conflict, 'quest.prerequisite_incomplete'));
      }
      const next: PlayerState = {
        ...state,
        quests: {
          ...state.quests,
          [quest.id]: {
            status: QuestStatus.Active,
            acceptedAtMs: nowMs,
            completedAtMs: null,
            objectiveCounts: {},
          },
        },
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(next) });
    });
  };

  const complete: CommandHandler = async (session, payload) => {
    const questId = readQuestId(payload);
    const quest = questId ? questById(questId) : undefined;
    if (!quest) {
      return err(failure(FailureCode.NotFound, 'quest.unknown'));
    }
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.quests[quest.id]?.status !== QuestStatus.Active) {
        return err(failure(FailureCode.Conflict, 'quest.not_active'));
      }
      if (quest.objectives.some((objective) => !objectiveComplete(state, quest.id, objective))) {
        return err(failure(FailureCode.Conflict, 'quest.objective_incomplete'));
      }
      const consumed = takeObjectives(state, quest.id);
      if (!consumed.ok) return err(consumed.error);
      const next: PlayerState = {
        ...consumed.value,
        coins: consumed.value.coins + quest.rewardCoins,
        quests: {
          ...consumed.value.quests,
          [quest.id]: {
            status: QuestStatus.Completed,
            acceptedAtMs: state.quests[quest.id]!.acceptedAtMs,
            completedAtMs: nowMs,
            objectiveCounts: state.quests[quest.id]!.objectiveCounts,
          },
        },
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(next) });
    });
  };

  router.register('quest.accept', accept).register('quest.complete', complete);
}
