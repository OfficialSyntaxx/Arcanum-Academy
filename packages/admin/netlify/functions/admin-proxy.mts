import { getUser } from '@netlify/identity';
import { proxyTarget } from '../../src/proxy-policy.js';

const SECURITY_HEADERS = {
  'cache-control': 'no-store, private',
  'content-security-policy': "default-src 'none'",
  'x-content-type-options': 'nosniff',
} as const;

function response(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function adminProxy(request: Request) {
  if (request.method !== 'GET' && request.method !== 'POST')
    return response(405, '{"error":"method_not_allowed"}');

  const [user, serverUrl, adminToken, authorizedEmail] = [
    await getUser(),
    process.env['ALDERFELL_SERVER_URL'],
    process.env['ALDERFELL_ADMIN_READ_TOKEN'],
    process.env['ADMIN_AUTHORIZED_EMAIL']?.trim().toLowerCase(),
  ];
  if (!user) return response(401, '{"error":"authentication_required"}');
  if (!authorizedEmail || user.email?.toLowerCase() !== authorizedEmail) {
    return response(403, '{"error":"not_authorized"}');
  }
  if (!serverUrl || !adminToken) return response(503, '{"error":"proxy_not_configured"}');

  const target = proxyTarget(request.url, serverUrl, request.method);
  if (!target) return response(404, '{"error":"not_found"}');

  if (request.method === 'POST') {
    const lastSignInAt = user.lastSignInAt ? Date.parse(user.lastSignInAt) : Number.NaN;
    if (!Number.isFinite(lastSignInAt) || Date.now() - lastSignInAt > 10 * 60_000) {
      return response(401, '{"error":"fresh_authentication_required"}');
    }
  }

  const upstream = await fetch(target, {
    method: request.method,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${adminToken}`,
      ...(request.method === 'POST'
        ? {
            'content-type': 'application/json',
            'x-admin-actor': user.email ?? '',
          }
        : {}),
    },
    ...(request.method === 'POST' ? { body: await request.text() } : {}),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...SECURITY_HEADERS,
      'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    },
  });
}
