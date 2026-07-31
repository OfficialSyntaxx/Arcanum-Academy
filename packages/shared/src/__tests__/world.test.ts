import { describe, expect, it } from 'vitest';

import { buildNavGraph } from '../world/graph.js';
import { COURTYARD } from '../world/courtyard.js';
import { heightAt, type Waypoint, type Zone } from '../world/types.js';
import type { WaypointId, ZoneId } from '../ids.js';

function waypoint(id: string, x: number, z: number, links: string[]): Waypoint {
  return {
    id: id as WaypointId,
    position: { x, z },
    radius: 1,
    links: links as WaypointId[],
  };
}

function zoneWith(waypoints: Waypoint[], spawn = 'a'): Zone {
  return {
    id: 'zone.test' as ZoneId,
    name: 'Test',
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    terrain: { baseHeight: 0, terraces: [] },
    spawn: spawn as WaypointId,
    waypoints,
    interactables: [],
    npcs: [],
    ambientPopulation: 0,
    atmosphere: 'test',
  };
}

describe('buildNavGraph', () => {
  it('compiles the shipped courtyard without validation errors', () => {
    const result = buildNavGraph(COURTYARD);
    expect(result.ok, result.ok ? '' : result.error.detail).toBe(true);
  });

  it('indexes every waypoint of the courtyard', () => {
    const result = buildNavGraph(COURTYARD);
    if (!result.ok) throw new Error(result.error.detail);
    expect(result.value.nodes).toHaveLength(COURTYARD.waypoints.length);
    expect(result.value.indexOf(COURTYARD.spawn)).toBeGreaterThanOrEqual(0);
  });

  it('rejects a link to a waypoint that does not exist', () => {
    const result = buildNavGraph(zoneWith([waypoint('a', 0, 0, ['ghost'])]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain('unknown "ghost"');
  });

  it('rejects a one-way edge', () => {
    const result = buildNavGraph(zoneWith([waypoint('a', 0, 0, ['b']), waypoint('b', 1, 0, [])]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain('not reciprocated');
  });

  it('rejects a waypoint island unreachable from spawn', () => {
    const result = buildNavGraph(
      zoneWith([
        waypoint('a', 0, 0, ['b']),
        waypoint('b', 1, 0, ['a']),
        waypoint('c', 20, 20, ['d']),
        waypoint('d', 21, 20, ['c']),
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('world.zone_disconnected');
  });

  it('rejects a waypoint outside the zone bounds', () => {
    const result = buildNavGraph(zoneWith([waypoint('a', 900, 0, [])]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain('outside zone bounds');
  });

  it('snaps an arbitrary point to the closest node', () => {
    const result = buildNavGraph(
      zoneWith([waypoint('a', 0, 0, ['b']), waypoint('b', 10, 0, ['a'])]),
    );
    if (!result.ok) throw new Error(result.error.detail);
    expect(result.value.nodes[result.value.nearest({ x: 9, z: 1 })]!.id).toBe('b');
  });
});

describe('heightAt', () => {
  it('returns the base height away from any terrace', () => {
    expect(heightAt(COURTYARD.terrain, { x: 0, z: 0 })).toBe(0);
  });

  it('lifts the player onto the scribing hall terrace', () => {
    expect(heightAt(COURTYARD.terrain, { x: 0, z: -19 })).toBeGreaterThan(0);
  });

  it('takes the highest overlapping terrace', () => {
    const terrain = {
      baseHeight: 0,
      terraces: [
        { minX: -5, maxX: 5, minZ: -5, maxZ: 5, height: 1 },
        { minX: -2, maxX: 2, minZ: -2, maxZ: 2, height: 3 },
      ],
    };
    expect(heightAt(terrain, { x: 0, z: 0 })).toBe(3);
    expect(heightAt(terrain, { x: 4, z: 0 })).toBe(1);
  });
});
