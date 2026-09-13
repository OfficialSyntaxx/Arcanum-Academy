/** Server-authoritative practice combat. Browser commands select a target only;
 * target stats, damage, ticks and respawn are owned here. */
import { createSparringState, resolveSparringAttack, respawnSparringTarget, type SparringState } from '@alderfell/sim';
import {
  combatEncounterByInteractable,
  err,
  failure,
  FailureCode,
  ok,
  type Failure,
  type Result,
} from '@alderfell/shared';
import type { CommandHandler, RegistryCommandRouter } from '../gateway.js';
import type { PlayerService, Mutation } from '../../domain/player-service.js';
import type { PlayerState } from '../../domain/player-state.js';

export interface CombatHandlerOptions {
  readonly players: PlayerService;
  readonly now: () => number;
  readonly tickMs: number;
}

function readInteractableId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)['interactableId'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function registerCombatHandlers(router: RegistryCommandRouter, options: CombatHandlerOptions): void {
  const encounters = new Map<string, SparringState>();
  const attack: CommandHandler = async (session, payload) => {
    const interactableId = readInteractableId(payload);
    if (interactableId === null) {
      return err(failure(FailureCode.Validation, 'combat.interactable_missing', { detail: 'interactableId is required' }));
    }
    const definition = combatEncounterByInteractable(interactableId);
    if (definition === undefined) {
      return err(failure(FailureCode.NotFound, 'combat.not_an_encounter', { detail: 'nothing hostile is at that interactable' }));
    }
    const nowMs = options.now();
    return options.players.update(session.playerId, (state): Result<Mutation<unknown>, Failure> => {
      const recovered = recover(state, nowMs);
      if (recovered.hitpoints.respawnAtMs !== null) {
        return err(failure(FailureCode.Conflict, 'combat.player_recovering', { detail: 'you are recovering at the academy infirmary' }));
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
        definition.playerDamage,
      );
      encounters.set(interactableId, outcome.state);
      if (outcome.kind === 'rejected') {
        return err(failure(FailureCode.Conflict, `combat.${outcome.reason}`, { detail: 'the practice target is not ready yet' }));
      }
      const nextHp = outcome.defeated
        ? recovered.hitpoints
        : damagePlayer(recovered.hitpoints, definition.enemyDamage, definition.playerRecoveryMs, nowMs);
      const next = { ...recovered, hitpoints: nextHp, lastSeenAtMs: nowMs };
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
            enemyDamage: outcome.defeated ? 0 : definition.enemyDamage,
          },
          hitpoints: next.hitpoints,
        },
      });
    });
  };
  router.register('combat.attack', attack);
}

function recover(state: PlayerState, nowMs: number): PlayerState {
  const hp = state.hitpoints;
  if (hp.respawnAtMs === null || nowMs < hp.respawnAtMs) return state;
  return { ...state, hitpoints: { current: hp.max, max: hp.max, respawnAtMs: null } };
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
