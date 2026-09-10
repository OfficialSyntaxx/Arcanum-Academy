/** Server-authoritative rules for the first quest vertical slice. */
import { quantityOf, removeItems } from '@alderfell/sim';
import {
  err,
  failure,
  FailureCode,
  ok,
  QuestStatus,
  type Failure,
  type ItemDefinitionId,
  type Result,
} from '@alderfell/shared';
import type { PlayerState } from '../../domain/player-state.js';
import type { Mutation, PlayerService } from '../../domain/player-service.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';

export const FIRST_KINDLING_QUEST_ID = 'quest.first_kindling';
const MUSHROOM_IDS = [
  'item.mushroom.cap',
  'item.mushroom.glowspore',
  'item.mushroom.dreamveil',
] as const;
const REQUIRED_MUSHROOMS = 3;
const REWARD_COINS = 40;

function project(state: PlayerState) {
  return {
    inventory: { stacks: state.inventory.stacks, slotCapacity: state.inventory.slotCapacity },
    bank: { stacks: state.bank.stacks, slotCapacity: state.bank.slotCapacity },
    coins: state.coins,
    skills: state.skills,
    tools: state.tools,
    gathering: state.gathering,
    quests: state.quests,
  };
}

function readQuestId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const questId = (payload as Record<string, unknown>).questId;
  return typeof questId === 'string' ? questId : null;
}

function mushroomCount(state: PlayerState): number {
  return MUSHROOM_IDS.reduce(
    (total, itemId) => total + quantityOf(state.inventory, itemId as ItemDefinitionId),
    0,
  );
}

function takeMushrooms(state: PlayerState): Result<PlayerState, Failure> {
  let inventory = state.inventory;
  let remaining = REQUIRED_MUSHROOMS;
  for (const itemId of MUSHROOM_IDS) {
    if (remaining === 0) break;
    const count = quantityOf(inventory, itemId as ItemDefinitionId);
    const take = Math.min(count, remaining);
    if (take === 0) continue;
    const removed = removeItems(inventory, itemId as ItemDefinitionId, take);
    if (!removed.ok) return err(removed.error);
    inventory = removed.value;
    remaining -= take;
  }
  return remaining === 0
    ? ok({ ...state, inventory })
    : err(failure(FailureCode.Conflict, 'quest.objective_incomplete'));
}

export function registerQuestHandlers(
  router: RegistryCommandRouter,
  options: { readonly players: PlayerService; readonly now: () => number },
): void {
  const accept: CommandHandler = async (session, payload) => {
    if (readQuestId(payload) !== FIRST_KINDLING_QUEST_ID) {
      return err(failure(FailureCode.NotFound, 'quest.unknown'));
    }
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.quests[FIRST_KINDLING_QUEST_ID] !== undefined) {
        return err(failure(FailureCode.Conflict, 'quest.already_accepted'));
      }
      const next: PlayerState = {
        ...state,
        quests: {
          ...state.quests,
          [FIRST_KINDLING_QUEST_ID]: {
            status: QuestStatus.Active,
            acceptedAtMs: nowMs,
            completedAtMs: null,
          },
        },
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(next) });
    });
  };

  const complete: CommandHandler = async (session, payload) => {
    if (readQuestId(payload) !== FIRST_KINDLING_QUEST_ID) {
      return err(failure(FailureCode.NotFound, 'quest.unknown'));
    }
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.quests[FIRST_KINDLING_QUEST_ID]?.status !== QuestStatus.Active) {
        return err(failure(FailureCode.Conflict, 'quest.not_active'));
      }
      if (mushroomCount(state) < REQUIRED_MUSHROOMS) {
        return err(failure(FailureCode.Conflict, 'quest.objective_incomplete'));
      }
      const consumed = takeMushrooms(state);
      if (!consumed.ok) return err(consumed.error);
      const next: PlayerState = {
        ...consumed.value,
        coins: consumed.value.coins + REWARD_COINS,
        quests: {
          ...consumed.value.quests,
          [FIRST_KINDLING_QUEST_ID]: {
            status: QuestStatus.Completed,
            acceptedAtMs: state.quests[FIRST_KINDLING_QUEST_ID]!.acceptedAtMs,
            completedAtMs: nowMs,
          },
        },
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(next) });
    });
  };

  router.register('quest.accept', accept).register('quest.complete', complete);
}
