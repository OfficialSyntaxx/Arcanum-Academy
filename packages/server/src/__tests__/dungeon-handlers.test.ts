import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  QuestStatus,
  asId,
  ok,
  type PlayerId,
  type SessionId,
} from '@alderfell/shared';
import { quantityOf } from '@alderfell/sim';
import { PlayerService } from '../domain/player-service.js';
import { RegistryCommandRouter } from '../net/gateway.js';
import { registerDungeonHandlers } from '../net/handlers/dungeons.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import type { Session } from '../session/session-store.js';

const PLAYER = asId<PlayerId>('saltwake-player');
const session: Session = {
  id: asId<SessionId>('saltwake-session'),
  playerId: PLAYER,
  resumeToken: 'saltwake-token',
  createdAtMs: 0,
  disconnectedAtMs: null,
  lastClientSeq: 0,
};

function harness() {
  const clock = 10_000;
  const players = new PlayerService({
    repository: new InMemoryPlayerRepository(() => clock),
    slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
    now: () => clock,
  });
  const router = new RegistryCommandRouter();
  registerDungeonHandlers(router, {
    players,
    now: () => clock,
    currencyCap: DEFAULT_TUNABLES.economy.currencyCap,
    items: ITEM_CATALOG,
  });
  return {
    dispatch: (kind: string, payload: unknown = {}) => router.dispatch(session, kind, payload),
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

const activeQuest = {
  'quest.beneath_the_saltline': {
    status: QuestStatus.Active,
    acceptedAtMs: 1,
    completedAtMs: null,
    objectiveCounts: {},
  },
};

describe('Saltwake dungeon lifecycle', () => {
  it('keeps the descent locked until its quest is accepted', async () => {
    const h = harness();
    const result = await h.dispatch('world.travel', { targetZoneId: 'zone.saltwake_ruins' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('world.destination_locked');
  });

  it('persists the first descent and records it once', async () => {
    const h = harness();
    await h.seed({ quests: activeQuest });
    expect(await h.dispatch('world.travel', { targetZoneId: 'zone.saltwake_ruins' })).toMatchObject(
      { ok: true },
    );
    const state = await h.state();
    expect(state.location.zoneId).toBe('zone.saltwake_ruins');
    expect(state.saltwake.enteredAtMs).toBe(10_000);
    expect(state.discoveries).toHaveProperty('discovery.dungeon.saltwake_entered');
  });

  it('permits the Cindermark-to-Cinderhollow route and its return only', async () => {
    const h = harness();
    expect(await h.dispatch('world.travel', { targetZoneId: 'zone.cinderhollow' })).toMatchObject({
      ok: false,
    });
    await h.seed({ location: { zoneId: 'zone.mountains', roomId: 'wp.cinderhollow.gate' } });
    expect(await h.dispatch('world.travel', { targetZoneId: 'zone.cinderhollow' })).toMatchObject({
      ok: true,
    });
    expect((await h.state()).location.zoneId).toBe('zone.cinderhollow');
    expect((await h.state()).discoveries).toHaveProperty('discovery.dungeon.cinderhollow_entered');
    expect(await h.dispatch('world.travel', { targetZoneId: 'zone.mountains' })).toMatchObject({
      ok: true,
    });
    expect(await h.dispatch('world.travel', { targetZoneId: 'zone.cinderhollow' })).toMatchObject({
      ok: true,
    });
    expect(Object.keys((await h.state()).discoveries)).toEqual([
      'discovery.dungeon.cinderhollow_entered',
    ]);
  });

  it('claims the one-time charm and permanently opens the shortcut', async () => {
    const h = harness();
    await h.seed({
      quests: activeQuest,
      location: { zoneId: 'zone.saltwake_ruins', roomId: 'wp.saltwake.vault' },
      saltwake: {
        enteredAtMs: 1,
        galleryCleared: true,
        bossDefeated: true,
        chestClaimed: false,
        shortcutUnlocked: false,
      },
    });
    expect(await h.dispatch('dungeon.claim_tideglass')).toMatchObject({ ok: true });
    const state = await h.state();
    expect(quantityOf(state.inventory, 'item.charm.tideglass' as never)).toBe(1);
    expect(state.saltwake).toMatchObject({ chestClaimed: true, shortcutUnlocked: true });
    expect(state.discoveries).toHaveProperty('discovery.dungeon.tideglass');
    const retry = await h.dispatch('dungeon.claim_tideglass');
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error.reason).toBe('dungeon.chest_already_claimed');
  });

  it('does not partially settle a chest when the satchel has no slot', async () => {
    const h = harness();
    await h.seed({
      inventory: { stacks: [], slotCapacity: 0 },
      quests: activeQuest,
      location: { zoneId: 'zone.saltwake_ruins', roomId: 'wp.saltwake.vault' },
      saltwake: {
        enteredAtMs: 1,
        galleryCleared: true,
        bossDefeated: true,
        chestClaimed: false,
        shortcutUnlocked: false,
      },
    });
    const result = await h.dispatch('dungeon.claim_tideglass');
    expect(result.ok).toBe(false);
    expect((await h.state()).saltwake.chestClaimed).toBe(false);
  });
});
