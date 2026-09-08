'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of (process.env.TEST_WIDTHS || '1440,390').split(',').map(Number)) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const route of (process.env.TEST_ROUTES ? process.env.TEST_ROUTES.split(',') : ['/', '/rankings/', '/rankings/records/', '/rankings/publishers/', '/steam/', '/games/로얄-매치-royal-match/', '/games/where-winds-meet/'])) {
        try {
          await page.goto(base + route, { waitUntil: 'networkidle' });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '가로 넘침 없음');
          if (width === 390) {
            const nav = await page.locator('.nav-inner .nav-item').evaluateAll(es => es.map(e => {
              const r = e.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(e);
              const t = range.getBoundingClientRect();
              return { width: r.width, y: r.y, center: r.x + r.width / 2, textCenter: t.x + t.width / 2 };
            }));
            assert.equal(nav.length, 4);
            assert.ok(nav.every(n => Math.abs(n.width - nav[0].width) < 1 && Math.abs(n.center - n.textCenter) < 1 && Math.abs(n.y - nav[0].y) < 1), '모바일 4칸 중앙 정렬');
          }
          const sparkOffsets = await page.locator('td.spk .rk-spark:visible').evaluateAll(es => es.map(e => {
            const a = e.getBoundingClientRect(), b = e.closest('td').getBoundingClientRect();
            return Math.abs(a.x + a.width / 2 - b.x - b.width / 2);
          }));
          assert.ok(sparkOffsets.every(v => v < 2), '작은 차트와 열 중심 정렬');
          if (route.includes('/games/')) {
            const widgets = page.locator('.rk-interactive-chart:visible');
            assert.ok(await widgets.count() >= 2);
            for (let i = 0; i < await widgets.count(); i++) {
              const root = widgets.nth(i), svg = root.locator('svg').first();
              await svg.scrollIntoViewIfNeeded();
              const data = JSON.parse(await root.locator('[type="application/json"]').textContent());
              await svg.focus();
              await svg.press('Home');
              await svg.press('ArrowRight');
              const text = await root.locator('.rk-chart-tooltip').innerText();
              assert.ok(text.includes(data.labels[1]));
              for (const series of data.series) assert.ok(text.includes(series.name + ' ' + (series.values[1] == null ? '기록 없음' : series.values[1] + '위')));
              await svg.press('Enter');
              assert.ok(!(await root.locator('.rk-chart-tooltip').innerText()).includes('고정'));
              await svg.press('Escape');
              const box = await svg.boundingBox();
              if (width === 390) await page.touchscreen.tap(Math.min(width - 40, box.x + box.width * .4), box.y + box.height / 2);
              else {
                await page.mouse.move(box.x + box.width * .65, box.y + box.height / 2);
                assert.ok(await root.locator('.rk-chart-tooltip').isVisible(), '호버 표시');
                await page.mouse.click(box.x + box.width * .65, box.y + box.height / 2);
              }
              assert.ok(await root.locator('.rk-chart-tooltip').isVisible(), '실제 화면 안의 지점을 터치하면 표시');
              assert.ok(!(await root.locator('.rk-chart-tooltip').innerText()).includes('고정'));
              assert.equal(await root.locator('.rk-chart-guide line').count(), 1, '선택 날짜 안내선');
              const selected = await root.locator('.rk-chart-tooltip').innerText();
              if (width !== 390) {
                await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
                assert.notEqual(await root.locator('.rk-chart-tooltip').innerText(), selected, '클릭 후에도 마우스를 따라 갱신');
                await page.mouse.move(2, 2);
                assert.ok(!(await root.locator('.rk-chart-tooltip').isVisible()), '마우스를 벗어나면 숨김');
              } else {
                await page.touchscreen.tap(4, 400);
                assert.ok(!(await root.locator('.rk-chart-tooltip').isVisible()), '차트 바깥 터치로 닫기');
              }
              const button = root.locator('[data-chart-series]').first();
              const dot = button.locator('i');
              const color = await dot.evaluate(e => getComputedStyle(e).backgroundColor);
              const lineColor = await svg.locator('[data-rank-series="0"]').first().evaluate(e => getComputedStyle(e).stroke || getComputedStyle(e).fill);
              assert.equal(color, lineColor, '범례와 선 색 일치');
              await button.click();
              assert.equal(await button.getAttribute('aria-pressed'), 'false');
              assert.ok(await svg.locator('[data-rank-series="0"]').evaluateAll(es => es.every(e => getComputedStyle(e).display === 'none')));
              await button.click();
              assert.equal(await root.getByRole('button', { name: '고정 해제' }).count(), 0);
              assert.ok(!(await root.locator('.rk-chart-tooltip').isVisible()));
            }
            if (route.includes('로얄')) {
              assert.equal(await page.getByText('차트 체류', { exact: true }).count(), 0);
              assert.equal(await page.getByText('최근 30일 TOP 10 유지', { exact: true }).count(), 1);
            }
          }
          console.log(`PASS ${width}px ${route}`);
        } catch (e) { failures.push(`${width}px ${route}: ${e.message}`); }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
