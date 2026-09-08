'use strict';
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { hourlyRankChart } = require('../src/templates/components/hourly-rank-chart');
const ios = [{ time: '02:00', rank: 3 }, { time: '04:00', rank: null }, { time: '08:00', rank: 4 }];
const android = [{ time: '02:00', rank: 1 }, { time: '05:00', rank: 2 }, { time: '08:00', rank: 1 }];
const html = hourlyRankChart(ios, android);
const $ = cheerio.load(html), data = JSON.parse($('[type="application/json"]').text());
assert.deepEqual(data.labels, ['02:00', '04:00', '05:00', '08:00']);
assert.deepEqual(data.series.map(s => s.values), [[3, null, null, 4], [1, null, 2, 1]]);
assert.equal(($('path[data-rank-series="0"]').attr('d').match(/M/g) || []).length, 2);
assert.equal($('circle[data-rank-series="1"]').length, 3);
assert.notEqual(data.series[0].color, data.series[1].color);
const one = cheerio.load(hourlyRankChart([], android));
assert.deepEqual(JSON.parse(one('[type="application/json"]').text()).series[0].values, [null, null, null]);
assert.match(hourlyRankChart([], []), /수집된 순위가 없습니다/);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent('<style>.rk-interactive-chart{position:relative}.rk-chart-tooltip{position:absolute;pointer-events:none}svg{display:block;width:100%}</style>' + html);
      const svg = page.locator('svg');
      await svg.focus();
      await page.keyboard.press('Home');
      const tip = page.locator('.rk-chart-tooltip');
      assert.match(await tip.textContent(), /앱스토어 3위/);
      assert.match(await tip.textContent(), /구글플레이 1위/);
      await page.keyboard.press('ArrowRight');
      assert.match(await tip.textContent(), /앱스토어 기록 없음/);
      assert.match(await tip.textContent(), /구글플레이 기록 없음/);
      await page.locator('[data-chart-series="1"]').click();
      assert.equal(await page.locator('[data-chart-series="1"]').getAttribute('aria-pressed'), 'false');
      const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const route of ['/', '/rankings/', '/rankings/genres/', '/rankings/global/', '/steam/']) {
        assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
        assert.equal(await page.locator('.rk-foot').count(), 0);
      }
      await page.goto(base + '/games/제우스-오만의-신/', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.rk-hourly-card [data-chart-series]').count(), 2);
      assert.ok(await page.locator('.rk-hourly-card circle[data-rank-series="0"]').count() > 0);
      assert.ok(await page.locator('.rk-hourly-card circle[data-rank-series="1"]').count() > 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      console.log(`PASS ${width}px 두 스토어 순위·미수집·시각 차이·범례 전환`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
