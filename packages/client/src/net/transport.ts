import {
  ClientOpcode,
  createEnvelope,
  decodeServerFrame,
  encodeFrame,
  EventBus,
  type Logger,
  type ServerEnvelope,
} from '@arcanum/shared';

/**
 * Reconnecting client transport.
 *
 * Mobile connectivity is not a failure mode here, it is the normal case. The
 * transport therefore assumes disconnection and is built around three
 * behaviours:
 *
 * - exponential backoff with jitter, so a server restart does not produce a
 *   thundering herd of reconnects from every phone at once;
 * - an outbound queue, so a tap made two seconds before the socket dropped is
 *   still delivered rather than silently lost;
 * - resume tokens, so reconnecting restores the same session instead of
 *   restarting the player's context.
 *
 * The socket is injected so the whole state machine is testable without a
 * network, and so a loopback transport can drive the offline tutorial.
 */

export const TransportStatus = {
  Idle: 'idle',
  Connecting: 'connecting',
  Open: 'open',
  Reconnecting: 'reconnecting',
  Closed: 'closed',
} as const;

export type TransportStatus = (typeof TransportStatus)[keyof typeof TransportStatus];

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((error: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export type TransportEvents = {
  status: { status: TransportStatus; attempt: number };
  frame: ServerEnvelope;
  latency: { roundTripMs: number };
};

export interface TransportOptions {
  readonly url: string;
  readonly logger: Logger;
  readonly socketFactory: SocketFactory;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly heartbeatIntervalMs: number;
  /** Frames buffered while offline. Oldest are dropped past this bound. */
  readonly maxQueuedFrames?: number;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => number;
  readonly clearTimer?: (handle: number) => void;
  readonly random?: () => number;
}

export interface HandshakeIdentity {
  readonly playerId: string;
  resumeToken?: string;
}

export class Transport {
  readonly events = new EventBus<TransportEvents>();

  private socket: SocketLike | null = null;
  private status: TransportStatus = TransportStatus.Idle;
  private attempt = 0;
  private outboundSeq = 0;
  private readonly queue: string[] = [];
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastHeartbeatSentMs = 0;
  private stopped = false;

  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => number;
  private readonly clearTimer: (handle: number) => void;
  private readonly random: () => number;
  private readonly maxQueuedFrames: number;

  constructor(
    private readonly options: TransportOptions,
    private readonly identity: HandshakeIdentity,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.setTimer =
      options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number);
    this.clearTimer = options.clearTimer ?? ((handle) => globalThis.clearTimeout(handle));
    this.random = options.random ?? Math.random;
    this.maxQueuedFrames = options.maxQueuedFrames ?? 64;
  }

  get currentStatus(): TransportStatus {
    return this.status;
  }

  get queuedFrameCount(): number {
    return this.queue.length;
  }

  connect(): void {
    if (this.socket || this.stopped) return;
    this.setStatus(this.attempt === 0 ? TransportStatus.Connecting : TransportStatus.Reconnecting);

    const socket = this.options.socketFactory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus(TransportStatus.Open);
      this.sendHandshake();
      this.flushQueue();
      this.startHeartbeat();
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = (error) => this.options.logger.warn('socket error', { error: String(error) });
    socket.onclose = (event) => {
      this.stopHeartbeat();
      this.socket = null;
      if (this.stopped) {
        this.setStatus(TransportStatus.Closed);
        return;
      }
      this.options.logger.info('socket closed, scheduling reconnect', {
        code: event.code,
        reason: event.reason,
      });
      this.scheduleReconnect();
    };
  }

  /** Sends a command, queueing it when the socket is not open. */
  send(op: ClientOpcode, payload: unknown): void {
    this.outboundSeq += 1;
    const frame = encodeFrame(createEnvelope(op, this.outboundSeq, payload, this.now()));
    if (this.status === TransportStatus.Open && this.socket) {
      this.socket.send(frame);
      return;
    }
    this.queue.push(frame);
    while (this.queue.length > this.maxQueuedFrames) this.queue.shift();
  }

  /** Closes deliberately. No reconnect follows. */
  close(): void {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.setStatus(TransportStatus.Closed);
  }

  dispose(): void {
    this.close();
    this.events.clear();
  }

  /**
   * Full jitter backoff: `random(0, min(max, base * 2^attempt))`. Full jitter
   * beats equal jitter for herd avoidance and costs nothing to implement.
   */
  nextDelayMs(attempt: number): number {
    const ceiling = Math.min(this.options.maxDelayMs, this.options.baseDelayMs * 2 ** attempt);
    return Math.floor(this.random() * ceiling);
  }

  private scheduleReconnect(): void {
    this.setStatus(TransportStatus.Reconnecting);
    const delay = this.nextDelayMs(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private sendHandshake(): void {
    this.outboundSeq += 1;
    const payload = this.identity.resumeToken
      ? { playerId: this.identity.playerId, resumeToken: this.identity.resumeToken }
      : { playerId: this.identity.playerId };
    this.socket?.send(
      encodeFrame(createEnvelope(ClientOpcode.Handshake, this.outboundSeq, payload, this.now())),
    );
  }

  private flushQueue(): void {
    if (!this.socket) return;
    const pending = this.queue.splice(0, this.queue.length);
    for (const frame of pending) this.socket.send(frame);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    const decoded = decodeServerFrame(data);
    if (!decoded.ok) {
      this.options.logger.warn('dropped malformed server frame', { reason: decoded.error.reason });
      return;
    }
    const frame = decoded.value;
    if (frame.op === 's:heartbeat' && this.lastHeartbeatSentMs > 0) {
      this.events.emit('latency', { roundTripMs: this.now() - this.lastHeartbeatSentMs });
    }
    if (frame.op === 's:handshake_ok') {
      const payload = frame.p as { resumeToken?: string };
      if (typeof payload?.resumeToken === 'string') this.identity.resumeToken = payload.resumeToken;
    }
    this.events.emit('frame', frame);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = this.setTimer(() => {
      this.lastHeartbeatSentMs = this.now();
      this.send(ClientOpcode.Heartbeat, {});
      this.startHeartbeat();
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    this.clearTimer(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private setStatus(status: TransportStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.emit('status', { status, attempt: this.attempt });
  }
}

/** Real browser socket adapter. Separated so tests never touch the DOM. */
export const browserSocketFactory: SocketFactory = (url) =>
  new WebSocket(url) as unknown as SocketLike;
