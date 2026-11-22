import { passwordGate } from '../auth/password.mjs';

const fingerprintedLibrary = /^\/library\/library-[0-9a-f]{16}\.(?:css|js)$/;
const fingerprintedVersion = /^[0-9a-f]{16}$/;

function cacheControl(url, response) {
  if (url.pathname.startsWith('/api/')) return 'private, no-store';
  const contentType = response.headers.get('Content-Type') || '';
  if (!response.ok || contentType.includes('text/html')) return 'private, no-cache';
  if (
    fingerprintedLibrary.test(url.pathname) ||
    fingerprintedVersion.test(url.searchParams.get('v') || '')
  ) {
    return 'private, max-age=31536000, immutable';
  }
  return 'private, max-age=86400';
}

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
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (url.pathname === '/favicon.ico' ||
      url.pathname === '/favicon.svg' ||
      url.pathname === '/images/apple-touch-icon.png')
  ) {
    const upstream = await next();
    const response = new Response(upstream.body, upstream);
    response.headers.set('Cache-Control', 'public, max-age=3600');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  const denied = await passwordGate(request, env);
  if (denied) return denied;
  const upstream = await next();
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', cacheControl(url, upstream));
  return response;
}
