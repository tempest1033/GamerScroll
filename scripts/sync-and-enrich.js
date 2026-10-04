/**
 * 통합 게임 동기화 스크립트
 * - 히스토리에서 신규 게임 감지
 * - iOS/Android: kr 이름 조회 + 반대 플랫폼 검색 + 통합 등록
 * - Steam: 영어 이름 그대로 등록
 * - 매칭 실패 → pending (AI 검토용)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const gplay = require('google-play-scraper').default;

const historyDir = path.join(__dirname, '../history');
const dataDir = path.join(__dirname, '../data');

// ============================================
// 유틸리티 함수
// ============================================

// 추적 시장: names 키 / google-play 조회 로캘 (cn은 안드로이드 차트 없음)
const MARKETS = {
  kr: { name: 'ko', gp: { country: 'kr', lang: 'ko' } },
  us: { name: 'en', gp: { country: 'us', lang: 'en' } },
  jp: { name: 'ja', gp: { country: 'jp', lang: 'ja' } },
  cn: { name: 'zh-cn', gp: null },
  tw: { name: 'zh-tw', gp: { country: 'tw', lang: 'zh-TW' } }
};
const NAME_KEYS = ['ko', 'en', 'ja', 'zh-cn', 'zh-tw'];
// 지역 전용 appId(ios_<cc>/android_<cc>)에 쓸 시장 우선순위
const REGION_PREF = ['us', 'jp', 'tw', 'cn', 'kr'];
// CI 1회 실행당 처리할 비-KR 신규 앱 상한
const MAX_NON_KR_PER_RUN = Number(process.env.GS_MAX_NON_KR_PER_RUN) || 60;

function isKoreanName(name) {
  return /[가-힣]/.test(name);
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[\s:\-·•&!?.,()（）【】「」『』\[\]'"''""]+/g, '')
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]/g, '');
}

function generateSlug(name, aliases = []) {
  const englishAlias = aliases.find(a => /^[a-zA-Z0-9\s:'\-&!?.]+$/.test(a));
  const baseName = englishAlias || name;
  return baseName
    .toLowerCase()
    .replace(/[:'&!?.]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 이름 정규화: 기호/공백 제거 후 소문자 (동일 이름 판별용)
function normalizeNameKey(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-z0-9가-힣]/g, '');
}

// 모든 region 랭킹에서 iOS/Android 동일 이름 선매칭용 맵 생성
function buildGlobalPairs(games) {
  const pairs = new Map(); // key -> { title, ios, android, conflict }
  for (const game of games) {
    if (!game.title) continue;
    if (game.platform !== 'ios' && game.platform !== 'android') continue;

    const key = normalizeNameKey(game.title);
    if (!key || key.length < 3) continue;

    const entry = pairs.get(key) || { title: game.title, ios: null, android: null, conflict: false };
    const existing = entry[game.platform];
    if (existing && String(existing.appId) !== String(game.appId)) {
      // 동일 정규화 키에 서로 다른 appId가 붙으면 자동 매칭에서 제외
      entry.conflict = true;
    } else {
      entry[game.platform] = game;
    }
    if (!entry.title && game.title) entry.title = game.title;
    pairs.set(key, entry);
  }
  return pairs;
}

// 이름 키 인덱스 빌드 (O(n) 1회 → 이후 조회 O(1))
function buildNameKeyIndex(games) {
  const index = new Map();  // normalizedKey -> gameName
  for (const name of Object.keys(games)) {
    // exact match용
    index.set(name, name);
    // normalized key용
    const key = normalizeNameKey(name);
    if (key.length >= 3 && !index.has(key)) {
      index.set(key, name);
    }
  }
  return index;
}

// 인덱스 업데이트 (게임 추가 시)
function updateNameKeyIndex(index, gameName) {
  index.set(gameName, gameName);
  const key = normalizeNameKey(gameName);
  if (key.length >= 3 && !index.has(key)) {
    index.set(key, gameName);
  }
}

// 기존 게임명 탐색 (인덱스 사용 - O(1))
function findExistingName(gameName, nameKeyIndex) {
  // exact match 우선
  if (nameKeyIndex.has(gameName)) return nameKeyIndex.get(gameName);

  // normalized key로 조회
  const key = normalizeNameKey(gameName);
  if (key.length < 3) return null;

  return nameKeyIndex.get(key) || null;
}

function mergePendingStatus(statusA, statusB) {
  const priority = { matched: 3, conflict: 2, single: 1 };
  const a = statusA || '';
  const b = statusB || '';
  if (!a) return b;
  if (!b) return a;
  return (priority[a] || 0) >= (priority[b] || 0) ? a : b;
}

// ============================================
// 데이터 로드/저장
// ============================================

function loadGames() {
  const filePath = path.join(dataDir, 'games.json');
  if (!fs.existsSync(filePath)) {
    return { version: '5.0.0', games: {} };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function loadReviewQueue() {
  const filePath = path.join(dataDir, 'review-queue.json');
  if (!fs.existsSync(filePath)) {
    return { pending: [], approved: [], rejected: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  const queue = (parsed && typeof parsed === 'object') ? parsed : {};
  return {
    pending: Array.isArray(queue.pending) ? queue.pending : [],
    approved: Array.isArray(queue.approved) ? queue.approved : [],
    rejected: Array.isArray(queue.rejected) ? queue.rejected : []
  };
}

function saveGames(gamesData) {
  const json = '\ufeff' + JSON.stringify(gamesData, null, 2).replace(/\n/g, '\r\n') + '\r\n';
  fs.writeFileSync(
    path.join(dataDir, 'games.json'),
    json,
    'utf8'
  );
}

function saveReviewQueue(queue) {
  const json = '\ufeff' + JSON.stringify(queue, null, 2).replace(/\n/g, '\r\n') + '\r\n';
  fs.writeFileSync(
    path.join(dataDir, 'review-queue.json'),
    json,
    'utf8'
  );
}

// ============================================
// appId 인덱스
// ============================================

function buildAppIdIndex(games) {
  const index = new Map(); // appId -> gameName
  for (const [name, data] of Object.entries(games)) {
    for (const appId of Object.values(data.appIds || {})) {
      const key = String(appId || '');
      if (!key) continue;
      index.set(key, name);
    }
  }
  return index;
}

// ============================================
// 히스토리에서 게임 추출
// ============================================

function extractTodayGames(dateStr, overrideFile) {
  // overrideFile이 주어지면 해당 파일을 그대로 읽는다 (테스트 샘플용)
  if (overrideFile) {
    if (!fs.existsSync(overrideFile)) {
      console.log('테스트 파일 없음:', overrideFile);
      return [];
    }
    const data = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  }

  const fileName = `${dateStr}.json`;
  const filePath = path.join(historyDir, fileName);

  if (!fs.existsSync(filePath)) {
    console.log('히스토리 파일 없음:', fileName);
    return [];
  }

  return rowsFromHistory(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

// 히스토리 1일치 → 신규 감지용 행 (5개 시장의 매출/인기, ios/android + steam)
function rowsFromHistory(data) {
  const games = [];

  for (const category of ['grossing', 'free']) {
    for (const cc of Object.keys(MARKETS)) {
      for (const platform of ['ios', 'android']) {
        const list = data.rankings?.[category]?.[cc]?.[platform] || [];
        for (const game of list) {
          if (game.appId && game.title) {
            games.push({
              platform,
              region: cc,
              appId: game.appId,
              title: game.title,
              developer: game.developer || '',
              icon: game.icon || ''
            });
          }
        }
      }
    }
  }

  // Steam
  for (const category of ['mostPlayed', 'topSellers']) {
    const list = data.steam?.[category] || [];
    for (const game of list) {
      if (game.appid && game.name) {
        games.push({
          platform: 'steam',
          region: 'global',
          appId: game.appid,
          title: game.name,
          developer: game.developer || '',
          icon: game.img || ''
        });
      }
    }
  }

  return games;
}

// ============================================
// 스토어 API
// ============================================

async function getIosKrTitle(appId) {
  try {
    const url = `https://itunes.apple.com/lookup?id=${appId}&country=kr`;
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    return data?.results?.[0]?.trackName || null;
  } catch (e) {
    return null;
  }
}

async function getAndroidKrTitle(appId) {
  try {
    const result = await gplay.app({ appId, country: 'kr', lang: 'ko' });
    return result?.title || null;
  } catch (e) {
    return null;
  }
}

async function searchIos(term) {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=kr&entity=software&limit=5`;
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    return (data?.results || []).map(r => ({
      appId: r.trackId,
      title: r.trackName,
      developer: r.sellerName || r.artistName || ''
    }));
  } catch (e) {
    return [];
  }
}

async function searchAndroid(term) {
  try {
    const results = await gplay.search({ term, country: 'kr', lang: 'ko', num: 5 });
    return results.map(r => ({
      appId: r.appId,
      title: r.title,
      developer: r.developer
    }));
  } catch (e) {
    return [];
  }
}

// ============================================
// 이름 매칭
// ============================================

function isNameMatch(name1, name2) {
  const n1 = normalizeTitle(name1);
  const n2 = normalizeTitle(name2);

  // 완전 일치만 허용 (부분 일치는 오병합 위험이 높아 제거됨)
  if (n1 === n2) return { match: true, type: 'exact' };
  // 부분 일치 제거됨 - 수동 처리 필요
  return { match: false, type: null };
}

// ============================================
// 메인 처리
// ============================================

// ============================================
// 다국가: 이름(names) / 스토어 조회 / 신규 등록
// ============================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cleanName = (t) => String(t == null ? '' : t).trim();

// names: 비어 있는 키만 채운다 (기존 값은 유지), 키 순서 고정
function mergeNames(existing, patch) {
  const out = {};
  for (const k of NAME_KEYS) {
    const v = cleanName(existing?.[k]) || cleanName(patch?.[k]);
    if (v) out[k] = v;
  }
  return out;
}

function namesFromCharts(charts) {
  const out = {};
  for (const [cc, row] of Object.entries(charts || {})) {
    if (MARKETS[cc] && cleanName(row?.title)) out[MARKETS[cc].name] = cleanName(row.title);
  }
  return out;
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

// iTunes lookup 배치 (콤마 구분 최대 200개) → Map(appId -> {title, developer, icon})
async function lookupIosBatch(ids, cc) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { data } = await axios.get('https://itunes.apple.com/lookup', {
          params: { id: chunk.join(','), country: cc },
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 30000
        });
        for (const r of data?.results || []) {
          if (r.trackId && r.trackName) {
            out.set(String(r.trackId), {
              title: r.trackName,
              developer: r.sellerName || r.artistName || '',
              icon: r.artworkUrl512 || r.artworkUrl100 || ''
            });
          }
        }
        break;
      } catch (e) {
        await sleep(2000 * (attempt + 1) * (attempt + 1));
      }
    }
  }
  return out;
}

async function lookupAndroid(appId, cc) {
  const gp = MARKETS[cc]?.gp;
  if (!gp) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await gplay.app({ appId, ...gp });
      return r?.title ? { title: r.title, developer: r.developer || '', icon: r.icon || '' } : null;
    } catch (e) {
      if (e?.status === 404 || /not found/i.test(e?.message || '')) return null;
      await sleep(1500);
    }
  }
  return null;
}

async function lookupOne(platform, appId, cc) {
  if (platform === 'ios') return (await lookupIosBatch([String(appId)], cc)).get(String(appId)) || null;
  return lookupAndroid(appId, cc);
}

// 게임 키 + alias + names 의 정규화 키 → 게임명 (복수 게임에 걸리면 false = 모호)
function addAliases(index, name, list) {
  for (const t of list) {
    const k = normalizeNameKey(t);
    if (k.length < 3) continue;
    if (!index.has(k)) index.set(k, name);
    else if (index.get(k) !== name) index.set(k, false);
  }
}

function buildAliasIndex(games) {
  const index = new Map();
  for (const [name, g] of Object.entries(games)) {
    addAliases(index, name, [name, ...(g.aliases || []), ...Object.values(g.names || {})]);
  }
  return index;
}

// 신규 게임 슬러그: 라틴/숫자/한글/한자/가나 유지 (기존 한글 슬러그 방식과 동일하게 구두점 제거, 공백→-)
function slugifyTitle(text) {
  return cleanName(text)
    .normalize('NFKC')
    .replace(/[\u00C0-\u024F]/g, c => c.normalize('NFD').replace(/\p{M}/gu, ''))
    .toLowerCase()
    .replace(/[:'’&!?.]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-\u30FC\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const SLUG_MARKETS = ['tw', 'jp', 'cn', 'us'];
const NAME_KEY_MARKET = { en: 'us', ja: 'jp', 'zh-cn': 'cn', 'zh-tw': 'tw' };

// names.en 우선, 없으면 원제. 충돌 시 -tw/-jp/-cn/-us(자국 시장 우선) → -2, -3. 비면 app-<id>
function uniqueSlug(key, names, markets, appId, used) {
  let slug = slugifyTitle(names?.en) || slugifyTitle(key);
  if (!slug) slug = `app-${String(appId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (!used.has(slug)) return slug;
  const order = Array.from(new Set([...(markets || []), ...SLUG_MARKETS])).filter(m => SLUG_MARKETS.includes(m));
  for (const m of order) if (!used.has(`${slug}-${m}`)) return `${slug}-${m}`;
  for (let n = 2; ; n++) if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

// 게임 항목에서 시장 추정 (지역 appId 슬롯 → names 언어)
function marketsOfGame(g) {
  const fromIds = Object.keys(g.appIds || {}).map(k => k.split('_')[1]).filter(Boolean);
  const fromNames = Object.keys(g.names || {}).map(k => NAME_KEY_MARKET[k]).filter(Boolean);
  return [...fromIds, ...fromNames];
}

const regCtxCache = new WeakMap();
function getRegCtx(gamesData, appIdIndex) {
  const size = Object.keys(gamesData.games).length;
  let ctx = regCtxCache.get(gamesData);
  if (!ctx || ctx.size !== size) {
    ctx = {
      gamesData,
      aliasIndex: buildAliasIndex(gamesData.games),
      slugs: new Set(Object.values(gamesData.games).map(g => g.slug).filter(Boolean)),
      size
    };
    regCtxCache.set(gamesData, ctx);
  }
  ctx.appIdIndex = appIdIndex;
  return ctx;
}

/**
 * 후보 1건 등록 (조회 결과는 호출자가 채워 전달; 네트워크 없음)
 * cand: { platform, appId, region, charts:{cc:{title,developer,icon}}, kr, us, chart }
 *   kr/us/chart = 각 스토어 조회 결과 {title, developer, icon} 또는 null (chart = 차트 진입 국가 스토어)
 * 반환: { status: existing|attached|new|skipped, key, origin, slotKey, pending }
 */
function registerCandidate(cand, ctx) {
  const { platform, appId } = cand;
  const idStr = String(appId);
  const games = ctx.gamesData.games;
  if (ctx.appIdIndex.has(idStr)) return { status: 'existing' };

  const charts = cand.charts || {};
  const cc = REGION_PREF.find(c => charts[c]) || cand.region;
  const chartRow = charts[cc] || { title: cand.title, developer: cand.developer, icon: cand.icon };
  const names = namesFromCharts(charts);
  if (cand.kr) names.ko = cleanName(cand.kr.title);
  if (cand.us) names.en = cleanName(cand.us.title);

  const info = cand.kr || cand.us || cand.chart || null;
  const key0 = cand.kr ? names.ko : cand.us ? names.en : cleanName(chartRow.title);
  if (!key0) return { status: 'skipped' };

  const developer = info?.developer || chartRow.developer || '';
  const icon = chartRow.icon || info?.icon || '';
  const slotKey = cand.kr ? platform : `${platform}_${cc}`;
  const nameList = Array.from(new Set([key0, ...Object.values(names)].filter(Boolean)));

  // 동일 게임 판별: 키/alias/names 정규화 일치 (유일 후보일 때만)
  const targets = new Set();
  let ambiguous = false;
  for (const n of nameList) {
    if (games[n]) targets.add(n);
    const k = normalizeNameKey(n);
    if (k.length < 3) continue;
    const t = ctx.aliasIndex.get(k);
    if (t === false) ambiguous = true;
    else if (t) targets.add(t);
  }

  let key;
  let status;
  if (!ambiguous && targets.size === 1 && !games[[...targets][0]].appIds?.[slotKey]) {
    key = [...targets][0];
    const g = games[key];
    g.appIds = { ...(g.appIds || {}), [slotKey]: appId };
    g.platforms = Array.from(new Set([...(g.platforms || []), platform]));
    g.aliases = Array.from(new Set([...(g.aliases || []), ...nameList].filter(a => a && a !== key)));
    g.names = mergeNames(g.names, names);
    g.developer = g.developer || developer;
    g.icon = g.icon || icon;
    status = 'attached';
  } else {
    key = key0;
    for (let n = 1; games[key]; n++) key = `${key0} (${cc.toUpperCase()}${n > 1 ? ` ${n}` : ''})`;
    const aliases = nameList.filter(a => a !== key);
    games[key] = {
      appIds: { [slotKey]: appId },
      aliases,
      developer,
      icon,
      slug: uniqueSlug(key, names, [cc], appId, ctx.slugs),
      platforms: [platform],
      names: mergeNames({}, names)
    };
    ctx.slugs.add(games[key].slug);
    ctx.size++;
    status = 'new';
  }

  addAliases(ctx.aliasIndex, key, nameList);
  ctx.appIdIndex.set(idStr, key);

  const pending = info ? null : {
    title: key,
    status: 'lookup-failed',
    appIds: { [slotKey]: appId },
    developer,
    icon,
    searchResults: [],
    addedAt: new Date().toISOString()
  };
  return { status, key, origin: cc, krFound: !!cand.kr, slotKey, pending };
}

// KR 스토어에 없는 앱: US → (필요 시) 차트 진입 국가 스토어 조회 후 등록
async function registerNonKr(game, gamesData, appIdIndex, nameKeyIndex, stats) {
  const { platform, appId, region } = game;
  const charts = game.charts || { [region]: { title: game.title, developer: game.developer, icon: game.icon } };
  const cc = REGION_PREF.find(c => charts[c]) || region;
  stats.apiCalled = true;
  const us = await lookupOne(platform, appId, 'us');
  const chart = us || cc === 'us' ? null : await lookupOne(platform, appId, cc);
  const res = registerCandidate({ platform, appId, region, charts, us, chart }, getRegCtx(gamesData, appIdIndex));
  if (res.key) updateNameKeyIndex(nameKeyIndex, res.key);
  if (res.status === 'new' || res.status === 'attached') {
    stats.nonKr = (stats.nonKr || 0) + 1;
    console.log(`  [${platform.toUpperCase()}/${cc}] 비-KR ${res.status === 'new' ? '신규' : '연결'}: "${res.key}"`);
  }
  return res.pending || null;
}

// pending 큐에 반영 (제목 단위 1건 유지)
function upsertPending(reviewQueue, items) {
  const indexByTitle = new Map();
  for (let i = 0; i < reviewQueue.pending.length; i++) {
    const title = reviewQueue.pending[i]?.title;
    if (title) indexByTitle.set(title, i);
  }
  for (const item of items) {
    if (!item?.title) continue;
    const existingIndex = indexByTitle.get(item.title);
    if (existingIndex === undefined) {
      reviewQueue.pending.push(item);
      indexByTitle.set(item.title, reviewQueue.pending.length - 1);
      continue;
    }
    const existing = reviewQueue.pending[existingIndex] || {};
    const mergedSearchResults = [...(existing.searchResults || []), ...(item.searchResults || [])];
    const uniqueSearchResults = Array.from(
      new Map(mergedSearchResults.map(r => [String(r?.appId ?? ''), r])).values()
    ).filter(r => r?.appId);
    reviewQueue.pending[existingIndex] = {
      ...existing,
      ...item,
      appIds: { ...(existing.appIds || {}), ...(item.appIds || {}) },
      searchResults: uniqueSearchResults.slice(0, 3),
      status: mergePendingStatus(existing.status, item.status),
      addedAt: existing.addedAt || item.addedAt,
      developer: existing.developer || item.developer,
      icon: existing.icon || item.icon
    };
  }
}

// 히스토리 전체 → Map("<ios|android>|<appId>|<cc>" -> 가장 최근 행 {title, developer, icon, date})
function loadLatestChartRows(dir = historyDir) {
  const latest = new Map();
  const files = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files) {
    let h;
    try { h = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '')); } catch { continue; }
    const date = f.slice(0, 10);
    for (const cat of ['grossing', 'free']) {
      for (const cc of Object.keys(MARKETS)) {
        for (const store of ['ios', 'android']) {
          for (const r of h.rankings?.[cat]?.[cc]?.[store] || []) {
            if (!r?.appId || !r.title) continue;
            latest.set(`${store}|${r.appId}|${cc}`, { title: r.title, developer: r.developer || '', icon: r.icon || '', date });
          }
        }
      }
    }
  }
  return latest;
}

// 기존 게임 names 백필 (오프라인): 국가별로 appId가 매핑되는 가장 최근 차트 행 제목 (동일 날짜면 ios 우선)
function backfillNames(gamesData, latest) {
  const appIdIndex = buildAppIdIndex(gamesData.games);
  const best = new Map(); // `${game}|${cc}` -> {title, date, store}
  for (const store of ['ios', 'android']) {
    for (const [k, row] of latest) {
      const [s, appId, cc] = k.split('|');
      if (s !== store) continue;
      const game = appIdIndex.get(appId);
      if (!game) continue;
      const bk = `${game}|${cc}`;
      const cur = best.get(bk);
      if (!cur || row.date > cur.date) best.set(bk, { title: row.title, date: row.date });
    }
  }
  const patches = {};
  for (const [bk, v] of best) {
    const i = bk.lastIndexOf('|');
    (patches[bk.slice(0, i)] ||= {})[MARKETS[bk.slice(i + 1)].name] = v.title;
  }
  let changed = 0;
  for (const [name, g] of Object.entries(gamesData.games)) {
    const next = mergeNames(g.names, patches[name]);
    if (JSON.stringify(next) !== JSON.stringify(g.names)) changed++;
    g.names = next;
  }
  return changed;
}

// 같은 appId 중복 제거 + 진입한 모든 국가의 차트 행 수집 (KR 진입 앱은 region=kr 우선)
function dedupeRows(rows) {
  const map = new Map();
  for (const g of rows) {
    const id = String(g.appId || '');
    if (!id) continue;
    let e = map.get(id);
    if (!e) {
      e = { ...g, charts: {} };
      map.set(id, e);
    } else if (g.region === 'kr' && e.region !== 'kr' && g.platform !== 'steam') {
      Object.assign(e, { region: 'kr', title: g.title, developer: g.developer || e.developer, icon: g.icon || e.icon });
    }
    if (g.platform !== 'steam' && !e.charts[g.region]) {
      e.charts[g.region] = { title: g.title, developer: g.developer, icon: g.icon };
    }
  }
  return Array.from(map.values());
}

// ============================================
// 메인 처리
// ============================================

async function processGame(game, gamesData, appIdIndex, nameKeyIndex, stats, pairs) {
  const { platform, region, appId, title, developer, icon } = game;
  const appIdStr = String(appId || '');
  if (!appIdStr) return null;

  // 1. appId로 기존 게임 체크
  if (appIdIndex.has(appIdStr)) {
    stats.existing++;
    return null; // 이미 등록됨
  }

  // 2. Steam은 바로 등록 (기존 엔트리 병합 제한)
  if (platform === 'steam') {
    const gameName = title;
    const targetName = findExistingName(gameName, nameKeyIndex) || gameName;
    const existing = gamesData.games[targetName] || { appIds: {}, aliases: [], developer: '', icon: '', slug: generateSlug(targetName), platforms: [] };

    const appIds = { ...existing.appIds, steam: appId };
    const aliases = Array.from(new Set([...(existing.aliases || []), gameName].filter(a => a && a !== targetName)));
    const platforms = Array.from(new Set([...(existing.platforms || []), 'steam']));

    const merged = {
      appIds,
      aliases,
      developer: existing.developer || developer,
      icon: existing.icon || icon,
      slug: existing.slug || generateSlug(targetName, aliases),
      platforms
    };

    gamesData.games[targetName] = merged;
    updateNameKeyIndex(nameKeyIndex, targetName);
    appIdIndex.set(appIdStr, targetName);
    stats.steam++;
    console.log(`  [Steam] 등록: "${targetName}"`);
    return null;
  }

  // 3. iOS/Android - kr 마켓에서 한국어 이름 조회
  let krTitle = title;

  // kr이 아닌 region이면 kr 마켓에서 한국어 이름 조회
  if (region !== 'kr') {
    stats.apiCalled = true;  // API 호출 플래그
    const krName = platform === 'ios' ? await getIosKrTitle(appId) : await getAndroidKrTitle(appId);
    // KR 스토어에 없는 앱 → 차트 진입 국가 스토어 기준으로 등록
    if (!krName) return registerNonKr(game, gamesData, appIdIndex, nameKeyIndex, stats);
    krTitle = krName;
    console.log(`  kr 이름 조회: "${title}" → "${krTitle}"`);
  }
  const namesPatch = { ...namesFromCharts(game.charts || { [region]: { title } }), ko: krTitle };

  // 반대 플랫폼 검색 (kr 마켓에서)
  const oppositePlatform = platform === 'ios' ? 'android' : 'ios';
  let searchResults = [];
  let matched = null;

  // 3-1. 오늘 랭킹 전역에서 동일 이름 선매칭 (스토어 검색 전)
  if (pairs) {
    const keys = Array.from(new Set([
      normalizeNameKey(krTitle),
      normalizeNameKey(title)
    ].filter(k => k.length >= 3)));

    for (const key of keys) {
      const pair = pairs.get(key);
      if (pair && !pair.conflict && pair.ios && pair.android) {
        const oppositeEntry = platform === 'ios' ? pair.android : pair.ios;
        if (oppositeEntry && String(oppositeEntry.appId) !== appIdStr) {
          matched = {
            appId: oppositeEntry.appId,
            title: oppositeEntry.title,
            developer: oppositeEntry.developer
          };
          searchResults = [matched];
          break;
        }
      }
    }
  }

  if (!matched) {
    stats.apiCalled = true;  // API 호출 플래그
    if (oppositePlatform === 'android') {
      searchResults = await searchAndroid(krTitle);
    } else {
      searchResults = await searchIos(krTitle);
    }

    // 매칭 시도 (완전 일치만 허용 - 부분일치는 오병합 위험)
    for (const result of searchResults.slice(0, 3)) {
      const matchResult = isNameMatch(krTitle, result.title);

      // 이름 정규화 완전 일치만 매칭 (exact only)
      if (matchResult.match && matchResult.type === 'exact') {
        matched = result;
        break;
      }
    }
  }

  // 게임 이름 결정 (한국어 우선)
  let gameName = krTitle;
  if (matched && isKoreanName(matched.title)) {
    gameName = matched.title;
  }
  if (!isKoreanName(gameName) && isKoreanName(krTitle)) {
    gameName = krTitle;
  }

  // 저장 키: 플랫폼만 사용 (region 붙이지 않음)
  const appIdKey = `${platform}`;
  const oppositeKey = `${oppositePlatform}`;

  // 4. 매칭 성공 - 양쪽 appId로 통합 등록 (병합)
  if (matched) {
    const targetName = findExistingName(gameName, nameKeyIndex) || gameName;
    const existing = gamesData.games[targetName] || { appIds: {}, aliases: [], developer: '', icon: '', slug: generateSlug(targetName), platforms: [] };
    const matchedAppIdStr = String(matched.appId || '');
    const existingCurrent = existing.appIds?.[appIdKey];
    const existingOpposite = existing.appIds?.[oppositeKey];
    const currentConflict = existingCurrent && String(existingCurrent) !== appIdStr;
    const oppositeConflict = existingOpposite && String(existingOpposite) !== matchedAppIdStr;

    if (currentConflict || oppositeConflict) {
      stats.conflict++;

      const appIds = {
        ...(existing.appIds || {}),
        ...(currentConflict ? {} : { [appIdKey]: appId }),
        ...(oppositeConflict ? {} : { [oppositeKey]: matched.appId })
      };

      const conflictReasons = [];
      if (currentConflict) conflictReasons.push(`${appIdKey}: ${existingCurrent} != ${appId}`);
      if (oppositeConflict) conflictReasons.push(`${oppositeKey}: ${existingOpposite} != ${matched.appId}`);
      console.log(`  [충돌 보류] "${targetName}" (${conflictReasons.join(', ')})`);

      return {
        title: targetName,
        status: 'conflict',
        appIds,
        developer: existing.developer || developer || matched.developer || '',
        icon: existing.icon || icon,
        searchResults: searchResults.slice(0, 3).map(r => ({ title: r.title, appId: r.appId })),
        addedAt: new Date().toISOString()
      };
    }

    const appIds = { ...existing.appIds, [appIdKey]: appId, [oppositeKey]: matched.appId };
    const aliases = Array.from(new Set([
      ...(existing.aliases || []),
      gameName,
      krTitle,
      matched.title
    ].filter(a => a && a !== targetName)));
    const platforms = Array.from(new Set([...(existing.platforms || []), platform, oppositePlatform]));

    const merged = {
      appIds,
      aliases,
      developer: existing.developer || developer || matched.developer || '',
      icon: existing.icon || icon,
      slug: existing.slug || generateSlug(targetName, aliases),
      platforms,
      names: mergeNames(existing.names, namesPatch)
    };

    gamesData.games[targetName] = merged;
    updateNameKeyIndex(nameKeyIndex, targetName);
    appIdIndex.set(appIdStr, targetName);
    appIdIndex.set(matchedAppIdStr, targetName);
    stats.matched++;
    console.log(`  [${platform.toUpperCase()}+${oppositePlatform.toUpperCase()}] 통합: "${targetName}"`);

    // 신규 게임은 매칭 성공 여부와 상관없이 pending에 남겨 사람이 최종 확인
    return {
      title: targetName,
      status: 'matched',
      appIds,
      developer: gamesData.games[targetName].developer,
      icon: gamesData.games[targetName].icon,
      searchResults: searchResults.slice(0, 3).map(r => ({ title: r.title, appId: r.appId })),
      addedAt: new Date().toISOString()
    };
  }

  // 5. 매칭 실패 - 한쪽만 등록 + pending
  const targetName = findExistingName(gameName, nameKeyIndex) || gameName;
  const existing = gamesData.games[targetName] || { appIds: {}, aliases: [], developer: '', icon: '', slug: generateSlug(targetName), platforms: [] };

  const appIds = { ...existing.appIds, [appIdKey]: appId };
  const aliases = Array.from(new Set([...(existing.aliases || []), gameName, krTitle].filter(a => a && a !== targetName)));
  const platforms = Array.from(new Set([...(existing.platforms || []), platform]));

  gamesData.games[targetName] = {
    appIds,
    aliases,
    developer: existing.developer || developer,
    icon: existing.icon || icon,
    slug: existing.slug || generateSlug(targetName, aliases),
    platforms,
    names: mergeNames(existing.names, namesPatch)
  };
  updateNameKeyIndex(nameKeyIndex, targetName);
  appIdIndex.set(appIdStr, targetName);
  stats.single++;
  console.log(`  [${platform.toUpperCase()}] 단독 등록: "${targetName}"`);

  // iOS/Android 단독일 때만 pending 반환
  const isSinglePlatform = platforms.length === 1 && (platforms[0] === 'ios' || platforms[0] === 'android');
  if (!isSinglePlatform) return null;

  return {
    title: targetName,
    status: 'single',
    appIds,
    developer: gamesData.games[targetName].developer,
    icon: gamesData.games[targetName].icon,
    searchResults: searchResults.slice(0, 3).map(r => ({ title: r.title, appId: r.appId })),
    addedAt: new Date().toISOString()
  };
}

async function main() {
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateStr = process.argv[2] || kstToday;
  const overrideFile = process.argv[3]; // 테스트 입력 파일 (옵션)

  console.log('=== 통합 게임 동기화 시작 ===');
  console.log('날짜:', dateStr);

  const gamesData = loadGames();
  const reviewQueue = loadReviewQueue();
  const appIdIndex = buildAppIdIndex(gamesData.games);
  const nameKeyIndex = buildNameKeyIndex(gamesData.games);

  console.log('기존 게임:', Object.keys(gamesData.games).length);

  // 히스토리 또는 테스트 파일에서 게임 추출
  const todayGames = extractTodayGames(dateStr, overrideFile);
  console.log('오늘 크롤링 게임:', todayGames.length, overrideFile ? `(from ${overrideFile})` : '');

  // 중복 제거 (같은 appId, 타입 차이 방지 위해 문자열 통일)
  const uniqueGames = dedupeRows(todayGames);
  console.log('고유 게임:', uniqueGames.length);

  const stats = { existing: 0, steam: 0, matched: 0, single: 0, conflict: 0, pending: 0, apiCalled: false };
  // targetName 기준으로 마지막 상태만 저장
  const pendingMap = new Map();
  const globalPairs = buildGlobalPairs(uniqueGames);

  // 각 게임 처리
  let nonKrProcessed = 0;
  let nonKrDeferred = 0;
  for (let i = 0; i < uniqueGames.length; i++) {
    const game = uniqueGames[i];

    if ((i + 1) % 50 === 0) {
      console.log(`\n진행: ${i + 1}/${uniqueGames.length}`);
    }

    // 비-KR 신규 앱은 1회 실행당 상한 (남은 앱은 다음 실행 또는 bulk 스크립트가 처리)
    if (game.region !== 'kr' && game.platform !== 'steam' && !appIdIndex.has(String(game.appId))) {
      if (nonKrProcessed >= MAX_NON_KR_PER_RUN) { nonKrDeferred++; continue; }
      nonKrProcessed++;
    }

    const pendingItem = await processGame(game, gamesData, appIdIndex, nameKeyIndex, stats, globalPairs);

    // 매칭 성공/실패 모두 리뷰 큐 후보에 적재, 동일 타이틀은 병합
    if (pendingItem) {
      const existing = pendingMap.get(pendingItem.title);
      if (!existing) {
        pendingMap.set(pendingItem.title, pendingItem);
      } else {
        const mergedAppIds = { ...existing.appIds, ...pendingItem.appIds };
        const mergedSearchResults = [
          ...(existing.searchResults || []),
          ...(pendingItem.searchResults || [])
        ];
        const uniqueSearchResults = Array.from(
          new Map(
            mergedSearchResults.map(r => [String(r?.appId ?? ''), r])
          ).values()
        ).filter(r => r?.appId);

        pendingMap.set(pendingItem.title, {
          ...existing,
          ...pendingItem,
          appIds: mergedAppIds,
          searchResults: uniqueSearchResults.slice(0, 3),
          status: mergePendingStatus(existing.status, pendingItem.status)
        });
      }
      stats.pending++;
    }

    // API 호출했을 때만 딜레이 (스킵 시 딜레이 없음)
    if (stats.apiCalled) {
      await new Promise(r => setTimeout(r, 100));
      stats.apiCalled = false;
    }
  }

  // pending 추가/업데이트 (targetName 단위 1건만 유지)
  upsertPending(reviewQueue, Array.from(pendingMap.values()));

  // 저장
  gamesData.lastUpdated = dateStr;
  gamesData.totalGames = Object.keys(gamesData.games).length;
  saveGames(gamesData);
  saveReviewQueue(reviewQueue);

  console.log('\n=== 결과 ===');
  console.log('이미 등록됨:', stats.existing);
  console.log('Steam 등록:', stats.steam);
  console.log('양쪽 통합 등록:', stats.matched);
  console.log('단독 등록:', stats.single);
  console.log('충돌 보류:', stats.conflict);
  console.log('비-KR 신규/연결:', stats.nonKr || 0, `(상한 ${MAX_NON_KR_PER_RUN}, 이월 ${nonKrDeferred})`);
  console.log('pending 추가:', stats.pending);
  console.log('최종 게임 수:', gamesData.totalGames);
  console.log('pending 큐:', reviewQueue.pending.length);
  console.log('\n저장 완료!');
}

module.exports = {
  MARKETS, NAME_KEYS, REGION_PREF, rowsFromHistory, dedupeRows, mergeNames, buildAppIdIndex,
  buildAliasIndex, addAliases, normalizeNameKey, slugifyTitle, uniqueSlug, marketsOfGame, lookupOne, getRegCtx, registerCandidate, lookupIosBatch, lookupAndroid, upsertPending,
  loadLatestChartRows, backfillNames, loadGames, saveGames, loadReviewQueue, saveReviewQueue, pool
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
