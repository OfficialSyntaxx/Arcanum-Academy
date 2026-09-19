import { describe, expect, it } from 'vitest';
import { DISCOVERY_CATALOG, discoveryForSource, recordDiscovery } from '../index.js';

describe('discovery catalog', () => {
  it('has unique authored entries, including the Cinderhollow loop', () => {
    expect(new Set(DISCOVERY_CATALOG.map((entry) => entry.id)).size).toBe(DISCOVERY_CATALOG.length);
    expect(DISCOVERY_CATALOG.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'discovery.gather.cinder_ore',
        'discovery.combat.cinderbound_wisp',
        'discovery.craft.cindersteel',
        'discovery.dungeon.cinderhollow_entered',
      ]),
    );
  });

  it('maps only known confirmed event sources and records them once', () => {
    const id = discoveryForSource('int.combat.shore_wolf');
    const first = recordDiscovery({}, id, 123);
    expect(first).toEqual({ 'discovery.combat.shore_wolf': { unlockedAtMs: 123 } });
    expect(recordDiscovery(first, id, 456)).toBe(first);
    expect(recordDiscovery(first, discoveryForSource('not.real'), 456)).toBe(first);
    expect(discoveryForSource('node.cinderhollow.ore_vein')).toBe('discovery.gather.cinder_ore');
    expect(discoveryForSource('event.cinderhollow.entered')).toBe(
      'discovery.dungeon.cinderhollow_entered',
    );
  });
});
