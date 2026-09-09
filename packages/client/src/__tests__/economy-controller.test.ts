import { ClientOpcode, EventBus } from '@alderfell/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EconomyController } from '../app/economy-controller.js';
import type { Transport, TransportEvents } from '../net/transport.js';
import { EMPTY_ECONOMY, useAppStore } from '../state/app-store.js';

function transportHarness(): { readonly transport: Transport; readonly send: ReturnType<typeof vi.fn> } {
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
});
