import {
  TIDEGLASS_TRAIL,
  QuestStatus,
  distance,
  err,
  failure,
  FailureCode,
  ok,
  type Failure,
  type Result,
  type SessionId,
} from '@alderfell/shared';
import type { Mutation, PlayerService } from '../../domain/player-service.js';
import type { PlayerState } from '../../domain/player-state.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';

function interactableId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).interactableId;
  return typeof value === 'string' ? value : null;
}

function project(state: PlayerState) {
  return {
    coins: state.coins,
    tideglassTrail: state.tideglassTrail,
    location: state.location,
  };
}

export function registerClueHandlers(
  router: RegistryCommandRouter,
  options: {
    readonly players: PlayerService;
    readonly now: () => number;
    readonly interactionRadius: number;
    readonly currencyCap: number;
    readonly positionFor: (
      sessionId: SessionId,
    ) => { readonly x: number; readonly z: number } | null;
  },
): void {
  const investigate: CommandHandler = async (session, payload) => {
    const id = interactableId(payload);
    if (id === null) return err(failure(FailureCode.Validation, 'clue.site_missing'));
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.quests[TIDEGLASS_TRAIL.prerequisiteQuestId]?.status !== QuestStatus.Completed)
        return err(failure(FailureCode.Conflict, 'clue.trail_locked'));
      if (state.tideglassTrail.rewardClaimed)
        return err(failure(FailureCode.Conflict, 'clue.trail_completed'));
      const expected = TIDEGLASS_TRAIL.steps[state.tideglassTrail.step];
      if (expected === undefined || expected.interactableId !== id)
        return err(failure(FailureCode.Conflict, 'clue.wrong_site'));
      if (state.location.zoneId !== expected.zoneId)
        return err(failure(FailureCode.Conflict, 'clue.wrong_zone'));
      const position = options.positionFor(session.id);
      if (position === null || distance(position, expected.position) > options.interactionRadius)
        return err(failure(FailureCode.Conflict, 'clue.out_of_range'));

      const nextStep = state.tideglassTrail.step + 1;
      const complete = nextStep === TIDEGLASS_TRAIL.steps.length;
      const next: PlayerState = {
        ...state,
        coins: complete
          ? Math.min(options.currencyCap, state.coins + TIDEGLASS_TRAIL.rewardCoins)
          : state.coins,
        tideglassTrail: {
          startedAtMs: state.tideglassTrail.startedAtMs ?? nowMs,
          step: nextStep,
          completedAtMs: complete ? nowMs : null,
          rewardClaimed: complete,
        },
        lastSeenAtMs: nowMs,
      };
      return ok({ state: next, value: project(next) });
    });
  };

  router.register('clue.investigate', investigate);
}
