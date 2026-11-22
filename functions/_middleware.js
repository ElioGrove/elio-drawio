import { passwordGate } from '../auth/password.mjs';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.hostname !== env.APP_HOST) {
    return new Response('入口不可用。', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  const denied = await passwordGate(request, env);
  if (denied) return denied;
  const upstream = await next();
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', url.pathname.startsWith('/api/') ? 'private, no-store' : 'private, no-cache');
  return response;
}
