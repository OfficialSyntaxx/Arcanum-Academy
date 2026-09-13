import { awardXp } from '@alderfell/sim';
import {
  asId,
  combatEncounterByInteractable,
  err,
  failure,
  FailureCode,
  ok,
  type Failure,
  type ProgressionTunables,
  type Result,
  type SkillId,
  type SkillTable,
} from '@alderfell/shared';
import type { PlayerService, Mutation } from '../../domain/player-service.js';
import { skillProgress } from '../../domain/player-state.js';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { SessionId } from '@alderfell/shared';

const COMBAT_SKILL = asId<SkillId>('skill.combat');
interface Target { hp: number; nextAttackAtMs: number; respawnAtMs: number | null; }
export interface CombatHandlerOptions {
  readonly players: PlayerService;
  readonly skills: SkillTable;
  readonly progression: ProgressionTunables;
  readonly now: () => number;
  readonly tickMs: number;
  readonly interactionRadius: number;
  readonly currencyCap: number;
  readonly combatXpPerDamage: number;
  readonly positionFor: (sessionId: SessionId) => { readonly x: number; readonly z: number } | null;
}
function interactableId(payload: unknown): string | null {
  return typeof payload === 'object' && payload !== null && typeof (payload as Record<string, unknown>).interactableId === 'string'
    ? (payload as Record<string, unknown>).interactableId as string : null;
}
export function registerCombatHandlers(router: RegistryCommandRouter, options: CombatHandlerOptions): void {
  const targets = new Map<string, Target>();
  const attack: CommandHandler = async (session, payload) => {
    const id = interactableId(payload); const encounter = id === null ? undefined : combatEncounterByInteractable(id);
    if (encounter === undefined) return err(failure(FailureCode.NotFound, 'combat.not_an_encounter'));
    const position = options.positionFor(session.id);
    if (position === null) return err(failure(FailureCode.Conflict, 'combat.position_unknown'));
    const dx = position.x - encounter.position.x, dz = position.z - encounter.position.z;
    if (dx * dx + dz * dz > options.interactionRadius ** 2) return err(failure(FailureCode.Conflict, 'combat.out_of_range'));
    const now = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.hitpoints.respawnAtMs !== null) return err(failure(FailureCode.Conflict, 'combat.player_recovering'));
      if (skillProgress(state, COMBAT_SKILL).level < encounter.requiredCombatLevel) return err(failure(FailureCode.Conflict, 'combat.level_required'));
      const previous = targets.get(id!) ?? { hp: encounter.maxHitpoints, nextAttackAtMs: now, respawnAtMs: null };
      const target = previous.respawnAtMs !== null && now >= previous.respawnAtMs ? { hp: encounter.maxHitpoints, nextAttackAtMs: now, respawnAtMs: null } : previous;
      if (target.respawnAtMs !== null) return err(failure(FailureCode.Conflict, 'combat.defeated'));
      if (now < target.nextAttackAtMs) return err(failure(FailureCode.Conflict, 'combat.cooldown'));
      const hp = Math.max(0, target.hp - encounter.playerDamage), defeated = hp === 0;
      const nextTarget = { hp, nextAttackAtMs: now + options.tickMs, respawnAtMs: defeated ? now + encounter.respawnMs : null }; targets.set(id!, nextTarget);
      const nextHp = defeated ? state.hitpoints : { current: Math.max(0, state.hitpoints.current - encounter.enemyDamage), max: state.hitpoints.max, respawnAtMs: state.hitpoints.current - encounter.enemyDamage <= 0 ? now + encounter.playerRecoveryMs : null };
      const xp = encounter.playerDamage * options.combatXpPerDamage;
      const skill = options.skills.get(COMBAT_SKILL); if (skill === undefined) return err(failure(FailureCode.NotFound, 'combat.skill_missing'));
      const awarded = awardXp(skillProgress(state, COMBAT_SKILL), xp, options.progression, skill);
      const coins = defeated ? Math.min(encounter.rewardCoins, options.currencyCap - state.coins) : 0;
      const next = { ...state, hitpoints: nextHp, coins: state.coins + coins, skills: { ...state.skills, [COMBAT_SKILL]: awarded.progress }, lastSeenAtMs: now };
      return ok({ state: next, value: { hitpoints: next.hitpoints, coins: next.coins, skills: next.skills, combat: { interactableId: id, label: encounter.label, hitpoints: hp, maxHitpoints: encounter.maxHitpoints, defeated, respawnAtMs: nextTarget.respawnAtMs, damage: encounter.playerDamage, enemyDamage: defeated ? 0 : encounter.enemyDamage, coinsGained: coins, combatXpGained: xp } } });
    });
  };
  router.register('combat.attack', attack);
}
