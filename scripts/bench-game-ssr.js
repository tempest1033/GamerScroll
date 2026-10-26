'use strict';

/**
 * Request-time CPU of the game page SSR (functions/_lib/game-route.js: parse of docs/games-data/<slug>.json + render).
 *   node scripts/bench-game-ssr.js [--renderer functions/_lib/game-ssr.js] [--strip-revenue] [--runs 100] [--warmup 10] [slug ...]
 * Default pages: the three largest game files with revenue data and the median-size one. Per page and edition: `warmup`
 * renders, then `runs` timed requests. Prints p50/p99/max (ms) of parse+render per page over all editions, and of the
 * render alone. --strip-revenue drops `revenue` from the game data first (the pre-revenue page cost).
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'docs', 'games-data');
const EDITIONS = ['ko', 'en', 'ja', 'zh-cn', 'zh-tw'];

function args(argv) {
  const out = { renderer: path.join(ROOT, 'functions', '_lib', 'game-ssr.js'), strip: false, runs: 100, warmup: 10, slugs: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--renderer') out.renderer = path.resolve(argv[++i]);
    else if (argv[i] === '--strip-revenue') out.strip = true;
    else if (argv[i] === '--runs') out.runs = Number(argv[++i]);
    else if (argv[i] === '--warmup') out.warmup = Number(argv[++i]);
    else out.slugs.push(argv[i]);
  }
  return out;
}

function defaultSlugs() {
  const withRevenue = fs.readdirSync(DATA).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => ({ slug: f.slice(0, -5), size: fs.statSync(path.join(DATA, f)).size }))
    .filter((x) => x.size > 4096 && fs.readFileSync(path.join(DATA, `${x.slug}.json`), 'utf8').includes('"revenue":'))
    .sort((a, b) => b.size - a.size);
  return [...withRevenue.slice(0, 3), withRevenue[Math.floor(withRevenue.length / 2)]].map((x) => x.slug);
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const stats = (xs) => { const s = xs.slice().sort((a, b) => a - b); return { p50: pct(s, 0.5), p99: pct(s, 0.99), max: s[s.length - 1] }; };
const fmt = (s) => `${s.p50.toFixed(1)}/${s.p99.toFixed(1)}/${s.max.toFixed(1)}`;

(async () => {
  const a = args(process.argv.slice(2));
  const { createRenderer } = await import(pathToFileURL(a.renderer).href);
  const meta = JSON.parse(fs.readFileSync(path.join(DATA, '_meta.json'), 'utf8'));
  const renderers = Object.fromEntries(EDITIONS.map((e) => [e, createRenderer(e)]));
  const slugs = a.slugs.length ? a.slugs : defaultSlugs();
  console.log(`renderer ${path.relative(ROOT, a.renderer)}${a.strip ? ' (revenue stripped)' : ''}; ms p50/p99/max over ${EDITIONS.length}×${a.runs} requests`);
  console.log('page | KB | parse+render | render | worst edition p99');
  for (const slug of slugs) {
    let text = fs.readFileSync(path.join(DATA, `${slug}.json`));
    if (a.strip) { const { revenue: _r, rvz: _z, rvb: _b, ...g } = JSON.parse(text.toString('utf8')); text = Buffer.from(JSON.stringify(g)); }
    const total = [], render = [], worst = {};
    for (const e of EDITIONS) {
      // As functions/_lib/game-route.js: the response bytes through the renderer's parse (decodes only the light half)
      // where the bundle has one, else decode + JSON.parse of the whole body.
      const parse = renderers[e].parse || ((b) => JSON.parse(new TextDecoder().decode(b)));
      for (let i = 0; i < a.warmup; i++) renderers[e].render(parse(text), meta);
      const mine = [];
      for (let i = 0; i < a.runs; i++) {
        const t0 = performance.now();
        const game = parse(text);
        const t1 = performance.now();
        renderers[e].render(game, meta);
        const t2 = performance.now();
        total.push(t2 - t0); render.push(t2 - t1); mine.push(t2 - t0);
      }
      worst[e] = stats(mine).p99;
    }
    const [we, wp] = Object.entries(worst).sort((x, y) => y[1] - x[1])[0];
    console.log(`${slug} | ${(Buffer.byteLength(text) / 1024).toFixed(0)} | ${fmt(stats(total))} | ${fmt(stats(render))} | ${we} ${wp.toFixed(1)}`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
