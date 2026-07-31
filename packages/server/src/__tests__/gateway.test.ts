import { describe, expect, it, vi } from 'vitest';
import {
  ClientOpcode,
  createEnvelope,
  createLogger,
  createMemorySink,
  encodeFrame,
  LogLevel,
  ServerOpcode,
  type PlayerId,
} from '@arcanum/shared';
import { CloseCode, Gateway, RegistryCommandRouter, type GatewaySocket } from '../net/gateway.js';
import { SessionStore } from '../session/session-store.js';

function harness(options: { maxConnections?: number; maxCommandsPerSecond?: number } = {}) {
  let clock = 1_000;
  const now = () => clock;
  const sent: { op: string; payload: unknown }[] = [];
  const closed: { code: number; reason: string }[] = [];
  const socket: GatewaySocket = {
    send: (data) => {
      const frame = JSON.parse(data) as { op: string; p: unknown };
      sent.push({ op: frame.op, payload: frame.p });
    },
    close: (code, reason) => closed.push({ code, reason }),
    remoteAddress: '127.0.0.1',
  };
  const sessions = new SessionStore({ resumeWindowMs: 60_000, now });
  const router = new RegistryCommandRouter();
  const gateway = new Gateway({
    sessions,
    router,
    logger: createLogger({ scope: 'test', level: LogLevel.Silent, sinks: [createMemorySink()] }),
    maxConnections: options.maxConnections ?? 10,
    heartbeatTimeoutMs: 15_000,
    handshakeTimeoutMs: 10_000,
    maxCommandsPerSecond: options.maxCommandsPerSecond ?? 30,
    now,
  });
  let seq = 0;
  const frame = (op: string, payload: unknown): string =>
    encodeFrame(createEnvelope(op, (seq += 1), payload, clock));
  return {
    gateway,
    sessions,
    router,
    sent,
    closed,
    socket,
    frame,
    advance: (ms: number) => {
      clock += ms;
    },
    lastOf: (op: string) => [...sent].reverse().find((entry) => entry.op === op),
  };
}

describe('Gateway', () => {
  it('accepts a first handshake and issues a resume token', () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    const accepted = h.lastOf(ServerOpcode.HandshakeAccepted);
    expect(accepted).toBeDefined();
    expect((accepted!.payload as { resumeToken: string }).resumeToken).toBeTruthy();
  });

  it('refuses gameplay frames before the handshake', () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'anything' }));
    expect(h.lastOf(ServerOpcode.CommandRejected)).toBeDefined();
    expect(h.closed.at(-1)?.code).toBe(CloseCode.ProtocolError);
  });

  it('closes on a malformed frame', () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    connection.receive('{ this is not json');
    expect(h.closed.at(-1)?.code).toBe(CloseCode.ProtocolError);
  });

  it('drops replayed sequences instead of applying them twice', () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    const handshake = h.frame(ClientOpcode.Handshake, { playerId: 'player-1' });
    connection.receive(handshake);
    connection.receive(handshake);
    const accepted = h.sent.filter((entry) => entry.op === ServerOpcode.HandshakeAccepted);
    expect(accepted).toHaveLength(1);
  });

  it('rate limits a flood and closes the socket', () => {
    const h = harness({ maxCommandsPerSecond: 3 });
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    for (let i = 0; i < 6; i += 1) connection.receive(h.frame(ClientOpcode.Heartbeat, {}));
    expect(h.closed.at(-1)?.code).toBe(CloseCode.RateLimited);
  });

  it('rejects unsupported command kinds without dropping the connection', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'gathering.start' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandRejected)).toBeDefined());
    expect(h.closed).toHaveLength(0);
  });

  it('dispatches a registered command and acknowledges it', async () => {
    const h = harness();
    const handler = vi.fn().mockResolvedValue(undefined);
    h.router.register('debug.ping', handler);
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'debug.ping' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandAck)).toBeDefined());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('resumes a dropped session with its token', () => {
    const h = harness();
    const first = h.gateway.accept(h.socket)!;
    first.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    const token = (h.lastOf(ServerOpcode.HandshakeAccepted)!.payload as { resumeToken: string })
      .resumeToken;
    first.disconnect();

    const second = h.gateway.accept(h.socket)!;
    second.receive(h.frame(ClientOpcode.Handshake, { resumeToken: token }));
    const accepted = h.sent.filter((entry) => entry.op === ServerOpcode.HandshakeAccepted);
    expect(accepted).toHaveLength(2);
    expect((accepted[1]!.payload as { playerId: PlayerId }).playerId).toBe('player-1');
  });

  it('falls back to a fresh session when the resume token expired', () => {
    const h = harness();
    const first = h.gateway.accept(h.socket)!;
    first.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    const token = (h.lastOf(ServerOpcode.HandshakeAccepted)!.payload as { resumeToken: string })
      .resumeToken;
    first.disconnect();
    h.advance(120_000);

    const second = h.gateway.accept(h.socket)!;
    second.receive(h.frame(ClientOpcode.Handshake, { resumeToken: token, playerId: 'player-1' }));
    expect(h.lastOf(ServerOpcode.Notice)).toBeDefined();
    expect(h.lastOf(ServerOpcode.HandshakeAccepted)).toBeDefined();
  });

  it('closes sockets that never complete a handshake', () => {
    const h = harness();
    h.gateway.accept(h.socket);
    h.advance(11_000);
    expect(h.gateway.sweep().closed).toBe(1);
    expect(h.closed.at(-1)?.code).toBe(CloseCode.HandshakeTimeout);
  });

  it('closes idle sessions past the heartbeat timeout', () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Handshake, { playerId: 'player-1' }));
    h.advance(20_000);
    expect(h.gateway.sweep().closed).toBe(1);
    expect(h.closed.at(-1)?.code).toBe(CloseCode.HeartbeatTimeout);
  });

  it('refuses connections beyond the capacity limit', () => {
    const h = harness({ maxConnections: 1 });
    expect(h.gateway.accept(h.socket)).not.toBeNull();
    expect(h.gateway.accept(h.socket)).toBeNull();
    expect(h.closed.at(-1)?.code).toBe(CloseCode.CapacityReached);
  });

  it('drains every connection on shutdown', () => {
    const h = harness();
    h.gateway.accept(h.socket);
    h.gateway.shutdown();
    expect(h.closed.at(-1)?.code).toBe(CloseCode.ServerShutdown);
    expect(h.gateway.connectionCount).toBe(0);
  });
});
