import { describe, expect, it, vi } from 'vitest';
import { submitSupportReport, supportReportUrl } from '../app/support-reporter.js';

describe('support reporter', () => {
  it('derives the HTTPS report route from the socket endpoint', () => {
    expect(supportReportUrl('wss://alderfell-server.example/gateway?x=1')).toBe(
      'https://alderfell-server.example/support/reports',
    );
  });

  it('submits bounded diagnostic context without credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true, reportId: 'report-1' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const receipt = await submitSupportReport(
      'wss://server.example/gateway',
      {
        category: 'bug',
        message: '  The campfire panel closed unexpectedly.  ',
        playerId: 'player-one',
        diagnostics: [{ id: 1, level: 'warn', source: 'world', message: 'panel closed', atMs: 10 }],
      },
      fetcher,
    );
    expect(receipt).toBe('report-1');
    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      category: 'bug',
      message: 'The campfire panel closed unexpectedly.',
      playerId: 'player-one',
      diagnostics: [{ level: 'warn', source: 'world', message: 'panel closed', atMs: 10 }],
    });
  });
});
