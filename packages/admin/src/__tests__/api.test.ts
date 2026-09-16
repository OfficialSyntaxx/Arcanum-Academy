import { describe, expect, it, vi } from 'vitest';
import { AdminApi, AdminApiError } from '../api.js';

describe('operations API client', () => {
  it('uses the same-origin authenticated proxy and encodes identifiers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ player: {}, state: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = new AdminApi(fetcher);
    await api.player('player/name?secret');
    expect(fetcher).toHaveBeenCalledWith(
      '/.netlify/functions/admin-proxy/admin/players/player%2Fname%3Fsecret',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      }),
    );
  });

  it('reports authentication failures while keeping mutations explicit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const api = new AdminApi(fetcher);
    await expect(api.searchPlayers()).rejects.toEqual(expect.any(AdminApiError));
    await expect(api.searchPlayers()).rejects.toThrow(/not found/);
  });

  it('sends a restore only through the same-origin proxy', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const api = new AdminApi(fetcher);
    await api.restore('player-alpha', {
      snapshotId: 'snapshot-1',
      expectedVersion: 4,
      reason: 'Recover confirmed lost progress.',
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/.netlify/functions/admin-proxy/admin/players/player-alpha/restore',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });

  it('provides only read methods for overview, reports, and diagnostics', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const api = new AdminApi(fetcher);
    await api.overview();
    await api.reports();
    await api.diagnostics();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/.netlify/functions/admin-proxy/admin/overview',
      '/.netlify/functions/admin-proxy/admin/reports',
      '/.netlify/functions/admin-proxy/admin/diagnostics',
    ]);
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
});
