import { err, failure, FailureCode, generateId, ok } from '@alderfell/shared';
import type { PlayerService } from '../../domain/player-service.js';
import type { RegistryCommandRouter } from '../gateway.js';

const DISPLAY_NAME = /^[A-Za-z][A-Za-z0-9 _'-]{2,23}$/;

function readPayload(payload: unknown): { displayName: string | null; isPublic: boolean } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.isPublic !== 'boolean') return null;
  if (value.displayName !== null && typeof value.displayName !== 'string') return null;
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : null;
  if (value.isPublic && (!displayName || !DISPLAY_NAME.test(displayName))) return null;
  return { displayName, isPublic: value.isPublic && displayName !== null };
}

export function registerProfileHandlers(
  router: RegistryCommandRouter,
  options: { readonly players: PlayerService },
): void {
  router.register('profile.update', async (session, payload) => {
    const input = readPayload(payload);
    if (!input) {
      return err(
        failure(FailureCode.Validation, 'profile.invalid_name', {
          detail: 'Use 3–24 letters, numbers, spaces, apostrophes, underscores, or hyphens.',
        }),
      );
    }
    return options.players.update(session.playerId, (state) => {
      const profile = {
        publicId: input.isPublic
          ? (state.profile.publicId ?? generateId())
          : state.profile.publicId,
        ...input,
      };
      return ok({ state: { ...state, profile }, value: { profile } });
    });
  });
}
