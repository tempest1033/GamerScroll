'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 1024, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      try {
        await page.goto(base + '/steam/', { waitUntil: 'networkidle' });
        const cards = page.locator('.rk-steam-summary .rk-stat');
        assert.equal(await cards.count(), 4);
        assert.equal(await cards.locator('svg').count(), 0);
        assert.equal(await page.locator('#steam .rk-subnav').count(), 0);
        assert.equal(await page.locator('.rk-steam-card-game[href] img').count(), 3);
        assert.ok(await page.locator('#monthly').count() > 0 && await page.locator('#records').count() > 0, '월간·최고 기록 내용 유지');
        const layout = await cards.evaluateAll(es => es.map(e => {
          const box = e.getBoundingClientRect(), primary = e.querySelector('.rk-steam-card-game span') || e.querySelector('.v span'), value = primary.getBoundingClientRect();
          const secondary = e.querySelector('.s strong') || e.querySelector('.l');
          return { label: parseFloat(getComputedStyle(secondary).fontSize), number: parseFloat(getComputedStyle(primary).fontSize), fits: value.right <= box.right && value.left >= box.left };
        }));
        assert.ok(layout.every(c => c.number > c.label && c.fits), '게임명 우선 위계·카드 내부 표시');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.goto(base + '/rankings/records/', { waitUntil: 'networkidle' });
        assert.equal(await page.locator('.rk-head p').count(), 0);
        assert.ok((await page.locator('h1').innerText()).includes('연간 기록'));
        console.log(`PASS ${width}px 스팀 카드·연간 안내 제거`);
      } catch (e) { failures.push(`${width}: ${e.message}`); }
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
