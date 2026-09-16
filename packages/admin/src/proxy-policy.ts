const PLAYER_SEGMENT = '[^/]+';
const ALLOWED_ADMIN_PATHS = [
  /^\/admin\/overview$/,
  /^\/admin\/diagnostics$/,
  /^\/admin\/reports$/,
  /^\/admin\/players$/,
  new RegExp(`^/admin/players/${PLAYER_SEGMENT}$`),
  new RegExp(`^/admin/players/${PLAYER_SEGMENT}/snapshots$`),
  new RegExp(`^/admin/players/${PLAYER_SEGMENT}/snapshots/${PLAYER_SEGMENT}$`),
  new RegExp(`^/admin/players/${PLAYER_SEGMENT}/restore-audit$`),
] as const;

export function permittedAdminPath(pathname: string): boolean {
  if (pathname.includes('..') || /%2f|%5c/i.test(pathname)) return false;
  return ALLOWED_ADMIN_PATHS.some((pattern) => pattern.test(pathname));
}

export function proxyTarget(requestUrl: string, serverUrl: string): URL | null {
  const incoming = new URL(requestUrl);
  const marker = '/.netlify/functions/admin-proxy';
  if (!incoming.pathname.startsWith(marker)) return null;
  const path = incoming.pathname.slice(marker.length);
  if (!permittedAdminPath(path)) return null;
  const base = new URL(serverUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
  const target = new URL(path, `${base.toString().replace(/\/$/, '')}/`);
  target.search = incoming.search;
  return target;
}
