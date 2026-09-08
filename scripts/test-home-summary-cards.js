'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base, { waitUntil: 'networkidle' });
      const data = await page.locator('.rk-hcards > .rk-hcard').evaluateAll(cards => cards.map(e => {
        const s = getComputedStyle(e), r = e.getBoundingClientRect();
        return { bg: s.backgroundColor, radius: s.borderRadius, top: s.paddingTop, left: s.paddingLeft, y: r.y, bottom: r.bottom };
      }));
      assert.equal(data.length, 2);
      for (const key of ['bg', 'radius', 'top', 'left']) assert.equal(data[0][key], data[1][key], `${key} 통일`);
      assert.notEqual(data[0].bg, 'rgba(0, 0, 0, 0)');
      if (width > 768) {
        assert.ok(Math.abs(data[0].y - data[1].y) < 2);
        assert.ok(Math.abs(data[0].bottom - data[1].bottom) < 2);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('.rk-hcards').screenshot({ path: path.resolve(__dirname, `../mockups/home-summary-cards-${width}.png`) });
      console.log(`PASS ${width}px 요약 카드 배경·높이·여백·모서리`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
