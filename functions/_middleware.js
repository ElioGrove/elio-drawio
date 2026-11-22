import { passwordGate } from '../auth/password.mjs';

export async function onRequest({ request, env, next }) {
  if (new URL(request.url).hostname !== env.APP_HOST) {
    return new Response('入口不可用。', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const denied = await passwordGate(request, env);
  if (denied) return denied;
  const upstream = await next();
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', 'private, no-cache');
  if (new URL(request.url).pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
