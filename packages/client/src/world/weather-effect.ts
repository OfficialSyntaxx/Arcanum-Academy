/** Lightweight, instanced rain presentation for the active zone. */

import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';

import type { QualitySettings } from '../core/device.js';
import type { WeatherConditions } from './weather.js';

/**
 * The effect intentionally follows the camera/player focus instead of covering
 * the whole map. This caps fill and instance work on a phone while still making
 * rain immediately readable. It has no collider or raycast surface.
 */
export class WeatherEffect {
  readonly group = new Group();
  private readonly rain: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly matrix = new Matrix4();
  private readonly drops: readonly Drop[];

  constructor(quality: QualitySettings) {
    const count = Math.max(12, Math.floor(quality.particleBudget / 10));
    const geometry = new BoxGeometry(0.025, 0.6, 0.025);
    const material = new MeshBasicMaterial({
      color: 0xb8d7e6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rain = new InstancedMesh(geometry, material, count);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.raycast = () => {};
    this.drops = Array.from({ length: count }, (_, index) => seededDrop(index));
    this.group.add(this.rain);
  }

  update(conditions: WeatherConditions, focusX: number, focusZ: number, nowMs: number): void {
    this.group.position.set(focusX, 0, focusZ);
    this.rain.visible = conditions.rainOpacity > 0;
    this.rain.material.opacity = conditions.rainOpacity;
    if (!this.rain.visible) return;

    const seconds = nowMs / 1_000;
    for (let index = 0; index < this.drops.length; index += 1) {
      const drop = this.drops[index]!;
      const y = 1 + positiveModulo(drop.phase - seconds * (7.2 + drop.speed * 2.1), 10.5);
      this.matrix.makeTranslation(drop.x, y, drop.z);
      this.rain.setMatrixAt(index, this.matrix);
    }
    this.rain.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.group.clear();
  }
}

interface Drop {
  readonly x: number;
  readonly z: number;
  readonly phase: number;
  readonly speed: number;
}

function seededDrop(index: number): Drop {
  const unit = (salt: number) => {
    const mixed = Math.imul(index + 1, 2_654_435_761) ^ Math.imul(salt, 1_597_334_677);
    return (mixed >>> 0) / 0x1_0000_0000;
  };
  return {
    x: (unit(1) - 0.5) * 24,
    z: (unit(2) - 0.5) * 20,
    phase: unit(3) * 10.5,
    speed: unit(4),
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
