import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { LogLevel, asId, createLogger, createMemorySink, type PlayerId } from '@alderfell/shared';
import { adminTokenMatches } from '../admin/auth.js';
import { redactSensitive, registerAdminRoutes } from '../admin/routes.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';

const TOKEN = 'admin-read-token-that-is-at-least-32-characters';
const PLAYER = asId<PlayerId>('player-alpha');

async function harness() {
  const repository = new InMemoryPlayerRepository(() => 100);
  const created = await repository.create({
    playerId: PLAYER,
    schemaVersion: 9,
    data: {
      coins: 10,
      lastSeenAtMs: 90,
      location: { zoneId: 'zone.courtyard' },
      skills: { attack: { level: 4 }, strength: { level: 3 } },
      identityToken: 'must-not-leak',
      nested: { passwordHash: 'must-not-leak-either', safe: 'visible' },
    },
  });
  if (!created.ok) throw new Error(created.error.reason);
  await repository.save(
    { playerId: PLAYER, schemaVersion: 9, data: { ...created.value.data, coins: 20 } },
    created.value.version,
  );
  const sink = createMemorySink();
  const app = Fastify();
  registerAdminRoutes(app, {
    token: TOKEN,
    repository,
    logger: createLogger({ scope: 'admin-test', level: LogLevel.Info, sinks: [sink] }),
    allowedOrigins: ['https://operations.example.test'],
    now: () => 1_000,
  });
  await app.ready();
  return { app, repository, sink };
}

const auth = { authorization: `Bearer ${TOKEN}` };

describe('admin authentication', () => {
  it('uses a separate bearer credential and safely handles different input lengths', () => {
    expect(adminTokenMatches(TOKEN, `Bearer ${TOKEN}`)).toBe(true);
    expect(adminTokenMatches(TOKEN, 'Bearer wrong')).toBe(false);
    expect(adminTokenMatches(TOKEN, undefined)).toBe(false);
  });

  it('redacts sensitive keys recursively without hiding ordinary state', () => {
    expect(redactSensitive({ token: 'x', nested: { passwordHash: 'y', coins: 4 } })).toEqual({
      token: '[REDACTED]',
      nested: { passwordHash: '[REDACTED]', coins: 4 },
    });
  });
});

describe('read-only admin routes', () => {
  it('allows only explicitly configured browser origins and answers preflight without the token', async () => {
    const { app, sink } = await harness();
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/admin/players',
      headers: {
        origin: 'https://operations.example.test',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://operations.example.test');
    const refused = await app.inject({
      method: 'GET',
      url: '/admin/players',
      headers: { ...auth, origin: 'https://untrusted.example.test' },
    });
    expect(refused.statusCode).toBe(404);
    expect(sink.records.at(-1)?.message).toBe('admin browser origin refused');
    await app.close();
  });

  it('conceals the surface from unauthenticated requests and logs the refusal', async () => {
    const { app, sink } = await harness();
    const response = await app.inject({ method: 'GET', url: `/admin/players/${PLAYER}` });
    expect(response.statusCode).toBe(404);
    expect(sink.records.at(-1)?.message).toBe('admin authentication refused');
    await app.close();
  });

  it('lists and inspects players without exposing sensitive values', async () => {
    const { app } = await harness();
    const list = await app.inject({ method: 'GET', url: '/admin/players?q=alpha', headers: auth });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ players: [{ playerId: PLAYER, totalLevel: 7 }] });
    const detail = await app.inject({
      method: 'GET',
      url: `/admin/players/${PLAYER}`,
      headers: auth,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().state).toMatchObject({
      identityToken: '[REDACTED]',
      nested: { passwordHash: '[REDACTED]', safe: 'visible' },
    });
    expect(detail.body).not.toContain('must-not-leak');
    await app.close();
  });

  it('separates snapshot metadata from redacted snapshot detail', async () => {
    const { app } = await harness();
    const list = await app.inject({
      method: 'GET',
      url: `/admin/players/${PLAYER}/snapshots`,
      headers: auth,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().snapshots[0]).not.toHaveProperty('data');
    const id = list.json().snapshots[0].id as string;
    const detail = await app.inject({
      method: 'GET',
      url: `/admin/players/${PLAYER}/snapshots/${id}`,
      headers: auth,
    });
    expect(detail.json().state.identityToken).toBe('[REDACTED]');
    await app.close();
  });

  it('shows immutable restore receipts without exposing a mutation route', async () => {
    const { app, repository } = await harness();
    const snapshots = await repository.listSnapshots(PLAYER);
    if (!snapshots.ok) throw new Error(snapshots.error.reason);
    await repository.restoreSnapshot({
      playerId: PLAYER,
      snapshotId: snapshots.value[0]!.id,
      expectedVersion: 2,
      actor: 'test-operator',
      reason: 'verify read-only audit route',
    });
    const audit = await app.inject({
      method: 'GET',
      url: `/admin/players/${PLAYER}/restore-audit`,
      headers: auth,
    });
    expect(audit.json().audit[0]).toMatchObject({ actor: 'test-operator', beforeVersion: 2 });
    const mutation = await app.inject({
      method: 'POST',
      url: `/admin/players/${PLAYER}/restore`,
      headers: auth,
    });
    expect(mutation.statusCode).toBe(404);
    await app.close();
  });

  it('rate-limits repeated requests per source address', async () => {
    const { app, sink } = await harness();
    for (let request = 0; request < 30; request += 1) {
      expect(
        (await app.inject({ method: 'GET', url: '/admin/players', headers: auth })).statusCode,
      ).toBe(200);
    }
    const blocked = await app.inject({ method: 'GET', url: '/admin/players', headers: auth });
    expect(blocked.statusCode).toBe(429);
    expect(sink.records.at(-1)?.message).toBe('admin request rate limited');
    await app.close();
  });
});
