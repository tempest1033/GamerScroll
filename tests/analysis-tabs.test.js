'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { parseAnalysisSitemap } = require('../src/build/analysis-pages');
const { generateGamePage } = require('../src/templates/pages/game');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://gamerscroll.com/ko/analysis/%EB%A6%AC%EB%8B%88%EC%A7%80m/</loc></url>
<url><loc>https://gamerscroll.com/analysis/%EB%A6%AC%EB%8B%88%EC%A7%80m/</loc></url>
<url><loc>https://gamerscroll.com/zh-tw/analysis/where-winds-meet/</loc></url>
<url><loc>https://gamerscroll.com/ko/analysis/</loc></url>
<url><loc>https://example.com/ja/analysis/foreign/</loc></url>
</urlset>`;

test('metrics sitemap → editions per game, ignoring hubs and foreign hosts', () => {
  assert.deepEqual(parseAnalysisSitemap(sitemap), { '리니지m': ['en', 'ko'], 'where-winds-meet': ['zh-tw'] });
  assert.equal(parseAnalysisSitemap('<html>404</html>'), null);
});

test('public game page shows the metrics tab only for editions that have the page', () => {
  const game = { name: 'Tab test', slug: '탭-test', platforms: [], names: {}, analysis: ['ko'] };
  const render = (code, data) => { i18n.setEdition(code); return generateGamePage(data, undefined, {}); };
  assert.match(render('ko', game), /<nav class="game-tabs[^"]*"[^>]*><a href="\/ko\/games\/%ED%83%AD-test\/" aria-current="page">순위 기록<\/a><a href="\/ko\/analysis\/%ED%83%AD-test\/">지표 분석<i class="game-tabs-new">NEW<\/i><\/a><\/nav>/);
  assert.doesNotMatch(render('en', game), /<nav class="game-tabs/);
  assert.doesNotMatch(render('ko', { ...game, analysis: undefined }), /<nav class="game-tabs/);
  i18n.setEdition('en');
});

test('a failed sitemap refresh drops the previous list instead of keeping stale tabs', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-pages-'));
  const file = path.join(dir, 'analysis-pages.json');
  fs.writeFileSync(file, JSON.stringify({ 'removed-game': ['ko'] }));
  const stub = path.join(dir, 'fetch-404.js');
  fs.writeFileSync(stub, 'globalThis.fetch = async () => ({ ok: false, status: 404 });');
  execFileSync(process.execPath, ['-r', stub, path.join(__dirname, '..', 'scripts', 'fetch-analysis-pages.js')],
    { env: { ...process.env, ANALYSIS_PAGES_FILE: file }, stdio: 'pipe' });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  fs.rmSync(dir, { recursive: true, force: true });
});
