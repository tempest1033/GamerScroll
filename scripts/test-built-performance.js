const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

async function main() {
  const docs = path.resolve(process.env.PERF_DOCS || path.join(__dirname, '../docs'));
  const routes = ['/', '/rankings/', '/steam/', '/reports/', '/games/', '/steam/730/', '/games/메이플-키우기/', '/magazine/ranking/subculture-august-2026-kr/'];
  const errors = [];
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file = path.join(docs, relative || 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(docs + path.sep) || !fs.existsSync(file)) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      let scriptErrors = [];
      page.on('pageerror', error => scriptErrors.push(error.message));
      for (const route of routes) {
        scriptErrors = [];
        try {
          const response = await page.goto(base + route, { waitUntil: 'load' });
          assert.equal(response.status(), 200);
          assert.equal(await page.locator('h1:visible').count(), 1);
          assert.equal(await page.locator('.search-box:visible').count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          assert.deepEqual(scriptErrors, [], 'Page scripts must initialize without errors');
          const $ = cheerio.load(await response.text());
          for (const link of $('link[rel=stylesheet],link[as=style]').toArray()) {
            const href = $(link).attr('href');
            if (href?.startsWith('/styles-')) {
              assert.ok(fs.existsSync(path.join(docs, href.split('?')[0])), `Missing stylesheet: ${href}`);
            }
          }
          if (route === '/games/') {
            const count = await page.locator('.game-item').count();
            assert.ok(count > 3000);
            assert.equal(await page.locator('.game-item img').count(), 0);
            const group = page.locator('.games-hub-group').first();
            await group.locator('summary').click();
            await group.locator('.game-item-icon').first().waitFor();
            assert.equal(await group.locator('.game-item-icon').first().evaluate(image => getComputedStyle(image).width), '36px');
            for (const data of $('script[data-src]').toArray()) {
              assert.ok(fs.existsSync(path.join(docs, $(data).attr('data-src'))));
            }
            console.log(`CATALOG ${width}px links=${count} nodes=${await page.locator('*').count()}`);
          }
          if (route === '/') {
            const choices = page.locator('.rk-hpanel.and button');
            if (await choices.count() > 1) {
              await choices.nth(1).click();
              assert.equal(await choices.nth(1).getAttribute('aria-pressed'), 'true');
            }
          }
          console.log(`PASS ${width}px ${route}`);
        } catch (error) {
          errors.push(`${width}px ${route}: ${error.message}`);
          console.error(`FAIL ${errors.at(-1)}`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
