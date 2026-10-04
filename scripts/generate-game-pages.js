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
const { loadRankStats } = require('../src/rank/stats');
const { collectRankData, summaryMeta } = require('../src/build/game-data');
const { summaryDays, INDEXABLE_DAYS } = require('../src/templates/helpers/game-rank-summary');
const { writeGameSitemaps, writeSitemapIndex, writeEditionSearchIndex } = require('../src/build/editions');
const { computeCssAssetVersion } = require('../src/build/css-version');

const ROOT = path.join(__dirname, '..');
const docsDir = path.join(ROOT, 'docs');
const historyDir = path.join(ROOT, 'history');
const dataDir = path.join(docsDir, 'games-data');
const gamesDir = path.join(docsDir, 'games');
const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');

const normalize = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ');

// URL-safe 슬러그 생성 (games.json 에 slug 가 없는 게임용: 앱 ID 우선, 없으면 이름 기반)
function createSlug(name, appIds = null) {
  if (appIds) {
    if (appIds.android) return String(appIds.android).toLowerCase().replace(/\./g, '-');
    if (appIds.ios && appIds.ios.startsWith('com.')) return String(appIds.ios).toLowerCase().replace(/\./g, '-');
  }
  let slug = name
    .toLowerCase()
    .replace(/[\u3040-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length < 2) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (((hash << 5) - hash) + name.charCodeAt(i)) & 0xffffffff;
    slug = 'game-' + Math.abs(hash).toString(36);
  }
  return slug;
}

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

// ---------- 게임별 데이터 ----------
fs.mkdirSync(dataDir, { recursive: true });
const written = new Set();
const dataHash = crypto.createHash('md5');
const searchIndex = [];
const indexable = [];
let rankedCount = 0, steamCount = 0;

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
    icon,
    ranked,
    steam,
    steamHistory: steamId ? (steamHistoryById.get(String(steamId)) || []) : [],
    rank,
  };
  const json = JSON.stringify(data);
  const file = path.join(dataDir, `${slug}.json`);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== json) fs.writeFileSync(file, json, 'utf8');
  dataHash.update(slug).update(json);
  written.add(slug);
  if (ranked) rankedCount++;
  if (steam) steamCount++;

  // 색인 허용은 에디션과 무관 (순위 이력이 가장 긴 국가의 일수 기준)
  if (summaryDays(rank, meta, 'kr') >= INDEXABLE_DAYS) indexable.push(slug);

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
const lastmod = new Date().toISOString().split('T')[0];
const sitemapNames = writeGameSitemaps(docsDir, Object.fromEntries(i18n.EDITIONS.map((e) => [e.code, indexable])), lastmod);
writeSitemapIndex(docsDir, lastmod);

i18n.setEdition('ko');
console.log(`✅ 게임 데이터 ${written.size}개 (순위 ${rankedCount}, 스팀 ${steamCount}) → docs/games-data (${((Date.now() - started) / 1000).toFixed(1)}s)`);
console.log(`🧹 옛 정적 상세 디렉토리 ${removedDirs}개 제거`);
console.log(`🔑 검색 인덱스 버전: ${searchIndexVersion}, 데이터 버전: ${version}`);
console.log(`📍 사이트맵: 색인 허용 ${indexable.length}개 × ${i18n.EDITIONS.length}개 에디션 → ${sitemapNames.length}개 파일`);
console.log(`📦 docs 파일 수: ${countFiles(docsDir)} (Cloudflare Pages Free 한도 20,000)`);
