const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { renderDesktopOnlyHomeAd, renderMobileOnlyHomeAd } = require('../src/templates/components/ads');
const { buildLayoutRuntimeBundle } = require('../src/templates/layout');

// 게임 상세 중간 배너(.gs-ad-inpage): unfilled 면 화면 아래에 있을 때만 자리를 접고, 화면 안이면 250px 예약을 유지한다(CLS 방지).
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', '73-rank-summary.css'), 'utf8');

async function run(browser, width, below) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(`<!doctype html><body class="page-game"><script>
window.adsbygoogle = { loaded: true, push: function() {
  var ad = document.querySelector('ins.adsbygoogle:not([data-adsbygoogle-status])');
  if (ad) ad.setAttribute('data-adsbygoogle-status', 'done');
} };
</script><main id="game"><div class="game-page-grid" style="display:grid">
<div style="height:${below ? 5000 : 100}px"></div>
<div class="gs-ad-inpage grid-full">${renderDesktopOnlyHomeAd('mid-pc')}${renderMobileOnlyHomeAd('mid-mobile')}</div>
<div id="after" style="height:3000px"></div></div></main>`);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: buildLayoutRuntimeBundle() });
    const before = await page.evaluate(() => document.getElementById('after').getBoundingClientRect().top);
    await page.evaluate(() => document.querySelector('.gs-ad-inpage ins.adsbygoogle').setAttribute('data-ad-status', 'unfilled'));
    await page.waitForTimeout(300);
    return await page.evaluate((b) => {
      const slot = document.querySelector('.gs-ad-inpage');
      return { collapsed: slot.classList.contains('gs-ad-collapsed'), height: Math.round(slot.getBoundingClientRect().height), shift: b - document.getElementById('after').getBoundingClientRect().top };
    }, before);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const width of [1440, 390]) {
      const below = await run(browser, width, true);
      assert.equal(below.collapsed, true, `${width}: unfilled slot below the viewport collapses`);
      assert.equal(below.height, 0, `${width}: collapsed slot takes no space`);
      const visible = await run(browser, width, false);
      assert.equal(visible.collapsed, false, `${width}: unfilled slot in the viewport keeps its reserve`);
      assert.equal(visible.height, 250, `${width}: reserve stays 250px`);
      assert.equal(visible.shift, 0, `${width}: no visible layout shift`);
    }
    console.log('PASS in-page ad collapses only below the viewport');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
