import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPublicPath, assertPublicContent, checkStatic } from './static-policy.mjs';

test('rejects server directories, credentials, functions and executable server files', () => {
  for (const path of ['WEB-INF/web.xml', 'nested/meta-inf/file', '.env.production', 'js/client_secret.json', 'google_client_id', 'secrets.json', 'server.jar', 'functions/api.js', '_worker.js', 'a/private.pem']) {
    assert.throws(() => assertPublicPath(path), /Forbidden/);
  }
  // Diagram shapes named after security products are public graphics.
  assert.doesNotThrow(() => assertPublicPath('img/lib/sap/SAP_Credential_Store.svg'));
});

test('rejects secrets without echoing their values', () => {
  const value = 'fixture-value-not-a-real-secret';
  for (const text of [`{"client_secret":"${value}"}`, `oauthSecret = '${value}'`, '-----BEGIN RSA PRIVATE KEY-----']) {
    assert.throws(() => assertPublicContent('config.json', text), error => error.message === 'Potential credential in: config.json');
  }
  assert.doesNotThrow(() => assertPublicContent('app.js', 'client_secret = null; access_token = response.token;'));
});

test('rejects symlinks even when their filenames look public', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elio-static-test-'));
  try {
    await symlink('/etc/hosts', join(dir, 'image.svg'));
    await assert.rejects(checkStatic(dir), /Symbolic link/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('checks nested content and Pages file size limits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elio-static-test-'));
  try {
    await mkdir(join(dir, 'js'));
    await writeFile(join(dir, 'js/test.js'), 'client_secret = "fixture-value-not-a-real-secret"');
    await assert.rejects(checkStatic(dir), /Potential credential/);
    await writeFile(join(dir, 'js/test.js'), Buffer.alloc(25 * 1024 * 1024 + 1));
    await assert.rejects(checkStatic(dir), /exceeds 25 MiB/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
