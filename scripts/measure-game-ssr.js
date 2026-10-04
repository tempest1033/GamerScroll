'use strict';

/**
 * Measures the request-time game page render against the Cloudflare Workers Free limits
 * (10 ms CPU per request, 3 MB compressed bundle).
 *   node scripts/measure-game-ssr.js [sampleSize=200]
 * Needs docs/games-data (node scripts/generate-game-pages.js) and functions/_lib/game-ssr.js (node scripts/build-game-ssr.js).
 * The Node timings are an upper-bound proxy: workerd runs the same V8, but the per-request CPU there excludes I/O waits.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const dataDir = path.join(ROOT, 'docs', 'games-data');
const sampleSize = Number(process.argv[2] || 200);
const stat = (values, q) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];
const fmt = (ms) => `${ms.toFixed(2)} ms`;

(async () => {
  const { createRenderer } = await import(path.join(ROOT, 'functions', '_lib', 'game-ssr.js').replace(/^/, 'file:///').replace(/\\/g, '/'));
  const meta = JSON.parse(fs.readFileSync(path.join(dataDir, '_meta.json'), 'utf8'));
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  // Evenly spread over the sorted slugs, plus the heaviest files (long chart history) so p95 is not flattered.
  const bySize = files.map((f) => ({ f, size: fs.statSync(path.join(dataDir, f)).size })).sort((a, b) => b.size - a.size);
  const sample = new Set(bySize.slice(0, Math.floor(sampleSize / 10)).map((x) => x.f));
  for (let i = 0; sample.size < sampleSize; i++) sample.add(files[Math.floor((i * files.length) / sampleSize)]);

  for (const code of ['en', 'ko']) {
    const coldStart = performance.now();
    const renderer = createRenderer(code);
    const cold = performance.now() - coldStart;
    const texts = [...sample].map((f) => fs.readFileSync(path.join(dataDir, f), 'utf8'));
    renderer.render(JSON.parse(texts[0]), meta); // warm-up (JIT)
    const parse = [], render = [], total = [];
    let bytes = 0;
    for (const text of texts) {
      const t0 = performance.now();
      const game = JSON.parse(text);
      const t1 = performance.now();
      const html = renderer.render(game, meta);
      const t2 = performance.now();
      parse.push(t1 - t0); render.push(t2 - t1); total.push(t2 - t0); bytes += html.length;
    }
    console.log(`[${code}] ${texts.length} games, instance creation ${fmt(cold)}, avg html ${(bytes / texts.length / 1024).toFixed(0)} KB`);
    console.log(`  render        median ${fmt(stat(render, .5))}  p95 ${fmt(stat(render, .95))}  max ${fmt(Math.max(...render))}`);
    console.log(`  parse+render  median ${fmt(stat(total, .5))}  p95 ${fmt(stat(total, .95))}  (JSON.parse median ${fmt(stat(parse, .5))})`);
  }

  const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
  const bundle = fs.readFileSync(path.join(ROOT, 'functions', '_lib', 'game-ssr.js'));
  console.log(`game-ssr.js: ${(bundle.length / 1024).toFixed(0)} KB raw, ${(gz(bundle) / 1024).toFixed(0)} KB gzip (limit 3072 KB compressed)`);
  try {
    const out = path.join(os.tmpdir(), `gs-worker-${process.pid}.js`);
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'functions', 'build', path.join(ROOT, 'functions'), '--outfile', out], { cwd: ROOT, stdio: 'pipe' });
    const worker = fs.readFileSync(out);
    console.log(`Pages Functions worker bundle (all routes + middleware): ${(worker.length / 1024).toFixed(0)} KB raw, ${(gz(worker) / 1024).toFixed(0)} KB gzip`);
    fs.rmSync(out, { force: true });
  } catch (error) {
    console.log(`wrangler pages functions build unavailable: ${String(error.message).split('\n')[0]}`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
