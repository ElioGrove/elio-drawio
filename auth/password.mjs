const cookie = '__Host-elio_session';
const age = 7 * 86400;
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
const digest = (input) => crypto.subtle.digest('SHA-256', encoder.encode(input));
const pageHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'same-origin',
};
function loginPage(status = 200, message = '', library = false) {
  return new Response(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>密码登录</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f8f8f8;color:#191919;font:16px system-ui}form{width:min(300px,75vw);padding:32px;border:1px solid #ddd;border-radius:12px;background:white}h1{font-size:22px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:10px;font:inherit;border:1px solid #bbb;border-radius:6px}button{background:#262626;color:white}</style><form method="post" action="/auth/login' +
      (library ? '?library=1' : '') +
      '"><h1>登录私人工作区</h1><label>管理员密码<input type="password" name="password" autocomplete="current-password" required autofocus></label><p role="alert">' +
      message +
      '</p><button>登录</button></form></html>',
    { status, headers: pageHeaders },
  );
}
function redirect(location, token, seconds) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Set-Cookie':
        cookie + '=' + token + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + seconds,
    },
  });
}
export async function passwordGate(request, env) {
  const url = new URL(request.url);
  const error = (status, message) =>
    Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (url.protocol !== 'https:' || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 20 || !env.DB)
    return error(503, '密码登录尚未配置');
  const token = (request.headers.get('Cookie') || '')
    .split(/;\s*/)
    .find((v) => v.startsWith(cookie + '='))
    ?.slice(cookie.length + 1);
  const key = token && /^[a-f0-9]{64}$/.test(token) ? hex(await digest(token)) : null;
  const db = env.DB;
  if (url.pathname === '/auth/logout') {
    if (request.method === 'GET')
      return new Response(
        '<meta charset="utf-8"><form method="post"><button>确认退出登录</button></form>',
        { headers: pageHeaders },
      );
    if (request.method !== 'POST' || request.headers.get('Origin') !== url.origin)
      return error(403, '请求来源无效');
    if (key) await db.prepare('DELETE FROM password_sessions WHERE id=?').bind(key).run();
    return redirect('/', '', 0);
  }
  if (url.pathname === '/auth/login' && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return error(403, '请求来源无效');
    const length = Number(request.headers.get('Content-Length'));
    if (
      length > 2048 ||
      !request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')
    )
      return error(400, '无效的登录表单');
    const now = Date.now();
    const ip = hex(await digest(request.headers.get('CF-Connecting-IP') || 'local'));
    const window = Math.floor(now / 900000);
    const attempt = await db
      .prepare(
        'INSERT INTO password_attempts(ip,window,count) VALUES(?,?,1) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window RETURNING count',
      )
      .bind(ip, window)
      .first();
    const library = url.searchParams.get('library') === '1';
    if (attempt.count > 10) return loginPage(429, '登录尝试过多，请稍后再试。', library);
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
    const password =
      new URLSearchParams(new TextDecoder().decode(buffer.subarray(0, offset))).get('password') ||
      '';
    const [left, right] = await Promise.all([digest(password), digest(env.ADMIN_PASSWORD)]);
    if (!crypto.subtle.timingSafeEqual(left, right)) return loginPage(401, '密码不正确。', library);
    const session = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.batch([
      db.prepare('DELETE FROM password_attempts WHERE window<?').bind(window),
      db.prepare('DELETE FROM password_sessions WHERE expires<=?').bind(now),
      db
        .prepare('INSERT INTO password_sessions(id,expires) VALUES(?,?)')
        .bind(hex(await digest(session)), now + age * 1000),
    ]);
    return redirect(library ? '/library/' : '/', session, age);
  }
  if (
    key &&
    (await db
      .prepare('SELECT 1 FROM password_sessions WHERE id=? AND expires>?')
      .bind(key, Date.now())
      .first())
  )
    return null;
  if (
    request.method === 'GET' &&
    !url.pathname.startsWith('/api/') &&
    request.headers.get('Accept')?.includes('text/html')
  )
    return loginPage(200, '', url.pathname === '/library/');
  return error(401, '请使用管理员密码登录');
}
