const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  try {
    await page.goto('http://localhost:3003/', { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/Project/GamerScroll/_live-gs.png' });
    console.log('OK gs');
  } catch (e) { console.log('ERR', e.message); }
  await ctx.close();
  await browser.close();
})();
