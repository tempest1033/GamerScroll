'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const { latinSlug, asciiSlug, uniqueOf } = require('../src/build/game-slug');
const { migrate } = require('../scripts/migrate-game-slugs');
const { analysisEntry } = require('../src/build/analysis-pages');

test('a game with a Latin name gets an ASCII slug from it', () => {
  assert.equal(latinSlug('MONOPOLY GO! (모노폴리 GO!)', { names: { ko: 'MONOPOLY GO! (모노폴리 GO!)', en: 'MONOPOLY GO!' } }), 'monopoly-go');
  assert.equal(latinSlug('리니지M', { aliases: ['리니지엠', 'Lineage M', 'リネージュM'] }), 'lineage-m');
  assert.equal(latinSlug('로얄 매치 (Royal Match)', {}), 'royal-match');
  assert.equal(latinSlug('Magical Girl Witch Trials (魔法少女ノ魔女裁判)', {}), 'magical-girl-witch-trials');
  assert.equal(latinSlug('Pokémon GO', {}), 'pokemon-go');
  assert.equal(asciiSlug('88 Fortunes™ Casino'), '88-fortunes-casino');
});

test('store names punctuated with full-width marks and short names that open the DB key count as Latin names', () => {
  assert.equal(latinSlug('Idle Junkyard Tycoon: 아이들 정크야드', { names: { en: 'Idle Junkyard Tycoon：Recycling' } }), 'idle-junkyard-tycoon-recycling');
  assert.equal(latinSlug('Fidget Toys Trading: 팝잇 거래 게임', { names: { en: 'Fidget Toys Trading・Pop It 3D' } }), 'fidget-toys-trading-pop-it-3d');
  assert.equal(latinSlug('WPL : 홀덤, 토너먼트, 오마하', { aliases: ['WPL', 'WPL포커'] }), 'wpl');
  assert.equal(latinSlug('한게임 포커', { aliases: ['HG'] }), '', 'a short alias that is not the name in the key');
});

test('a registered game keeps its retired slugs through a sync merge, and a new game never takes one', async () => {
  const { processGame, buildNameKeyIndex, getRegCtx } = require('../scripts/sync-and-enrich');
  const gamesData = { games: {
    'MapleStory : Idle RPG': { appIds: { android: 'com.nexon.ma' }, aliases: [], developer: 'NEXON', icon: 'i', slug: 'maplestory-idle-rpg', platforms: ['android'], names: { ko: '메이플 키우기' }, legacySlugs: ['메이플-키우기'] },
  } };
  const stats = { existing: 0, steam: 0 };
  const run = (title, appId) => processGame({ platform: 'steam', region: 'global', appId, title, developer: 'Dev', icon: '' }, gamesData, new Map(), buildNameKeyIndex(gamesData.games), stats, null);
  await run('MapleStory : Idle RPG', 111);
  assert.deepEqual(gamesData.games['MapleStory : Idle RPG'].legacySlugs, ['메이플-키우기']);
  assert.deepEqual(gamesData.games['MapleStory : Idle RPG'].names, { ko: '메이플 키우기' });
  assert.equal(gamesData.games['MapleStory : Idle RPG'].appIds.steam, 111);
  await run('메이플 키우기', 222);
  assert.equal(gamesData.games['메이플 키우기'].slug, '메이플-키우기-dev', 'the retired slug still redirects, so it is not free');
  assert.ok(getRegCtx(gamesData, new Map()).slugs.has('메이플-키우기'));
});

test('each edition shows the name in its own script when the game has one', () => {
  const i18n = require('../src/i18n');
  const S = require('../src/rank/stats').loadRankStats();
  const nameIn = (code, key) => { i18n.setEdition(code); return S.displayName(S.games.find((g) => g.key === key)); };
  try {
    assert.match(nameIn('ja', 'Magical Girl Witch Trials (魔法少女ノ魔女裁判)'), /魔法少女ノ魔女裁判/);
    assert.match(nameIn('ja', 'NAMAKORIUM (ナマコリウム)'), /ナマコリウム/);
    assert.equal(nameIn('en', 'Magical Girl Witch Trials (魔法少女ノ魔女裁判)'), 'Magical Girl Witch Trials');
    assert.equal(nameIn('ko', 'NAMAKORIUM (ナマコリウム)'), 'NAMAKORIUM');
    assert.equal(nameIn('ja', '벽람항로'), 'アズールレーン', 'an alias in the edition\'s script comes before the English store name');
    assert.equal(nameIn('en', '벽람항로'), 'Azur Lane');
    assert.equal(nameIn('ko', '벽람항로'), '벽람항로');
    assert.equal(nameIn('zh-cn', '두근두근타운'), '心动小镇', 'a Simplified alias comes before the English store name');
    assert.equal(nameIn('zh-tw', '두근두근타운'), '心動小鎮');
    assert.equal(nameIn('zh-cn', '메이플스토리M'), '枫之谷M', 'a Chinese name on record in Traditional is shown converted on the Simplified edition');
    assert.equal(nameIn('zh-tw', '메이플스토리M'), '楓之谷M');
    assert.equal(nameIn('zh-cn', '代號鳶-沉浸式劇情卡牌手遊'), '代号鸢-沉浸式剧情卡牌手游');
    assert.equal(nameIn('zh-tw', '代號鳶-沉浸式劇情卡牌手遊'), '代號鳶-沉浸式劇情卡牌手遊');
  } finally { i18n.setEdition('en'); }
});

test('a game known only by a native-script name has no Latin slug', () => {
  assert.equal(latinSlug('리니지M(12)', { aliases: ['리니지엠'], names: { ko: '리니지M(12)' } }), '');
  assert.equal(latinSlug('레퀴엠M(CBT)', {}), '', 'a short tag in parentheses is not a name');
  assert.equal(latinSlug('LINE：ブロックジャム (LY Corporation)', { developer: 'LY Corporation' }), '', 'the developer disambiguator is not a name');
  assert.equal(latinSlug('三国杀', { names: { en: '三国杀' } }), '');
});

test('migration renames only non-ASCII slugs of games with a Latin name and keeps the old slug', () => {
  const data = { games: {
    'MONOPOLY GO! (모노폴리 GO!)': { slug: 'monopoly-go-모노폴리-go', names: { en: 'MONOPOLY GO!' } },
    '나이트 크로우': { slug: '나이트-크로우', developer: 'Wemade Co., Ltd', aliases: ['Night Crows'] },
    'Night Crows': { slug: 'night-crows' },
    '운빨존많겜': { slug: '운빨존많겜' },
    Roblox: { slug: 'roblox' },
  } };
  const renamed = migrate(data);
  assert.deepEqual(renamed.map((r) => [r.from, r.to]), [['monopoly-go-모노폴리-go', 'monopoly-go'], ['나이트-크로우', 'night-crows-wemade-co']]);
  assert.deepEqual(data.games['MONOPOLY GO! (모노폴리 GO!)'], { slug: 'monopoly-go', names: { en: 'MONOPOLY GO!' }, legacySlugs: ['monopoly-go-모노폴리-go'] });
  assert.equal(data.games['운빨존많겜'].slug, '운빨존많겜');
  assert.deepEqual(migrate(data), [], 'a second run changes nothing');
  assert.equal(uniqueOf('a', '', new Set(['a', 'a-2'])), 'a-3');
});

test('data keyed by a retired slug still resolves to the game', () => {
  const game = { slug: 'lineage-m', legacySlugs: ['리니지m'] };
  assert.deepEqual(analysisEntry(game, { '리니지m': ['en', 'ko'] }), { slug: '리니지m', editions: ['en', 'ko'] });
  assert.equal(analysisEntry(game, { 'other': ['ko'] }), null);

  const i18n = require('../src/i18n');
  const { generateGamePage } = require('../src/templates/pages/game');
  i18n.setEdition('ko');
  const html = generateGamePage({ name: 'Lineage M', slug: 'lineage-m', platforms: [], names: {}, analysis: ['ko'], analysisSlug: '리니지m' }, undefined, {});
  assert.match(html, /<a href="\/ko\/games\/lineage-m\/" aria-current="page">/);
  assert.match(html, /<a href="\/ko\/analysis\/%EB%A6%AC%EB%8B%88%EC%A7%80m\/">/);
  i18n.setEdition('en');
});

test('a retired slug 301s to the current game URL in the same edition; an unknown slug is a 404', async () => {
  const stub = { name: 'game-ssr-stub', setup(build) {
    build.onResolve({ filter: /game-ssr\.js$/ }, () => ({ path: 'stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const createRenderer = () => ({ render: () => "<head></head>page", parse: (b) => JSON.parse(new TextDecoder().decode(b)) }); export const BUNDLE_VERSION = "t"; export const WARMUP = { game: {}, meta: {} };' }));
  } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-route-'));
  const outfile = path.join(dir, 'game-route.mjs');
  await esbuild.build({ entryPoints: [path.join(__dirname, '..', 'functions/_lib/game-route.js')], bundle: true, format: 'esm', platform: 'neutral', plugins: [stub], outfile, logLevel: 'silent' });
  const { handleGameRequest } = await import(pathToFileURL(outfile).href);
  // As on Cloudflare Pages right after a deploy: the retired slug's data file is still served from the previous
  // deployment, and a page rendered from it sits in the Cache API. The redirect must win over both.
  const stalePage = (req) => (new URL(req.url).pathname.includes('%EB%AA%A8') ? new Response('stale page') : undefined);
  globalThis.caches = { default: { match: async (req) => stalePage(req), put: async () => {} } };
  const assets = { '/games-data/_meta.json': '{"version":"1"}', '/games-data/_redirects.json': JSON.stringify({ 'monopoly-go-모노폴리-go': 'monopoly-go' }), '/games-data/monopoly-go.json': '{"slug":"monopoly-go"}', '/games-data/monopoly-go-모노폴리-go.json': '{"slug":"monopoly-go-모노폴리-go"}' };
  const ASSETS = { fetch: async (req) => { const body = assets[decodeURIComponent(new URL(req.url).pathname)]; return body ? new Response(body) : new Response('missing', { status: 404 }); } };
  const visit = (p, code) => handleGameRequest({ request: new Request(`https://gamerscroll.com${p}`, { headers: { host: 'gamerscroll.com' } }), env: { ASSETS }, next: async () => new Response('next', { status: 599 }) }, code);

  const moved = await visit('/ja/games/monopoly-go-%EB%AA%A8%EB%85%B8%ED%8F%B4%EB%A6%AC-go/?x=1', 'ja');
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), '/ja/games/monopoly-go/?x=1');
  assert.equal((await visit('/games/monopoly-go-%EB%AA%A8%EB%85%B8%ED%8F%B4%EB%A6%AC-go', 'en')).headers.get('location'), '/games/monopoly-go/');
  assert.equal((await visit('/games/monopoly-go/', 'en')).status, 200);
  assert.equal((await visit('/games/never-existed/', 'en')).status, 404);

  // A new isolate that cannot read the redirect map does not know whether a slug is retired: no cached page, no render.
  const fresh = await import(`${pathToFileURL(outfile).href}?isolate=2`);
  let mapUp = false;
  const flaky = { fetch: async (req) => (!mapUp && new URL(req.url).pathname.endsWith('/_redirects.json') ? new Response('down', { status: 500 }) : ASSETS.fetch(req)) };
  const visitFresh = (p) => fresh.handleGameRequest({ request: new Request(`https://gamerscroll.com${p}`, { headers: { host: 'gamerscroll.com' } }), env: { ASSETS: flaky }, next: async () => new Response('next', { status: 599 }) }, 'en');
  for (const p of ['/games/monopoly-go-%EB%AA%A8%EB%85%B8%ED%8F%B4%EB%A6%AC-go/', '/games/monopoly-go/']) {
    const down = await visitFresh(p);
    assert.equal(down.status, 503, p);
    assert.equal(down.headers.get('cache-control'), 'no-store');
    assert.notEqual(await down.text(), 'stale page');
  }
  mapUp = true;
  assert.equal((await visitFresh('/games/monopoly-go-%EB%AA%A8%EB%85%B8%ED%8F%B4%EB%A6%AC-go/')).status, 301, 'the failed read is retried on the next request');
  assert.equal((await visitFresh('/games/monopoly-go/')).status, 200);
  fs.rmSync(dir, { recursive: true, force: true });
});
