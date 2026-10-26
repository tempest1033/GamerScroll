'use strict';

// Revenue / download estimate sections: bundle fetch and verification (scripts/fetch-service-exports.js,
// src/build/service-exports.js), page data, game page section and the rank hub / genre reference cards.
//   node --test scripts/test-service-exports.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const i18n = require('../src/i18n');
const { writeFixture, syntheticRanks } = require('../tests/fixtures/service-exports');
const { loadServiceExports, verifyBundle } = require('../src/build/service-exports');
const { run } = require('./fetch-service-exports');
const { playBucket } = require('../src/templates/components/revenue-charts');
const { renderRevenueSection } = require('../src/templates/components/revenue-section');
const P = require('../src/templates/components/revenue-policy');

const ASOF = '2026-10-25';
const NOW = new Date('2026-10-26T03:00:00Z'); // 12:00 KST, one day after asof
const APP = { ios: '1000000001', android: 'com.example.rpg' };

function tmp(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `svc-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function bundle(t, overrides = {}) {
  const dir = path.join(tmp(t, 'bundle'), 'exports');
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Example RPG' };
  writeFixture(dir, {
    asof: ASOF,
    bandTiers: overrides.bandTiers,
    games: [
      // kr: no download model (downloads_est null as in the real bundle → fallback indicators); jp: download estimate (unverified tier)
      { ...game, store: 'ios', app_id: APP.ios, markets: { kr: { ranks: syntheticRanks(12) }, jp: { ranks: syntheticRanks(40, { gap: 20 }), downloads: 'unverified' } }, ios_ratings: { kr: 12345, jp: 678 } },
      { ...game, store: 'android', app_id: APP.android, markets: { kr: { ranks: syntheticRanks(9) } }, play_bucket_min: 5000000 },
      { ...game, store: 'ios', app_id: '2000000002', markets: { kr: { tier: 'hidden', downloads: 'hidden', ranks: syntheticRanks(50) } } },
      { ...game, store: 'ios', app_id: '4000000004', markets: { kr: { tier: 'hidden', downloads: 'verified', ranks: syntheticRanks(60) } } },
      { ...game, store: 'android', app_id: 'com.example.mixed', markets: { kr: { ranks: syntheticRanks(30), downloads: 'verified' } }, play_bucket_min: 7300000 },
      { ...game, subgenre: 'Card', store: 'ios', app_id: '3000000003', markets: { us: { ranks: syntheticRanks(20) } } },
      // the last 10 days sit in a hidden rank band; a launch-cohort game
      { ...game, store: 'ios', app_id: '5000000005', markets: { kr: { ranks: syntheticRanks(150), hiddenDays: 10 } } },
      { ...game, subgenre: 'Strategy', launch_cohort: true, store: 'android', app_id: 'com.example.new', markets: { kr: { ranks: syntheticRanks(25, { gap: 140 }) } }, play_bucket_min: 100000 },
      ...(overrides.games || []),
    ],
  });
  return dir;
}

const withEdition = (code, fn) => { i18n.setEdition(code); try { return fn(); } finally { i18n.setEdition('ko'); } };
// Text a reader sees (USD switch off).
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<span class="rv-n"[^>]*>([^<]*)<\/span>/g, '$1').replace(/<\/?(?:b|small|i)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// Ad slots are numbered per render (layout counter); everything else must match byte for byte.
const sameAds = (html) => html.replace(/ad-home-(pc|mo)-\d+/g, 'ad-home-$1-N');

test('fetch without a token omits the bundle and logs a warning', async (t) => {
  const dest = path.join(tmp(t, 'dest'), 'service-exports');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'manifest.json'), '{}'); // a stale bundle from an earlier run must not survive
  const warnings = [];
  t.mock.method(console, 'warn', (m) => warnings.push(String(m)));
  const result = await run({ env: {}, dest, now: NOW, fetchImpl: () => { throw new Error('must not download'); } });
  assert.equal(result.ok, false);
  assert.match(result.reason, /FORECAST_EXPORT_TOKEN/);
  assert.equal(fs.existsSync(dest), false);
  assert.ok(warnings.some((w) => /revenue sections omitted/.test(w)));
  assert.equal(loadServiceExports({ dir: dest, now: NOW, quiet: true }), null);
});

test('fetch downloads the branch tarball, verifies it and keeps it; a tampered bundle is dropped', async (t) => {
  const source = bundle(t);
  const work = tmp(t, 'tar');
  // GitHub tarballs wrap the tree in one <owner>-<repo>-<sha>/ directory.
  fs.cpSync(source, path.join(work, 'owner-forecast-abc123'), { recursive: true });
  const tarball = path.join(work, 'b.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', tarball, '-C', work, 'owner-forecast-abc123']).status, 0);
  const requests = [];
  const fetchImpl = async (url, init) => { requests.push({ url, auth: init.headers.Authorization }); return new Response(fs.readFileSync(tarball)); };
  const dest = path.join(tmp(t, 'dest'), 'service-exports');
  t.mock.method(console, 'log', () => {});
  const ok = await run({ env: { FORECAST_EXPORT_TOKEN: 'tok', FORECAST_EXPORT_REPO: 'owner/forecast' }, dest, now: NOW, fetchImpl });
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(requests[0].url, 'https://api.github.com/repos/owner/forecast/tarball/service-exports');
  assert.equal(requests[0].auth, 'Bearer tok');
  assert.ok(fs.existsSync(path.join(dest, 'genres.json')));

  // Same tarball, but one game file altered after the manifest was written.
  fs.appendFileSync(path.join(work, 'owner-forecast-abc123', 'games', 'ios', `${APP.ios}.json`), ' ');
  assert.equal(spawnSync('tar', ['-czf', tarball, '-C', work, 'owner-forecast-abc123']).status, 0);
  const warnings = [];
  t.mock.method(console, 'warn', (m) => warnings.push(String(m)));
  const bad = await run({ env: { FORECAST_EXPORT_TOKEN: 'tok', FORECAST_EXPORT_REPO: 'owner/forecast' }, dest, now: NOW, fetchImpl });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /sha256 mismatch/);
  assert.equal(fs.existsSync(dest), false);
  assert.ok(warnings.some((w) => /sha256 mismatch/.test(w)));
});

test('verification rejects stale bundles and accepts a local override', async (t) => {
  const dir = bundle(t);
  assert.doesNotThrow(() => verifyBundle(dir, { now: NOW }));
  assert.doesNotThrow(() => verifyBundle(dir, { now: new Date('2026-10-27T10:00:00Z') })); // 2 days old in KST
  assert.throws(() => verifyBundle(dir, { now: new Date('2026-10-28T10:00:00Z') }), /stale/);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  assert.equal((await run({ env: { SERVICE_EXPORTS_DIR: dir }, now: NOW })).ok, true);
  assert.equal((await run({ env: { SERVICE_EXPORTS_DIR: dir }, now: new Date('2026-11-05T00:00:00Z') })).ok, false);
});

test('page data merges App Store and Google Play per market and keeps hidden tiers free of numbers', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const rev = svc.revenueFor(APP);
  assert.deepEqual(Object.keys(rev.m).sort(), ['jp', 'kr']);
  assert.deepEqual(Object.keys(rev.m.kr.s).sort(), ['android', 'ios']);
  assert.deepEqual(Object.keys(rev.m.jp.s), ['ios']);
  assert.equal(rev.m.kr.c, 'KRW');
  assert.equal(rev.m.kr.fx, Number((1 / 1390).toPrecision(4)), 'fx_usd month map (KRW per USD) → USD per KRW');
  assert.equal(rev.m.kr.s.ios.d.length, 183);
  assert.equal(rev.dl.p, 5000000);
  assert.deepEqual(rev.dl.r, { kr: 12345, jp: 678 });
  const decay = rev.cv['decay:all:kr:ios:Role Playing'], launch = rev.cv['launch:kr:ios:Role Playing'];
  assert.equal(decay.unit, 'rel');
  assert.equal(launch.unit, 'usd');
  assert.deepEqual(decay.points[1].length, 4, '[x, q50, q25, q75]');

  // Per-market ids (games.json ios_<cc>) select another record for that storefront only.
  const mixed = svc.revenueFor({ ios: APP.ios, ios_kr: '2000000002', android: 'com.example.mixed' });
  assert.deepEqual(mixed.m.kr.s.ios, { t: 'hidden', de: { t: 'hidden' } });
  assert.ok(mixed.m.jp.s.ios.d.length);
  assert.ok(!/"d0"/.test(JSON.stringify(mixed.m.kr.s.ios)));
  // A game known only by another storefront's id (ios_jp) still gets its kr chart record, as the rank stats attribute it.
  assert.deepEqual(Object.keys(svc.revenueFor({ ios_jp: APP.ios }).m).sort(), ['jp', 'kr']);

  // Only a hidden market and no download figures: no revenue field at all.
  assert.equal(svc.revenueFor({ ios: '2000000002' }), null);
  // Hidden revenue keeps its own visible download estimate (separate tiers), still without revenue numbers.
  const dlOnly = svc.revenueFor({ ios: '4000000004' }).m.kr.s.ios;
  assert.deepEqual(Object.keys(dlOnly).sort(), ['de', 't']);
  assert.equal(dlOnly.de.t, 'verified');
  assert.equal(dlOnly.de.d.length, 183);
  assert.equal(rev.m.jp.s.ios.de.t, 'unverified');
  assert.equal(rev.m.kr.s.ios.de, undefined);
  // Curves with fewer than 10 games are dropped.
  const small = svc.revenueFor({ ios: '3000000003' });
  assert.deepEqual(small.cv, {});
  assert.equal(svc.revenueFor({ ios: '999' }), null);
});

test('download estimates: missing snapshot days stay unknown, a malformed estimate drops only itself', (t) => {
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { store: 'ios', app_id: '6000000006', subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Gaps', markets: { kr: { ranks: syntheticRanks(15), downloads: 'unverified', downloadsGaps: [100, 101, 150] } } },
    { store: 'ios', app_id: '8000000008', subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Unrated', markets: { kr: { ranks: syntheticRanks(15), downloads: 'unrated' } }, ios_ratings: { kr: 4321 } },
    { store: 'ios', app_id: '7000000007', subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Bad', markets: { kr: { ranks: syntheticRanks(15), downloads: 'unverified', downloadsBad: true } } },
  ] }), now: NOW });
  const gaps = svc.revenueFor({ ios: '6000000006' }).m.kr.s.ios;
  assert.equal(gaps.de.t, 'unverified');
  assert.equal(gaps.de.d.length, 183, 'one cell per day from the first estimate day');
  assert.deepEqual([gaps.de.d[100], gaps.de.d[101], gaps.de.d[150]], [null, null, null]);
  assert.ok(gaps.de.d[99] && gaps.de.d[102]);
  // dl-v1 today: tier 'unrated' with null numbers → no estimate, the fallback indicator with its approved label.
  const unrated = svc.revenueFor({ ios: '8000000008' });
  assert.equal(unrated.m.kr.s.ios.de, undefined);
  const text = withEdition('ko', () => visibleText(renderRevenueSection(unrated)));
  assert.match(text, /이 스토어 누적 평점 4,321개/);
  assert.ok(text.includes('시장별 다운로드: 제공 안 함') && text.includes('이 시장·스토어에 대한 다운로드 추정이 아직 없습니다.'));
  assert.doesNotMatch(text, /추정 월 다운로드|검증 전 추정/);
  const bad = svc.revenueFor({ ios: '7000000007' }).m.kr.s.ios;
  assert.equal(bad.de, undefined);
  assert.equal(bad.d.length, 183, 'revenue estimate kept');
});

test('new releases: age badges, pre-release / pre-chart days, totals withheld, rank-only outlook, launch curve, downloads', (t) => {
  // Released 2026-10-22 (asof 2026-10-25), first grossing top-200 day 2026-10-23 (index 180).
  const fresh = { subgenre: 'Strategy', release_date: '2026-10-22', title: 'Fresh' };
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...fresh, launch_cohort: true, store: 'ios', app_id: '9000000009', markets: { kr: { ranks: syntheticRanks(60, { gap: 180 }) } }, ios_ratings: { kr: 99 } },
    // a regional launch (not in the launch cohort): no launch curve
    { ...fresh, store: 'android', app_id: 'com.example.fresh', markets: { kr: { ranks: syntheticRanks(80, { gap: 180 }) } }, play_bucket_min: 100000 },
  ] }), now: NOW });
  const calls = [];
  const freeRank = (market, store, id, since) => { calls.push([market, store, id, since]); return { r: 12, b: 5 }; };
  const rev = svc.revenueFor({ ios: '9000000009', android: 'com.example.fresh' }, { freeRank });
  const ios = rev.m.kr.s.ios, and = rev.m.kr.s.android;
  assert.deepEqual(ios.l, { rf: '2026-10-22', b: 'r', bf: 'r', fc: '2026-10-23', cz: false, nw: true, rs: '2026-10-23' });
  assert.deepEqual(and.l, { rf: '2026-10-23', b: 'c', bf: 'c', fc: '2026-10-23', cz: false, nw: true, rs: '2026-10-23' });
  assert.deepEqual(ios.d[179], [null, null, null, null], 'release day before the first top-200 day: no revenue');
  assert.ok(ios.d[180][2] > 0);
  assert.deepEqual([ios.w, ios.mo, ios.mtd.t, ios.o.t], [[], [], null, null]);
  assert.equal(ios.p.dc, null);
  assert.equal(ios.p.lr, 'launch:kr:ios:Strategy');
  assert.ok(rev.cv['launch:kr:ios:Strategy']);
  assert.equal(and.p.lr, null, 'regional launch');
  assert.deepEqual(rev.dl.r, {}, 'no iOS rating count for new games');
  assert.deepEqual(ios.fr, { r: 12, b: 5 });
  assert.deepEqual(calls, [['kr', 'ios', '9000000009', '2026-10-22'], ['kr', 'android', 'com.example.fresh', '2026-10-23']]);

  const ko = withEdition('ko', () => visibleText(renderRevenueSection(rev)));
  for (const s of ['앱스토어 · 출시 4일차', '구글플레이 · 차트 진입 3일차', '출시 전', '차트 진입 전', '신규: 아직 검증되지 않음', '집계 중', '신작', '평소대로면 앞으로 14일 순위', '인기(무료) 차트 순위: 12위', '최고 5위', '전 세계 누적 설치 10만+']) assert.ok(ko.includes(s), s);
  assert.doesNotMatch(ko, /구글플레이 · 출시|누적 평점|매달 약|순위 [^,]*, 매출|이번 달 1일–어제 추정 매출|추정 월매출/);
  assert.match(withEdition('en', () => visibleText(renderRevenueSection(rev))), /App Store · Day 4 since release.*Google Play · Day 3 on the chart/);

  // Established games: no badge when the anchor lies before the daily window; free-chart best over the window.
  calls.length = 0;
  const old = svc.revenueFor(APP, { freeRank });
  assert.deepEqual(calls[0], ['kr', 'ios', APP.ios, old.m.kr.s.ios.d0]);
  assert.deepEqual(old.m.kr.s.ios.fr, { r: 12, b: 5 });
  assert.doesNotMatch(withEdition('ko', () => visibleText(renderRevenueSection(old))), /일차/);
});

test('Google Play install buckets follow the store ladder and the edition', () => {
  const cases = { ko: ['500만', '1억', '1천'], en: ['5M', '100M', '1K'], ja: ['500万', '1億', '1000'], 'zh-cn': ['500万', '1亿', '1000'], 'zh-tw': ['500萬', '1億', '1000'] };
  for (const [code, expected] of Object.entries(cases)) {
    withEdition(code, () => {
      assert.equal(playBucket(5000000), expected[0], code);
      assert.equal(playBucket(7300000), expected[0], `${code}: 7.3M is in the 5M+ bucket`);
      assert.equal(playBucket(100000000), expected[1], code);
      assert.equal(playBucket(1000), expected[2], code);
    });
  }
  assert.equal(playBucket(0), null);
  assert.equal(playBucket(null), null);
});

test('game page section renders the approved labels', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const rev = svc.revenueFor(APP);
  const ko = withEdition('ko', () => renderRevenueSection(rev));
  const text = visibleText(ko);
  assert.match(text, /매출·다운로드 추정 베타/);
  assert.match(text, /추정 월매출 ₩[\d.]+억–₩[\d.]+억 \(중앙값 ₩[\d.]+억\)/);
  assert.ok(text.includes('공식 매출이 아니라, 스토어 순위와 회사 공시로 추정한 범위입니다. 실제 값이 이 범위 안에 들 가능성은 약 80%입니다.'));
  assert.ok(text.includes('전 세계 누적 설치 500만+'));
  assert.ok(text.includes('모든 국가 합계입니다. 이 시장만의 숫자가 아닙니다.'));
  assert.ok(text.includes('이 스토어 누적 평점 12,345개'));
  assert.ok(text.includes('다운로드 수가 아니라 관심도 지표입니다.'));
  assert.match(text, /이번 달 1일–어제 추정 매출 ₩[\d.]+억–₩[\d.]+억/);
  assert.ok(text.includes('월말 예상치가 아닙니다. 어제까지 순위로만 계산했습니다.'));
  assert.match(text, /평소대로면 앞으로 14일 순위 \d+위–\d+위, 매출 ₩[\d.]+억–₩[\d.]+억/);
  assert.ok(text.includes('업데이트·이벤트로 순위가 급등하면 이 범위를 벗어나기 쉽습니다(급등 사례의 약 3분의 2).'));
  const decay = rev.cv['decay:all:kr:ios:Role Playing'];
  assert.ok(text.includes(`RPG 신작은 출시 후 매달 약 ${Math.round(decay.md * 100)}%씩 매출이 줄어듭니다(표본 ${decay.n}개)`));
  assert.ok(text.includes('2026년 순위 기록 8개월 기준입니다. 차트에서 빠진 게임은 200위 수준으로 쳐서, 실제 감소는 이보다 클 수 있습니다.'));
  // Market tabs (edition home first), store views, accessible plots.
  assert.ok(ko.indexOf('id="rv-m-kr"') < ko.indexOf('id="rv-m-jp"'));
  assert.ok(ko.includes('id="rv-s-all"') && ko.includes('id="rv-s-ios"') && ko.includes('id="rv-s-and"'));
  assert.ok(/<div class="rv-plot[^"]*" role="img" aria-label="한국 앱스토어 일별 추정 매출: 중앙값 [^"]+, 최고 매출 순위 \d+위">/.test(ko));
  assert.ok(ko.includes('id="rv-usd"'), 'USD switch for non-USD markets');
  assert.match(ko, /<div class="rv-mp rv-mp-kr" data-fx="0\.000719\d*">/, 'panel carries USD per KRW');
  assert.match(ko, /<span class="rv-n" data-v="[\d.e+]+,[\d.e+]+">₩/, 'ranges carry their values for the USD switch');

  const en = withEdition('en', () => renderRevenueSection(rev));
  const enText = visibleText(en);
  assert.ok(en.indexOf('id="rv-m-kr"') > -1 && enText.includes('Estimated monthly revenue'));
  assert.ok(enText.includes('Worldwide installs 5M+'));
  assert.ok(enText.includes('12,345 ratings on this store'));
  assert.deepEqual(enText.match(/[\uAC00-\uD7A3]+/g) || [], [], 'no Hangul in en');
  const ja = withEdition('ja', () => visibleText(renderRevenueSection(rev)));
  assert.ok(ja.includes('全世界の累計インストール 500万+'));
  assert.match(ja, /推定月間売上 ₩[\d.]+億–₩[\d.]+億（中央値 ₩[\d.]+億）/);
});

test('hidden tier shows a note instead of numbers; small curves are not drawn', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const html = withEdition('ko', () => renderRevenueSection(svc.revenueFor({ ios: '2000000002', android: 'com.example.mixed' })));
  const text = visibleText(html);
  assert.ok(text.includes('이 스토어는 추정 정확도가 충분하지 않아 매출 추정을 표시하지 않습니다.'));
  assert.ok(text.includes('한 스토어의 추정을 표시하지 않아 두 스토어 합계도 표시하지 않습니다.'));
  assert.ok(text.includes('이 스토어는 다운로드 추정 정확도가 충분하지 않아 표시하지 않습니다.'));
  assert.match(text, /추정 월 다운로드 [\d.]+만–[\d.]+만 \(중앙값 [\d.]+만\)/, 'Google Play download estimate');
  const us = withEdition('en', () => renderRevenueSection(svc.revenueFor({ ios: '3000000003' })));
  assert.ok(!us.includes('rv-position'), 'curves with n < 10 are hidden');
  assert.ok(!us.includes('id="rv-usd"'), 'USD market needs no USD switch');
});

test('per-market download estimates: tiered labels, charts, fallback where the model has none', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const html = withEdition('ko', () => renderRevenueSection(svc.revenueFor(APP)));
  const jp = html.slice(html.indexOf('rv-mp-jp'));
  const kr = html.slice(html.indexOf('rv-mp-kr'), html.indexOf('rv-mp-jp'));
  assert.match(visibleText(jp), /추정 월 다운로드 [\d.]+만?–[\d.]+만? \(중앙값 [\d.]+만?\)/);
  assert.ok(visibleText(jp).includes('검증 전 추정 · 범위가 넓습니다'), 'unverified tier badge');
  assert.ok(visibleText(jp).includes('공식 자료로 아직 검증하지 않았습니다'), 'unverified tier note');
  assert.match(jp, /<div class="rv-chartbox[^"]* rv-weak">/, 'lighter band');
  assert.match(jp, /aria-label="일본 앱스토어 일별 추정 다운로드: 중앙값 [^"]+"/);
  assert.ok(visibleText(jp).includes('월별 추정 다운로드'));
  assert.ok(visibleText(jp).includes('이 스토어 누적 평점 678개'), 'cumulative fallback kept beside the estimate');
  assert.ok(!visibleText(jp).includes('제공 안 함'));
  assert.ok(visibleText(kr).includes('이 스토어 누적 평점 12,345개') && visibleText(kr).includes('전 세계 누적 설치 500만+'), 'fallback without a model');
  assert.ok(visibleText(kr).includes('시장별 다운로드: 제공 안 함'));
  const verified = withEdition('ko', () => visibleText(renderRevenueSection(svc.revenueFor({ ios: '4000000004' }))));
  assert.ok(verified.includes('이 시장의 신규 설치 수를 공개 자료로 보정해 추정한 범위입니다.'), 'verified tier note');
  assert.doesNotMatch(verified, /검증 전|가정 기반/, 'verified: no tier badge');
  assert.ok(verified.includes('이 스토어는 추정 정확도가 충분하지 않아 매출 추정을 표시하지 않습니다.'));
  const en = withEdition('en', () => visibleText(renderRevenueSection(svc.revenueFor(APP))));
  assert.match(en, /Estimated monthly downloads [\d.]+K?–[\d.]+K? \(median [\d.]+K?\)/);
});

test('download evidence tiers: assumption iOS + verified Play, partial-store CN Android, non-display tiers', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Tiers' };
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...game, store: 'ios', app_id: '1100000011', markets: { kr: { ranks: syntheticRanks(20), downloads: 'assumption' } }, ios_ratings: { kr: 500 } },
    { ...game, store: 'android', app_id: 'com.example.tiers', markets: { kr: { ranks: syntheticRanks(25), downloads: 'verified' }, cn: { ranks: syntheticRanks(30), downloads: 'partial_store' } }, play_bucket_min: 1000000 },
    { ...game, store: 'ios', app_id: '1200000012', markets: { cn: { ranks: syntheticRanks(15), downloads: 'pending_prospective' } } },
  ] }), now: NOW });
  const rev = svc.revenueFor({ ios: '1100000011', ios_cn: '1200000012', android: 'com.example.tiers' }, { freeRank: () => ({ r: 33, b: 7 }) });
  assert.equal(rev.m.cn.s.ios.de, undefined, 'pending_prospective: no numbers');
  const html = withEdition('ko', () => renderRevenueSection(rev));
  const kr = html.slice(html.indexOf('rv-mp-kr'), html.indexOf('rv-mp-cn'));
  const cn = html.slice(html.indexOf('rv-mp-cn'));
  const view = (part, cls) => part.split('<div class="rv-x ').filter((x) => x.startsWith(cls)).map(visibleText).join(' ');
  // Both stores summed: the less certain tier (assumption) labels the sum.
  assert.ok(view(kr, 'rv-x-all').includes('가정 기반 추정 · 같은 게임의 Google Play 자료로 환산'));
  assert.ok(view(kr, 'rv-x-ios').includes('가정 기반 추정') && view(kr, 'rv-x-ios').includes('이 스토어 누적 평점 500개'));
  assert.doesNotMatch(view(kr, 'rv-x-and'), /가정 기반|검증 전|제공 안 함/);
  assert.ok(view(kr, 'rv-x-and').includes('전 세계 누적 설치 100만+') && view(kr, 'rv-x-and').includes('인기(무료) 차트 순위: 33위'));
  // CN: Android covers one store only (not summed with iOS); iOS pending → "not available", never a number.
  assert.ok(view(cn, 'rv-x-and').includes('应用宝 한 곳의 누적 다운로드'));
  assert.match(view(cn, 'rv-x-and'), /추정 월 다운로드 [\d.]+만?–/);
  assert.ok(view(cn, 'rv-x-ios').includes('시장별 다운로드: 제공 안 함'));
  assert.doesNotMatch(view(cn, 'rv-x-ios'), /추정 월 다운로드/);
  assert.ok(view(cn, 'rv-x-all').includes('应用宝 한 곳의 누적 다운로드') && view(cn, 'rv-x-all').includes('시장별 다운로드: 제공 안 함'));
  assert.ok(!cn.includes('rv-weak'), 'partial store keeps the normal band');
  for (const code of ['en', 'ja', 'zh-cn', 'zh-tw']) {
    const text = withEdition(code, () => visibleText(renderRevenueSection(rev)));
    assert.deepEqual(text.match(/[\uAC00-\uD7A3]+/g) || [], [], `no Hangul in ${code}`);
    for (const key of ['rev.dl_tier_assumption', 'rev.dl_tier_partial_store', 'rev.dl_none']) assert.ok(text.includes(withEdition(code, () => i18n.t(key))), `${code} ${key}`);
  }
});

// Tier allowlists (revenue: beta, wide; downloads: verified, unverified, assumption, partial_store): crafted bundles whose
// numbers are present but whose tier is unrated, unknown or missing must show no numbers, at ingestion and at render.
const MONEY = /추정 월매출|추정 월 다운로드|이번 달 1일–어제 추정 매출/;
const hasNumbers = (p) => Boolean(p && (p.d || p.w || p.mo || p.mtd || p.o));

test('revenue tiers outside beta/wide (unrated, unknown, missing) keep no numbers, at ingestion and render', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Tiers' };
  const svc = loadServiceExports({ dir: bundle(t, { bandTiers: { 'kr|ios|1': 'unrated', 'kr|ios|2': 'mystery' }, games: [
    { ...game, store: 'ios', app_id: '6100000001', markets: { kr: { ranks: syntheticRanks(12), tier: 'unrated' } }, ios_ratings: { kr: 10 } },
    { ...game, store: 'android', app_id: 'com.example.unknown', markets: { kr: { ranks: syntheticRanks(12), tier: 'mystery' } }, play_bucket_min: 1000000 },
    { ...game, store: 'ios', app_id: '6200000002', markets: { jp: { ranks: syntheticRanks(12), tier: undefined, tierByBand: undefined } } },
  ] }), now: NOW });
  const rev = svc.revenueFor({ ios: '6100000001', ios_jp: '6200000002', android: 'com.example.unknown' });
  for (const p of [rev.m.kr.s.ios, rev.m.kr.s.android, rev.m.jp.s.ios]) {
    assert.equal(p.t, 'hidden');
    assert.ok(!hasNumbers(p), 'numbers dropped at ingestion');
  }
  const text = visibleText(withEdition('ko', () => renderRevenueSection(rev)));
  assert.doesNotMatch(text, MONEY);
  assert.ok(text.includes(withEdition('ko', () => i18n.t('rev.hidden'))));
  // bands.json: cells with a tier outside the allowlist lose their numbers.
  const cell = (lo) => svc.bands.find((b) => b.market === 'kr' && b.store === 'ios' && b.lo === lo);
  for (const lo of [1, 2]) assert.deepEqual([cell(lo).day, cell(lo).month30, cell(lo).usd], [null, null, null]);
  assert.ok(cell(3).day);

  // Render layer on its own: page data that slipped through with numbers and a non-production tier.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP);
  for (const tier of ['unrated', 'mystery', undefined]) {
    const page = JSON.parse(JSON.stringify(good));
    for (const s of Object.values(page.m.kr.s)) { if (tier === undefined) delete s.t; else s.t = tier; }
    assert.ok(hasNumbers(good.m.kr.s.ios));
    const html = withEdition('ko', () => renderRevenueSection(page));
    const kr = visibleText(html.slice(html.indexOf('rv-mp-kr'), html.indexOf('rv-mp-jp') > 0 ? html.indexOf('rv-mp-jp') : undefined));
    assert.doesNotMatch(kr, /추정 월매출|이번 달 1일–어제 추정 매출|매출 [\d.,]+/, `render: tier ${tier}`);
    assert.ok(!html.slice(html.indexOf('rv-mp-kr')).split('rv-mp-jp')[0].includes('rv-band'), `no band chart: tier ${tier}`);
  }
});

test('per-band tiers (tier_by_band): days, periods and totals touching a non-shown band lose their numbers', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Bands' };
  const ranks = syntheticRanks(12); // ranks around 5–15: both sides of 10
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...game, store: 'ios', app_id: '6300000003', markets: { kr: { ranks, tierByBand: { '1-10': 'wide', '11-50': 'unrated', '51-200': 'beta' } } } },
    // a band missing from tier_by_band counts as not shown
    { ...game, store: 'android', app_id: 'com.example.partial', markets: { kr: { ranks, tierByBand: { '1-10': 'beta' } } } },
  ] }), now: NOW });
  const rev = svc.revenueFor({ ios: '6300000003', android: 'com.example.partial' });
  for (const p of [rev.m.kr.s.ios, rev.m.kr.s.android]) {
    const masked = p.d.filter((r) => r[0] > 10);
    assert.ok(masked.length && masked.every((r) => r[1] == null), 'days in the band have no numbers');
    assert.ok(p.d.some((r) => r[0] <= 10 && r[1] != null), 'days in a shown band keep theirs');
    const bad = p.d.map((r, i) => (r[0] > 10 ? Date.parse(p.d0) + i * 864e5 : null)).filter((x) => x != null);
    for (const w of p.w) if (bad.some((x) => x >= Date.parse(w[0]) && x < Date.parse(w[0]) + 7 * 864e5)) assert.equal(w[1], null, `week ${w[0]}`);
    for (const m of p.mo) if (bad.some((x) => new Date(x).toISOString().startsWith(m[0]))) assert.equal(m[1], null, `month ${m[0]}`);
    if (p.mtd && p.mtd.d.some((r) => r[1] > 10)) assert.equal(p.mtd.t, null);
    if (p.o && p.o.d.some((r) => r[3] > 10)) assert.equal(p.o.t, null);
  }
  // Render layer re-applies the band mask to page data that carries numbers in a non-shown band.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP).m.kr.s.ios;
  const shown = P.displayStore({ ...good, tb: [[1, 10, 'wide'], [11, 200, 'pending']] });
  assert.ok(shown.d.filter((r) => r[0] > 10).every((r) => r[1] == null));
  assert.ok(shown.d.filter((r) => r[0] != null && r[0] <= 10).every((r) => r[1] != null));
  assert.deepEqual(P.displayStore(shown), shown, 'idempotent');
});

test('download tiers outside the allowlist (unrated with numbers, unknown, missing) show "not available", at ingestion and render', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'DL tiers' };
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...game, store: 'ios', app_id: '6400000004', markets: { kr: { ranks: syntheticRanks(12), downloads: 'verified', downloadsTier: 'unrated' }, jp: { ranks: syntheticRanks(12), downloads: 'verified', downloadsTier: undefined } }, ios_ratings: { kr: 77 } },
    { ...game, store: 'android', app_id: 'com.example.dl', markets: { kr: { ranks: syntheticRanks(12), downloads: 'verified', downloadsTier: 'pending_prospective' } }, play_bucket_min: 1000000 },
  ] }), now: NOW });
  const rev = svc.revenueFor({ ios: '6400000004', android: 'com.example.dl' });
  for (const p of [rev.m.kr.s.ios, rev.m.kr.s.android, rev.m.jp.s.ios]) assert.equal(p.de, undefined, 'dropped at ingestion');
  const text = visibleText(withEdition('ko', () => renderRevenueSection(rev)));
  assert.doesNotMatch(text, /추정 월 다운로드/);
  assert.ok(text.includes('시장별 다운로드: 제공 안 함') && text.includes('이 스토어 누적 평점 77개') && text.includes('전 세계 누적 설치 100만+'));

  // Render layer: a numeric estimate with a non-allowlisted tier in the page data.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP);
  assert.ok(P.downloadsShown(good.m.jp.s.ios.de));
  for (const tier of ['unrated', 'pending_prospective', 'reference', undefined]) {
    const page = JSON.parse(JSON.stringify(good));
    if (tier === undefined) delete page.m.jp.s.ios.de.t; else page.m.jp.s.ios.de.t = tier;
    const html = withEdition('ko', () => renderRevenueSection(page));
    const jp = visibleText(html.slice(html.indexOf('rv-mp-jp')));
    assert.doesNotMatch(jp, /추정 월 다운로드/, `render: download tier ${tier}`);
    assert.ok(jp.includes('시장별 다운로드: 제공 안 함'));
  }
});

test('launch-gate coverage counts top-200 rows with visible revenue and download estimates', (t) => {
  const { coverage } = require('../src/build/service-exports');
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const games = { a: { slug: 'a', appIds: APP }, b: { slug: 'b', appIds: { ios: '4000000004' } }, c: { slug: 'c', appIds: { ios: '777' } } };
  const rows = { ios: [{ appId: APP.ios, g: 'a' }, { appId: '4000000004', g: 'b' }, { appId: '777', g: 'c' }, { appId: '888', g: null }], android: [{ appId: APP.android, g: 'a' }] };
  const S = { today: { rows: { kr: rows, jp: { ios: [{ appId: APP.ios, g: 'a' }] } } }, gameOf: (store, row) => games[row.g] || null };
  const bySlug = new Map(Object.values(games).map((g) => [g.slug, svc.revenueFor(g.appIds)]).filter(([, r]) => r));
  assert.deepEqual(coverage(S, bySlug, (g) => g.slug), [
    { market: 'kr', store: 'ios', chart: 4, page: 3, revenue: 1, downloads: 1, missing: [
      { rank: 1, appId: APP.ios, slug: 'a', why: 'downloads' }, { rank: 2, appId: '4000000004', slug: 'b', why: 'revenue-hidden' },
      { rank: 3, appId: '777', slug: 'c', why: 'no-record' }, { rank: 4, appId: '888', why: 'page' }] },
    { market: 'kr', store: 'android', chart: 1, page: 1, revenue: 1, downloads: 0, missing: [{ rank: 1, appId: APP.android, slug: 'a', why: 'downloads' }] },
    { market: 'jp', store: 'ios', chart: 1, page: 1, revenue: 1, downloads: 1, missing: [] },
  ]);
});

test('pages without estimate data render unchanged', (t) => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const game = { name: '기록 없는 게임', slug: 'test-no-record', platforms: ['ios'] };
  const plain = sameAds(generateGamePage(game));
  assert.equal(sameAds(generateGamePage({ ...game, revenue: undefined })), plain);
  assert.equal(sameAds(generateGamePage({ ...game, revenue: null })), plain);
  assert.ok(!/rv-|revenue-estimates/.test(plain));
  assert.equal(renderRevenueSection(null), '');
  assert.equal(renderRevenueSection({ a: ASOF, m: {} }), '');
  const withData = generateGamePage({ ...game, revenue: loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP) });
  assert.ok(withData.includes('id="revenue-estimates"'));
});

test('rank hub and genre cards: from the bundle, or nothing without it', (t) => {
  const dir = bundle(t);
  const reference = () => { delete require.cache[require.resolve('../src/templates/components/revenue-reference')]; return require('../src/templates/components/revenue-reference'); };
  const previous = process.env.SERVICE_EXPORTS_DIR;
  t.after(() => { if (previous === undefined) delete process.env.SERVICE_EXPORTS_DIR; else process.env.SERVICE_EXPORTS_DIR = previous; });
  process.env.SERVICE_EXPORTS_DIR = path.join(dir, 'missing');
  t.mock.method(console, 'warn', () => {});
  assert.equal(reference().renderBandTable('kr'), '');
  assert.equal(reference().renderGenreCurves('rpg', 'kr'), '');

  // The loader verifies against the real clock: date the fixture today (KST).
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const fresh = path.join(dir, '..', 'fresh');
  writeFixture(fresh, { asof: today, games: [] });
  process.env.SERVICE_EXPORTS_DIR = fresh;
  const { renderBandTable, renderGenreCurves } = reference();
  const bands = withEdition('ko', () => renderBandTable('jp'));
  assert.ok(bands.indexOf('<th class="r">일본') < bands.indexOf('<th class="r">한국'), 'page country first');
  assert.match(visibleText(bands), /순위 구간별 하루 매출 추정/);
  assert.ok(bands.includes('비공개'), 'hidden band');
  assert.match(visibleText(bands), /적중 \d+%/);
  const rpg = withEdition('ko', () => visibleText(renderGenreCurves('rpg', 'kr')));
  assert.match(rpg, /RPG 신작은 출시 후 매달 약 \d+%씩 매출이 줄어듭니다\(표본 \d+개\)/);
  assert.equal(withEdition('ko', () => renderGenreCurves('card-board', 'kr')), '', 'n < 10');
  assert.equal(withEdition('ko', () => renderGenreCurves('idle', 'kr')), '', 'site tags have no store subgenre');
  const all = withEdition('en', () => renderGenreCurves('all', 'us'));
  assert.match(all, /Monthly decline/);
  assert.match(all, /href="\/rankings\/genres\/rpg\/">RPG</);
});

test('hidden rank-band days and launch-cohort position', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const rev = svc.revenueFor({ ios: '5000000005' });
  const p = rev.m.kr.s.ios;
  assert.equal(p.d.slice(-10).every((r) => r[1] === null && r[3] === null), true, 'hidden days keep the rank, drop the numbers');
  assert.equal(p.mo[p.mo.length - 1][1], null, 'month with a hidden day is hidden');
  assert.equal(p.mtd.t, null);
  const text = withEdition('ko', () => visibleText(renderRevenueSection(rev)));
  assert.ok(text.includes('이 기간에는 추정 정확도가 충분하지 않은 순위 구간이 있어 매출 추정을 표시하지 않습니다.'));
  assert.match(text, /2026년 10월 진행 중 비공개/);
  const cohort = withEdition('ko', () => visibleText(renderRevenueSection(svc.revenueFor({ android: 'com.example.new' }))));
  assert.match(cohort, /이 게임은 매출 차트에 처음 오른 지 40일째이며, 매출이 첫 30일의 45% 수준입니다\./);
  assert.match(cohort, /전략 신작은 출시 후 매달 약 \d+%씩/);
});
