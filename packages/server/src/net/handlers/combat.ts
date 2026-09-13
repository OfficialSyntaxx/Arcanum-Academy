/** Server-authoritative practice combat. Browser commands select a target only;
 * target stats, damage, ticks and respawn are owned here. */
import {
  awardXp,
  createSparringState,
  resolveSparringAttack,
  respawnSparringTarget,
  type SparringState,
} from '@alderfell/sim';
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
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { PlayerService, Mutation } from '../../domain/player-service.js';
import { skillProgress, type PlayerState } from '../../domain/player-state.js';
import type { SessionId } from '@alderfell/shared';

export interface CombatHandlerOptions {
  readonly players: PlayerService;
  readonly now: () => number;
  readonly tickMs: number;
  readonly interactionRadius: number;
  readonly currencyCap: number;
  readonly skills: SkillTable;
  readonly progression: ProgressionTunables;
  readonly combatXpPerDamage: number;
  readonly positionFor: (sessionId: SessionId) => { readonly x: number; readonly z: number } | null;
}

const COMBAT_SKILL_ID = asId<SkillId>('skill.combat');
type CombatStyle = 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE';

function readStyle(payload: unknown): CombatStyle { if (typeof payload !== 'object' || payload === null) return 'ACCURATE'; const style = (payload as Record<string, unknown>)['style']; return style === 'AGGRESSIVE' || style === 'DEFENSIVE' || style === 'ACCURATE' ? style : 'ACCURATE'; }

function readInteractableId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)['interactableId'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function registerCombatHandlers(router: RegistryCommandRouter, options: CombatHandlerOptions): void {
  const encounters = new Map<string, SparringState>();
  const attack: CommandHandler = async (session, payload) => {
    const interactableId = readInteractableId(payload);
    const style = readStyle(payload);
    if (interactableId === null) {
      return err(failure(FailureCode.Validation, 'combat.interactable_missing', { detail: 'interactableId is required' }));
    }
    const definition = combatEncounterByInteractable(interactableId);
    if (definition === undefined) {
      return err(failure(FailureCode.NotFound, 'combat.not_an_encounter', { detail: 'nothing hostile is at that interactable' }));
    }
    const position = options.positionFor(session.id);
    if (position === null) {
      return err(failure(FailureCode.Conflict, 'combat.position_unknown', { detail: 'move near the encounter before attacking' }));
    }
    const dx = position.x - definition.position.x;
    const dz = position.z - definition.position.z;
    if (dx * dx + dz * dz > options.interactionRadius * options.interactionRadius) {
      return err(failure(FailureCode.Conflict, 'combat.out_of_range', { detail: 'move closer to the encounter before attacking' }));
    }
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      if (state.hitpoints.respawnAtMs !== null) {
        return err(failure(FailureCode.Conflict, 'combat.player_recovering', { detail: 'recover before returning to combat' }));
      }
      if (skillProgress(state, COMBAT_SKILL_ID).level < definition.requiredCombatLevel) {
        return err(failure(FailureCode.Conflict, 'combat.level_required', {
          detail: `Combat level ${definition.requiredCombatLevel} is required`,
        }));
      }
      const current = respawnSparringTarget(
        encounters.get(interactableId) ?? createSparringState(definition.maxHitpoints, nowMs),
        nowMs,
      );
      const outcome = resolveSparringAttack(
        current,
        nowMs,
        options.tickMs,
        definition.respawnMs,
        definition.playerDamage + (style === 'AGGRESSIVE' ? 1 : 0),
      );
      encounters.set(interactableId, outcome.state);
      if (outcome.kind === 'rejected') {
        return err(failure(FailureCode.Conflict, `combat.${outcome.reason}`, { detail: 'the practice target is not ready yet' }));
      }
      const nextHp = outcome.defeated
        ? state.hitpoints
        : damagePlayer(state.hitpoints, Math.max(0, definition.enemyDamage - (style === 'DEFENSIVE' ? 1 : 0)), definition.playerRecoveryMs, nowMs);
      const coinsGained = outcome.defeated
        ? Math.max(0, Math.min(definition.rewardCoins, options.currencyCap - state.coins))
        : 0;
      const combatSkill = options.skills.get(COMBAT_SKILL_ID);
      if (combatSkill === undefined) {
        return err(failure(FailureCode.NotFound, 'combat.skill_missing', { detail: 'combat progression is unavailable' }));
      }
      const combatXpGained = outcome.damage * options.combatXpPerDamage + (style === 'ACCURATE' ? 1 : 0);
      const combatProgress = awardXp(skillProgress(state, COMBAT_SKILL_ID), combatXpGained, options.progression, combatSkill);
      const next = {
        ...state,
        coins: state.coins + coinsGained,
        hitpoints: nextHp,
        skills: { ...state.skills, [COMBAT_SKILL_ID]: combatProgress.progress },
        lastSeenAtMs: nowMs,
      };
      return ok({
        state: next,
        value: {
          combat: {
            interactableId,
            label: definition.label,
            hitpoints: outcome.state.hitpoints,
            maxHitpoints: outcome.state.maxHitpoints,
            defeated: outcome.defeated,
            respawnAtMs: outcome.state.respawnAtMs,
            damage: outcome.damage,
            enemyDamage: outcome.defeated ? 0 : Math.max(0, definition.enemyDamage - (style === 'DEFENSIVE' ? 1 : 0)),
            coinsGained,
            combatXpGained,
            style,
          },
          hitpoints: next.hitpoints,
          coins: next.coins,
          skills: next.skills,
        },
      });
    });
  };
  const recover: CommandHandler = async (session) => {
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const hp = state.hitpoints;
      if (hp.current > 0 || hp.respawnAtMs === null) {
        return err(failure(FailureCode.Conflict, 'combat.recovery_not_needed', { detail: 'you are already conscious' }));
      }
      if (nowMs < hp.respawnAtMs) {
        return err(failure(FailureCode.Conflict, 'combat.player_recovering', { detail: 'the infirmary is still restoring you' }));
      }
      const next = { ...state, hitpoints: { current: hp.max, max: hp.max, respawnAtMs: null }, lastSeenAtMs: nowMs };
      return ok({ state: next, value: { hitpoints: next.hitpoints } });
    });
  };
  router.register('combat.attack', attack).register('combat.recover', recover);
}

function damagePlayer(
  hp: PlayerState['hitpoints'],
  damage: number,
  recoveryMs: number,
  nowMs: number,
): PlayerState['hitpoints'] {
  const current = Math.max(0, hp.current - damage);
  return {
    current,
    max: hp.max,
    respawnAtMs: current === 0 ? nowMs + recoveryMs : null,
  };
}
