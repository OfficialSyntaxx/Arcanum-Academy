import type { InteractableId, WaypointId } from '../ids.js';
import { InteractableKind, type Zone } from './types.js';
import { ASHEN_OVERLOOK_ZONE_ID, CINDERHOLLOW_ZONE_ID } from './zone-ids.js';
const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;
export { ASHEN_OVERLOOK_ZONE_ID } from './zone-ids.js';

/** A quiet, optional vista beyond Cinderhollow; scenery only, no progression loop. */
export const ASHEN_OVERLOOK: Zone = {
  id: ASHEN_OVERLOOK_ZONE_ID,
  name: 'Ashen Overlook',
  bounds: { minX: -48, maxX: 48, minZ: -48, maxZ: 48 },
  terrain: {
    baseHeight: 3,
    terraces: [{ minX: -36, maxX: 36, minZ: -8, maxZ: 38, height: 5.4 }],
    canals: [],
  },
  spawn: wp('wp.ashen.overlook.entry'),
  atmosphere: 'ashen.overlook',
  ambientPopulation: 0,
  waypoints: [
    {
      id: wp('wp.ashen.overlook.entry'),
      position: { x: 0, z: -28 },
      radius: 3,
      label: 'Cliff Path',
      links: [wp('wp.ashen.overlook.lower_steps')],
      tags: ['portal', 'spawn'],
    },
    {
      id: wp('wp.ashen.overlook.lower_steps'),
      position: { x: 0, z: -9 },
      radius: 2.4,
      label: 'Basalt Steps',
      links: [wp('wp.ashen.overlook.entry'), wp('wp.ashen.overlook.upper_steps')],
      tags: ['landmark'],
    },
    {
      id: wp('wp.ashen.overlook.upper_steps'),
      position: { x: 0, z: -5 },
      radius: 2.4,
      label: 'Basalt Steps',
      links: [wp('wp.ashen.overlook.lower_steps'), wp('wp.ashen.overlook.crossroads')],
      tags: ['landmark'],
    },
    {
      id: wp('wp.ashen.overlook.crossroads'),
      position: { x: 0, z: 9 },
      radius: 3.2,
      label: 'Ember Crossroads',
      links: [
        wp('wp.ashen.overlook.upper_steps'),
        wp('wp.ashen.overlook.vista'),
        wp('wp.ashen.overlook.glasswind'),
        wp('wp.ashen.overlook.watcher'),
      ],
      tags: ['landmark'],
    },
    {
      id: wp('wp.ashen.overlook.vista'),
      position: { x: 0, z: 28 },
      radius: 4,
      label: 'Ember Vista',
      links: [wp('wp.ashen.overlook.crossroads')],
      tags: ['landmark', 'destination'],
    },
    {
      id: wp('wp.ashen.overlook.glasswind'),
      position: { x: -27, z: 25 },
      radius: 4,
      label: 'Glasswind Shelf',
      links: [wp('wp.ashen.overlook.crossroads')],
      tags: ['landmark', 'destination'],
    },
    {
      id: wp('wp.ashen.overlook.watcher'),
      position: { x: 27, z: 25 },
      radius: 4,
      label: "Watcher's Crown",
      links: [wp('wp.ashen.overlook.crossroads')],
      tags: ['landmark', 'destination'],
    },
  ],
  interactables: [
    {
      id: ix('int.ashen.overlook.exit'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -34 },
      approach: wp('wp.ashen.overlook.entry'),
      facing: Math.PI,
      label: 'Return to Cinderhollow',
      verb: 'Descend',
      targetZone: CINDERHOLLOW_ZONE_ID,
    },
  ],
  buildings: [],
  npcs: [],
};
