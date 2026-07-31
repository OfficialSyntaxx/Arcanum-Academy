/**
 * Deterministic state hashing.
 *
 * The client and server both run the same simulation; the hash is how they agree
 * they are still in sync. It must be stable across engines and across key
 * insertion order, so the canonical form sorts object keys and rejects values
 * that have no stable text form (undefined, functions, NaN, -0).
 */

function canonicalise(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'n';
  const type = typeof value;
  if (type === 'boolean') return value === true ? 't' : 'f';
  if (type === 'number') {
    const n = value as number;
    if (!Number.isFinite(n)) throw new Error('non-finite number is not hashable');
    // Normalise -0 to 0 so two logically equal states hash equally.
    return `d${n === 0 ? 0 : n}`;
  }
  if (type === 'string') return `s${(value as string).length}:${value as string}`;
  if (type === 'bigint') return `b${(value as bigint).toString()}`;
  if (type === 'undefined') throw new Error('undefined is not hashable; omit the key instead');
  if (type === 'function' || type === 'symbol') throw new Error(`${type} is not hashable`);

  const object = value as object;
  if (seen.has(object)) throw new Error('cyclic structures are not hashable');
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      return `[${object.map((entry) => canonicalise(entry, seen)).join(',')}]`;
    }
    if (object instanceof Map) {
      const entries = [...object.entries()]
        .map(([k, v]) => [canonicalise(k, seen), canonicalise(v, seen)] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return `m{${entries.map(([k, v]) => `${k}:${v}`).join(',')}}`;
    }
    if (object instanceof Set) {
      const entries = [...object.values()].map((entry) => canonicalise(entry, seen)).sort();
      return `x{${entries.join(',')}}`;
    }
    const keys = Object.keys(object as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const entry = (object as Record<string, unknown>)[key];
      if (entry === undefined) continue; // Treat absent and undefined identically.
      parts.push(`${key}:${canonicalise(entry, seen)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(object);
  }
}

/** Canonical text form of a value. Exported for debugging desyncs. */
export function canonicalString(value: unknown): string {
  return canonicalise(value, new WeakSet());
}

/** 32-bit FNV-1a over the canonical form, returned as 8 lowercase hex digits. */
export function hashState(value: unknown): string {
  const text = canonicalString(value);
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
