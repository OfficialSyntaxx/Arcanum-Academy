/**
 * The Emberwood Reach — the forest zone.
 *
 * Authored the same way as the Courtyard (see `courtyard.ts`): hand-written
 * content today, in the exact shape the Phase 3 content pipeline will later
 * produce from a validated data format.
 *
 * Layout is a single gate in from the Courtyard, opening onto a shrine
 * clearing at the heart of the wood, with three trails branching off it —
 * timber camp to the east, the mushroom bog to the west, and a deeper,
 * stranger hollow to the south. A river runs the length of the western edge
 * and past the bog, authored as a chain of canal segments (still water for
 * now; flow is a renderer concern for later).
 *
 * Scaled 1.5x over the first pass (105m across) so the trails read as a
 * proper wood to walk rather than a clearing with signs on it.
 *
 *                              Emberwood Gate
 *                                    |
 *                              Grove Clearing (shrine)
 *                            /       |       \
 *                 Mushroom Bog   Deepshade   Timber Camp
 *                  /      \       Hollow      /       \
 *          Deepshade   Spring              Stand     Ranger's Cart
 *           Mushrooms  Notices
 */

import type { InteractableId, NpcDefinitionId, WaypointId } from '../ids.js';
import { BuildingDoorSide, InteractableKind, NpcActivity, NpcRole, type Zone } from './types.js';
import { COURTYARD_ZONE_ID, FOREST_ZONE_ID } from './zone-ids.js';

const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;
const npc = (id: string): NpcDefinitionId => id as NpcDefinitionId;

export { FOREST_ZONE_ID } from './zone-ids.js';

export const FOREST: Zone = {
  id: FOREST_ZONE_ID,
  name: 'The Emberwood Reach',
  bounds: { minX: -52.5, maxX: 52.5, minZ: -52.5, maxZ: 52.5 },
  terrain: {
    baseHeight: 0,
    terraces: [
      // The shrine sits on a low, ancient mound at the heart of the wood.
      { minX: -7.5, maxX: 7.5, minZ: -7.5, maxZ: 7.5, height: 0.3 },
      // The timber camp works from a cleared, levelled platform.
      { minX: 24, maxX: 36, minZ: -6, maxZ: 6, height: 0.25 },
      // The bog sits low, fed by the river beside it.
      { minX: -39, maxX: -21, minZ: -12, maxZ: 12, height: -0.5 },
    ],
    canals: [
      // A river runs the western edge of the zone and bends past the bog —
      // three segments rather than one, so it can turn.
      { minX: -36, maxX: -31.5, minZ: -52.5, maxZ: -15, waterHeight: -0.15 },
      { minX: -39, maxX: -28.5, minZ: -15, maxZ: 3, waterHeight: -0.2 },
      { minX: -36, maxX: -30, minZ: 3, maxZ: 30, waterHeight: -0.15 },
    ],
  },
  spawn: wp('wp.forest.gate'),
  atmosphere: 'forest.canopy',
  ambientPopulation: 14,
  waypoints: [
    // --- Gate --------------------------------------------------------------
    {
      id: wp('wp.forest.gate'),
      position: { x: 0, z: -30 },
      radius: 3,
      links: [wp('wp.grove.northpath')],
      tags: ['portal'],
    },
    {
      id: wp('wp.grove.northpath'),
      position: { x: 0, z: -15 },
      radius: 2.5,
      links: [wp('wp.forest.gate'), wp('wp.grove.center')],
    },

    // --- Grove clearing (shrine, centre) -----------------------------------
    {
      id: wp('wp.grove.center'),
      position: { x: 0, z: 0 },
      radius: 4,
      links: [
        wp('wp.grove.northpath'),
        wp('wp.grove.southpath'),
        wp('wp.grove.eastpath'),
        wp('wp.grove.westpath'),
      ],
      tags: ['plaza', 'social', 'shrine', 'spawn'],
    },

    // --- Deepshade Hollow (south) -------------------------------------------
    {
      id: wp('wp.grove.southpath'),
      position: { x: 0, z: 15 },
      radius: 2.5,
      links: [wp('wp.grove.center'), wp('wp.grove.hollow')],
    },
    {
      id: wp('wp.grove.hollow'),
      position: { x: 0, z: 30 },
      radius: 3,
      links: [wp('wp.grove.southpath')],
      tags: ['gathering', 'mystic'],
    },

    // --- Timber Camp (east) -------------------------------------------------
    {
      id: wp('wp.grove.eastpath'),
      position: { x: 15, z: 0 },
      radius: 2.5,
      links: [wp('wp.grove.center'), wp('wp.timber.camp')],
    },
    {
      id: wp('wp.timber.camp'),
      position: { x: 30, z: 0 },
      radius: 2.5,
      links: [wp('wp.grove.eastpath'), wp('wp.timber.stand'), wp('wp.timber.market')],
      tags: ['crafting'],
    },
    {
      id: wp('wp.timber.stand'),
      position: { x: 42, z: -7.5 },
      radius: 2,
      links: [wp('wp.timber.camp')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.timber.market'),
      position: { x: 42, z: 7.5 },
      radius: 2,
      links: [wp('wp.timber.camp')],
      tags: ['market'],
    },

    // --- Mushroom Bog (west) -------------------------------------------------
    {
      id: wp('wp.grove.westpath'),
      position: { x: -15, z: 0 },
      radius: 2.5,
      links: [wp('wp.grove.center'), wp('wp.mushroom.bog')],
    },
    {
      id: wp('wp.mushroom.bog'),
      position: { x: -30, z: 0 },
      radius: 2.8,
      links: [wp('wp.grove.westpath'), wp('wp.mushroom.deep'), wp('wp.mushroom.spring')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.mushroom.deep'),
      position: { x: -42, z: -9 },
      radius: 2,
      links: [wp('wp.mushroom.bog')],
      tags: ['gathering', 'mystic'],
    },
    {
      id: wp('wp.mushroom.spring'),
      position: { x: -42, z: 9 },
      radius: 2,
      links: [wp('wp.mushroom.bog')],
      tags: ['quests'],
    },
  ],

  interactables: [
    {
      id: ix('int.forest.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -32.4 },
      approach: wp('wp.forest.gate'),
      facing: 0,
      label: 'Gate to the Courtyard',
      verb: 'Return',
      targetZone: COURTYARD_ZONE_ID,
    },
    {
      id: ix('int.grove.shrine'),
      kind: InteractableKind.DisplayPedestal,
      position: { x: 0, z: -2.4 },
      approach: wp('wp.grove.center'),
      facing: Math.PI,
      label: 'The Grove Shrine',
      verb: 'Commune',
    },
    {
      id: ix('int.grove.hollow'),
      kind: InteractableKind.GatheringNode,
      position: { x: 0, z: 32.4 },
      approach: wp('wp.grove.hollow'),
      facing: Math.PI,
      label: 'Moonpetal Hollow',
      verb: 'Gather',
    },
    {
      id: ix('int.timber.saw'),
      kind: InteractableKind.CraftingStation,
      position: { x: 30, z: 2.4 },
      approach: wp('wp.timber.camp'),
      facing: Math.PI * 1.5,
      label: 'Lumber Mill',
      verb: 'Mill',
    },
    {
      id: ix('int.timber.node'),
      kind: InteractableKind.GatheringNode,
      position: { x: 44.4, z: -7.5 },
      approach: wp('wp.timber.stand'),
      facing: Math.PI * 1.5,
      label: 'Emberwood Stand',
      verb: 'Fell',
    },
    {
      id: ix('int.timber.market'),
      kind: InteractableKind.MerchantStall,
      position: { x: 44.4, z: 7.5 },
      approach: wp('wp.timber.market'),
      facing: Math.PI * 1.5,
      label: "Ranger's Cart",
      verb: 'Trade',
    },
    {
      id: ix('int.mushroom.node1'),
      kind: InteractableKind.GatheringNode,
      position: { x: -30, z: 2.4 },
      approach: wp('wp.mushroom.bog'),
      facing: Math.PI * 0.5,
      label: 'Bog Mushroom Cluster',
      verb: 'Forage',
    },
    {
      id: ix('int.mushroom.node2'),
      kind: InteractableKind.GatheringNode,
      position: { x: -44.4, z: -9 },
      approach: wp('wp.mushroom.deep'),
      facing: Math.PI * 0.5,
      label: 'Deepshade Mushrooms',
      verb: 'Forage',
    },
    {
      id: ix('int.mushroom.spring'),
      kind: InteractableKind.QuestBoard,
      position: { x: -44.4, z: 9 },
      approach: wp('wp.mushroom.spring'),
      facing: Math.PI * 0.5,
      label: 'Spring-Carved Notices',
      verb: 'Read',
    },
  ],

  buildings: [
    // The Ranger's Lodge is the timber camp's one enclosed room, built right
    // on the platform the crafting station and market already stand on.
    {
      minX: 24,
      maxX: 36,
      minZ: -6,
      maxZ: 6,
      wallHeight: 3,
      roofHeight: 1.8,
      doorSide: BuildingDoorSide.West,
      doorWidth: 2.6,
      doorTrigger: wp('wp.timber.camp'),
    },
  ],

  npcs: [
    {
      id: npc('npc.fenn'),
      name: 'Warden Fenn Rowe',
      role: NpcRole.Groundskeeper,
      homeZone: FOREST_ZONE_ID,
      appearance: 'cloak.moss',
      schedule: [
        { startMinute: 5 * 60, waypoint: wp('wp.grove.hollow'), activity: NpcActivity.Tend },
        { startMinute: 10 * 60, waypoint: wp('wp.grove.center'), activity: NpcActivity.Wander },
        { startMinute: 14 * 60, waypoint: wp('wp.mushroom.bog'), activity: NpcActivity.Tend },
        { startMinute: 20 * 60, waypoint: wp('wp.forest.gate'), activity: NpcActivity.Idle },
      ],
      barks: [
        'The river runs colder past the bog. Mind your footing.',
        'Emberwood grows back angry if you cut it wrong.',
        'The shrine has stood longer than the Academy has records for.',
      ],
    },
    {
      id: npc('npc.thatch'),
      name: 'Milo Thatch',
      role: NpcRole.Merchant,
      homeZone: FOREST_ZONE_ID,
      appearance: 'coat.forest',
      schedule: [
        { startMinute: 7 * 60, waypoint: wp('wp.timber.market'), activity: NpcActivity.Trade },
        { startMinute: 15 * 60, waypoint: wp('wp.timber.camp'), activity: NpcActivity.Idle },
        { startMinute: 21 * 60, waypoint: wp('wp.grove.center'), activity: NpcActivity.Wander },
      ],
      barks: [
        'Fresh-milled and fair-priced. Ask the Courtyard traders if that is common.',
        'I carry what the wood gives up. Some weeks that is not much.',
      ],
    },
    {
      id: npc('npc.vane'),
      name: 'Ysolde Vane',
      role: NpcRole.Student,
      homeZone: FOREST_ZONE_ID,
      appearance: 'robe.verdant',
      schedule: [
        { startMinute: 6 * 60, waypoint: wp('wp.mushroom.spring'), activity: NpcActivity.Study },
        { startMinute: 12 * 60, waypoint: wp('wp.mushroom.deep'), activity: NpcActivity.Study },
        { startMinute: 18 * 60, waypoint: wp('wp.grove.hollow'), activity: NpcActivity.Study },
        { startMinute: 23 * 60, waypoint: wp('wp.grove.center'), activity: NpcActivity.Idle },
      ],
      barks: [
        'The moonpetal only opens for an hour past midnight. I have missed it four nights running.',
        'Professor Vosk thinks I am pressing flowers. I am cataloguing a language.',
      ],
    },
  ],
};
