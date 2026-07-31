/**
 * A total, allocation-cheap result type used across every module boundary.
 *
 * Rationale: gameplay, persistence and network code all need to report expected
 * failures (invalid deck, stale save, rejected command) without using exceptions
 * for control flow. Exceptions are reserved for programmer error only.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Applies `fn` to the success value, leaving failures untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Chains a fallible operation onto a successful result. */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Returns the success value, or `fallback` when the result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Returns the success value or throws. Only for call sites where a failure
 * genuinely indicates a bug (tests, bootstrap invariants).
 */
export function expect<T, E>(result: Result<T, E>, message: string): T {
  if (result.ok) return result.value;
  throw new Error(`${message}: ${JSON.stringify(result.error)}`);
}

/** Collects an array of results into a result of an array, failing on the first error. */
export function allResults<T, E>(results: ReadonlyArray<Result<T, E>>): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}
