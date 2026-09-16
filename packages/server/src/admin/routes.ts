import type { FastifyInstance, FastifyReply } from 'fastify';
import { FailureCode, type Logger, type PlayerId } from '@alderfell/shared';
import { z } from 'zod';
import type { PlayerRecord, PlayerRepository, SaveSnapshot } from '../persistence/repository.js';
import type { DiagnosticStore } from '../diagnostics.js';
import type { SupportReportStore } from '../support-reports.js';
import { adminTokenMatches } from './auth.js';

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 30;
const SENSITIVE_KEY = /(token|secret|password|credential)/i;
const restoreRequest = z.object({
  snapshotId: z.string().trim().min(1).max(160),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(240),
});

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(child),
    ]),
  );
}

function summary(record: PlayerRecord) {
  const skills =
    typeof record.data.skills === 'object' && record.data.skills !== null
      ? (record.data.skills as Record<string, { level?: unknown }>)
      : {};
  const totalLevel = Object.values(skills).reduce(
    (total: number, skill) => total + (typeof skill.level === 'number' ? skill.level : 1),
    0,
  );
  return {
    playerId: record.playerId,
    schemaVersion: record.schemaVersion,
    version: record.version,
    updatedAtMs: record.updatedAtMs,
    totalLevel,
    lastSeenAtMs: typeof record.data.lastSeenAtMs === 'number' ? record.data.lastSeenAtMs : null,
    location: redactSensitive(record.data.location ?? null),
  };
}

function snapshotSummary(snapshot: SaveSnapshot) {
  return {
    id: snapshot.id,
    playerId: snapshot.playerId,
    sourceVersion: snapshot.sourceVersion,
    schemaVersion: snapshot.schemaVersion,
    createdAtMs: snapshot.createdAtMs,
    reason: snapshot.reason,
  };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  options: {
    readonly token: string;
    readonly repository: PlayerRepository;
    readonly diagnostics: DiagnosticStore;
    readonly reports: SupportReportStore;
    readonly runtime: () => {
      readonly connections: number;
      readonly sessions: number;
      readonly uptimeSeconds: number;
      readonly rssBytes: number;
    };
    readonly logger: Logger;
    readonly allowedOrigins?: readonly string[];
    readonly now?: () => number;
  },
): void {
  const windows = new Map<string, { startedAtMs: number; count: number }>();
  const now = options.now ?? (() => Date.now());
  app.register(async (admin) => {
    admin.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin?.replace(/\/$/, '');
      if (origin !== undefined) {
        if (!(options.allowedOrigins ?? []).includes(origin)) {
          options.logger.warn('admin browser origin refused', {
            ip: request.ip,
            method: request.method,
            route: request.routeOptions.url,
          });
          return reply.code(404).send({ error: 'not_found' });
        }
        reply.header('access-control-allow-origin', origin);
        reply.header('vary', 'Origin');
        reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
        reply.header('access-control-allow-headers', 'Authorization, Content-Type, X-Admin-Actor');
        reply.header('access-control-max-age', '600');
        if (request.method === 'OPTIONS') return reply.code(204).send();
      }
      const at = now();
      const window = windows.get(request.ip);
      if (window === undefined || at - window.startedAtMs >= WINDOW_MS) {
        windows.set(request.ip, { startedAtMs: at, count: 1 });
        if (windows.size > 5_000) {
          for (const [ip, candidate] of windows)
            if (at - candidate.startedAtMs >= WINDOW_MS) windows.delete(ip);
        }
      } else if (window.count >= REQUESTS_PER_WINDOW) {
        options.logger.warn('admin request rate limited', {
          ip: request.ip,
          method: request.method,
          route: request.routeOptions.url,
        });
        return reply.code(429).send({ error: 'rate_limited' });
      } else {
        window.count += 1;
      }
      if (!adminTokenMatches(options.token, request.headers.authorization)) {
        options.logger.warn('admin authentication refused', {
          ip: request.ip,
          method: request.method,
          route: request.routeOptions.url,
        });
        return reply.code(404).send({ error: 'not_found' });
      }
      options.logger.info('admin read request', {
        ip: request.ip,
        method: request.method,
        route: request.routeOptions.url,
      });
    });

    admin.options('/admin/*', async (_request, reply) => reply.code(204).send());

    admin.get('/admin/overview', async (_request, reply) => {
      const overview = await options.repository.operationsOverview(now());
      if (!overview.ok) return storageError(reply);
      const [diagnostics, reports] = await Promise.all([
        options.diagnostics.list(),
        options.reports.list(250),
      ]);
      return {
        generatedAtMs: now(),
        players: overview.value,
        runtime: options.runtime(),
        diagnostics: {
          total: diagnostics.length,
          errors: diagnostics.filter((event) => event.level === 'error').length,
          warnings: diagnostics.filter((event) => event.level === 'warn').length,
        },
        reports: { open: reports.length },
      };
    });

    admin.get('/admin/diagnostics', async () => ({
      events: (await options.diagnostics.list())
        .slice(-100)
        .reverse()
        .map(({ ip: _ip, ...event }) => event),
    }));

    admin.get('/admin/reports', async () => ({ reports: await options.reports.list(100) }));

    admin.get('/admin/players', async (request, reply) => {
      const query = request.query as { q?: string; cursor?: string; limit?: string };
      const parsedLimit = Number(query.limit ?? 25);
      const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 25;
      const result = await options.repository.listPlayers({
        ...(query.q ? { query: query.q.slice(0, 100) } : {}),
        ...(query.cursor ? { cursor: query.cursor.slice(0, 200) } : {}),
        limit,
      });
      if (!result.ok) return storageError(reply);
      return { players: result.value.records.map(summary), nextCursor: result.value.nextCursor };
    });

    admin.get('/admin/players/:playerId', async (request, reply) => {
      const { playerId } = request.params as { playerId: string };
      const result = await options.repository.find(playerId as PlayerId);
      if (!result.ok) return storageError(reply);
      if (result.value === null) return reply.code(404).send({ error: 'player_not_found' });
      return { player: summary(result.value), state: redactSensitive(result.value.data) };
    });

    admin.get('/admin/players/:playerId/snapshots', async (request, reply) => {
      const { playerId } = request.params as { playerId: string };
      const result = await options.repository.listSnapshots(playerId as PlayerId);
      if (!result.ok) return storageError(reply);
      return { snapshots: result.value.map(snapshotSummary) };
    });

    admin.get('/admin/players/:playerId/snapshots/:snapshotId', async (request, reply) => {
      const { playerId, snapshotId } = request.params as { playerId: string; snapshotId: string };
      const result = await options.repository.listSnapshots(playerId as PlayerId);
      if (!result.ok) return storageError(reply);
      const snapshot = result.value.find((candidate) => candidate.id === snapshotId);
      if (!snapshot) return reply.code(404).send({ error: 'snapshot_not_found' });
      return { snapshot: snapshotSummary(snapshot), state: redactSensitive(snapshot.data) };
    });

    admin.get('/admin/players/:playerId/restore-audit', async (request, reply) => {
      const { playerId } = request.params as { playerId: string };
      const result = await options.repository.listRestoreAudit(playerId as PlayerId);
      if (!result.ok) return storageError(reply);
      return { audit: result.value };
    });

    admin.post('/admin/players/:playerId/restore', async (request, reply) => {
      const { playerId } = request.params as { playerId: string };
      const parsed = restoreRequest.safeParse(request.body);
      const actor = request.headers['x-admin-actor'];
      if (
        !parsed.success ||
        typeof actor !== 'string' ||
        actor.trim().length < 3 ||
        actor.length > 320
      ) {
        return reply.code(400).send({ error: 'invalid_restore_request' });
      }
      const restored = await options.repository.restoreSnapshot({
        playerId: playerId as PlayerId,
        snapshotId: parsed.data.snapshotId,
        expectedVersion: parsed.data.expectedVersion,
        actor,
        reason: parsed.data.reason,
      });
      if (!restored.ok) {
        const status =
          restored.error.code === FailureCode.Conflict
            ? 409
            : restored.error.code === FailureCode.NotFound
              ? 404
              : restored.error.code === FailureCode.Storage
                ? 503
                : 400;
        return reply.code(status).send({ error: restored.error.reason });
      }
      options.logger.warn('admin restore completed', {
        playerId,
        snapshotId: parsed.data.snapshotId,
        actor,
        beforeVersion: restored.value.audit.beforeVersion,
        afterVersion: restored.value.audit.afterVersion,
      });
      return { player: summary(restored.value.record), audit: restored.value.audit };
    });
  });
}

function storageError(reply: FastifyReply) {
  return reply.code(503).send({ error: 'storage_unavailable' });
}
