import { describe, expect, it } from 'vitest';
import { TIDEGLASS_TRAIL } from '../clues/catalog.js';
import { ZONES_BY_ID } from '../world/zone-catalog.js';

describe('treasure clue catalog', () => {
  it('has unique ordered sites, each in a zone that ships', () => {
    const steps = TIDEGLASS_TRAIL.steps;
    expect(new Set(steps.map((step) => step.interactableId)).size).toBe(steps.length);
    // The old rule here named the two launch zones by hand. The real invariant
    // is that a bearing never points at a zone the player cannot reach.
    const shipped = new Set([...ZONES_BY_ID.keys()].map((id) => id as string));
    expect(steps.filter((step) => !shipped.has(step.zoneId)).map((s) => s.zoneId)).toEqual([]);
    expect(steps.some((step) => step.zoneId === 'zone.cinderhollow')).toBe(true);
  });

  it('places every bearing at a clue site that exists in that zone', () => {
    // A step naming an interactable the zone does not contain is a trail that
    // dead-ends: the player is told where to go and finds nothing to inspect.
    const problems: string[] = [];
    for (const step of TIDEGLASS_TRAIL.steps) {
      const zone = [...ZONES_BY_ID.values()].find(
        (candidate) => (candidate.id as string) === step.zoneId,
      );
      const site = zone?.interactables.find(
        (item) => (item.id as string) === (step.interactableId as string),
      );
      if (site === undefined) {
        problems.push(`${step.interactableId} is not in ${step.zoneId}`);
        continue;
      }
      const dx = site.position.x - step.position.x;
      const dz = site.position.z - step.position.z;
      if (Math.hypot(dx, dz) > 0.001) {
        problems.push(`${step.interactableId} sits apart from its authored site`);
      }
    }
    expect(problems).toEqual([]);
  });
});
