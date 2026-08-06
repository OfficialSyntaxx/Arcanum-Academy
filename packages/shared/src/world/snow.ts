/**
 * The Frostgate Reaches — the snow zone.
 *
 * Authored the same way as the Courtyard (see `courtyard.ts`). Frostgate Camp
 * is the hub, one gate in from the Courtyard, with three short spurs: the
 * Frozen Spire clearing to the west, a frozen creek and its gathering spots to
 * the east, and a small trading outpost to the north.
 *
 * Scaled 1.5x over the first pass (105m across).
 *
 *                        Outpost Board
 *                              |
 *                        Outpost Camp
 *                              |
 *   Frozen Spire — Spire Path — Frostgate Camp — Frost Path — Frost Creek
 *      Clearing                      |                          /    \
 *                              Frostgate Gate            Frostberry  Ice-Fishing
 *                                                          Bramble      Hole
 */

import type { InteractableId, NpcDefinitionId, WaypointId } from '../ids.js';
import { BuildingDoorSide, InteractableKind, NpcActivity, NpcRole, type Zone } from './types.js';
import { COURTYARD_ZONE_ID, SNOW_ZONE_ID } from './zone-ids.js';

const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;
const npc = (id: string): NpcDefinitionId => id as NpcDefinitionId;

export { SNOW_ZONE_ID } from './zone-ids.js';

export const SNOW: Zone = {
  id: SNOW_ZONE_ID,
  name: 'The Frostgate Reaches',
  bounds: { minX: -52.5, maxX: 52.5, minZ: -52.5, maxZ: 52.5 },
  terrain: {
    baseHeight: 0,
    terraces: [
      // The spire clearing rests on a low, wind-scoured mound.
      { minX: -36, maxX: -18, minZ: -6, maxZ: 12, height: 0.2 },
      // The outpost works from a small levelled platform.
      { minX: -9, maxX: 9, minZ: 0, maxZ: 12, height: 0.3 },
      // A shallow bank along the creek.
      { minX: 21, maxX: 33, minZ: -3, maxZ: 15, height: 0.15 },
    ],
    canals: [
      // The frozen creek — still and ice-bound, not yet flowing.
      { minX: 9, maxX: 18, minZ: -21, maxZ: 0, waterHeight: -0.05 },
      { minX: 18, maxX: 36, minZ: 0, maxZ: 15, waterHeight: -0.1 },
    ],
  },
  spawn: wp('wp.snow.gate'),
  atmosphere: 'snow.overcast',
  ambientPopulation: 11,
  waypoints: [
    {
      id: wp('wp.snow.gate'),
      position: { x: 0, z: -42 },
      radius: 3,
      links: [wp('wp.frostgate.camp')],
      tags: ['portal'],
    },
    {
      id: wp('wp.frostgate.camp'),
      position: { x: 0, z: -27 },
      radius: 3.5,
      links: [wp('wp.snow.gate'), wp('wp.spire.path'), wp('wp.frost.path'), wp('wp.outpost.path')],
      tags: ['plaza', 'social', 'spawn', 'crafting'],
    },

    // --- Frozen Spire (west) --------------------------------------------------
    {
      id: wp('wp.spire.path'),
      position: { x: -15, z: -12 },
      radius: 2.5,
      links: [wp('wp.frostgate.camp'), wp('wp.spire.clearing')],
    },
    {
      id: wp('wp.spire.clearing'),
      position: { x: -27, z: 3 },
      radius: 3.5,
      links: [wp('wp.spire.path')],
      tags: ['mystic', 'shrine'],
    },

    // --- Frost Creek (east) -----------------------------------------------------
    {
      id: wp('wp.frost.path'),
      position: { x: 15, z: -12 },
      radius: 2.5,
      links: [wp('wp.frostgate.camp'), wp('wp.frost.creek')],
    },
    {
      id: wp('wp.frost.creek'),
      position: { x: 27, z: 3 },
      radius: 3,
      links: [wp('wp.frost.path'), wp('wp.frost.berries'), wp('wp.frost.fishing')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.frost.berries'),
      position: { x: 39, z: -6 },
      radius: 2,
      links: [wp('wp.frost.creek')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.frost.fishing'),
      position: { x: 39, z: 12 },
      radius: 2,
      links: [wp('wp.frost.creek')],
      tags: ['gathering'],
    },

    // --- Outpost (north) ----------------------------------------------------
    {
      id: wp('wp.outpost.path'),
      position: { x: 0, z: -9 },
      radius: 2.5,
      links: [wp('wp.frostgate.camp'), wp('wp.outpost.camp')],
    },
    {
      id: wp('wp.outpost.camp'),
      position: { x: 0, z: 6 },
      radius: 3,
      links: [wp('wp.outpost.path'), wp('wp.outpost.board')],
      tags: ['market'],
    },
    {
      id: wp('wp.outpost.board'),
      position: { x: 0, z: 21 },
      radius: 2,
      links: [wp('wp.outpost.camp')],
      tags: ['quests'],
    },
  ],

  interactables: [
    {
      id: ix('int.snow.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -44.4 },
      approach: wp('wp.snow.gate'),
      facing: 0,
      label: 'Frostgate',
      verb: 'Return',
      targetZone: COURTYARD_ZONE_ID,
    },
    {
      id: ix('int.frostgate.workshop'),
      kind: InteractableKind.CraftingStation,
      position: { x: 2.4, z: -27 },
      approach: wp('wp.frostgate.camp'),
      facing: Math.PI * 1.5,
      label: 'Frost Workshop',
      verb: 'Craft',
    },
    {
      id: ix('int.spire.shrine'),
      kind: InteractableKind.DisplayPedestal,
      position: { x: -29.4, z: 3 },
      approach: wp('wp.spire.clearing'),
      facing: Math.PI * 0.5,
      label: 'The Frozen Spire',
      verb: 'Commune',
    },
    {
      id: ix('int.frost.berries'),
      kind: InteractableKind.GatheringNode,
      position: { x: 41.4, z: -6 },
      approach: wp('wp.frost.berries'),
      facing: Math.PI * 1.5,
      label: 'Frostberry Bramble',
      verb: 'Forage',
    },
    {
      id: ix('int.frost.fishing'),
      kind: InteractableKind.GatheringNode,
      position: { x: 41.4, z: 12 },
      approach: wp('wp.frost.fishing'),
      facing: Math.PI * 1.5,
      label: 'Ice-Fishing Hole',
      verb: 'Fish',
    },
    {
      id: ix('int.outpost.market'),
      kind: InteractableKind.MerchantStall,
      position: { x: 2.4, z: 6 },
      approach: wp('wp.outpost.camp'),
      facing: Math.PI * 1.5,
      label: 'Frostgate Outpost',
      verb: 'Trade',
    },
    {
      id: ix('int.outpost.board'),
      kind: InteractableKind.QuestBoard,
      position: { x: 0, z: 23.4 },
      approach: wp('wp.outpost.board'),
      facing: Math.PI,
      label: 'Outpost Notices',
      verb: 'Read',
    },
  ],

  buildings: [
    // The Frost Workshop stands right on the ground at Frostgate Camp — no
    // raised platform here, so the walkways meeting the camp stay level.
    {
      minX: -6,
      maxX: 4,
      minZ: -32,
      maxZ: -24,
      wallHeight: 3,
      roofHeight: 1.8,
      doorSide: BuildingDoorSide.South,
      doorWidth: 2.6,
      doorTrigger: wp('wp.frostgate.camp'),
    },
  ],

  npcs: [
    {
      id: npc('npc.vail'),
      name: 'Keeper Hesper Vail',
      role: NpcRole.Groundskeeper,
      homeZone: SNOW_ZONE_ID,
      appearance: 'cloak.frost',
      schedule: [
        { startMinute: 5 * 60, waypoint: wp('wp.spire.clearing'), activity: NpcActivity.Tend },
        { startMinute: 12 * 60, waypoint: wp('wp.frostgate.camp'), activity: NpcActivity.Wander },
        { startMinute: 18 * 60, waypoint: wp('wp.spire.path'), activity: NpcActivity.Tend },
        { startMinute: 22 * 60, waypoint: wp('wp.snow.gate'), activity: NpcActivity.Idle },
      ],
      barks: [
        'The spire hums colder before a storm. Best to be indoors by then.',
        'Nothing grows here that was not told to, twice.',
      ],
    },
    {
      id: npc('npc.voss'),
      name: 'Quartermaster Ander Voss',
      role: NpcRole.Merchant,
      homeZone: SNOW_ZONE_ID,
      appearance: 'coat.frost',
      schedule: [
        { startMinute: 7 * 60, waypoint: wp('wp.outpost.camp'), activity: NpcActivity.Trade },
        { startMinute: 15 * 60, waypoint: wp('wp.frost.creek'), activity: NpcActivity.Wander },
        { startMinute: 21 * 60, waypoint: wp('wp.outpost.board'), activity: NpcActivity.Idle },
      ],
      barks: [
        'Furs, oil, and patience. In that order of how often I run out.',
        'The creek freezes solid by the third bell. Fish before that or wait a season.',
      ],
    },
    {
      id: npc('npc.wynn'),
      name: 'Archivist Liora Wynn',
      role: NpcRole.Archivist,
      homeZone: SNOW_ZONE_ID,
      appearance: 'robe.frost',
      schedule: [
        { startMinute: 6 * 60, waypoint: wp('wp.spire.clearing'), activity: NpcActivity.Study },
        { startMinute: 13 * 60, waypoint: wp('wp.outpost.board'), activity: NpcActivity.Study },
        { startMinute: 19 * 60, waypoint: wp('wp.frostgate.camp'), activity: NpcActivity.Idle },
      ],
      barks: [
        'The spire predates every record the Archive holds of this reach.',
        'Onn in the Courtyard thinks his stacks are old. He should stand here at dawn.',
      ],
    },
  ],
};
