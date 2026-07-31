import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../events.js';

type TestEvents = {
  'node:harvested': { nodeId: string; amount: number };
  'card:scribed': { grade: number };
};

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    bus.on('card:scribed', (payload) => seen.push(payload.grade));
    bus.emit('card:scribed', { grade: 9 });
    expect(seen).toEqual([9]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const subscription = bus.on('card:scribed', handler);
    subscription.unsubscribe();
    subscription.unsubscribe();
    bus.emit('card:scribed', { grade: 3 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers once handlers exactly once', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('card:scribed', handler);
    bus.emit('card:scribed', { grade: 1 });
    bus.emit('card:scribed', { grade: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing handler from the rest of the frame', () => {
    const onHandlerError = vi.fn();
    const bus = new EventBus<TestEvents>({ onHandlerError });
    const good = vi.fn();
    bus.on('card:scribed', () => {
      throw new Error('boom');
    });
    bus.on('card:scribed', good);
    bus.emit('card:scribed', { grade: 5 });
    expect(good).toHaveBeenCalledTimes(1);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
  });

  it('tolerates subscription changes during dispatch', () => {
    const bus = new EventBus<TestEvents>();
    const later = vi.fn();
    bus.on('card:scribed', () => bus.on('card:scribed', later));
    bus.emit('card:scribed', { grade: 4 });
    expect(later).not.toHaveBeenCalled();
    bus.emit('card:scribed', { grade: 4 });
    expect(later).toHaveBeenCalled();
  });

  it('reports listener counts and clears', () => {
    const bus = new EventBus<TestEvents>();
    bus.on('node:harvested', () => undefined);
    expect(bus.listenerCount('node:harvested')).toBe(1);
    bus.clear();
    expect(bus.listenerCount('node:harvested')).toBe(0);
  });
});
