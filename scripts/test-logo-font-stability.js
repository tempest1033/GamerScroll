'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 900]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const capture = async clip => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })).data, 'base64');
      let release;
      const fonts = new Promise(resolve => { release = resolve; });
      await page.route('**/*', async route => {
        const url = route.request().url();
        if (!url.startsWith(base)) return route.abort();
        if (route.request().resourceType() === 'font') await fonts;
        return route.continue();
      });
      await page.goto(base + '/games/', { waitUntil: 'domcontentloaded' });
      // 일반 스크린샷의 폰트 대기를 피하고 로딩 전 픽셀을 직접 캡처한다.
      const logo = page.locator('.logo-svg');
      const beforeBox = await logo.boundingBox();
      const before = await capture(beforeBox);
      release();
      await page.evaluate(() => document.fonts.ready);
      const afterBox = await logo.boundingBox();
      const after = await capture(afterBox);
      assert.deepEqual(afterBox, beforeBox, '폰트 로딩 전후 로고 위치·크기');
      assert.ok(before.equals(after), '폰트 로딩 전후 로고 픽셀 동일');
      await page.locator('.gs-logo a').click();
      await page.waitForURL(base + '/');
      await page.evaluate(() => document.fonts.ready);
      const homeBox = await logo.boundingBox();
      assert.deepEqual(homeBox, beforeBox, '페이지 이동 후 로고 위치·크기 유지');
      assert.ok((await capture(homeBox)).equals(after), '페이지 이동 후 로고 모양 유지');
      if (width === 1440) fs.writeFileSync(path.resolve(__dirname, '../mockups/logo-font-stable.png'), after);
      console.log(`PASS ${width}px 웹폰트 지연·로고 클릭 후 동일 모양`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
