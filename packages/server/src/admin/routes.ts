import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Logger, PlayerId } from '@alderfell/shared';
import type { PlayerRecord, PlayerRepository, SaveSnapshot } from '../persistence/repository.js';
import { adminTokenMatches } from './auth.js';

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 30;
const SENSITIVE_KEY = /(token|secret|password|credential)/i;

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
    readonly logger: Logger;
    readonly now?: () => number;
  },
): void {
  const windows = new Map<string, { startedAtMs: number; count: number }>();
  const now = options.now ?? (() => Date.now());
  app.register(async (admin) => {
    admin.addHook('onRequest', async (request, reply) => {
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
  });
}

function storageError(reply: FastifyReply) {
  return reply.code(503).send({ error: 'storage_unavailable' });
}
