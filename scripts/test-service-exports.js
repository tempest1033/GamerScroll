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
const { pathToFileURL } = require('node:url');
const i18n = require('../src/i18n');
const { writeFixture, syntheticRanks } = require('../tests/fixtures/service-exports');
const { loadServiceExports, verifyBundle } = require('../src/build/service-exports');
const { run } = require('./fetch-service-exports');
const { playBucket } = require('../src/templates/components/revenue-charts');
const { renderRevenueSection: renderSection } = require('../src/templates/components/revenue-section');
const { splitRevenue, joinRevenue, parseGameData, stringifyGameData, HEAVY_KEY, BOUNDARY_KEY } = require('../src/templates/components/revenue-payload');
// What a reader sees once the browser has drawn the deferred parts (charts, tables): the section with every part in place.
const renderRevenueSection = (page) => renderSection(page, { mode: 'full' });
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
    mutate: overrides.mutate,
    manifest: overrides.manifest,
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

test('fetch without a deploy key omits the bundle and logs a warning', async (t) => {
  const dest = path.join(tmp(t, 'dest'), 'service-exports');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'manifest.json'), '{}'); // a stale bundle from an earlier run must not survive
  const warnings = [];
  t.mock.method(console, 'warn', (m) => warnings.push(String(m)));
  const git = () => { throw new Error('must not clone'); };
  for (const env of [{}, { FORECAST_EXPORT_DEPLOY_KEY: ' \n', FORECAST_EXPORT_REPO: 'owner/forecast' }]) {
    const result = await run({ env, dest, now: NOW, git });
    assert.equal(result.ok, false);
    assert.match(result.reason, /FORECAST_EXPORT_DEPLOY_KEY/);
    assert.equal(fs.existsSync(dest), false);
  }
  assert.ok(warnings.some((w) => /revenue sections omitted/.test(w)));
  assert.equal(loadServiceExports({ dir: dest, now: NOW, quiet: true }), null);
});

test('fetch clones the branch over SSH with only the deploy key, verifies it and keeps it; a tampered bundle is dropped', async (t) => {
  // A local repository stands in for git@github.com:owner/forecast.git, branch service-exports.
  const origin = path.join(tmp(t, 'origin'), 'forecast');
  fs.cpSync(bundle(t), origin, { recursive: true });
  const sh = (...args) => { const r = spawnSync('git', ['-C', origin, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  sh('init', '-q', '-b', 'service-exports');
  sh('add', '-A');
  sh('commit', '-qm', 'bundle');
  const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\r\nb3BlbnNzaC1rZXktdjEAAAAAtest\r\n-----END OPENSSH PRIVATE KEY-----';
  const env = { FORECAST_EXPORT_DEPLOY_KEY: KEY, FORECAST_EXPORT_REPO: 'owner/forecast' };
  const calls = [];
  const git = (args, options) => {
    const keyFile = /-i "([^"]+)"/.exec(options.env.GIT_SSH_COMMAND)[1];
    const knownHosts = /UserKnownHostsFile="([^"]+)"/.exec(options.env.GIT_SSH_COMMAND)[1];
    calls.push({ args, options, keyFile, key: fs.readFileSync(keyFile, 'utf8'), mode: fs.statSync(keyFile).mode & 0o777, knownHosts: fs.readFileSync(knownHosts, 'utf8') });
    const local = args.map((a) => (a === 'git@github.com:owner/forecast.git' ? pathToFileURL(origin).href : a));
    return spawnSync('git', local, { encoding: 'utf8', env: options.env });
  };
  const logs = [];
  t.mock.method(console, 'log', (m) => logs.push(String(m)));
  t.mock.method(console, 'warn', (m) => logs.push(String(m)));
  const saved = process.env.FORECAST_EXPORT_DEPLOY_KEY;
  process.env.FORECAST_EXPORT_DEPLOY_KEY = KEY; // as on the runner, where the step env is process.env
  t.after(() => { if (saved === undefined) delete process.env.FORECAST_EXPORT_DEPLOY_KEY; else process.env.FORECAST_EXPORT_DEPLOY_KEY = saved; });
  const dest = path.join(tmp(t, 'dest'), 'service-exports');

  const ok = await run({ env, dest, now: NOW, git });
  assert.equal(ok.ok, true, ok.reason);
  const [call] = calls;
  assert.deepEqual(call.args.slice(0, 9), ['clone', '--quiet', '--depth', '1', '--single-branch', '--no-tags', '--branch', 'service-exports', 'git@github.com:owner/forecast.git']);
  assert.ok(!call.args.some((a) => a.includes('PRIVATE KEY')), 'key never on the command line');
  assert.equal(call.key, '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAAtest\n-----END OPENSSH PRIVATE KEY-----\n', 'LF line ends, final newline');
  if (process.platform !== 'win32') assert.equal(call.mode, 0o600);
  for (const option of ['IdentitiesOnly=yes', 'IdentityAgent=none', 'BatchMode=yes', 'StrictHostKeyChecking=yes', 'GlobalKnownHostsFile=/dev/null']) assert.ok(call.options.env.GIT_SSH_COMMAND.includes(`-o ${option}`), option);
  assert.deepEqual(call.knownHosts.trim().split('\n').map((l) => l.split(' ').slice(0, 2).join(' ')), ['github.com ssh-ed25519', 'github.com ecdsa-sha2-nistp256', 'github.com ssh-rsa'], 'only github.com, pinned');
  assert.equal(call.options.env.FORECAST_EXPORT_DEPLOY_KEY, undefined, 'key not passed to git / ssh');
  assert.equal(call.options.env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(fs.existsSync(call.keyFile), false, 'key file removed');
  assert.equal(fs.existsSync(path.dirname(call.keyFile)), false, 'temp directory removed');
  assert.ok(fs.existsSync(path.join(dest, 'genres.json')));
  assert.equal(fs.existsSync(path.join(dest, '.git')), false, 'no git metadata in the bundle');
  assert.ok(logs.some((m) => /owner\/forecast asof 2026-10-25, \d+ files verified/.test(m)));

  // One game file altered after the manifest was written.
  fs.appendFileSync(path.join(origin, 'games', 'ios', `${APP.ios}.json`), ' ');
  sh('commit', '-qam', 'tamper');
  const bad = await run({ env, dest, now: NOW, git });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /sha256 mismatch/);
  assert.equal(fs.existsSync(dest), false);

  // Clone failure (wrong key / no access): warning, no bundle, key file still removed.
  const denied = await run({ env, dest, now: NOW, git: (args, options) => { calls.push({ keyFile: /-i "([^"]+)"/.exec(options.env.GIT_SSH_COMMAND)[1] }); return { status: 128, stderr: 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\n' }; } });
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /git clone owner\/forecast@service-exports failed \(exit 128\): .*Permission denied/);
  assert.equal(fs.existsSync(calls.at(-1).keyFile), false);
  assert.equal(fs.existsSync(dest), false);
  assert.ok(!logs.some((m) => m.includes('PRIVATE KEY') || m.includes('b3BlbnNzaC1rZXktdjEAAAAAtest')), 'key never logged');
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
  assert.doesNotMatch(text, /추정 하루 평균 다운로드|검증 전 추정/);
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
  assert.deepEqual([ios.w, ios.mo, ios.mtd.t, ios.o, and.o], [[], [], null, null, null], 'new games: no outlook at ingestion');
  assert.equal(ios.p.dc, null);
  assert.equal(ios.p.lr, 'launch:kr:ios:Strategy');
  assert.ok(rev.cv['launch:kr:ios:Strategy']);
  assert.equal(and.p.lr, null, 'regional launch');
  assert.deepEqual(rev.dl.r, {}, 'no iOS rating count for new games');
  assert.deepEqual(ios.fr, { r: 12, b: 5 });
  assert.deepEqual(calls, [['kr', 'ios', '9000000009', '2026-10-22'], ['kr', 'android', 'com.example.fresh', '2026-10-23']]);

  const ko = withEdition('ko', () => visibleText(renderRevenueSection(rev)));
  for (const s of ['앱스토어 · 출시 4일차', '구글플레이 · 차트 진입 3일차', '출시 전', '차트 진입 전', '신규: 아직 검증되지 않음', '집계 중', '인기(무료) 차트 순위: 12위', '최고 5위', '전 세계 누적 설치 10만+']) assert.ok(ko.includes(s), s);
  // No new-release forecast anywhere: no outlook block, no "new" outlook tag or note.
  assert.doesNotMatch(ko, /구글플레이 · 출시|누적 평점|매달 약|앞으로 14일|14일 전망|신작|신규 게임 전망|이번 달 1일–어제 추정 매출|추정 월매출/);
  const forced = JSON.parse(JSON.stringify(rev));
  forced.m.kr.s.ios.o = svc.revenueFor({ android: 'com.example.fresh' }).m.kr.s.android.o || { c: '2026-10-25', d: Array.from({ length: 14 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, '0')}`, 50, 55, 60, 70, 80, 0.5]), t: [1, 2, 3] };
  for (const code of ['ko', 'en', 'ja', 'zh-cn', 'zh-tw']) assert.ok(!withEdition(code, () => renderRevenueSection(forced)).includes('rv-outlook'), `${code}: render drops a new game's outlook`);
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
  assert.match(text, /추정 하루 평균 다운로드 [\d.]+만–[\d.]+만 \(중앙값 [\d.]+만\)/, 'Google Play download estimate');
  const us = withEdition('en', () => renderRevenueSection(svc.revenueFor({ ios: '3000000003' })));
  assert.ok(!us.includes('rv-position'), 'curves with n < 10 are hidden');
  assert.ok(!us.includes('id="rv-usd"'), 'USD market needs no USD switch');
});

test('per-market download estimates: tiered labels, charts, fallback where the model has none', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  const html = withEdition('ko', () => renderRevenueSection(svc.revenueFor(APP)));
  const jp = html.slice(html.indexOf('rv-mp-jp'));
  const kr = html.slice(html.indexOf('rv-mp-kr'), html.indexOf('rv-mp-jp'));
  assert.match(visibleText(jp), /추정 하루 평균 다운로드 [\d.]+만?–[\d.]+만? \(중앙값 [\d.]+만?\)/);
  assert.ok(visibleText(jp).includes('검증 전 추정 · 전 세계 설치 수로 검증, 시장 배분은 가정 · 범위가 넓습니다'), 'unverified tier badge');
  assert.ok(visibleText(jp).includes('공식 자료로 아직 검증하지 않았습니다'), 'unverified tier note');
  assert.match(jp, /<div class="rv-chartbox[^"]* rv-weak">/, 'lighter band');
  assert.match(jp, /aria-label="일본 앱스토어 일별 하루 평균 추정 다운로드: 중앙값 [^"]+"/);
  assert.ok(visibleText(jp).includes('월별 하루 평균 추정 다운로드'));
  assert.ok(visibleText(jp).includes('이 스토어 누적 평점 678개'), 'cumulative fallback kept beside the estimate');
  assert.ok(!visibleText(jp).includes('제공 안 함'));
  assert.ok(visibleText(kr).includes('이 스토어 누적 평점 12,345개') && visibleText(kr).includes('전 세계 누적 설치 500만+'), 'fallback without a model');
  assert.ok(visibleText(kr).includes('시장별 다운로드: 제공 안 함'));
  const verified = withEdition('ko', () => visibleText(renderRevenueSection(svc.revenueFor({ ios: '4000000004' }))));
  assert.ok(verified.includes('이 시장의 신규 설치 수를 공개 자료로 보정해 추정한 범위입니다.'), 'verified tier note');
  assert.doesNotMatch(verified, /검증 전|가정 기반/, 'verified: no weak-tier badge');
  assert.ok(verified.includes('검증된 추정'), 'verified: its own evidence badge');
  assert.ok(verified.includes('근거: 이 스토어 무료(인기) 차트 순위로 추정했습니다.'), 'basis text');
  assert.ok(verified.includes('이 스토어는 추정 정확도가 충분하지 않아 매출 추정을 표시하지 않습니다.'));
  const en = withEdition('en', () => visibleText(renderRevenueSection(svc.revenueFor(APP))));
  assert.match(en, /Estimated average daily downloads [\d.]+K?–[\d.]+K? \(median [\d.]+K?\)/);
});

test('download evidence tiers: assumption iOS + verified Play, partial-store Play, CN iOS only, non-display tiers', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Tiers' };
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...game, store: 'ios', app_id: '1100000011', markets: { kr: { ranks: syntheticRanks(20), downloads: 'assumption' }, us: { ranks: syntheticRanks(22), downloads: 'unverified' } }, ios_ratings: { kr: 500 } },
    { ...game, store: 'android', app_id: 'com.example.tiers', markets: { kr: { ranks: syntheticRanks(25), downloads: 'verified', downloadsBasis: 'below_free_200' }, us: { ranks: syntheticRanks(28), downloads: 'partial_store' }, cn: { ranks: syntheticRanks(30), downloads: 'verified' } }, play_bucket_min: 1000000 },
    { ...game, store: 'ios', app_id: '1200000012', markets: { cn: { ranks: syntheticRanks(15), downloads: 'pending_prospective' } } },
    { ...game, store: 'ios', app_id: '1300000013', markets: { cn: { ranks: syntheticRanks(16), downloads: 'verified', downloadsBasis: '<img src=x onerror=alert(1)>' } } },
  ] }), now: NOW });
  const rev = svc.revenueFor({ ios: '1100000011', ios_cn: '1200000012', android: 'com.example.tiers' }, { freeRank: () => ({ r: 33, b: 7 }) });
  assert.equal(rev.m.cn.s.ios.de, undefined, 'pending_prospective: no numbers');
  assert.equal(rev.m.cn.s.android.de, undefined, 'CN Android downloads are never estimated');
  const html = withEdition('ko', () => renderRevenueSection(rev));
  const kr = html.slice(html.indexOf('rv-mp-kr'), html.indexOf('rv-mp-us'));
  const us = html.slice(html.indexOf('rv-mp-us'), html.indexOf('rv-mp-cn'));
  const cn = html.slice(html.indexOf('rv-mp-cn'));
  const view = (part, cls) => part.split('<div class="rv-x ').filter((x) => x.startsWith(cls)).map(visibleText).join(' ');
  // Both stores summed: the less certain tier (assumption) labels the sum, with both bases.
  assert.ok(view(kr, 'rv-x-all').includes('가정 기반 추정 · 같은 시장 Google Play 자료로 환산 · 범위가 매우 넓습니다'));
  assert.ok(view(kr, 'rv-x-all').includes('근거: 이 스토어 무료(인기) 차트 순위로 추정했습니다.') && view(kr, 'rv-x-all').includes('근거: 무료 차트 200위 밖이라'));
  assert.ok(view(kr, 'rv-x-ios').includes('가정 기반 추정') && view(kr, 'rv-x-ios').includes('이 스토어 누적 평점 500개'));
  assert.doesNotMatch(view(kr, 'rv-x-and'), /가정 기반|검증 전|제공 안 함/);
  assert.ok(view(kr, 'rv-x-and').includes('검증된 추정'), 'verified badge');
  assert.ok(view(kr, 'rv-x-and').includes('전 세계 누적 설치 100만+') && view(kr, 'rv-x-and').includes('인기(무료) 차트 순위: 33위'));
  // Partial store: own badge, not summed with the other store.
  assert.ok(view(us, 'rv-x-and').includes('일부 스토어만 반영'));
  assert.ok(view(us, 'rv-x-all').includes('일부 스토어만 반영') && view(us, 'rv-x-all').includes('검증 전 추정 · 전 세계 설치 수로 검증, 시장 배분은 가정 · 범위가 넓습니다'));
  // CN: App Store only, said plainly; iOS pending → "not available", never a number; Android: no estimate.
  assert.ok(visibleText(cn).includes('중국에는 Google Play가 없어, 다운로드 추정은 중국 App Store(iOS)만 다룹니다.'));
  assert.ok(!visibleText(kr).includes('중국에는 Google Play가 없어'), 'CN note on the CN panel only');
  assert.ok(view(cn, 'rv-x-ios').includes('시장별 다운로드: 제공 안 함'));
  assert.doesNotMatch(visibleText(cn), /추정 하루 평균 다운로드/);
  // Render re-check: CN Android page data that still carries an estimate shows none.
  const page = JSON.parse(JSON.stringify(rev));
  page.m.cn.s.android.de = svc.revenueFor({ android: 'com.example.tiers' }).m.kr.s.android.de;
  assert.doesNotMatch(visibleText(withEdition('ko', () => renderRevenueSection(page)).split('rv-mp-cn')[1]), /추정 하루 평균 다운로드/);
  // A basis outside the allowlist is dropped, never shown raw.
  const cnIos = svc.revenueFor({ ios: '1300000013' });
  assert.equal(cnIos.m.cn.s.ios.de.b, undefined);
  const cnHtml = withEdition('ko', () => renderRevenueSection(cnIos));
  assert.ok(!/<img/i.test(cnHtml) && !visibleText(cnHtml).includes('근거:'));
  assert.match(visibleText(cnHtml), /추정 하루 평균 다운로드 [\d.]+만?–/, 'CN iOS estimate shown');
  for (const code of ['en', 'ja', 'zh-cn', 'zh-tw']) {
    const text = withEdition(code, () => visibleText(renderRevenueSection(rev)));
    assert.deepEqual(text.match(/[\uAC00-\uD7A3]+/g) || [], [], `no Hangul in ${code}`);
    for (const key of ['rev.dl_tier_assumption', 'rev.dl_tier_partial_store', 'rev.dl_tier_verified', 'rev.dl_none', 'rev.dl_cn_ios_only', 'rev.dl_basis_below_free_200']) assert.ok(text.includes(withEdition(code, () => i18n.t(key))), `${code} ${key}`);
  }
});

test('14-day outlook: drop-out chance for ranks 51–200 only, backtest note only from outlook_model, `outlook` key', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Outlook' };
  const games = [
    { ...game, store: 'ios', app_id: '1400000014', markets: { kr: { ranks: syntheticRanks(150) } } },
    { ...game, store: 'ios', app_id: '1500000015', markets: { kr: { ranks: syntheticRanks(12) } } },
    { ...game, store: 'ios', app_id: '1600000016', markets: { kr: { ranks: syntheticRanks(140), outlookKey: 'outlook' } } },
  ];
  const outlookOf = (html) => visibleText(html.slice(html.indexOf('rv-outlook'), html.indexOf('rv-position') > 0 ? html.indexOf('rv-position') : undefined));
  const plain = loadServiceExports({ dir: bundle(t, { games }), now: NOW });
  const low = withEdition('ko', () => outlookOf(renderRevenueSection(plain.revenueFor({ ios: '1400000014' }))));
  assert.match(low, /14일째\([^)]+\)에 매출 순위 200위 밖에 있을 가능성: (낮음|가능성 있음|높음)/);
  // Day-14 value only, mapped at 0.3 / 0.6.
  const base = plain.revenueFor({ ios: '1400000014' });
  const level = (p, mid = 0.95) => {
    const page = JSON.parse(JSON.stringify(base));
    page.m.kr.s.ios.o.d = page.m.kr.s.ios.o.d.map((r, i, a) => [...r.slice(0, 6), i === a.length - 1 ? p : mid]);
    const text = withEdition('ko', () => outlookOf(renderRevenueSection(page)));
    return text.match(/가능성: (낮음|가능성 있음|높음)/)[1];
  };
  assert.deepEqual([level(0), level(0.299), level(0.3), level(0.599), level(0.6), level(1)], ['낮음', '낮음', '가능성 있음', '가능성 있음', '높음', '높음']);
  for (const code of ['en', 'ja', 'zh-cn', 'zh-tw']) {
    const text = withEdition(code, () => outlookOf(renderRevenueSection(base)));
    const labels = ['low', 'possible', 'likely'].map((k) => withEdition(code, () => i18n.t(`rev.p_out_${k}`)));
    const head = withEdition(code, () => i18n.t('rev.p_out')).split('{p}')[0].replace(/\{days\}/, '14').split('{date}')[0];
    assert.ok(text.includes(head) && labels.some((l) => text.includes(l)), code);
  }
  const top = withEdition('ko', () => outlookOf(renderRevenueSection(plain.revenueFor({ ios: '1500000015' }))));
  assert.ok(top.includes('평소대로면 앞으로 14일 순위') && !top.includes('200위 밖에 있을 확률'), 'top 50: no drop-out line');
  assert.doesNotMatch(low + top, /백테스트|적중률/, 'no outlook_model → no accuracy number');
  const alt = plain.revenueFor({ ios: '1600000016' });
  assert.ok(alt.m.kr.s.ios.o && alt.m.kr.s.ios.o.d.length === 14, 'outlook key read');
  // outlook_model in the manifest → method note; malformed → none.
  const withModel = loadServiceExports({ dir: bundle(t, { games, manifest: { outlook_model: { name: 'rank-outlook', frozen_config: 'x', backtest: { cov80: 0.83, cutoffs: 33, period: '2026-02-01/2026-09-30' } } } }), now: NOW });
  const rev = withModel.revenueFor({ ios: '1400000014' });
  assert.deepEqual(rev.om, { n: 33, c: 0.83 });
  assert.ok(withEdition('ko', () => outlookOf(renderRevenueSection(rev))).includes('과거 33주 백테스트에서 80% 범위 적중률 83%'));
  assert.ok(withEdition('en', () => outlookOf(renderRevenueSection(rev))).includes('In a backtest over the past 33 weeks, the 80% range held 83% of the time.'));
  // Documented schema only: cov80 a fraction in (0, 1], cutoffs a positive integer.
  const exact = loadServiceExports({ dir: bundle(t, { games, manifest: { outlook_model: { backtest: { cov80: 0.8335, cutoffs: 33 } } } }), now: NOW }).revenueFor({ ios: '1400000014' });
  assert.ok(withEdition('ko', () => outlookOf(renderRevenueSection(exact))).includes('과거 33주 백테스트에서 80% 범위 적중률 83%'));
  for (const bad of [{ backtest: { cov80: 1.5, cutoffs: 33 } }, { backtest: { cov80: 81, cutoffs: 33 } }, { backtest: { cov80: 0.83, cutoffs: ['garbage'] } }, { backtest: { cov80: 0.83, cutoffs: Array.from({ length: 30 }, () => '2026-01-01') } }, { backtest: { cov80: 0.83, cutoffs: 33.5 } }, { backtest: { cov80: 0.83, cutoffs: '33' } }, { backtest: { cov80: 0, cutoffs: 33 } }, { backtest: { cov80: '<img src=x>', cutoffs: 33 } }, { backtest: { cov80: 0.83 } }, { backtest: { cov80: 0.8, cutoffs: 0 } }, 'x', null]) {
    const svc = loadServiceExports({ dir: bundle(t, { games, manifest: { outlook_model: bad } }), now: NOW });
    const r = svc.revenueFor({ ios: '1400000014' });
    assert.equal(r.om, undefined, JSON.stringify(bad));
    assert.doesNotMatch(withEdition('ko', () => outlookOf(renderRevenueSection(r))), /백테스트/);
  }
  // Render re-check of page data om.
  const page = { ...plain.revenueFor({ ios: '1400000014' }), om: { n: '33<b>', c: 0.83 } };
  assert.doesNotMatch(withEdition('ko', () => outlookOf(renderRevenueSection(page))), /백테스트/);
  for (const om of [{ n: 33, c: 1.5 }, { n: 33, c: 81 }, { n: 0, c: 0.8 }]) assert.doesNotMatch(withEdition('ko', () => outlookOf(renderRevenueSection({ ...base, om }))), /백테스트/, JSON.stringify(om));
});

test('dl-v1 basis "<code>; <free text>": code kept, free text never rendered; tier labels by market; per-day units', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Basis' };
  const free = 'unverified: Play global installs validated <img src=x onerror=alert(1)>';
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...game, store: 'android', app_id: 'com.example.basis', markets: { kr: { ranks: syntheticRanks(30), downloads: 'unverified', downloadsBasis: `free_rank; ${free}` } }, play_bucket_min: 1000000 },
    { ...game, store: 'ios', app_id: '1900000019', markets: { kr: { ranks: syntheticRanks(30), downloads: 'assumption', downloadsBasis: ' below_free_200 ;x' }, cn: { ranks: syntheticRanks(30), downloads: 'assumption', downloadsBasis: 'free_rank; assumption: CN iOS' } } },
    { ...game, store: 'ios', app_id: '1900000020', markets: { kr: { ranks: syntheticRanks(30), downloads: 'assumption', downloadsBasis: 'mystery; free_rank' } } },
  ] }), now: NOW });
  const and = svc.revenueFor({ android: 'com.example.basis' });
  const ios = svc.revenueFor({ ios: '1900000019', ios_cn: '1900000019' });
  assert.equal(and.m.kr.s.android.de.b, 'free_rank');
  assert.equal(ios.m.kr.s.ios.de.b, 'below_free_200');
  assert.equal(svc.revenueFor({ ios: '1900000020' }).m.kr.s.ios.de.b, undefined, 'unknown code dropped');
  const ko = withEdition('ko', () => renderRevenueSection(and));
  assert.ok(!ko.includes('validated') && !ko.includes('<img'), 'free text never rendered');
  assert.ok(visibleText(ko).includes('검증 전 추정 · 전 세계 설치 수로 검증, 시장 배분은 가정 · 범위가 넓습니다'));
  assert.ok(visibleText(ko).includes('근거: 이 스토어 무료(인기) 차트 순위로 추정했습니다.'));
  const kios = visibleText(withEdition('ko', () => renderRevenueSection(ios)));
  assert.ok(kios.includes('가정 기반 추정 · 같은 시장 Google Play 자료로 환산 · 범위가 매우 넓습니다'));
  assert.ok(kios.includes('가정 기반 추정 · 중국 iOS 자체 수준 가정 · 범위가 매우 넓습니다'));
  assert.ok(kios.includes('추정 하루 평균 다운로드') && kios.includes('하루 평균입니다') && !kios.includes('추정 월 다운로드'));
  for (const code of ['en', 'ja', 'zh-cn', 'zh-tw']) {
    const text = visibleText(withEdition(code, () => renderRevenueSection(ios)));
    for (const k of ['rev.dl_tier_assumption', 'rev.dl_tier_assumption_cn', 'rev.dl_units']) assert.ok(text.includes(withEdition(code, () => i18n.t(k))), `${code} ${k}`);
    assert.doesNotMatch(text, /[\uAC00-\uD7A3]{2}/, code);
  }
});

test('drop-out label: eligibility from the cutoff-day rank, not the latest rank', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Cutoff' };
  const svc = loadServiceExports({ dir: bundle(t, { games: [{ ...game, store: 'ios', app_id: '1700000017', markets: { kr: { ranks: syntheticRanks(100) } } }] }), now: NOW });
  const base = svc.revenueFor({ ios: '1700000017' });
  const shown = (atCutoff, latest) => {
    const page = JSON.parse(JSON.stringify(base));
    const p = page.m.kr.s.ios;
    const n = p.d.length;
    // The cutoff is the day before the latest daily day.
    p.o.c = new Date(Date.parse(p.d0) + (n - 2) * 86400000).toISOString().slice(0, 10);
    p.d[n - 2][0] = atCutoff;
    p.d[n - 1][0] = latest;
    const html = withEdition('ko', () => renderRevenueSection(page));
    return visibleText(html).includes('200위 밖에 있을 가능성');
  };
  assert.equal(shown(60, 20), true, 'cutoff 60 / latest 20 → shown');
  assert.equal(shown(20, 60), false, 'cutoff 20 / latest 60 → not shown');
  assert.equal(shown(51, 1), true);
  assert.equal(shown(50, 120), false);
  assert.equal(shown(null, 120), false, 'off chart on the cutoff day → not shown');
});

test('drop-out label: classified on the unrounded day-14 p_out (p<0.3 low, 0.3≤p<0.6 possible, p≥0.6 likely)', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Levels' };
  const cases = [[0.2999, '낮음'], [0.29999999, '낮음'], [0.3, '가능성 있음'], [0.5999, '가능성 있음'], [0.59999999, '가능성 있음'], [0.6, '높음'], [0, '낮음'], [1, '높음']];
  const games = cases.map(([p], i) => ({ ...game, store: 'ios', app_id: String(1800000000 + i), markets: { kr: { ranks: syntheticRanks(150), pOut14: p } } }));
  const svc = loadServiceExports({ dir: bundle(t, { games }), now: NOW });
  cases.forEach(([p, label], i) => {
    const rev = svc.revenueFor({ ios: String(1800000000 + i) });
    const o = rev.m.kr.s.ios.o;
    assert.equal(o.d[o.d.length - 1][6], p, `p_out ${p} kept unrounded at ingestion`);
    const text = withEdition('ko', () => visibleText(renderRevenueSection(rev)));
    assert.equal(text.match(/200위 밖에 있을 가능성: (낮음|가능성 있음|높음)/)[1], label, `p_out ${p}`);
    assert.doesNotMatch(text, /200위 밖에 있을 가능성: [^ ]*\d+%/, 'no percentage');
  });
});

test('genre curves are labelled as past patterns, not a forecast', (t) => {
  const svc = loadServiceExports({ dir: bundle(t), now: NOW });
  for (const code of ['ko', 'en', 'ja', 'zh-cn', 'zh-tw']) {
    const html = withEdition(code, () => renderRevenueSection(svc.revenueFor(APP)));
    const pos = visibleText(html.slice(html.indexOf('rv-position')));
    assert.ok(html.includes('rv-position'));
    assert.ok(pos.includes(withEdition(code, () => i18n.t('rev.past_pattern'))) && pos.includes(withEdition(code, () => i18n.t('rev.past_pattern_note'))), code);
  }
});

// Tier allowlists (revenue: beta, wide; downloads: verified, unverified, assumption, partial_store): crafted bundles whose
// numbers are present but whose tier is unrated, unknown or missing must show no numbers, at ingestion and at render.
const MONEY = /추정 월매출|추정 하루 평균 다운로드|이번 달 1일–어제 추정 매출/;
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

test('off-chart days use the explicit 51-200 band key: absent → masked, at ingestion and render', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Off chart' };
  // iOS (revenue from the store release date, so off-chart days carry estimates), ranks 1–8 after 20 off-chart days
  const svc = loadServiceExports({ dir: bundle(t, { games: [
    { ...game, store: 'ios', app_id: '6500000005', markets: { kr: { ranks: syntheticRanks(5, { gap: 20 }), tierByBand: { '1-10': 'wide' } } } },
  ] }), now: NOW });
  const p = svc.revenueFor({ ios: '6500000005' }).m.kr.s.ios;
  assert.ok(p.d.slice(0, 20).every((r) => r[0] == null && r[1] == null && r[3] == null), 'off-chart days masked');
  assert.ok(p.d.slice(20).every((r) => r[0] <= 10 && r[1] != null), 'ranked days in 1-10 kept');
  assert.equal(p.mo[0][1], null, 'month with off-chart days hidden');
  assert.equal(p.w[0][1], null, 'week with off-chart days hidden');
  assert.ok(p.mo[p.mo.length - 1][1] != null);

  // Render: page data whose off-chart days carry numbers, with a tb lacking the 51-200 key.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP);
  const jp = good.m.jp.s.ios; // 20 off-chart days, then ranks ~24–43
  assert.ok(jp.d.slice(0, 20).every((r) => r[0] == null && r[1] != null), 'the fixture estimates off-chart days');
  const page = JSON.parse(JSON.stringify(good));
  page.m.jp.s.ios.tb = [[1, 50, 'wide']];
  const shown = P.displayStore(page.m.jp.s.ios);
  assert.ok(shown.d.slice(0, 20).every((r) => r[1] == null), 'render masks off-chart days');
  assert.ok(shown.d.slice(20).every((r) => r[1] != null));
  assert.equal(shown.mo[0][1], null);
  const jpText = (rev) => { const html = withEdition('ko', () => renderRevenueSection(rev)); return visibleText(html.slice(html.indexOf('rv-mp-jp'))); };
  const hiddenLabel = withEdition('ko', () => i18n.t('rev.bands_hidden'));
  assert.ok(!jpText(good).includes(hiddenLabel));
  assert.ok(jpText(page).includes(hiddenLabel), 'months with off-chart days show the hidden note');
  // the declared key with a shown tier keeps them
  page.m.jp.s.ios.tb = [[1, 50, 'wide'], [51, 200, 'beta']];
  assert.ok(P.displayStore(page.m.jp.s.ios).d.slice(0, 20).every((r) => r[1] != null));
});

test('tier_by_band missing, null, [] or "x": no band allowed → no revenue numbers, at ingestion and render', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'No bands' };
  const ranks = syntheticRanks(8, { gap: 20 }); // off-chart days, then ranked days
  const cases = { '6600000001': undefined, '6600000002': null, '6600000003': [], '6600000004': 'x', '6600000005': { x: 'wide' } };
  const svc = loadServiceExports({ dir: bundle(t, { games: Object.entries(cases).map(([app_id, tierByBand]) => ({ ...game, store: 'ios', app_id, markets: { kr: { ranks, tierByBand } } })) }), now: NOW });
  const hiddenLabel = withEdition('ko', () => i18n.t('rev.bands_hidden'));
  const noNumbers = (p, where) => {
    assert.ok(p.d.length && p.d.every((r) => r[1] == null && r[2] == null && r[3] == null), `${where}: days`);
    assert.ok(p.d.some((r) => r[0] != null), `${where}: ranks kept`);
    for (const r of [...p.w, ...p.mo]) assert.ok(r.slice(1).every((x) => x == null), `${where}: period ${r[0]}`);
    if (p.mtd) { assert.equal(p.mtd.t, null, `${where}: mtd`); assert.ok(p.mtd.d.every((r) => r.slice(2).every((x) => x == null))); }
    if (p.o) assert.equal(p.o.t, null, `${where}: outlook total`);
  };
  for (const app of Object.keys(cases)) {
    const rev = svc.revenueFor({ ios: app });
    assert.ok(rev, app);
    noNumbers(rev.m.kr.s.ios, `ingestion ${app}`);
    const html = withEdition('ko', () => renderRevenueSection(rev));
    assert.ok(visibleText(html).includes(hiddenLabel), `${app}: hidden note`);
  }
  // Render: page data with numbers but tb removed / null / [] / "x" / malformed rows → masked.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP);
  assert.ok(good.m.kr.s.ios.d.some((r) => r[1] != null) && good.m.kr.s.ios.mo.some((r) => r[1] != null));
  for (const tb of [undefined, null, [], 'x', [['1', '200', 'wide']]]) {
    const page = JSON.parse(JSON.stringify(good));
    for (const x of Object.values(page.m)) for (const p of Object.values(x.s)) { if (tb === undefined) delete p.tb; else p.tb = tb; }
    const ios = P.displayStore(page.m.kr.s.ios);
    noNumbers(ios, `render ${JSON.stringify(tb)}`);
    assert.deepEqual(P.displayStore(ios), ios, 'idempotent');
    const html = withEdition('ko', () => renderRevenueSection(page));
    assert.ok(visibleText(html).includes(hiddenLabel), `render ${JSON.stringify(tb)}: hidden note`);
  }
});

// Bundle strings (titles, developer, genres, currency, dates, tiers, band names, notes) never reach the HTML as markup:
// bad currency / dates drop the record or cell at ingestion, the rest is escaped at render.
const XSS = '"><img src=x onerror=alert(1)>';
const assertNoMarkup = (html, where) => { assert.ok(!/<img/i.test(html), `raw markup in ${where}`); assert.ok(!html.includes(XSS), where); };
const EDITIONS = ['ko', 'en', 'ja', 'zh-cn', 'zh-tw'];

test('crafted bundle strings: dropped or escaped in the game section', (t) => {
  t.mock.method(console, 'warn', () => {});
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'XSS' };
  const svc = loadServiceExports({ dir: bundle(t, {
    games: [
      { ...game, store: 'ios', app_id: '8000000001', markets: { kr: { ranks: syntheticRanks(12), downloads: 'unverified' }, jp: { ranks: syntheticRanks(12) } }, ios_ratings: { kr: 5, jp: 6 } },
      { ...game, store: 'android', app_id: 'com.example.xss', markets: { kr: { ranks: syntheticRanks(14), downloads: 'verified' } }, play_bucket_min: 1000000 },
      { ...game, store: 'ios', app_id: '8000000003', markets: { kr: { ranks: syntheticRanks(12) } } },
      { ...game, store: 'ios', app_id: '8000000004', markets: { kr: { ranks: syntheticRanks(12) } } },
    ],
    mutate: (rel, j) => {
      if (rel === 'games/ios/8000000001.json') {
        Object.assign(j, { title: XSS, developer: XSS, genre: XSS, subgenre: XSS });
        Object.assign(j.markets.kr, { title: XSS, best_rank: XSS });
        j.markets.kr.position.genre_key = XSS;
        j.markets.jp.currency = XSS; // → the jp record is dropped
      }
      if (rel === 'games/android/com.example.xss.json') { j.markets.kr.downloads_est.tier = XSS; j.markets.kr.title = XSS; }
      if (rel === 'games/ios/8000000003.json') j.markets.kr.mtd.month = XSS;
      if (rel === 'games/ios/8000000004.json') j.markets.kr.outlook14.days[0][0] = XSS;
      if (rel === 'genres.json') {
        j.caveats = [XSS];
        for (const c of [...Object.values(j.decay), ...Object.values(j.launch)]) if (c.market === 'kr') c.genre += XSS;
      }
      if (rel === 'bands.json') {
        Object.assign(j, { notes: [XSS], bands: XSS });
        j.cells[0].band = XSS;
        j.cells.find((c) => c.market === 'jp' && c.store === 'ios' && c.lo === 5).currency = XSS;
      }
    },
  }), now: NOW });
  const rev = svc.revenueFor({ ios: '8000000001', android: 'com.example.xss' });
  assert.ok(!rev.m.jp || !rev.m.jp.s.ios, 'record with a foreign currency dropped');
  assert.equal(rev.m.kr.c, 'KRW');
  assert.equal(rev.m.kr.s.android.de, undefined, 'crafted download tier: no estimate');
  for (const id of ['8000000003', '8000000004']) { const r = svc.revenueFor({ ios: id }); assert.ok(!r || !r.m.kr || !r.m.kr.s.ios, `bad date drops ${id}`); }
  assert.equal(svc.skipped, 3);
  assert.ok(!svc.bands.some((b) => b.market === 'jp' && b.store === 'ios' && b.lo === 5), 'band cell with a foreign currency dropped');
  for (const code of EDITIONS) {
    const html = withEdition(code, () => renderRevenueSection(rev));
    assertNoMarkup(html, `section ${code}`);
    assert.ok(html.includes('&lt;img'), 'the crafted curve genre is rendered escaped');
  }

  // Render layer on its own: crafted strings in the page data.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP);
  const page = JSON.parse(JSON.stringify(good));
  page.a = XSS;
  page.b = { y: XSS, m: XSS, f: XSS };
  page.m.kr.fx = XSS;
  const ios = page.m.kr.s.ios;
  Object.assign(ios.mtd, { m: XSS, th: XSS });
  ios.mtd.d[0][0] = XSS;
  ios.mo[0][0] = XSS;
  ios.fr = { r: XSS, b: XSS };
  page.m.kr.s.android.de = { ...page.m.jp.s.ios.de, t: XSS };
  for (const c of Object.values(page.cv)) c.genre = XSS;
  page.m[XSS] = page.m.us;
  // a foreign currency in the page data: no revenue numbers in that market
  const foreign = JSON.parse(JSON.stringify(good));
  foreign.m.kr.c = XSS;
  for (const code of EDITIONS) {
    const html = withEdition(code, () => renderRevenueSection(page));
    assertNoMarkup(html, `page data ${code}`);
    assert.ok(!html.includes('data-fx="' + XSS), 'fx');
    const kr = withEdition(code, () => renderRevenueSection(foreign));
    assertNoMarkup(kr, `currency ${code}`);
    const panel = kr.slice(kr.indexOf('rv-mp-kr')).split('rv-mp-jp')[0];
    assert.ok(!panel.includes('rv-band') && panel.includes(withEdition(code, () => i18n.t('rev.hidden'))), `foreign currency hides kr revenue (${code})`);
  }
});

test('crafted bundle strings: dropped or escaped in the rank hub and genre cards', (t) => {
  const dir = bundle(t);
  const reference = () => { delete require.cache[require.resolve('../src/templates/components/revenue-reference')]; return require('../src/templates/components/revenue-reference'); };
  const previous = process.env.SERVICE_EXPORTS_DIR;
  t.after(() => { if (previous === undefined) delete process.env.SERVICE_EXPORTS_DIR; else process.env.SERVICE_EXPORTS_DIR = previous; });
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const crafted = path.join(dir, '..', 'crafted');
  writeFixture(crafted, { asof: today, games: [], mutate: (rel, j) => {
    if (rel === 'genres.json') {
      j.caveats = [XSS];
      for (const c of [...Object.values(j.decay), ...Object.values(j.launch)]) if (c.market === 'kr') c.genre += XSS;
      j.decay[Object.keys(j.decay)[0]].market = XSS;
    }
    if (rel === 'bands.json') {
      Object.assign(j, { notes: [XSS], bands: XSS });
      for (const c of j.cells) c.band = XSS;
      for (const c of j.cells.filter((x) => x.market === 'jp')) c.currency = XSS; // the whole jp column
    }
  } });
  process.env.SERVICE_EXPORTS_DIR = crafted;
  const { renderBandTable, renderGenreCurves } = reference();
  for (const code of EDITIONS) {
    const bands = withEdition(code, () => renderBandTable('kr'));
    assertNoMarkup(bands, `bands ${code}`);
    assert.ok(bands.includes('<small>KRW</small>') && !/<th class="r">[^<]*<small>(?!KRW|USD|TWD|CNY)/.test(bands), 'fixed currencies only');
    assert.ok(!bands.includes(withEdition(code, () => i18n.t('stats.japan'))), 'jp cells with a foreign currency dropped');
    for (const id of ['rpg', 'all', 'strategy-defense']) assertNoMarkup(withEdition(code, () => renderGenreCurves(id, 'kr')), `genre ${id} ${code}`);
  }
  assert.ok(withEdition('ko', () => renderGenreCurves('all', 'kr')).includes('&lt;img'), 'crafted genre names escaped in the decay table');
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
  assert.doesNotMatch(text, /추정 하루 평균 다운로드/);
  assert.ok(text.includes('시장별 다운로드: 제공 안 함') && text.includes('이 스토어 누적 평점 77개') && text.includes('전 세계 누적 설치 100만+'));

  // Render layer: a numeric estimate with a non-allowlisted tier in the page data.
  const good = loadServiceExports({ dir: bundle(t), now: NOW }).revenueFor(APP);
  assert.ok(P.downloadsShown(good.m.jp.s.ios.de));
  for (const tier of ['unrated', 'pending_prospective', 'reference', undefined]) {
    const page = JSON.parse(JSON.stringify(good));
    if (tier === undefined) delete page.m.jp.s.ios.de.t; else page.m.jp.s.ios.de.t = tier;
    const html = withEdition('ko', () => renderRevenueSection(page));
    const jp = visibleText(html.slice(html.indexOf('rv-mp-jp')));
    assert.doesNotMatch(jp, /추정 하루 평균 다운로드/, `render: download tier ${tier}`);
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

test('server render: text summary with placeholders; the browser parts (same keys) complete it to the full section', (t) => {
  const game = { subgenre: 'Role Playing', release_date: '2026-03-02', title: 'Mid' };
  const svc = loadServiceExports({ dir: bundle(t, { games: [{ ...game, store: 'ios', app_id: '1900000019', markets: { kr: { ranks: syntheticRanks(150), pOut14: 0.7 } } }] }), now: NOW });
  const ids = [APP, { ios: '1900000019' }, { ios: '5000000005' }, { android: 'com.example.new' }, { ios: '2000000002', android: 'com.example.mixed' }, { ios: '3000000003' }];
  const loader = /<script>\(function\(\)\{var r=document\.currentScript\.closest\('\.rv'\),d=0;[\s\S]*?<\/script>/;
  for (const page of ids.map((x) => svc.revenueFor(x))) {
    const { light, heavy } = splitRevenue(page);
    assert.deepEqual(joinRevenue(light, heavy), { ...page, h: light.h }, 'join restores the payload');
    assert.ok(JSON.stringify(light).length < JSON.stringify(page).length / 2, 'the server half is the small one');
    for (const code of ['ko', 'en', 'ja', 'zh-cn', 'zh-tw']) withEdition(code, () => {
      const ssr = renderSection(light, { slug: 'a b/c' });
      assert.equal(renderSection({ ...page, h: light.h }, { slug: 'a b/c' }), ssr, `${code}: the light half renders what the whole payload renders`);
      assert.doesNotMatch(ssr, /<svg|role="img"/, `${code}: no chart on the server`);
      assert.ok(ssr.includes(`data-rv-src="/games-data/a%20b%2Fc.json" data-rv-h="${light.h}"`), 'page data file and payload hash');
      assert.match(ssr, loader, 'browser loader');
      assert.ok(ssr.includes(`/assets/${code === 'en' ? '' : `${code}/`}revenue-section.js?v=`), 'edition asset');
      // The browser: collect mode on the joined payload yields one part per server placeholder, same placeholder markup.
      const { parts } = renderSection(joinRevenue(light, heavy), { mode: 'collect' });
      assert.deepEqual([...ssr.matchAll(/ data-rv="(\d+)"/g)].map((m) => m[1]), [...parts.keys()], `${code}: placeholders ↔ parts`);
      let filled = ssr;
      for (const part of parts.values()) { assert.ok(filled.includes(part.ph)); filled = filled.replace(part.ph, () => part.make()); }
      assert.doesNotMatch(filled, / data-rv="/, 'parts render whole (no nested placeholders)');
      assert.equal(filled.replace(/ data-rv-src="[^"]*" data-rv-h="[^"]*"/, '').replace(loader, ''), renderRevenueSection(page), `${code}: filled = full section`);
    });
  }
  // What the server text says (ko): headline, month to date, outlook + drop-out level, downloads range + tier, past pattern.
  const ko = (ids) => withEdition('ko', () => visibleText(renderSection(splitRevenue(svc.revenueFor(ids)).light, { slug: 's' })));
  const app = ko(APP);
  assert.match(app, /추정 월매출 ₩[\d.]+억–₩[\d.]+억 \(중앙값 ₩[\d.]+억\)/);
  assert.match(app, /이번 달 1일–어제 추정 매출 ₩[\d.]+억–₩[\d.]+억/);
  assert.match(app, /평소대로면 앞으로 14일 순위 \d+위–\d+위, 매출 ₩[\d.]+억–₩[\d.]+억/);
  assert.match(app, /추정 하루 평균 다운로드 [\d.]+만?–[\d.]+만? \(중앙값 [\d.]+만?\)/);
  assert.ok(app.includes('검증 전 추정 · 전 세계 설치 수로 검증, 시장 배분은 가정 · 범위가 넓습니다'));
  assert.ok(app.includes('과거 패턴') && /RPG · 한국 앱스토어 · 표본 \d+개/.test(app), 'past-pattern tag and curve caption');
  assert.match(ko({ ios: '1900000019' }), /200위 밖에 있을 가능성: 높음/);
  // Month tables: rows on the server (the box keeps its height), numbers from the browser.
  const html = withEdition('ko', () => renderSection(splitRevenue(svc.revenueFor(APP)).light, { slug: 's' }));
  assert.match(html, /<table class="rk-table rv-table" data-rv="\d+"><thead>[^]*?<tbody><tr><td>2026년 10월 <span class="rv-tag">진행 중<\/span><\/td><td class="r"><\/td><td class="r"><\/td><\/tr>/);
  assert.match(html, /<div class="rv-plot rv-plot-r" data-rv="\d+"><\/div>/, 'plot box placeholder');
});

test('page data file: the server parses up to the browser-only half', () => {
  const svcPage = { a: ASOF, m: { kr: { c: 'KRW', s: { ios: { t: 'beta', d0: ASOF, d: [[3, 1, 2, 3]], w: [], mo: [], mtd: null } } } }, cv: { x: { n: 3, points: [[0, 1, 1, 1]] } } };
  const { light, heavy } = splitRevenue(svcPage);
  assert.deepEqual(light.m.kr.s.ios.d, [[3, 1]], 'rank and a numbers marker');
  assert.deepEqual(light.cv.x.points, []);
  const game = { name: 'quote ,"rvz": inside', names: { ko: '{"rvz":1} 한글 ,"rvb":"0000000001"' }, slug: 's', revenue: light };
  const text = stringifyGameData(game, heavy);
  // the server: bytes (as functions/_lib/game-route.js) or text
  assert.deepEqual(parseGameData(Buffer.from(text)), game);
  assert.deepEqual(parseGameData(text), game);
  assert.deepEqual(parseGameData(stringifyGameData({ name: 'n', revenue: null }, null)), { name: 'n', revenue: null }, 'no heavy half');
  assert.deepEqual(joinRevenue(parseGameData(text).revenue, JSON.parse(text)[HEAVY_KEY]), { ...svcPage, h: light.h });
  // Reserved keys are refused by the writer; a header that does not point at the heavy half → the file is parsed whole.
  assert.throws(() => stringifyGameData({ [HEAVY_KEY]: 1 }, heavy), /reserved key rvz/);
  assert.throws(() => stringifyGameData({ [BOUNDARY_KEY]: '1' }, null), /reserved key rvb/);
  for (const bad of [text.replace(/^\{"rvb":"\d{10}"/, '{"rvb":"0000000030"'), text.replace(/^\{"rvb":"\d{10}"/, '{"rvb":"9999999999"'), text.replace(/^\{"rvb":"\d/, '{"rvb":"x')]) {
    assert.deepEqual(parseGameData(Buffer.from(bad)), game, bad.slice(0, 20));
  }
});

test('page data file: a referenced curve named "rvz" (or any key text) cannot move the boundary', (t) => {
  const SG = 'Role Playing';
  const dir = bundle(t, { mutate: (rel, j) => {
    if (rel === 'genres.json') {
      j.launch.rvz = j.launch[`launch:kr:ios:${SG}`];
      j.launch[',"rvz":'] = j.launch[`launch:kr:android:${SG}`];
      // a ref used by both kinds, and one an object key cannot hold: dropped at ingestion
      j.launch[`decay:all:kr:android:${SG}`] = j.launch[`launch:kr:android:${SG}`];
      Object.defineProperty(j.decay, '__proto__', { value: j.decay[`decay:all:kr:ios:${SG}`], enumerable: true, configurable: true, writable: true });
    }
    // ios: the decay curve first, then the launch curve "rvz" → `,"rvz":` appears as text inside the light half
    if (rel === `games/ios/${APP.ios}.json`) j.markets.kr.position.launch_curve_ref = 'rvz';
    if (rel === `games/android/${APP.android}.json`) j.markets.kr.position.launch_curve_ref = ',"rvz":';
  } });
  const warned = [];
  t.mock.method(console, 'warn', (m) => warned.push(String(m)));
  const svc = loadServiceExports({ dir, now: NOW });
  assert.ok(svc, 'the bundle passes verification');
  const revenue = svc.revenueFor(APP);
  assert.ok(revenue.cv.rvz && revenue.cv[',"rvz":'], 'curves named like the heavy key reach the page');
  assert.equal(revenue.cv['decay:all:kr:android:Role Playing'], undefined, 'a ref used by both kinds is dropped');
  assert.ok(warned.some((m) => m.includes('duplicate or reserved name')));
  const { light, heavy } = splitRevenue(revenue);
  const file = stringifyGameData({ name: 'x', slug: 's', revenue: light }, heavy);
  assert.ok(file.indexOf(',"rvz":') < file.lastIndexOf(',"rvz":'), 'the key text occurs before the real boundary');
  const game = parseGameData(Buffer.from(file));
  assert.deepEqual(game, { name: 'x', slug: 's', revenue: light });
  for (const code of ['ko', 'en']) assert.ok(withEdition(code, () => renderSection(game.revenue, { slug: 's' })).includes('revenue-estimates'));
  assert.deepEqual(joinRevenue(game.revenue, JSON.parse(file)[HEAVY_KEY]), { ...revenue, h: light.h });
});

// Every reader of docs/games-data/<slug>.json: the server parse (bytes), and the whole-document readers (browser
// revenue-client fetch().json(), build-game-ssr, bench/measure/preview scripts, i18n layout and related-games tests).
test('page data files: one JSON document for whole readers, the light half for the server', () => {
  const svc = { a: ASOF, m: { kr: { c: 'KRW', s: { ios: { t: 'beta', d0: ASOF, d: [[3, 1, 2, 3]], w: [], mo: [], mtd: null } } } }, cv: { rvz: { n: 3, points: [[0, 1, 1, 1]] } } };
  const check = (text, label) => {
    const doc = JSON.parse(text);
    const { [HEAVY_KEY]: heavy, [BOUNDARY_KEY]: _b, ...rest } = doc;
    assert.deepEqual(parseGameData(Buffer.from(text, 'utf8')), rest, label);
    if (doc.revenue) assert.ok(heavy && joinRevenue(rest.revenue, heavy), label);
  };
  const { light, heavy } = splitRevenue(svc);
  check(stringifyGameData({ name: '가십 ,"rvz":', revenue: light }, heavy), 'fixture');
  check(stringifyGameData({ name: 'plain' }, null), 'no revenue');
  const dir = path.join(__dirname, '..', 'docs', 'games-data');
  if (!fs.existsSync(dir)) return;
  let n = 0;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !f.startsWith('_')) { check(fs.readFileSync(path.join(dir, f), 'utf8'), f); n++; }
  assert.ok(n > 0);
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
