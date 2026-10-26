'use strict';

/**
 * Bundles the game page renderer (src/build/game-ssr-entry.js → game.js, layout, i18n incl. game messages) for the
 * Cloudflare Workers runtime: functions/_lib/game-ssr.js (ES module, no fs/path/postcss/cheerio).
 *   - header.js reads the logo SVG with fs at load time → the file content is inlined at build time
 *   - css-links.js (fs + postcss + cheerio per-page CSS inlining) → css-links-lite.js
 *   - process.env.ADS_ENABLED → build-time constant
 * Output: export const BUNDLE_VERSION; export function createRenderer(editionCode) → { render(game, meta), parse(text) }
 * Also the browser half of the revenue section per edition (src/build/revenue-client.js → docs/assets/[<code>/]revenue-section.js,
 * carrying only the edition's section messages); its version is a build-time constant of the renderer (asset URL).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'functions', '_lib', 'game-ssr.js');
const FS_READ_RE = /require\('node:fs'\)\.readFileSync\(require\('node:path'\)\.join\(__dirname, '([^']+)'\), 'utf8'\)/;

const workerPlugin = {
  name: 'worker-safe',
  setup(build) {
    build.onResolve({ filter: /(^|[\\/])css-links$/ }, () => ({ path: path.join(ROOT, 'src', 'build', 'css-links-lite.js') }));
    build.onLoad({ filter: /components[\\/]header\.js$/ }, (args) => {
      const source = fs.readFileSync(args.path, 'utf8');
      const match = FS_READ_RE.exec(source);
      if (!match) throw new Error('header.js: logo fs read not found — update scripts/build-game-ssr.js');
      const svg = fs.readFileSync(path.resolve(path.dirname(args.path), match[1]), 'utf8');
      return { contents: source.replace(FS_READ_RE, () => JSON.stringify(svg)), loader: 'js', resolveDir: path.dirname(args.path) };
    });
  },
};

const EDITION_CODES = ['en', 'ja', 'zh-cn', 'ko', 'zh-tw'];
// Messages the revenue section renders with (rev.*, store / market names, rank numbers).
const CLIENT_KEY_RE = /^(?:rev\.|stats\.|rank\.rank_number$)/;
async function buildRevenueClient(code) {
  const messagesPlugin = {
    name: 'edition-messages',
    setup(build) {
      // Every edition's message files are reachable from i18n's dictionary loader: keep this edition's section keys only.
      build.onLoad({ filter: /[\\/]i18n[\\/]messages[\\/](?:game[\\/])?[\w-]+\.js$/ }, (args) => {
        const all = path.basename(args.path, '.js') === code ? require(args.path) : {};
        const own = Object.fromEntries(Object.entries(all).filter(([key]) => CLIENT_KEY_RE.test(key)));
        return { contents: `module.exports = ${JSON.stringify(own)};`, loader: 'js' };
      });
    },
  };
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'build', 'revenue-client.js')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2017',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.RV_EDITION': JSON.stringify(code), 'process.env.RV_CLIENT_VERSION': '""' },
    plugins: [messagesPlugin],
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

(async () => {
  const clients = await Promise.all(EDITION_CODES.map(buildRevenueClient));
  const clientVersion = crypto.createHash('md5').update(clients.join('\n')).digest('hex').slice(0, 10);
  EDITION_CODES.forEach((code, i) => {
    const file = path.join(ROOT, 'docs', 'assets', code === 'en' ? '' : code, 'revenue-section.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, clients[i], 'utf8');
  });
  console.log(`revenue-section client ${clientVersion}: ${clients.map((c, i) => `${EDITION_CODES[i]} ${(c.length / 1024).toFixed(0)} KB`).join(', ')} → docs/assets/[<code>/]revenue-section.js`);
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'build', 'game-ssr-entry.js')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__gameSsr',
    platform: 'neutral',
    mainFields: ['main'],
    target: 'es2022',
    external: ['esbuild'], // layout.js: optional runtime-bundle minifier inside try/catch, never reached while rendering pages
    define: { 'process.env.ADS_ENABLED': JSON.stringify(process.env.ADS_ENABLED || 'true'), 'process.env.RV_CLIENT_VERSION': JSON.stringify(clientVersion) },
    plugins: [workerPlugin],
    logLevel: 'warning',
  });
  const code = result.outputFiles[0].text;
  const version = crypto.createHash('md5').update(code).digest('hex').slice(0, 10);
  // Warm-up sample for functions/_lib/game-route.js (rendered once per isolate at startup): the largest game file walks the most template code.
  const dataDir = path.join(ROOT, 'docs', 'games-data');
  const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  const sample = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => ({ f, size: fs.statSync(path.join(dataDir, f)).size })).sort((a, b) => b.size - a.size)[0].f;
  // Without the revenue / download estimates: per-game service data stays in docs/games-data only (not in the Worker).
  const { revenue: _revenue, rvz: _rvz, rvb: _rvb, ...game } = readJson(sample);
  const warmup = { game, meta: readJson('_meta.json') };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `// Generated by scripts/build-game-ssr.js — do not edit.\nexport const BUNDLE_VERSION = '${version}';\nexport const WARMUP = ${JSON.stringify(warmup)};\nexport function createRenderer(editionCode) {\n${code}\nreturn __gameSsr(editionCode);\n}\n`, 'utf8');
  console.log(`game-ssr bundle ${version}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB → ${path.relative(ROOT, OUT)}`);
})().catch((error) => { console.error(error); process.exit(1); });
