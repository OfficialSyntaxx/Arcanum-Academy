import { describe, expect, it } from 'vitest';

import { buildNavGraph } from '../world/graph.js';
import { COURTYARD } from '../world/courtyard.js';
import { FOREST } from '../world/forest.js';
import { MOUNTAINS } from '../world/mountains.js';
import { SNOW } from '../world/snow.js';
import { SALTWAKE_RUINS } from '../world/saltwake.js';
import { CINDERHOLLOW } from '../world/cinderhollow.js';
import { ASHEN_OVERLOOK } from '../world/ashen-overlook.js';
import { zoneById, ZONES_BY_ID } from '../world/zone-catalog.js';
import { heightAt, InteractableKind, type Waypoint, type Zone } from '../world/types.js';
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
    terrain: { baseHeight: 0, terraces: [], canals: [] },
    spawn: spawn as WaypointId,
    waypoints,
    interactables: [],
    buildings: [],
    npcs: [],
    ambientPopulation: 0,
    atmosphere: 'test',
  };
}

const SHIPPED_ZONES: readonly Zone[] = [
  COURTYARD,
  FOREST,
  MOUNTAINS,
  SNOW,
  SALTWAKE_RUINS,
  CINDERHOLLOW,
  ASHEN_OVERLOOK,
];

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

  it.each([
    ['Emberwood Reach', FOREST],
    ['Cindermark Heights', MOUNTAINS],
    ['Frostgate Reaches', SNOW],
    ['Saltwake Ruins', SALTWAKE_RUINS],
    ['Cinderhollow Caverns', CINDERHOLLOW],
    ['Ashen Overlook', ASHEN_OVERLOOK],
  ])('compiles the %s without validation errors', (_name, zone) => {
    const result = buildNavGraph(zone);
    expect(result.ok, result.ok ? '' : result.error.detail).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toHaveLength(zone.waypoints.length);
    expect(result.value.indexOf(zone.spawn)).toBeGreaterThanOrEqual(0);
  });

  it("gives Cinderhollow's full route concise local-map landmark names", () => {
    expect(CINDERHOLLOW.waypoints.map((waypoint) => waypoint.label)).toEqual([
      'Cavern Mouth',
      'Ember Gallery',
      'Cindermark Fork',
      'Ore Rim',
      'Crucible Chamber',
      'Ashen Rise',
    ]);
  });

  it('routes Ashen Overlook through a named elevation transition', () => {
    expect(ASHEN_OVERLOOK.waypoints.map((waypoint) => waypoint.label)).toEqual([
      'Cliff Path',
      'Basalt Steps',
      'Basalt Steps',
      'Ember Crossroads',
      'Ember Vista',
      'Glasswind Shelf',
      "Watcher's Crown",
    ]);
    expect(ASHEN_OVERLOOK.waypoints[0]!.links).toEqual([ASHEN_OVERLOOK.waypoints[1]!.id]);
    const crossroads = ASHEN_OVERLOOK.waypoints[3]!;
    expect(crossroads.links).toHaveLength(4);
    expect(
      ASHEN_OVERLOOK.waypoints.filter((waypoint) => waypoint.tags?.includes('destination')),
    ).toHaveLength(3);
  });

  it('resolves every real zone id through the catalog, and an unknown id to null', () => {
    expect(ZONES_BY_ID.size).toBe(7);
    expect(zoneById(COURTYARD.id)).toBe(COURTYARD);
    expect(zoneById(FOREST.id)).toBe(FOREST);
    expect(zoneById(MOUNTAINS.id)).toBe(MOUNTAINS);
    expect(zoneById(SNOW.id)).toBe(SNOW);
    expect(zoneById(SALTWAKE_RUINS.id)).toBe(SALTWAKE_RUINS);
    expect(zoneById(CINDERHOLLOW.id)).toBe(CINDERHOLLOW);
    expect(zoneById(ASHEN_OVERLOOK.id)).toBe(ASHEN_OVERLOOK);
    expect(zoneById('zone.nonexistent' as ZoneId)).toBeNull();
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

describe('shipped interaction contracts', () => {
  it('gives every action a unique id, usable copy, and a local approach point', () => {
    const seen = new Set<string>();
    for (const zone of SHIPPED_ZONES) {
      const waypoints = new Set(zone.waypoints.map((waypoint) => waypoint.id));
      for (const interactable of zone.interactables) {
        expect(seen.has(interactable.id), `${interactable.id} is defined more than once`).toBe(
          false,
        );
        seen.add(interactable.id);
        expect(interactable.label.trim(), `${interactable.id} has a label`).not.toBe('');
        expect(interactable.verb.trim(), `${interactable.id} has an action verb`).not.toBe('');
        expect(
          waypoints.has(interactable.approach),
          `${interactable.id} has a local approach`,
        ).toBe(true);
      }
    }
  });

  it('routes every authored portal to a known zone and keeps other actions local', () => {
    for (const zone of SHIPPED_ZONES) {
      for (const interactable of zone.interactables) {
        if (interactable.kind === InteractableKind.ZonePortal) {
          expect(interactable.targetZone, `${interactable.id} names a target zone`).toBeDefined();
          expect(zoneById(interactable.targetZone!)).not.toBeNull();
        } else {
          expect(interactable.targetZone, `${interactable.id} is not a portal`).toBeUndefined();
        }
      }
    }
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
      canals: [],
    };
    expect(heightAt(terrain, { x: 0, z: 0 })).toBe(3);
    expect(heightAt(terrain, { x: 4, z: 0 })).toBe(1);
  });
});
