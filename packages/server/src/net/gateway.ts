import {
  ClientOpcode,
  createEnvelope,
  decodeClientFrame,
  encodeFrame,
  failure,
  FailureCode,
  ServerOpcode,
  type Failure,
  type Logger,
  type PlayerId,
  type Result,
  type SessionId,
} from '@arcanum/shared';
import { type SessionStore, type Session } from '../session/session-store.js';
import { TokenBucket } from './rate-limiter.js';

/**
 * Transport-agnostic connection gateway.
 *
 * The gateway owns the connection lifecycle - handshake, heartbeat, rate limit,
 * resume, teardown - and nothing else. It talks to an interface rather than to
 * `ws`, which means the whole protocol is unit-testable without opening a socket
 * and the transport can be swapped (WebTransport, or a local loopback used by
 * the single-player tutorial) without rewriting the rules.
 */

export interface GatewaySocket {
  send(data: string): void;
  close(code: number, reason: string): void;
  readonly remoteAddress: string;
}

/** Close codes in the application range. Documented so the client can react. */
export const CloseCode = {
  Normal: 1000,
  ProtocolError: 4000,
  HandshakeTimeout: 4001,
  HeartbeatTimeout: 4002,
  RateLimited: 4003,
  ServerShutdown: 4004,
  CapacityReached: 4005,
} as const;

/**
 * A command handler.
 *
 * Returning `Err` is how a handler rejects a command the player was not
 * entitled to make - a full inventory, a depleted node, an unmet skill gate.
 * The gateway forwards that `Failure` verbatim, so the client learns the
 * actual reason rather than a generic server error.
 *
 * Throwing is reserved for genuine defects. Those become an opaque
 * `command.dispatch_failed`, because an unplanned exception has no reason
 * string worth showing a player and may carry internals that should not
 * cross the wire.
 *
 * An `Ok` value, when it is not `undefined`, is sent as a `Patch` after the
 * acknowledgement: the authoritative state the client should adopt in place of
 * whatever it predicted locally.
 */
export type CommandHandler = (
  session: Session,
  payload: unknown,
) => Promise<Result<unknown, Failure>>;

export interface CommandRouter {
  /** Returns true when a handler exists for the kind. */
  supports(kind: string): boolean;
  /** Applies a command. Expected failures come back as `Err`, never thrown. */
  dispatch(session: Session, kind: string, payload: unknown): Promise<Result<unknown, Failure>>;
}

/**
 * Proves a client is who it claims to be.
 *
 * The gateway takes this rather than an identity service directly, so the
 * network layer never learns how identity is stored - and so a test can
 * authenticate without a database.
 */
export interface IdentityVerifier {
  /** Resolves a bearer token to its player, or fails. */
  resolve(token: string): Promise<Result<PlayerId, Failure>>;
  /** Creates a new account and the token that owns it. */
  issue(): Promise<Result<{ playerId: PlayerId; token: string }, Failure>>;
}

/** Reports and answers who else is nearby. Kept behind an interface so the
 * gateway never learns how presence is stored or bounded. */
export interface PresenceTracker {
  update(
    sessionId: SessionId,
    playerId: PlayerId,
    position: { x: number; z: number; facing: number },
  ): boolean;
  neighbours(sessionId: SessionId): readonly unknown[];
  leave(sessionId: SessionId): void;
  sweep(): number;
}

export interface GatewayOptions {
  readonly sessions: SessionStore;
  readonly identity: IdentityVerifier;
  readonly presence: PresenceTracker;
  readonly logger: Logger;
  readonly router: CommandRouter;
  readonly maxConnections: number;
  readonly heartbeatTimeoutMs: number;
  readonly handshakeTimeoutMs: number;
  readonly maxCommandsPerSecond: number;
  readonly now?: () => number;
}

interface Connection {
  readonly socket: GatewaySocket;
  readonly bucket: TokenBucket;
  readonly connectedAtMs: number;
  session: Session | null;
  lastSeenMs: number;
  outboundSeq: number;
  lastInboundSeq: number;
}

export interface HandshakePayload {
  readonly resumeToken?: string;
  /**
   * Proof of ownership of an account, issued by the server on first contact.
   *
   * There is deliberately no `playerId` field. A client-asserted id is a claim
   * anyone can make, and ids appear in logs - believing one is how an account
   * is stolen by whoever reads them.
   */
  readonly identityToken?: string;
}

export class Gateway {
  private readonly connections = new Set<Connection>();
  private readonly now: () => number;

  constructor(private readonly options: GatewayOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  /** Registers a newly opened socket. Returns a handle for frame delivery. */
  accept(socket: GatewaySocket): { receive(raw: string): void; disconnect(): void } | null {
    if (this.connections.size >= this.options.maxConnections) {
      socket.close(CloseCode.CapacityReached, 'server at capacity');
      this.options.logger.warn('connection refused: capacity reached', {
        remoteAddress: socket.remoteAddress,
      });
      return null;
    }

    const connection: Connection = {
      socket,
      bucket: new TokenBucket({
        capacity: this.options.maxCommandsPerSecond,
        refillPerSecond: this.options.maxCommandsPerSecond,
        now: this.now,
      }),
      connectedAtMs: this.now(),
      session: null,
      lastSeenMs: this.now(),
      outboundSeq: 0,
      lastInboundSeq: -1,
    };
    this.connections.add(connection);

    return {
      receive: (raw: string) => {
        void this.receive(connection, raw);
      },
      disconnect: () => this.release(connection),
    };
  }

  private send(connection: Connection, op: string, payload: unknown): void {
    connection.outboundSeq += 1;
    connection.socket.send(
      encodeFrame(createEnvelope(op, connection.outboundSeq, payload, this.now())),
    );
  }

  private reject(connection: Connection, error: Failure, close: number | null): void {
    this.send(connection, ServerOpcode.CommandRejected, error);
    if (close !== null) connection.socket.close(close, error.reason);
  }

  private async receive(connection: Connection, raw: string): Promise<void> {
    connection.lastSeenMs = this.now();

    const decoded = decodeClientFrame(raw);
    if (!decoded.ok) {
      this.reject(connection, decoded.error, CloseCode.ProtocolError);
      return;
    }
    const frame = decoded.value;

    // Replayed or reordered frames are dropped rather than applied twice.
    if (frame.seq <= connection.lastInboundSeq) return;
    connection.lastInboundSeq = frame.seq;

    if (!connection.bucket.tryConsume()) {
      this.reject(
        connection,
        failure(FailureCode.RateLimited, 'gateway.rate_limited'),
        CloseCode.RateLimited,
      );
      return;
    }

    if (frame.op === ClientOpcode.Handshake) {
      void this.handleHandshake(connection, frame.p as HandshakePayload);
      return;
    }

    if (connection.session === null) {
      this.reject(
        connection,
        failure(FailureCode.Unauthorized, 'gateway.handshake_required'),
        CloseCode.ProtocolError,
      );
      return;
    }

    switch (frame.op) {
      case ClientOpcode.Heartbeat:
        this.send(connection, ServerOpcode.Heartbeat, { t: this.now() });
        return;
      case ClientOpcode.PresenceUpdate: {
        // Answered rather than broadcast: the reply carries the neighbours this
        // client can see, so outbound cost is one message per request instead
        // of one per player per movement.
        const position = frame.p as { x?: unknown; z?: unknown; facing?: unknown } | null;
        const accepted =
          position !== null &&
          typeof position.x === 'number' &&
          typeof position.z === 'number' &&
          typeof position.facing === 'number' &&
          this.options.presence.update(connection.session.id, connection.session.playerId, {
            x: position.x,
            z: position.z,
            facing: position.facing,
          });
        if (!accepted) {
          this.reject(
            connection,
            failure(FailureCode.Validation, 'presence.invalid_position'),
            null,
          );
          return;
        }
        this.send(connection, ServerOpcode.PresenceDelta, {
          neighbours: this.options.presence.neighbours(connection.session.id),
        });
        return;
      }
      case ClientOpcode.Resync:
        this.send(connection, ServerOpcode.Snapshot, {
          sessionId: connection.session.id,
          lastClientSeq: connection.session.lastClientSeq,
        });
        return;
      case ClientOpcode.Command:
        await this.handleCommand(connection, frame.seq, frame.p);
        return;
      default:
        this.reject(
          connection,
          failure(FailureCode.Validation, 'gateway.unhandled_opcode'),
          CloseCode.ProtocolError,
        );
    }
  }

  private async handleHandshake(connection: Connection, payload: HandshakePayload): Promise<void> {
    if (connection.session !== null) {
      this.reject(
        connection,
        failure(FailureCode.Conflict, 'gateway.already_handshaken'),
        CloseCode.ProtocolError,
      );
      return;
    }

    let session: Session | undefined;
    if (typeof payload?.resumeToken === 'string') {
      session = this.options.sessions.resume(payload.resumeToken);
      if (!session) {
        // An expired token is not fatal: the client falls back to a fresh session.
        this.send(
          connection,
          ServerOpcode.Notice,
          failure(FailureCode.Unauthorized, 'session.resume_expired'),
        );
      }
    }
    // The player id a client sends is a claim, not a credential. It is
    // ignored entirely: identity comes from a token the server issued, or the
    // connection is given a brand new account. Trusting the claim is how an
    // account is stolen by anyone who reads a log line.
    let issuedToken: string | null = null;
    if (!session) {
      const token = payload?.identityToken;
      if (typeof token === 'string' && token.length > 0) {
        const resolved = await this.options.identity.resolve(token);
        if (!resolved.ok) {
          this.reject(connection, resolved.error, CloseCode.ProtocolError);
          return;
        }
        session = this.options.sessions.create(resolved.value);
      } else {
        const created = await this.options.identity.issue();
        if (!created.ok) {
          this.reject(connection, created.error, CloseCode.ProtocolError);
          return;
        }
        issuedToken = created.value.token;
        session = this.options.sessions.create(created.value.playerId);
      }
    }

    // The socket may have gone while identity was being resolved.
    if (!this.connections.has(connection)) return;

    connection.session = session;
    this.send(connection, ServerOpcode.HandshakeAccepted, {
      sessionId: session.id,
      resumeToken: session.resumeToken,
      playerId: session.playerId,
      // Present only when an account was just created. The client stores it
      // and sends it from then on; the server keeps only its hash.
      ...(issuedToken !== null ? { identityToken: issuedToken } : {}),
      serverTime: this.now(),
    });
    this.options.logger.info('session established', {
      sessionId: session.id,
      playerId: session.playerId,
      resumed: session.lastClientSeq > 0,
    });
  }

  private async handleCommand(
    connection: Connection,
    seq: number,
    payload: unknown,
  ): Promise<void> {
    const session = connection.session;
    if (!session) return;
    const kind =
      typeof payload === 'object' && payload !== null && 'kind' in payload
        ? String((payload as { kind: unknown }).kind)
        : '';
    if (kind.length === 0) {
      this.reject(connection, failure(FailureCode.Validation, 'command.kind_missing'), null);
      return;
    }
    if (!this.options.router.supports(kind)) {
      this.reject(
        connection,
        failure(FailureCode.Validation, 'command.unsupported', { context: { kind } }),
        null,
      );
      return;
    }
    try {
      const outcome = await this.options.router.dispatch(session, kind, payload);
      // Recorded on rejection as well as success: the sequence number records
      // what the server has seen, and a resuming client must not replay a
      // command that was already decided against it.
      this.options.sessions.recordSeq(session.id, seq);
      if (!outcome.ok) {
        this.reject(connection, outcome.error, null);
        return;
      }
      this.send(connection, ServerOpcode.CommandAck, { seq, kind });
      if (outcome.value !== undefined) {
        this.send(connection, ServerOpcode.Patch, { seq, kind, state: outcome.value });
      }
    } catch (error) {
      this.options.logger.error('command dispatch threw', {
        kind,
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.reject(connection, failure(FailureCode.Internal, 'command.dispatch_failed'), null);
    }
  }

  /** Closes idle and un-handshaken sockets. Driven by an interval in `index.ts`. */
  sweep(): { closed: number; sessionsExpired: number } {
    const current = this.now();
    let closed = 0;
    for (const connection of this.connections) {
      const idleMs = current - connection.lastSeenMs;
      if (connection.session === null) {
        if (current - connection.connectedAtMs > this.options.handshakeTimeoutMs) {
          connection.socket.close(CloseCode.HandshakeTimeout, 'handshake timeout');
          this.release(connection);
          closed += 1;
        }
        continue;
      }
      if (idleMs > this.options.heartbeatTimeoutMs) {
        connection.socket.close(CloseCode.HeartbeatTimeout, 'heartbeat timeout');
        this.release(connection);
        closed += 1;
      }
    }
    return { closed, sessionsExpired: this.options.sessions.sweep() };
  }

  /** Called when a socket closes, from either side. */
  private release(connection: Connection): void {
    // Leaving the hub is immediate rather than waiting for the entry to go
    // stale, so a player who walks out does not linger as a ghost.
    if (connection.session !== null) this.options.presence.leave(connection.session.id);
    if (!this.connections.delete(connection)) return;
    if (connection.session) {
      // The session survives, so the player can resume within the window.
      this.options.sessions.markDisconnected(connection.session.id as SessionId);
    }
  }

  /** Drains every connection so a deploy does not cut players off mid-frame. */
  shutdown(): void {
    for (const connection of [...this.connections]) {
      connection.socket.close(CloseCode.ServerShutdown, 'server shutting down');
      this.release(connection);
    }
  }
}

/**
 * Routes commands to handlers registered at startup.
 *
 * An unregistered kind is answered with an explicit `command.unsupported`
 * rejection rather than silence, so a client built against a newer protocol
 * learns why nothing happened.
 */
export class RegistryCommandRouter implements CommandRouter {
  private readonly handlers = new Map<string, CommandHandler>();

  register(kind: string, handler: CommandHandler): this {
    if (this.handlers.has(kind)) throw new Error(`Handler already registered for "${kind}"`);
    this.handlers.set(kind, handler);
    return this;
  }

  supports(kind: string): boolean {
    return this.handlers.has(kind);
  }

  async dispatch(
    session: Session,
    kind: string,
    payload: unknown,
  ): Promise<Result<unknown, Failure>> {
    const handler = this.handlers.get(kind);
    // Unreachable: the gateway checks supports() first. Kept as a throw rather
    // than a Failure because reaching it means the two fell out of step, which
    // is a defect and not something to explain to a player.
    if (!handler) throw new Error(`No handler for "${kind}"`);
    return handler(session, payload);
  }
}
