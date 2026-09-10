/** Free-form player collision against solid authored scenery. */
import type { Vec2, Zone, ZoneBounds } from '@alderfell/shared';

export interface CircleObstacle {
  readonly kind: 'circle';
  readonly centre: Vec2;
  readonly radius: number;
}
export interface RectObstacle {
  readonly kind: 'rect';
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
export type WorldObstacle = CircleObstacle | RectObstacle;
export interface MovementResolution {
  readonly position: Vec2;
  readonly collided: boolean;
}

const CONTACT_EPSILON = 0.025;

export function authoredObstacles(zone: Zone): readonly WorldObstacle[] {
  return [
    ...zone.buildings.map((building): RectObstacle => ({
      kind: 'rect',
      minX: building.minX,
      maxX: building.maxX,
      minZ: building.minZ,
      maxZ: building.maxZ,
    })),
    ...zone.terrain.canals.map((canal): RectObstacle => ({
      kind: 'rect',
      minX: canal.minX,
      maxX: canal.maxX,
      minZ: canal.minZ,
      maxZ: canal.maxZ,
    })),
  ];
}

/** Stops at the first solid crossed on this frame; the player chooses their own way around it. */
export function resolveMovement(
  from: Vec2,
  requested: Vec2,
  bounds: ZoneBounds,
  obstacles: readonly WorldObstacle[],
  radius: number,
): MovementResolution {
  const target = {
    x: clamp(requested.x, bounds.minX + radius, bounds.maxX - radius),
    z: clamp(requested.z, bounds.minZ + radius, bounds.maxZ - radius),
  };
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return { position: target, collided: false };
  let contact = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    const hit =
      obstacle.kind === 'rect'
        ? segmentRectContact(from, target, obstacle, radius)
        : segmentCircleContact(from, target, obstacle, radius);
    if (hit !== null) contact = Math.min(contact, hit);
  }
  if (!Number.isFinite(contact)) return { position: target, collided: false };
  const safeT = Math.max(0, contact - CONTACT_EPSILON / distance);
  return { position: { x: from.x + dx * safeT, z: from.z + dz * safeT }, collided: true };
}

/** True when the centre of a player-sized actor can occupy this point. */
export function isPointWalkable(
  point: Vec2,
  bounds: ZoneBounds,
  obstacles: readonly WorldObstacle[],
  radius: number,
): boolean {
  if (
    point.x < bounds.minX + radius ||
    point.x > bounds.maxX - radius ||
    point.z < bounds.minZ + radius ||
    point.z > bounds.maxZ - radius
  )
    return false;
  return !obstacles.some((obstacle) => {
    if (obstacle.kind === 'circle') {
      const dx = point.x - obstacle.centre.x;
      const dz = point.z - obstacle.centre.z;
      return dx * dx + dz * dz < (obstacle.radius + radius) ** 2;
    }
    return (
      point.x > obstacle.minX - radius &&
      point.x < obstacle.maxX + radius &&
      point.z > obstacle.minZ - radius &&
      point.z < obstacle.maxZ + radius
    );
  });
}

function segmentRectContact(
  from: Vec2,
  to: Vec2,
  obstacle: RectObstacle,
  radius: number,
): number | null {
  const x = slab(from.x, to.x - from.x, obstacle.minX - radius, obstacle.maxX + radius);
  const z = slab(from.z, to.z - from.z, obstacle.minZ - radius, obstacle.maxZ + radius);
  const entry = Math.max(x.entry, z.entry);
  const exit = Math.min(x.exit, z.exit);
  return entry > exit || exit < 0 || entry > 1 ? null : Math.max(0, entry);
}

function slab(origin: number, delta: number, min: number, max: number) {
  if (Math.abs(delta) < 0.000001)
    return origin < min || origin > max
      ? { entry: Infinity, exit: -Infinity }
      : { entry: -Infinity, exit: Infinity };
  const one = (min - origin) / delta;
  const two = (max - origin) / delta;
  return { entry: Math.min(one, two), exit: Math.max(one, two) };
}

function segmentCircleContact(
  from: Vec2,
  to: Vec2,
  obstacle: CircleObstacle,
  radius: number,
): number | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const ox = from.x - obstacle.centre.x;
  const oz = from.z - obstacle.centre.z;
  const combinedRadius = obstacle.radius + radius;
  const c = ox * ox + oz * oz - combinedRadius * combinedRadius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
  return entry >= 0 && entry <= 1 ? entry : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
