/**
 * Movement integration for anything that walks: the player, named NPCs, and the
 * ambient crowd all run through these functions.
 *
 * Pure and allocation-light: each step returns a new state object rather than
 * mutating, so a mover can be snapshotted, rewound and replayed by the kernel.
 * Positions translate directly toward the target while facing eases separately —
 * turning the avatar before it moves feels sluggish under a thumb, and on a
 * phone responsiveness beats physical plausibility.
 */

import type { Vec2, ZoneBounds } from '@arcanum/shared';

export interface LocomotionParams {
  /** Metres per second. */
  readonly speed: number;
  /** Radians per second of turning. */
  readonly turnRate: number;
  /** How close counts as having reached a path node. */
  readonly arrivalRadius: number;
}

export interface Mover {
  readonly position: Vec2;
  /** Radians, 0 = facing +Z, increasing toward +X. */
  readonly facing: number;
  /** Remaining path nodes, in order. Empty when not path-following. */
  readonly path: readonly Vec2[];
  readonly pathIndex: number;
  /** Metres per second actually travelled last step; drives the walk blend. */
  readonly velocity: number;
}

export function createMover(position: Vec2, facing = 0): Mover {
  return { position, facing, path: [], pathIndex: 0, velocity: 0 };
}

export function isMoving(mover: Mover): boolean {
  return mover.pathIndex < mover.path.length;
}

/**
 * Assigns a path. The first node is dropped when the mover already stands
 * inside it, so a route beginning at the mover's own waypoint does not produce
 * a visible step backwards toward the node centre.
 */
export function setPath(mover: Mover, path: readonly Vec2[], arrivalRadius: number): Mover {
  if (path.length === 0) return { ...mover, path: [], pathIndex: 0, velocity: 0 };
  const first = path[0]!;
  const startIndex =
    distanceSquared(mover.position, first) <= arrivalRadius * arrivalRadius ? 1 : 0;
  return { ...mover, path, pathIndex: startIndex, velocity: 0 };
}

export function stop(mover: Mover): Mover {
  return { ...mover, path: [], pathIndex: 0, velocity: 0 };
}

/**
 * Advances one step along the assigned path.
 *
 * Handles the overshoot case explicitly: at high speed and a small timestep the
 * mover can pass several path nodes in one step, so the remaining travel budget
 * is carried forward through the loop rather than wasted, which is what stops
 * fast movers from visibly stuttering at corners.
 */
export function followPath(mover: Mover, params: LocomotionParams, dtSeconds: number): Mover {
  if (!isMoving(mover) || dtSeconds <= 0) {
    return mover.velocity === 0 ? mover : { ...mover, velocity: 0 };
  }

  let budget = params.speed * dtSeconds;
  let position = mover.position;
  let index = mover.pathIndex;
  let travelled = 0;
  let heading = mover.facing;

  while (budget > 0 && index < mover.path.length) {
    const target = mover.path[index]!;
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const gap = Math.sqrt(dx * dx + dz * dz);

    if (gap <= params.arrivalRadius || gap === 0) {
      index += 1;
      continue;
    }

    heading = Math.atan2(dx, dz);
    if (gap <= budget) {
      position = target;
      travelled += gap;
      budget -= gap;
      index += 1;
    } else {
      const scale = budget / gap;
      position = { x: position.x + dx * scale, z: position.z + dz * scale };
      travelled += budget;
      budget = 0;
    }
  }

  const finished = index >= mover.path.length;
  return {
    position,
    facing: turnToward(mover.facing, heading, params.turnRate, dtSeconds),
    path: finished ? [] : mover.path,
    pathIndex: finished ? 0 : index,
    velocity: travelled / dtSeconds,
  };
}

/**
 * Direct steering from an analogue stick. `inputX`/`inputZ` form a vector in
 * world space whose magnitude (0..1) scales speed, so a light thumb walks and a
 * full deflection runs. Assigning a path and steering are mutually exclusive;
 * steering clears any path, because a player grabbing the stick has overridden
 * wherever they previously tapped.
 */
export function steer(
  mover: Mover,
  inputX: number,
  inputZ: number,
  params: LocomotionParams,
  dtSeconds: number,
  bounds?: ZoneBounds,
): Mover {
  const magnitude = Math.min(1, Math.sqrt(inputX * inputX + inputZ * inputZ));
  if (magnitude < 0.05 || dtSeconds <= 0) {
    return { ...mover, path: [], pathIndex: 0, velocity: 0 };
  }

  const normalX = inputX / magnitude;
  const normalZ = inputZ / magnitude;
  const speed = params.speed * magnitude;
  const step = speed * dtSeconds;
  let position = {
    x: mover.position.x + normalX * step,
    z: mover.position.z + normalZ * step,
  };
  if (bounds) position = clampToBounds(position, bounds);

  return {
    position,
    facing: turnToward(mover.facing, Math.atan2(normalX, normalZ), params.turnRate, dtSeconds),
    path: [],
    pathIndex: 0,
    velocity: speed,
  };
}

/** Eases an angle toward a target by at most `rate * dt`, the short way round. */
export function turnToward(
  current: number,
  target: number,
  rate: number,
  dtSeconds: number,
): number {
  const delta = normaliseAngle(target - current);
  const maxStep = rate * dtSeconds;
  if (Math.abs(delta) <= maxStep) return normaliseAngle(target);
  return normaliseAngle(current + Math.sign(delta) * maxStep);
}

/** Wraps to (-PI, PI], so angle comparisons never wind up. */
export function normaliseAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  let angle = radians % twoPi;
  if (angle > Math.PI) angle -= twoPi;
  if (angle <= -Math.PI) angle += twoPi;
  return angle;
}

export function clampToBounds(point: Vec2, bounds: ZoneBounds): Vec2 {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, point.z)),
  };
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
