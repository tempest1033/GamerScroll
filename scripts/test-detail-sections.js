'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { hourlyRankChart } = require('../src/templates/components/hourly-rank-chart');
const $ = cheerio.load(hourlyRankChart([{ time: '02:00', rank: 10 }, { time: '04:00', rank: 9 }, { time: '08:00', rank: null }, { time: '10:00', rank: 8 }]));
assert.equal($('circle').length, 3);
assert.equal(($('path').attr('d').match(/M/g) || []).length, 2, '미수집 구간을 연결하지 않음');
const xs = $('circle').map((_, e) => Number($(e).attr('cx'))).get();
assert.ok(Math.abs((xs[1] - xs[0]) * 4 - (xs[2] - xs[0])) < .1, '실제 수집 시각 간격');
assert.ok(Number($('circle').first().attr('cy')) > Number($('circle').last().attr('cy')), '상위 순위가 위에 표시');
assert.match(hourlyRankChart([{ time: '02:00', rank: null }]), /수집된 순위가 없습니다/);
console.log('PASS 시간대별 순위 좌표·누락·빈 기록');

(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  const routes = ['/games/쿠키런-키우기-쿠키런-크럼블/', '/games/메이플-키우기/', '/games/where-winds-meet/'];
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'dark' });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const route of routes) {
        try {
          assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '페이지 가로 넘침 없음');
          const headings = await page.locator('#game h2').allTextContents();
          if (route.includes('where-winds')) {
            assert.ok(headings.includes('스팀 순위 분석'));
            assert.equal(await page.locator('.game-steam-summary .game-hero-stat').count(), 3);
            for (const section of ['.steam-ccu-section', '.steam-sales-section']) {
              for (const period of ['weekly', 'monthly', 'daily']) {
                await page.locator(`${section} [data-trend-period="${period}"]`).click();
                assert.equal(await page.locator(`${section} .trend-content.active`).getAttribute('data-period'), period);
              }
            }
          } else {
            assert.equal(await page.locator('.rk-game > .rk-lead').count(), 0);
            for (const removed of ['순위 분포', '요일별 평균 순위', '국가별 현재 순위']) assert.ok(!headings.some(h => h.includes(removed)));
            assert.ok(headings.some(h => h.includes('최근 기간 비교')));
            assert.equal(await page.locator('.rk-game-records thead th').count(), 2);
            assert.ok(await page.locator('.rk-hour-chart circle').count() > 0);
            assert.ok(await page.locator('.rk-hour-chart').evaluate(e => e.getBoundingClientRect().height > 100), '차트 높이 확보');
            const comparison = page.locator('.rk-card').filter({ has: page.getByRole('heading', { name: /최근 기간 비교/ }) });
            assert.equal(await comparison.locator('tbody tr').count(), 4);
          }
          if (width !== 1024) await page.screenshot({ path: path.resolve(__dirname, `../mockups/detail-sections-${routes.indexOf(route)}-${width}.png`), fullPage: true });
          console.log(`PASS ${width}px ${route}`);
        } catch (e) { failures.push(`${width}px ${route}: ${e.message}`); }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
