import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { COURTYARD } from '@alderfell/shared';
import { buildBaseGround } from '../world/scene-builder.js';

describe('ground surface', () => {
  it('does not cover the sunken mine with the base floor', () => {
    const geometry = buildBaseGround(COURTYARD);
    const material = new MeshBasicMaterial();
    const ground = new Mesh(geometry, material);
    ground.updateMatrixWorld();
    const ray = new Raycaster(new Vector3(-18, 10, -18), new Vector3(0, -1, 0));
    expect(ray.intersectObject(ground)).toHaveLength(0);
    ray.set(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
    expect(ray.intersectObject(ground).length).toBeGreaterThan(0);
    geometry.dispose();
    material.dispose();
  });
});
