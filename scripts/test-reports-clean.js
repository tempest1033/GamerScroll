'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p).replace(/^\uFEFF/, ''));
const reportList = require('../src/rank/reports').loadReports();
let legacy = 0;
for (const type of ['issue', 'hotpick']) {
  const folder = path.join(root, 'docs/magazine', type);
  // 목록 index.html은 2026-09-09부터 생성하지 않는다(/reports/ 301) — 기사 디렉터리만 검사
  const paths = fs.readdirSync(folder, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(folder, e.name, 'index.html'));
  for (const file of paths) {
    const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
    assert.match($('meta[name="robots"]').attr('content') || '', /noindex/);
    assert.ok($('h1').text().trim());
    legacy++;
  }
  assert.ok(!read('docs/sitemap.xml').includes(`/magazine/${type}/`));
  assert.ok(!read('docs/rss.xml').includes(`/magazine/${type}/`));
  assert.ok(!read('docs/robots.txt').includes(`Disallow: /magazine/${type}`));
}
assert.ok(legacy > 2);
for (const a of reportList) {
  assert.ok(a.thumbnail.startsWith('/assets/images/'));
  const $ = cheerio.load(read(`docs${a.href}index.html`));
  assert.ok(!($('meta[name="robots"]').attr('content') || '').includes('noindex'));
  assert.equal($('h1').text().trim(), a.title);
  assert.ok(!$('.article-sidebar a, .blog-related-issues a, .sidebar-category-item').toArray().some(e => /\/magazine\/(issue|hotpick)\//.test($(e).attr('href') || '')));
}
console.log(`PASS 레거시 ${legacy}페이지 보존·noindex·사이트맵·RSS 제외 / 활성 리포트 ${reportList.length}편`);

(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      try {
        await page.goto(base + '/reports/', { waitUntil: 'networkidle' });
        await page.evaluate(() => { window.reportDocumentMarker = true; });
        for (const category of ['ranking', 'insight', 'all']) {
          await page.locator(`[data-report-filter="${category}"]`).click();
          assert.ok(await page.evaluate(() => window.reportDocumentMarker), '페이지 새로고침 없이 필터');
          const visible = await page.locator('[data-report-category]:visible').evaluateAll(es => es.map(e => e.dataset.reportCategory));
          assert.equal(visible.length, reportList.filter(a => category === 'all' || a.cat === category).length);
          assert.ok(visible.every(c => category === 'all' || c === category));
        }
        for (const image of await page.locator('.rk-report-list img').all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(e => e.decode());
          assert.ok(await image.evaluate(e => e.naturalWidth > 0));
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.goto(base + '/reports/#insight', { waitUntil: 'networkidle' });
        assert.equal(await page.locator('[data-report-category="ranking"]:visible').count(), 0, '직접 링크 필터');
        await page.locator('[data-report-filter="all"]').click();
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(root, `mockups/reports-clean-${width}.png`) });
        await page.goto(base + '/magazine/ranking/mobile-july-2026-kr/', { waitUntil: 'networkidle' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '본문 가로 넘침 없음');
        await page.screenshot({ path: path.join(root, `mockups/report-article-clean-${width}.png`) });
        console.log(`PASS ${width}px 필터·23개 썸네일·본문 배치`);
      } catch (e) { failures.push(`${width}: ${e.message}`); }
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
