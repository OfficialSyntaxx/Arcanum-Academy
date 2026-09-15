import { addItems } from '@alderfell/sim';
import {
  asId,
  err,
  failure,
  FailureCode,
  ok,
  QuestStatus,
  type Failure,
  type ItemDefinitionId,
  type ItemCatalog,
  type Result,
} from '@alderfell/shared';
import { applyDiscovery } from '../../domain/diaries.js';
import type { Mutation, PlayerService } from '../../domain/player-service.js';
import type { PlayerState } from '../../domain/player-state.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';

function project(state: PlayerState) {
  return {
    inventory: { stacks: state.inventory.stacks, slotCapacity: state.inventory.slotCapacity },
    coins: state.coins,
    quests: state.quests,
    discoveries: state.discoveries,
    diaryRewards: state.diaryRewards,
    location: state.location,
    saltwake: state.saltwake,
  };
}

function targetZone(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).targetZoneId;
  return typeof value === 'string' ? value : null;
}

function travelAllowed(state: PlayerState, target: string): boolean {
  const source = state.location.zoneId;
  if (source === target) return true;
  if (target === 'zone.courtyard') return true;
  if (source !== 'zone.courtyard') return false;
  if (target === 'zone.saltwake_ruins') {
    const status = state.quests['quest.beneath_the_saltline']?.status;
    return status === QuestStatus.Active || status === QuestStatus.Completed;
  }
  return ['zone.forest', 'zone.mountains', 'zone.snow'].includes(target);
}

export function registerDungeonHandlers(
  router: RegistryCommandRouter,
  options: {
    readonly players: PlayerService;
    readonly now: () => number;
    readonly currencyCap: number;
    readonly items: ItemCatalog;
  },
): void {
  const travel: CommandHandler = async (session, payload) => {
    const target = targetZone(payload);
    if (target === null) return err(failure(FailureCode.Validation, 'world.target_missing'));
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (!travelAllowed(state, target))
        return err(failure(FailureCode.Conflict, 'world.destination_locked'));
      const enteringSaltwake = target === 'zone.saltwake_ruins';
      let next: PlayerState = {
        ...state,
        location: {
          zoneId: target,
          roomId: enteringSaltwake ? 'wp.saltwake.antechamber' : 'spawn',
        },
        saltwake:
          enteringSaltwake && state.saltwake.enteredAtMs === null
            ? { ...state.saltwake, enteredAtMs: nowMs }
            : state.saltwake,
        lastSeenAtMs: nowMs,
      };
      if (enteringSaltwake)
        next = applyDiscovery(next, 'event.saltwake.entered', nowMs, options.currencyCap);
      return ok({ state: next, value: project(next) });
    });
  };

  const claim: CommandHandler = async (session) => {
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.location.zoneId !== 'zone.saltwake_ruins')
        return err(failure(FailureCode.Conflict, 'dungeon.not_in_saltwake'));
      if (!state.saltwake.bossDefeated)
        return err(failure(FailureCode.Conflict, 'dungeon.warden_still_stands'));
      if (state.saltwake.chestClaimed)
        return err(failure(FailureCode.Conflict, 'dungeon.chest_already_claimed'));
      const itemId = asId<ItemDefinitionId>('item.charm.tideglass');
      const added = addItems(state.inventory, itemId, 1, options.items);
      if (!added.ok) return err(failure(FailureCode.Conflict, 'dungeon.satchel_full'));
      let next: PlayerState = {
        ...state,
        inventory: added.value,
        saltwake: { ...state.saltwake, chestClaimed: true, shortcutUnlocked: true },
        lastSeenAtMs: nowMs,
      };
      next = applyDiscovery(next, 'event.saltwake.tideglass_claimed', nowMs, options.currencyCap);
      return ok({ state: next, value: project(next) });
    });
  };

  router.register('world.travel', travel).register('dungeon.claim_tideglass', claim);
}
