import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  QuestStatus,
  asId,
  ok,
  type ItemDefinitionId,
  type PlayerId,
  type SessionId,
} from '@alderfell/shared';
import { addItems, quantityOf } from '@alderfell/sim';
import { PlayerService } from '../domain/player-service.js';
import { RegistryCommandRouter } from '../net/gateway.js';
import { registerQuestHandlers } from '../net/handlers/quests.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';

describe('Beneath the Saltline turn-in', () => {
  it('pays 100 coins once and preserves the unique Tideglass Charm', async () => {
    const playerId = asId<PlayerId>('saltline-turnin');
    const players = new PlayerService({
      repository: new InMemoryPlayerRepository(() => 50),
      slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
      now: () => 50,
    });
    const router = new RegistryCommandRouter();
    registerQuestHandlers(router, { players, now: () => 50 });
    const seeded = await players.update(playerId, (state) => {
      const charmId = asId<ItemDefinitionId>('item.charm.tideglass');
      const inventory = addItems(state.inventory, charmId, 1, ITEM_CATALOG);
      if (!inventory.ok) throw new Error(inventory.error.reason);
      return ok({
        state: {
          ...state,
          inventory: inventory.value,
          quests: {
            'quest.beneath_the_saltline': {
              status: QuestStatus.Active,
              acceptedAtMs: 10,
              completedAtMs: null,
              objectiveCounts: { 'saltline.sentinel': 1, 'saltline.warden': 1 },
            },
          },
        },
        value: undefined,
      });
    });
    expect(seeded.ok).toBe(true);
    const session = {
      id: asId<SessionId>('saltline-turnin-session'),
      playerId,
      resumeToken: 'token',
      createdAtMs: 0,
      disconnectedAtMs: null,
      lastClientSeq: 0,
    };
    expect(
      await router.dispatch(session, 'quest.complete', { questId: 'quest.beneath_the_saltline' }),
    ).toMatchObject({ ok: true });
    const loaded = await players.load(playerId);
    if (!loaded.ok) throw new Error(loaded.error.reason);
    expect(loaded.value.coins).toBe(100);
    expect(quantityOf(loaded.value.inventory, asId<ItemDefinitionId>('item.charm.tideglass'))).toBe(
      1,
    );
    expect(loaded.value.quests['quest.beneath_the_saltline']?.status).toBe(QuestStatus.Completed);
    const retry = await router.dispatch(session, 'quest.complete', {
      questId: 'quest.beneath_the_saltline',
    });
    expect(retry.ok).toBe(false);
  });
});
