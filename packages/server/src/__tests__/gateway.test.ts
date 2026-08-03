import { describe, expect, it, vi } from 'vitest';
import {
  ClientOpcode,
  createEnvelope,
  createLogger,
  createMemorySink,
  encodeFrame,
  err,
  failure,
  FailureCode,
  LogLevel,
  ok,
  ServerOpcode,
  type Failure,
} from '@arcanum/shared';
import { CloseCode, Gateway, RegistryCommandRouter, type GatewaySocket } from '../net/gateway.js';
import { SessionStore } from '../session/session-store.js';
import { IdentityService, InMemoryIdentityStore } from '../domain/identity.js';

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
  const identity = new IdentityService(new InMemoryIdentityStore());
  const gateway = new Gateway({
    sessions,
    router,
    identity,
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
    identity,
    lastOf: (op: string) => [...sent].reverse().find((entry) => entry.op === op),
    /**
     * Performs a handshake and waits for it to be accepted.
     *
     * Identity is resolved asynchronously now that it is proved rather than
     * asserted, so a test cannot assume the handshake landed on the same tick.
     */
    async handshake(
      connection: { receive(raw: string): void },
      payload: Record<string, unknown> = {},
    ) {
      const before = sent.filter((entry) => entry.op === ServerOpcode.HandshakeAccepted).length;
      connection.receive(
        encodeFrame(createEnvelope(ClientOpcode.Handshake, (seq += 1), payload, clock)),
      );
      await vi.waitFor(() =>
        expect(
          sent.filter((entry) => entry.op === ServerOpcode.HandshakeAccepted).length,
        ).toBeGreaterThan(before),
      );
      return [...sent].reverse().find((entry) => entry.op === ServerOpcode.HandshakeAccepted)!
        .payload as { playerId: string; resumeToken: string; identityToken?: string };
    },
  };
}

describe('Gateway', () => {
  it('accepts a first handshake and issues a resume token', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
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

  it('drops replayed sequences instead of applying them twice', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    // The identical raw frame twice: same sequence number, so the second is a
    // replay rather than a new request.
    const handshake = h.frame(ClientOpcode.Handshake, {});
    connection.receive(handshake);
    connection.receive(handshake);
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.HandshakeAccepted)).toBeDefined());
    const accepted = h.sent.filter((entry) => entry.op === ServerOpcode.HandshakeAccepted);
    expect(accepted).toHaveLength(1);
  });

  it('rate limits a flood and closes the socket', async () => {
    const h = harness({ maxCommandsPerSecond: 3 });
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
    for (let i = 0; i < 6; i += 1) connection.receive(h.frame(ClientOpcode.Heartbeat, {}));
    expect(h.closed.at(-1)?.code).toBe(CloseCode.RateLimited);
  });

  it('rejects unsupported command kinds without dropping the connection', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'gathering.start' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandRejected)).toBeDefined());
    expect(h.closed).toHaveLength(0);
  });

  it('dispatches a registered command and acknowledges it', async () => {
    const h = harness();
    const handler = vi.fn().mockResolvedValue(ok(undefined));
    h.router.register('debug.ping', handler);
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'debug.ping' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandAck)).toBeDefined());
    expect(handler).toHaveBeenCalledTimes(1);
    // An Ok carrying no value is an acknowledgement and nothing more.
    expect(h.lastOf(ServerOpcode.Patch)).toBeUndefined();
  });

  it('follows the acknowledgement with a patch when a handler returns state', async () => {
    const h = harness();
    h.router.register('debug.echo', () => Promise.resolve(ok({ pips: 3 })));
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'debug.echo' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.Patch)).toBeDefined());
    expect(h.lastOf(ServerOpcode.CommandAck)).toBeDefined();
    expect(h.lastOf(ServerOpcode.Patch)!.payload).toMatchObject({
      kind: 'debug.echo',
      state: { pips: 3 },
    });
  });

  it('forwards a handler rejection verbatim instead of flattening it', async () => {
    const h = harness();
    h.router.register('debug.deny', () =>
      Promise.resolve(
        err(failure(FailureCode.Validation, 'inventory.slot_full', { context: { slots: 60 } })),
      ),
    );
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'debug.deny' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandRejected)).toBeDefined());

    const rejection = h.lastOf(ServerOpcode.CommandRejected)!.payload as Failure;
    expect(rejection.reason).toBe('inventory.slot_full');
    expect(rejection.code).toBe(FailureCode.Validation);
    expect(rejection.context).toMatchObject({ slots: 60 });
    // A rejected command is decided, not acknowledged.
    expect(h.lastOf(ServerOpcode.CommandAck)).toBeUndefined();
  });

  it('keeps a thrown defect opaque to the client', async () => {
    const h = harness();
    h.router.register('debug.boom', () => Promise.reject(new Error('connection string leaked')));
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
    connection.receive(h.frame(ClientOpcode.Command, { kind: 'debug.boom' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandRejected)).toBeDefined());

    const rejection = h.lastOf(ServerOpcode.CommandRejected)!.payload as Failure;
    expect(rejection.reason).toBe('command.dispatch_failed');
    expect(JSON.stringify(rejection)).not.toContain('connection string leaked');
  });

  it('resumes a dropped session with its token', async () => {
    const h = harness();
    const first = h.gateway.accept(h.socket)!;
    const opened = await h.handshake(first);
    first.disconnect();

    const second = h.gateway.accept(h.socket)!;
    const resumed = await h.handshake(second, { resumeToken: opened.resumeToken });
    // The same account, identified by what the server issued rather than by
    // anything the client claimed.
    expect(resumed.playerId).toBe(opened.playerId);
    expect(h.sent.filter((entry) => entry.op === ServerOpcode.HandshakeAccepted)).toHaveLength(2);
  });

  it('falls back to a fresh session when the resume token expired', async () => {
    const h = harness();
    const first = h.gateway.accept(h.socket)!;
    await h.handshake(first);
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

  it('closes idle sessions past the heartbeat timeout', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    await h.handshake(connection);
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

describe('identity', () => {
  it('ignores a player id the client claims', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    // The old handshake believed this outright, which meant anyone who read an
    // id from a log owned that account.
    const accepted = await h.handshake(connection, { playerId: 'someone-elses-account' });
    expect(accepted.playerId).not.toBe('someone-elses-account');
  });

  it('issues a token on a first connection and only then', async () => {
    const h = harness();
    const first = await h.handshake(h.gateway.accept(h.socket)!);
    expect(first.identityToken).toBeTruthy();

    const second = await h.handshake(h.gateway.accept(h.socket)!, {
      identityToken: first.identityToken,
    });
    expect(second.playerId).toBe(first.playerId);
    // Returning it again would be handing out a credential nobody asked for.
    expect(second.identityToken).toBeUndefined();
  });

  it('gives two fresh connections two different accounts', async () => {
    const h = harness();
    const a = await h.handshake(h.gateway.accept(h.socket)!);
    const b = await h.handshake(h.gateway.accept(h.socket)!);
    expect(a.playerId).not.toBe(b.playerId);
    expect(a.identityToken).not.toBe(b.identityToken);
  });

  it('refuses an unknown token rather than silently minting an account', async () => {
    const h = harness();
    const connection = h.gateway.accept(h.socket)!;
    connection.receive(h.frame(ClientOpcode.Handshake, { identityToken: 'not-a-real-token' }));
    await vi.waitFor(() => expect(h.lastOf(ServerOpcode.CommandRejected)).toBeDefined());
    // Minting one would turn a typo into silent data loss: the player would
    // appear to log in and find an empty satchel.
    const rejection = h.lastOf(ServerOpcode.CommandRejected)!.payload as Failure;
    expect(rejection.reason).toBe('identity.token_unknown');
    expect(h.closed.at(-1)?.code).toBe(CloseCode.ProtocolError);
  });

  it('never stores the token it issued', async () => {
    const h = harness();
    const issued = await h.handshake(h.gateway.accept(h.socket)!);
    // Only a hash is kept, so a leaked store does not hand over working logins.
    const resolved = await h.identity.resolve(issued.identityToken!);
    expect(resolved.ok).toBe(true);
    const store = JSON.stringify(h.identity);
    expect(store).not.toContain(issued.identityToken!);
  });
});
