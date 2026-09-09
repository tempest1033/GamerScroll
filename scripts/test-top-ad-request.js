const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { renderHomeAdPair } = require('../src/templates/components/ads');
const { buildLayoutRuntimeBundle } = require('../src/templates/layout');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
  });
  try {
    const runtime = buildLayoutRuntimeBundle();
    const cases = [
      { width: 1440, loaded: false },
      { width: 390, loaded: false },
      { width: 1440, loaded: true },
      { width: 390, loaded: true },
      { width: 1440, loaded: true, zeroWidth: true },
      { width: 1440, loaded: true, failFirst: true },
      { width: 1440, loaded: true, disabled: true }
    ];
    for (const scenario of cases) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 } });
      try {
        await page.setContent(`<!doctype html><body class="${scenario.disabled ? 'ads-disabled' : ''}">
<script>
window.requests = [];
window.adsbygoogle = ${scenario.loaded ? '{ loaded: true }' : '[]'};
window.adsbygoogle.push = function(value) {
  if (${!!scenario.failFirst} && !window.failedOnce) {
    window.failedOnce = true;
    throw new Error('Transient request failure');
  }
  var ad = document.querySelector('ins.adsbygoogle:not([data-adsbygoogle-status])');
  window.requests.push({
    slot: ad && ad.getAttribute('data-ad-slot'),
    readyState: document.readyState,
    footerExists: !!document.getElementById('footer')
  });
  if (this.loaded && ad) ad.setAttribute('data-adsbygoogle-status', 'done');
  if (!this.loaded) Array.prototype.push.call(this, value);
};
</script>
<main><div id="top-container" style="width:${scenario.zeroWidth ? '0' : '100%'}">
${renderHomeAdPair('desktop-test', 'mobile-test')}
</div>
<div class="ad-card ad-card-scroll" style="margin-top:10000px">
  <ins class="adsbygoogle" style="display:block;width:300px;height:250px" data-ad-slot="native-test"></ins>
</div></main><footer id="footer"></footer>`);

        const early = await page.evaluate(() => ({
          requests: window.requests,
          queueLength: window.adsbygoogle.length,
          nativeStatus: document.querySelector('[data-ad-slot="native-test"]').getAttribute('data-gs-ad-pushed')
        }));
        const expectsEarly = !scenario.zeroWidth && !scenario.failFirst && !scenario.disabled;
        assert.equal(early.requests.length, expectsEarly ? 1 : 0);
        assert.equal(early.nativeStatus, null, 'Below-fold native ads must not be requested early');
        const expectedSlot = scenario.width > 768 ? 'desktop-test' : 'mobile-test';
        if (expectsEarly) {
          assert.equal(early.requests[0].slot, expectedSlot, 'Hidden breakpoint slot must not consume the request');
          assert.equal(early.requests[0].readyState, 'loading');
          assert.equal(early.requests[0].footerExists, false, 'Top request must precede parsing the page footer');
          if (!scenario.loaded) assert.equal(early.queueLength, 1, 'Queue before AdSense script arrives');
        }
        if (scenario.zeroWidth) {
          await page.locator('#top-container').evaluate(element => { element.style.width = '100%'; });
        }

        await page.addScriptTag({ content: runtime });
        const afterRuntime = await page.evaluate(() => ({
          requests: window.requests,
          nativeStatus: document.querySelector('[data-ad-slot="native-test"]').getAttribute('data-gs-ad-pushed')
        }));
        assert.equal(afterRuntime.requests.length, scenario.disabled ? 0 : 1,
          'Deferred runtime must request pending top slots without duplicating early requests');
        assert.equal(afterRuntime.nativeStatus, null, 'Deferred native loading must remain intact');
        if (!scenario.disabled) assert.equal(afterRuntime.requests[0].slot, expectedSlot);

        if (!scenario.disabled) {
          await page.locator('[data-ad-slot="native-test"]').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => document.querySelector('[data-ad-slot="native-test"]').getAttribute('data-gs-ad-pushed') === '1');
          assert.equal(await page.evaluate(() => window.requests.length), 2,
            'Native slot must still be requested when approached');
        }
        console.log(`PASS ${JSON.stringify(scenario)}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
