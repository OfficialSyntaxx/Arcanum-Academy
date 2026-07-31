import { createServer } from 'node:http';
import Fastify from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  createLogger,
  DEFAULT_TUNABLES,
  LogLevel,
  PROTOCOL_VERSION,
  consoleSink,
} from '@arcanum/shared';
import { loadConfig } from './config.js';
import { Gateway, RegistryCommandRouter, type GatewaySocket } from './net/gateway.js';
import { SessionStore } from './session/session-store.js';
import { InMemoryPlayerRepository } from './persistence/repository.js';

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
  const repository = new InMemoryPlayerRepository();
  const gateway = new Gateway({
    sessions,
    logger: logger.child('gateway'),
    router,
    maxConnections: config.MAX_CONNECTIONS,
    heartbeatTimeoutMs: DEFAULT_TUNABLES.network.heartbeatTimeoutMs,
    handshakeTimeoutMs: 10_000,
    maxCommandsPerSecond: DEFAULT_TUNABLES.network.maxCommandsPerSecond,
  });

  const app = Fastify({ logger: false });
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
      void app.close().then(() => process.exit(0));
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
