/** The first hand-authored dungeon: three compact, readable flooded chambers. */
import type { InteractableId, WaypointId } from '../ids.js';
import { InteractableKind, type Zone } from './types.js';
import { COURTYARD_ZONE_ID, SALTWAKE_ZONE_ID } from './zone-ids.js';

const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;

export { SALTWAKE_ZONE_ID } from './zone-ids.js';

export const SALTWAKE_RUINS: Zone = {
  id: SALTWAKE_ZONE_ID,
  name: 'The Saltwake Ruins',
  bounds: { minX: -12, maxX: 12, minZ: -30, maxZ: 10 },
  terrain: {
    baseHeight: -0.25,
    terraces: [
      { minX: -10, maxX: 10, minZ: -28, maxZ: -17, height: 0 },
      { minX: -10, maxX: 10, minZ: -14, maxZ: -3, height: 0.2 },
      { minX: -11, maxX: 11, minZ: 0, maxZ: 9, height: 0.45 },
    ],
    canals: [
      { minX: -11.5, maxX: -8, minZ: -29, maxZ: 9, waterHeight: 0.05 },
      { minX: 8, maxX: 11.5, minZ: -29, maxZ: 9, waterHeight: 0.05 },
    ],
  },
  spawn: wp('wp.saltwake.antechamber'),
  atmosphere: 'saltwake.submerged',
  ambientPopulation: 0,
  waypoints: [
    {
      id: wp('wp.saltwake.antechamber'),
      position: { x: 0, z: -24 },
      radius: 3,
      links: [wp('wp.saltwake.gallery.entry')],
      tags: ['dungeon', 'room.antechamber', 'portal'],
    },
    {
      id: wp('wp.saltwake.gallery.entry'),
      position: { x: 0, z: -11 },
      radius: 2.5,
      links: [wp('wp.saltwake.antechamber'), wp('wp.saltwake.gallery.fight')],
      tags: ['dungeon', 'room.gallery'],
    },
    {
      id: wp('wp.saltwake.gallery.fight'),
      position: { x: 0, z: -6 },
      radius: 3,
      links: [wp('wp.saltwake.gallery.entry'), wp('wp.saltwake.vault.entry')],
      tags: ['dungeon', 'room.gallery'],
    },
    {
      id: wp('wp.saltwake.vault.entry'),
      position: { x: 0, z: 2 },
      radius: 2.5,
      links: [wp('wp.saltwake.gallery.fight'), wp('wp.saltwake.vault')],
      tags: ['dungeon', 'room.vault'],
    },
    {
      id: wp('wp.saltwake.vault'),
      position: { x: 0, z: 6 },
      radius: 3.5,
      links: [wp('wp.saltwake.vault.entry')],
      tags: ['dungeon', 'room.vault'],
    },
  ],
  interactables: [
    {
      id: ix('int.saltwake.exit'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -28 },
      approach: wp('wp.saltwake.antechamber'),
      facing: 0,
      label: 'Return to the Library Shore',
      verb: 'Leave',
      targetZone: COURTYARD_ZONE_ID,
    },
    {
      id: ix('int.combat.drowned_sentinel'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 0, z: -5 },
      approach: wp('wp.saltwake.gallery.fight'),
      facing: Math.PI,
      label: 'Drowned Sentinel',
      verb: 'Attack',
    },
    {
      id: ix('int.combat.drowned_warden'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 0, z: 6.5 },
      approach: wp('wp.saltwake.vault'),
      facing: Math.PI,
      label: 'Drowned Warden',
      verb: 'Challenge',
    },
    {
      id: ix('int.saltwake.vault_chest'),
      kind: InteractableKind.QuestBoard,
      position: { x: 5.5, z: 6 },
      approach: wp('wp.saltwake.vault'),
      facing: -Math.PI / 2,
      label: 'Tideglass Reliquary',
      verb: 'Open',
    },
    {
      id: ix('int.clue.warden_bearings'),
      kind: InteractableKind.ClueSite,
      position: { x: -5.5, z: 6 },
      approach: wp('wp.saltwake.vault'),
      facing: Math.PI / 2,
      label: "Warden's Tide-cut Bearings",
      verb: 'Inspect',
    },
  ],
  buildings: [],
  npcs: [],
};
