'use strict';
const assert = require('node:assert/strict');
const { annualRecords } = require('../src/rank/annual-records');
const { chromium } = require('playwright');
const row = appId => ({ appId, title: appId });
const day = (date, ids) => ({ date, rows: { kr: { ios: ids.map(row), android: ids.slice().reverse().map(row) } } });
const fixture = [
  day('2025-12-31', ['a', 'b', 'c']),
  day('2026-01-01', ['a', 'b', 'c']),
  day('2026-01-02', ['b', 'a', 'c']),
  day('2026-01-03', ['a', 'c']),
  day('2026-01-05', ['a', 'b', 'c']),
];
const result = annualRecords(fixture, 'kr', 'ios', '2026');
assert.equal(result.days.length, 4);
const a = result.all.find(r => r.row.appId === 'a');
const b = result.all.find(r => r.row.appId === 'b');
assert.equal(a.ones, 3);
assert.equal(a.bestStreak, 1, '1위 이탈·누락일에서 연속 1위 종료');
assert.equal(a.bestTop10, 3);
assert.equal(a.bestTop10Start, '2026-01-01', '전년도와 연결하지 않음');
assert.equal(a.bestTop10End, '2026-01-03');
assert.equal(b.bestTop10, 2, '차트 이탈에서 종료');
assert.equal(a.pts, 799);
assert.deepEqual(result.crown[0].top.map(r => r.row.appId), ['a', 'c', 'b']);
const outside = Array.from({ length: 10 }, (_, i) => `other-${i}`);
const exits = annualRecords([day('2026-01-01', ['a']), day('2026-01-02', [...outside, 'a']), day('2026-01-03', ['a'])], 'kr', 'ios', '2026');
assert.equal(exits.all.find(r => r.row.appId === 'a').bestTop10, 1, '11위는 TOP 10 연속 기록을 끊음');
assert.equal(annualRecords(fixture, 'kr', 'android', '2026').all.find(r => r.row.appId === 'a').ones, 0);
assert.deepEqual(annualRecords(fixture, 'kr', 'ios', '2024').all, []);
console.log('PASS 연간 집계·연도 경계·누락일·TOP 10 이탈·스토어 분리·월별 TOP 3');

(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const route of (process.env.TEST_ROUTES ? process.env.TEST_ROUTES.split(',') : ['/rankings/cn/', '/rankings/free/cn/', '/rankings/records/', '/rankings/publishers/'])) {
        try {
          assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '페이지 가로 넘침 없음');
          if (route.includes('/cn/')) {
            const box = await page.evaluate(() => {
              const parent = document.querySelector('.rk-cols').getBoundingClientRect();
              const ios = document.querySelector('.rk-col.ios').getBoundingClientRect();
              return { x: ios.x, left: parent.x, width: ios.width, total: parent.width };
            });
            if (width > 768) assert.ok(box.x >= box.left + box.total / 2, '앱스토어 오른쪽 유지');
            else assert.ok(Math.abs(box.x - box.left) < 2 && Math.abs(box.width - box.total) < 2, '모바일은 빈 열 없이 전체 폭');
          }
          if (route.includes('/records/')) {
            assert.match(await page.locator('h1').innerText(), /2026년.*연간 기록/);
            assert.equal(await page.getByRole('heading', { name: /최장 TOP 10 유지/ }).count(), 2);
            assert.ok(!(await page.locator('body').innerText()).includes('하루 최대 급등'));
            const months = await page.locator('.rk-month-top3 tbody tr').evaluateAll(rows => rows.map(r => ({ month: r.cells[0].textContent, games: r.querySelectorAll('.rk-app').length })));
            assert.ok(months.length > 0 && months.every(m => m.month.startsWith('2026-') && m.games === 3));
          }
          if (route.includes('/publishers/')) {
            const cut = await page.locator('.rk-pubtable tr').evaluateAll(rows => rows.some(row => {
              const cell = row.lastElementChild;
              const range = document.createRange(); range.selectNodeContents(cell);
              const text = range.getBoundingClientRect(), box = cell.getBoundingClientRect();
              return text.right > box.right - 3 || text.left < box.left;
            }));
            assert.equal(cut, false, '포인트 제목·숫자가 셀 안에 표시');
          }
          console.log(`PASS ${width}px ${route}`);
        } catch (e) { failures.push(`${width}px ${route}: ${e.message}`); }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
