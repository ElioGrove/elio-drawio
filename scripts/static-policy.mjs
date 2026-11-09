import { readdir, lstat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Fail closed: these paths must never become downloadable static assets.
export function assertPublicPath(path) {
  const parts = path.replaceAll('\\', '/').split('/');
  if (parts.some(p => /^(?:WEB-INF|META-INF|node_modules|functions|\.git|\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/i.test(p)) ||
      parts.some(p => /(?:client[_-]?(?:secret|id))(?:[._-]|$)/i.test(p) || /^(?:credentials?|secrets?)(?:[._-]|$)/i.test(p)) ||
      /\.(?:jar|war|class|java|jsp|jspx|pem|key|p12|pfx|toml|ya?ml|map)$/i.test(path) ||
      parts.some(p => /^_worker\.js$/i.test(p))) {
    throw new Error(`Forbidden public path: ${path}`);
  }
}

export function assertPublicContent(path, text) {
  const rules = [
    /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[0-9A-Z]{16})\b/,
    // Detect nonempty OAuth secret assignments, including JSON and minified JS.
    /["']?(?:client[_-]?secret|oauth[_-]?secret|refresh[_-]?token|access[_-]?token)["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/i
  ];
  if (rules.some(rule => rule.test(text))) throw new Error(`Potential credential in: ${path}`);
}

export async function checkStatic(root) {
  let files = 0, bytes = 0, largest = { path: '', bytes: 0 };
  async function walk(dir) {
    for (const name of await readdir(dir)) {
      const full = join(dir, name), path = relative(root, full).replaceAll('\\', '/');
      assertPublicPath(path);
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic link in output: ${path}`);
      if (stat.isDirectory()) { await walk(full); continue; }
      if (!stat.isFile()) throw new Error(`Unsupported asset: ${path}`);
      if (stat.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds 25 MiB: ${path}`);
      assertPublicContent(path, await readFile(full, 'utf8'));
      files++; bytes += stat.size;
      if (stat.size > largest.bytes) largest = { path, bytes: stat.size };
    }
  }
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Output must be a real directory');
  await walk(root);
  if (files > 20_000) throw new Error('Output exceeds Pages Free file limit');
  for (const required of ['index.html', '404.html', '_headers', 'js/app.min.js', 'js/PreConfig.js', 'js/PostConfig.js', 'LICENSE']) {
    if (!(await lstat(join(root, required))).isFile()) throw new Error(`Missing entry: ${required}`);
  }
  return { files, bytes, largest };
}
