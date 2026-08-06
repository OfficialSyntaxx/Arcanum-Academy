/**
 * Every zone that exists, keyed by id.
 *
 * Content (this file's four zones) and the ability to travel between them are
 * separate concerns — this catalog is what lets a client resolve a portal's
 * `targetZone` back into real `Zone` data without importing each zone module
 * by name at every call site.
 */

import type { ZoneId } from '../ids.js';
import { COURTYARD } from './courtyard.js';
import { FOREST } from './forest.js';
import { MOUNTAINS } from './mountains.js';
import { SNOW } from './snow.js';
import type { Zone } from './types.js';

export const ZONES_BY_ID: ReadonlyMap<ZoneId, Zone> = new Map([
  [COURTYARD.id, COURTYARD],
  [FOREST.id, FOREST],
  [MOUNTAINS.id, MOUNTAINS],
  [SNOW.id, SNOW],
]);

/** Resolves a portal's `targetZone` to real zone data, or `null` if unknown. */
export function zoneById(id: ZoneId): Zone | null {
  return ZONES_BY_ID.get(id) ?? null;
}
