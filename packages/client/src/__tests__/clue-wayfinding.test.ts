import { describe, expect, it } from 'vitest';
import { ASHEN_OVERLOOK, COURTYARD, InteractableKind, TIDEGLASS_TRAIL } from '@alderfell/shared';
import { clueProgressLabel } from '../ui/HubOverlay.js';
import { isMapDestination, isScenicMapDestination, mapDestinationType } from '../ui/WorldMap.js';
import { hasElevationChange } from '../core/elevation.js';
import { mapRouteColour, mapSurfaceColour } from '../core/map-surface.js';

describe('clue wayfinding', () => {
  it('includes authored clue sites among map destinations', () => {
    expect(isMapDestination(InteractableKind.ClueSite)).toBe(true);
    expect(isMapDestination(InteractableKind.MerchantStall)).toBe(false);
  });

  it('admits only explicitly named scenic waypoints as map destinations', () => {
    expect(isScenicMapDestination({ label: 'Ember Vista', tags: ['destination'] })).toBe(true);
    expect(isScenicMapDestination({ label: 'Crossroads', tags: ['landmark'] })).toBe(false);
    expect(isScenicMapDestination({ tags: ['destination'] })).toBe(false);
  });

  it("keeps a clue's purpose visible in the map destination list", () => {
    expect(mapDestinationType(InteractableKind.ClueSite)).toBe('Tideglass clue');
    expect(mapDestinationType(InteractableKind.CombatEncounter)).toBe('Combat');
  });

  it('derives the tracker total from the authored trail', () => {
    expect(clueProgressLabel(null, 0)).toBe('New treasure trail');
    expect(clueProgressLabel(1, 5)).toBe(`Clue 6 of ${TIDEGLASS_TRAIL.steps.length}`);
  });

  it('marks the authored Ashen Overlook stair transition on the local map', () => {
    const lower = ASHEN_OVERLOOK.waypoints[1]!;
    const upper = ASHEN_OVERLOOK.waypoints[2]!;
    expect(hasElevationChange(ASHEN_OVERLOOK.terrain, lower.position, upper.position)).toBe(true);
    expect(
      hasElevationChange(
        ASHEN_OVERLOOK.terrain,
        ASHEN_OVERLOOK.waypoints[0]!.position,
        lower.position,
      ),
    ).toBe(false);
  });

  it('keeps volcanic maps distinct from the green starting grounds', () => {
    expect(mapSurfaceColour(ASHEN_OVERLOOK.id)).toBe('#403037');
    expect(mapSurfaceColour(ASHEN_OVERLOOK.id)).not.toBe(mapSurfaceColour(COURTYARD.id));
  });

  it('pairs each map surface with a readable regional route colour', () => {
    expect(mapRouteColour(ASHEN_OVERLOOK.id)).toBe('#f0c58d');
    expect(mapRouteColour(ASHEN_OVERLOOK.id)).not.toBe(mapSurfaceColour(ASHEN_OVERLOOK.id));
  });
});
