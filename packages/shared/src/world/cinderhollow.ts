/**
 * Cinderhollow — a volcanic cavern branch beyond the Cindermark Heights.
 *
 * G10-A deliberately ships the route and landmark before its resource and
 * combat loop. The waypoint graph and portal make it a genuine world zone;
 * G10-B can attach authored nodes and encounters without moving the route.
 */
import type { InteractableId, WaypointId } from '../ids.js';
import { InteractableKind, type Zone } from './types.js';
import { ASHEN_OVERLOOK_ZONE_ID, CINDERHOLLOW_ZONE_ID, MOUNTAINS_ZONE_ID } from './zone-ids.js';

const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;

export { CINDERHOLLOW_ZONE_ID } from './zone-ids.js';

export const CINDERHOLLOW: Zone = {
  id: CINDERHOLLOW_ZONE_ID,
  name: 'Cinderhollow Caverns',
  bounds: { minX: -78, maxX: 78, minZ: -78, maxZ: 78 },
  terrain: {
    baseHeight: -1.4,
    terraces: [
      { minX: -18, maxX: 18, minZ: -72, maxZ: -42, height: -0.6 },
      { minX: -42, maxX: 42, minZ: -30, maxZ: 18, height: -0.3 },
      { minX: -24, maxX: 24, minZ: 30, maxZ: 66, height: 0.4 },
    ],
    canals: [],
  },
  spawn: wp('wp.cinderhollow.mouth'),
  atmosphere: 'cinderhollow.emberglow',
  ambientPopulation: 0,
  waypoints: [
    {
      id: wp('wp.cinderhollow.mouth'),
      position: { x: 0, z: -63 },
      radius: 3.4,
      label: 'Cavern Mouth',
      links: [wp('wp.cinderhollow.embers')],
      tags: ['portal', 'spawn'],
    },
    {
      id: wp('wp.cinderhollow.embers'),
      position: { x: 0, z: -30 },
      radius: 3.2,
      label: 'Ember Gallery',
      links: [wp('wp.cinderhollow.mouth'), wp('wp.cinderhollow.fork')],
      tags: ['landmark'],
    },
    {
      id: wp('wp.cinderhollow.fork'),
      position: { x: 0, z: 3 },
      radius: 3.6,
      label: 'Cindermark Fork',
      links: [wp('wp.cinderhollow.embers'), wp('wp.cinderhollow.rim'), wp('wp.cinderhollow.forge')],
      tags: ['plaza'],
    },
    {
      id: wp('wp.cinderhollow.rim'),
      position: { x: -42, z: 18 },
      radius: 2.8,
      label: 'Ore Rim',
      links: [wp('wp.cinderhollow.fork')],
      tags: ['landmark'],
    },
    {
      id: wp('wp.cinderhollow.forge'),
      position: { x: 0, z: 51 },
      radius: 3,
      label: 'Crucible Chamber',
      links: [wp('wp.cinderhollow.fork'), wp('wp.cinderhollow.overlook')],
      tags: ['landmark'],
    },
    {
      id: wp('wp.cinderhollow.overlook'),
      position: { x: 25, z: 62 },
      radius: 3,
      label: 'Ashen Rise',
      links: [wp('wp.cinderhollow.forge')],
      tags: ['portal', 'landmark'],
    },
  ],
  interactables: [
    {
      id: ix('int.cinderhollow.overlook.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 28, z: 64 },
      approach: wp('wp.cinderhollow.overlook'),
      facing: Math.PI * 0.5,
      label: 'Path to the Ashen Overlook',
      verb: 'Climb',
      targetZone: ASHEN_OVERLOOK_ZONE_ID,
    },
    {
      id: ix('int.clue.cinderhollow_brand'),
      kind: InteractableKind.ClueSite,
      position: { x: -4.5, z: 3.8 },
      approach: wp('wp.cinderhollow.fork'),
      facing: Math.PI,
      label: 'Tideglass Brand',
      verb: 'Inspect',
    },
    {
      id: ix('int.cinderhollow.ore_vein'),
      kind: InteractableKind.GatheringNode,
      position: { x: -46, z: 18 },
      approach: wp('wp.cinderhollow.rim'),
      facing: Math.PI * 0.5,
      label: 'Cinder Ore Vein',
      verb: 'Mine',
      requiredLevel: 8,
    },
    {
      id: ix('int.cinderhollow.forge'),
      kind: InteractableKind.CraftingStation,
      position: { x: 4.2, z: 55 },
      approach: wp('wp.cinderhollow.forge'),
      facing: Math.PI * 1.5,
      label: 'Cinder Crucible',
      verb: 'Smith',
      requiredLevel: 10,
    },
    {
      id: ix('int.combat.cinderbound_wisp'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 6, z: -29 },
      approach: wp('wp.cinderhollow.embers'),
      facing: Math.PI,
      label: 'Cinderbound Wisp',
      verb: 'Attack',
      requiredLevel: 4,
    },
    {
      id: ix('int.combat.cinderheart'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 0, z: 43 },
      approach: wp('wp.cinderhollow.forge'),
      facing: Math.PI,
      label: 'Cinderheart',
      verb: 'Challenge',
      requiredLevel: 10,
    },
    {
      id: ix('int.cinderhollow.exit.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -69 },
      approach: wp('wp.cinderhollow.mouth'),
      facing: Math.PI,
      label: 'Trail to the Cindermark Heights',
      verb: 'Ascend',
      targetZone: MOUNTAINS_ZONE_ID,
    },
  ],
  buildings: [],
  npcs: [],
};
