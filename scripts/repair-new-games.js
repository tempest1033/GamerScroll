/**
 * 일회성 보정 (신규 게임만 대상, 원본 키/슬러그는 불변)
 *   node scripts/repair-new-games.js --orig <원본 games.json> [--cache file]
 * 1) [id] 접미 키 정리: 같은 게임이면 지역 appId로 연결, 슬롯 충돌이면 "(JP)" 형식 키로 분리
 * 2) names 보강: 스토어 조회(iTunes 배치 / google-play)로 비어 있는 언어만 채움
 * 3) 신규 게임 슬러그 재생성: names.en 우선, 원문(한글/한자/가나 유지), 충돌 시 -tw/-jp/-cn/-us → -2
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./sync-and-enrich');

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const origPath = arg('--orig');
const cachePath = arg('--cache') || path.join(os.tmpdir(), 'gs-bulk-lookup-cache.json');
const LANG = { kr: 'ko', us: 'en', jp: 'ja', cn: 'zh-cn', tw: 'zh-tw' };
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const storeOf = (slot) => (slot.startsWith('ios') ? 'ios' : 'android');

function fixBracketKeys(gamesData, reviewQueue, latest, report) {
  const games = gamesData.games;
  const bracket = Object.keys(games).filter(k => !orig[k] && /\s*\[[^\]]+\]$/.test(k));
  report.bracketBefore = bracket.length;
  const rest = Object.fromEntries(Object.entries(games).filter(([k]) => !bracket.includes(k)));
  const aliasIndex = S.buildAliasIndex(rest);
  const renamed = new Map(); // old key -> new key / target
  const removed = new Set();
  const pendingRename = {};

  for (const key of bracket) {
    const g = games[key];
    const cleaned = key.replace(/\s*\[[^\]]+\]$/, '').trim();
    const slots = Object.entries(g.appIds || {}).map(([slot, id]) => {
      const store = storeOf(slot);
      const cc = slot.split('_')[1] || S.REGION_PREF.find(c => latest.has(`${store}|${id}|${c}`)) || 'us';
      return { store, id, cc, regional: `${store}_${cc}` };
    });
    const nk = S.normalizeNameKey(cleaned);
    let target = rest[cleaned] ? cleaned : (nk.length >= 3 ? aliasIndex.get(nk) : null);
    if (target && slots.every(s => !rest[target].appIds?.[s.regional] || String(rest[target].appIds[s.regional]) === String(s.id))) {
      const t = rest[target];
      for (const s of slots) t.appIds = { ...t.appIds, [s.regional]: s.id };
      t.platforms = Array.from(new Set([...(t.platforms || []), ...slots.map(s => s.store)]));
      t.aliases = Array.from(new Set([...(t.aliases || []), cleaned, ...(g.aliases || [])].filter(a => a && a !== target)));
      t.names = S.mergeNames(t.names, g.names);
      t.developer = t.developer || g.developer;
      t.icon = t.icon || g.icon;
      removed.add(key);
      pendingRename[key] = target;
      report.attached++;
    } else {
      const cc = slots[0].cc.toUpperCase();
      let nk2 = `${cleaned} (${cc})`;
      for (let n = 2; rest[nk2] || games[nk2]; n++) nk2 = `${cleaned} (${cc} ${n})`;
      renamed.set(key, nk2);
      pendingRename[key] = nk2;
      report.renamed++;
    }
  }
  // 원래 순서 유지하며 재구성
  const out = {};
  for (const [k, v] of Object.entries(games)) {
    if (removed.has(k)) continue;
    out[renamed.get(k) || k] = v;
  }
  gamesData.games = out;

  const moved = reviewQueue.pending.filter(p => pendingRename[p.title]);
  reviewQueue.pending = reviewQueue.pending.filter(p => !pendingRename[p.title]);
  S.upsertPending(reviewQueue, moved.map(p => ({ ...p, title: pendingRename[p.title] })));
  report.bracketAfter = Object.keys(out).filter(k => !orig[k] && /\[[^\]]+\]$/.test(k)).length;
}

async function fillNames(gamesData, report) {
  const games = gamesData.games;
  const cache = fs.existsSync(cachePath) ? readJson(cachePath) : {};
  const save = () => fs.writeFileSync(cachePath, JSON.stringify(cache));
  const ck = (p, cc, id) => `${p}|${cc}|${id}`;
  const missing = (g, cc) => !g.names?.[LANG[cc]];
  const idsOf = (g, store) => Object.entries(g.appIds || {})
    .filter(([k]) => k === store || k.startsWith(store + '_')).map(([, v]) => String(v));

  // iOS: 모든 ios / ios_<cc> id 를 국가별 배치 조회
  for (const cc of Object.keys(LANG)) {
    const todo = new Set();
    for (const g of Object.values(games)) {
      if (!missing(g, cc)) continue;
      for (const id of idsOf(g, 'ios')) if (!(ck('ios', cc, id) in cache)) todo.add(id);
    }
    if (!todo.size) continue;
    console.log(`iOS ${cc} 조회: ${todo.size}`);
    const found = await S.lookupIosBatch([...todo], cc);
    for (const id of todo) cache[ck('ios', cc, id)] = found.get(id) || null;
    save();
  }

  // Android 전용 게임: 개별 조회 (cn 제외)
  const jobs = [];
  for (const g of Object.values(games)) {
    if (idsOf(g, 'ios').length) continue;
    const ids = idsOf(g, 'android');
    if (!ids.length) continue;
    for (const cc of ['us', 'jp', 'tw', 'kr']) if (missing(g, cc)) jobs.push({ g, cc, ids });
  }
  console.log('Android 조회 작업:', jobs.length);
  let done = 0;
  await S.pool(jobs, 6, async ({ cc, ids }) => {
    for (const id of ids) {
      const key = ck('android', cc, id);
      if (!(key in cache)) cache[key] = await S.lookupAndroid(id, cc);
      if (cache[key]) break;
    }
    if (++done % 300 === 0) { save(); console.log(`Android 진행: ${done}/${jobs.length}`); }
  });
  save();

  for (const g of Object.values(games)) {
    const patch = {};
    for (const cc of Object.keys(LANG)) {
      if (!missing(g, cc)) continue;
      for (const store of ['ios', 'android']) {
        const hit = idsOf(g, store).map(id => cache[ck(store, cc, id)]).find(Boolean);
        if (hit) { patch[LANG[cc]] = hit.title; break; }
      }
    }
    g.names = S.mergeNames(g.names, patch);
  }
}

function regenerateSlugs(gamesData, report) {
  const games = gamesData.games;
  const used = new Set(Object.entries(games).filter(([k]) => orig[k]).map(([, g]) => g.slug).filter(Boolean));
  for (const [key, g] of Object.entries(games)) {
    if (orig[key]) continue;
    const firstId = Object.values(g.appIds || {})[0];
    g.slug = S.uniqueSlug(key.replace(/\s*\([A-Z]{2}(?: \d+)?\)$/, ''), g.names, S.marketsOfGame(g), firstId, used);
    used.add(g.slug);
  }
}

const orig = origPath ? readJson(origPath).games : null;

async function main() {
  if (!orig) throw new Error('--orig <원본 games.json> 필요');
  const gamesData = S.loadGames();
  const reviewQueue = S.loadReviewQueue();
  const latest = S.loadLatestChartRows();
  const report = { attached: 0, renamed: 0 };
  const coverage = () => {
    const c = {};
    for (const g of Object.values(gamesData.games)) for (const k of Object.keys(g.names || {})) c[k] = (c[k] || 0) + 1;
    return c;
  };
  report.namesBefore = coverage();

  fixBracketKeys(gamesData, reviewQueue, latest, report);
  await fillNames(gamesData, report);
  regenerateSlugs(gamesData, report);

  report.namesAfter = coverage();
  gamesData.totalGames = Object.keys(gamesData.games).length;
  S.saveGames(gamesData);
  S.saveReviewQueue(reviewQueue);
  report.total = gamesData.totalGames;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
