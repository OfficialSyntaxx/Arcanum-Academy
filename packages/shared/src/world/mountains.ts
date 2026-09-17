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
  bounds: { minX: -96, maxX: 96, minZ: -96, maxZ: 96 },
  terrain: {
    baseHeight: 0,
    terraces: [
      // The foothill camp works from a levelled shelf partway up the climb.
      { minX: -14.4, maxX: 33.6, minZ: -62.4, maxZ: -43.2, height: 0.4 },
      // The mine cuts deep — deeper than the Courtyard's Resonance Mines.
      { minX: -72, maxX: -38.4, minZ: -52.8, maxZ: -9.6, height: -1.0 },
      // The watchtower plateau is the highest ground in the academy's world.
      { minX: -33.6, maxX: 33.6, minZ: 43.2, maxZ: 91.2, height: 2.6 },
    ],
    canals: [
      // A glacial pool along the trail, fed by meltwater. Still, for now.
      { minX: -9.6, maxX: 9.6, minZ: -72, maxZ: -57.6, waterHeight: -0.05 },
    ],
  },
  spawn: wp('wp.mountains.gate'),
  atmosphere: 'mountains.overcast',
  ambientPopulation: 12,
  waypoints: [
    {
      id: wp('wp.mountains.gate'),
      position: { x: 0, z: -76.8 },
      radius: 3,
      links: [wp('wp.foothill.camp')],
      tags: ['portal'],
    },
    {
      id: wp('wp.foothill.camp'),
      position: { x: 0, z: -52.8 },
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
      position: { x: 19.2, z: -52.8 },
      radius: 2,
      links: [wp('wp.foothill.camp')],
      tags: ['crafting'],
    },

    // --- Cindermark Mine (west) ---------------------------------------------
    {
      id: wp('wp.mine.path'),
      position: { x: -24, z: -43.2 },
      radius: 2.5,
      links: [wp('wp.foothill.camp'), wp('wp.mine.entrance')],
    },
    {
      id: wp('wp.mine.entrance'),
      position: { x: -48, z: -33.6 },
      radius: 2.8,
      links: [wp('wp.mine.path'), wp('wp.mine.seam'), wp('wp.mine.crystal')],
    },
    {
      id: wp('wp.mine.seam'),
      position: { x: -67.2, z: -43.2 },
      radius: 2,
      links: [wp('wp.mine.entrance')],
      tags: ['gathering'],
    },
    {
      id: wp('wp.mine.crystal'),
      position: { x: -67.2, z: -19.2 },
      radius: 2,
      links: [wp('wp.mine.entrance')],
      tags: ['gathering', 'mystic'],
    },

    // --- The Ascent (north) --------------------------------------------------
    {
      id: wp('wp.ascent.path'),
      position: { x: 24, z: -28.8 },
      radius: 2.5,
      links: [wp('wp.foothill.camp'), wp('wp.ascent.switchback')],
    },
    {
      id: wp('wp.ascent.switchback'),
      position: { x: 38.4, z: 0 },
      radius: 2.5,
      links: [wp('wp.ascent.path'), wp('wp.ascent.upper'), wp('wp.scree.path')],
    },
    {
      id: wp('wp.ascent.upper'),
      position: { x: 24, z: 33.6 },
      radius: 2.5,
      links: [wp('wp.ascent.switchback'), wp('wp.watchtower.plateau')],
    },

    // --- Watchtower Plateau ---------------------------------------------------
    {
      id: wp('wp.watchtower.plateau'),
      position: { x: 0, z: 62.4 },
      radius: 4,
      links: [wp('wp.ascent.upper'), wp('wp.watchtower.arena'), wp('wp.watchtower.board')],
      tags: ['plaza', 'social'],
    },
    {
      id: wp('wp.watchtower.arena'),
      position: { x: -19.2, z: 81.6 },
      radius: 2.5,
      links: [wp('wp.watchtower.plateau')],
      tags: ['duelling'],
    },
    {
      id: wp('wp.watchtower.board'),
      position: { x: 19.2, z: 81.6 },
      radius: 2,
      links: [wp('wp.watchtower.plateau')],
      tags: ['quests'],
    },

    // --- Scree slope (east) ---------------------------------------------
    // A loose shelf below the ridge where the mountain wolves den.
    {
      id: wp('wp.scree.path'),
      position: { x: 58, z: 10 },
      radius: 2.5,
      links: [wp('wp.ascent.switchback'), wp('wp.scree.den')],
    },
    {
      id: wp('wp.scree.den'),
      position: { x: 72, z: 34 },
      radius: 3,
      links: [wp('wp.scree.path'), wp('wp.scree.ledge')],
      tags: ['wilds'],
    },
    {
      id: wp('wp.scree.ledge'),
      position: { x: 84, z: 48 },
      radius: 2.5,
      links: [wp('wp.scree.den')],
      tags: ['wilds'],
    },
  ],

  interactables: [
    {
      id: ix('int.clue.foothill_mark'),
      kind: InteractableKind.ClueSite,
      position: { x: 1.4, z: -52.2 },
      approach: wp('wp.foothill.camp'),
      facing: Math.PI,
      label: 'Foothill Tideglass Mark',
      verb: 'Inspect',
    },
    {
      id: ix('int.mountains.portal'),
      kind: InteractableKind.ZonePortal,
      position: { x: 0, z: -80.6 },
      approach: wp('wp.mountains.gate'),
      facing: 0,
      label: 'Trailhead Gate',
      verb: 'Return',
      targetZone: COURTYARD_ZONE_ID,
    },
    {
      id: ix('int.foothill.forge'),
      kind: InteractableKind.CraftingStation,
      position: { x: 23, z: -52.8 },
      approach: wp('wp.foothill.forge'),
      facing: Math.PI * 1.5,
      label: 'Highland Forge',
      verb: 'Smith',
    },
    {
      id: ix('int.foothill.market'),
      kind: InteractableKind.MerchantStall,
      position: { x: 0, z: -56.6 },
      approach: wp('wp.foothill.camp'),
      facing: 0,
      label: 'Foothill Trading Post',
      verb: 'Trade',
    },
    {
      id: ix('int.mine.seam'),
      kind: InteractableKind.GatheringNode,
      position: { x: -71, z: -43.2 },
      approach: wp('wp.mine.seam'),
      facing: Math.PI * 0.5,
      label: 'Deep Ore Seam',
      verb: 'Mine',
    },
    {
      id: ix('int.mine.crystal'),
      kind: InteractableKind.GatheringNode,
      position: { x: -71, z: -19.2 },
      approach: wp('wp.mine.crystal'),
      facing: Math.PI * 0.5,
      label: 'Resonant Outcrop',
      verb: 'Mine',
      requiredLevel: 5,
    },
    {
      id: ix('int.watchtower.board'),
      kind: InteractableKind.QuestBoard,
      position: { x: 19.2, z: 85.4 },
      approach: wp('wp.watchtower.board'),
      facing: 0,
      label: "Watch Captain's Board",
      verb: 'Read',
    },

    // --- The wilds ---------------------------------------------------------
    {
      id: ix('int.combat.ridge_wolf_a'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 73, z: 35.6 },
      approach: wp('wp.scree.den'),
      facing: Math.PI * 1.25,
      label: 'Ridge Wolf',
      verb: 'Attack',
    },
    {
      id: ix('int.combat.ridge_wolf_b'),
      kind: InteractableKind.CombatEncounter,
      position: { x: 85, z: 49.6 },
      approach: wp('wp.scree.ledge'),
      facing: Math.PI * 1.25,
      label: 'Ridge Wolf',
      verb: 'Attack',
    },
    {
      id: ix('int.combat.cinder_wisp'),
      kind: InteractableKind.CombatEncounter,
      position: { x: -20.4, z: 83.2 },
      approach: wp('wp.watchtower.arena'),
      facing: Math.PI * 0.5,
      label: 'Cinder Wisp',
      verb: 'Attack',
    },
  ],

  buildings: [
    // The Highland Forge is walled and roofed — a smithy needs a chimney and
    // a door, not an open shelf. It sits on a corner of the foothill camp's
    // existing platform.
    {
      minX: 9.6,
      maxX: 28.8,
      minZ: -60.8,
      maxZ: -44.8,
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
