/**
 * The Courtyard of the Arcanum — the hub zone.
 *
 * This is authored content living temporarily in code. Phase 3 introduces the
 * content pipeline, at which point this file becomes the output of a validated
 * data format rather than a hand-written module; the shape of the exported
 * object is already the shape that pipeline will produce, so nothing downstream
 * changes when it moves.
 *
 * Layout is a cross-plan courtyard: a central plaza with four cardinal avenues
 * and four corner precincts. That geometry is chosen deliberately for a phone
 * screen — from the centre every destination is one clear direction away, and
 * the player never has to read a map to know where they are.
 *
 *                        Resonance Mines   Scribing Hall   Library of Echoes
 *                                       \        |        /
 *                        Alchemy Gardens —    PLAZA    — Merchant Arcade
 *                                       /        |        \
 *                        Emberwood Grove  Duelling Terrace  Hall of Champions
 */

import type { InteractableId, NpcDefinitionId, WaypointId, ZoneId } from '../ids.js';
import { InteractableKind, NpcActivity, NpcRole, type Zone } from './types.js';

const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;
const npc = (id: string): NpcDefinitionId => id as NpcDefinitionId;

export const COURTYARD_ZONE_ID = 'zone.courtyard' as ZoneId;

export const COURTYARD: Zone = {
  id: COURTYARD_ZONE_ID,
  name: 'Courtyard of the Arcanum',
  bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
  terrain: {
    baseHeight: 0,
    terraces: [
      // The scribing hall sits above the plaza; you climb to work.
      { minX: -10, maxX: 10, minZ: -24, maxZ: -13, height: 0.9 },
      // The duelling terrace is raised so spectators in the plaza can see in.
      { minX: -10, maxX: 10, minZ: 13, maxZ: 24, height: 0.6 },
      // The Hall of Champions is the highest ground in the academy.
      { minX: 10, maxX: 24, minZ: 10, maxZ: 24, height: 1.4 },
      // The mines cut downwards.
      { minX: -24, maxX: -10, minZ: -24, maxZ: -10, height: -0.8 },
    ],
  },
  spawn: wp('wp.plaza.center'),
  atmosphere: 'courtyard.afternoon',
  ambientPopulation: 18,
  waypoints: [
    // --- Central plaza ---------------------------------------------------
    {
      id: wp('wp.plaza.center'),
      position: { x: 0, z: 0 },
      radius: 3.5,
      links: [wp('wp.plaza.north'), wp('wp.plaza.south'), wp('wp.plaza.east'), wp('wp.plaza.west')],
      tags: ['plaza', 'social', 'spawn'],
    },
    {
      id: wp('wp.plaza.north'),
      position: { x: 0, z: -8 },
      radius: 2.5,
      links: [
        wp('wp.plaza.center'),
        wp('wp.plaza.northeast'),
        wp('wp.plaza.northwest'),
        wp('wp.scribe.stair'),
      ],
      tags: ['plaza'],
    },
    {
      id: wp('wp.plaza.south'),
      position: { x: 0, z: 8 },
      radius: 2.5,
      links: [
        wp('wp.plaza.center'),
        wp('wp.plaza.southeast'),
        wp('wp.plaza.southwest'),
        wp('wp.duel.entry'),
      ],
      tags: ['plaza'],
    },
    {
      id: wp('wp.plaza.east'),
      position: { x: 8, z: 0 },
      radius: 2.5,
      links: [
        wp('wp.plaza.center'),
        wp('wp.plaza.northeast'),
        wp('wp.plaza.southeast'),
        wp('wp.arcade.entry'),
      ],
      tags: ['plaza'],
    },
    {
      id: wp('wp.plaza.west'),
      position: { x: -8, z: 0 },
      radius: 2.5,
      links: [
        wp('wp.plaza.center'),
        wp('wp.plaza.northwest'),
        wp('wp.plaza.southwest'),
        wp('wp.garden.entry'),
      ],
      tags: ['plaza'],
    },
    {
      id: wp('wp.plaza.northeast'),
      position: { x: 6.5, z: -6.5 },
      radius: 2,
      links: [wp('wp.plaza.north'), wp('wp.plaza.east'), wp('wp.library.entry')],
    },
    {
      id: wp('wp.plaza.northwest'),
      position: { x: -6.5, z: -6.5 },
      radius: 2,
      links: [wp('wp.plaza.north'), wp('wp.plaza.west'), wp('wp.mines.entry')],
    },
    {
      id: wp('wp.plaza.southeast'),
      position: { x: 6.5, z: 6.5 },
      radius: 2,
      links: [wp('wp.plaza.south'), wp('wp.plaza.east'), wp('wp.champions.entry')],
    },
    {
      id: wp('wp.plaza.southwest'),
      position: { x: -6.5, z: 6.5 },
      radius: 2,
      links: [wp('wp.plaza.south'), wp('wp.plaza.west'), wp('wp.grove.entry')],
    },

    // --- Scribing Hall (north) -------------------------------------------
    {
      id: wp('wp.scribe.stair'),
      position: { x: 0, z: -14 },
      radius: 2,
      links: [wp('wp.plaza.north'), wp('wp.scribe.table'), wp('wp.scribe.desk')],
      tags: ['scribing'],
    },
    {
      id: wp('wp.scribe.table'),
      position: { x: -4.5, z: -19 },
      radius: 1.6,
      links: [wp('wp.scribe.stair'), wp('wp.scribe.desk')],
      tags: ['scribing', 'crafting'],
    },
    {
      id: wp('wp.scribe.desk'),
      position: { x: 4.5, z: -19 },
      radius: 1.6,
      links: [wp('wp.scribe.stair'), wp('wp.scribe.table')],
      tags: ['scribing', 'grading'],
    },

    // --- Duelling Terrace (south) ----------------------------------------
    {
      id: wp('wp.duel.entry'),
      position: { x: 0, z: 14 },
      radius: 2.4,
      links: [wp('wp.plaza.south'), wp('wp.duel.circle.north'), wp('wp.duel.circle.south')],
      tags: ['duelling', 'social'],
    },
    {
      id: wp('wp.duel.circle.north'),
      position: { x: -5, z: 19 },
      radius: 2.2,
      links: [wp('wp.duel.entry'), wp('wp.duel.circle.south')],
      tags: ['duelling'],
    },
    {
      id: wp('wp.duel.circle.south'),
      position: { x: 5, z: 19 },
      radius: 2.2,
      links: [wp('wp.duel.entry'), wp('wp.duel.circle.north')],
      tags: ['duelling'],
    },

    // --- Merchant Arcade (east) ------------------------------------------
    {
      id: wp('wp.arcade.entry'),
      position: { x: 14, z: 0 },
      radius: 2.2,
      links: [wp('wp.plaza.east'), wp('wp.arcade.quartermaster'), wp('wp.arcade.consignment')],
      tags: ['market'],
    },
    {
      id: wp('wp.arcade.quartermaster'),
      position: { x: 19, z: -4 },
      radius: 1.6,
      links: [wp('wp.arcade.entry'), wp('wp.arcade.consignment')],
      tags: ['market'],
    },
    {
      id: wp('wp.arcade.consignment'),
      position: { x: 19, z: 4 },
      radius: 1.6,
      links: [wp('wp.arcade.entry'), wp('wp.arcade.quartermaster')],
      tags: ['market'],
    },

    // --- Alchemy Gardens (west) ------------------------------------------
    {
      id: wp('wp.garden.entry'),
      position: { x: -14, z: 0 },
      radius: 2.2,
      links: [wp('wp.plaza.west'), wp('wp.garden.beds'), wp('wp.garden.patch')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.garden.beds'),
      position: { x: -19, z: -4 },
      radius: 1.8,
      links: [wp('wp.garden.entry'), wp('wp.garden.patch')],
      tags: ['gathering', 'crafting'],
    },
    {
      id: wp('wp.garden.patch'),
      position: { x: -19, z: 4 },
      radius: 1.8,
      links: [wp('wp.garden.entry'), wp('wp.garden.beds')],
      tags: ['gathering'],
    },

    // --- Library of Echoes (north-east) ----------------------------------
    {
      id: wp('wp.library.entry'),
      position: { x: 13.5, z: -13.5 },
      radius: 2,
      links: [wp('wp.plaza.northeast'), wp('wp.library.stacks')],
      tags: ['quests'],
    },
    {
      id: wp('wp.library.stacks'),
      position: { x: 17.5, z: -17.5 },
      radius: 1.8,
      links: [wp('wp.library.entry')],
      tags: ['quests', 'lore'],
    },

    // --- Resonance Mines (north-west) ------------------------------------
    {
      id: wp('wp.mines.entry'),
      position: { x: -13.5, z: -13.5 },
      radius: 2,
      links: [wp('wp.plaza.northwest'), wp('wp.mines.seam')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.mines.seam'),
      position: { x: -18, z: -18 },
      radius: 1.8,
      links: [wp('wp.mines.entry')],
      tags: ['gathering'],
    },

    // --- Hall of Champions (south-east) ----------------------------------
    {
      id: wp('wp.champions.entry'),
      position: { x: 13.5, z: 13.5 },
      radius: 2,
      links: [wp('wp.plaza.southeast'), wp('wp.champions.pedestals')],
      tags: ['social', 'prestige'],
    },
    {
      id: wp('wp.champions.pedestals'),
      position: { x: 18, z: 18 },
      radius: 2,
      links: [wp('wp.champions.entry')],
      tags: ['prestige'],
    },

    // --- Emberwood Grove (south-west) ------------------------------------
    {
      id: wp('wp.grove.entry'),
      position: { x: -13.5, z: 13.5 },
      radius: 2,
      links: [wp('wp.plaza.southwest'), wp('wp.grove.stand')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.grove.stand'),
      position: { x: -18, z: 18 },
      radius: 1.8,
      links: [wp('wp.grove.entry')],
      tags: ['gathering'],
    },
  ],

  interactables: [
    {
      id: ix('int.scribe.table'),
      kind: InteractableKind.ScribingTable,
      position: { x: -4.5, z: -20.6 },
      approach: wp('wp.scribe.table'),
      facing: Math.PI,
      label: 'Scribing Table',
      verb: 'Scribe',
    },
    {
      id: ix('int.scribe.desk'),
      kind: InteractableKind.GradingDesk,
      position: { x: 4.5, z: -20.6 },
      approach: wp('wp.scribe.desk'),
      facing: Math.PI,
      label: 'Appraisal Desk',
      verb: 'Appraise',
    },
    {
      id: ix('int.node.crystal'),
      kind: InteractableKind.GatheringNode,
      position: { x: -19.4, z: -19.4 },
      approach: wp('wp.mines.seam'),
      facing: Math.PI * 1.25,
      label: 'Resonance Seam',
      verb: 'Mine',
    },
    {
      id: ix('int.node.mushroom'),
      kind: InteractableKind.GatheringNode,
      position: { x: -20.4, z: 4 },
      approach: wp('wp.garden.patch'),
      facing: Math.PI * 1.5,
      label: 'Mystic Mushroom Patch',
      verb: 'Forage',
    },
    {
      id: ix('int.node.emberwood'),
      kind: InteractableKind.GatheringNode,
      position: { x: -19.4, z: 19.4 },
      approach: wp('wp.grove.stand'),
      facing: Math.PI * 0.75,
      label: 'Emberwood Stand',
      verb: 'Fell',
    },
    {
      id: ix('int.station.distillery'),
      kind: InteractableKind.CraftingStation,
      position: { x: -20.4, z: -4 },
      approach: wp('wp.garden.beds'),
      facing: Math.PI * 1.5,
      label: 'Ink Distillery',
      verb: 'Refine',
    },
    {
      id: ix('int.station.grinder'),
      kind: InteractableKind.CraftingStation,
      position: { x: -15, z: -12 },
      approach: wp('wp.mines.entry'),
      facing: Math.PI * 1.25,
      label: 'Crystal Grinder',
      verb: 'Refine',
    },
    {
      id: ix('int.duel.circle.north'),
      kind: InteractableKind.DuelCircle,
      position: { x: -5, z: 20.6 },
      approach: wp('wp.duel.circle.north'),
      facing: 0,
      label: 'Northern Duel Circle',
      verb: 'Duel',
    },
    {
      id: ix('int.duel.circle.south'),
      kind: InteractableKind.DuelCircle,
      position: { x: 5, z: 20.6 },
      approach: wp('wp.duel.circle.south'),
      facing: 0,
      label: 'Southern Duel Circle',
      verb: 'Duel',
    },
    {
      id: ix('int.arcade.quartermaster'),
      kind: InteractableKind.MerchantStall,
      position: { x: 20.6, z: -4 },
      approach: wp('wp.arcade.quartermaster'),
      facing: Math.PI * 0.5,
      label: "Quartermaster's Stall",
      verb: 'Trade',
    },
    {
      id: ix('int.arcade.consignment'),
      kind: InteractableKind.MerchantStall,
      position: { x: 20.6, z: 4 },
      approach: wp('wp.arcade.consignment'),
      facing: Math.PI * 0.5,
      label: 'Consignment Board',
      verb: 'Browse',
      requiredLevel: 5,
    },
    {
      id: ix('int.champions.pedestals'),
      kind: InteractableKind.DisplayPedestal,
      position: { x: 19.4, z: 19.4 },
      approach: wp('wp.champions.pedestals'),
      facing: Math.PI * 0.25,
      label: 'Champions’ Pedestals',
      verb: 'Inspect',
    },
    {
      id: ix('int.library.board'),
      kind: InteractableKind.QuestBoard,
      position: { x: 18.8, z: -18.8 },
      approach: wp('wp.library.stacks'),
      facing: Math.PI * 1.75,
      label: 'Notice Board',
      verb: 'Read',
    },
  ],

  npcs: [
    {
      id: npc('npc.vosk'),
      name: 'Professor Ilyra Vosk',
      role: NpcRole.Professor,
      homeZone: COURTYARD_ZONE_ID,
      appearance: 'robe.indigo',
      schedule: [
        { startMinute: 6 * 60, waypoint: wp('wp.scribe.table'), activity: NpcActivity.Teach },
        { startMinute: 12 * 60, waypoint: wp('wp.plaza.center'), activity: NpcActivity.Idle },
        { startMinute: 15 * 60, waypoint: wp('wp.scribe.desk'), activity: NpcActivity.Teach },
        { startMinute: 21 * 60, waypoint: wp('wp.library.stacks'), activity: NpcActivity.Study },
      ],
      barks: [
        'A steady hand costs nothing. Impatience costs a canvas.',
        'Grade nine is not luck. It is the fourth hundred attempt.',
        'Show me the ink before you show me the card.',
      ],
    },
    {
      id: npc('npc.vell'),
      name: 'Quartermaster Vell',
      role: NpcRole.Merchant,
      homeZone: COURTYARD_ZONE_ID,
      appearance: 'coat.umber',
      schedule: [
        {
          startMinute: 7 * 60,
          waypoint: wp('wp.arcade.quartermaster'),
          activity: NpcActivity.Trade,
        },
        {
          startMinute: 13 * 60,
          waypoint: wp('wp.arcade.consignment'),
          activity: NpcActivity.Trade,
        },
        { startMinute: 22 * 60, waypoint: wp('wp.plaza.south'), activity: NpcActivity.Idle },
      ],
      barks: [
        'Resin, sleeves, sealing wax. No credit.',
        'Everyone wants a slab. Nobody wants to buy polish.',
      ],
    },
    {
      id: npc('npc.onn'),
      name: 'Archivist Onn',
      role: NpcRole.Archivist,
      homeZone: COURTYARD_ZONE_ID,
      appearance: 'robe.slate',
      schedule: [
        { startMinute: 5 * 60, waypoint: wp('wp.library.stacks'), activity: NpcActivity.Study },
        { startMinute: 13 * 60, waypoint: wp('wp.plaza.north'), activity: NpcActivity.Wander },
        { startMinute: 16 * 60, waypoint: wp('wp.library.entry'), activity: NpcActivity.Study },
      ],
      barks: [
        'Every serial ever struck is written down. Somewhere.',
        'The board changes at dawn. So do I.',
      ],
    },
    {
      id: npc('npc.renn'),
      name: 'Sable Renn',
      role: NpcRole.Rival,
      homeZone: COURTYARD_ZONE_ID,
      appearance: 'robe.crimson',
      schedule: [
        { startMinute: 8 * 60, waypoint: wp('wp.duel.circle.north'), activity: NpcActivity.Spar },
        { startMinute: 11 * 60, waypoint: wp('wp.plaza.center'), activity: NpcActivity.Wander },
        { startMinute: 17 * 60, waypoint: wp('wp.duel.circle.south'), activity: NpcActivity.Spar },
        {
          startMinute: 23 * 60,
          waypoint: wp('wp.champions.pedestals'),
          activity: NpcActivity.Idle,
        },
      ],
      barks: [
        'Twenty cards. No excuses in there.',
        'You keep the slab. I will keep the match.',
        'Bring the deck you actually play.',
      ],
    },
    {
      id: npc('npc.bram'),
      name: 'Groundskeeper Bram',
      role: NpcRole.Groundskeeper,
      homeZone: COURTYARD_ZONE_ID,
      appearance: 'apron.moss',
      schedule: [
        { startMinute: 4 * 60, waypoint: wp('wp.grove.stand'), activity: NpcActivity.Tend },
        { startMinute: 11 * 60, waypoint: wp('wp.garden.beds'), activity: NpcActivity.Tend },
        { startMinute: 19 * 60, waypoint: wp('wp.plaza.southwest'), activity: NpcActivity.Idle },
      ],
      barks: [
        'Cut low on the emberwood. It comes back angry otherwise.',
        'Mushrooms first, questions later.',
      ],
    },
    {
      id: npc('npc.dun'),
      name: 'Referee Calla Dun',
      role: NpcRole.Referee,
      homeZone: COURTYARD_ZONE_ID,
      appearance: 'sash.gilt',
      schedule: [
        { startMinute: 7 * 60, waypoint: wp('wp.duel.entry'), activity: NpcActivity.Idle },
        { startMinute: 14 * 60, waypoint: wp('wp.duel.circle.north'), activity: NpcActivity.Idle },
        { startMinute: 20 * 60, waypoint: wp('wp.plaza.south'), activity: NpcActivity.Wander },
      ],
      barks: [
        'Thirty seconds a turn. The clock does not negotiate.',
        'Step inside the ring or step aside.',
      ],
    },
  ],
};
