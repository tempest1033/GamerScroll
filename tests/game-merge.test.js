'use strict';
// The daily sync merges duplicate game records itself (scripts/sync-and-enrich.js mergeSameTitle).
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSameTitle } = require('../scripts/sync-and-enrich');

const fixture = () => ({ games: {
  Arknights: { appIds: { android: 'com.YoStarEN.Arknights' }, aliases: [], developer: 'Yostar Limited.', slug: 'arknights', platforms: ['android'], names: { en: 'Arknights' } },
  'Arknights (Yostar)': { appIds: { ios_us: '1464872022' }, aliases: ['Arknights'], developer: 'Yostar Limited.', slug: 'arknights-us', platforms: ['ios'], names: { en: 'Arknights' }, legacySlugs: ['arknights-old'] },
  // Same title, developer names that differ only in case and punctuation: not the same string, kept apart.
  'Puzzle & Dragons': { appIds: { ios_tw: '808027845' }, aliases: [], developer: 'GungHo Online Entertainment, INC.', slug: 'puzzle-dragons', platforms: ['ios'], names: { en: 'Puzzle & Dragons' } },
  'パズル＆ドラゴンズ': { appIds: { android: 'jp.gungho.pad', ios_jp: '493470467' }, aliases: [], developer: 'GungHo Online Entertainment, Inc.', slug: 'puzzle-dragons-gungho-online', platforms: ['ios', 'android'], names: { en: 'Puzzle & Dragons' } },
  // One App Store app in two records under other titles and developers: one record, under the clean slug.
  'Z Route: Redemption': { appIds: { ios: 6762268182 }, aliases: [], developer: 'BUILDING-BLOCKS NETWORK TECHNOLOGY CO.,LIMITED', slug: 'z-route-redemption', platforms: ['ios'], names: { en: 'Z Route: Redemption' } },
  'Z 루트: 리뎀션': { appIds: { android: 'com.zroute.global', ios: '6762268182' }, aliases: [], developer: '37GAMES GLOBAL', slug: 'z-route-redemption-37games-global', platforms: ['ios', 'android'], names: { ko: 'Z 루트: 리뎀션' } },
  // One shared app, but another store names two different apps: kept apart.
  'Color Slide A': { appIds: { android: 'com.awesome.puzzlehexasort', ios: '6499307202' }, aliases: [], developer: 'SayGames Ltd', slug: 'color-a', platforms: ['ios', 'android'], names: {} },
  'Color Slide B': { appIds: { android: 'com.awesome.puzzlehexasort', ios: '6590876141' }, aliases: [], developer: 'SayGames LTD', slug: 'color-b', platforms: ['ios', 'android'], names: {} },
  Solitaire: { appIds: { ios: '1' }, aliases: [], developer: 'MobilityWare', slug: 'solitaire', platforms: ['ios'], names: { ko: '솔리테어' } },
  'Solitaire Fish': { appIds: { android: 'fish' }, aliases: [], developer: 'Wood Puzzle Sudoku Games', slug: 'solitaire-fish', platforms: ['android'], names: { ko: '솔리테어' } },
  'Cats A': { appIds: { android: 'a.one' }, aliases: [], developer: 'Neowiz', slug: 'cats', platforms: ['android'], names: { en: 'Cats' } },
  'Cats B': { appIds: { android: 'b.two' }, aliases: [], developer: 'Neowiz', slug: 'cats-b', platforms: ['android'], names: { en: 'Cats' } },
  // Two different games that share only a zh-tw name; one has no developer.
  '2~4 인용 미니게임': { appIds: { ios: '1269516792' }, aliases: [], developer: 'Jochem Bergman', slug: '2-4-인용-미니게임', platforms: ['ios'], names: { 'zh-tw': '2-4人小遊戲' } },
  '2~4인 미니 게임하기': { appIds: { android: 'com.ction.playergames' }, aliases: [], developer: '', slug: '2-4인-미니-게임하기', platforms: ['android'], names: { 'zh-tw': '2-4人小遊戲' } },
  // Same title and developer, only a prefix of the developer name in common with the next one.
  'Tower A': { appIds: { ios: '7' }, aliases: [], developer: 'Moon Active', slug: 'tower', platforms: ['ios'], names: { en: 'Tower' } },
  'Tower B': { appIds: { android: 'moon.tower' }, aliases: [], developer: 'Moonton', slug: 'tower-b', platforms: ['android'], names: { en: 'Tower' } },
  // A pair without slugs: their pages live under generated slugs.
  'Puzzle Quest': { appIds: { ios: '42' }, aliases: [], developer: 'Infinity Plus 2', platforms: ['ios'], names: { en: 'Puzzle Quest' } },
  'Puzzle Quest (GP)': { appIds: { android: 'com.ip2.pq' }, aliases: [], developer: 'Infinity Plus 2', platforms: ['android'], names: { en: 'Puzzle Quest' } },
  // An App Store app whose bundle ID is another record's Google Play package is that app, whatever the titles and developers.
  'Puzzle & Dragons(龍族拼圖)': { appIds: { android: 'jp.gungho.padHT' }, aliases: [], developer: 'GungHo Online Entertainment, Inc.', slug: 'puzzle-dragons-2', platforms: ['android'], names: { 'zh-tw': 'Puzzle & Dragons(龍族拼圖)' } },
  '젤리 마스터: 먹방 ASMR': { appIds: { android: 'com.fc.p.cp.jelly.mukbang.asmr.live.diy' }, aliases: [], developer: 'FALCON GAME', slug: 'jelly-master-mukbang-asmr', platforms: ['android'], names: { en: 'Jelly Master: Mukbang ASMR' } },
  '젤리 마스터: 먹방 게임': { appIds: { ios: 6738694162 }, aliases: [], developer: 'Hieu Nguyen Trung', slug: 'jelly-master-mukbang-asmr-hieu-nguyen', platforms: ['ios'], names: { 'zh-tw': '美食直播超級巨星' } },
} });
// Revenue-chart days per app: the App Store US app and the App Store Puzzle Quest have the longer history.
const DAYS = { 1464872022: 100, 'com.YoStarEN.Arknights': 1, 42: 50, 'com.zroute.global': 30, 'jp.gungho.padHT': 40, 'com.fc.p.cp.jelly.mukbang.asmr.live.diy': 20, 6738694162: 5 };
const S = { daysOnChart: (country, store, id) => DAYS[id] || 0 };
// App Store bundle IDs (data/ios-bundle-ids.json); 493470467 is the Japanese app's, another package than the HK/TW one.
const BUNDLES = { 808027845: 'jp.gungho.padHT', 6738694162: 'com.fc.p.cp.jelly.mukbang.asmr.live.diy', 493470467: 'jp.gungho.pad' };

test('sync merges records with one title, one developer and compatible store IDs into the one with the longer chart history', () => {
  const gamesData = fixture();
  assert.deepEqual(mergeSameTitle(gamesData, S, BUNDLES), [
    { kept: 'arknights', merged: ['arknights-us'] },
    { kept: 'puzzle-dragons', merged: ['puzzle-dragons-2'] },
    { kept: 'z-route-redemption', merged: ['z-route-redemption-37games-global'] },
    { kept: 'puzzle-quest', merged: ['com-ip2-pq'] },
    { kept: 'jelly-master-mukbang-asmr', merged: ['jelly-master-mukbang-asmr-hieu-nguyen'] },
  ]);
  const kept = gamesData.games['Arknights (Yostar)'];
  assert.equal(gamesData.games.Arknights, undefined);
  assert.deepEqual(kept.appIds, { ios_us: '1464872022', android: 'com.YoStarEN.Arknights' });
  assert.equal(kept.slug, 'arknights', 'the kept record takes the clean slug');
  assert.deepEqual(kept.legacySlugs, ['arknights-old', 'arknights-us']);
  const pad = gamesData.games['Puzzle & Dragons(龍族拼圖)'];
  assert.deepEqual([pad.slug, pad.appIds], ['puzzle-dragons', { android: 'jp.gungho.padHT', ios_tw: '808027845' }], 'the HK/TW App Store app, bundle ID jp.gungho.padHT, joins the HK/TW Google Play record');
  assert.equal(gamesData.games['Puzzle & Dragons'], undefined);
  assert.deepEqual(gamesData.games['パズル＆ドラゴンズ'].appIds, { android: 'jp.gungho.pad', ios_jp: '493470467' }, 'developer strings that differ in case: kept apart');
  const jelly = gamesData.games['젤리 마스터: 먹방 ASMR'];
  assert.deepEqual([jelly.developer, jelly.appIds], ['FALCON GAME', { android: 'com.fc.p.cp.jelly.mukbang.asmr.live.diy', ios: 6738694162 }], 'one app under two developer names: one record');
  assert.equal(gamesData.games['젤리 마스터: 먹방 게임'], undefined);
  const z = gamesData.games['Z 루트: 리뎀션'];
  assert.deepEqual([z.slug, z.legacySlugs, z.appIds], ['z-route-redemption', ['z-route-redemption-37games-global'], { android: 'com.zroute.global', ios: '6762268182' }]);
  assert.equal(gamesData.games['Z Route: Redemption'], undefined, 'one App Store app: one record');
  assert.ok(gamesData.games['Color Slide A'] && gamesData.games['Color Slide B'], 'a shared app with two different App Store apps: kept apart');
  assert.deepEqual(kept.platforms, ['ios', 'android']);
  assert.ok(gamesData.games.Solitaire && gamesData.games['Solitaire Fish'], 'other developer: kept apart');
  assert.ok(gamesData.games['Cats A'] && gamesData.games['Cats B'], 'two different apps for one store: kept apart');
  assert.ok(gamesData.games['2~4 인용 미니게임'] && gamesData.games['2~4인 미니 게임하기'], 'a record without a developer: kept apart');
  assert.ok(gamesData.games['Tower A'] && gamesData.games['Tower B'], 'developer names that only share a prefix: kept apart');
  // the kept page stays under its generated slug although it gains a Google Play ID, which would generate another one
  const pq = gamesData.games['Puzzle Quest'];
  assert.equal(pq.slug, 'puzzle-quest');
  assert.deepEqual(pq.legacySlugs, ['com-ip2-pq']);
  assert.equal(gamesData.totalGames, 16);
  assert.deepEqual(mergeSameTitle(gamesData, S, BUNDLES), [], 'a merged DB stays as it is');
  assert.deepEqual(mergeSameTitle(fixture(), S, {}).map((m) => m.kept), ['arknights', 'z-route-redemption', 'puzzle-quest'], 'without bundle IDs those apps stay apart');
});

test('the daily sync looks up the bundle IDs of App Store apps that have none, each on its storefront, once', async () => {
  const { fillBundleIds } = require('../scripts/sync-and-enrich');
  const games = { A: { appIds: { ios_tw: '808027845', android: 'jp.gungho.padHT' } }, B: { appIds: { ios: '6738694162' } }, C: { appIds: { ios_us: '9' } }, D: { appIds: { ios_jp: '493470467' } } };
  const asked = [];
  const lookup = async (ids, cc, failed, attempts) => {
    asked.push(`${cc} ${ids.join(',')} ${attempts}`);
    return new Map(ids.filter((id) => id !== '9').map((id) => [id, { bundleId: `bundle.${id}` }]));
  };
  const bundles = { 493470467: 'jp.gungho.pad' };
  assert.equal(await fillBundleIds(games, bundles, lookup), 2);
  assert.deepEqual(asked, ['tw 808027845 1', 'kr 6738694162 1', 'us 9 1']);
  assert.deepEqual(bundles, { 493470467: 'jp.gungho.pad', 808027845: 'bundle.808027845', 6738694162: 'bundle.6738694162' }, 'an app the storefront does not list is asked again next run');
});

test('the committed game DB: mixed-up apps sit with their own game', () => {
  const games = Object.values(require('../scripts/sync-and-enrich').loadGames().games);
  const withApp = (slot, id) => games.filter((g) => Object.entries(g.appIds || {}).some(([s, v]) => s.split(/[_:]/)[0] === slot && String(v) === id));
  assert.deepEqual(withApp('android', 'com.dmm.games.touken').map((g) => g.slug), ['刀剣乱舞online'], 'Touken Ranbu\'s Android app on Touken Ranbu');
  const online = games.find((g) => g.slug === 'online');
  assert.ok(!(online.aliases || []).includes('刀剣乱舞ONLINE') && !(online.names || {}).ja);
  const [full] = withApp('ios', '479516143');
  assert.deepEqual([full.slug, full.appIds.android], ['minecraft-play-with-friends', 'com.mojang.minecraftpe'], 'the full Minecraft owns its clean slug');
  assert.equal(withApp('ios', '479516143').length, 1);
  assert.ok(!(withApp('steam', '2893570')[0].aliases || []).includes('DRAGON QUEST III HD-2D Remake'));
  const [pad] = withApp('ios', '808027845');
  assert.deepEqual([pad.slug, pad.appIds.android], ['puzzle-dragons', 'jp.gungho.padHT'], 'the HK/TW App Store app with the HK/TW Google Play app');
  assert.equal(withApp('android', 'jp.gungho.pad')[0].appIds.ios_tw, undefined, 'not with the Japanese record');
  assert.equal(withApp('android', 'com.fc.p.cp.jelly.mukbang.asmr.live.diy').length, 1, 'Jelly Master\'s Google Play app only on Jelly Master');
  const [jelly] = withApp('ios', '6738694162');
  assert.deepEqual([jelly.developer, jelly.appIds.android], ['FALCON GAME', 'com.fc.p.cp.jelly.mukbang.asmr.live.diy'], 'Jelly Master\'s App Store app, the same bundle ID, on the FALCON GAME record');
  assert.deepEqual(withApp('android', 'com.awesome.puzzlehexasort').map((g) => g.appIds.ios), [6590876141], 'Color Slide\'s apps on one record');
});

test('the committed game DB: developers that differ as strings stay apart; one store app is one record under the clean slug', () => {
  const games = Object.values(require('../scripts/sync-and-enrich').loadGames().games);
  const withApp = (slot, id) => games.filter((g) => Object.entries(g.appIds || {}).some(([s, v]) => s.split(/[_:]/)[0] === slot && String(v) === id));
  // 冰的啦 (MOREFUN（H.K.) / MOREFUN (H.K.) LIMITED; App Store bundle ID com.pgfight.ios.tw)
  const [a] = withApp('ios', '6736687450'), [b] = withApp('android', 'com.pgfight.an.tw');
  assert.ok(a && b && a !== b, `${a && a.developer} / ${b && b.developer}`);
  // 蟋蟀江湖 (Future TV Co. Ltd / FUTURE TV CO.,LTD): the App Store app's bundle ID is the Google Play package, one app
  assert.equal(withApp('ios', '6780728088')[0], withApp('android', 'com.newtv.cricketduel')[0]);
  const byApp = new Map();
  for (const g of games) for (const [slot, id] of Object.entries(g.appIds || {})) if (id) byApp.set(`${slot.split(/[_:]/)[0]}:${id}`, [...(byApp.get(`${slot.split(/[_:]/)[0]}:${id}`) || []), g.slug]);
  assert.deepEqual([...byApp].filter(([, slugs]) => new Set(slugs).size > 1), [], 'no store app on two records');
  assert.deepEqual(withApp('ios', '6762268182').map((g) => g.slug), ['z-route-redemption']);
  assert.deepEqual(withApp('ios', '6739772012').map((g) => g.slug), ['raise-an-assassin-idle-rpg']);
  assert.equal(withApp('android', 'com.gamesofa.android.catcafe2')[0].slug, 'catfe-world');
});

test('the committed game DB has no duplicate left for the sync to merge', () => {
  const { loadGames } = require('../scripts/sync-and-enrich');
  assert.deepEqual(mergeSameTitle(loadGames()), []);
});
