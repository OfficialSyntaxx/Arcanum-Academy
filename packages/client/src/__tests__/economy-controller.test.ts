import { ClientOpcode, EventBus, ServerOpcode } from '@alderfell/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EconomyController } from '../app/economy-controller.js';
import { EMPTY_ECONOMY, useAppStore } from '../state/app-store.js';
import type { Transport, TransportEvents } from '../net/transport.js';

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
});
