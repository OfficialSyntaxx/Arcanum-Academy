/**
 * Branded identifier types plus a monotonic, sortable id generator.
 *
 * Branding prevents whole classes of bugs (passing a CardId where a DeckId is
 * expected) at zero runtime cost. Ids are lexicographically sortable so that
 * database indexes and client-side lists stay ordered without extra fields.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type CardInstanceId = Brand<string, 'CardInstanceId'>;
export type CardDefinitionId = Brand<string, 'CardDefinitionId'>;
export type DeckId = Brand<string, 'DeckId'>;
export type ItemDefinitionId = Brand<string, 'ItemDefinitionId'>;
export type NodeId = Brand<string, 'NodeId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type ListingId = Brand<string, 'ListingId'>;
export type SlabSerial = Brand<string, 'SlabSerial'>;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U.
const RANDOM_LENGTH = 16;
const TIME_LENGTH = 10;

function encodeTime(ms: number, length: number): string {
  let remaining = Math.floor(ms);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET[remaining % 32]! + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generates a ULID-compatible, time-sortable identifier.
 *
 * @param now injected clock, so tests and the deterministic simulation can
 *            produce reproducible ids.
 */
export function generateId(now: number = Date.now()): string {
  const bytes = randomBytes(RANDOM_LENGTH);
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    random += ALPHABET[bytes[i]! % 32]!;
  }
  return encodeTime(now, TIME_LENGTH) + random;
}

/** Extracts the millisecond timestamp encoded in the id prefix. */
export function timestampOf(id: string): number {
  let value = 0;
  for (let i = 0; i < TIME_LENGTH; i += 1) {
    const index = ALPHABET.indexOf(id[i] ?? '');
    if (index < 0) return Number.NaN;
    value = value * 32 + index;
  }
  return value;
}

export function isValidId(id: string): boolean {
  if (id.length !== TIME_LENGTH + RANDOM_LENGTH) return false;
  for (const ch of id) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Narrows a raw string into a branded id. Use only at trust boundaries. */
export function asId<T extends Brand<string, string>>(raw: string): T {
  return raw as T;
}
