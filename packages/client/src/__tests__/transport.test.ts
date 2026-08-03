import { describe, expect, it, vi } from 'vitest';
import {
  ClientOpcode,
  createEnvelope,
  createLogger,
  createMemorySink,
  encodeFrame,
  LogLevel,
  ServerOpcode,
} from '@arcanum/shared';
import { Transport, TransportStatus, type SocketLike } from '../net/transport.js';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.({ code: 1000, reason: 'client closed' });
  }

  open(): void {
    this.onopen?.();
  }

  deliver(op: string, payload: unknown): void {
    this.onmessage?.({ data: encodeFrame(createEnvelope(op, 1, payload, 0)) });
  }

  drop(code = 1006): void {
    this.onclose?.({ code, reason: 'connection lost' });
  }

  parsedOps(): string[] {
    return this.sent.map((frame) => (JSON.parse(frame) as { op: string }).op);
  }
}

function harness(options: { random?: () => number } = {}) {
  const sockets: FakeSocket[] = [];
  let clock = 0;
  const timers = new Map<number, { fn: () => void; dueAt: number }>();
  let nextTimer = 1;

  const transport = new Transport(
    {
      url: 'ws://test',
      logger: createLogger({ scope: 'test', level: LogLevel.Silent, sinks: [createMemorySink()] }),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      baseDelayMs: 500,
      maxDelayMs: 15_000,
      heartbeatIntervalMs: 5_000,
      maxQueuedFrames: 3,
      now: () => clock,
      setTimer: (fn, ms) => {
        const handle = nextTimer++;
        timers.set(handle, { fn, dueAt: clock + ms });
        return handle;
      },
      clearTimer: (handle) => {
        timers.delete(handle);
      },
      random: options.random ?? (() => 0.5),
    },
    { identityToken: 'token-1' },
  );

  return {
    transport,
    sockets,
    latest: () => sockets.at(-1)!,
    advance: (ms: number) => {
      clock += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.dueAt <= clock) {
          timers.delete(handle);
          timer.fn();
        }
      }
    },
    setClock: (value: number) => {
      clock = value;
    },
  };
}

describe('Transport', () => {
  it('sends a handshake as the first frame after opening', () => {
    const h = harness();
    h.transport.connect();
    h.latest().open();
    expect(h.latest().parsedOps()[0]).toBe(ClientOpcode.Handshake);
    expect(h.transport.currentStatus).toBe(TransportStatus.Open);
  });

  it('queues frames sent while offline and flushes them on connect', () => {
    const h = harness();
    h.transport.send(ClientOpcode.Command, { kind: 'a' });
    h.transport.send(ClientOpcode.Command, { kind: 'b' });
    expect(h.transport.queuedFrameCount).toBe(2);

    h.transport.connect();
    h.latest().open();
    expect(h.transport.queuedFrameCount).toBe(0);
    const ops = h.latest().parsedOps();
    expect(ops.filter((op) => op === ClientOpcode.Command)).toHaveLength(2);
  });

  it('bounds the offline queue so a long outage cannot grow without limit', () => {
    const h = harness();
    for (let i = 0; i < 10; i += 1) h.transport.send(ClientOpcode.Command, { i });
    expect(h.transport.queuedFrameCount).toBe(3);
  });

  it('reconnects after an unexpected drop', () => {
    const h = harness();
    h.transport.connect();
    h.latest().open();
    h.latest().drop();
    expect(h.transport.currentStatus).toBe(TransportStatus.Reconnecting);
    h.advance(20_000);
    expect(h.sockets).toHaveLength(2);
  });

  it('applies full-jitter exponential backoff with a ceiling', () => {
    const h = harness({ random: () => 1 });
    expect(h.transport.nextDelayMs(0)).toBe(500);
    expect(h.transport.nextDelayMs(1)).toBe(1_000);
    expect(h.transport.nextDelayMs(4)).toBe(8_000);
    expect(h.transport.nextDelayMs(10)).toBe(15_000);
  });

  it('randomises the delay so clients do not reconnect in lockstep', () => {
    const low = harness({ random: () => 0 });
    const high = harness({ random: () => 0.99 });
    expect(low.transport.nextDelayMs(3)).toBeLessThan(high.transport.nextDelayMs(3));
  });

  it('does not reconnect after a deliberate close', () => {
    const h = harness();
    h.transport.connect();
    h.latest().open();
    h.transport.close();
    h.advance(60_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.transport.currentStatus).toBe(TransportStatus.Closed);
  });

  it('stores the resume token and replays it on the next handshake', () => {
    const h = harness();
    h.transport.connect();
    h.latest().open();
    h.latest().deliver(ServerOpcode.HandshakeAccepted, { resumeToken: 'token-abc' });
    h.latest().drop();
    h.advance(20_000);
    h.latest().open();

    const handshake = JSON.parse(h.latest().sent[0]!) as { p: { resumeToken?: string } };
    expect(handshake.p.resumeToken).toBe('token-abc');
  });

  it('emits decoded frames and ignores malformed ones', () => {
    const h = harness();
    const onFrame = vi.fn();
    h.transport.events.on('frame', onFrame);
    h.transport.connect();
    h.latest().open();
    h.latest().onmessage?.({ data: 'not-json' });
    expect(onFrame).not.toHaveBeenCalled();
    h.latest().deliver(ServerOpcode.Notice, { message: 'hello' });
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('measures round-trip latency from heartbeats', () => {
    const h = harness();
    const onLatency = vi.fn();
    h.transport.events.on('latency', onLatency);
    h.transport.connect();
    h.latest().open();
    h.advance(5_000);
    h.advance(40);
    h.latest().deliver(ServerOpcode.Heartbeat, {});
    expect(onLatency).toHaveBeenCalledWith({ roundTripMs: 40 });
  });

  it('reports status transitions exactly once per change', () => {
    const h = harness();
    const statuses: string[] = [];
    h.transport.events.on('status', ({ status }) => statuses.push(status));
    h.transport.connect();
    h.latest().open();
    h.latest().drop();
    expect(statuses).toEqual([
      TransportStatus.Connecting,
      TransportStatus.Open,
      TransportStatus.Reconnecting,
    ]);
  });
});
