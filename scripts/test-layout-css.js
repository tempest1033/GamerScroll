const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { renderCssLinks } = require('../src/build/css-links');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscroll-layout-test-'));
  const css = '.panel{--gap:12px;display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);padding:20px;border:2px solid black;color:red;background:rgb(1,2,3)}.item{height:80px;font-size:20px}@media(max-width:600px){.panel{grid-template-columns:1fr;padding:8px}}@supports(display:grid){.panel{margin-top:10px}}';
  fs.writeFileSync(path.join(dir, 'styles-core.css'), 'body{margin:0}.panel{color:green}.unrelated{font-size:99px}');
  fs.writeFileSync(path.join(dir, 'styles-game.css'), css);
  fs.writeFileSync(path.join(dir, 'styles-article.css'), '.panel{padding:24px;color:blue}');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      for (const javaScriptEnabled of [true, false]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/') {
            const body = '<body><div class="panel"><div class="item">A</div><div class="item">B</div></div><script>window.adReady = true</script></body>';
            return route.fulfill({ contentType: 'text/html', body: `<html><head>${renderCssLinks(['/styles-core.css', '/styles-game.css', '/styles-article.css'], dir, body)}</head>${body}</html>` });
          }
          if (javaScriptEnabled) await gate;
          return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(dir, url.pathname.slice(1)), 'utf8') });
        });
        const page = await context.newPage();
        await page.goto('http://layout.test/', { waitUntil: 'domcontentloaded' });
        const read = () => page.evaluate(() => ({
          boxes: [...document.querySelectorAll('.panel,.item')].map(e => { const r = e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; }),
          color: getComputedStyle(document.querySelector('.panel')).color,
          adReady: window.adReady
        }));
        const before = await read();
        if (javaScriptEnabled) {
          assert.equal(before.adReady, true, '페이지별 CSS 응답 전에 상단 인라인 스크립트 실행');
          assert.equal(before.color, 'rgb(0, 0, 255)', '공통·페이지 CSS 응답 전에도 최종 색상 적용');
          release();
          await page.waitForFunction(() => [...document.querySelectorAll('link[as="style"]')].every(link => link.rel === 'stylesheet'));
          const after = await read();
          assert.deepEqual(after.boxes, before.boxes, '장식 적용 전후 배치 유지');
          assert.equal(after.color, before.color, '전체 CSS 적용 후 색상 깜빡임 없음');
        } else {
          assert.equal(before.color, 'rgb(0, 0, 255)', 'JavaScript 없이 최종 스타일 적용');
        }
        assert.equal(before.boxes[0][1], 10, '@supports와 사용자 변수 유지');
        console.log(`PASS layout ${width}px javascript=${javaScriptEnabled}`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
