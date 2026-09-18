import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, asId, ok, type PlayerId, type SessionId } from '@alderfell/shared';
import { PlayerService } from '../domain/player-service.js';
import { RegistryCommandRouter } from '../net/gateway.js';
import { registerProfileHandlers } from '../net/handlers/profile.js';
import { registerPublicProfileRoutes } from '../public-profiles.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';

function session(playerId: PlayerId) {
  return {
    id: asId<SessionId>(`session-${playerId}`),
    playerId,
    resumeToken: 'token',
    createdAtMs: 0,
    disconnectedAtMs: null,
    lastClientSeq: 0,
  };
}

describe('public profiles', () => {
  it('is private by default and publishes only an opted-in aggregate', async () => {
    const repository = new InMemoryPlayerRepository(() => 100);
    const players = new PlayerService({
      repository,
      slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
      now: () => 100,
    });
    const router = new RegistryCommandRouter();
    registerProfileHandlers(router, { players });
    const player = asId<PlayerId>('public-profile-player');
    await players.update(player, (state) =>
      ok({
        state: {
          ...state,
          skills: { 'skill.mining': { level: 12, xp: 880 }, 'skill.attack': { level: 4, xp: 60 } },
        },
        value: undefined,
      }),
    );
    const app = Fastify();
    registerPublicProfileRoutes(app, {
      repository,
      slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
      allowedOrigins: ['https://game.example'],
    });
    await app.ready();
    expect((await app.inject('/profiles/hiscores')).json()).toEqual({ hiscores: [] });
    expect(
      (
        await router.dispatch(session(player), 'profile.update', {
          displayName: 'Moss Runner',
          isPublic: true,
        })
      ).ok,
    ).toBe(true);
    const response = await app.inject({
      method: 'GET',
      url: '/profiles/hiscores',
      headers: { origin: 'https://game.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('https://game.example');
    expect(response.json()).toEqual({
      hiscores: [
        expect.objectContaining({
          rank: 1,
          displayName: 'Moss Runner',
          totalXp: 940,
          combatLevel: 4,
        }),
      ],
    });
    expect(response.body).not.toContain(player);
    expect(response.body).not.toContain('inventory');
    await app.close();
  });

  it('refuses malformed names before they enter a save', async () => {
    const repository = new InMemoryPlayerRepository(() => 100);
    const players = new PlayerService({ repository, slotCapacity: 30, now: () => 100 });
    const router = new RegistryCommandRouter();
    registerProfileHandlers(router, { players });
    const result = await router.dispatch(
      session(asId<PlayerId>('invalid-profile-player')),
      'profile.update',
      { displayName: 'x', isPublic: true },
    );
    expect(result).toMatchObject({ ok: false, error: { reason: 'profile.invalid_name' } });
  });
});
