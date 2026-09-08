'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const routes = ['/', '/games/', '/rankings/', '/rankings/monthly/2026-08/', '/steam/', '/steam/730/', '/games/메이플-키우기/', '/reports/', '/magazine/', '/wiki/', '/magazine/ranking/subculture-august-2026-kr/'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      for (const route of routes) {
        try {
          await page.goto(base + route, { waitUntil: 'networkidle' });
          const search = page.locator('.search-box:visible');
          assert.equal(await search.count(), 1, '공통 검색창 하나');
          const geometry = await search.evaluate(el => {
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return { width: box.width, height: box.height, padding: style.padding, font: getComputedStyle(el.querySelector('input')).fontSize };
          });
          assert.deepEqual(geometry, width > 768
            ? { width: 240, height: 34, padding: '0px 12px', font: '12px' }
            : { width: width - 32, height: 48, padding: '0px 4px 0px 8px', font: '16px' });
          if (route === '/games/') assert.equal(await page.locator('#games input[type="search"]').count(), 0, '본문 중복 검색 제거');
          console.log(`PASS ${width}px 공통 검색 크기 ${route}`);
        } catch (error) {
          failures.push(`${width}px ${route}: ${error.message}`);
          console.error(`FAIL ${failures.at(-1)}`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
