import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FailureCode } from '@alderfell/shared';
import type { IdentityService } from './domain/identity.js';

interface AccountRouteOptions {
  readonly secret: string;
  readonly identity: IdentityService;
  readonly now?: () => number;
}

interface AccountBody {
  readonly subject?: unknown;
  readonly identityToken?: unknown;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function registerAccountRoutes(app: FastifyInstance, options: AccountRouteOptions): void {
  const now = options.now ?? (() => Date.now());
  const attempts = new Map<string, { startedAt: number; count: number }>();

  const authorize = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!secretMatches(bearer, options.secret)) {
      void reply.code(404).send({ error: 'not_found' });
      return false;
    }
    return true;
  };

  const allowSubject = (key: string, reply: FastifyReply): boolean => {
    const current = attempts.get(key);
    const timestamp = now();
    if (!current || timestamp - current.startedAt >= WINDOW_MS) {
      attempts.set(key, { startedAt: timestamp, count: 1 });
      return true;
    }
    if (current.count >= MAX_REQUESTS) {
      void reply.code(429).send({ error: 'rate_limited' });
      return false;
    }
    current.count += 1;
    return true;
  };

  app.post('/account/link', async (request, reply) => {
    if (!authorize(request, reply)) return reply;
    const body = request.body as AccountBody | null;
    if (typeof body?.subject !== 'string' || typeof body.identityToken !== 'string') {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    if (!allowSubject(body.subject, reply)) return reply;
    const linked = await options.identity.linkExternal(body.subject, body.identityToken);
    if (!linked.ok) return accountFailure(reply, linked.error.code);
    return reply.header('cache-control', 'no-store').send({
      playerId: linked.value.playerId,
      identityToken: linked.value.token,
    });
  });

  app.post('/account/recover', async (request, reply) => {
    if (!authorize(request, reply)) return reply;
    const body = request.body as AccountBody | null;
    if (typeof body?.subject !== 'string') {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    if (!allowSubject(body.subject, reply)) return reply;
    const recovered = await options.identity.recoverExternal(body.subject);
    if (!recovered.ok) return accountFailure(reply, recovered.error.code);
    return reply.header('cache-control', 'no-store').send({
      playerId: recovered.value.playerId,
      identityToken: recovered.value.token,
    });
  });
}

function accountFailure(reply: FastifyReply, code: FailureCode) {
  if (code === FailureCode.Conflict)
    return reply.code(409).send({ error: 'account_already_linked' });
  if (code === FailureCode.Validation) return reply.code(400).send({ error: 'invalid_request' });
  // Do not reveal whether a subject or a device token was the missing proof.
  return reply
    .code(code === FailureCode.Storage ? 503 : 401)
    .send({ error: 'account_unavailable' });
}

function secretMatches(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
