const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const { generateGamesHubPage } = require('../src/templates/pages/games-hub');
const { wrapWithLayout, buildLayoutCoreBundle, buildLayoutRuntimeBundle } = require('../src/templates/layout');
const { externalizeDeferredJsonFromHtml } = require('../src/build/utils');
const { buildServiceWorker } = require('../src/build/service-worker');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscroll-perf-test-'));
  const feed = path.join(output, 'feed');
  fs.mkdirSync(feed);
  const games = {
    '가나다': { slug: '가나다', icon: '/test-icon.png', developer: 'Test' },
    '거나다': { slug: '거나다', icon: '/test-icon.png', developer: 'Test' },
    '# special <game>': { slug: 'special', icon: '/test-icon.png', developer: 'Test' },
    'Alpha': { slug: 'alpha', icon: '/test-icon.png', developer: 'Test' }
  };
  const html = externalizeDeferredJsonFromHtml(generateGamesHubPage({
    games, popularGames: [{ slug: '가나다', views: 10 }], searchIndexVersion: 'test'
  }), 'games/index.html', feed);
  const assets = new Map();
  for (const name of ['core', 'game', 'catalog', 'article', 'report']) {
    const result = await esbuild.build({
      entryPoints: [path.join(root, `src/styles/bundle-${name}.css`)],
      bundle: true, write: false, logLevel: 'silent',
      external: ['*.woff2', '*.woff', '*.ttf', '*.svg', '*.png', '*.jpg', '*.webp']
    });
    assets.set(`/styles-${name}.css`, result.outputFiles[0].text);
  }
  assets.set('/assets/layout-core.js', buildLayoutCoreBundle());
  assets.set('/assets/layout-runtime.js', buildLayoutRuntimeBundle({ searchIndexVersion: 'test' }));
  assets.set('/service-worker.js', buildServiceWorker({ version: 'gamerscroll-perf-test', precache: [] }));
  const counts = new Map();
  const index = Object.entries(games).map(([name, data]) => ({ name, ...data }));
  let failIcons = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    counts.set(url.pathname, (counts.get(url.pathname) || 0) + 1);
    const send = (body, type) => { response.setHeader('Content-Type', type); response.end(body); };
    if (url.pathname === '/games/') return send(html, 'text/html');
    if (url.pathname === '/rankings/') return send(wrapWithLayout('<h1>순위 화면</h1>', { currentPage: 'rankings' }), 'text/html');
    if (url.pathname === '/games/search-index.json') return send(JSON.stringify(index), 'application/json');
    if (url.pathname.startsWith('/assets/feed/')) {
      if (failIcons) { response.statusCode = 503; return response.end(); }
      return send(fs.readFileSync(path.join(feed, path.basename(url.pathname))), 'application/json');
    }
    if (assets.has(url.pathname)) return send(assets.get(url.pathname), url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript');
    if (url.pathname.endsWith('.png') || url.pathname.endsWith('.svg')) {
      return send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=', 'base64'), 'image/png');
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const failures = [];
  try {
    for (const width of (process.env.PERF_PHASE === 'navigation' ? [] : [1440, 390])) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      const page = await context.newPage();
      try {
        const initialFeedCount = [...counts].filter(([url]) => url.startsWith('/assets/feed/')).reduce((n, [, count]) => n + count, 0);
        await page.goto(base + '/games/', { waitUntil: 'load' });
        assert.equal(await page.locator('.game-item').count(), index.length, 'All game links remain crawlable');
        assert.equal(await page.locator('.game-item img').count(), 0, 'Closed groups have no image nodes');
        assert.equal([...counts].filter(([url]) => url.startsWith('/assets/feed/')).reduce((n, [, count]) => n + count, 0), initialFeedCount);
        await page.locator('.index-link[href="#initial-#"]').click();
        await page.locator('[id="initial-#"] img').first().waitFor();
        assert.equal(await page.locator('[id="initial-#"] .game-name').textContent(), '# special <game>');
        await page.locator('.index-link[href="#initial-ㄱ"]').click();
        await page.locator('[id="initial-ㄱ"] img').first().waitFor();
        assert.equal(await page.locator('[id="initial-ㄱ"] img').count(), 2);
        assert.equal(await page.locator('[id="initial-A"] img').count(), 0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, 'No horizontal overflow');
        await page.goto(base + '/games/?q=Alpha', { waitUntil: 'load' });
        await page.locator('#search-results-grid .games-hub-recent-card').waitFor();
        assert.equal(await page.locator('#search-results-title').textContent(), '"Alpha" 검색 결과 (1개)');
        console.log(`PASS ${width}px catalog links, lazy icons, hash navigation, search and layout`);
      } catch (error) {
        failures.push(`${width}px: ${error.stack}`);
      } finally { await context.close(); }
    }
    if (process.env.PERF_PHASE !== 'navigation') {
      const plain = await browser.newContext({ javaScriptEnabled: false });
      const plainPage = await plain.newPage();
      await plainPage.goto(base + '/games/', { waitUntil: 'domcontentloaded' });
      assert.equal(await plainPage.locator('.game-item').count(), index.length);
      await plain.close();
      console.log('PASS no-JavaScript game-name/link availability');
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(base + '/games/', { waitUntil: 'load' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const before = counts.get('/rankings/') || 0;
    const prefetched = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { server.off('request', observe); reject(new Error('No prefetch reached the server')); }, 8000);
      function observe(request) {
        if (request.url === '/rankings/') {
          clearTimeout(timeout);
          server.off('request', observe);
          resolve();
        }
      }
      server.on('request', observe);
    });
    await page.getByRole('link', { name: '모바일', exact: true }).focus();
    await prefetched;
    await page.evaluate(async () => {
      const cache = await caches.open('gamerscroll-perf-test-prefetch');
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await cache.match(location.origin + '/rankings/')) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Prefetch response was not cached');
    });
    assert.equal(counts.get('/rankings/'), before + 1, `Intent fetches one document: ${JSON.stringify({
      counts: [...counts],
      cached: await page.evaluate(async () => {
        const cache = await caches.open('gamerscroll-perf-test-prefetch');
        const response = await cache.match(location.origin + '/rankings/');
        return { href: location.href, response: response && (await response.text()).slice(0, 120) };
      })
    })}`);
    await page.getByRole('link', { name: '모바일', exact: true }).click();
    await page.waitForURL('**/rankings/');
    assert.equal(counts.get('/rankings/'), before + 1, 'Navigation reuses document without a second network request');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/games/');
    console.log('PASS real service-worker prefetch reuse and back navigation');
    await context.close();

    failIcons = true;
    const recovery = await browser.newContext();
    const recoveryPage = await recovery.newPage();
    await recoveryPage.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await recoveryPage.goto(base + '/games/', { waitUntil: 'load' });
    const failed = recoveryPage.waitForResponse(response => response.url().includes('/assets/feed/') && response.status() === 503);
    await recoveryPage.locator('[id="initial-A"] summary').click();
    await failed;
    assert.equal(await recoveryPage.locator('[id="initial-A"] .game-item').count(), 1);
    failIcons = false;
    await recoveryPage.locator('[id="initial-A"] summary').click();
    await recoveryPage.locator('[id="initial-A"] summary').click();
    await recoveryPage.locator('[id="initial-A"] img').waitFor();
    await recovery.close();
    console.log('PASS optional icon failure keeps links usable and retries on reopen');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Artifacts: ${output}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
