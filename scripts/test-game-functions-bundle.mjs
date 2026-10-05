// 게임 상세 페이지를 Cloudflare 가 묶는 방식(esbuild keepNames)으로 다시 묶어 렌더하고, 페이지의 인라인 스크립트가
// 브라우저에서 오류 없이 도는지 본다. keepNames 는 함수마다 __name(fn, "이름") 래퍼를 넣는데, 템플릿이 함수를
// toString 으로 페이지에 심기 때문에 래퍼가 브라우저까지 따라간다 (2026-10 실서비스: "__name is not defined").
// 실행: node scripts/test-game-functions-bundle.mjs  (먼저 게임 데이터와 game-ssr 번들이 빌드돼 있어야 한다)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-functions-'));
const outfile = path.join(outDir, 'game-route.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'functions/_lib/game-route.js')], bundle: true, format: 'esm', platform: 'neutral', keepNames: true, outfile, logLevel: 'silent' });
const { handleGameRequest } = await import(pathToFileURL(outfile).href);

// Pages 런타임 흉내: 정적 자산은 docs/ 에서, 캐시는 항상 비어 있다
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const ASSETS = { fetch: async (request) => {
  const file = path.join(docs, decodeURIComponent(new URL(request.url).pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('missing', { status: 404 });
} };
const slug = fs.readdirSync(path.join(docs, 'games-data')).map((f) => f.replace(/\.json$/, '')).find((s) => s === 'roblox') || fs.readdirSync(path.join(docs, 'games-data')).find((f) => !f.startsWith('_')).replace(/\.json$/, '');

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
let checked = 0;
try {
  for (const [code, prefix] of [['en', ''], ['ko', '/ko']]) {
    const url = `https://gamerscroll.com${prefix}/games/${encodeURIComponent(slug)}/`;
    const response = await handleGameRequest({ request: new Request(url, { headers: { host: 'gamerscroll.com' } }), env: { ASSETS }, next: async () => new Response('next', { status: 599 }) }, code);
    assert.equal(response.status, 200, `${code}: status`);
    const html = await response.text();
    assert.ok(html.includes('__name('), `${code}: keepNames 래퍼가 페이지에 없다 — 이 검사가 더는 실제 상황을 재현하지 못한다`);
    assert.ok(html.indexOf('var __name=') > 0 && html.indexOf('var __name=') < html.indexOf('__name('), `${code}: __name 정의가 첫 사용보다 앞에 있어야 한다`);

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // 바깥 요청(스타일·이미지·광고)은 모두 막고 인라인 스크립트만 돌린다
    await page.route('**/*', (route) => (route.request().url() === url ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : route.abort()));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    assert.deepEqual(errors, [], `${code}: 페이지 스크립트 오류`);
    // 차트 조작 스크립트가 실제로 붙었는지: 범례 버튼을 누르면 눌림 상태가 바뀐다
    const legend = page.locator('.rk-interactive-chart [data-chart-series]').first();
    if (await legend.count()) {
      await legend.dispatchEvent('click');
      assert.equal(await legend.getAttribute('aria-pressed'), 'false', `${code}: 범례 버튼이 반응하지 않는다`);
    }
    await page.close();
    checked++;
  }
} finally {
  await browser.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}
console.log(`PASS game functions bundle (keepNames) renders ${checked} editions without script errors — ${slug}`);
