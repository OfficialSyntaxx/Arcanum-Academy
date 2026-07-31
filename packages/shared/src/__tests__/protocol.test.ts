import { describe, expect, it } from 'vitest';
import {
  ClientOpcode,
  createEnvelope,
  decodeClientFrame,
  decodeServerFrame,
  encodeFrame,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  ServerOpcode,
} from '../protocol/index.js';

describe('protocol envelope', () => {
  it('round-trips a client frame', () => {
    const frame = encodeFrame(createEnvelope(ClientOpcode.Command, 7, { kind: 'noop' }, 1234));
    const decoded = decodeClientFrame(frame);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.op).toBe(ClientOpcode.Command);
    expect(decoded.value.seq).toBe(7);
    expect(decoded.value.v).toBe(PROTOCOL_VERSION);
  });

  it('rejects a server opcode arriving on the server inbound path', () => {
    const frame = encodeFrame(createEnvelope(ServerOpcode.Patch, 1, {}, 0));
    const decoded = decodeClientFrame(frame);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('frame.unknown_opcode');
  });

  it('rejects a protocol version mismatch', () => {
    const decoded = decodeServerFrame(
      JSON.stringify({ v: PROTOCOL_VERSION + 1, op: ServerOpcode.Patch, seq: 0, t: 0, p: {} }),
    );
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('frame.protocol_mismatch');
  });

  it('rejects malformed json', () => {
    const decoded = decodeClientFrame('{not json');
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('frame.malformed_json');
  });

  it('rejects negative or non-integer sequences', () => {
    const decoded = decodeClientFrame(
      JSON.stringify({ v: PROTOCOL_VERSION, op: ClientOpcode.Heartbeat, seq: -1, t: 0, p: null }),
    );
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('frame.invalid_sequence');
  });

  it('drops oversized frames before parsing', () => {
    const decoded = decodeClientFrame('x'.repeat(MAX_FRAME_BYTES + 1));
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.error.reason).toBe('frame.too_large');
  });
});
