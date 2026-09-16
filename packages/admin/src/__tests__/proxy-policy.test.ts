import { describe, expect, it } from 'vitest';
import { permittedAdminPath, proxyTarget } from '../proxy-policy.js';

describe('operations proxy policy', () => {
  it('allows only the authored read-only operations routes', () => {
    expect(permittedAdminPath('/admin/overview')).toBe(true);
    expect(permittedAdminPath('/admin/players/player-alpha/snapshots/snap-1')).toBe(true);
    expect(permittedAdminPath('/admin/players/player-alpha/restore-audit')).toBe(true);
    expect(permittedAdminPath('/admin/players/player-alpha/restore')).toBe(false);
    expect(permittedAdminPath('/admin/secrets')).toBe(false);
    expect(permittedAdminPath('/admin/players/../diagnostics')).toBe(false);
    expect(permittedAdminPath('/admin/players/player%2Fdiagnostics')).toBe(false);
  });

  it('preserves safe query parameters while pinning the configured server origin', () => {
    const target = proxyTarget(
      'https://operations.example/.netlify/functions/admin-proxy/admin/players?q=alpha&limit=25',
      'https://server.example/',
    );
    expect(target?.toString()).toBe('https://server.example/admin/players?q=alpha&limit=25');
    expect(
      proxyTarget(
        'https://operations.example/.netlify/functions/admin-proxy/admin/private',
        'https://server.example',
      ),
    ).toBeNull();
  });
});
