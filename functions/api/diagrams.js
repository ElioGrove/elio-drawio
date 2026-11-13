import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SaxesParser } from 'saxes';

const maxSize = 10 * 1024 * 1024;
const prefix = 'diagrams/';
const idPattern = /^[0-9a-f-]{36}$/;
const keySets = new Map();

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(value, status = 200, extra = {}) {
  return Response.json(value, { status, headers: { ...headers, ...extra } });
}

function failure(message, status) {
  return json({ error: message }, status);
}

async function authorized(request, env) {
  const issuer = env.ACCESS_ISSUER;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!issuer || !env.ACCESS_AUD || !env.ACCESS_EMAIL || !token) return false;
  try {
    if (!keySets.has(issuer)) {
      keySets.set(issuer, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)));
    }
    const { payload } = await jwtVerify(token, keySets.get(issuer), {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'email']
    });
    return payload.email.toLowerCase() === env.ACCESS_EMAIL.toLowerCase();
  } catch {
    return false;
  }
}

async function readDiagram(request) {
  if (!request.body || Number(request.headers.get('Content-Length')) > maxSize) {
    return { error: failure('文件不能为空或超过 10 MiB。', 413) };
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxSize) {
      await reader.cancel();
      return { error: failure('文件超过 10 MiB。', 413) };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parser = new SaxesParser();
    let root;
    parser.on('opentag', tag => { root ??= tag.name; });
    parser.on('doctype', () => { throw new Error('DOCTYPE'); });
    parser.write(xml).close();
    if (!['mxfile', 'mxGraphModel'].includes(root)) throw new Error('Invalid diagram root');
    return { bytes };
  } catch {
    return { error: failure('请上传有效的 .drawio 或 draw.io XML 文件。', 400) };
  }
}

function describe(object, id) {
  return { id, name: object.customMetadata?.name || '未命名绘图',
    updated: object.uploaded.toISOString(), size: object.size, etag: object.httpEtag };
}

function xmlResponse(object) {
  return new Response(object.body, {
    headers: { ...headers, ETag: object.httpEtag, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function diagrams(request, bucket, url) {
  const method = request.method;
  const id = url.searchParams.get('id');
  const key = prefix + id;
  if (id !== null && !idPattern.test(id)) return failure('无效的流程图编号。', 400);

  if (method === 'GET' && id === null) {
    const list = await bucket.list({
      prefix, limit: 200, include: ['customMetadata'],
      cursor: url.searchParams.get('cursor') || undefined
    });
    return json({
      files: list.objects.map(object => describe(object, object.key.slice(prefix.length))),
      next: list.truncated ? list.cursor : null
    });
  }

  if (method === 'GET') {
    const object = await bucket.get(key);
    return object ? xmlResponse(object) : failure('流程图不存在。', 404);
  }

  if (method === 'POST' && id === null) {
    const name = url.searchParams.get('name')?.trim().replace(/\.drawio$/i, '');
    if (!name || name.length > 180 || /[\x00-\x1f]/.test(name)) {
      return failure('请输入有效的文件名。', 400);
    }
    const { bytes, error } = await readDiagram(request);
    if (error) return error;
    const newId = crypto.randomUUID();
    const object = await bucket.put(prefix + newId, bytes, { customMetadata: { name } });
    return json(describe(object, newId), 201, { ETag: object.httpEtag });
  }

  if (method === 'PUT' && id !== null) {
    const etag = request.headers.get('If-Match');
    if (!etag || !/^"[a-f0-9]{32}"$/.test(etag)) return failure('缺少当前版本。', 428);
    const { bytes, error } = await readDiagram(request);
    if (error) return error;
    const object = await bucket.put(key, bytes, {
      onlyIf: { etagMatches: etag.slice(1, -1) },
      // R2 replaces metadata on put, so the caller uses the stored display name.
      customMetadata: { name: url.searchParams.get('name')?.slice(0, 180) || '未命名绘图' }
    });
    if (!object) return failure('云端已有新版本。请先下载本次修改，再重新打开云端版本。', 412);
    return json(describe(object, id), 200, { ETag: object.httpEtag });
  }

  return failure('不支持此操作。', 405);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  // The browser UI and its file API share the protected hostname.
  if (!env.ACCESS_HOST || url.hostname !== env.ACCESS_HOST) return failure('入口不可用。', 404);
  if (!await authorized(request, env)) return failure('请使用授权邮箱登录。', 401);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return failure('请求来源无效。', 403);
  }
  if (!env.DRAWIO_FILES) return failure('云端存储尚未绑定。', 503);
  try {
    return await diagrams(request, env.DRAWIO_FILES, url);
  } catch {
    return failure('云端存储暂时不可用，请重试。', 503);
  }
}
