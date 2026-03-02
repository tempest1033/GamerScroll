const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const files = ['A-dark-magazine','B-hero-layout','C-minimal-list','D-glassmorphism','E-neon-cyber'];
  for (const f of files) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1200, height: 628 });
    const filePath = path.resolve(__dirname, f + '.html').split('\\').join('/');
    await page.goto('file:///' + filePath);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(__dirname, f + '.png'), type: 'png' });
    await page.close();
    console.log('Done: ' + f);
  }
  await browser.close();
  console.log('All done');
})();
