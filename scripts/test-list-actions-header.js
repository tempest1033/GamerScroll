'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 1024, 900, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      let headerReference;
      for (const url of ['/', '/rankings/', '/rankings/free/', '/rankings/jp/', '/steam/', '/games/', '/reports/', '/magazine/', '/games/메이플-키우기/', '/magazine/ranking/subculture-august-2026-kr/']) {
        try {
          await page.goto(base + url, { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          if (width > 768) {
            const boxes = await page.locator('.gs-logo, .gs-nav a, .gs-search').evaluateAll(es => es.map(e => {
              const r = e.getBoundingClientRect();
              return [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10);
            }));
            headerReference ||= boxes;
            assert.deepEqual(boxes, headerReference, '홈과 다른 페이지의 헤더 좌표 동일');
          }
          for (const action of await page.locator('.gs-list-action:visible').all()) {
            const style = await action.evaluate(el => {
              const s = getComputedStyle(el);
              return { height: el.getBoundingClientRect().height, background: s.backgroundColor, radius: s.borderRadius, font: s.fontSize };
            });
            assert.deepEqual(style, { height: 44, background: 'rgb(245, 245, 247)', radius: '10px', font: '13px' });
          }
          for (const column of await page.locator('.rk-col:visible').all()) {
            const toggle = column.locator('.rk-more-toggle');
            if (!await toggle.count() || !await column.locator('.gs-list-expand').count()) continue;
            const button = column.locator('.gs-list-expand');
            const count = await column.locator('.rk-list li').count();
            await button.click();
            assert.equal(await column.locator('.rk-list li:visible').count(), count, '전체 순위 펼치기');
            assert.ok(await button.locator('.gs-collapse-text').isVisible(), '접기 버튼 표시');
            await toggle.focus();
            await page.keyboard.press('Space');
            assert.equal(await column.locator('.rk-list li:visible').count(), 20, '키보드로 접기');
            assert.ok(await button.locator('.gs-expand-text').isVisible());
          }
          if (url === '/' && width === 1440) await page.locator('.rk-month-section').screenshot({ path: path.resolve(__dirname, '../mockups/list-actions-month.png') });
          console.log(`PASS ${width}px 헤더·목록 버튼 ${url}`);
        } catch (error) {
          failures.push(`${width}px ${url}: ${error.message}`);
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
