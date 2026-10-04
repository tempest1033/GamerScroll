'use strict';

/**
 * Game detail pages rendered by the Pages Functions, against a real local Pages runtime:
 *   npx wrangler pages dev docs   (workerd; functions/ at the repo root, assets from docs/)
 * Covers en and ko with a Hangul slug, a CJK slug and an ASCII slug, an unknown slug (edition 404), the static hub and search index,
 * edition head (lang, canonical, hreflang, og:locale), Cache API hits and the host guard.
 * Needs: node generate-html-report.js --quick, node scripts/generate-game-pages.js, node scripts/build-game-ssr.js.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EDITIONS, absoluteUrl } = require('../src/i18n');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.WRANGLER_PORT || 8799);
const SLUGS = { hangul: '메이플-키우기', cjk: '三国杀', ascii: 'where-winds-meet' };
const UNKNOWN = 'no-such-game-slug-12345';

// Node's fetch cannot set Host; the functions only act on gamerscroll.com, so talk plain HTTP with that Host header.
function request(urlPath, { host = 'gamerscroll.com', method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method, headers: { Host: host, 'User-Agent': 'Googlebot/2.1' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

// A fresh local state per run: the Cache API entries would otherwise survive between runs.
const persistDir = path.join(require('node:os').tmpdir(), `gs-wrangler-${process.pid}`);

async function startWrangler() {
  const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'dev', 'docs', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persistDir], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (child.exitCode !== null) throw new Error(`wrangler exited early:\n${log}`);
    try { if ((await request('/games/')).status) return child; } catch { /* not listening yet */ }
  }
  child.kill();
  throw new Error(`wrangler did not start:\n${log}`);
}

const metaOf = (html, re) => (html.match(re) || [])[1];
const hreflangs = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);

(async () => {
  const child = await startWrangler();
  const failures = [];
  let count = 0;
  const check = async (label, fn) => { try { await fn(); count++; console.log(`ok - ${label}`); } catch (error) { failures.push(`${label}: ${error.message.split('\n')[0]}`); console.log(`FAIL - ${label}: ${error.message.split('\n')[0]}`); } };
  try {
    for (const code of ['en', 'ko']) {
      const edition = EDITIONS.find((e) => e.code === code);
      for (const [kind, slug] of Object.entries(SLUGS)) {
        const route = `${edition.prefix}/games/${encodeURIComponent(slug)}/`;
        await check(`[${code}] ${kind} slug ${route}`, async () => {
          const first = await request(route);
          assert.equal(first.status, 200, 'status');
          assert.match(first.headers['content-type'], /text\/html/);
          assert.match(first.headers['cache-control'], /s-maxage=\d+/, 'edge Cache-Control');
          assert.equal(first.headers['x-gs-cache'], 'MISS', 'first request renders');
          assert.equal(metaOf(first.body, /<html lang="([^"]+)"/), edition.htmlLang, 'html lang');
          assert.ok(first.body.includes(`<meta property="og:locale" content="${edition.ogLocale}">`), 'og:locale');
          assert.ok(/<h1 class="game-hero-title"[^>]*>[^<]+<\/h1>/.test(first.body), 'game title');
          if (code === 'en') {
            // Visible text without scripts/styles/comments, the game's own name and the edition selector's native labels.
            let visible = first.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '').replace(/<h1[\s\S]*?<\/h1>/, '').replace(/<title>[\s\S]*?<\/title>/, '').replace(/<(?:meta|img|link)\b[^>]*>/g, '');
            for (const e of EDITIONS) visible = visible.split(`>${e.label}<`).join('><');
            const text = visible.replace(/<[^>]*>/g, ' ');
            assert.deepEqual(text.match(/[^\s]*[\uAC00-\uD7A3][^\s]*/g) || [], [], 'no Hangul outside names (en)');
          }
          if (!/name="robots" content="noindex/.test(first.body)) {
            const pagePath = `/games/${encodeURIComponent(slug)}/`;
            assert.equal(metaOf(first.body, /<link rel="canonical" href="([^"]+)"/), absoluteUrl(code, pagePath), 'self canonical');
            assert.deepEqual(hreflangs(first.body), [...EDITIONS.map((e) => [e.hreflang, absoluteUrl(e.code, pagePath)]), ['x-default', absoluteUrl('en', pagePath)]], 'hreflang set');
          }
          const second = await request(route);
          assert.equal(second.status, 200);
          assert.equal(second.headers['x-gs-cache'], 'HIT', 'second request served from the Cache API');
          assert.equal(second.body, first.body, 'cached body identical');
        });
      }
      await check(`[${code}] unknown slug → edition 404`, async () => {
        const res = await request(`${edition.prefix}/games/${UNKNOWN}/`);
        assert.equal(res.status, 404);
        assert.equal(metaOf(res.body, /<html lang="([^"]+)"/), edition.htmlLang, '404 page of the edition');
      });
      await check(`[${code}] games hub stays static`, async () => {
        const res = await request(`${edition.prefix}/games/`);
        assert.equal(res.status, 200);
        assert.equal(metaOf(res.body, /<html lang="([^"]+)"/), edition.htmlLang);
      });
      await check(`[${code}] search index stays static`, async () => {
        const res = await request(`${edition.prefix}${code === 'en' ? '/games/search-index.en.json' : '/games/search-index.json'}`);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(JSON.parse(res.body).games));
      });
    }
    await check('lower-case percent-encoding decodes to the same Hangul slug', async () => {
      const res = await request(`/ko/games/${encodeURIComponent(SLUGS.hangul).toLowerCase()}/`);
      assert.equal(res.status, 200);
    });
    await check('no trailing slash', async () => assert.equal((await request(`/games/${SLUGS.ascii}`)).status, 200));
    await check('HEAD', async () => { const res = await request(`/games/${SLUGS.ascii}/`, { method: 'HEAD' }); assert.equal(res.status, 200); assert.equal(res.body, ''); });
    await check('other hosts fall through (AIScroll shares functions/)', async () => assert.equal((await request(`/games/${SLUGS.ascii}/`, { host: 'aiscroll.io' })).status, 404));
  } finally {
    child.kill();
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log(`game ssr ok: ${count} checks`);
})().catch((error) => { console.error(error); process.exit(1); });
