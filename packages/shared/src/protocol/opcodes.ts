/**
 * Wire opcodes.
 *
 * Opcodes are short strings rather than integers: the readability win in logs
 * and dev tooling outweighs a few bytes, and the transport compresses them well.
 * Codes are append-only - never reuse or renumber, because old clients survive
 * in the wild for weeks after a release.
 */

export const ClientOpcode = {
  /** First frame on every socket. Carries protocol version and resume token. */
  Handshake: 'c:handshake',
  Heartbeat: 'c:heartbeat',
  /** A player intent. The server validates, applies and acknowledges. */
  Command: 'c:command',
  /** Requests a full authoritative snapshot, e.g. after a detected desync. */
  Resync: 'c:resync',
  PresenceUpdate: 'c:presence',
} as const;

export type ClientOpcode = (typeof ClientOpcode)[keyof typeof ClientOpcode];

export const ServerOpcode = {
  HandshakeAccepted: 's:handshake_ok',
  HandshakeRejected: 's:handshake_err',
  Heartbeat: 's:heartbeat',
  /** Authoritative result of a client command, keyed by the client's sequence. */
  CommandAck: 's:command_ack',
  CommandRejected: 's:command_err',
  /** Authoritative state delta produced by the server simulation. */
  Patch: 's:patch',
  Snapshot: 's:snapshot',
  PresenceDelta: 's:presence_delta',
  Notice: 's:notice',
} as const;

export type ServerOpcode = (typeof ServerOpcode)[keyof typeof ServerOpcode];

/**
 * Bumped whenever the meaning of any frame changes. The server refuses
 * handshakes from a different major version and tells the client to reload.
 */
export const PROTOCOL_VERSION = 1;
