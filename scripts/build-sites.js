import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
const assets = {};
for (const folder of ['public', 'game']) {
  for (const file of await readdir(join(root, folder))) {
    const type = mime[extname(file)];
    if (!type) continue;
    let source = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(root, folder, file)));
    if (file === 'index.html') source = source.replace('<head>', '<head>\n  <meta name="room-sync" content="poll">');
    const url = folder === 'public' ? '/' + file : '/game/' + file;
    assets[url] = [type + '; charset=utf-8', source];
  }
}

await build({
  absWorkingDir: root,
  entryPoints: ['server/sites-worker.js'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['node:*'],
  plugins: [{
    name: 'sites-assets',
    setup(plugin) {
      plugin.onResolve({ filter: /^sites-assets$/ }, () => ({ path: 'sites-assets', namespace: 'game' }));
      plugin.onLoad({ filter: /.*/, namespace: 'game' }, () => ({ contents: 'export default ' + JSON.stringify(assets), loader: 'js' }));
    },
  }],
});

const hosting = JSON.parse(await readFile(join(root, '.openai/hosting.json'), 'utf8'));
await mkdir(join(root, 'dist/.openai'), { recursive: true });
await writeFile(join(root, 'dist/.openai/hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
await writeFile(join(root, 'dist/server/wrangler.json'), JSON.stringify({
  name: 'galrimgil-life',
  main: 'index.js',
  compatibility_date: '2026-11-18',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [{ binding: hosting.d1, database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }],
}, null, 2) + '\n');
