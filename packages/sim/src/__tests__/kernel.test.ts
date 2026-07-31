import { describe, expect, it } from 'vitest';
import { compareCommands, Simulation, type Command } from '../kernel.js';

interface CounterState {
  readonly total: number;
  readonly log: readonly string[];
}

const initialState: CounterState = { total: 0, log: [] };

function buildSimulation(): Simulation<CounterState> {
  return new Simulation<CounterState>({ initialState, seed: 'test' })
    .register<'add', { amount: number }>('add', (state, payload) => ({
      total: state.total + payload.amount,
      log: [...state.log, `add:${payload.amount}`],
    }))
    .register<'roll', Record<string, never>>('roll', (state, _payload, context) => ({
      total: state.total + context.rng.nextInt(1, 6),
      log: [...state.log, 'roll'],
    }));
}

function command(
  kind: string,
  tick: number,
  seq: number,
  issuer: string,
  payload: unknown,
): Command {
  return { kind, tick, seq, issuer, payload };
}

describe('Simulation kernel', () => {
  it('applies commands on their scheduled tick', () => {
    const sim = buildSimulation();
    sim.enqueue(command('add', 2, 0, 'a', { amount: 5 }));
    sim.run(2);
    expect(sim.getState().total).toBe(0);
    sim.step();
    expect(sim.getState().total).toBe(5);
  });

  it('rejects unknown command kinds', () => {
    const sim = buildSimulation();
    const result = sim.enqueue(command('teleport', 0, 0, 'a', {}));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('sim.unknown_command');
  });

  it('rejects commands scheduled in the past', () => {
    const sim = buildSimulation();
    sim.run(5);
    const result = sim.enqueue(command('add', 1, 0, 'a', { amount: 1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('sim.command_in_the_past');
  });

  it('reaches the same state regardless of arrival order', () => {
    const commands = [
      command('add', 1, 0, 'alice', { amount: 3 }),
      command('add', 1, 1, 'alice', { amount: 4 }),
      command('roll', 1, 0, 'bob', {}),
      command('add', 2, 0, 'bob', { amount: 10 }),
    ];

    const forward = buildSimulation();
    for (const c of commands) forward.enqueue(c);
    forward.run(4);

    const reversed = buildSimulation();
    for (const c of [...commands].reverse()) reversed.enqueue(c);
    reversed.run(4);

    expect(reversed.snapshot().hash).toBe(forward.snapshot().hash);
  });

  it('reproduces the same run from the same seed', () => {
    const runOnce = (): string => {
      const sim = buildSimulation();
      for (let tick = 0; tick < 10; tick += 1) {
        sim.enqueue(command('roll', tick, 0, 'alice', {}));
      }
      sim.run(10);
      return sim.snapshot().hash;
    };
    expect(runOnce()).toBe(runOnce());
  });

  it('restores exactly from a snapshot', () => {
    const sim = buildSimulation();
    for (let tick = 0; tick < 5; tick += 1) sim.enqueue(command('roll', tick, 0, 'a', {}));
    sim.run(5);
    const snapshot = sim.snapshot();
    sim.enqueue(command('roll', 5, 0, 'a', {}));
    sim.run(3);
    const divergent = sim.snapshot().hash;

    const restored = buildSimulation();
    restored.restore(snapshot);
    restored.enqueue(command('roll', 5, 0, 'a', {}));
    restored.run(3);
    expect(restored.snapshot().hash).toBe(divergent);
  });

  it('refuses duplicate reducer registration', () => {
    const sim = buildSimulation();
    expect(() => sim.register('add', (state) => state)).toThrow();
  });

  it('orders commands totally', () => {
    const sorted = [
      command('b', 1, 1, 'bob', {}),
      command('a', 1, 0, 'bob', {}),
      command('a', 0, 9, 'zed', {}),
      command('a', 1, 0, 'alice', {}),
    ].sort(compareCommands);
    expect(sorted.map((c) => `${c.tick}${c.issuer}${c.seq}`)).toEqual([
      '0zed9',
      '1alice0',
      '1bob0',
      '1bob1',
    ]);
  });
});
