import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { LogLevel, createLogger, createMemorySink } from '@alderfell/shared';
import { registerSupportReportRoutes } from '../support-routes.js';
import { SupportReportBuffer } from '../support-reports.js';

async function harness() {
  const app = Fastify();
  const store = new SupportReportBuffer();
  registerSupportReportRoutes(app, {
    store,
    logger: createLogger({
      scope: 'support-test',
      level: LogLevel.Info,
      sinks: [createMemorySink()],
    }),
    allowedOrigins: ['https://play.example.test'],
    production: true,
    now: () => 500,
  });
  await app.ready();
  return { app, store };
}

const valid = {
  category: 'bug',
  message: 'The campfire panel closed unexpectedly while cooking.',
  playerId: 'player-one',
  diagnostics: [],
};

describe('support report routes', () => {
  it('accepts a bounded report from the configured game origin', async () => {
    const { app, store } = await harness();
    const response = await app.inject({
      method: 'POST',
      url: '/support/reports',
      headers: { origin: 'https://play.example.test' },
      payload: valid,
    });
    expect(response.statusCode).toBe(202);
    expect((await store.list())[0]).toMatchObject({ playerId: 'player-one', receivedAtMs: 500 });
    await app.close();
  });

  it('rejects foreign origins and invalid payloads', async () => {
    const { app } = await harness();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/support/reports',
          headers: { origin: 'https://foreign.example.test' },
          payload: valid,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/support/reports',
          headers: { origin: 'https://play.example.test' },
          payload: { ...valid, message: 'short' },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });

  it('rate-limits the sixth submission attempt per hour', async () => {
    const { app } = await harness();
    for (let index = 0; index < 5; index += 1) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/support/reports',
            headers: { origin: 'https://play.example.test' },
            payload: valid,
          })
        ).statusCode,
      ).toBe(202);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/support/reports',
          headers: { origin: 'https://play.example.test' },
          payload: valid,
        })
      ).statusCode,
    ).toBe(429);
    await app.close();
  });
});
