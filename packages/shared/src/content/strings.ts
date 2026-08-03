/**
 * Player-facing text.
 *
 * Every string a player reads is referenced by key and resolved here. The
 * Phase 4 exit criteria ask for no literals in components, and the reason is
 * not tidiness: a card that carries its own English cannot be translated
 * without a content migration, and the card set is the part of this game that
 * grows fastest.
 *
 * A missing key resolves to the key itself rather than to an empty string or a
 * throw. An untranslated card should look wrong in a way that is obvious and
 * searchable, not disappear or take a screen down with it.
 */

import { failure, type Failure } from '../errors.js';
import { err, ok, type Result } from '../result.js';

export interface StringTable {
  readonly locale: string;
  /** Resolves a key, falling back to the key itself. */
  get(key: string): string;
  has(key: string): boolean;
  readonly size: number;
}

export function buildStringTable(
  locale: string,
  strings: Readonly<Record<string, unknown>>,
): Result<StringTable, Failure> {
  const resolved = new Map<string, string>();
  const problems: string[] = [];

  for (const [key, value] of Object.entries(strings)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      problems.push(`"${key}" has no text`);
      continue;
    }
    resolved.set(key, value);
  }

  if (problems.length > 0) {
    return err(failure('validation', 'content.strings_invalid', { detail: problems.join('; ') }));
  }

  return ok({
    locale,
    get: (key) => resolved.get(key) ?? key,
    has: (key) => resolved.has(key),
    size: resolved.size,
  });
}

/**
 * Checks that every key a set of content references has text.
 *
 * Run over the shipped card set in a test, so a card added without its strings
 * fails the build rather than shipping with its key showing.
 */
export function assertKeysResolve(
  table: StringTable,
  keys: readonly string[],
): Result<true, Failure> {
  const missing = keys.filter((key) => !table.has(key));
  if (missing.length === 0) return ok(true);
  return err(
    failure('validation', 'content.strings_missing', {
      detail: `${missing.length} key(s) have no text: ${missing.slice(0, 8).join(', ')}`,
      context: { locale: table.locale, missing: missing.length },
    }),
  );
}
