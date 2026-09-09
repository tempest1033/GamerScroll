'use strict';

// 실제 화면에서 섹션 제목·열 경계·하단 링크의 정렬을 확인한다.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
const routes = [
  '/', '/rankings/', '/rankings/jp/', '/rankings/free/', '/rankings/subculture/',
  '/rankings/monthly/2026-08/', '/rankings/global/', '/rankings/records/',
  '/rankings/publishers/', '/rankings/about/', '/steam/', '/steam/730/',
  '/games/', '/games/메이플-키우기/', '/reports/', '/magazine/',
  '/magazine/ranking/', '/magazine/insight/',
  '/magazine/ranking/subculture-august-2026-kr/',
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await page.route('**/*', route => /googleads|doubleclick|googlesyndication|google-analytics/.test(route.request().url()) ? route.abort() : route.continue());
      for (const url of routes) {
        try {
          await page.goto(base + url, { waitUntil: 'networkidle' });
          const geometry = await page.evaluate(() => {
            const visible = e => e.getBoundingClientRect().height > 2 && e.getBoundingClientRect().width > 2;
            const rect = e => {
              const r = e.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, bottom: r.bottom };
            };
            const main = document.querySelector('.site-container');
            const mainRect = main.getBoundingClientRect();
            const edge = mainRect.x + parseFloat(getComputedStyle(main).paddingLeft);
            const headings = [...document.querySelectorAll('.rk-home > .rk-section > h2, .rk-market-heading h2, .page-container.rk > .rk-card > h2, .page-container.rk > .rk-section > h2, .games-hub-section-title, .article-main .blog-heading')].filter(visible).map(rect);
            const grids = [...document.querySelectorAll('.rk-cols, .rk-grid2, .rk-hmovers, .rk-feat')].filter(visible).map(e => ({
              ...rect(e),
              children: [...e.children].filter(visible).map(rect),
              gap: parseFloat(getComputedStyle(e).columnGap),
            }));
            const links = [...document.querySelectorAll('.rk-hmonth .rk-note')].filter(visible).map(rect);
            return { edge, headings, grids, links };
          });
          for (const h of geometry.headings) assert.ok(Math.abs(h.x - geometry.edge) <= 2, `제목 시작선 ${h.x} / ${geometry.edge}`);
          for (const grid of geometry.grids) {
            if (grid.children.length !== 2) continue;
            const [a, b] = grid.children;
            if (width > 768) {
              assert.ok(Math.abs(a.width - b.width) <= 2, `두 열 너비 ${a.width} / ${b.width}`);
              assert.ok(Math.abs(a.y - b.y) <= 2, `두 열 상단 ${a.y} / ${b.y}`);
              assert.ok(Math.abs(b.x - (a.x + a.width + grid.gap)) <= 2, '열 간격');
            } else {
              assert.ok(Math.abs(a.x - b.x) <= 2, '모바일 열 시작선');
            }
          }
          if (width > 768 && geometry.links.length > 1) {
            for (const link of geometry.links) assert.ok(Math.abs(link.bottom - geometry.links[0].bottom) <= 2, '월간 분석 하단 링크');
          }
          if (url === '/') {
            await page.screenshot({ path: path.resolve(__dirname, `../mockups/aligned-home-${width}.png`), fullPage: true });
          }
          console.log(`PASS ${width}px 섹션·열 정렬 ${url}`);
        } catch (error) {
          failures.push(`${width}px ${url}: ${error.message}`);
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
