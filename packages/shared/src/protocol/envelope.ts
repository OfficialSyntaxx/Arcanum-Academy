import { failure, FailureCode, type Failure } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from './opcodes.js';

/**
 * Every frame on the wire is an envelope. A single shape means one parser, one
 * validation path, one place to add compression, tracing or rate limiting.
 */
export interface Envelope<TOpcode extends string = string, TPayload = unknown> {
  /** Protocol version, checked before anything else is trusted. */
  readonly v: number;
  readonly op: TOpcode;
  /** Monotonic per-connection sequence. Enables acks, dedupe and ordering checks. */
  readonly seq: number;
  /** Sender clock in ms, used for latency estimation only - never for logic. */
  readonly t: number;
  readonly p: TPayload;
}

export type ClientEnvelope<TPayload = unknown> = Envelope<ClientOpcode, TPayload>;
export type ServerEnvelope<TPayload = unknown> = Envelope<ServerOpcode, TPayload>;

const CLIENT_OPCODES = new Set<string>(Object.values(ClientOpcode));
const SERVER_OPCODES = new Set<string>(Object.values(ServerOpcode));

/** Frames above this size are dropped before parsing to bound attack surface. */
export const MAX_FRAME_BYTES = 64 * 1024;

export function createEnvelope<TOpcode extends string, TPayload>(
  op: TOpcode,
  seq: number,
  payload: TPayload,
  now: number = Date.now(),
): Envelope<TOpcode, TPayload> {
  return { v: PROTOCOL_VERSION, op, seq, t: now, p: payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeEnvelope(raw: string, allowed: ReadonlySet<string>): Result<Envelope, Failure> {
  if (raw.length > MAX_FRAME_BYTES) {
    return err(
      failure(FailureCode.Validation, 'frame.too_large', { context: { size: raw.length } }),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(failure(FailureCode.Validation, 'frame.malformed_json'));
  }
  if (!isRecord(parsed)) return err(failure(FailureCode.Validation, 'frame.not_an_object'));
  const { v, op, seq, t } = parsed;
  if (typeof v !== 'number' || v !== PROTOCOL_VERSION) {
    return err(
      failure(FailureCode.Validation, 'frame.protocol_mismatch', {
        context: { expected: PROTOCOL_VERSION, received: typeof v === 'number' ? v : -1 },
      }),
    );
  }
  if (typeof op !== 'string' || !allowed.has(op)) {
    return err(failure(FailureCode.Validation, 'frame.unknown_opcode'));
  }
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    return err(failure(FailureCode.Validation, 'frame.invalid_sequence'));
  }
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    return err(failure(FailureCode.Validation, 'frame.invalid_timestamp'));
  }
  return ok({ v, op, seq, t, p: 'p' in parsed ? parsed.p : undefined });
}

/** Parses a frame received by the server. Rejects anything not client-authored. */
export function decodeClientFrame(raw: string): Result<ClientEnvelope, Failure> {
  return decodeEnvelope(raw, CLIENT_OPCODES) as Result<ClientEnvelope, Failure>;
}

/** Parses a frame received by the client. */
export function decodeServerFrame(raw: string): Result<ServerEnvelope, Failure> {
  return decodeEnvelope(raw, SERVER_OPCODES) as Result<ServerEnvelope, Failure>;
}

export function encodeFrame(envelope: Envelope): string {
  return JSON.stringify(envelope);
}
