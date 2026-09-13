import { ClientOpcode, EventBus, ServerOpcode } from '@alderfell/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EconomyController } from '../app/economy-controller.js';
import { EMPTY_ECONOMY, useAppStore } from '../state/app-store.js';
import type { Transport, TransportEvents } from '../net/transport.js';
import { craftingPresentation } from '../ui/EconomyPanels.js';

function transportHarness(): {
  readonly transport: Transport;
  readonly send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  return {
    transport: {
      events: new EventBus<TransportEvents>(),
      send,
    } as unknown as Transport,
    send,
  };
}

describe('EconomyController activity cleanup', () => {
  beforeEach(() => {
    useAppStore.setState({ economy: EMPTY_ECONOMY });
  });

  it('immediately clears gathering when travel stops the current activity', () => {
    const { transport, send } = transportHarness();
    const economy = new EconomyController(transport);
    useAppStore.getState().setEconomy({
      gatheringNodeId: 'int.node.mushroom',
      lastYields: [{ itemId: 'item.mushroom', quantity: 1 }],
      lastXpGained: 12,
      overflowed: true,
    });

    economy.stopGathering();

    expect(useAppStore.getState().economy).toMatchObject({
      gatheringNodeId: null,
      lastYields: [],
      lastXpGained: 0,
      overflowed: false,
    });
    expect(send).toHaveBeenCalledWith(ClientOpcode.Command, { kind: 'gathering.stop' });
  });

  it('does not send a redundant stop command when no activity is running', () => {
    const { transport, send } = transportHarness();
    new EconomyController(transport).stopGathering();
    expect(send).not.toHaveBeenCalled();
  });

  it('projects equipped tools from the authoritative sync', () => {
    const { transport } = transportHarness();
    new EconomyController(transport);

    transport.events.emit('frame', {
      v: 1,
      op: ServerOpcode.Patch,
      seq: 1,
      t: 0,
      p: {
        kind: 'player.sync',
        state: {
          tools: {
            'skill.foraging': { definitionId: 'item.tool.sickle', durability: 487 },
          },
        },
      },
    });

    expect(useAppStore.getState().economy.tools).toEqual({
      'skill.foraging': { definitionId: 'item.tool.sickle', durability: 487 },
    });
  });

  it('sends combat commands and accepts only server-confirmed combat state', () => {
    const { transport, send } = transportHarness();
    const economy = new EconomyController(transport);

    economy.attackEncounter('int.combat.shore_wolf', 'DEFENSIVE');
    economy.recoverCombat();
    expect(send).toHaveBeenNthCalledWith(1, ClientOpcode.Command, {
      kind: 'combat.attack',
      interactableId: 'int.combat.shore_wolf',
      style: 'DEFENSIVE',
    });
    expect(send).toHaveBeenNthCalledWith(2, ClientOpcode.Command, { kind: 'combat.recover' });

    transport.events.emit('frame', {
      v: 1,
      op: ServerOpcode.Patch,
      seq: 1,
      t: 0,
      p: {
        kind: 'combat.attack',
        state: {
          hitpoints: { current: 9, max: 10, respawnAtMs: null },
          combat: {
            interactableId: 'int.combat.shore_wolf',
            label: 'Shore Wolf',
            hitpoints: 3,
            maxHitpoints: 4,
            defeated: false,
            respawnAtMs: null,
            nextAttackAtMs: 0,
            damage: 1,
            rolledDamage: 0,
            rolledHit: false,
            enemyDamage: 0,
            coinsGained: 0,
            drops: [],
            combatXpGained: 4,
            style: 'DEFENSIVE',
          },
        },
      },
    });

    expect(useAppStore.getState().economy).toMatchObject({
      hitpoints: { current: 9 },
      combat: { style: 'DEFENSIVE', hitpoints: 3 },
    });
  });
});

describe('crafting station presentation', () => {
  it('uses campfire cooking terminology instead of the refining fallback', () => {
    expect(craftingPresentation('int.station.shorelands_campfire')).toEqual({
      title: 'Cooking',
      serial: 'Shorelands Campfire · 4 recipes',
      verb: 'Cook',
    });
  });
});
