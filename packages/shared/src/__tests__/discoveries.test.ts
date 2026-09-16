import { describe, expect, it } from 'vitest';
import { DISCOVERY_CATALOG, discoveryForSource, recordDiscovery } from '../index.js';

describe('discovery catalog', () => {
  it('has unique authored entries for every initial Shorelands discovery', () => {
    expect(new Set(DISCOVERY_CATALOG.map((entry) => entry.id)).size).toBe(DISCOVERY_CATALOG.length);
    expect(DISCOVERY_CATALOG).toHaveLength(15);
  });

  it('maps only known confirmed event sources and records them once', () => {
    const id = discoveryForSource('int.combat.shore_wolf');
    const first = recordDiscovery({}, id, 123);
    expect(first).toEqual({ 'discovery.combat.shore_wolf': { unlockedAtMs: 123 } });
    expect(recordDiscovery(first, id, 456)).toBe(first);
    expect(recordDiscovery(first, discoveryForSource('not.real'), 456)).toBe(first);
  });
});
