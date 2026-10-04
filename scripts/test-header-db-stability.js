'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
// Korean assertions (aria labels, recent games) run against the ko edition.
const routes = ['/ko/', '/ko/games/', '/ko/rankings/', '/ko/steam/', '/ko/games/메이플-키우기/'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 900, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        localStorage.setItem('gamerscroll_recent_searches', JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ slug: '메이플-키우기', name: `최근 게임 ${i + 1}`, icon: '/icon-192.png' }))));
        window.layoutShifts = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.layoutShifts.push({ value: entry.value, nodes: entry.sources.map(s => s.node && s.node.className) });
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const page = await context.newPage();
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      for (const url of routes) {
        try {
          await page.goto(base + url, { waitUntil: 'networkidle' });
          if (width > 768) {
            const measures = await page.evaluate(() => {
              const header = document.querySelector('.gs-header-inner').getBoundingClientRect();
              const logo = document.querySelector('.gs-logo .logo-svg').getBoundingClientRect();
              const nav = document.querySelector('.gs-nav');
              const active = nav.querySelector('a.active');
              return { headerBottom: header.bottom, logoWidth: logo.width, activeBottom: active && active.getBoundingClientRect().bottom, underlineBottom: active && getComputedStyle(active, '::after').bottom, overflow: document.documentElement.scrollWidth > innerWidth };
            });
            assert.ok(measures.logoWidth >= 180, '로고 확대');
            if (measures.activeBottom !== null) {
              assert.ok(Math.abs(measures.activeBottom - measures.headerBottom) <= 1, '메뉴 하단과 헤더 하단 일치');
              assert.equal(measures.underlineBottom, '0px', '밑줄은 메뉴 내부 하단');
            }
            assert.equal(measures.overflow, false, '좁은 PC에서도 헤더 넘침 없음');
          } else {
            const home = page.locator('.search-home-icon:visible').first();
            assert.ok(await home.isVisible(), '모바일 홈(로고) 링크 표시');
            assert.equal(await home.getAttribute('aria-label'), '게이머스크롤 홈');
            const button = await home.boundingBox();
            assert.ok(button.width >= 44, '홈 링크 터치 폭');
          }
          if (url === '/ko/games/') {
            await page.locator('#recent-games .recent-link').first().waitFor();
            assert.equal(await page.locator('#recent-games .recent-link').count(), 8);
            await page.locator('.games-hub-group summary').first().click();
            await page.locator('.game-item-icon').first().waitFor();
            const before = await page.locator('.game-item').first().boundingBox();
            await page.locator('.game-item-icon').first().evaluate(img => img.decode().catch(() => {}));
            const after = await page.locator('.game-item').first().boundingBox();
            assert.deepEqual(after, before, '아이콘 로딩 전후 행 위치·크기 유지');
            const icon = await page.locator('.game-item-icon').first().boundingBox();
            assert.equal(icon.width, 36);
            assert.equal(icon.height, 36);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const shifts = await page.evaluate(() => window.layoutShifts);
            assert.ok(shifts.reduce((sum, s) => sum + s.value, 0) < .02, `초기 화면 밀림 ${JSON.stringify(shifts)}`);
            await page.screenshot({ path: path.resolve(__dirname, `../mockups/db-stable-${width}.png`) });
          }
          if (width <= 768 && url !== '/ko/') {
            await page.evaluate(() => scrollTo(0, 0));
            await page.locator('.search-home-icon:visible').first().click();
            await page.waitForURL(base + '/ko/');
          }
          console.log(`PASS ${width}px 헤더·DB 안정성 ${url}`);
        } catch (error) {
          failures.push(`${width}px ${url}: ${error.message}`);
          console.error(`FAIL ${failures.at(-1)}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
