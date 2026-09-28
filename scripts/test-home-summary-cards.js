'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base, { waitUntil: 'networkidle' });
      // 2026-09-28 리뉴얼: 요약 카드 2장 → 플랫폼별 1위 4칸 (PC 한 줄, 좁은 화면 2×2)
      const data = await page.locator('.rk-kpis > .rk-kpi').evaluateAll(cards => cards.map(e => {
        const s = getComputedStyle(e), r = e.getBoundingClientRect();
        return { bg: s.backgroundColor, radius: s.borderRadius, top: s.paddingTop, left: s.paddingLeft, y: r.y, bottom: r.bottom };
      }));
      assert.equal(data.length, 4);
      for (const card of data.slice(1)) for (const key of ['bg', 'radius', 'top', 'left']) assert.equal(card[key], data[0][key], `${key} 통일`);
      assert.notEqual(data[0].bg, 'rgba(0, 0, 0, 0)');
      for (const card of data) for (const other of data) {
        if (Math.abs(card.y - other.y) < 2) assert.ok(Math.abs(card.bottom - other.bottom) < 2, '같은 줄 카드 높이');
      }
      if (width > 1100) assert.ok(data.every(card => Math.abs(card.y - data[0].y) < 2), 'PC 한 줄 4칸');
      // 타일 전체가 링크라 공통 링크색(회색)을 받지만, 게임 이름은 진하고 굵게 보여야 한다.
      const name = await page.locator('.rk-kpis .rk-kpi b').first().evaluate(e => ({ color: getComputedStyle(e).color, weight: Number(getComputedStyle(e).fontWeight) }));
      assert.equal(name.color, 'rgb(29, 29, 31)', '게임 이름 강조색');
      assert.ok(name.weight >= 700, '게임 이름 굵게');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('.rk-kpis').screenshot({ path: path.resolve(__dirname, `../mockups/home-summary-cards-${width}.png`) });
      console.log(`PASS ${width}px 1위 카드 배경·높이·여백·모서리·이름 강조`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
