'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const routes = process.env.TEST_ROUTES ? process.env.TEST_ROUTES.split(',') : ['/', '/rankings/', '/rankings/free/', '/rankings/monthly/2026-08/', '/rankings/global/', '/rankings/records/', '/steam/', '/steam/730/', '/games/', '/games/메이플-키우기/', '/reports/', '/magazine/ranking/subculture-august-2026-kr/', '/wiki/'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of (process.env.TEST_WIDTHS || '1440,390').split(',').map(Number)) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      for (const route of routes) {
        try {
          await page.goto(base + route, { waitUntil: 'networkidle' });
          const blueText = () => page.evaluate(() => {
            const found = new Set();
            for (const el of document.querySelectorAll('body *')) {
              if (el.getBoundingClientRect().height <= 0 || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
              const color = getComputedStyle(el).color;
              const rgb = color.match(/[\d.]+/g).map(Number);
              if (rgb[2] - rgb[0] > 30 && rgb[2] - rgb[1] > 20) found.add(`${el.tagName}.${el.className.baseVal ?? el.className}: ${color} ${el.textContent.trim().slice(0, 30)}`);
            }
            return [...found];
          });
          assert.deepEqual(await blueText(), [], '파란 글자 없음');
          const link = page.locator('.gs-nav a:visible, .rk-cardl:visible, .gs-list-action:visible').first();
          if (await link.count()) {
            await link.hover();
            assert.deepEqual(await blueText(), [], '호버 상태에서도 파란 글자 없음');
          }
          if (route === '/') {
            assert.ok(await page.locator('.rk-chartsvg path[stroke]').evaluateAll(es => es.some(e => {
              const rgb = getComputedStyle(e).stroke.match(/[\d.]+/g).map(Number);
              return rgb[2] > rgb[0] + 30;
            })), '차트 선의 파란색 유지');
          }
          console.log(`PASS ${width}px 뉴트럴 글자 ${route}`);
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
