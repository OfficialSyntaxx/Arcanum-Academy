import { describe, expect, it, vi } from 'vitest';
import { DiagnosticBuffer, PostgresDiagnosticStore } from '../diagnostics.js';

const report = {
  level: 'error' as const,
  source: 'world' as const,
  message: 'Forage interaction was not available',
  receivedAtMs: 1_700_000_000_000,
  ip: '127.0.0.1',
};

describe('DiagnosticBuffer', () => {
  it('retains the latest 250 reports in their original order', async () => {
    const store = new DiagnosticBuffer();
    await store.initialise();
    for (let index = 0; index < 252; index += 1) {
      await store.add({ ...report, message: `event-${index}` });
    }

    const events = await store.list();
    expect(events).toHaveLength(250);
    expect(events[0]?.message).toBe('event-2');
    expect(events.at(-1)?.message).toBe('event-251');
  });
});

describe('PostgresDiagnosticStore', () => {
  it('initialises, persists reports, and maps database bigint values safely', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...report,
            client_at_ms: '1699999999000',
            received_at_ms: '1700000000000',
          },
        ],
      });
    const store = new PostgresDiagnosticStore({ query });

    await store.initialise();
    await store.add({ ...report, clientAtMs: 1_699_999_999_000 });
    const events = await store.list();

    expect(query).toHaveBeenCalledTimes(5);
    expect(events).toEqual([{ ...report, clientAtMs: 1_699_999_999_000 }]);
  });
});
