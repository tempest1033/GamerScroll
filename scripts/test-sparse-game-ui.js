'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { renderGameRankSummary } = require('../src/templates/pages/rank-hub');
const { generateGamePage } = require('../src/templates/pages/game');
const empty = renderGameRankSummary({ name: '기록 없는 게임', appIds: { ios: 'test-no-record' } }, 'test-no-record');
assert.ok(empty && empty.html.includes('해당 기간의 한국 매출 순위 기록이 없습니다.'));
assert.equal(empty.days, 0);
assert.ok(!/null|undefined/.test(empty.text));
const fallback = cheerio.load(generateGamePage({ name: '기록 없는 게임', slug: 'test-no-record', platforms: ['ios'], rankSummaryHtml: '' }));
assert.ok(fallback('h2').text().includes('매출 순위 분석'));
assert.equal(fallback('.realtime-rank-section, .rank-trend-section').length, 0);
console.log('PASS 기록 없음·분석 미생성 상태도 신형 UI 유지');

(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const route of (process.env.TEST_ROUTES ? process.env.TEST_ROUTES.split(',') : ['/rankings/', '/rankings/cn/', '/rankings/free/', '/rankings/subculture/', '/rankings/monthly/2026-08/', '/rankings/records/', '/games/픽셀-테이머즈/'])) {
        try {
          assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
          assert.equal(await page.locator('.rk-ticker').count(), 0, '메뉴 아래 요약 띠 제거');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          if (route.includes('/games/')) {
            assert.ok((await page.locator('h2').allTextContents()).some(t => t === '매출 순위 분석'));
            assert.equal(await page.locator('.realtime-rank-section, .rank-trend-section').count(), 0);
            assert.ok(await page.locator('.rk-game').count() > 0);
            const points = page.locator('.rk-game .rk-chartsvg circle[data-rank-series]');
            assert.ok(await points.count() > 0, '단일 순위 기록 표시');
            await page.screenshot({ path: path.resolve(__dirname, `../mockups/sparse-game-${width}.png`), fullPage: true });
          }
          console.log(`PASS ${width}px ${route}`);
        } catch (e) { failures.push(`${width}px ${route}: ${e.message}`); }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
