/**
 * 일회성: 5개 시장 히스토리 전체에서 (1) 기존 게임 names 백필(오프라인) (2) DB에 없는 앱 일괄 등록
 *   node scripts/bulk-register-games.js [--limit N] [--no-register] [--cache file]
 * 조회 결과는 캐시 파일에 저장되어 재실행 시 이어서 진행된다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./sync-and-enrich');

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const limit = Number(arg('--limit')) || Infinity;
const cachePath = arg('--cache') || path.join(os.tmpdir(), 'gs-bulk-lookup-cache.json');
const ANDROID_CONCURRENCY = 6;

async function main() {
  const gamesData = S.loadGames();
  const reviewQueue = S.loadReviewQueue();
  const before = Object.keys(gamesData.games).length;
  const latest = S.loadLatestChartRows();

  const changed = S.backfillNames(gamesData, latest);
  console.log(`names 백필: ${changed}개 게임 변경`);

  const appIdIndex = S.buildAppIdIndex(gamesData.games);
  const report = { before, backfilled: changed, newByOrigin: {}, attached: 0, newKrFound: 0, pending: 0, deferred: 0 };

  if (!process.argv.includes('--no-register')) {
    // 후보: 히스토리에 나타났지만 어떤 게임에도 매핑되지 않은 앱
    const cands = new Map(); // `${store}|${id}` -> cand
    for (const [k, row] of latest) {
      const [platform, appId, cc] = k.split('|');
      if (appIdIndex.has(appId)) continue;
      const ck = `${platform}|${appId}`;
      let c = cands.get(ck);
      if (!c) { c = { platform, appId, region: cc, charts: {}, lastDate: '' }; cands.set(ck, c); }
      c.charts[cc] = { title: row.title, developer: row.developer, icon: row.icon };
      if (row.date > c.lastDate) c.lastDate = row.date;
    }
    let list = Array.from(cands.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.appId.localeCompare(b.appId));
    report.deferred = Math.max(0, list.length - limit);
    list = list.slice(0, limit);
    report.candidates = list.length;
    console.log('등록 후보:', list.length);

    const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(cachePath, JSON.stringify(cache));
    const ck = (p, cc, id) => `${p}|${cc}|${id}`;
    const chartCc = (c) => S.REGION_PREF.find(x => c.charts[x]) || c.region;

    // --- iOS: 배치 조회 (kr → us → 차트 국가) ---
    const ios = list.filter(c => c.platform === 'ios');
    const iosStage = async (cc, items) => {
      const todo = items.filter(c => !(ck('ios', cc, c.appId) in cache)).map(c => c.appId);
      if (!todo.length) return;
      console.log(`iOS ${cc} 조회: ${todo.length}`);
      const found = await S.lookupIosBatch(todo, cc);
      for (const id of todo) cache[ck('ios', cc, id)] = found.get(id) || null;
      save();
    };
    await iosStage('kr', ios);
    const notKr = ios.filter(c => !cache[ck('ios', 'kr', c.appId)]);
    await iosStage('us', notKr);
    const needChart = notKr.filter(c => !cache[ck('ios', 'us', c.appId)] && chartCc(c) !== 'us');
    for (const cc of ['jp', 'tw', 'cn']) await iosStage(cc, needChart.filter(c => chartCc(c) === cc));

    // --- Android: 개별 조회 (소규모 동시성) ---
    const android = list.filter(c => c.platform === 'android');
    let done = 0;
    const lookupCached = async (c, cc) => {
      const key = ck('android', cc, c.appId);
      if (!(key in cache)) cache[key] = await S.lookupAndroid(c.appId, cc);
      return cache[key];
    };
    await S.pool(android, ANDROID_CONCURRENCY, async (c) => {
      if (!(await lookupCached(c, 'kr')) && !(await lookupCached(c, 'us')) && chartCc(c) !== 'us') await lookupCached(c, chartCc(c));
      if (++done % 200 === 0) { save(); console.log(`Android 진행: ${done}/${android.length}`); }
    });
    save();

    // --- 등록: KR 판매 앱 먼저 (한국어 키 우선), 이후 나머지 ---
    const get = (c, cc) => cache[ck(c.platform, cc, c.appId)] || null;
    const resolved = list.map(c => ({ ...c, kr: get(c, 'kr'), us: get(c, 'us'), chart: get(c, chartCc(c)) }));
    resolved.sort((a, b) => (b.kr ? 1 : 0) - (a.kr ? 1 : 0));
    const ctx = S.getRegCtx(gamesData, appIdIndex);
    const pendingItems = [];
    for (const c of resolved) {
      const res = S.registerCandidate(c, ctx);
      if (res.status === 'new') {
        report.newByOrigin[res.origin] = (report.newByOrigin[res.origin] || 0) + 1;
        if (res.krFound) report.newKrFound++;
      } else if (res.status === 'attached') report.attached++;
      if (res.pending) { pendingItems.push(res.pending); report.pending++; }
    }
    S.upsertPending(reviewQueue, pendingItems);
  }

  gamesData.totalGames = Object.keys(gamesData.games).length;
  S.saveGames(gamesData);
  S.saveReviewQueue(reviewQueue);
  report.after = gamesData.totalGames;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
