import {
  addItems,
  awardXp,
  createSparringState,
  effectiveLevel,
  removeItems,
  resolveMeleeRoll,
  resolveSparringAttack,
  respawnSparringTarget,
} from '@alderfell/sim';
import {
  asId,
  BOSS_ENRAGE_STRENGTH_BONUS,
  TRIANGLE_ADVANTAGE,
  combatEncounterByInteractable,
  err,
  failure,
  FailureCode,
  ok,
  recordEncounterDefeat,
  Rng,
  type Failure,
  type ProgressionTunables,
  type ItemCatalog,
  type ItemDefinitionId,
  type ItemStack,
  type Result,
  type SkillId,
  type SkillTable,
} from '@alderfell/shared';
import type { PlayerService, Mutation } from '../../domain/player-service.js';
import { applyDiscovery } from '../../domain/diaries.js';
import {
  maximumHitpoints,
  skillProgress,
  type GravestoneState,
  type PlayerState,
} from '../../domain/player-state.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { SessionId } from '@alderfell/shared';

const ATTACK_SKILL = asId<SkillId>('skill.attack');
const STRENGTH_SKILL = asId<SkillId>('skill.strength');
const DEFENCE_SKILL = asId<SkillId>('skill.defence');
const HITPOINTS_SKILL = asId<SkillId>('skill.hitpoints');
const RANGED_SKILL = asId<SkillId>('skill.ranged');
const MAGIC_SKILL = asId<SkillId>('skill.magic');
/**
 * RANGED is a fourth style rather than a separate combat system.
 *
 * As in OSRS, Ranged supplies both the accuracy and the maximum hit, so one
 * level raises both halves of the roll instead of the Attack/Strength split
 * the melee styles use. It is refused without a bow equipped, which is what
 * makes it a choice of kit rather than a free extra stance.
 */
type CombatStyle = 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE' | 'RANGED' | 'MAGIC';

/** Which skill a style trains, and which weapon requirement it demands. */
const STYLE_SKILL: Readonly<Record<'RANGED' | 'MAGIC', SkillId>> = {
  RANGED: RANGED_SKILL,
  MAGIC: MAGIC_SKILL,
};

/**
 * What a kit style spends per swing.
 *
 * Melee costs nothing and always works, which is what makes it the floor. A
 * bow and a staff hit harder for their level and reach, and the price is that
 * they run out: an arrow is loosed and a mote of resonant dust is burnt. This
 * is the only ongoing cost in combat, and it is what gives the crafting skills
 * a customer.
 */
const STYLE_AMMO: Readonly<Record<'RANGED' | 'MAGIC', ItemDefinitionId>> = {
  RANGED: asId<ItemDefinitionId>('item.ammo.emberwood_arrow'),
  MAGIC: asId<ItemDefinitionId>('item.dust.resonant'),
};
export interface CombatHandlerOptions {
  readonly players: PlayerService;
  readonly skills: SkillTable;
  readonly items: ItemCatalog;
  readonly progression: ProgressionTunables;
  readonly now: () => number;
  readonly tickMs: number;
  readonly interactionRadius: number;
  readonly currencyCap: number;
  readonly combatXpPerDamage: number;
  readonly hitpointsXpPerDamage: number;
  readonly itemsKeptOnDeath: number;
  readonly graveExpiryMs: number | null;
  readonly positionFor: (sessionId: SessionId) => { readonly x: number; readonly z: number } | null;
}
function interactableId(payload: unknown): string | null {
  return typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).interactableId === 'string'
    ? ((payload as Record<string, unknown>).interactableId as string)
    : null;
}
function combatStyle(payload: unknown): CombatStyle {
  if (typeof payload !== 'object' || payload === null) return 'ACCURATE';
  const style = (payload as Record<string, unknown>).style;
  return style === 'AGGRESSIVE' ||
    style === 'DEFENSIVE' ||
    style === 'ACCURATE' ||
    style === 'RANGED' ||
    style === 'MAGIC'
    ? style
    : 'ACCURATE';
}
function itemId(payload: unknown): ItemDefinitionId | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).itemId;
  return typeof value === 'string' && value.length > 0 ? asId<ItemDefinitionId>(value) : null;
}

/**
 * What the player's worn gear is worth this swing.
 *
 * Unknown or non-equipment ids contribute nothing rather than throwing: a save
 * can outlive a content change, and a fight must never fail on one.
 */
function equipmentBonuses(
  state: PlayerState,
  items: ItemCatalog,
): { readonly attack: number; readonly strength: number; readonly defence: number } {
  let attack = 0;
  let strength = 0;
  let defence = 0;
  for (const worn of Object.values(state.equipment)) {
    const equipment = items.get(worn.definitionId)?.equipment;
    if (equipment === undefined) continue;
    attack += equipment.attackBonus;
    strength += equipment.strengthBonus;
    defence += equipment.defenceBonus;
  }
  return { attack, strength, defence };
}

function gravePatch(grave: GravestoneState | null) {
  return grave === null
    ? null
    : {
        zoneId: grave.zoneId,
        position: grave.position,
        stacks: grave.stacks,
        createdAtMs: grave.createdAtMs,
        expiresAtMs: grave.expiresAtMs,
      };
}

function splitProtectedInventory(
  stacks: readonly ItemStack[],
  catalog: ItemCatalog,
  keptCount: number,
): { readonly kept: readonly ItemStack[]; readonly lost: readonly ItemStack[] } {
  const candidates = stacks
    .flatMap((stack) =>
      Array.from({ length: stack.quantity }, () => ({
        definitionId: stack.definitionId,
        value: catalog.get(stack.definitionId)?.baseValue ?? 0,
      })),
    )
    .sort((a, b) => b.value - a.value || a.definitionId.localeCompare(b.definitionId));
  const protectedCounts = new Map<ItemDefinitionId, number>();
  for (const item of candidates.slice(0, keptCount)) {
    protectedCounts.set(item.definitionId, (protectedCounts.get(item.definitionId) ?? 0) + 1);
  }
  const kept: ItemStack[] = [];
  const lost: ItemStack[] = [];
  for (const stack of stacks) {
    const quantityKept = protectedCounts.get(stack.definitionId) ?? 0;
    if (quantityKept > 0) kept.push({ definitionId: stack.definitionId, quantity: quantityKept });
    if (stack.quantity > quantityKept)
      lost.push({ definitionId: stack.definitionId, quantity: stack.quantity - quantityKept });
  }
  return { kept, lost };
}

function mergedStacks(...sources: readonly (readonly ItemStack[])[]): readonly ItemStack[] {
  const quantities = new Map<ItemDefinitionId, number>();
  for (const source of sources)
    for (const stack of source)
      quantities.set(
        stack.definitionId,
        (quantities.get(stack.definitionId) ?? 0) + stack.quantity,
      );
  return [...quantities.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([definitionId, quantity]) => ({ definitionId, quantity }));
}
export function registerCombatHandlers(
  router: RegistryCommandRouter,
  options: CombatHandlerOptions,
): void {
  // The pure sim owns cooldown, defeat and respawn semantics. Keeping the
  // server as an adapter prevents the live rules and replayable rules drifting.
  const attack: CommandHandler = async (session, payload) => {
    const id = interactableId(payload);
    const encounter = id === null ? undefined : combatEncounterByInteractable(id);
    const style = combatStyle(payload);
    if (encounter === undefined)
      return err(failure(FailureCode.NotFound, 'combat.not_an_encounter'));
    const position = options.positionFor(session.id);
    if (position === null) return err(failure(FailureCode.Conflict, 'combat.position_unknown'));
    const dx = position.x - encounter.position.x,
      dz = position.z - encounter.position.z;
    if (dx * dx + dz * dz > options.interactionRadius ** 2)
      return err(failure(FailureCode.Conflict, 'combat.out_of_range'));
    const now = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (encounter.zoneId !== undefined && state.location.zoneId !== encounter.zoneId)
        return err(failure(FailureCode.Conflict, 'combat.wrong_zone'));
      if (
        encounter.requiredQuestId !== undefined &&
        state.quests[encounter.requiredQuestId]?.status === undefined
      )
        return err(failure(FailureCode.Conflict, 'combat.encounter_locked'));
      if (encounter.boss && !state.saltwake.galleryCleared)
        return err(failure(FailureCode.Conflict, 'combat.gallery_not_cleared'));
      if (state.hitpoints.respawnAtMs !== null)
        return err(failure(FailureCode.Conflict, 'combat.player_recovering'));
      const attackProgress = skillProgress(state, ATTACK_SKILL);
      const strengthProgress = skillProgress(state, STRENGTH_SKILL);
      const defenceProgress = skillProgress(state, DEFENCE_SKILL);
      if (
        Math.max(attackProgress.level, strengthProgress.level, defenceProgress.level) <
        encounter.requiredCombatLevel
      )
        return err(failure(FailureCode.Conflict, 'combat.level_required'));
      // Ranged and Magic are choices of kit: without the weapon in hand there
      // is nothing to fire or channel, and allowing either would make it a
      // strictly free stance beside the three that cost nothing.
      if (style === 'RANGED' || style === 'MAGIC') {
        const weapon = state.equipment['WEAPON'];
        const requires = weapon && options.items.get(weapon.definitionId)?.equipment;
        if (requires?.requiredSkillId !== STYLE_SKILL[style])
          return err(
            failure(
              FailureCode.Conflict,
              style === 'RANGED' ? 'combat.ranged_needs_bow' : 'combat.magic_needs_staff',
            ),
          );
      }
      const target = respawnSparringTarget(
        state.combatTargets[id!] ?? createSparringState(encounter.maxHitpoints, now),
        now,
      );
      // One exchange per tick: the player swings, then the creature swings
      // back if it survived. Both are OSRS rolls, so every Attack, Strength
      // and Defence level changes how often a hit lands and how hard.
      const seed = `${session.playerId}:${id}:${target.defeats}:${target.nextAttackAtMs}`;
      const worn = equipmentBonuses(state, options.items);
      // A kit style trains and rolls off its own single skill, the way Ranged
      // and Magic do in OSRS, rather than the Attack/Strength split melee uses.
      const kitSkill = style === 'RANGED' || style === 'MAGIC' ? STYLE_SKILL[style] : null;
      const kitProgress = kitSkill === null ? null : skillProgress(state, kitSkill);
      // The triangle: a creature struggles against the style it is weak to.
      // This is where picking a stance stops being cosmetic.
      const matchup = encounter.weakTo === style ? TRIANGLE_ADVANTAGE : 0;
      const roll = resolveMeleeRoll(
        {
          attackLevel:
            kitProgress !== null
              ? effectiveLevel(kitProgress.level, 3 + matchup)
              : effectiveLevel(attackProgress.level, (style === 'ACCURATE' ? 3 : 0) + matchup),
          strengthLevel:
            kitProgress !== null
              ? effectiveLevel(kitProgress.level)
              : effectiveLevel(strengthProgress.level, style === 'AGGRESSIVE' ? 3 : 0),
          defenceLevel: effectiveLevel(encounter.defenceLevel),
          attackBonus: worn.attack,
          strengthBonus: worn.strength,
          // The creature wears nothing; its defence is its level alone.
          defenceBonus: 0,
        },
        Rng.fromSeed(seed),
      );
      const playerDamage = roll.damage;
      const enraged = encounter.boss === true && target.hitpoints <= encounter.maxHitpoints / 2;
      const enemyRoll = resolveMeleeRoll(
        {
          attackLevel: effectiveLevel(encounter.attackLevel),
          strengthLevel: effectiveLevel(
            encounter.strengthLevel,
            enraged ? BOSS_ENRAGE_STRENGTH_BONUS : 0,
          ),
          defenceLevel: effectiveLevel(defenceProgress.level, style === 'DEFENSIVE' ? 3 : 0),
          attackBonus: 0,
          strengthBonus: 0,
          // Worn armour is what a creature has to swing through.
          defenceBonus: worn.defence,
        },
        Rng.fromSeed(`${seed}:enemy`),
      );
      const enemyDamage = enemyRoll.damage;
      const outcome = resolveSparringAttack(
        target,
        now,
        options.tickMs,
        encounter.respawnMs,
        playerDamage,
      );
      if (outcome.kind === 'rejected')
        return err(failure(FailureCode.Conflict, `combat.${outcome.reason}`));
      const { state: nextTarget, defeated } = outcome;
      let inventory = state.inventory;
      // Spend the shot. Done after the roll is resolved but before any reward,
      // so a swing that misses still costs its arrow - otherwise accuracy would
      // be free and the cost would only apply to swings that already paid off.
      if (style === 'RANGED' || style === 'MAGIC') {
        const spent = removeItems(inventory, STYLE_AMMO[style], 1);
        if (!spent.ok)
          return err(
            failure(
              FailureCode.Conflict,
              style === 'RANGED' ? 'combat.out_of_arrows' : 'combat.out_of_dust',
            ),
          );
        inventory = spent.value;
      }
      const rareDropsAwarded: { itemId: string; quantity: number }[] = [];
      if (defeated) {
        for (const drop of encounter.drops) {
          const awardedDrop = addItems(inventory, drop.itemId, drop.quantity, options.items);
          if (!awardedDrop.ok) return err(awardedDrop.error);
          inventory = awardedDrop.value;
        }
        // Rolled from the killing blow's own seed, so the outcome is fixed the
        // moment the creature falls and cannot be re-rolled by replaying it.
        const dropRng = Rng.fromSeed(`${seed}:drop`);
        for (const rare of encounter.rareDrops ?? []) {
          if (dropRng.nextInt(1, rare.oneInChance) !== 1) continue;
          const awardedRare = addItems(inventory, rare.itemId, rare.quantity, options.items);
          // A full satchel must not destroy a rare drop; the kill still stands
          // and the rest of the reward is paid, but the player is told.
          if (!awardedRare.ok) continue;
          inventory = awardedRare.value;
          rareDropsAwarded.push({ itemId: rare.itemId, quantity: rare.quantity });
        }
      }
      const styleSkillId =
        kitSkill ??
        (style === 'ACCURATE'
          ? ATTACK_SKILL
          : style === 'AGGRESSIVE'
            ? STRENGTH_SKILL
            : DEFENCE_SKILL);
      const styleXp = playerDamage * options.combatXpPerDamage;
      const hitpointsXp = playerDamage * options.hitpointsXpPerDamage;
      const styleSkill = options.skills.get(styleSkillId);
      const hitpointsSkill = options.skills.get(HITPOINTS_SKILL);
      if (styleSkill === undefined || hitpointsSkill === undefined)
        return err(failure(FailureCode.NotFound, 'combat.skill_missing'));
      const awardedStyle = awardXp(
        skillProgress(state, styleSkillId),
        styleXp,
        options.progression,
        styleSkill,
      );
      const awardedHitpoints = awardXp(
        skillProgress(state, HITPOINTS_SKILL),
        hitpointsXp,
        options.progression,
        hitpointsSkill,
      );
      const skills = {
        ...state.skills,
        [styleSkillId]: awardedStyle.progress,
        [HITPOINTS_SKILL]: awardedHitpoints.progress,
      };
      const maximum = maximumHitpoints(skills);
      const playerDefeated = !defeated && state.hitpoints.current - enemyDamage <= 0;
      const nextHp = defeated
        ? { ...state.hitpoints, max: maximum, current: Math.min(state.hitpoints.current, maximum) }
        : {
            current: Math.max(0, Math.min(maximum, state.hitpoints.current - enemyDamage)),
            max: maximum,
            respawnAtMs: playerDefeated ? now + encounter.playerRecoveryMs : null,
          };
      const deathSplit = playerDefeated
        ? splitProtectedInventory(inventory.stacks, options.items, options.itemsKeptOnDeath)
        : null;
      const grave =
        deathSplit === null
          ? state.grave
          : deathSplit.lost.length === 0 && state.grave === null
            ? null
            : {
                zoneId: state.location.zoneId,
                position: { x: position.x, z: position.z },
                stacks: mergedStacks(state.grave?.stacks ?? [], deathSplit.lost),
                createdAtMs: now,
                expiresAtMs: options.graveExpiryMs === null ? null : now + options.graveExpiryMs,
              };
      const quests = defeated
        ? recordEncounterDefeat(state.quests, id as Parameters<typeof recordEncounterDefeat>[1])
        : state.quests;
      const coins = defeated
        ? Math.min(encounter.rewardCoins, options.currencyCap - state.coins)
        : 0;
      const saltwake = defeated
        ? id === 'int.combat.drowned_sentinel'
          ? { ...state.saltwake, galleryCleared: true }
          : id === 'int.combat.drowned_warden'
            ? { ...state.saltwake, bossDefeated: true }
            : state.saltwake
        : state.saltwake;
      const base = {
        ...state,
        inventory: deathSplit === null ? inventory : { ...inventory, stacks: deathSplit.kept },
        combatTargets: { ...state.combatTargets, [id!]: nextTarget },
        hitpoints: nextHp,
        coins: state.coins + coins,
        skills,
        grave,
        quests,
        saltwake,
        lastSeenAtMs: now,
      };
      const next = defeated ? applyDiscovery(base, id!, now, options.currencyCap) : base;
      return ok({
        state: next,
        value: {
          inventory: { stacks: next.inventory.stacks, slotCapacity: next.inventory.slotCapacity },
          grave: gravePatch(next.grave),
          hitpoints: next.hitpoints,
          coins: next.coins,
          skills: next.skills,
          quests: next.quests,
          discoveries: next.discoveries,
          diaryRewards: next.diaryRewards,
          saltwake: next.saltwake,
          combat: {
            interactableId: id,
            label: encounter.label,
            hitpoints: nextTarget.hitpoints,
            maxHitpoints: encounter.maxHitpoints,
            defeated,
            respawnAtMs: nextTarget.respawnAtMs,
            nextAttackAtMs: nextTarget.nextAttackAtMs,
            damage: playerDamage,
            rolledDamage: roll.damage,
            rolledHit: roll.hit,
            enemyDamage: defeated ? 0 : enemyDamage,
            enemyHit: !defeated && enemyRoll.hit,
            coinsGained: coins,
            drops: defeated ? [...encounter.drops, ...rareDropsAwarded] : [],
            combatXpGained: styleXp,
            hitpointsXpGained: hitpointsXp,
            styleSkillId,
            style,
            bossPhase: encounter.boss
              ? nextTarget.hitpoints <= encounter.maxHitpoints / 2
                ? 2
                : 1
              : undefined,
          },
        },
      });
    });
  };
  const recover: CommandHandler = async (session) => {
    const now = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.hitpoints.current > 0 || state.hitpoints.respawnAtMs === null) {
        return err(failure(FailureCode.Conflict, 'combat.recovery_not_needed'));
      }
      if (now < state.hitpoints.respawnAtMs)
        return err(failure(FailureCode.Conflict, 'combat.player_recovering'));
      const hitpoints = {
        current: state.hitpoints.max,
        max: state.hitpoints.max,
        respawnAtMs: null,
      };
      return ok({
        state: { ...state, hitpoints, lastSeenAtMs: now },
        value: { hitpoints, grave: gravePatch(state.grave) },
      });
    });
  };
  const eat: CommandHandler = async (session, payload) => {
    const id = interactableId(payload);
    const foodId = itemId(payload);
    const encounter = id === null ? undefined : combatEncounterByInteractable(id);
    if (encounter === undefined)
      return err(failure(FailureCode.NotFound, 'combat.not_an_encounter'));
    if (foodId === null) return err(failure(FailureCode.Validation, 'combat.food_missing'));
    const position = options.positionFor(session.id);
    if (position === null) return err(failure(FailureCode.Conflict, 'combat.position_unknown'));
    const dx = position.x - encounter.position.x,
      dz = position.z - encounter.position.z;
    if (dx * dx + dz * dz > options.interactionRadius ** 2)
      return err(failure(FailureCode.Conflict, 'combat.out_of_range'));
    const now = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.hitpoints.current <= 0 || state.hitpoints.respawnAtMs !== null)
        return err(failure(FailureCode.Conflict, 'combat.player_recovering'));
      const target = state.combatTargets[id!];
      if (target === undefined || target.hitpoints <= 0 || target.respawnAtMs !== null)
        return err(failure(FailureCode.Conflict, 'combat.no_active_target'));
      const food = options.items.get(foodId);
      if (food?.consumable === undefined)
        return err(failure(FailureCode.Validation, 'combat.not_food'));
      const removed = removeItems(state.inventory, foodId, 1);
      if (!removed.ok) return err(removed.error);
      const hitpoints = {
        current: Math.min(
          state.hitpoints.max,
          state.hitpoints.current + food.consumable.healAmount,
        ),
        max: state.hitpoints.max,
        respawnAtMs: null,
      };
      const nextTarget = { ...target, nextAttackAtMs: now + options.tickMs };
      const next = {
        ...state,
        inventory: removed.value,
        hitpoints,
        combatTargets: { ...state.combatTargets, [id!]: nextTarget },
        lastSeenAtMs: now,
      };
      return ok({
        state: next,
        value: {
          inventory: { stacks: next.inventory.stacks, slotCapacity: next.inventory.slotCapacity },
          hitpoints,
          combat: {
            interactableId: id,
            label: encounter.label,
            hitpoints: nextTarget.hitpoints,
            maxHitpoints: encounter.maxHitpoints,
            defeated: false,
            respawnAtMs: nextTarget.respawnAtMs,
            nextAttackAtMs: nextTarget.nextAttackAtMs,
            damage: 0,
            rolledDamage: 0,
            rolledHit: false,
            enemyDamage: 0,
            enemyHit: false,
            coinsGained: 0,
            drops: [],
            combatXpGained: 0,
            style: 'ACCURATE' as const,
            foodConsumed: {
              itemId: foodId,
              healAmount: food.consumable.healAmount,
            },
          },
        },
      });
    });
  };
  const reclaimGrave: CommandHandler = async (session) => {
    const position = options.positionFor(session.id);
    if (position === null) return err(failure(FailureCode.Conflict, 'combat.position_unknown'));
    const now = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const grave = state.grave;
      if (grave === null) return err(failure(FailureCode.NotFound, 'combat.grave_missing'));
      if (grave.expiresAtMs !== null && now >= grave.expiresAtMs)
        return err(failure(FailureCode.NotFound, 'combat.grave_expired'));
      if (grave.zoneId !== state.location.zoneId)
        return err(failure(FailureCode.Conflict, 'combat.grave_wrong_zone'));
      const dx = position.x - grave.position.x;
      const dz = position.z - grave.position.z;
      if (dx * dx + dz * dz > options.interactionRadius ** 2)
        return err(failure(FailureCode.Conflict, 'combat.grave_out_of_range'));
      let inventory = state.inventory;
      for (const stack of grave.stacks) {
        const added = addItems(inventory, stack.definitionId, stack.quantity, options.items);
        if (!added.ok) return err(added.error);
        inventory = added.value;
      }
      const next = applyDiscovery(
        {
          ...state,
          inventory,
          grave: null,
          lastSeenAtMs: now,
        },
        'event.grave.reclaimed',
        now,
        options.currencyCap,
      );
      return ok({
        state: next,
        value: {
          inventory: { stacks: next.inventory.stacks, slotCapacity: next.inventory.slotCapacity },
          grave: null,
          discoveries: next.discoveries,
          diaryRewards: next.diaryRewards,
          coins: next.coins,
        },
      });
    });
  };
  router.register('combat.attack', attack);
  router.register('combat.recover', recover);
  router.register('combat.eat', eat);
  router.register('combat.reclaim_grave', reclaimGrave);
}
