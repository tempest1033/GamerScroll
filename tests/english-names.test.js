'use strict';
// The daily sync stores each game's official English store name in names.en (scripts/sync-and-enrich.js fillEnglishNames).
const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const gplay = require('google-play-scraper').default;
const { lookupEnglishNames, fillEnglishNames, englishNameDue, englishName, nextCheckDate, lookupSteamEnglish, lookupAndroidEnglish, mergeNames } = require('../scripts/sync-and-enrich');

// Store listings: App Store US, Google Play and Steam in English. An app missing from a map is not listed there;
// undefined is a failed lookup.
const LISTINGS = {
  ios: { 100: '명일방주 (US)', 400: 'Toy Blast' },
  android: { 'com.yostar.kr': 'Arknights', 'com.bladetw.bd': 'BLEACH: Soul Resonance', 'com.nexon.mm': '마비노기 모바일', 'com.down': undefined },
  steam: { 3240220: 'Grand Theft Auto V Enhanced', 1172470: 'Apex Legends™' },
};
function fakeStores(calls = []) {
  return {
    ios: async (ids) => { calls.push(`ios ${ids.join(',')}`); return new Map(ids.filter((id) => LISTINGS.ios[id]).map((id) => [id, { title: LISTINGS.ios[id] }])); },
    android: async (id, countries) => { calls.push(`android ${id} ${countries.join(',')}`); return id in LISTINGS.android ? LISTINGS.android[id] : null; },
    steam: async (id) => { calls.push(`steam ${id}`); return LISTINGS.steam[id] || null; },
  };
}
const games = () => ({
  '명일방주': { appIds: { ios: '100', android: 'com.yostar.kr' }, names: { ko: '명일방주', en: '명일방주 (US)' } },
  '블리치: 소울 레조넌스': { appIds: { ios: '200', android: 'com.bladetw.bd' }, names: { ko: '블리치: 소울 레조넌스', 'zh-tw': 'BLEACH：刀鳴' } },
  '마비노기 모바일': { appIds: { ios: '300', android: 'com.nexon.mm' }, names: { ko: '마비노기 모바일' } },
  'Toy Blast': { appIds: { ios: '400' }, names: { en: 'Toy Blast' } },
  '问道': { appIds: { ios_cn: '500' }, names: { 'zh-cn': '问道' } },
  'Grand Theft Auto V Enhanced': { appIds: { steam: '3240220' }, names: {} },
  'Apex Legends': { appIds: { steam: '1172470' }, names: {} },
  'Down Game': { appIds: { android: 'com.down' }, names: { ko: '다운' } },
});

test('the official English store name: App Store US, Google Play in English, Steam in English; ™ and ® are dropped', async () => {
  const g = games();
  const checks = {};
  const calls = [];
  const keys = Object.keys(g).filter((k) => k !== 'Toy Blast');
  const named = await lookupEnglishNames(g, keys, checks, '2026-11-25', fakeStores(calls));
  assert.deepEqual(Object.fromEntries(named), {
    '명일방주': 'Arknights',
    '블리치: 소울 레조넌스': 'BLEACH: Soul Resonance',
    'Grand Theft Auto V Enhanced': 'Grand Theft Auto V Enhanced',
    'Apex Legends': 'Apex Legends',
  });
  assert.equal(calls.filter((c) => c.startsWith('ios')).length, 1, 'the App Store is asked on the US storefront only');
  assert.ok(calls.includes('android com.yostar.kr kr,us'), 'Google Play is asked from the storefront the app was found in');
  // the original-script name of a listing without an English version is no English name; the app is asked again later
  assert.deepEqual(Object.keys(checks).sort(), ['android:com.nexon.mm', 'ios:300', 'ios:500']);
  assert.ok(Object.values(checks).every((d) => d > '2026-11-25' && d <= '2026-12-25'));
  assert.equal(checks['ios:300'], checks['android:com.nexon.mm'], 'a game\'s apps are due on one day');
  assert.ok(!('android:com.down' in checks), 'a failed lookup is left for the next run');
  assert.equal(englishName('HELLDIVERS™ 2'), 'HELLDIVERS 2');
  assert.equal(englishName('Far Cry® 5'), 'Far Cry 5');
  assert.deepEqual(mergeNames({ en: 'Billiard Hero™️: Rescue Shot', ja: 'ビリヤード®' }, {}), { en: 'Billiard Hero: Rescue Shot', ja: 'ビリヤード®' }, 'a stored English name drops them too');
});

test('rechecks of apps checked on one day spread over the 30-day window, each app on its own day', () => {
  const dates = Array.from({ length: 600 }, (_, i) => nextCheckDate(`ios:${1000 + i}`, '2026-11-25'));
  assert.ok(dates.every((d) => d > '2026-11-25' && d <= '2026-12-25'));
  const perDay = Object.values(dates.reduce((n, d) => ({ ...n, [d]: (n[d] || 0) + 1 }), {}));
  assert.equal(perDay.length, 30);
  assert.ok(Math.max(...perDay) < 600 / 30 * 2, `at most about twice the even share a day: ${perDay}`);
  const first = nextCheckDate('android:com.x', '2026-11-25');
  assert.equal(nextCheckDate('android:com.x', first), new Date(Date.parse(first) + 30 * 86400000).toISOString().slice(0, 10), 'then every 30 days');
});

test('fillEnglishNames: names.en gets the English name, a non-English one gives way, an English one stays; checked apps wait', async () => {
  const data = { games: games() };
  const checks = {};
  const result = await fillEnglishNames(data, checks, [], '2026-11-25', Infinity, fakeStores());
  assert.deepEqual(result, { asked: 7, named: 4 });
  assert.deepEqual(data.games['명일방주'].names, { ko: '명일방주', en: 'Arknights' });
  assert.deepEqual(data.games['Toy Blast'].names, { en: 'Toy Blast' });
  assert.deepEqual(data.games['마비노기 모바일'].names, { ko: '마비노기 모바일' }, 'no official English name: the original name stays');
  assert.deepEqual(englishNameDue(data.games, checks, '2026-11-26'), ['Down Game']);
  assert.deepEqual(englishNameDue(data.games, checks, '2026-12-25'), ['마비노기 모바일', '问道', 'Down Game']);
});

test('fillEnglishNames asks this run\'s new games first, within the limit', async () => {
  const data = { games: games() };
  const calls = [];
  const result = await fillEnglishNames(data, {}, ['Grand Theft Auto V Enhanced'], '2026-11-25', 1, fakeStores(calls));
  assert.deepEqual(result, { asked: 1, named: 1 });
  assert.deepEqual(calls, ['steam 3240220']);
});

test('Steam: a name only from the app asked for; a failed lookup is asked once', async (t) => {
  const answers = {
    1449560: { 1449560: { success: true, data: { steam_appid: 412020, name: 'Metro Exodus' } } },
    202990: { 202990: { success: true, data: { steam_appid: 202970, name: 'Call of Duty: Black Ops II' } } },
    3240220: { 3240220: { success: true, data: { steam_appid: 3240220, name: 'Grand Theft Auto V Enhanced' } } },
  };
  let asked = 0;
  t.mock.method(axios, 'get', async (url, { params }) => { asked++; if (params.appids === 'down') throw new Error('503'); return { data: answers[params.appids] }; });
  assert.equal(await lookupSteamEnglish(1449560), null);
  assert.equal(await lookupSteamEnglish(202990), null);
  assert.equal(await lookupSteamEnglish(3240220), 'Grand Theft Auto V Enhanced');
  asked = 0;
  assert.equal(await lookupSteamEnglish('down'), undefined);
  assert.equal(asked, 1);
});

test('Google Play: one request per storefront, the next storefront only when the app is not listed', async (t) => {
  const asked = [], options = [];
  t.mock.method(gplay, 'app', async ({ appId, country, requestOptions }) => {
    asked.push(`${appId} ${country}`);
    options.push(requestOptions);
    if (appId === 'busy') throw Object.assign(new Error('503'), { status: 503 });
    if (country === 'kr') throw Object.assign(new Error('App not found (404)'), { status: 404 });
    return { title: 'Title' };
  });
  assert.equal(await lookupAndroidEnglish('a.b', ['kr', 'us']), 'Title');
  assert.equal(await lookupAndroidEnglish('busy', ['tw', 'us']), undefined);
  assert.deepEqual(asked, ['a.b kr', 'a.b us', 'busy tw']);
  for (const o of options) assert.deepEqual(o, { retry: 0, timeout: 15000 }, 'got asks once (no retry, backoff or Retry-After wait) and gives up after 15 s');
});

test('the daily sync asks each store once: failed lookups wait, undated, for the next run', async (t) => {
  const asked = [];
  t.mock.method(axios, 'get', async (url, { params }) => { asked.push(`${url.includes('itunes') ? 'ios' : 'steam'} ${params.appids || params.id} ${params.country || ''}`); throw new Error('429'); });
  t.mock.method(gplay, 'app', async ({ appId }) => { asked.push(`android ${appId}`); throw Object.assign(new Error('503'), { status: 503 }); });
  const g = { A: { appIds: { ios_jp: '1', android: 'a.b' }, names: {} }, B: { appIds: { steam: '2' }, names: {} } };
  const checks = {};
  const started = Date.now();
  assert.equal((await lookupEnglishNames(g, ['A', 'B'], checks, '2026-11-25')).size, 0);
  assert.deepEqual(asked, ['ios 1 us', 'android a.b', 'steam 2 ']);
  assert.deepEqual(checks, {});
  assert.ok(Date.now() - started < 1000, 'no backoff');
});
