import { asId, type InteractableId, type ItemDefinitionId } from '../ids.js';

/**
 * Shared authored values for server-authoritative encounters.
 *
 * Creatures carry real OSRS-shaped combat levels rather than fixed damage
 * numbers. Both sides roll on every tick: the player's Attack, Strength and
 * Defence decide how often they hit, how hard, and how often the creature
 * misses them, so every level gained is felt in a fight.
 */
/** Which graded creature model the client shows for an encounter. */
export type CreatureModel = 'wolf' | 'armabee' | 'ghost' | 'ghost-skull';

export interface CombatEncounterDefinition {
  readonly interactableId: InteractableId;
  readonly label: string;
  readonly creature: CreatureModel;
  readonly position: { readonly x: number; readonly z: number };
  readonly maxHitpoints: number;
  /** The creature's own combat skills, rolled against the player's every tick. */
  readonly attackLevel: number;
  readonly strengthLevel: number;
  readonly defenceLevel: number;
  /** True when the creature attacks a player who walks into its reach. */
  readonly aggressive: boolean;
  readonly rewardCoins: number;
  /** Guaranteed material loot, awarded only on a confirmed defeat. */
  readonly drops: readonly { readonly itemId: ItemDefinitionId; readonly quantity: number }[];
  readonly respawnMs: number;
  readonly playerRecoveryMs: number;
  readonly requiredCombatLevel: number;
  /**
   * Drops that are rolled rather than given.
   *
   * `oneInChance` is the denominator of a uniform roll, so 128 means one kill
   * in 128 on average. Guaranteed `drops` are what a creature is worth; this
   * is what makes killing it again interesting. Rolled server-side from the
   * same seeded RNG as the fight, so a client cannot fish for a drop by
   * replaying the killing blow.
   */
  readonly rareDrops?: readonly {
    readonly itemId: ItemDefinitionId;
    readonly quantity: number;
    readonly oneInChance: number;
  }[];
  /**
   * The style this creature struggles against, if any.
   *
   * The combat triangle, and the reason a stance is a decision rather than a
   * label: matching it is worth `TRIANGLE_ADVANTAGE` effective levels of
   * accuracy. Damage is untouched, so a good matchup means landing more often
   * rather than hitting harder, and a bad one is slower rather than hopeless.
   */
  readonly weakTo?: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE' | 'RANGED' | 'MAGIC';
  readonly zoneId?: string;
  readonly requiredQuestId?: string;
  readonly boss?: boolean;
}

export const SHORE_WOLF: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.shore_wolf'),
  label: 'Shore Wolf',
  creature: 'wolf',
  position: { x: 0, z: 12.8 },
  // The first real fight should teach the loop, not punish a new arrival.
  maxHitpoints: 4,
  attackLevel: 1,
  strengthLevel: 1,
  defenceLevel: 1,
  aggressive: true,
  rewardCoins: 6,
  // The first creature teaches that the stance matters, and teaches it by
  // making the player *change* something: Accurate is the default stance, so a
  // weakness to it would be granted automatically and felt by nobody. Weight
  // behind the swing is the answer to a lean coastal wolf, and switching to it
  // is the lesson.
  weakTo: 'AGGRESSIVE',
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.meat.raw_shore_wolf'), quantity: 1 },
  ]),
  respawnMs: 4_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 1,
});

/** A second, small encounter that teaches target variety without a level wall. */
export const EMBERWING_ARMABEE: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.emberwing_armabee'),
  label: 'Emberwing Armabee',
  creature: 'armabee',
  position: { x: -7, z: 19 },
  maxHitpoints: 5,
  attackLevel: 3,
  strengthLevel: 2,
  defenceLevel: 2,
  aggressive: false,
  rewardCoins: 8,
  // It hovers out of comfortable reach of a blade. Worth coming back for once
  // there is a bow in the satchel.
  weakTo: 'RANGED',
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.armabee_wax'), quantity: 1 },
  ]),
  respawnMs: 5_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 1,
});

export const DROWNED_SENTINEL: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.drowned_sentinel'),
  label: 'Drowned Sentinel',
  creature: 'ghost',
  position: { x: 0, z: -5 },
  maxHitpoints: 9,
  attackLevel: 8,
  strengthLevel: 8,
  defenceLevel: 10,
  aggressive: true,
  rewardCoins: 12,
  // A drowned thing in heavy plate: slow, and it dislikes being hit hard.
  weakTo: 'AGGRESSIVE',
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.saltworn_fragment'), quantity: 1 },
  ]),
  // An ingot is eight Refining levels of work, so pulling one off a sentinel
  // is worth walking back for without replacing the forge.
  rareDrops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.ingot.resonant'), quantity: 1, oneInChance: 12 },
  ]),
  respawnMs: 8_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 2,
  zoneId: 'zone.saltwake_ruins',
  requiredQuestId: 'quest.beneath_the_saltline',
});

export const DROWNED_WARDEN: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.drowned_warden'),
  label: 'Drowned Warden',
  creature: 'ghost-skull',
  position: { x: 0, z: 6.5 },
  maxHitpoints: 18,
  attackLevel: 15,
  strengthLevel: 14,
  defenceLevel: 12,
  aggressive: false,
  rewardCoins: 24,
  // Scaled against steel, but the staff finds the gaps.
  weakTo: 'MAGIC',
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.warden_scale'), quantity: 1 },
  ]),
  // The one piece in the game that is found rather than made. A boss with a
  // quest gate in front of it is the right place for the only such drop.
  rareDrops: Object.freeze([
    {
      itemId: asId<ItemDefinitionId>('item.armour.tideglass_cape'),
      quantity: 1,
      oneInChance: 24,
    },
  ]),
  respawnMs: 15_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 3,
  zoneId: 'zone.saltwake_ruins',
  requiredQuestId: 'quest.beneath_the_saltline',
  boss: true,
});

/**
 * The Emberwood Reach pack. Still the first rung of the ladder, but a fight
 * you should bring food to: two wolves den together, both aggressive. At
 * level 1 the exchange is close to even, so a full-health player wins
 * narrowly without food and comfortably with it.
 */
function emberwoodWolf(
  suffix: string,
  position: { readonly x: number; readonly z: number },
): CombatEncounterDefinition {
  return Object.freeze({
    interactableId: asId<InteractableId>(`int.combat.emberwood_wolf_${suffix}`),
    label: 'Emberwood Wolf',
    creature: 'wolf' as const,
    position,
    maxHitpoints: 6,
    attackLevel: 2,
    strengthLevel: 2,
    defenceLevel: 2,
    aggressive: true,
    rewardCoins: 7,
    // A pack circles rather than charges; the opening is precision on whichever
    // one commits. Still a melee answer, since the Reach comes before a bow or
    // a staff is realistic.
    weakTo: 'ACCURATE' as const,
    drops: Object.freeze([
      { itemId: asId<ItemDefinitionId>('item.meat.raw_shore_wolf'), quantity: 1 },
    ]),
    respawnMs: 6_000,
    playerRecoveryMs: 5_000,
    requiredCombatLevel: 1,
    zoneId: 'zone.forest',
  });
}

export const EMBERWOOD_WOLF_A = emberwoodWolf('a', { x: 59, z: -53.2 });
export const EMBERWOOD_WOLF_B = emberwoodWolf('b', { x: 71, z: -65.2 });

export const GLADE_ARMABEE: CombatEncounterDefinition = Object.freeze({
  interactableId: asId<InteractableId>('int.combat.glade_armabee'),
  label: 'Glade Armabee',
  creature: 'armabee',
  position: { x: 61.2, z: 56.2 },
  maxHitpoints: 6,
  attackLevel: 2,
  strengthLevel: 2,
  defenceLevel: 3,
  aggressive: false,
  rewardCoins: 9,
  // Same body, same answer as its Shorelands cousin.
  weakTo: 'RANGED',
  drops: Object.freeze([
    { itemId: asId<ItemDefinitionId>('item.material.armabee_wax'), quantity: 1 },
  ]),
  respawnMs: 6_000,
  playerRecoveryMs: 5_000,
  requiredCombatLevel: 1,
  zoneId: 'zone.forest',
});

/** A wolf pack for a region, one rung of levels apart from the last. */
function wolfPack(
  prefix: string,
  label: string,
  zoneId: string,
  level: number,
  hitpoints: number,
  coins: number,
  positions: readonly { readonly x: number; readonly z: number }[],
): readonly CombatEncounterDefinition[] {
  return positions.map((position, index) =>
    Object.freeze({
      interactableId: asId<InteractableId>(`int.combat.${prefix}_${'ab'[index]}`),
      label,
      creature: 'wolf' as const,
      position,
      maxHitpoints: hitpoints,
      attackLevel: level,
      strengthLevel: level,
      defenceLevel: level,
      aggressive: true,
      rewardCoins: coins,
      drops: Object.freeze([
        { itemId: asId<ItemDefinitionId>('item.meat.raw_shore_wolf'), quantity: 1 },
      ]),
      // A pack that closes fast is hard to shoot and easy to catch with a
      // channelled staff.
      weakTo: 'MAGIC' as const,
      // Outer-zone packs are a second route to a resonant crystal, so a player
      // who would rather fight than mine is not locked out of the forge line.
      rareDrops: Object.freeze([
        { itemId: asId<ItemDefinitionId>('item.crystal.resonant'), quantity: 1, oneInChance: 16 },
      ]),
      respawnMs: 6_000,
      playerRecoveryMs: 5_000,
      requiredCombatLevel: 1,
      zoneId,
    }),
  );
}

/** The Cindermark ridge pack: bring food and a few levels. */
export const RIDGE_WOLVES = wolfPack('ridge_wolf', 'Ridge Wolf', 'zone.mountains', 4, 10, 10, [
  { x: 73, z: 35.6 },
  { x: 85, z: 49.6 },
]);

/** The Frostgate pack: the strongest open-world fight so far. */
export const FROST_WOLVES = wolfPack('frost_wolf', 'Frost Wolf', 'zone.snow', 6, 12, 13, [
  { x: 67, z: 35.6 },
  { x: 81, z: 53.6 },
]);

/** A passive, hard-skinned spirit that guards a shrine; slow to kill, rewards crystal. */
function wisp(
  id: string,
  label: string,
  zoneId: string,
  position: { readonly x: number; readonly z: number },
  levels: { readonly attack: number; readonly strength: number; readonly defence: number },
  hitpoints: number,
  coins: number,
): CombatEncounterDefinition {
  return Object.freeze({
    interactableId: asId<InteractableId>(id),
    label,
    creature: 'ghost' as const,
    position,
    maxHitpoints: hitpoints,
    attackLevel: levels.attack,
    strengthLevel: levels.strength,
    defenceLevel: levels.defence,
    aggressive: false,
    rewardCoins: coins,
    // A wisp barely has a body to swing at; an arrow through it works better
    // than a blade that passes clean through.
    weakTo: 'RANGED' as const,
    drops: Object.freeze([{ itemId: asId<ItemDefinitionId>('item.crystal.shard'), quantity: 2 }]),
    respawnMs: 9_000,
    playerRecoveryMs: 5_000,
    requiredCombatLevel: 1,
    zoneId,
  });
}

export const CINDER_WISP = wisp(
  'int.combat.cinder_wisp',
  'Cinder Wisp',
  'zone.mountains',
  { x: -20.4, z: 83.2 },
  { attack: 5, strength: 4, defence: 7 },
  9,
  11,
);
export const RIME_WISP = wisp(
  'int.combat.rime_wisp',
  'Rime Wisp',
  'zone.snow',
  { x: -49.8, z: 7 },
  { attack: 7, strength: 5, defence: 9 },
  11,
  14,
);

/** Extra effective Strength the Warden gains below half health. */
/**
 * Effective attack levels gained for matching a creature's weakness.
 *
 * Six is deliberately about twice a style bonus: enough that a player feels
 * the right choice, small enough that the wrong one is still a fight rather
 * than a wall. Owner's to tune.
 */
export const TRIANGLE_ADVANTAGE = 6;

export const BOSS_ENRAGE_STRENGTH_BONUS = 6;

export const COMBAT_ENCOUNTERS = Object.freeze([
  SHORE_WOLF,
  EMBERWING_ARMABEE,
  EMBERWOOD_WOLF_A,
  EMBERWOOD_WOLF_B,
  GLADE_ARMABEE,
  ...RIDGE_WOLVES,
  CINDER_WISP,
  ...FROST_WOLVES,
  RIME_WISP,
  DROWNED_SENTINEL,
  DROWNED_WARDEN,
]);

export function combatEncounterByInteractable(id: string): CombatEncounterDefinition | undefined {
  return COMBAT_ENCOUNTERS.find((encounter) => encounter.interactableId === id);
}
