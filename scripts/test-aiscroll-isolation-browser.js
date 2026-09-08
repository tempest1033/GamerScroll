'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const preview = JSON.parse(fs.readFileSync(path.join(root, 'mockups/aiscroll-isolation-preview.json'), 'utf8'));
const types = { '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const base = pathname.startsWith('/gamerscroll/') ? path.join(root, 'docs') : preview.output;
  const relative = pathname.replace(/^\/gamerscroll\//, '/');
  let file = path.resolve(base, '.' + relative);
  if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      for (const language of ['', 'ko/']) {
        try {
          await page.goto(`${base}/${language}`, { waitUntil: 'networkidle' });
          await page.locator('.search-input:visible').count().then(async count => {
            if (!count) await page.locator('.search-toggle:visible').click();
          });
          await page.locator('.search-input:visible').fill('Claude');
          await page.locator('.search-input:visible').press('Enter');
          await page.waitForURL(/search/);
          assert.ok((await page.locator('body').innerText()).length > 100);
          await page.goto(`${base}/${language}`, { waitUntil: 'networkidle' });
          const article = page.locator('a[href*="/article/"]').filter({ has: page.locator('h3') }).first();
          const fallback = page.locator('a[href*="/article/news/"]').filter({ hasNotText: /^News$/ }).first();
          const href = await (await article.count() ? article : fallback).getAttribute('href');
          assert.ok(href);
          await page.goto(new URL(href, base).href, { waitUntil: 'networkidle' });
          assert.ok(await page.locator('h1').count());
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: path.join(root, `mockups/aiscroll-isolated-${language ? 'ko' : 'en'}-${width}.png`) });
          console.log(`PASS AIScroll ${language || 'en'} ${width}px search, article, overflow`);
        } catch (error) { failures.push(`${width} ${language}: ${error.message}`); }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
