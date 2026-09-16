import { describe, expect, it, vi } from 'vitest';
import {
  PostgresSupportReportStore,
  SupportReportBuffer,
  supportReportSubmissionSchema,
} from '../support-reports.js';

describe('support reports', () => {
  it('validates bounded, first-party report input', () => {
    expect(
      supportReportSubmissionSchema.safeParse({
        category: 'bug',
        message: 'The campfire panel closed while cooking.',
        playerId: 'player-one',
        diagnostics: [],
      }).success,
    ).toBe(true);
    expect(
      supportReportSubmissionSchema.safeParse({
        category: 'other',
        message: 'too short',
        diagnostics: [],
      }).success,
    ).toBe(false);
  });

  it('stores newest reports first with generated receipts', async () => {
    const store = new SupportReportBuffer();
    const first = await store.add(
      {
        category: 'feedback',
        message: 'Please add another route to the terrace.',
        diagnostics: [],
      },
      100,
    );
    const second = await store.add(
      {
        category: 'bug',
        message: 'The cooking button did not respond after travel.',
        diagnostics: [],
      },
      200,
    );
    expect(first.id).not.toBe(second.id);
    expect(await store.list()).toEqual([second, first]);
  });

  it('initialises, retains, and maps durable Postgres reports', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'report-1',
            category: 'bug',
            message: 'The campfire panel closed while cooking.',
            player_id: 'player-one',
            client_at_ms: '90',
            diagnostics: [],
            received_at_ms: '100',
          },
        ],
      });
    const store = new PostgresSupportReportStore({ query });
    await store.initialise();
    await store.add(
      { category: 'bug', message: 'The campfire panel closed while cooking.', diagnostics: [] },
      100,
    );
    expect(await store.list()).toEqual([
      {
        id: 'report-1',
        category: 'bug',
        message: 'The campfire panel closed while cooking.',
        playerId: 'player-one',
        clientAtMs: 90,
        diagnostics: [],
        receivedAtMs: 100,
        status: 'open',
      },
    ]);
    expect(query).toHaveBeenCalledTimes(5);
  });
});
