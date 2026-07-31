import { describe, expect, it, vi } from 'vitest';
import { Container } from '../core/container.js';

interface Services {
  a: { name: string };
  b: { dependsOn: string; dispose(): void };
  c: { value: number };
}

describe('Container', () => {
  it('constructs lazily and caches', () => {
    const factory = vi.fn(() => ({ name: 'a' }));
    const container = new Container<Services>().register('a', factory);
    expect(factory).not.toHaveBeenCalled();
    container.resolve('a');
    container.resolve('a');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('injects dependencies through the container', () => {
    const container = new Container<Services>()
      .register('a', () => ({ name: 'render' }))
      .register('b', (c) => ({ dependsOn: c.resolve('a').name, dispose: () => undefined }));
    expect(container.resolve('b').dependsOn).toBe('render');
  });

  it('refuses duplicate registration but allows explicit override', () => {
    const container = new Container<Services>().register('c', () => ({ value: 1 }));
    expect(() => container.register('c', () => ({ value: 2 }))).toThrow();
    container.override('c', () => ({ value: 2 }));
    expect(container.resolve('c').value).toBe(2);
  });

  it('reports a circular dependency instead of overflowing the stack', () => {
    const container = new Container<Services>()
      .register('a', (c) => ({ name: c.resolve('c').value.toString() }))
      .register('c', (c) => ({ value: c.resolve('a').name.length }));
    expect(() => container.resolve('a')).toThrow(/Circular dependency/);
  });

  it('throws a named error for an unregistered service', () => {
    expect(() => new Container<Services>().resolve('a')).toThrow(/"a" is not registered/);
  });

  it('disposes constructed services in reverse order', async () => {
    const order: string[] = [];
    const container = new Container<Services>()
      .register('a', () => ({ name: 'a', dispose: () => order.push('a') }) as Services['a'])
      .register('b', () => ({ dependsOn: 'a', dispose: () => order.push('b') }));
    container.resolve('a');
    container.resolve('b');
    await container.dispose();
    expect(order).toEqual(['b', 'a']);
  });
});
