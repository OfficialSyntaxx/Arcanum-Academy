import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAccountRoutes } from '../account-routes.js';
import { IdentityService, InMemoryIdentityStore } from '../domain/identity.js';

const SECRET = 'a'.repeat(32);

async function harness() {
  const app = Fastify();
  const identity = new IdentityService(new InMemoryIdentityStore());
  registerAccountRoutes(app, { secret: SECRET, identity });
  await app.ready();
  return { app, identity };
}

describe('player account recovery routes', () => {
  it('conceals routes from requests without the bridge credential', async () => {
    const { app } = await harness();
    const response = await app.inject({ method: 'POST', url: '/account/recover', payload: {} });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('links the proved player, rotates its bearer, and recovers it again', async () => {
    const { app, identity } = await harness();
    const issued = await identity.issue();
    if (!issued.ok) throw new Error('identity setup failed');
    const linked = await app.inject({
      method: 'POST',
      url: '/account/link',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: { subject: 'netlify-user-123', identityToken: issued.value.token },
    });
    expect(linked.statusCode).toBe(200);
    const linkBody = linked.json<{ playerId: string; identityToken: string }>();
    expect(linkBody.playerId).toBe(issued.value.playerId);
    expect((await identity.resolve(issued.value.token)).ok).toBe(false);
    expect((await identity.resolve(linkBody.identityToken)).ok).toBe(true);

    const recovered = await app.inject({
      method: 'POST',
      url: '/account/recover',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: { subject: 'netlify-user-123' },
    });
    expect(recovered.statusCode).toBe(200);
    const recoveryBody = recovered.json<{ playerId: string; identityToken: string }>();
    expect(recoveryBody.playerId).toBe(issued.value.playerId);
    expect((await identity.resolve(linkBody.identityToken)).ok).toBe(false);
    expect((await identity.resolve(recoveryBody.identityToken)).ok).toBe(true);
    await app.close();
  });

  it('prevents one login from claiming a second player', async () => {
    const { app, identity } = await harness();
    const first = await identity.issue();
    const second = await identity.issue();
    if (!first.ok || !second.ok) throw new Error('identity setup failed');
    const request = (identityToken: string) =>
      app.inject({
        method: 'POST',
        url: '/account/link',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { subject: 'netlify-user-123', identityToken },
      });
    expect((await request(first.value.token)).statusCode).toBe(200);
    expect((await request(second.value.token)).statusCode).toBe(409);
    expect((await identity.resolve(second.value.token)).ok).toBe(true);
    await app.close();
  });

  it('does not disclose whether an unlinked external account exists', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'POST',
      url: '/account/recover',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: { subject: 'unknown-user-123' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'account_unavailable' });
    await app.close();
  });
});
