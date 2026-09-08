'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base + '/reports/', { waitUntil: 'networkidle' });
      for (const category of ['all', 'ranking', 'insight']) {
        try {
          await page.locator(`[data-report-filter="${category}"]`).click();
          const data = await page.locator('[data-report-category]:visible').evaluateAll(es => es.map(e => {
            const r = e.getBoundingClientRect();
            return { category: e.dataset.reportCategory, href: e.getAttribute('href'), x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, titleSize: parseFloat(getComputedStyle(e.querySelector('h2')).fontSize) };
          }));
          assert.ok(data.length >= 3);
          assert.equal(new Set(data.map(r => r.href)).size, data.length, '기사 중복 없음');
          assert.ok(data.every(r => category === 'all' || r.category === category));
          assert.ok(data[0].titleSize > data[1].titleSize, '대표 제목 위계');
          if (width > 768) {
            assert.ok(data[0].width > data[1].width * 2.8, '대표 기사는 전체 폭');
            assert.ok(data[1].y >= data[0].bottom, '카드는 대표 기사 아래');
            assert.ok(Math.abs(data[1].y - data[2].y) < 2 && Math.abs(data[1].y - data[3].y) < 2, '동일 3열 카드');
            assert.ok(data.slice(1).every(r => Math.abs(r.width - data[1].width) < 2), '나머지 카드 너비 통일');
            const parts = await page.locator('.rk-news-lead').evaluate(e => {
              const image = e.querySelector('img').getBoundingClientRect(), text = e.querySelector('.rk-report-copy').getBoundingClientRect();
              return { imageRight: image.right, textLeft: text.left };
            });
            assert.ok(parts.textLeft > parts.imageRight, '대표 이미지·제목 좌우 배치');
          } else {
            assert.ok(data.every(r => Math.abs(r.x - data[0].x) < 2));
            for (let i = 1; i < data.length; i++) assert.ok(data[i].y >= data[i - 1].bottom, '모바일 기사 겹침 없음');
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          console.log(`PASS ${width}px ${category}: 편집 배치·필터`);
        } catch (e) { failures.push(`${width}px ${category}: ${e.message}`); }
      }
      await page.locator('[data-report-filter="all"]').click();
      await page.screenshot({ path: path.resolve(__dirname, `../mockups/reports-news-${width}.png`), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
