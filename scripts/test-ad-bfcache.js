const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { renderHomeAdPair } = require('../src/templates/components/ads');
const { buildLayoutRuntimeBundle } = require('../src/templates/layout');

// A page restored from the back/forward cache must still request its lazy below-the-fold slots.
async function run(browser, persisted) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.setContent(`<!doctype html><body><script>
window.requests = [];
window.adsbygoogle = { loaded: true, push: function() {
  var ad = document.querySelector('ins.adsbygoogle:not([data-adsbygoogle-status])');
  window.requests.push(ad && ad.getAttribute('data-ad-slot'));
  if (ad) ad.setAttribute('data-adsbygoogle-status', 'done');
} };
</script><main>${renderHomeAdPair('top-desktop', 'top-mobile')}
<div style="height:10000px"></div>
<div class="ad-card"><ins class="adsbygoogle" style="display:block;width:300px;height:250px" data-ad-slot="lazy-mid"></ins></div>
<div style="height:2000px"></div></main>`);
    await page.addScriptTag({ content: buildLayoutRuntimeBundle() });
    assert.deepEqual(await page.evaluate(() => window.requests), ['top-desktop']);
    await page.evaluate((p) => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: p })), persisted);
    await page.locator('[data-ad-slot="lazy-mid"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    return await page.evaluate(() => window.requests);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    assert.deepEqual(await run(browser, true), ['top-desktop', 'lazy-mid'], 'bfcache pagehide must keep the lazy observer');
    assert.deepEqual(await run(browser, false), ['top-desktop'], 'a real unload still releases observers');
    console.log('PASS bfcache keeps lazy ad observer');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

