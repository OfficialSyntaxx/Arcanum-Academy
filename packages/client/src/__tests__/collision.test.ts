import { describe, expect, it } from 'vitest';

import { resolveMovement, type WorldObstacle } from '../world/collision.js';

const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

describe('free-form world collision', () => {
  it('allows a direct walk when no solid is crossed', () => {
    expect(resolveMovement({ x: -4, z: 0 }, { x: 4, z: 0 }, bounds, [], 0.38)).toEqual({
      position: { x: 4, z: 0 },
      collided: false,
    });
  });

  it('stops before a building instead of routing through it', () => {
    const obstacles: WorldObstacle[] = [{ kind: 'rect', minX: -1, maxX: 1, minZ: -2, maxZ: 2 }];
    const result = resolveMovement({ x: -4, z: 0 }, { x: 4, z: 0 }, bounds, obstacles, 0.4);
    expect(result.collided).toBe(true);
    expect(result.position.x).toBeLessThan(-1.39);
    expect(result.position.z).toBe(0);
  });

  it('does not tunnel through a tree on a long frame', () => {
    const obstacles: WorldObstacle[] = [{ kind: 'circle', centre: { x: 0, z: 0 }, radius: 1 }];
    const result = resolveMovement({ x: -8, z: 0 }, { x: 8, z: 0 }, bounds, obstacles, 0.4);
    expect(result.collided).toBe(true);
    expect(result.position.x).toBeLessThan(-1.39);
  });
});
