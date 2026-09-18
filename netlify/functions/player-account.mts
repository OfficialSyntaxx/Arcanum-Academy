import { getUser } from '@netlify/identity';

declare const Netlify: { readonly env: { get(name: string): string | undefined } };
interface Context {
  readonly ip: string;
}

const HEADERS = {
  'cache-control': 'no-store, private',
  'content-security-policy': "default-src 'none'",
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
} as const;

function reply(status: number, body: object) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export default async function playerAccount(request: Request, context: Context) {
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const user = await getUser();
  if (!user) return reply(401, { error: 'authentication_required' });

  const serverUrl = Netlify.env.get('ALDERFELL_SERVER_URL');
  const bridgeSecret = Netlify.env.get('ALDERFELL_ACCOUNT_BRIDGE_SECRET');
  if (!serverUrl || !bridgeSecret) return reply(503, { error: 'proxy_not_configured' });

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    identityToken?: unknown;
  } | null;
  if (body?.action !== 'link' && body?.action !== 'recover') {
    return reply(400, { error: 'invalid_request' });
  }
  if (body.action === 'link' && typeof body.identityToken !== 'string') {
    return reply(400, { error: 'invalid_request' });
  }

  const upstream = await fetch(new URL(`/account/${body.action}`, serverUrl), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${bridgeSecret}`,
      'content-type': 'application/json',
      'x-forwarded-for': context.ip,
    },
    body: JSON.stringify({
      subject: user.id,
      ...(body.action === 'link' ? { identityToken: body.identityToken } : {}),
    }),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: HEADERS,
  });
}

export const config = {
  path: '/api/player-account',
  method: ['POST'],
};
