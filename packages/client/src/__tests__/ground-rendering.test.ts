import { describe, expect, it } from 'vitest';
import { InstancedMesh, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { CINDERHOLLOW, COURTYARD } from '@alderfell/shared';
import { buildBaseGround, buildZoneGeometry } from '../world/scene-builder.js';

const testQuality = {
  tier: 'low' as const,
  pixelRatio: 1,
  shadowsEnabled: false,
  antialias: false,
  maxAmbientActors: 6,
  particleBudget: 96,
  targetFps: 60,
};

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

  it('keeps authored Cinderhollow elevation links visible as paths', () => {
    const geometry = buildZoneGeometry(CINDERHOLLOW, testQuality);
    const paths = geometry.group.getObjectByName('authored-paths');
    expect(paths).toBeInstanceOf(InstancedMesh);
    expect((paths as InstancedMesh).count).toBe(5);
    geometry.dispose();
  });
});
