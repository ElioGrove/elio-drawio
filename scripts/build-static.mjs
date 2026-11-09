import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assertPublicPath, checkStatic } from './static-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'src/main/webapp');
const staging = join(root, '.static-build');
const output = join(root, 'dist');
const directories = ['images', 'img', 'styles', 'resources', 'mxgraph', 'shapes', 'stencils', 'templates', 'math4'];
const jsDirectories = ['cryptojs', 'deflate', 'elk', 'freehand', 'gliffy', 'jszip', 'libavoid-js', 'mermaid', 'orgchart', 'plantuml', 'rough', 'sanitizer', 'spin', 'vsd'];
const files = ['index.html', 'clear.html', 'open.html', 'vsdxImporter.html', 'shortcuts.svg', 'export-fonts.css',
  ...['bootstrap.js', 'main.js', 'app.min.js', 'extensions.min.js', 'orgchart.min.js', 'shapes-14-6-5.min.js', 'stencils.min.js', 'viewer.min.js', 'viewer-static.min.js', 'clear.js', 'open.js', 'math-print.js', 'vsdxImporter.js'].map(f => `js/${f}`)];

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
try {
  for (const path of [...directories, ...jsDirectories.map(d => `js/${d}`), ...files]) {
    await cp(join(source, path), join(staging, path), {
      recursive: true, dereference: false,
      filter: (from) => {
        const path = from.slice(source.length + 1);
        // Source maps are optional debugging artifacts, never published.
        if (path.endsWith('.map')) return false;
        assertPublicPath(path);
        return true;
      }
    });
  }
  await cp(join(root, 'LICENSE'), join(staging, 'LICENSE'));
  await writeFile(join(staging, 'THIRD-PARTY-NOTICES.md'),
    '# Elio Draw\n\nBased on draw.io, licensed under Apache 2.0. Elio Draw is an independent deployment.\n\n' +
    await readFile(join(root, 'README.md'), 'utf8'));
  await cp(join(root, 'deploy/static'), staging, { recursive: true });
  let html = await readFile(join(staging, 'index.html'), 'utf8');
  html = html.replace(/<title>.*?<\/title>/, '<title>Elio Draw</title>')
    .replace(/<meta itemprop="image"[^>]*>/, '')
    .replace(/<meta name="msapplication-config"[^>]*>/, '')
    .replace(/<link rel="apple-touch-icon"[^>]*>/, '')
    .replace('href="https://app.diagrams.net"', 'href="https://draw.thus.chat/"')
    .replaceAll('href="favicon.ico"', 'href="favicon.svg"')
    .replace(/<svg class="geSplashLogo"[\s\S]*?<\/svg>/, '<img class="geSplashLogo" src="favicon.svg" alt="Elio Draw">');
  await writeFile(join(staging, 'index.html'), html);
  const bootstrapPath = join(staging, 'js/bootstrap.js');
  const bootstrap = await readFile(bootstrapPath, 'utf8');
  const marker = '// Global variable for desktop';
  if (!bootstrap.includes(marker)) throw new Error('Upstream bootstrap changed; review standalone parameter enforcement');
  await writeFile(bootstrapPath, bootstrap.replace(marker,
    "// Standalone deployments do not publish development sources or integration plugins.\n" +
    "urlParams['dev'] = '0'; urlParams['test'] = '0'; urlParams['plugins'] = '0'; delete urlParams.configure;\n\n" + marker));
  const result = await checkStatic(staging);
  // Only replace the previous output after the new output passes validation.
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  // Do not leave an old deployment available after a failed security check.
  await rm(output, { recursive: true, force: true });
  throw error;
}
