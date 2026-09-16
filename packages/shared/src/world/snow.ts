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
  bounds: { minX: -94.5, maxX: 94.5, minZ: -94.5, maxZ: 94.5 },
  terrain: {
    baseHeight: 0,
    terraces: [
      // The spire clearing rests on a low, wind-scoured mound.
      { minX: -64.8, maxX: -32.4, minZ: -10.8, maxZ: 21.6, height: 0.2 },
      // The outpost works from a small levelled platform.
      { minX: -16.2, maxX: 16.2, minZ: 0, maxZ: 21.6, height: 0.3 },
      // A shallow bank along the creek.
      { minX: 37.8, maxX: 59.4, minZ: -5.4, maxZ: 27, height: 0.15 },
    ],
    canals: [
      // The frozen creek — still and ice-bound, not yet flowing.
      { minX: 16.2, maxX: 32.4, minZ: -37.8, maxZ: 0, waterHeight: -0.05 },
      { minX: 32.4, maxX: 64.8, minZ: 0, maxZ: 27, waterHeight: -0.1 },
    ],
  },
  spawn: wp('wp.snow.gate'),
  atmosphere: 'snow.overcast',
  ambientPopulation: 11,
  waypoints: [
    {
      id: wp('wp.snow.gate'),
      position: { x: 0, z: -75.6 },
      radius: 3,
      links: [wp('wp.frostgate.camp')],
      tags: ['portal'],
    },
    {
      id: wp('wp.frostgate.camp'),
      position: { x: 0, z: -48.6 },
      radius: 3.5,
      links: [wp('wp.snow.gate'), wp('wp.spire.path'), wp('wp.frost.path'), wp('wp.outpost.path')],
      tags: ['plaza', 'social', 'spawn', 'crafting'],
    },

    // --- Frozen Spire (west) --------------------------------------------------
    {
      id: wp('wp.spire.path'),
      position: { x: -27, z: -21.6 },
      radius: 2.5,
      links: [wp('wp.frostgate.camp'), wp('wp.spire.clearing')],
    },
    {
      id: wp('wp.spire.clearing'),
      position: { x: -48.6, z: 5.4 },
      radius: 3.5,
      links: [wp('wp.spire.path')],
      tags: ['mystic', 'shrine'],
    },

    // --- Frost Creek (east) -----------------------------------------------------
    {
      id: wp('wp.frost.path'),
      position: { x: 27, z: -21.6 },
      radius: 2.5,
      links: [wp('wp.frostgate.camp'), wp('wp.frost.creek')],
    },
    {
      id: wp('wp.frost.creek'),
      position: { x: 48.6, z: 5.4 },
      radius: 3,
      links: [
        wp('wp.frost.path'),
        wp('wp.frost.berries'),
        wp('wp.frost.fishing'),
        wp('wp.frost.hollow'),
      ],
      tags: ['gathering'],
    },
    {
      id: wp('wp.frost.berries'),
      position: { x: 70.2, z: -10.8 },
      radius: 2,
      links: [wp('wp.frost.creek')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.frost.fishing'),
      position: { x: 70.2, z: 21.6 },
      radius: 2,
      links: [wp('wp.frost.creek')],
      tags: ['gathering'],
    },

    // --- Outpost (north) ----------------------------------------------------
    {
      id: wp('wp.outpost.path'),
      position: { x: 0, z: -16.2 },
      radius: 2.5,
      links: [wp('wp.frostgate.camp'), wp('wp.outpost.camp')],
    },
    {
      id: wp('wp.outpost.camp'),
      position: { x: 0, z: 10.8 },
      radius: 3,
      links: [wp('wp.outpost.path'), wp('wp.outpost.board')],
      tags: ['market'],
    },
    {
      id: wp('wp.outpost.board'),
      position: { x: 0, z: 37.8 },
      radius: 2,
      links: [wp('wp.outpost.camp')],
      tags: ['quests'],
    },

    // --- Frost hollow (east) -------------------------------------------
    // Drifted ground past the creek where the white wolves hunt.
    {
      id: wp('wp.frost.hollow'),
      position: { x: 66, z: 34 },
      radius: 3,
      links: [wp('wp.frost.creek'), wp('wp.frost.cairn')],
      tags: ['wilds'],
    },
    {
      id: wp('wp.frost.cairn'),
      position: { x: 80, z: 52 },
      radius: 2.5,
      links: [wp('wp.frost.hollow')],
      tags: ['wilds'],
    },
  ],

  interactables: [
    {
      id: ix('int.snow.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -79.9 },
      approach: wp('wp.snow.gate'),
      facing: 0,
      label: 'Frostgate',
      verb: 'Return',
      targetZone: COURTYARD_ZONE_ID,
    },
    {
      id: ix('int.frostgate.workshop'),
      kind: InteractableKind.CraftingStation,
      position: { x: 4.3, z: -48.6 },
      approach: wp('wp.frostgate.camp'),
      facing: Math.PI * 1.5,
      label: 'Frost Workshop',
      verb: 'Craft',
    },
    {
      id: ix('int.frost.berries'),
      kind: InteractableKind.GatheringNode,
      position: { x: 74.5, z: -10.8 },
      approach: wp('wp.frost.berries'),
      facing: Math.PI * 1.5,
      label: 'Frostberry Bramble',
      verb: 'Forage',
    },
    {
      id: ix('int.frost.fishing'),
      kind: InteractableKind.GatheringNode,
      position: { x: 74.5, z: 21.6 },
      approach: wp('wp.frost.fishing'),
      facing: Math.PI * 1.5,
      label: 'Ice-Fishing Hole',
      verb: 'Fish',
    },
    {
      id: ix('int.outpost.market'),
      kind: InteractableKind.MerchantStall,
      position: { x: 4.3, z: 10.8 },
      approach: wp('wp.outpost.camp'),
      facing: Math.PI * 1.5,
      label: 'Frostgate Outpost',
      verb: 'Trade',
    },
    {
      id: ix('int.outpost.board'),
      kind: InteractableKind.QuestBoard,
      position: { x: 0, z: 42.1 },
      approach: wp('wp.outpost.board'),
      facing: Math.PI,
      label: 'Outpost Notices',
      verb: 'Read',
    },

    // --- The wilds ---------------------------------------------------------
    {
      id: ix('int.combat.frost_wolf_a'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 67, z: 35.6 },
      approach: wp('wp.frost.hollow'),
      facing: Math.PI * 1.25,
      label: 'Frost Wolf',
      verb: 'Attack',
    },
    {
      id: ix('int.combat.frost_wolf_b'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 81, z: 53.6 },
      approach: wp('wp.frost.cairn'),
      facing: Math.PI * 1.25,
      label: 'Frost Wolf',
      verb: 'Attack',
    },
    {
      id: ix('int.combat.rime_wisp'),
      kind: InteractableKind.CombatEncounter,
      position: { x: -49.8, z: 7 },
      approach: wp('wp.spire.clearing'),
      facing: Math.PI * 0.5,
      label: 'Rime Wisp',
      verb: 'Attack',
    },
  ],

  buildings: [
    // The Frost Workshop stands right on the ground at Frostgate Camp — no
    // raised platform here, so the walkways meeting the camp stay level.
    {
      minX: -10.8,
      maxX: 7.2,
      minZ: -57.6,
      maxZ: -43.2,
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
