import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  QuestStatus,
  TIDEGLASS_TRAIL,
  asId,
  ok,
  type PlayerId,
  type SessionId,
} from '@alderfell/shared';
import { PlayerService } from '../domain/player-service.js';
import { RegistryCommandRouter } from '../net/gateway.js';
import { registerClueHandlers } from '../net/handlers/clues.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import type { Session } from '../session/session-store.js';

const PLAYER = asId<PlayerId>('clue-player');
const session: Session = {
  id: asId<SessionId>('clue-session'),
  playerId: PLAYER,
  resumeToken: 'clue-token',
  createdAtMs: 0,
  disconnectedAtMs: null,
  lastClientSeq: 0,
};

function harness() {
  let position: { x: number; z: number } | null = TIDEGLASS_TRAIL.steps[0]!.position;
  const players = new PlayerService({
    repository: new InMemoryPlayerRepository(() => 10_000),
    slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
    now: () => 10_000,
  });
  const router = new RegistryCommandRouter();
  registerClueHandlers(router, {
    players,
    now: () => 10_000,
    interactionRadius: DEFAULT_TUNABLES.world.interactionRadius,
    currencyCap: DEFAULT_TUNABLES.economy.currencyCap,
    positionFor: () => position,
  });
  return {
    dispatch: (id: string) => router.dispatch(session, 'clue.investigate', { interactableId: id }),
    setPosition(next: typeof position) {
      position = next;
    },
    async seed(patch: Parameters<typeof Object.assign>[1]) {
      const result = await players.update(PLAYER, (state) =>
        ok({ state: Object.assign({}, state, patch), value: undefined }),
      );
      if (!result.ok) throw new Error(result.error.reason);
    },
    async state() {
      const result = await players.load(PLAYER);
      if (!result.ok) throw new Error(result.error.reason);
      return result.value;
    },
  };
}

const completedQuest = {
  'quest.beneath_the_saltline': {
    status: QuestStatus.Completed,
    acceptedAtMs: 1,
    completedAtMs: 2,
    objectiveCounts: {},
  },
};

describe('Tideglass treasure trail', () => {
  it('stays locked until Beneath the Saltline is complete', async () => {
    const h = harness();
    const result = await h.dispatch(TIDEGLASS_TRAIL.steps[0]!.interactableId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('clue.trail_locked');
  });

  it('refuses out-of-order and out-of-range investigations', async () => {
    const h = harness();
    await h.seed({
      quests: completedQuest,
      location: { zoneId: 'zone.saltwake_ruins', roomId: 'x' },
    });
    const wrong = await h.dispatch(TIDEGLASS_TRAIL.steps[1]!.interactableId);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.reason).toBe('clue.wrong_site');
    h.setPosition({ x: 99, z: 99 });
    const distant = await h.dispatch(TIDEGLASS_TRAIL.steps[0]!.interactableId);
    expect(distant.ok).toBe(false);
    if (!distant.ok) expect(distant.error.reason).toBe('clue.out_of_range');
  });

  it('persists all four ordered steps and pays exactly once', async () => {
    const h = harness();
    await h.seed({
      quests: completedQuest,
      location: { zoneId: 'zone.saltwake_ruins', roomId: 'x' },
    });
    for (const [index, step] of TIDEGLASS_TRAIL.steps.entries()) {
      if (index === 1) await h.seed({ location: { zoneId: 'zone.courtyard', roomId: 'spawn' } });
      h.setPosition(step.position);
      expect(await h.dispatch(step.interactableId)).toMatchObject({ ok: true });
    }
    const state = await h.state();
    expect(state.tideglassTrail).toEqual({
      startedAtMs: 10_000,
      step: 4,
      completedAtMs: 10_000,
      rewardClaimed: true,
    });
    expect(state.coins).toBe(45);
    const retry = await h.dispatch(TIDEGLASS_TRAIL.steps[3]!.interactableId);
    expect(retry.ok).toBe(false);
    expect((await h.state()).coins).toBe(45);
  });

  it('caps the reward without invalid currency', async () => {
    const h = harness();
    await h.seed({
      quests: completedQuest,
      coins: DEFAULT_TUNABLES.economy.currencyCap - 1,
      location: { zoneId: 'zone.courtyard', roomId: 'spawn' },
      tideglassTrail: { startedAtMs: 1, step: 3, completedAtMs: null, rewardClaimed: false },
    });
    const final = TIDEGLASS_TRAIL.steps[3]!;
    h.setPosition(final.position);
    expect(await h.dispatch(final.interactableId)).toMatchObject({ ok: true });
    expect((await h.state()).coins).toBe(DEFAULT_TUNABLES.economy.currencyCap);
  });
});
