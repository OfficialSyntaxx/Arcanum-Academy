import { buildNavGraph, COURTYARD, type NavGraph, type WaypointId } from '@arcanum/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createMover,
  followPath,
  normaliseAngle,
  setPath,
  steer,
  turnToward,
} from '../locomotion.js';
import { Pathfinder } from '../nav.js';
import {
  currentScheduleEntry,
  minutesUntilNextEntry,
  selectBark,
  worldMinuteOf,
} from '../schedule.js';

let graph: NavGraph;
let pathfinder: Pathfinder;

beforeAll(() => {
  const result = buildNavGraph(COURTYARD);
  if (!result.ok) throw new Error(result.error.detail);
  graph = result.value;
  pathfinder = new Pathfinder(graph);
});

const node = (id: string): number => graph.indexOf(id as WaypointId);

describe('Pathfinder', () => {
  it('returns a single-node path when already at the goal', () => {
    expect(pathfinder.find(node('wp.plaza.center'), node('wp.plaza.center'))).toEqual([
      node('wp.plaza.center'),
    ]);
  });

  it('prefers the corner ring over the plaza centre when it is shorter', () => {
    const path = pathfinder.find(node('wp.mines.seam'), node('wp.duel.circle.south'));
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toBe(node('wp.mines.seam'));
    expect(path[path.length - 1]).toBe(node('wp.duel.circle.south'));
    // The diagonal corner waypoints exist precisely so cross-courtyard trips do
    // not detour through the middle; if this ever routes via the centre, the
    // ring edges have been broken.
    expect(path).toContain(node('wp.plaza.southwest'));
    expect(path).not.toContain(node('wp.plaza.center'));
  });

  it('produces contiguous paths: every step is an actual edge', () => {
    const path = pathfinder.find(node('wp.grove.stand'), node('wp.library.stacks'));
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1]!;
      const from = graph.neighbourOffsets[previous]!;
      const to = graph.neighbourOffsets[previous + 1]!;
      const neighbours = Array.from(graph.neighbourIndices.slice(from, to));
      expect(neighbours).toContain(path[i]);
    }
  });

  it('is deterministic across repeated searches', () => {
    const a = pathfinder.find(node('wp.arcade.consignment'), node('wp.garden.patch'));
    const b = pathfinder.find(node('wp.arcade.consignment'), node('wp.garden.patch'));
    const c = new Pathfinder(graph).find(node('wp.arcade.consignment'), node('wp.garden.patch'));
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it('returns an empty path for an out-of-range index', () => {
    expect(pathfinder.find(-1, 0)).toEqual([]);
    expect(pathfinder.find(0, 9999)).toEqual([]);
  });

  it('reaches every waypoint from spawn', () => {
    const spawn = node(COURTYARD.spawn);
    for (let i = 0; i < graph.nodes.length; i += 1) {
      expect(pathfinder.find(spawn, i).length).toBeGreaterThan(0);
    }
  });
});

describe('locomotion', () => {
  const params = { speed: 4, turnRate: 100, arrivalRadius: 0.1 };

  it('walks toward the next path node', () => {
    const mover = setPath(createMover({ x: 0, z: 0 }), [{ x: 10, z: 0 }], params.arrivalRadius);
    const stepped = followPath(mover, params, 0.5);
    expect(stepped.position.x).toBeCloseTo(2);
    expect(stepped.velocity).toBeCloseTo(4);
  });

  it('carries leftover distance across several path nodes in one step', () => {
    const mover = setPath(
      createMover({ x: 0, z: 0 }),
      [
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ],
      params.arrivalRadius,
    );
    const stepped = followPath(mover, params, 1);
    expect(stepped.position.x).toBeCloseTo(3);
    expect(stepped.path).toHaveLength(0);
  });

  it('clears the path and reports zero velocity on arrival', () => {
    let mover = setPath(createMover({ x: 0, z: 0 }), [{ x: 1, z: 0 }], params.arrivalRadius);
    mover = followPath(mover, params, 1);
    expect(mover.path).toHaveLength(0);
    expect(followPath(mover, params, 1).velocity).toBe(0);
  });

  it('drops a leading path node the mover already stands on', () => {
    const mover = setPath(
      createMover({ x: 0, z: 0 }),
      [
        { x: 0, z: 0 },
        { x: 5, z: 0 },
      ],
      0.5,
    );
    expect(mover.pathIndex).toBe(1);
  });

  it('scales steering speed by stick deflection and clamps to bounds', () => {
    const bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const half = steer(createMover({ x: 0, z: 0 }), 0.5, 0, params, 1);
    expect(half.velocity).toBeCloseTo(2);
    const clamped = steer(createMover({ x: 0, z: 0 }), 1, 0, params, 1, bounds);
    expect(clamped.position.x).toBe(1);
  });

  it('treats a dead stick as a stop', () => {
    const stopped = steer(createMover({ x: 3, z: 3 }), 0.01, 0, params, 1);
    expect(stopped.velocity).toBe(0);
    expect(stopped.position).toEqual({ x: 3, z: 3 });
  });

  it('turns the short way round and never exceeds the turn rate', () => {
    expect(turnToward(3, -3, 100, 1)).toBeCloseTo(-3);
    const limited = turnToward(0, Math.PI, 0.5, 1);
    expect(Math.abs(limited)).toBeCloseTo(0.5);
  });

  it('normalises angles into (-PI, PI]', () => {
    expect(normaliseAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normaliseAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normaliseAngle(0)).toBe(0);
  });
});

describe('world clock and schedules', () => {
  const day = 3_600_000;

  it('maps real time onto the in-world day', () => {
    expect(worldMinuteOf(0, day)).toBe(0);
    expect(worldMinuteOf(day / 2, day)).toBe(720);
    expect(worldMinuteOf(day, day)).toBe(0);
    expect(worldMinuteOf(-day / 4, day)).toBe(1080);
  });

  it('holds the last entry of the day overnight', () => {
    const schedule = COURTYARD.npcs[0]!.schedule;
    const overnight = currentScheduleEntry(schedule, 2 * 60);
    expect(overnight).toBe(schedule[schedule.length - 1]);
  });

  it('selects the entry in force at a given minute', () => {
    const schedule = COURTYARD.npcs[0]!.schedule;
    expect(currentScheduleEntry(schedule, 13 * 60).startMinute).toBe(12 * 60);
  });

  it('reports minutes to the next change, wrapping past midnight', () => {
    const schedule = COURTYARD.npcs[0]!.schedule;
    expect(minutesUntilNextEntry(schedule, 11 * 60)).toBe(60);
    expect(minutesUntilNextEntry(schedule, 23 * 60)).toBe(7 * 60);
  });

  it('picks the same bark for the same npc and rotation', () => {
    const npc = COURTYARD.npcs[3]!;
    expect(selectBark(npc, 7)).toBe(selectBark(npc, 7));
    expect(npc.barks).toContain(selectBark(npc, 7));
  });
});
