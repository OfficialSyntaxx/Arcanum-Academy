import { describe, expect, it, vi } from 'vitest';
import { AdminApi, AdminApiError, normalizeEndpoint } from '../api.js';

describe('operations API client', () => {
  it('normalizes only HTTP endpoints', () => {
    expect(normalizeEndpoint(' https://ops.example.test/ ')).toBe('https://ops.example.test');
    expect(() => normalizeEndpoint('file:///tmp/admin')).toThrow(/HTTP/);
  });

  it('keeps credentials in an authorization header and encodes identifiers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ player: {}, state: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = new AdminApi('https://server.example.test', 'private token', fetcher);
    await api.player('player/name?secret');
    expect(fetcher).toHaveBeenCalledWith(
      'https://server.example.test/admin/players/player%2Fname%3Fsecret',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({ authorization: 'Bearer private token' }),
      }),
    );
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('private token');
  });

  it('does not expose mutation methods and conceals auth failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const api = new AdminApi('https://server.example.test', 'private token', fetcher);
    expect('restore' in api).toBe(false);
    await expect(api.searchPlayers()).rejects.toEqual(expect.any(AdminApiError));
    await expect(api.searchPlayers()).rejects.toThrow(/credentials refused/);
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
    const api = new AdminApi('https://server.example.test', 'private token', fetcher);
    await api.overview();
    await api.reports();
    await api.diagnostics();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://server.example.test/admin/overview',
      'https://server.example.test/admin/reports',
      'https://server.example.test/admin/diagnostics',
    ]);
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
});
