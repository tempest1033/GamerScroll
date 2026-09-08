'use strict';
// Build in a disposable, retained workspace; never rewrite live article data or either site's output.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sandbox = fs.mkdtempSync(path.join(root, 'mockups', 'aiscroll-isolation-build-'));
for (const relative of [
  'generate-ai-blog.js', 'ai-build-cache.js', 'package.json',
  'src/aiscroll-ui', 'src/aiscroll-styles', 'src/aiscroll-build',
  'src/templates/ai-blog', 'src/ai-blog', 'data', 'reports'
]) {
  fs.cpSync(path.join(root, relative), path.join(sandbox, relative), { recursive: true });
}
for (const directory of ['node_modules', 'docs']) {
  fs.symlinkSync(path.join(root, directory), path.join(sandbox, directory), 'junction');
}
fs.mkdirSync(path.join(sandbox, 'ai-docs'), { recursive: true });
for (const file of ['favicon.svg', 'manifest.json', 'ads.txt']) {
  const source = path.join(root, 'ai-docs', file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(sandbox, 'ai-docs', file));
}
const result = spawnSync(process.execPath, ['generate-ai-blog.js'], {
  cwd: sandbox, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  env: { ...process.env, GA4_SERVICE_ACCOUNT: '', CI: 'true' }
});
fs.writeFileSync(path.join(sandbox, 'build.log'), result.stdout + '\n' + result.stderr);
fs.writeFileSync(path.join(root, 'mockups/aiscroll-isolation-preview.json'),
  JSON.stringify({ sandbox, output: path.join(sandbox, 'ai-docs') }, null, 2));
console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
if (result.error || result.status !== 0 ||
    !fs.existsSync(path.join(sandbox, 'ai-docs/sitemap.xml')) ||
    !fs.existsSync(path.join(sandbox, 'ai-docs/styles-core.css'))) {
  throw result.error || new Error(`AIScroll sandbox build failed: ${sandbox}`);
}
console.log(`PASS isolated AI build: ${sandbox}`);
