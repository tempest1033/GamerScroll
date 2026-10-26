'use strict';

/**
 * Local preview of the revenue estimate section on five sample game pages (one per market). Not part of the build.
 *   node scripts/preview-service-revenue.js fixture <dir>   synthetic bundle (tests/fixtures/service-exports.js) from the samples' real chart ranks
 *   node scripts/preview-service-revenue.js shots <dir> [n] render the (first n) samples with the Workers bundle and screenshot #revenue-estimates
 *                                                            at 1440×900 and 390×844 → <dir>/<market>_<slug>_{desktop,mobile}.png
 * Pipeline: fixture (skip with the real bundle) → SERVICE_EXPORTS_DIR=<bundle> node generate-html-report.js --quick
 *   → SERVICE_EXPORTS_DIR=<bundle> node scripts/generate-game-pages.js → node scripts/build-game-ssr.js → shots.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const EDITION = { kr: 'ko', jp: 'ja', us: 'en', tw: 'zh-tw', cn: 'zh-cn' };
// One page per market (the edition of that market renders it), the forecast repo's sample games, plus a launch-cohort
// example. Fixture-only fields (fixture mode): subgenre, release date, download figures, hidden tiers, download estimate tier per store.
const SAMPLES = [
  { market: 'kr', slug: '운빨존많겜', subgenre: 'Strategy', release_date: '2024-05-26', play: 1e7, ratings: { kr: 79865, jp: 5665, us: 12279, tw: 20173 }, downloads: { ios: 'assumption', android: 'verified' } },
  { market: 'jp', slug: '명조워더링-웨이브', subgenre: 'Action', release_date: '2024-05-22', play: 1e7, ratings: { jp: 41000, kr: 9100 } },
  { market: 'us', slug: 'monopoly-go-모노폴리-go', subgenre: 'Casual', release_date: '2023-04-11', play: 1e8, ratings: { us: 3900000, jp: 12000, kr: 4100, tw: 2300 }, hidden: { tw: 'android' } },
  { market: 'tw', slug: 'wos-화이트아웃-서바이벌', subgenre: 'Strategy', release_date: '2023-02-01', play: 1e8, ratings: { tw: 21000, kr: 18000 }, downloads: { android: 'unverified' } },
  { market: 'cn', slug: '王者荣耀', subgenre: 'Action', release_date: '2015-11-26', ratings: { cn: 15107196 } },
  { market: 'kr', slug: '명일방주-엔드필드', subgenre: 'Role Playing', release_date: '2026-09-20', play: 1e6, ratings: { kr: 3000 }, launch_cohort: true },
  // new release (< 7 days since revenue_from in the real bundle): badges, pre-release days, withheld totals
  { market: 'kr', slug: '탕탕에이스', subgenre: 'Action', release_date: '2026-10-23', play: 1e5, launch_cohort: true },
];

function fixture(dir) {
  const { loadRankStats } = require('../src/rank/stats');
  const { idFor } = require('../src/build/game-data');
  const { writeFixture, DAYS } = require('../tests/fixtures/service-exports');
  const S = loadRankStats();
  const asof = S.days[S.days.length - 1].date;
  const records = new Map(); // store:id → fixture game
  for (const sample of SAMPLES) {
    const g = S.games.find((x) => x.slug === sample.slug);
    if (!g) throw new Error(`sample game not found: ${sample.slug}`);
    for (const market of Object.keys(S.COUNTRIES)) {
      for (const store of ['ios', 'android']) {
        const id = idFor(g.appIds || {}, store, market);
        const ranks = id ? S.seriesOf(market, store, id).slice(-DAYS) : [];
        if (!ranks.some((r) => r != null)) continue;
        const key = `${store}:${id}`;
        if (!records.has(key)) records.set(key, { store, app_id: id, title: g.key, developer: g.developer || '', subgenre: sample.subgenre, launch_cohort: sample.launch_cohort, release_date: sample.release_date, markets: {}, play_bucket_min: sample.play ?? null, ios_ratings: sample.ratings });
        records.get(key).markets[market] = { ranks, ...(sample.hidden && sample.hidden[market] === store ? { tier: 'hidden' } : {}), ...(sample.downloads && sample.downloads[store] ? { downloads: sample.downloads[store] } : {}) };
      }
    }
  }
  writeFixture(dir, { asof, games: [...records.values()] });
  console.log(`fixture bundle asof ${asof}: ${records.size} store records → ${dir}`);
}

function serve(root) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function shots(outDir, count = SAMPLES.length) {
  const { createRenderer } = await import(`file:///${path.join(ROOT, 'functions', '_lib', 'game-ssr.js').replace(/\\/g, '/')}`);
  const meta = JSON.parse(fs.readFileSync(path.join(DOCS, 'games-data', '_meta.json'), 'utf8'));
  const previewDir = path.join(DOCS, '_rv-preview');
  fs.mkdirSync(previewDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const pages = [];
  // PREVIEW_PAGES="kr:slug,us:slug" overrides the sample list (shots of other real pages).
  const list = process.env.PREVIEW_PAGES ? process.env.PREVIEW_PAGES.split(',').map((x) => { const [market, ...rest] = x.split(':'); return { market, slug: rest.join(':') }; }) : SAMPLES.slice(0, count);
  for (const s of list) {
    const file = path.join(DOCS, 'games-data', `${s.slug}.json`);
    if (!fs.existsSync(file)) { console.warn(`no games-data for ${s.slug}`); continue; }
    const renderer = createRenderer(EDITION[s.market]);
    const game = renderer.parse(fs.readFileSync(file, 'utf8'));
    const html = renderer.render(game, meta);
    const name = `${s.market}_${s.slug}`;
    fs.writeFileSync(path.join(previewDir, `${name}.html`), html);
    pages.push({ name, hasSection: html.includes('id="revenue-estimates"'), bytes: Buffer.byteLength(html), dataBytes: Buffer.byteLength(JSON.stringify(game.revenue || null)) });
  }
  const server = await serve(DOCS);
  const base = `http://127.0.0.1:${server.address().port}`;
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  const report = [];
  try {
    for (const [kind, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.setRequestInterception(true);
      page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      // Layout shifts (CLS sum) while the browser half fills the section.
      await page.evaluateOnNewDocument(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
      for (const p of pages) {
        errors.length = 0;
        await page.goto(`${base}/_rv-preview/${encodeURIComponent(p.name)}.html`, { waitUntil: 'networkidle0' });
        // Charts and tables come from the browser half (src/build/revenue-client.js) once the section nears the viewport.
        await page.evaluate(() => { const s = document.getElementById('revenue-estimates'); if (s) s.scrollIntoView(); });
        const filled = await page.waitForFunction(() => !document.querySelector('#revenue-estimates [data-rv]'), { timeout: 15000 }).then(() => true, () => false);
        const drawn = await page.evaluate(() => ({ plots: document.querySelectorAll('#revenue-estimates .rv-plot svg').length, cls: Math.round(window.__cls * 1000) / 1000 }));
        const section = await page.$('#revenue-estimates');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const file = path.join(outDir, `${p.name}_${kind}.png`);
        if (section) {
          // The site header is fixed: grow the viewport to the page height so it stays above the section in the capture.
          await page.setViewport({ ...viewport, height: await page.evaluate(() => document.documentElement.scrollHeight) });
          await section.screenshot({ path: file });
          await page.setViewport(viewport);
        }
        report.push({ page: p.name, kind, section: Boolean(section), filled, plots: drawn.plots, cls: drawn.cls, errors: errors.join(' | '), overflowPx: overflow, file: section ? file : null, htmlKB: Math.round(p.bytes / 1024), revenueJsonKB: Math.round(p.dataBytes / 1024) });
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.table(report);
}

const [mode, dir, count] = process.argv.slice(2);
if (mode === 'fixture' && dir) fixture(path.resolve(dir));
else if (mode === 'shots' && dir) shots(path.resolve(dir), count ? Number(count) : undefined).catch((e) => { console.error(e); process.exit(1); });
else { console.error('usage: node scripts/preview-service-revenue.js fixture <dir> | shots <dir> [first n samples]'); process.exit(1); }
