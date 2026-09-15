import { describe, expect, it } from 'vitest';
import { TIDEGLASS_TRAIL } from '../clues/catalog.js';

describe('treasure clue catalog', () => {
  it('has unique ordered sites in known launch zones', () => {
    expect(TIDEGLASS_TRAIL.steps).toHaveLength(4);
    expect(new Set(TIDEGLASS_TRAIL.steps.map((step) => step.interactableId)).size).toBe(4);
    expect(
      TIDEGLASS_TRAIL.steps.every((step) =>
        ['zone.courtyard', 'zone.saltwake_ruins'].includes(step.zoneId),
      ),
    ).toBe(true);
  });
});
