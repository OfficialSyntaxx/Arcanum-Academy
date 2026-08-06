/**
 * Zone id constants, kept apart from the zones themselves.
 *
 * Each zone's portals name the zones they lead to, and more than one zone
 * leads back to the Courtyard — a zone file importing another zone file's id
 * would form an import cycle the moment two zones point at each other. Living
 * here instead, with no zone file importing another, there is nothing to
 * cycle.
 */

import type { ZoneId } from '../ids.js';

export const COURTYARD_ZONE_ID = 'zone.courtyard' as ZoneId;
export const FOREST_ZONE_ID = 'zone.forest' as ZoneId;
export const MOUNTAINS_ZONE_ID = 'zone.mountains' as ZoneId;
export const SNOW_ZONE_ID = 'zone.snow' as ZoneId;
