// 게임 상세 하단의 가로 배너와 관련 게임 카드('순위가 비슷한 게임' · '<개발사>의 다른 게임')를 실제 Pages Function 경로
// (functions/_lib/game-route.js → game-ssr.js 번들)로 렌더해 검사한다: 서버 HTML 에 같은 에디션 링크가 들어 있는지,
// 배너가 분석 카드 아래에 있는지, 같은 개발사 게임이 없으면 오른쪽 카드가 빠지고 왼쪽 카드가 전체 폭을 쓰는지.
// 실행: node scripts/test-game-related.mjs  (먼저 node scripts/generate-game-pages.js 와 node scripts/build-game-ssr.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const dataDir = path.join(docs, 'games-data');
const PREFIX = { en: '', ja: '/ja', 'zh-cn': '/zh-cn', ko: '/ko', 'zh-tw': '/zh-tw' };
const AD_SLOTS = { pc: '1795150514', mobile: '5825162341' }; // layout.js AD_SLOTS.ResponsivePC001 · Mobile001

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-related-'));
const outfile = path.join(outDir, 'game-route.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'functions/_lib/game-route.js')], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
const { handleGameRequest } = await import(pathToFileURL(outfile).href);

const readGame = (slug) => JSON.parse(fs.readFileSync(path.join(dataDir, `${slug}.json`), 'utf8'));
const virtual = new Map(); // 테스트용 게임 데이터 (docs 에 쓰지 않는다)
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const ASSETS = { fetch: async (request) => {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const name = pathname.replace(/^\/games-data\//, '').replace(/\.json$/, '');
  if (pathname.startsWith('/games-data/') && virtual.has(name)) return new Response(JSON.stringify(virtual.get(name)));
  const file = path.join(docs, pathname);
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('missing', { status: 404 });
} };

async function render(code, slug) {
  const url = `https://gamerscroll.com${PREFIX[code]}/games/${encodeURIComponent(slug)}/`;
  const response = await handleGameRequest({ request: new Request(url, { headers: { host: 'gamerscroll.com' } }), env: { ASSETS }, next: async () => new Response('next', { status: 599 }) }, code);
  assert.equal(response.status, 200, `${code} ${slug}: status`);
  return cheerio.load(await response.text());
}

const expectedHref = (code, slug) => `${PREFIX[code]}/games/${encodeURIComponent(slug)}/`;

// 배너: 분석 카드 바로 뒤, PC 970×250 고정 단위(상단 광고와 같은 규격) + 모바일 300×250 단위. 상단 광고와 붙어 있지 않다.
function checkBanner($, label) {
  const banner = $('#game .game-page-grid > .gs-ad-inpage');
  assert.equal(banner.length, 1, `${label}: one in-page banner`);
  const pc = banner.find(`ins.adsbygoogle[data-ad-slot="${AD_SLOTS.pc}"]`);
  assert.equal(pc.length, 1, `${label}: PC banner ins`);
  assert.equal(pc.attr('data-ad-format'), undefined, `${label}: PC banner has no auto-size format`);
  const card = pc.parent();
  assert.ok(card.is('.ad-card.ad-card-responsive-home.gs-ad-fixed'), `${label}: PC banner uses the top-ad billboard card`);
  const css = card.find('style').text();
  assert.match(css, /width:970px;[^}]*height:250px/, `${label}: PC banner requests 970×250`);
  assert.match(css, /height:250px; min-height:250px; max-height:250px/, `${label}: PC banner reserves 250px`);
  assert.equal(banner.find(`.ad-card-mobile-top ins.adsbygoogle[data-ad-slot="${AD_SLOTS.mobile}"]`).length, 1, `${label}: mobile 300×250 ins`);
  const prev = banner.prev();
  assert.ok(prev.is('.home-card.grid-full') && prev.find('.rk-game .rk-grid2').length, `${label}: banner directly follows the analysis card`);
  assert.ok(!prev.is('.ad-card') && !banner.prevAll('.ad-card').length, `${label}: not adjacent to the top ad`);
}

function checkCard($, card, code, items, related, label) {
  const links = card.find('a.rk-rel-item');
  assert.equal(links.length, items.length, `${label}: item count`);
  links.each((i, a) => {
    const entry = related.g[items[i][0]];
    assert.equal($(a).attr('href'), expectedHref(code, entry.s), `${label}: same-edition href #${i}`);
    assert.ok(fs.existsSync(path.join(dataDir, `${entry.s}.json`)), `${label}: link target has a game page (${entry.s})`);
    assert.equal($(a).find('.rk-rel-tx .t').text(), (entry.n && entry.n[code]) || entry.k, `${label}: name #${i}`);
    if (items[i][2]) assert.match($(a).find('.rk-rel-rank').text(), new RegExp(`${items[i][2]}`), `${label}: rank text #${i}`);
    if (entry.i) assert.ok($(a).find('.rk-rel-ic img[data-gs-src][data-img-fallback]').length, `${label}: lazy icon #${i}`);
  });
}

let checked = 0;
try {
  // 1) 실제 데이터: 리니지M (한국 매출 순위권, 같은 개발사 게임 있음) — 다섯 에디션 모두
  const slug = '리니지m';
  const game = readGame(slug);
  assert.ok(game.related && game.related.e.ko && game.related.e.ko.k === 'rank', 'sample is in the ko ranking list');
  for (const code of Object.keys(PREFIX)) {
    const mine = game.related.e[code];
    const $ = await render(code, slug);
    const label = `${code} ${slug}`;
    checkBanner($, label);
    const section = $('#game .game-page-grid > .rk.rk-related');
    assert.ok(section.prev().is('.gs-ad-inpage'), `${label}: cards follow the banner`);
    if (mine.n.length) checkCard($, section.find('.rk-rel-near'), code, mine.n, game.related, `${label} near`);
    if (mine.d.length) checkCard($, section.find('.rk-rel-dev'), code, mine.d, game.related, `${label} developer`);
    assert.equal(section.hasClass('rk-related-single'), !(mine.n.length && mine.d.length), `${label}: full width only with one card`);
    if (code === 'ko') {
      assert.equal(mine.n.length, 6, 'ko: six ranking neighbours');
      assert.ok(mine.d.length >= 1, 'ko: NCSOFT has other games');
      assert.equal(section.find('.rk-rel-near h2').text(), '순위가 비슷한 게임');
      assert.equal(section.find('.rk-rel-dev h2').text(), `${game.developer}의 다른 게임`);
      section.find('a.rk-rel-item').each((i, a) => assert.ok($(a).attr('href').startsWith('/ko/games/'), 'ko links stay in /ko/'));
    }
    checked++;
  }

  // 2) 같은 개발사의 다른 게임이 없는 게임: 오른쪽 카드 없음, 왼쪽 카드 전체 폭
  const noDev = { ...game, slug: 'zz-test-no-developer-games', related: { g: game.related.g, e: { ko: { ...game.related.e.ko, d: [] } } } };
  virtual.set(noDev.slug, noDev);
  {
    const $ = await render('ko', noDev.slug);
    checkBanner($, 'ko no-developer');
    const section = $('#game .game-page-grid > .rk.rk-related');
    assert.equal(section.find('.rk-rel-dev').length, 0, 'no developer card');
    assert.equal(section.find('.rk-rel-near a.rk-rel-item').length, 6, 'ranking card kept');
    assert.ok(section.hasClass('rk-related-single'), 'ranking card spans the full width');
    checked++;
  }

  // 3) 관련 게임이 하나도 없는 게임: 배너만 남고 카드 영역은 없다
  const none = { ...game, slug: 'zz-test-no-related', related: null };
  virtual.set(none.slug, none);
  {
    const $ = await render('ko', none.slug);
    checkBanner($, 'ko no-related');
    assert.equal($('.rk-related').length, 0, 'no related section');
    checked++;
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
console.log(`PASS game related cards + in-page banner: ${checked} renders`);
