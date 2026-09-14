import {
  addItems,
  awardXp,
  createSparringState,
  removeItems,
  resolveMeleeRoll,
  resolveSparringAttack,
  respawnSparringTarget,
} from '@alderfell/sim';
import {
  asId,
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
import {
  maximumHitpoints,
  skillProgress,
  type GravestoneState,
} from '../../domain/player-state.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { SessionId } from '@alderfell/shared';

const ATTACK_SKILL = asId<SkillId>('skill.attack');
const STRENGTH_SKILL = asId<SkillId>('skill.strength');
const DEFENCE_SKILL = asId<SkillId>('skill.defence');
const HITPOINTS_SKILL = asId<SkillId>('skill.hitpoints');
type CombatStyle = 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE';
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
  return style === 'AGGRESSIVE' || style === 'DEFENSIVE' || style === 'ACCURATE'
    ? style
    : 'ACCURATE';
}
function itemId(payload: unknown): ItemDefinitionId | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>).itemId;
  return typeof value === 'string' && value.length > 0 ? asId<ItemDefinitionId>(value) : null;
}

function gravePatch(grave: GravestoneState | null) {
  return grave === null
    ? null
    : {
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
      const target = respawnSparringTarget(
        state.combatTargets[id!] ?? createSparringState(encounter.maxHitpoints, now),
        now,
      );
      const roll = resolveMeleeRoll(
        {
          attackLevel: attackProgress.level,
          strengthLevel: strengthProgress.level,
          defenceLevel: defenceProgress.level,
          attackBonus: style === 'ACCURATE' ? 3 : 0,
          strengthBonus: style === 'AGGRESSIVE' ? 3 : 0,
          defenceBonus: 0,
        },
        Rng.fromSeed(`${session.playerId}:${id}:${target.defeats}:${target.nextAttackAtMs}`),
      );
      // A first encounter must always make progress. The roll remains the one
      // source of truth for damage once equipment and levels raise max hit;
      // this authored floor only protects the level-one Shore Wolf lesson.
      const playerDamage = Math.max(encounter.playerDamage, roll.damage);
      const enemyDamage = Math.max(0, encounter.enemyDamage - (style === 'DEFENSIVE' ? 1 : 0));
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
      if (defeated) {
        for (const drop of encounter.drops) {
          const awardedDrop = addItems(inventory, drop.itemId, drop.quantity, options.items);
          if (!awardedDrop.ok) return err(awardedDrop.error);
          inventory = awardedDrop.value;
        }
      }
      const styleSkillId =
        style === 'ACCURATE'
          ? ATTACK_SKILL
          : style === 'AGGRESSIVE'
            ? STRENGTH_SKILL
            : DEFENCE_SKILL;
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
      const next = {
        ...state,
        inventory: deathSplit === null ? inventory : { ...inventory, stacks: deathSplit.kept },
        combatTargets: { ...state.combatTargets, [id!]: nextTarget },
        hitpoints: nextHp,
        coins: state.coins + coins,
        skills,
        grave,
        quests,
        lastSeenAtMs: now,
      };
      return ok({
        state: next,
        value: {
          inventory: { stacks: next.inventory.stacks, slotCapacity: next.inventory.slotCapacity },
          grave: gravePatch(next.grave),
          hitpoints: next.hitpoints,
          coins: next.coins,
          skills: next.skills,
          quests: next.quests,
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
            coinsGained: coins,
            drops: defeated ? encounter.drops : [],
            combatXpGained: styleXp,
            hitpointsXpGained: hitpointsXp,
            styleSkillId,
            style,
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
      const next = { ...state, inventory, grave: null, lastSeenAtMs: now };
      return ok({
        state: next,
        value: {
          inventory: { stacks: next.inventory.stacks, slotCapacity: next.inventory.slotCapacity },
          grave: null,
        },
      });
    });
  };
  router.register('combat.attack', attack);
  router.register('combat.recover', recover);
  router.register('combat.eat', eat);
  router.register('combat.reclaim_grave', reclaimGrave);
}
