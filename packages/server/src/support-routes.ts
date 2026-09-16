import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from '@alderfell/shared';
import { supportReportSubmissionSchema, type SupportReportStore } from './support-reports.js';

export function registerSupportReportRoutes(
  app: FastifyInstance,
  options: {
    readonly store: SupportReportStore;
    readonly logger: Logger;
    readonly allowedOrigins: readonly string[];
    readonly production: boolean;
    readonly now?: () => number;
  },
): void {
  const windows = new Map<string, { windowStartedMs: number; count: number }>();
  const now = options.now ?? (() => Date.now());
  const allowOrigin = (request: FastifyRequest, reply: FastifyReply) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    if (options.production && !options.allowedOrigins.includes(origin)) return false;
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
    return true;
  };

  app.options('/support/reports', async (request, reply) => {
    if (!allowOrigin(request, reply)) return reply.code(403).send({ error: 'origin_not_allowed' });
    reply.header('access-control-allow-methods', 'POST, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    return reply.code(204).send();
  });

  app.post('/support/reports', async (request, reply) => {
    if (!allowOrigin(request, reply)) return reply.code(403).send({ error: 'origin_not_allowed' });
    const nowMs = now();
    const window = windows.get(request.ip);
    if (window === undefined || nowMs - window.windowStartedMs >= 3_600_000) {
      windows.set(request.ip, { windowStartedMs: nowMs, count: 1 });
    } else if (window.count >= 5) {
      return reply.code(429).send({ error: 'rate_limited' });
    } else {
      window.count += 1;
    }
    const parsed = supportReportSubmissionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_report' });
    const report = await options.store.add(parsed.data, nowMs);
    options.logger.info('player support report accepted', {
      reportId: report.id,
      category: report.category,
      hasPlayerId: report.playerId !== undefined,
    });
    return reply.code(202).send({ accepted: true, reportId: report.id });
  });
}
