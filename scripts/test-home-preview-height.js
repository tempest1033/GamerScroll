'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base, { waitUntil: 'networkidle' });
      const tabs = page.locator('.rk-htabs label');
      for (let i = 0; i < await tabs.count(); i++) {
        await tabs.nth(i).click();
        const bounds = await page.evaluate(() => {
          const visible = s => [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().height > 0);
          const list = visible('.rk-hpanel > .rk-list').getBoundingClientRect();
          const more = visible('.rk-hpanel > .rk-hmore').getBoundingClientRect();
          const card = document.querySelector('.rk-preview').getBoundingClientRect();
          return { listTop: list.top, moreBottom: more.bottom, cardTop: card.top, cardBottom: card.bottom, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.equal(bounds.overflow, false);
        if (width > 768) {
          assert.ok(Math.abs(bounds.cardTop - bounds.listTop) < 2, '1위 행 상단 정렬');
          assert.ok(Math.abs(bounds.cardBottom - bounds.moreBottom) < 2, '전체 보기 하단 정렬');
        } else {
          assert.ok(bounds.cardTop >= bounds.moreBottom, '모바일 세로 배치 유지');
        }
        const choice = page.locator('.rk-hpanel:visible .nm > button').nth(1);
        await choice.click();
        assert.equal(await choice.getAttribute('aria-pressed'), 'true');
        const action = await page.locator('.rk-preview').evaluate(card => {
          const button = card.querySelector('.rk-preview-link');
          return {
            bottomGap: card.getBoundingClientRect().bottom - button.getBoundingClientRect().bottom,
            padding: parseFloat(getComputedStyle(card).paddingBottom),
            helpRemoved: !card.textContent.includes('미수집 날짜는 추이에서 제외됩니다.'),
            href: button.getAttribute('href')
          };
        });
        assert.ok(Math.abs(action.bottomGap - action.padding) < 2, '상세 기록 버튼 카드 하단 배치');
        assert.ok(action.helpRemoved);
        assert.match(action.href, /^\/(?:games|steam)\//);
        console.log(`PASS ${width}px tab ${i + 1}: 카드 정렬·게임 선택`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
