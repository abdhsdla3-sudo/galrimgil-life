import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const text = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
const binary = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const assets = {};
const images = [];
for (const folder of ['public', 'game']) {
  // 하위 폴더(game/harbor, public/assets/...)까지 포함
  for (const entry of await readdir(join(root, folder), { recursive: true })) {
    const file = String(entry).replace(/\\/g, '/');
    const ext = extname(file);
    const url = folder === 'public' ? '/' + file : '/game/' + file;
    if (binary[ext]) {
      assets[url] = [binary[ext], (await readFile(join(root, folder, file))).toString('base64'), 'base64'];
      if (url.startsWith('/assets/')) images.push(url);
      continue;
    }
    if (!text[ext]) continue;
    let source = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(root, folder, file)));
    if (file === 'index.html') source = source.replace('<head>', '<head>\n  <meta name="room-sync" content="poll">');
    assets[url] = [text[ext] + '; charset=utf-8', source];
  }
}
// 화면은 이 목록에 있는 이미지만 불러온다(없으면 대체 그림).
assets['/assets/manifest.json'] = ['application/json; charset=utf-8', JSON.stringify({ files: images.sort() })];

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
console.log(`Sites 빌드 완료: 파일 ${Object.keys(assets).length}개 (이미지 ${images.length}개)`);
