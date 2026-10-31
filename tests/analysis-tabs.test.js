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
