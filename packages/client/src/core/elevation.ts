import { heightAt, type Vec2, type ZoneTerrain } from '@alderfell/shared';

/** Whether an authored route crosses a terrain-height boundary. */
export function hasElevationChange(terrain: ZoneTerrain, from: Vec2, to: Vec2): boolean {
  return heightAt(terrain, from) !== heightAt(terrain, to);
}
