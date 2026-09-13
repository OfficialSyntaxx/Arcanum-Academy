import {
  addItems,
  awardXp,
  createSparringState,
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
  Rng,
  type Failure,
  type ProgressionTunables,
  type ItemCatalog,
  type Result,
  type SkillId,
  type SkillTable,
} from '@alderfell/shared';
import type { PlayerService, Mutation } from '../../domain/player-service.js';
import { skillProgress } from '../../domain/player-state.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { SessionId } from '@alderfell/shared';

const COMBAT_SKILL = asId<SkillId>('skill.combat');
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
      if (skillProgress(state, COMBAT_SKILL).level < encounter.requiredCombatLevel)
        return err(failure(FailureCode.Conflict, 'combat.level_required'));
      const target = respawnSparringTarget(
        state.combatTargets[id!] ?? createSparringState(encounter.maxHitpoints, now),
        now,
      );
      const combatLevel = skillProgress(state, COMBAT_SKILL).level;
      const roll = resolveMeleeRoll(
        {
          attackLevel: combatLevel,
          strengthLevel: combatLevel,
          defenceLevel: 0,
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
      const nextHp = defeated
        ? state.hitpoints
        : {
            current: Math.max(0, state.hitpoints.current - enemyDamage),
            max: state.hitpoints.max,
            respawnAtMs:
              state.hitpoints.current - enemyDamage <= 0 ? now + encounter.playerRecoveryMs : null,
          };
      const xp = playerDamage * options.combatXpPerDamage + (style === 'ACCURATE' ? 1 : 0);
      const skill = options.skills.get(COMBAT_SKILL);
      if (skill === undefined) return err(failure(FailureCode.NotFound, 'combat.skill_missing'));
      const awarded = awardXp(skillProgress(state, COMBAT_SKILL), xp, options.progression, skill);
      const coins = defeated
        ? Math.min(encounter.rewardCoins, options.currencyCap - state.coins)
        : 0;
      const next = {
        ...state,
        inventory,
        combatTargets: { ...state.combatTargets, [id!]: nextTarget },
        hitpoints: nextHp,
        coins: state.coins + coins,
        skills: { ...state.skills, [COMBAT_SKILL]: awarded.progress },
        lastSeenAtMs: now,
      };
      return ok({
        state: next,
        value: {
          inventory: { stacks: next.inventory.stacks, slotCapacity: next.inventory.slotCapacity },
          hitpoints: next.hitpoints,
          coins: next.coins,
          skills: next.skills,
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
            combatXpGained: xp,
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
      return ok({ state: { ...state, hitpoints, lastSeenAtMs: now }, value: { hitpoints } });
    });
  };
  router.register('combat.attack', attack);
  router.register('combat.recover', recover);
}
