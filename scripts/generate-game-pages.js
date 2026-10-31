/**
 * 게임 상세 페이지 데이터 생성
 *
 * 게임 상세(/games/<slug>/, 에디션별 /<prefix>/games/<slug>/)는 더 이상 정적 HTML 로 만들지 않는다.
 * Cloudflare Pages Function(functions/_lib/game-route.js)이 요청 시 렌더링하므로 여기서는
 *   docs/games-data/<slug>.json   게임별 데이터 1건 (렌더링에 필요한 전부)
 *   docs/games-data/_meta.json    모든 게임 공용 (순위 일자, 시간대 기준일, 에디션별 자산 버전, 데이터 버전)
 *   docs/games/search-index.json  + 에디션별 검색 인덱스
 *   docs/sitemap-games-<code>-<n>.xml  색인 허용 게임만, 에디션 간 hreflang 상호 참조
 * 를 만든다. 예전 docs/games/<slug>/index.html 은 지운다 (docs 는 deploy 브랜치에서 시드됨).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const i18n = require('../src/i18n');
const { loadRankStats, util: { pubKey } } = require('../src/rank/stats');
const { loadGenres } = require('../src/rank/genres');
const { collectRankData, summaryMeta, idFor, createSlug } = require('../src/build/game-data');
const { isIndexableRank } = require('../src/templates/helpers/game-rank-summary');
const { writeGameSitemaps, writeSitemapIndex, writeEditionSearchIndex } = require('../src/build/editions');
const { computeCssAssetVersion } = require('../src/build/css-version');
const { loadServiceExports, coverage } = require('../src/build/service-exports');
const { splitRevenue, stringifyGameData } = require('../src/templates/components/revenue-payload');
const { readAnalysisPages } = require('../src/build/analysis-pages');

const ROOT = path.join(__dirname, '..');
const docsDir = path.join(ROOT, 'docs');
const historyDir = path.join(ROOT, 'history');
const dataDir = path.join(docsDir, 'games-data');
const gamesDir = path.join(docsDir, 'games');
const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

const normalize = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ');

// URL-safe 슬러그 생성 (games.json 에 slug 가 없는 게임용: 앱 ID 우선, 없으면 이름 기반)
function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  return n;
}

console.log(`🎮 게임 데이터 생성 시작... (→ docs/games-data)\n`);
const started = Date.now();

const S = loadRankStats();
const meta = summaryMeta(S);

// ---------- Steam: 최신 순위 + 일별 이력 (한 번만 순회) ----------
const historyFiles = fs.readdirSync(historyDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const steamHistoryById = new Map(); // appid → [{date, ccuRank, ccu, salesRank}]
let latestSteam = { mostPlayed: [], topSellers: [] };
for (const file of historyFiles) {
  let steam;
  try { steam = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8').replace(/^\uFEFF/, '')).steam; } catch { continue; }
  if (!steam) continue;
  const date = file.slice(0, 10);
  const days = new Map();
  const day = (id) => { const key = String(id); if (!days.has(key)) days.set(key, { date }); return days.get(key); };
  for (const item of steam.mostPlayed || []) { const d = day(item.appid); d.ccuRank = item.rank; d.ccu = item.ccu; }
  for (const item of steam.topSellers || []) day(item.appid).salesRank = item.rank;
  for (const [id, d] of days) { if (!steamHistoryById.has(id)) steamHistoryById.set(id, []); steamHistoryById.get(id).push(d); }
  latestSteam = { mostPlayed: steam.mostPlayed || [], topSellers: steam.topSellers || [] };
}
const byId = (items) => new Map(items.filter((i) => i.appid).map((i) => [String(i.appid), i]));
const byName = (items) => new Map(items.filter((i) => i.name).map((i) => [normalize(i.name), i]));
const mpById = byId(latestSteam.mostPlayed), mpByName = byName(latestSteam.mostPlayed);
const tsById = byId(latestSteam.topSellers), tsByName = byName(latestSteam.topSellers);

// ---------- 차트 아이콘 (games.json 에 icon 이 없는 게임용) ----------
const chartIcon = new Map();
for (const country of Object.keys(S.COUNTRIES)) {
  for (const store of ['ios', 'android']) {
    for (const row of S.today.rows[country][store] || []) {
      const g = row && row.icon ? S.gameOf(store, row) : null;
      if (g && !chartIcon.has(g)) chartIcon.set(g, row.icon);
    }
  }
}

// ---------- 에디션별 게임 이름 ----------
const namesOf = (g) => {
  const out = {};
  for (const edition of i18n.EDITIONS) {
    i18n.setEdition(edition.code);
    const name = S.displayName(g);
    if (name !== g.key) out[edition.code] = name;
  }
  return out;
};

// ---------- 관련 게임 (게임 상세 하단 '순위가 비슷한 게임' · '<개발사>의 다른 게임') ----------
// 순위 목록: 순위 페이지(/rankings/)가 보여 주는 에디션 홈 국가의 스토어별 오늘 매출 TOP 200 중 상세 페이지가 있는 게임.
// 결과는 data.related = { g: [{ s: slug, k: DB 이름, n: { 에디션: 이름 }, d: 개발사, i: 아이콘 }], e: { 에디션: { k: 'rank'|'genre', n: [항목], d: [항목] } } }
// 항목 = [g 인덱스, 스토어, 순위] (현재 순위가 없으면 [g 인덱스]). 렌더링은 src/templates/pages/game.js renderRelated.
const RELATED_CHART_LIMIT = 200;
const RELATED_NEAR = 6;
const RELATED_DEV = 3;
const HANGUL = /[\uAC00-\uD7A3]/;
const genres = loadGenres();
const pageSlugs = new Map(); // g → slug (아래 루프와 같이 중복 slug 는 먼저 나온 게임만 페이지를 가진다)
{
  const taken = new Set();
  for (const g of S.games) {
    const slug = g.slug || createSlug(g.key, g.appIds);
    if (!taken.has(slug)) { taken.add(slug); pageSlugs.set(g, slug); }
  }
}
const byDeveloper = new Map();
for (const g of pageSlugs.keys()) {
  const key = pubKey(g.developer);
  if (!key) continue;
  if (!byDeveloper.has(key)) byDeveloper.set(key, []);
  byDeveloper.get(key).push(g);
}
const charts = new Map();
function chartOf(country) {
  if (charts.has(country)) return charts.get(country);
  const lists = {}, best = new Map();
  for (const store of ['android', 'ios']) {
    lists[store] = [];
    (S.today.rows[country][store] || []).slice(0, RELATED_CHART_LIMIT).forEach((r, i) => {
      const g = r && r.appId ? S.gameOf(store, r) : null;
      if (!g || !pageSlugs.has(g) || lists[store].some((e) => e.g === g)) return;
      const entry = { g, store, rank: i + 1 };
      lists[store].push(entry);
      if (!best.has(g) || entry.rank < best.get(g).rank) best.set(g, entry);
    });
  }
  const chart = { lists, best, ranked: [...best.values()].sort((a, b) => a.rank - b.rank) };
  charts.set(country, chart);
  return chart;
}
const chartDaysMemo = new Map();
function chartDays(g, country) {
  const key = `${country}:${pageSlugs.get(g)}`;
  if (!chartDaysMemo.has(key)) chartDaysMemo.set(key, g.appIds ? ['ios', 'android'].reduce((n, store) => { const id = idFor(g.appIds, store, country); return n + (id ? S.daysOnChart(country, store, id) : 0); }, 0) : 0);
  return chartDaysMemo.get(key);
}
// 현재 에디션(i18n.setEdition) 기준. 영어·일본어·중국어판에는 한글 이름밖에 없는 게임을 넣지 않는다.
function relatedFor(g, edition, ref) {
  const chart = chartOf(edition.country);
  const usable = (o) => o !== g && (edition.code === 'ko' || !HANGUL.test(S.displayName(o)));
  let kind = null, near = [];
  const at = chart.best.get(g);
  if (at) {
    // 같은 목록에서 위 3개·아래 3개. 목록 끝이라 한쪽이 모자라면 반대쪽에서 채운다.
    const list = chart.lists[at.store];
    const i = list.indexOf(at);
    const above = list.slice(0, i).reverse().filter((e) => usable(e.g));
    const below = list.slice(i + 1).filter((e) => usable(e.g));
    const na = Math.min(above.length, RELATED_NEAR - Math.min(RELATED_NEAR / 2, below.length));
    const nb = Math.min(below.length, RELATED_NEAR - na);
    near = [...above.slice(0, na).reverse(), ...below.slice(0, nb)];
    if (near.length) kind = 'rank';
  }
  if (!near.length) {
    // 순위 목록에 없으면 같은 장르로 현재 목록에 오른 게임 (겹치는 장르가 많은 순, 같으면 순위 순)
    const tags = new Set(genres.tagsFor(g));
    if (tags.size) {
      near = chart.ranked.map((e) => ({ e, shared: genres.tagsFor(e.g).filter((tag) => tags.has(tag)).length }))
        .filter((x) => x.shared && usable(x.e.g))
        .sort((a, b) => b.shared - a.shared || a.e.rank - b.e.rank)
        .slice(0, RELATED_NEAR).map((x) => x.e);
      if (near.length) kind = 'genre';
    }
  }
  // 같은 개발사: 현재 순위가 있는 게임 먼저(순위 순), 나머지는 이 나라 차트 기록이 긴 순. 왼쪽 카드와 겹치는 게임은 뺀다.
  const shown = new Set(near.map((e) => e.g));
  const key = pubKey(g.developer);
  const dev = (key ? byDeveloper.get(key) || [] : [])
    .filter((o) => !shown.has(o) && usable(o))
    .map((o) => chart.best.get(o) || { g: o, store: null, rank: null })
    .sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || chartDays(b.g, edition.country) - chartDays(a.g, edition.country) || a.g.key.localeCompare(b.g.key))
    .slice(0, RELATED_DEV);
  return near.length || dev.length ? { k: kind || undefined, n: near.map(ref), d: dev.map(ref) } : null;
}
function relatedOf(g) {
  const pool = [], index = new Map(), byEdition = {};
  for (const edition of i18n.EDITIONS) {
    i18n.setEdition(edition.code);
    const ref = (e) => {
      if (!index.has(e.g)) {
        index.set(e.g, pool.length);
        pool.push({ s: pageSlugs.get(e.g), k: e.g.key, d: e.g.developer || undefined, i: e.g.icon || chartIcon.get(e.g) || undefined });
      }
      const at = index.get(e.g);
      const name = S.displayName(e.g);
      if (name !== e.g.key) (pool[at].n = pool[at].n || {})[edition.code] = name;
      return e.rank ? [at, e.store, e.rank] : [at];
    };
    const related = relatedFor(g, edition, ref);
    if (related) byEdition[edition.code] = related;
  }
  return pool.length ? { g: pool, e: byEdition } : null;
}

// ---------- 매출·다운로드 추정 (forecast 저장소 service-exports 번들, scripts/fetch-service-exports.js) ----------
// 번들이 없거나 검증에 실패하면 null → revenue 필드를 넣지 않아 상세 페이지는 그 섹션 없이 그대로 렌더링된다.
const serviceExports = loadServiceExports();
// 다운로드 지표: 사이트 인기(무료) 차트의 최신 순위와 since(신규 게임은 revenue_from, 그 외는 추정 기간 시작) 이후 최고 순위.
const freeRank = (market, store, appId, since) => {
  const series = S.freeSeriesOf(market, store, appId);
  const seen = series.filter((r, i) => r != null && S.days[i].date >= since);
  return { r: series[series.length - 1], b: seen.length ? Math.min(...seen) : null };
};

// ---------- 지표 분석 페이지가 있는 게임 (data/analysis-pages.json ← scripts/fetch-analysis-pages.js) ----------
const analysisPages = readAnalysisPages();

// ---------- 게임별 데이터 ----------
fs.mkdirSync(dataDir, { recursive: true });
const written = new Set();
const dataHash = crypto.createHash('md5');
const searchIndex = [];
const indexable = [];
const lastmodBySlug = {};
let rankedCount = 0, steamCount = 0, revenueCount = 0;
const revenueBySlug = new Map();

for (const g of S.games) {
  const gameName = g.key;
  const appIds = g.appIds || {};
  const slug = g.slug || createSlug(gameName, g.appIds);
  if (written.has(slug)) { console.warn(`  ⚠️ 중복 slug 건너뜀: ${slug} (${gameName})`); continue; }

  const rank = collectRankData(S, g.appIds);
  const ranked = Boolean(rank) && Object.values(rank.s).some((stores) => Object.values(stores).some((e) => e.o + e.v.length === meta.days.length));

  // 스팀 (현재 + 이력)
  const steamId = appIds['steam:global'] || appIds.steam;
  const names = [gameName, ...(g.aliases || [])].map(normalize);
  const pick = (idMap, nameMap) => (steamId && idMap.get(String(steamId))) || names.map((n) => nameMap.get(n)).find(Boolean) || null;
  const mp = pick(mpById, mpByName), ts = pick(tsById, tsByName);
  let steam = null;
  if (mp) steam = { currentPlayers: mp.ccu || mp.currentPlayers, rank: mp.rank, img: mp.img };
  if (ts) { steam = steam || { img: ts.img }; steam.salesRank = ts.rank; steam.price = ts.price || ''; steam.discount = ts.discount || ''; }
  const icon = g.icon || chartIcon.get(g) || (steam && steam.img) || null;

  const data = {
    name: gameName,
    names: namesOf(g),
    slug,
    platforms: g.platforms || [],
    developer: g.developer || '',
    genres: loadGenres().tagsFor(g),
    icon,
    ranked,
    steam,
    steamHistory: steamId ? (steamHistoryById.get(String(steamId)) || []) : [],
    rank,
    related: relatedOf(g),
  };
  if (analysisPages[slug.normalize('NFC')]) data.analysis = analysisPages[slug.normalize('NFC')];
  const revenue = serviceExports && serviceExports.revenueFor(g.appIds, { freeRank });
  let heavy = null;
  if (revenue) {
    // Light half for the server render, heavy half (charts, tables) after an explicit byte offset, for the browser only.
    const split = splitRevenue(revenue);
    data.revenue = split.light;
    heavy = split.heavy;
    revenueCount++;
    revenueBySlug.set(slug, revenue);
  }
  const json = stringifyGameData(data, heavy);
  const file = path.join(dataDir, `${slug}.json`);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== json) fs.writeFileSync(file, json, 'utf8');
  dataHash.update(slug).update(json);
  written.add(slug);
  if (ranked) rankedCount++;
  if (steam) steamCount++;

  // 색인 허용은 에디션과 무관 (순위 이력이 가장 긴 국가의 일수 기준)
  if (isIndexableRank(rank, meta)) indexable.push(slug);
  // 사이트맵 <lastmod>: 이 게임 데이터의 최신 일자 (마지막 차트 등장일 · 오늘 시간대 순위 · 스팀 이력)
  const dataDates = [
    ...(rank ? Object.values(rank.s).flatMap((stores) => Object.values(stores).map((e) => meta.days[e.o + e.v.length - 1])) : []),
    ...(rank && Object.keys(rank.h).length && meta.hourlyDate ? [meta.hourlyDate] : []),
    ...data.steamHistory.map((d) => d.date),
  ].filter(Boolean).sort();
  if (dataDates.length) lastmodBySlug[slug] = dataDates[dataDates.length - 1];

  searchIndex.push({
    name: gameName,
    slug,
    icon: g.icon || null,
    aliases: g.aliases || [],
    platforms: g.platforms || [],
    developer: g.developer || '',
    hasRankings: ranked,
    hasSteam: (g.platforms || []).includes('steam'),
    hasData: ranked || Boolean(steam) || Boolean(rank)
  });
}

// 이번에 만들지 않은 옛 데이터 제거
for (const f of fs.readdirSync(dataDir)) if (f.endsWith('.json') && !f.startsWith('_') && !written.has(f.slice(0, -5))) fs.unlinkSync(path.join(dataDir, f));

// ---------- 공용 메타 ----------
let editions = {};
try { editions = JSON.parse(fs.readFileSync(path.join(dataDir, '_editions.json'), 'utf8')); } catch { /* 첫 빌드: 자산 버전은 기본값 */ }
const cssVersion = computeCssAssetVersion(docsDir);
const version = dataHash.update(JSON.stringify([meta, editions, cssVersion])).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(dataDir, '_meta.json'), JSON.stringify({ version, ...meta, cssVersion, editions }), 'utf8');

// ---------- 옛 정적 상세 페이지 정리 (허브 index.html 과 검색 인덱스는 유지) ----------
let removedDirs = 0;
for (const base of [gamesDir, ...i18n.EDITIONS.filter((e) => e.prefix).map((e) => path.join(docsDir, e.prefix, 'games'))]) {
  if (!fs.existsSync(base)) continue;
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    fs.rmSync(path.join(base, entry.name), { recursive: true, force: true });
    removedDirs++;
  }
}

// ---------- 검색 인덱스 ----------
const searchIndexVersion = md5(JSON.stringify(searchIndex)).slice(0, 8);
const baseSearch = { version: searchIndexVersion, games: searchIndex };
fs.writeFileSync(path.join(gamesDir, 'search-index.json'), JSON.stringify(baseSearch), 'utf8');
fs.writeFileSync(path.join(gamesDir, '.search-version'), searchIndexVersion, 'utf8');
for (const edition of i18n.EDITIONS) {
  i18n.setEdition(edition.code);
  writeEditionSearchIndex(docsDir, baseSearch, S, edition);
}

// ---------- 사이트맵 ----------
const sitemapNames = writeGameSitemaps(docsDir, Object.fromEntries(i18n.EDITIONS.map((e) => [e.code, indexable])), lastmodBySlug);
writeSitemapIndex(docsDir);

i18n.setEdition('ko');
console.log(`✅ 게임 데이터 ${written.size}개 (순위 ${rankedCount}, 스팀 ${steamCount}) → docs/games-data (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log(serviceExports ? `💰 매출·다운로드 추정: ${revenueCount}개 게임 (번들 ${serviceExports.asof}, 레코드 ${serviceExports.records.size}개, 건너뜀 ${serviceExports.skipped})` : '💰 매출·다운로드 추정: 번들 없음 — 섹션 생략');
if (serviceExports) {
  // 출시 기준: 5개 시장 × 스토어 매출 TOP 200 게임 모두 매출 추정과 시장별 다운로드 추정이 보여야 한다.
  const rows = coverage(S, revenueBySlug, (g) => (written.has(pageSlugs.get(g)) ? pageSlugs.get(g) : undefined));
  for (const r of rows) {
    console.log(`   ${r.market}/${r.store}: TOP ${r.chart} 중 상세 페이지 ${r.page} · 매출 추정 ${r.revenue} · 다운로드 추정 ${r.downloads}`);
    if (r.missing.length) console.log(`      빠짐: ${r.missing.map((x) => `#${x.rank} ${x.appId || '?'} (${x.why})`).join(', ')}`);
  }
  const short = rows.filter((r) => r.revenue < r.chart || r.downloads < r.chart);
  if (short.length) console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '  ⚠️ '}출시 기준 미달 (TOP 200 전부 매출·다운로드 추정): ${short.map((r) => `${r.market}/${r.store} ${r.revenue}·${r.downloads}/${r.chart}`).join(', ')}`);
}
console.log(`🧹 옛 정적 상세 디렉토리 ${removedDirs}개 제거`);
console.log(`🔑 검색 인덱스 버전: ${searchIndexVersion}, 데이터 버전: ${version}`);
console.log(`📍 사이트맵: 색인 허용 ${indexable.length}개 × ${i18n.EDITIONS.length}개 에디션 → ${sitemapNames.length}개 파일`);
console.log(`📦 docs 파일 수: ${countFiles(docsDir)} (Cloudflare Pages Free 한도 20,000)`);
