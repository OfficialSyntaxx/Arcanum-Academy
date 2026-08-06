import { describe, expect, it } from 'vitest';

import { COURTYARD } from '../world/courtyard.js';
import { FOREST } from '../world/forest.js';
import { MOUNTAINS } from '../world/mountains.js';
import { SNOW } from '../world/snow.js';
import { distance, type Zone } from '../world/types.js';

/**
 * Placement sanity checks, over and above what `buildNavGraph` validates.
 *
 * `buildNavGraph` catches a broken graph — an unreachable waypoint, a link to
 * nothing. It does not catch a zone that compiles cleanly but looks wrong: an
 * interactable drawn outside its own zone, a marker sitting on top of another
 * marker, a terrace or a canal that spills past the bounds it is meant to sit
 * inside. Those are geometry mistakes, not graph mistakes, so they need their
 * own pass — one that gathers every problem rather than stopping at the first,
 * for the same reason `buildNavGraph` does.
 */

const ZONES: ReadonlyArray<readonly [string, Zone]> = [
  ['Courtyard', COURTYARD],
  ['Emberwood Reach', FOREST],
  ['Cindermark Heights', MOUNTAINS],
  ['Frostgate Reaches', SNOW],
];

// An interactable is drawn a short offset from the waypoint a player stands
// at to use it (see e.g. the scribing table vs. its approach waypoint). That
// offset should read as "just past the marker", not as "somewhere else".
const MAX_APPROACH_OFFSET = 6;
const MIN_INTERACTABLE_SEPARATION = 1.5;

function withinBounds(
  point: { x: number; z: number },
  bounds: Zone['bounds'],
  margin = 0,
): boolean {
  return (
    point.x >= bounds.minX - margin &&
    point.x <= bounds.maxX + margin &&
    point.z >= bounds.minZ - margin &&
    point.z <= bounds.maxZ + margin
  );
}

describe('zone geometry placement', () => {
  for (const [name, zone] of ZONES) {
    describe(name, () => {
      it('places every interactable within the zone bounds', () => {
        const problems: string[] = [];
        for (const interactable of zone.interactables) {
          if (!withinBounds(interactable.position, zone.bounds)) {
            problems.push(
              `"${interactable.id}" at (${interactable.position.x}, ${interactable.position.z})`,
            );
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });

      it('keeps every interactable a sane distance from its approach waypoint', () => {
        const byId = new Map(zone.waypoints.map((w) => [w.id, w]));
        const problems: string[] = [];
        for (const interactable of zone.interactables) {
          const approach = byId.get(interactable.approach);
          if (!approach) {
            problems.push(`"${interactable.id}" approaches unknown waypoint`);
            continue;
          }
          const d = distance(interactable.position, approach.position);
          if (d === 0) {
            problems.push(`"${interactable.id}" sits exactly on its approach waypoint`);
          } else if (d > approach.radius + MAX_APPROACH_OFFSET) {
            problems.push(
              `"${interactable.id}" is ${d.toFixed(1)}m from its approach waypoint "${approach.id}" (radius ${approach.radius})`,
            );
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });

      it('keeps interactables from overlapping one another', () => {
        const problems: string[] = [];
        for (let i = 0; i < zone.interactables.length; i += 1) {
          for (let j = i + 1; j < zone.interactables.length; j += 1) {
            const a = zone.interactables[i]!;
            const b = zone.interactables[j]!;
            const d = distance(a.position, b.position);
            if (d < MIN_INTERACTABLE_SEPARATION) {
              problems.push(`"${a.id}" and "${b.id}" are ${d.toFixed(2)}m apart`);
            }
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });

      it('keeps every terrace within the zone bounds', () => {
        const problems: string[] = [];
        for (const terrace of zone.terrain.terraces) {
          const corners = [
            { x: terrace.minX, z: terrace.minZ },
            { x: terrace.maxX, z: terrace.maxZ },
          ];
          for (const corner of corners) {
            if (!withinBounds(corner, zone.bounds)) {
              problems.push(
                `terrace [${terrace.minX},${terrace.maxX}]x[${terrace.minZ},${terrace.maxZ}] exceeds bounds`,
              );
            }
          }
          if (terrace.minX >= terrace.maxX || terrace.minZ >= terrace.maxZ) {
            problems.push(
              `terrace [${terrace.minX},${terrace.maxX}]x[${terrace.minZ},${terrace.maxZ}] is degenerate`,
            );
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });

      it('keeps every canal within the zone bounds and shaped correctly', () => {
        const problems: string[] = [];
        for (const canal of zone.terrain.canals) {
          const corners = [
            { x: canal.minX, z: canal.minZ },
            { x: canal.maxX, z: canal.maxZ },
          ];
          for (const corner of corners) {
            if (!withinBounds(corner, zone.bounds)) {
              problems.push(
                `canal [${canal.minX},${canal.maxX}]x[${canal.minZ},${canal.maxZ}] exceeds bounds`,
              );
            }
          }
          if (canal.minX >= canal.maxX || canal.minZ >= canal.maxZ) {
            problems.push(
              `canal [${canal.minX},${canal.maxX}]x[${canal.minZ},${canal.maxZ}] is degenerate`,
            );
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });

      it('keeps every building within the zone bounds with a doorway that fits its wall', () => {
        const byId = new Map(zone.waypoints.map((w) => [w.id, w]));
        const problems: string[] = [];
        for (const building of zone.buildings) {
          const corners = [
            { x: building.minX, z: building.minZ },
            { x: building.maxX, z: building.maxZ },
          ];
          for (const corner of corners) {
            if (!withinBounds(corner, zone.bounds)) {
              problems.push(
                `building [${building.minX},${building.maxX}]x[${building.minZ},${building.maxZ}] exceeds bounds`,
              );
            }
          }
          if (building.minX >= building.maxX || building.minZ >= building.maxZ) {
            problems.push(
              `building [${building.minX},${building.maxX}]x[${building.minZ},${building.maxZ}] is degenerate`,
            );
          }

          const spanIsX = building.doorSide === 'NORTH' || building.doorSide === 'SOUTH';
          const span = spanIsX ? building.maxX - building.minX : building.maxZ - building.minZ;
          // At least a token wall segment remains on each side of the doorway.
          const MIN_JAMB = 0.5;
          if (building.doorWidth > span - MIN_JAMB * 2) {
            problems.push(
              `building's door (width ${building.doorWidth}) does not fit its ${building.doorSide} wall (span ${span})`,
            );
          }
          if (building.doorWidth <= 0) {
            problems.push('building has a non-positive door width');
          }

          const trigger = byId.get(building.doorTrigger);
          if (!trigger) {
            problems.push(`building's doorTrigger "${building.doorTrigger}" does not exist`);
            continue;
          }
          // The trigger waypoint should actually be near the building it
          // opens — otherwise a player could swing a door open from across
          // the zone, which reads as a bug rather than a proximity cue.
          const centre = {
            x: (building.minX + building.maxX) / 2,
            z: (building.minZ + building.maxZ) / 2,
          };
          const d = distance(trigger.position, centre);
          const reach = Math.max(building.maxX - building.minX, building.maxZ - building.minZ);
          if (d > reach + MAX_APPROACH_OFFSET) {
            problems.push(
              `building's doorTrigger "${building.doorTrigger}" is ${d.toFixed(1)}m from the building it opens`,
            );
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });

      it('reaches every interactable-bearing waypoint from spawn via at least one hop', () => {
        // Every interactable's approach waypoint must actually be part of the
        // graph (buildNavGraph already proves the graph is fully connected
        // from spawn, so this only needs to confirm the approach exists).
        const ids = new Set(zone.waypoints.map((w) => w.id));
        const problems: string[] = [];
        for (const interactable of zone.interactables) {
          if (!ids.has(interactable.approach)) {
            problems.push(
              `"${interactable.id}" approaches "${interactable.approach}", which does not exist`,
            );
          }
        }
        expect(problems, problems.join('; ')).toHaveLength(0);
      });
    });
  }
});
