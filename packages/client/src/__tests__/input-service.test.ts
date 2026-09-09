import { describe, expect, it } from 'vitest';

import { InputService } from '../input/input-service.js';

type Listener = (event: PointerEvent) => void;

function event(pointerId: number, x: number, y: number): PointerEvent {
  return { pointerId, clientX: x, clientY: y } as PointerEvent;
}

function surface(): {
  element: HTMLElement;
  dispatch(type: string, pointer: PointerEvent): void;
} {
  const listeners = new Map<string, Listener>();
  return {
    element: {
      style: {} as CSSStyleDeclaration,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.set(type, listener as Listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      setPointerCapture() {},
    } as unknown as HTMLElement,
    dispatch(type, pointer) {
      listeners.get(type)?.(pointer);
    },
  };
}

describe('InputService pinch handling', () => {
  it('emits stable incremental zoom deltas and never converts a pinch into a tap', () => {
    const world = surface();
    const input = new InputService({ element: world.element });
    const scales: number[] = [];
    let taps = 0;
    input.events.on('pinch', ({ scale }) => scales.push(scale));
    input.events.on('tap', () => {
      taps += 1;
    });

    world.dispatch('pointerdown', event(1, 0, 0));
    world.dispatch('pointerdown', event(2, 100, 0));
    world.dispatch('pointermove', event(2, 110, 0));
    world.dispatch('pointermove', event(2, 121, 0));
    world.dispatch('pointerup', event(1, 0, 0));
    world.dispatch('pointerup', event(2, 121, 0));

    expect(scales).toHaveLength(2);
    expect(scales[0]).toBeCloseTo(1.1);
    expect(scales[1]).toBeCloseTo(1.1);
    expect(taps).toBe(0);
    input.dispose();
  });
});
