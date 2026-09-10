import { createServer } from 'node:http';
import Fastify from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  createLogger,
  DEFAULT_TUNABLES,
  LogLevel,
  PROTOCOL_VERSION,
  consoleSink,
  describeFailure,
  ITEM_CATALOG,
  NODE_CATALOG,
  RECIPE_BOOK,
  SKILL_TABLE,
} from '@alderfell/shared';
import { loadConfig } from './config.js';
import { Gateway, RegistryCommandRouter, type GatewaySocket } from './net/gateway.js';
import { SessionStore } from './session/session-store.js';
import { InMemoryPlayerRepository, type PlayerRepository } from './persistence/repository.js';
import { PostgresPlayerRepository } from './persistence/postgres-repository.js';
import { PlayerService } from './domain/player-service.js';
import { PresenceService } from './domain/presence.js';
import { InMemoryTradeStore, TradingService } from './domain/trading.js';
import { registerSocialHandlers } from './net/handlers/social.js';
import { registerEconomyHandlers } from './net/handlers/economy.js';
import { DiagnosticBuffer, diagnosticReportSchema } from './diagnostics.js';
import {
  IdentityService,
  InMemoryIdentityStore,
  PostgresIdentityStore,
  type IdentityStore,
} from './domain/identity.js';

/**
 * Server entry point.
 *
 * Composition happens here and only here: every dependency is constructed at the
 * top and injected downwards, so no module reaches for a global. Fastify serves
 * the HTTP surface (health, readiness, version) and the same Node http server
 * carries the WebSocket upgrade, which keeps deployment to a single port.
 */

const LEVELS = {
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
} as const;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    scope: 'server',
    level: LEVELS[config.LOG_LEVEL],
    sinks: [consoleSink],
  });

  const sessions = new SessionStore({
    resumeWindowMs: config.SESSION_RESUME_SECONDS * 1000,
  });
  const router = new RegistryCommandRouter();

  // Durable storage when a database is configured, memory when it is not.
  // The fallback keeps local development and the tests free of a database
  // dependency, but in a deployed environment it silently discards every
  // player's progress on restart - so it is called out rather than logged as
  // an ordinary line and scrolled past.
  let postgres: PostgresPlayerRepository | null = null;
  let repository: PlayerRepository = new InMemoryPlayerRepository();
  if (config.DATABASE_URL !== undefined) {
    postgres = new PostgresPlayerRepository({
      connectionString: config.DATABASE_URL,
      poolMax: config.DATABASE_POOL_MAX,
      logger: logger.child('postgres'),
    });
    const prepared = await postgres.initialise();
    if (!prepared.ok) {
      // Refuse to start rather than fall back. A deployment that asked for a
      // database and quietly got a memory store instead would look healthy
      // while losing everything written to it.
      throw new Error(`Database unavailable: ${describeFailure(prepared.error)}`);
    }
    repository = postgres;
    logger.info('persistence ready', { adapter: 'postgres' });
  } else if (config.NODE_ENV === 'production') {
    logger.warn(
      'DATABASE_URL is not set, so player progress is held in memory and will be lost on restart',
    );
  }

  // Identity is proved, never asserted. Backed by the database when there is
  // one: an identity register that reset on restart would lock every player
  // out of the account they had a moment ago.
  let identityStore: IdentityStore = new InMemoryIdentityStore();
  if (postgres !== null) {
    const postgresIdentities = new PostgresIdentityStore(postgres.client);
    const prepared = await postgresIdentities.initialise();
    if (!prepared.ok) {
      throw new Error(`Identity register unavailable: ${describeFailure(prepared.error)}`);
    }
    identityStore = postgresIdentities;
  }
  const identity = new IdentityService(identityStore);

  const players = new PlayerService({
    repository,
    slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
    now: () => Date.now(),
  });
  registerEconomyHandlers(router, {
    players,
    catalogs: {
      items: ITEM_CATALOG,
      nodes: NODE_CATALOG,
      recipes: RECIPE_BOOK,
      skills: SKILL_TABLE,
    },
    tunables: DEFAULT_TUNABLES,
    now: () => Date.now(),
  });

  // The multiplayer layer is built, tested and switched off.
  //
  // Alderfell is single-player Ironman: there is no trading, so none of this is
  // reachable in normal play. It is registered only when MULTIPLAYER_ENABLED is
  // set, because the code is correct and expensive to rewrite, and deleting it
  // would mean rebuilding escrow, an append-only ledger and interest-managed
  // presence from scratch when multiplayer does arrive.
  //
  // Never enable trading while Ironman is the only mode: an account that can
  // receive an item it did not make invalidates every other account.
  if (config.MULTIPLAYER_ENABLED) {
    const trading = new TradingService({
      repository,
      trades: new InMemoryTradeStore(),
      catalog: ITEM_CATALOG,
      slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
      now: () => Date.now(),
    });
    registerSocialHandlers(router, { trading });
    logger.warn('multiplayer handlers registered', {
      detail: 'trading is enabled; this is not an Ironman-safe configuration',
    });
  }

  const presence = new PresenceService({
    radius: DEFAULT_TUNABLES.world.presenceRadius,
    maxNeighbours: DEFAULT_TUNABLES.world.maxVisibleNeighbours,
    // Two missed reports before a player is treated as gone, so an ordinary
    // hitch does not make everyone flicker out of the courtyard.
    staleAfterMs: Math.ceil(2_000 / DEFAULT_TUNABLES.network.hubPresenceBroadcastHz) * 2,
    now: () => Date.now(),
  });

  const gateway = new Gateway({
    sessions,
    identity,
    presence,
    logger: logger.child('gateway'),
    router,
    maxConnections: config.MAX_CONNECTIONS,
    heartbeatTimeoutMs: DEFAULT_TUNABLES.network.heartbeatTimeoutMs,
    handshakeTimeoutMs: 10_000,
    maxCommandsPerSecond: DEFAULT_TUNABLES.network.maxCommandsPerSecond,
  });

  const app = Fastify({ logger: false });
  const diagnostics = new DiagnosticBuffer();
  const diagnosticRate = new Map<string, { windowStartedMs: number; count: number }>();
  let ready = false;

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    if (!ready) return reply.code(503).send({ status: 'starting' });
    return { status: 'ready' };
  });
  app.get('/version', async () => ({
    protocolVersion: PROTOCOL_VERSION,
    tunablesVersion: DEFAULT_TUNABLES.version,
    environment: config.NODE_ENV,
  }));
  app.get('/metrics', async () => ({
    connections: gateway.connectionCount,
    sessions: sessions.size,
    uptimeSeconds: Math.floor(process.uptime()),
    rss: process.memoryUsage().rss,
  }));
  app.post('/diagnostics/events', async (request, reply) => {
    const origin = request.headers.origin ?? '';
    if (config.NODE_ENV === 'production' && !config.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'origin_not_allowed' });
    }
    const ip = request.ip;
    const nowMs = Date.now();
    const window = diagnosticRate.get(ip);
    if (window === undefined || nowMs - window.windowStartedMs >= 60_000) {
      diagnosticRate.set(ip, { windowStartedMs: nowMs, count: 1 });
    } else if (window.count >= 60) {
      return reply.code(429).send({ error: 'rate_limited' });
    } else {
      window.count += 1;
    }
    const parsed = diagnosticReportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_report' });
    diagnostics.add({ ...parsed.data, receivedAtMs: nowMs, ip });
    return reply.code(202).send({ accepted: true });
  });
  app.get('/diagnostics/events', async (request, reply) => {
    const key = config.DIAGNOSTICS_READ_KEY;
    if (key === undefined || request.headers['x-diagnostics-key'] !== key) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return { events: diagnostics.list() };
  });

  await app.ready();

  const httpServer = createServer(app.server.listeners('request')[0] as never);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin ?? '';
    if (config.NODE_ENV === 'production' && !config.allowedOrigins.includes(origin)) {
      logger.warn('rejected upgrade from disallowed origin', { origin });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws: WebSocket, request) => {
    const adapter: GatewaySocket = {
      send: (data) => {
        if (ws.readyState === ws.OPEN) ws.send(data);
      },
      close: (code, reason) => ws.close(code, reason),
      remoteAddress: request.socket.remoteAddress ?? 'unknown',
    };
    const handle = gateway.accept(adapter);
    if (!handle) return;
    ws.on('message', (data) => handle.receive(data.toString()));
    ws.on('close', () => handle.disconnect());
    ws.on('error', (error) => {
      logger.warn('socket error', { error: error.message });
      handle.disconnect();
    });
  });

  const sweepTimer = setInterval(() => {
    const result = gateway.sweep();
    if (result.closed > 0 || result.sessionsExpired > 0) {
      logger.debug('gateway sweep', result);
    }
  }, DEFAULT_TUNABLES.network.heartbeatIntervalMs);
  sweepTimer.unref();

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(config.PORT, config.HOST, resolve);
    httpServer.once('error', reject);
  });
  ready = true;
  logger.info('server listening', {
    host: config.HOST,
    port: config.PORT,
    environment: config.NODE_ENV,
    repository: repository.constructor.name,
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    ready = false;
    clearInterval(sweepTimer);
    gateway.shutdown();
    wss.close();
    httpServer.close(() => {
      // Drain the pool last: an in-flight save should be allowed to finish
      // rather than be cut off mid-write by the process exiting.
      void app
        .close()
        .then(() => postgres?.close())
        .then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), config.SHUTDOWN_GRACE_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('fatal: server failed to start', error);
  process.exit(1);
});
