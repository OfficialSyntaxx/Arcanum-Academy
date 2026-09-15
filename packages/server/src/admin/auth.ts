import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-work comparison after both inputs are normalized to equal-length digests. */
export function adminTokenMatches(expected: string, authorization: string | undefined): boolean {
  const prefix = 'Bearer ';
  const supplied = authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : '';
  return timingSafeEqual(digest(expected), digest(supplied));
}
