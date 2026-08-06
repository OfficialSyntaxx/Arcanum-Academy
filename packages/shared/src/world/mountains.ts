/**
 * The Cindermark Heights — the mountains zone.
 *
 * Authored the same way as the Courtyard (see `courtyard.ts`). The layout is
 * linear rather than radial on purpose: a trailhead gate climbs through a
 * foothill camp, forks once into the mines, and switches back up a single
 * ascent to a high watchtower plateau — the highest ground in the academy's
 * world, terraced well above the Courtyard's tallest hall.
 *
 * Scaled 1.5x over the first pass (120m across) — the tallest and now the
 * widest of the four zones, matching its dramatic vertical range.
 *
 *   Trailhead Gate
 *         |
 *   Foothill Camp — Highland Forge
 *      /       \
 *  Cindermark   Ascent Switchback
 *    Mine             |
 *   /     \      Ascent Upper
 *  Seam Outcrop        |
 *                Watchtower Plateau
 *                  /          \
 *           Rockfall Arena   Watch Captain's Board
 */

import type { InteractableId, NpcDefinitionId, WaypointId } from '../ids.js';
import { BuildingDoorSide, InteractableKind, NpcActivity, NpcRole, type Zone } from './types.js';
import { COURTYARD_ZONE_ID, MOUNTAINS_ZONE_ID } from './zone-ids.js';

const wp = (id: string): WaypointId => id as WaypointId;
const ix = (id: string): InteractableId => id as InteractableId;
const npc = (id: string): NpcDefinitionId => id as NpcDefinitionId;

export { MOUNTAINS_ZONE_ID } from './zone-ids.js';

export const MOUNTAINS: Zone = {
  id: MOUNTAINS_ZONE_ID,
  name: 'The Cindermark Heights',
  bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  terrain: {
    baseHeight: 0,
    terraces: [
      // The foothill camp works from a levelled shelf partway up the climb.
      { minX: -9, maxX: 21, minZ: -39, maxZ: -27, height: 0.4 },
      // The mine cuts deep — deeper than the Courtyard's Resonance Mines.
      { minX: -45, maxX: -24, minZ: -33, maxZ: -6, height: -1.0 },
      // The watchtower plateau is the highest ground in the academy's world.
      { minX: -21, maxX: 21, minZ: 27, maxZ: 57, height: 2.6 },
    ],
    canals: [
      // A glacial pool along the trail, fed by meltwater. Still, for now.
      { minX: -6, maxX: 6, minZ: -45, maxZ: -36, waterHeight: -0.05 },
    ],
  },
  spawn: wp('wp.mountains.gate'),
  atmosphere: 'mountains.overcast',
  ambientPopulation: 12,
  waypoints: [
    {
      id: wp('wp.mountains.gate'),
      position: { x: 0, z: -48 },
      radius: 3,
      links: [wp('wp.foothill.camp')],
      tags: ['portal'],
    },
    {
      id: wp('wp.foothill.camp'),
      position: { x: 0, z: -33 },
      radius: 3.5,
      links: [
        wp('wp.mountains.gate'),
        wp('wp.mine.path'),
        wp('wp.ascent.path'),
        wp('wp.foothill.forge'),
      ],
      tags: ['plaza', 'social', 'spawn'],
    },
    {
      id: wp('wp.foothill.forge'),
      position: { x: 12, z: -33 },
      radius: 2,
      links: [wp('wp.foothill.camp')],
      tags: ['crafting'],
    },

    // --- Cindermark Mine (west) ---------------------------------------------
    {
      id: wp('wp.mine.path'),
      position: { x: -15, z: -27 },
      radius: 2.5,
      links: [wp('wp.foothill.camp'), wp('wp.mine.entrance')],
    },
    {
      id: wp('wp.mine.entrance'),
      position: { x: -30, z: -21 },
      radius: 2.8,
      links: [wp('wp.mine.path'), wp('wp.mine.seam'), wp('wp.mine.crystal')],
    },
    {
      id: wp('wp.mine.seam'),
      position: { x: -42, z: -27 },
      radius: 2,
      links: [wp('wp.mine.entrance')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.mine.crystal'),
      position: { x: -42, z: -12 },
      radius: 2,
      links: [wp('wp.mine.entrance')],
      tags: ['gathering', 'mystic'],
    },

    // --- The Ascent (north) --------------------------------------------------
    {
      id: wp('wp.ascent.path'),
      position: { x: 15, z: -18 },
      radius: 2.5,
      links: [wp('wp.foothill.camp'), wp('wp.ascent.switchback')],
    },
    {
      id: wp('wp.ascent.switchback'),
      position: { x: 24, z: 0 },
      radius: 2.5,
      links: [wp('wp.ascent.path'), wp('wp.ascent.upper')],
    },
    {
      id: wp('wp.ascent.upper'),
      position: { x: 15, z: 21 },
      radius: 2.5,
      links: [wp('wp.ascent.switchback'), wp('wp.watchtower.plateau')],
    },

    // --- Watchtower Plateau ---------------------------------------------------
    {
      id: wp('wp.watchtower.plateau'),
      position: { x: 0, z: 39 },
      radius: 4,
      links: [wp('wp.ascent.upper'), wp('wp.watchtower.arena'), wp('wp.watchtower.board')],
      tags: ['plaza', 'social'],
    },
    {
      id: wp('wp.watchtower.arena'),
      position: { x: -12, z: 51 },
      radius: 2.5,
      links: [wp('wp.watchtower.plateau')],
      tags: ['duelling'],
    },
    {
      id: wp('wp.watchtower.board'),
      position: { x: 12, z: 51 },
      radius: 2,
      links: [wp('wp.watchtower.plateau')],
      tags: ['quests'],
    },
  ],

  interactables: [
    {
      id: ix('int.mountains.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -50.4 },
      approach: wp('wp.mountains.gate'),
      facing: 0,
      label: 'Trailhead Gate',
      verb: 'Return',
      targetZone: COURTYARD_ZONE_ID,
    },
    {
      id: ix('int.foothill.forge'),
      kind: InteractableKind.CraftingStation,
      position: { x: 14.4, z: -33 },
      approach: wp('wp.foothill.forge'),
      facing: Math.PI * 1.5,
      label: 'Highland Forge',
      verb: 'Smith',
    },
    {
      id: ix('int.foothill.market'),
      kind: InteractableKind.MerchantStall,
      position: { x: 0, z: -35.4 },
      approach: wp('wp.foothill.camp'),
      facing: 0,
      label: 'Foothill Trading Post',
      verb: 'Trade',
    },
    {
      id: ix('int.mine.seam'),
      kind: InteractableKind.GatheringNode,
      position: { x: -44.4, z: -27 },
      approach: wp('wp.mine.seam'),
      facing: Math.PI * 0.5,
      label: 'Deep Ore Seam',
      verb: 'Mine',
    },
    {
      id: ix('int.mine.crystal'),
      kind: InteractableKind.GatheringNode,
      position: { x: -44.4, z: -12 },
      approach: wp('wp.mine.crystal'),
      facing: Math.PI * 0.5,
      label: 'Resonant Outcrop',
      verb: 'Mine',
      requiredLevel: 5,
    },
    {
      id: ix('int.watchtower.beacon'),
      kind: InteractableKind.DisplayPedestal,
      position: { x: 2.4, z: 39 },
      approach: wp('wp.watchtower.plateau'),
      facing: Math.PI * 1.5,
      label: 'Beacon of the Watch',
      verb: 'Inspect',
    },
    {
      id: ix('int.watchtower.arena'),
      kind: InteractableKind.DuelCircle,
      position: { x: -12, z: 53.4 },
      approach: wp('wp.watchtower.arena'),
      facing: 0,
      label: 'Rockfall Arena',
      verb: 'Duel',
    },
    {
      id: ix('int.watchtower.board'),
      kind: InteractableKind.QuestBoard,
      position: { x: 12, z: 53.4 },
      approach: wp('wp.watchtower.board'),
      facing: 0,
      label: "Watch Captain's Board",
      verb: 'Read',
    },
  ],

  buildings: [
    // The Highland Forge is walled and roofed — a smithy needs a chimney and
    // a door, not an open shelf. It sits on a corner of the foothill camp's
    // existing platform.
    {
      minX: 6,
      maxX: 18,
      minZ: -38,
      maxZ: -28,
      wallHeight: 3.4,
      roofHeight: 2,
      doorSide: BuildingDoorSide.South,
      doorWidth: 2.8,
      doorTrigger: wp('wp.foothill.forge'),
    },
  ],

  npcs: [
    {
      id: npc('npc.crake'),
      name: 'Foreman Hollis Crake',
      role: NpcRole.Groundskeeper,
      homeZone: MOUNTAINS_ZONE_ID,
      appearance: 'coat.iron',
      schedule: [
        { startMinute: 5 * 60, waypoint: wp('wp.mine.entrance'), activity: NpcActivity.Tend },
        { startMinute: 11 * 60, waypoint: wp('wp.mine.seam'), activity: NpcActivity.Tend },
        { startMinute: 16 * 60, waypoint: wp('wp.foothill.camp'), activity: NpcActivity.Wander },
        { startMinute: 21 * 60, waypoint: wp('wp.mountains.gate'), activity: NpcActivity.Idle },
      ],
      barks: [
        'The seam runs deeper every season. So does the noise it makes at night.',
        'Two ropes down, always. The mountain does not forgive one.',
      ],
    },
    {
      id: npc('npc.tolvan'),
      name: 'Battlemaster Ashra Tolvan',
      role: NpcRole.Referee,
      homeZone: MOUNTAINS_ZONE_ID,
      appearance: 'sash.iron',
      schedule: [
        {
          startMinute: 7 * 60,
          waypoint: wp('wp.watchtower.arena'),
          activity: NpcActivity.Idle,
        },
        {
          startMinute: 13 * 60,
          waypoint: wp('wp.watchtower.plateau'),
          activity: NpcActivity.Wander,
        },
        { startMinute: 19 * 60, waypoint: wp('wp.watchtower.arena'), activity: NpcActivity.Idle },
      ],
      barks: [
        'The wind decides half of every duel up here. Respect it.',
        'Southern Circle is for practice. This one keeps score.',
      ],
    },
    {
      id: npc('npc.brix'),
      name: 'Prospector Brix',
      role: NpcRole.Merchant,
      homeZone: MOUNTAINS_ZONE_ID,
      appearance: 'coat.umber',
      schedule: [
        {
          startMinute: 8 * 60,
          waypoint: wp('wp.foothill.camp'),
          activity: NpcActivity.Trade,
        },
        { startMinute: 14 * 60, waypoint: wp('wp.mine.path'), activity: NpcActivity.Wander },
        {
          startMinute: 20 * 60,
          waypoint: wp('wp.foothill.forge'),
          activity: NpcActivity.Idle,
        },
      ],
      barks: [
        'Everything I sell came down that mountain on my own back. Price reflects it.',
        'Buy the rope before you need it, not after.',
      ],
    },
  ],
};
