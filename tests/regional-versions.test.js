'use strict';
// Separate regional records of one title (different store apps and rank histories) stay separate pages; where an edition
// indexes two or more of them under one name, each names its market and links the others (src/build/regional-versions.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const i18n = require('../src/i18n');
const { regionalVersions } = require('../src/build/regional-versions');

const inEdition = (code, fn) => { const before = i18n.currentEdition().code; i18n.setEdition(code); try { return fn(); } finally { i18n.setEdition(before); } };
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
const titleOf = (html) => dec(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
const h1Of = (html) => dec(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
const appOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((n) => n['@type'] === 'SoftwareApplication');
const CODES = ['en', 'ja', 'zh-cn', 'ko', 'zh-tw'];

// Daily rank series with `n` chart days on one market's store.
const charted = (country, store, n) => ({ [country]: { [store]: { o: 0, v: Array(n).fill(5) } } });
const IOS = { ios: '1' }, ANDROID = { android: 'a.b' }, BOTH = { ios: '1', android: 'a.b' };
const page = (slug, s, developer, { name = 'Fate/Grand Order', editions = ['en'], appIds = BOTH, steamDays = 0 } = {}) => ({ slug, editions, s, developer, appIds, steamDays, names: Object.fromEntries(CODES.map((c) => [c, name])) });
const FGO = [
  page('fategrand-order', charted('jp', 'ios', 300), 'Aniplex Inc.'),
  page('fategrand-order-us', charted('tw', 'android', 200), 'Komoe', { appIds: ANDROID }),
  page('fate-grand-order-wuhu-sharejoy', charted('cn', 'ios', 250), 'Wuhu Sharejoy network technology Co. Ltd'),
  page('fategrand-order-moe-lee', charted('tw', 'ios', 220), 'Moe Lee', { appIds: IOS }),
  page('fgo-unlisted', charted('us', 'ios', 3), 'Aniplex', { editions: ['ja'] }),
  page('arknights', charted('us', 'android', 90), 'Yostar', { name: 'Arknights' }),
];

test('each same-name page of an edition gets its market, with the store or developer only where the market repeats', () => {
  const out = regionalVersions(FGO, CODES);
  assert.deepEqual(out['fategrand-order'].en.q, { m: 'jp' });
  assert.deepEqual(out['fate-grand-order-wuhu-sharejoy'].en.q, { m: 'cn' });
  assert.deepEqual(out['fategrand-order-us'].en.q, { m: 'tw', st: 'android' });
  assert.deepEqual(out['fategrand-order-moe-lee'].en.q, { m: 'tw', st: 'ios' });
  assert.deepEqual(out['fategrand-order'].en.o.map((o) => o.s), ['fategrand-order-us', 'fate-grand-order-wuhu-sharejoy', 'fategrand-order-moe-lee']);
  assert.equal(out['fgo-unlisted'], undefined, 'alone under its name in the only edition that indexes it');
  assert.equal(out.arknights, undefined, 'a name of its own');
  assert.deepEqual(Object.keys(out['fategrand-order']), ['en']);
});

test('a record charting in several countries is Global; a country only when its whole history is there', () => {
  const tft = [
    page('tft', { ...charted('kr', 'android', 300), ...charted('us', 'ios', 200), jp: { ios: { o: 0, v: [40] } } }, 'Riot Games', { name: 'TFT' }),
    page('tft-kr', charted('kr', 'ios', 100), 'Riot Games, Inc', { name: 'TFT' }),
  ];
  const out = regionalVersions(tft, ['en']);
  assert.deepEqual([out.tft.en.q, out['tft-kr'].en.q], [{ m: 'global' }, { m: 'kr' }]);
  const two = regionalVersions([
    page('a', { ...charted('kr', 'ios', 9), ...charted('jp', 'ios', 9) }, 'X', { name: 'Once Human', appIds: IOS }),
    page('b', { ...charted('tw', 'android', 9), ...charted('us', 'android', 9) }, 'Y', { name: 'Once Human', appIds: ANDROID }),
  ], ['en']);
  assert.deepEqual([two.a.en.q, two.b.en.q], [{ m: 'global', st: 'ios' }, { m: 'global', st: 'android' }], 'the store only where Global repeats');
  inEdition('ja', () => assert.equal(require('../src/templates/pages/game').regionalName('TFT', { m: 'global' }), 'TFT（グローバル）'));
});

test('the store tells pages apart only when each has apps on one store and those differ; otherwise the developer does', () => {
  const global = { ...charted('kr', 'android', 50), ...charted('us', 'ios', 50) };
  const gf2 = regionalVersions([
    page('girls-frontline-2', global, 'HaoPlay Limited', { name: "GIRLS' FRONTLINE 2: EXILIUM" }),
    page('girls-frontline-2-exilium', { ...charted('us', 'android', 20), ...charted('jp', 'ios', 5) }, 'Darkwinter Software Co., Ltd.', { name: "GIRLS' FRONTLINE 2: EXILIUM", appIds: { ...BOTH, steam: '3308670' } }),
  ], ['en']);
  assert.deepEqual(gf2['girls-frontline-2'].en.q, { m: 'global', d: 'HaoPlay Limited', ds: 'HaoPlay' }, 'a page on both stores is never labelled with one');
  assert.deepEqual(gf2['girls-frontline-2-exilium'].en.q, { m: 'global', d: 'Darkwinter Software Co., Ltd.', ds: 'Darkwinter Software' });
  // one page on both stores, one on the App Store only: the App Store tells neither from the other
  const mixedStores = regionalVersions([
    page('a-both', charted('tw', 'android', 60), 'Studio Alpha Inc.', { name: 'Twin Store Game', editions: ['zh-tw'] }),
    page('a-ios', charted('tw', 'ios', 60), 'Studio Beta Ltd.', { name: 'Twin Store Game', editions: ['zh-tw'], appIds: { ios_tw: '2' } }),
  ], ['zh-tw']);
  assert.deepEqual([mixedStores['a-both']['zh-tw'].q, mixedStores['a-ios']['zh-tw'].q], [
    { m: 'tw', d: 'Studio Alpha Inc.', ds: 'Studio Alpha' }, { m: 'tw', d: 'Studio Beta Ltd.', ds: 'Studio Beta' }]);
  // developers differing only in case and punctuation count as identical: the longer history is indexed, the other is noindex
  const devCase = regionalVersions([
    page('dev-case-a', charted('tw', 'android', 80), 'Netmarble Joybomb Inc.', { name: 'Case Dev Game', editions: ['zh-tw'] }),
    page('dev-case-b', charted('tw', 'ios', 60), 'NETMARBLE JOYBOMB INC', { name: 'Case Dev Game', editions: ['zh-tw'], appIds: { ios_tw: '2' } }),
  ], ['zh-tw']);
  assert.deepEqual(devCase, { 'dev-case-b': { 'zh-tw': { x: 'dev-case-a' } } });
  const devCaseThree = regionalVersions([
    page('dc-1', charted('tw', 'android', 80), 'Future TV Co., Ltd.', { name: 'Three Dev', editions: ['en'] }),
    page('dc-2', charted('tw', 'ios', 40), 'FUTURE TV CO.,LTD', { name: 'Three Dev', editions: ['en'] }),
    page('dc-3', charted('tw', 'android', 50), 'Other Studio', { name: 'Three Dev', editions: ['en'] }),
  ], ['en']);
  assert.deepEqual(devCaseThree['dc-2'].en, { x: 'dc-1' });
  assert.deepEqual(devCaseThree['dc-1'].en.q, { m: 'tw', d: 'Future TV Co., Ltd.', ds: 'Future TV' });
  assert.deepEqual(devCaseThree['dc-3'].en.q, { m: 'tw', d: 'Other Studio' });
  // the developer first, then the store between the two one-store pages of one developer
  const mixed = regionalVersions([
    page('x', global, 'Dev X', { name: 'Same' }),
    page('y-ios', global, 'Dev Y', { name: 'Same', appIds: IOS }),
    page('y-android', global, 'Dev Y', { name: 'Same', appIds: ANDROID }),
  ], ['en']);
  assert.deepEqual(['x', 'y-ios', 'y-android'].map((s) => mixed[s].en.q), [{ m: 'global', d: 'Dev X' }, { m: 'global', st: 'ios', d: 'Dev Y' }, { m: 'global', st: 'android', d: 'Dev Y' }]);
  // a shortened developer that would meet another's is not offered
  const near = regionalVersions([page('p', global, 'Sparks Info Ltd.', { name: 'Z' }), page('r', global, 'Sparks Info', { name: 'Z' })], ['en']);
  assert.deepEqual([near.p.en.q, near.r.en.q], [{ m: 'global', d: 'Sparks Info Ltd.' }, { m: 'global', d: 'Sparks Info' }]);
});

test('a labelled title shortens its label before its name, and never cuts the name', () => {
  const { gameTitle, regionalName } = require('../src/templates/pages/game');
  const { width } = require('../src/templates/helpers/fit-description');
  inEdition('en', () => {
    const name = "GIRLS' FRONTLINE 2: EXILIUM";
    assert.equal(gameTitle(name, ['ios', 'android'], { m: 'global', d: 'HaoPlay Limited', ds: 'HaoPlay' }), "GIRLS' FRONTLINE 2: EXILIUM (Global, HaoPlay) Grossing Rank History");
    assert.equal(gameTitle(name, ['ios', 'android'], { m: 'global', d: 'Darkwinter Software Co., Ltd.', ds: 'Darkwinter Software' }), "GIRLS' FRONTLINE 2: EXILIUM (Global, Darkwinter Software Co., Ltd.)", 'the whole name and label without the template before the main part of the name');
    const q = { m: 'jp', st: 'ios' };
    const title = gameTitle('A Game About Feeding A Black Hole: And Other Very Long Stories Told Twice', ['ios'], q);
    assert.equal(title, 'A Game About Feeding A Black Hole (Japan, App Store)', 'the main part only where the whole name cannot fit with its label');
    assert.ok(width(title) <= 70);
    const long = 'A Game About Feeding A Black Hole And Other Very Long Stories Told Twice';
    assert.equal(gameTitle(long, ['ios'], q), regionalName(long, q), 'a name no title fits: the labelled name alone, uncut');
    assert.equal(gameTitle('Fate/Grand Order', ['ios'], { m: 'jp' }), 'Fate/Grand Order (Japan) Grossing Rank History');
  });
});

test('pages whose shortened titles meet are told apart although their full names differ', () => {
  const a = { ...page('medal', charted('jp', 'ios', 40), 'Konami', { name: 'コナステ メダルコーナー | コナミの メダル', appIds: IOS }), titles: { en: 'コナステ メダルコーナー Grossing Rank History' } };
  const b = { ...page('medal-gp', charted('jp', 'android', 40), 'KONAMI', { name: 'コナステ メダルコーナー | コナミのメダル', appIds: ANDROID }), titles: { en: 'コナステ メダルコーナー Grossing Rank History' } };
  const out = regionalVersions([a, b], ['en']);
  assert.deepEqual([out.medal.en.q, out['medal-gp'].en.q], [{ m: 'jp', st: 'ios' }, { m: 'jp', st: 'android' }]);
});

const meta = { days: ['2026-11-24', '2026-11-25'], hourlyDate: '' };
const fgo = (slug, regional) => ({ name: 'Fate/Grand Order', slug, platforms: ['ios', 'android'], developer: 'D', steam: { rank: 3 }, steamHistory: [], rank: null, regional });

test('pages alike in market, stores and developer: the one with the longer chart history is indexed without a label, the other is noindex', () => {
  const sniper = (slug, s, android) => page(slug, s, 'Sparks Info', { name: 'Hunting Sniper', appIds: { android, ios: slug } });
  const out = regionalVersions([
    sniper('hunting-sniper-sparks-info', { ...charted('kr', 'android', 9), ...charted('tw', 'ios', 2) }, 'com.ea.huntingsniper'),
    sniper('hunting-sniper', { ...charted('us', 'android', 30), ...charted('kr', 'android', 1) }, 'com.online.huntingsniper'),
    page('hunting-sniper-jp', charted('jp', 'ios', 5), 'Other Studio', { name: 'Hunting Sniper' }),
  ], ['en']);
  assert.deepEqual(out['hunting-sniper-sparks-info'].en, { x: 'hunting-sniper' });
  assert.deepEqual(out['hunting-sniper'].en.q, { m: 'global' }, 'no app ID in the label');
  assert.deepEqual(out['hunting-sniper'].en.o, [{ s: 'hunting-sniper-jp', n: 'Hunting Sniper', q: { m: 'jp' } }]);
  // Steam apps: the Steam chart history decides
  const gta = (slug, steamDays) => page(slug, {}, 'Rockstar North', { name: '그랜드테프트오토', editions: ['ko'], appIds: { steam: slug }, steamDays });
  assert.deepEqual(regionalVersions([gta('grand-theft-auto-v-enhanced', 100), gta('grand-theft-auto-v-legacy', 300)], ['ko']), { 'grand-theft-auto-v-enhanced': { ko: { x: 'grand-theft-auto-v-legacy' } } });
  const { generateGamePage } = require('../src/templates/pages/game');
  inEdition('en', () => {
    const html = generateGamePage(fgo('hunting-sniper-sparks-info', { en: { x: 'hunting-sniper' } }), meta);
    assert.match(html, /<meta name="robots" content="noindex/);
    assert.equal(appOf(html), undefined);
    assert.equal(h1Of(html), 'Fate/Grand Order');
    assert.doesNotMatch(html, /Other regional versions/);
  });
});

test('the title, H1 and SoftwareApplication name carry the market in the edition\'s language; the page links its other regional versions', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const regional = regionalVersions(FGO, CODES)['fategrand-order'];
  const ja = { q: regional.en.q, o: regional.en.o };
  inEdition('en', () => {
    const html = generateGamePage(fgo('fategrand-order', regional), meta);
    assert.equal(titleOf(html), 'Fate/Grand Order (Japan) Grossing Rank History | GamerScroll');
    assert.equal(h1Of(html), 'Fate/Grand Order (Japan)');
    assert.equal(appOf(html).name, 'Fate/Grand Order (Japan)');
    const links = [...html.matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g)].map((m) => [m[1], dec(m[2])]);
    assert.deepEqual(links.filter(([href]) => /fate|fgo/.test(href)), [
      ['/games/fategrand-order-us/', 'Fate/Grand Order (Taiwan, Google Play)'],
      ['/games/fate-grand-order-wuhu-sharejoy/', 'Fate/Grand Order (China)'],
      ['/games/fategrand-order-moe-lee/', 'Fate/Grand Order (Taiwan, App Store)'],
    ]);
    assert.match(html, /Other regional versions/);
    const plain = generateGamePage(fgo('fategrand-order', undefined), meta);
    assert.equal(h1Of(plain), 'Fate/Grand Order', 'no other page under the name: the name alone');
  });
  inEdition('ja', () => {
    const html = generateGamePage(fgo('fategrand-order', { ja }), meta);
    assert.equal(h1Of(html), 'Fate/Grand Order（日本）');
    assert.match(titleOf(html), /^Fate\/Grand Order（日本）の売上ランキング推移/);
    assert.match(html, /Fate\/Grand Order（台湾・Google Play）/);
  });
});

// The indexable game pages of every edition as the build serves them (src/build/game-pages.js), with their titles.
function editionTitles() {
  const { loadRankStats } = require('../src/rank/stats');
  const gd = require('../src/build/game-data');
  const { loadSteamStats } = require('../src/rank/steam-stats');
  const { gamePages } = require('../src/build/game-pages');
  const { gameTitle, regionalName } = require('../src/templates/pages/game');
  const S = loadRankStats();
  const stats = loadSteamStats();
  const pages = gamePages(S, { lists: gd.steamLists(gd.loadLatestSteam(path.join(__dirname, '..', 'history'))), pages: gd.steamPageSlugs(S.games, new Set(stats.pageApps(14))), stats });
  return Object.fromEntries(CODES.map((c) => [c, inEdition(c, () => pages.filter((p) => p.editions.includes(c)).map((p) => {
    const q = p.regional && p.regional[c] && p.regional[c].q;
    const name = q ? regionalName(p.names[c], q) : p.names[c];
    return { slug: p.slug, title: gameTitle(p.names[c], p.g.platforms || [], q), name, appIds: Object.values(p.g.appIds || {}).map(String) };
  }))]));
}

test('the committed data: no two indexable game pages of an edition share a title, a title over 70 columns is the name alone, and none names an app ID', () => {
  const { width, MAX_TITLE_WIDTH } = require('../src/templates/helpers/fit-description');
  const shared = [], long = [], ids = [];
  for (const [code, rows] of Object.entries(editionTitles())) {
    const byTitle = new Map();
    for (const { slug, title } of rows) byTitle.set(title, [...(byTitle.get(title) || []), slug]);
    for (const [title, slugs] of byTitle) if (slugs.length > 1) shared.push(`${code} ${title}: ${slugs.join(', ')}`);
    for (const { slug, title, name } of rows) if (width(title) > MAX_TITLE_WIDTH && title !== name) long.push(`${code} ${slug}: ${title}`);
    for (const { slug, title, appIds } of rows) if (appIds.some((id) => id.includes('.') && title.includes(id))) ids.push(`${code} ${slug}: ${title}`);
  }
  assert.deepEqual(shared, []);
  assert.deepEqual(long, []);
  assert.deepEqual(ids, []);
});
