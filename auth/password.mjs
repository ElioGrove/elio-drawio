import { egSvg } from './eg-logo.mjs';

const cookie = '__Host-elio_session';
const age = 7 * 86400;
const windowMs = 900000;
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
const digest = (input) => crypto.subtle.digest('SHA-256', encoder.encode(input));
const equalDigest = (left, right) => {
  if (typeof crypto.subtle.timingSafeEqual === 'function')
    return crypto.subtle.timingSafeEqual(left, right);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};
const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const mediaType = (value) => (value || '').split(';')[0].trim().toLowerCase();
const pageHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const sessionKey = async (token, secret) => hex(await digest(token + ':' + secret));
const baseCss =
  '*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px 10vh;background:#000;color:#fff;font:15px/1.4 system-ui,-apple-system,BlinkMacSystemFont,sans-serif}.emblem{width:min(320px,72vw);margin-bottom:36px;user-select:none}.emblem svg{display:block;width:100%;height:auto}form{width:min(300px,84vw);display:flex;flex-direction:column;gap:12px}input,button,a{width:100%;height:44px;border-radius:8px;font:inherit}input{padding:0 14px;background:#0e0e0e;color:#fff;border:1px solid #2a2a2a;outline:none;transition:border-color .15s}input::placeholder{color:#666}input:focus{border-color:#666}button{border:1px solid #333;background:#000;color:#fff;font-weight:600;cursor:pointer;transition:background-color .15s,border-color .15s}button:hover{background:#141414;border-color:#666}button:focus-visible,a:focus-visible{outline:2px solid #fff;outline-offset:2px}a{display:grid;place-items:center;border:1px solid #2a2a2a;color:#a3a3a3;text-decoration:none;transition:border-color .15s,color .15s}a:hover{border-color:#666;color:#fff}p{margin:0;text-align:center;font-size:13px;color:#ef4444}';
function loginPage(status = 200, message = '', library = false, extraHeaders = {}) {
  const alert = message ? '<p role="alert">' + escapeHtml(message) + '</p>' : '';
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Sign In</title><style>' +
      baseCss +
      '</style><div class="emblem" aria-hidden="true">' +
      egSvg +
      '</div><form method="post" action="/auth/login' +
      (library ? '?library=1' : '') +
      '"><input type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="current-password" required autofocus>' +
      alert +
      '<button type="submit">Sign In</button></form></html>',
    { status, headers: { ...pageHeaders, ...extraHeaders } },
  );
}
function logoutPage() {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Sign Out</title><style>' +
      baseCss +
      '</style><div class="emblem" aria-hidden="true">' +
      egSvg +
      '</div><form method="post" action="/auth/logout"><button type="submit">Sign Out</button><a href="/library/">Cancel</a></form></html>',
    { headers: pageHeaders },
  );
}
function redirect(location, token, seconds) {
  const headers = {
    Location: location,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (token !== null) {
    headers['Set-Cookie'] =
      cookie + '=' + token + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + seconds;
  }
  return new Response(null, { status: 303, headers });
}
export async function passwordGate(request, env) {
  const url = new URL(request.url);
  const error = (status, message, extraHeaders = {}) =>
    Response.json(
      { error: message },
      {
        status,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          ...extraHeaders,
        },
      },
    );
  if (url.protocol !== 'https:' || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 20 || !env.DB)
    return error(503, '密码登录尚未配置');
  const token = (request.headers.get('Cookie') || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookie + '='))
    ?.slice(cookie.length + 1);
  const key =
    token && /^[a-f0-9]{64}$/.test(token) ? await sessionKey(token, env.ADMIN_PASSWORD) : null;
  const db = env.DB;
  if (url.pathname === '/auth/logout') {
    if (request.method === 'GET') return logoutPage();
    if (request.method !== 'POST') return error(405, '请求方法不受支持', { Allow: 'GET, POST' });
    if (request.headers.get('Origin') !== url.origin) return error(403, '请求来源无效');
    if (key) await db.prepare('DELETE FROM password_sessions WHERE id=?').bind(key).run();
    return redirect('/', '', 0);
  }
  if (url.pathname === '/auth/login' && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return error(403, '请求来源无效');
    const length = Number(request.headers.get('Content-Length'));
    if (
      length > 2048 ||
      mediaType(request.headers.get('Content-Type')) !== 'application/x-www-form-urlencoded'
    )
      return error(400, '无效的登录表单');
    const now = Date.now();
    const ip = hex(await digest(request.headers.get('CF-Connecting-IP') || 'local'));
    const window = Math.floor(now / windowMs);
    const attempt = await db
      .prepare(
        'INSERT INTO password_attempts(ip,window,count) VALUES(?,?,1) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window RETURNING count',
      )
      .bind(ip, window)
      .first();
    const library = url.searchParams.get('library') === '1';
    if (attempt.count > 10) {
      const retryAfter = Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000));
      return loginPage(429, '登录尝试过多，请稍后再试。', library, {
        'Retry-After': String(retryAfter),
      });
    }
    const reader = request.body?.getReader();
    if (!reader) return error(400, '登录表单为空');
    const buffer = new Uint8Array(2048);
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > buffer.length) {
        await reader.cancel();
        return error(413, '登录表单过大');
      }
      buffer.set(value, offset);
      offset += value.length;
    }
    let bodyText;
    try {
      bodyText = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
    } catch {
      return error(400, '无效的登录表单');
    }
    const password = new URLSearchParams(bodyText).get('password') || '';
    const [left, right] = await Promise.all([digest(password), digest(env.ADMIN_PASSWORD)]);
    if (!equalDigest(left, right)) return loginPage(401, '密码不正确。', library);
    const session = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.batch([
      db.prepare('DELETE FROM password_attempts WHERE window<?').bind(window),
      db.prepare('DELETE FROM password_sessions WHERE expires<=?').bind(now),
      db
        .prepare('INSERT INTO password_sessions(id,expires) VALUES(?,?)')
        .bind(await sessionKey(session, env.ADMIN_PASSWORD), now + age * 1000),
    ]);
    return redirect(library ? '/library/' : '/', session, age);
  }
  if (
    key &&
    (await db
      .prepare('SELECT 1 FROM password_sessions WHERE id=? AND expires>?')
      .bind(key, Date.now())
      .first())
  ) {
    if (url.pathname === '/auth/login' && (request.method === 'GET' || request.method === 'HEAD')) {
      return redirect(url.searchParams.get('library') === '1' ? '/library/' : '/', null, 0);
    }
    return null;
  }
  if (
    request.method === 'GET' &&
    !url.pathname.startsWith('/api/') &&
    request.headers.get('Accept')?.includes('text/html')
  ) {
    const library =
      url.pathname === '/library' ||
      url.pathname === '/library/' ||
      (url.pathname === '/auth/login' && url.searchParams.get('library') === '1');
    return loginPage(200, '', library);
  }
  return error(401, '请使用管理员密码登录');
}
