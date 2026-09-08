'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const routes = process.env.TEST_ROUTES ? process.env.TEST_ROUTES.split(',') : ['/games/', '/games/where-winds-meet/', '/games/메이플-키우기/', '/steam/730/', '/rankings/', '/steam/'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of (process.env.TEST_WIDTHS || '1440,390').split(',').map(Number)) {
      for (const colorScheme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme });
        await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
        for (const route of routes) {
          try {
            const response = await page.goto(base + route, { waitUntil: 'networkidle' });
            assert.equal(response.status(), 200);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '가로 넘침 없음');
            if (route.startsWith('/games/') && route !== '/games/') {
              const result = await page.evaluate(() => {
                const grid = document.querySelector('.game-page-grid');
                const cards = [...grid.children].map(e => e.getBoundingClientRect());
                const buttons = [...grid.querySelectorAll('.tab-btn')].filter(e => e.getBoundingClientRect().height);
                return {
                  gap: grid.getBoundingClientRect().bottom - Math.max(...cards.map(r => r.bottom)),
                  buttons: buttons.map(e => ({ text: e.textContent.trim(), color: getComputedStyle(e).color })),
                  labels: [...grid.querySelectorAll('.trend-content.active svg text')].map(e => getComputedStyle(e).fill),
                };
              });
              assert.ok(result.gap < 100, '상세 하단 과도한 공백 없음');
              assert.ok(result.buttons.every(b => b.text && b.color !== 'rgb(255, 255, 255)'), '기간·분류 버튼 가독성');
              assert.ok(result.labels.every(c => c === 'rgb(110, 110, 115)'), '차트 문자 뉴트럴 대비');
              if (route.includes('where-winds')) {
                for (const section of ['.steam-ccu-section', '.steam-sales-section']) {
                  for (const period of ['weekly', 'monthly', 'daily']) {
                    await page.locator(`${section} [data-trend-period="${period}"]`).click();
                    assert.equal(await page.locator(`${section} .trend-content.active`).getAttribute('data-period'), period);
                    assert.ok(await page.locator(`${section} .trend-content.active .chart-xlabel`).count() > 0, '기간별 날짜 표시');
                  }
                }
              }
            }
            if (route === '/rankings/' || route === '/steam/') {
              const controls = page.locator('.rk-more-toggle');
              for (let i = 0; i < await controls.count(); i++) assert.ok(await controls.nth(i).isChecked(), '기본 전체 펼침');
              const control = controls.first();
              const id = await control.getAttribute('id');
              const label = page.locator(`label[for="${id}"]`);
              const column = control.locator('..');
              const rows = column.locator('li.ext:visible');
              assert.ok(await rows.count() > 0, '전체 행 표시');
              await label.click();
              assert.equal(await rows.count(), 0, '접기');
              await label.click();
              assert.ok(await rows.count() > 0, '다시 펼치기');
            }
            if (colorScheme === 'dark' && route.includes('where-winds')) {
              await page.screenshot({ path: path.resolve(__dirname, `../mockups/game-clean-${width}.png`), fullPage: true });
            }
            console.log(`PASS ${width} ${colorScheme} ${route}`);
          } catch (error) {
            failures.push(`${width} ${colorScheme} ${route}: ${error.message}`);
            console.error(failures.at(-1));
          }
        }
        await page.close();
      }
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
