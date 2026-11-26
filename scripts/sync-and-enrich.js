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
const { latinSlug, uniqueOf, takenSlugs } = require('../src/build/game-slug');
const { migrate: reslugLatinNamed } = require('./migrate-game-slugs');
const { merge: mergeDuplicates, chartDaysOf } = require('../src/build/game-merge');
const { loadRankStats } = require('../src/rank/stats');
const { fitsEdition } = require('../src/rank/name-script');

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

// Latin 이름이 있으면 ASCII 슬러그 (src/build/game-slug.js), 없으면 원제 그대로
function generateSlug(name, aliases = []) {
  const ascii = latinSlug(name, { aliases });
  if (ascii) return ascii;
  return name
    .toLowerCase()
    .replace(/[:'&!?.]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 처음 등록하는 게임의 빈 레코드와 슬러그. 병합 경로는 기존 레코드를 펼쳐(...existing) legacySlugs 등 모르는 필드를 그대로 둔다.
const blankGame = () => ({ appIds: {}, aliases: [], developer: '', icon: '', slug: '', platforms: [] });
// 쓰이는 슬러그와 물러난 슬러그(legacySlugs: 옛 주소가 301 로 살아 있다) 어느 것과도 겹치지 않게 한다.
function newSlug(games, name, aliases, developer) {
  const slug = generateSlug(name, aliases);
  return slug ? uniqueOf(slug, developer, takenSlugs(games)) : slug;
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
// ™ and ® are no part of a stored English name
const stripMarks = (t) => cleanName(String(t == null ? '' : t).replace(/[™®]\uFE0F?/g, '').replace(/\s{2,}/g, ' '));

// names: 비어 있는 키만 채운다 (기존 값은 유지), 키 순서 고정
function mergeNames(existing, patch) {
  const out = {};
  for (const k of NAME_KEYS) {
    const pick = k === 'en' ? stripMarks : cleanName;
    const v = pick(existing?.[k]) || pick(patch?.[k]);
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

// iTunes lookup 배치 (콤마 구분 최대 200개) → Map(appId -> {title, developer, icon, bundleId})
// iTunes 는 그 국가 스토어에 출시된 앱만 돌려준다. failed(Set)를 넘기면 재시도가 모두 실패한 id 를 기록한다.
// attempts: 요청 시도 횟수 (실패 사이 대기)
async function lookupIosBatch(ids, cc, failed, attempts = 4) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let ok = false;
    for (let attempt = 0; attempt < attempts && !ok; attempt++) {
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
              icon: r.artworkUrl512 || r.artworkUrl100 || '',
              bundleId: r.bundleId || ''
            });
          }
        }
        ok = true;
      } catch (e) {
        if (attempt + 1 < attempts) await sleep(2000 * (attempt + 1) * (attempt + 1));
      }
    }
    if (!ok && failed) for (const id of chunk) failed.add(`ios|${cc}|${id}`);
  }
  return out;
}

// google-play 는 미출시 국가에도 상세를 내려주므로 available(그 국가 스토어 출시 여부)이 false 면 없는 것으로 본다
async function lookupAndroid(appId, cc, failed) {
  const gp = MARKETS[cc]?.gp;
  if (!gp) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await gplay.app({ appId, ...gp });
      return r?.title && r.available !== false ? { title: r.title, developer: r.developer || '', icon: r.icon || '' } : null;
    } catch (e) {
      if (e?.status === 404 || /not found/i.test(e?.message || '')) return null;
      await sleep(1500);
    }
  }
  if (failed) failed.add(`android|${cc}|${appId}`);
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

// Latin 이름(names.en 우선)이 있으면 ASCII 슬러그, 없으면 원제. 충돌 시 -tw/-jp/-cn/-us(자국 시장 우선) → -2, -3. 비면 app-<id>
function uniqueSlug(key, names, markets, appId, used) {
  let slug = latinSlug(key, { names }) || slugifyTitle(key);
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
      slugs: takenSlugs(gamesData.games),
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
    if (JSON.stringify(next) === JSON.stringify(g.names || {})) continue;
    changed++;
    g.names = next;
  }
  return changed;
}

// 시장별 현재 스토어 이름 (출시된 시장만): 시장마다 iOS 배치 조회, iOS 에 없으면 Android 개별 조회 (cn 은 iOS 만).
// 반환 Map(게임 키 -> { 이름 언어: 제목 | null }) — null 은 그 시장에 없음, 조회 실패로 모르는 시장은 키를 넣지 않는다.
// iOS/Android id 가 없는 게임(Steam 등)은 결과에 넣지 않는다. cache 는 `${store}|${cc}|${id}` -> 제목|null.
async function lookupMarketTitles(games, keys, cache = {}) {
  const ck = (store, cc, id) => `${store}|${cc}|${id}`;
  const idsOf = (g, store) => Object.entries(g.appIds || {})
    .filter(([k]) => k === store || k.startsWith(store + '_')).map(([, v]) => String(v));
  const mobile = keys.filter(k => idsOf(games[k], 'ios').length || idsOf(games[k], 'android').length);
  const failed = new Set();
  for (const cc of Object.keys(MARKETS)) {
    const todo = [...new Set(mobile.flatMap(k => idsOf(games[k], 'ios')))].filter(id => !(ck('ios', cc, id) in cache));
    if (!todo.length) continue;
    const found = await lookupIosBatch(todo, cc, failed);
    for (const id of todo) if (!failed.has(ck('ios', cc, id))) cache[ck('ios', cc, id)] = found.get(id)?.title || null;
  }
  const firstTitle = (g, store, cc) => idsOf(g, store).map(id => cache[ck(store, cc, id)]).find(Boolean) || null;
  const jobs = [];
  for (const k of mobile) {
    for (const cc of Object.keys(MARKETS)) {
      if (!MARKETS[cc].gp || firstTitle(games[k], 'ios', cc)) continue;
      for (const id of idsOf(games[k], 'android')) if (!(ck('android', cc, id) in cache)) jobs.push({ cc, id });
    }
  }
  const seen = new Set();
  await pool(jobs.filter(j => !seen.has(ck('android', j.cc, j.id)) && seen.add(ck('android', j.cc, j.id))), 6, async ({ cc, id }) => {
    const hit = await lookupAndroid(id, cc, failed);
    if (!failed.has(ck('android', cc, id))) cache[ck('android', cc, id)] = hit ? hit.title : null;
  });
  const out = new Map();
  for (const k of mobile) {
    const g = games[k];
    const titles = {};
    for (const [cc, m] of Object.entries(MARKETS)) {
      const title = firstTitle(g, 'ios', cc) || firstTitle(g, 'android', cc);
      const unknown = ['ios', 'android'].some(store => idsOf(g, store).some(id => failed.has(ck(store, cc, id))));
      if (title || !unknown) titles[m.name] = title;
    }
    out.set(k, titles);
  }
  return out;
}

// 한 시장의 이름 정리: 그 시장의 근거(현재 스토어 이름, 그 시장 차트에 실린 제목)와 맞는 이름만 남긴다.
// storeTitle: 제목 | null(그 시장 미출시) | undefined(조회 실패로 모름 → 기존 값 유지). 반환 null 은 이름 삭제.
function resolveMarketName(current, storeTitle, chartTitles) {
  if (storeTitle === undefined) return current || chartTitles[0] || null;
  const evidence = [storeTitle, ...chartTitles].filter(Boolean);
  if (!evidence.length) return null;
  return current && evidence.includes(current) ? current : evidence[0];
}

// ============================================
// 영어판 이름: 공식 영어 스토어 이름
// ============================================

// The English edition's name of a game is the official English name of one of its store listings, never a translation or
// transliteration: the App Store US name, Google Play in English (hl=en), Steam in English. A listing without an English
// version comes back in its original script, which is no English name. ™ and ® are not part of the stored name.
const englishName = (title) => {
  const n = stripMarks(title);
  return n && fitsEdition(n, 'en') ? n : null;
};
const hasEnglishName = (g) => Boolean(englishName(g.names && g.names.en));
// Apps whose stores had no English name are asked again within this many days, each game on its own day of the window
// (data/english-name-checks.json: `<store>:<id>` -> the date it is due again), so the rechecks spread over the daily runs.
const EN_RECHECK_DAYS = 30;
const MAX_EN_LOOKUPS = Number(process.env.GS_MAX_EN_NAME_LOOKUPS) || 300;
const englishChecksPath = path.join(dataDir, 'english-name-checks.json');
const DAY_MS = 86400000;
// The app's next check date: the first day after `today` that falls on the app's own day of the EN_RECHECK_DAYS window.
function nextCheckDate(appKey, today) {
  let h = 0x811c9dc5;
  for (const ch of appKey) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  const day = Date.parse(today) / DAY_MS;
  const ahead = ((h % EN_RECHECK_DAYS) - (day + 1) % EN_RECHECK_DAYS + EN_RECHECK_DAYS) % EN_RECHECK_DAYS + 1;
  return new Date((day + ahead) * DAY_MS).toISOString().slice(0, 10);
}

// A game's store apps { store, id, cc }: cc is the storefront of a regional slot, KR for a bare ios/android slot.
function storeAppsOf(g) {
  return Object.entries(g.appIds || {}).flatMap(([slot, id]) => {
    const [store, cc] = slot.split(/[_:]/);
    if (!id || !['ios', 'android', 'steam'].includes(store)) return [];
    return [{ store, id: String(id), cc: store === 'steam' ? null : cc || 'kr' }];
  });
}
const checkKey = (app) => `${app.store}:${app.id}`;

// The English-name lookups ask once: a failed one (undefined) is left for the next run.
// Google Play title in English, from the first of `countries` that lists the app.
// got's defaults would retry with backoff, wait out any Retry-After and never time out.
const ANDROID_ONCE = { retry: 0, timeout: 15000 };
async function lookupAndroidEnglish(appId, countries) {
  for (const country of countries) {
    try {
      const r = await gplay.app({ appId, lang: 'en', country, requestOptions: ANDROID_ONCE });
      return r?.title || null;
    } catch (e) {
      if (!(e?.status === 404 || /not found/i.test(e?.message || ''))) return undefined;
    }
  }
  return null;
}

// Steam store name in English, only from the app asked for: appdetails answers some IDs with another app (a successor,
// the base game of a mode), whose steam_appid differs.
async function lookupSteamEnglish(appId) {
  try {
    const { data } = await axios.get('https://store.steampowered.com/api/appdetails', {
      params: { appids: appId, l: 'english' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    const entry = data?.[appId];
    return entry?.success && String(entry.data?.steam_appid) === String(appId) ? cleanName(entry.data?.name) || null : null;
  } catch (e) {
    return undefined;
  }
}

const ENGLISH_STORES = {
  ios: (ids, failed) => lookupIosBatch(ids, 'us', failed, 1),
  android: lookupAndroidEnglish,
  steam: lookupSteamEnglish
};

// Official English names of the games `keys`: Map(key -> name). The apps of a game left without one get their next check
// date in `checks` unless one of its lookups failed; a named game's apps leave it.
async function lookupEnglishNames(games, keys, checks, today, stores = ENGLISH_STORES) {
  const apps = new Map(keys.map(k => [k, storeAppsOf(games[k])]));
  const named = new Map();
  const unknown = new Set();
  const settle = (k, title) => { const n = englishName(title); if (n && !named.has(k)) named.set(k, n); };
  const open = (store) => keys.filter(k => !named.has(k)).flatMap(k => apps.get(k).filter(a => a.store === store).map(a => ({ k, a })));
  // App Store: the US storefront listing
  const iosJobs = open('ios');
  if (iosJobs.length) {
    const failed = new Set();
    const found = await stores.ios([...new Set(iosJobs.map(({ a }) => a.id))], failed);
    for (const { k, a } of iosJobs) {
      if (failed.has(`ios|us|${a.id}`)) unknown.add(k);
      else settle(k, found.get(a.id)?.title);
    }
  }
  for (const [store, size, ask] of [['android', 6, a => stores.android(a.id, [...new Set([a.cc, 'us'])])], ['steam', 2, a => stores.steam(a.id)]]) {
    const jobs = open(store);
    const titles = new Map();
    await pool(jobs, size, async (job) => { titles.set(job, await ask(job.a)); });
    for (const job of jobs) {
      if (titles.get(job) === undefined) unknown.add(job.k);
      else settle(job.k, titles.get(job));
    }
  }
  for (const k of keys) {
    if (named.has(k)) for (const a of apps.get(k)) delete checks[checkKey(a)];
    else if (!unknown.has(k)) {
      // one date for the game's apps, so the game is asked once a window
      const due = nextCheckDate(checkKey(apps.get(k)[0]), today);
      for (const a of apps.get(k)) checks[checkKey(a)] = due;
    }
  }
  return named;
}

// Games without an English name with an app never asked or due again.
function englishNameDue(games, checks, today) {
  return Object.keys(games).filter(k => {
    const apps = storeAppsOf(games[k]);
    return !hasEnglishName(games[k]) && apps.some(a => !checks[checkKey(a)] || checks[checkKey(a)] <= today);
  });
}

// names.en ← the official English name, for up to `limit` due games, `first` (this run's new and linked games) first.
// A non-English names.en (a US listing in its original script) gives way to it. Returns { asked, named }.
async function fillEnglishNames(gamesData, checks, first, today, limit = MAX_EN_LOOKUPS, stores = ENGLISH_STORES) {
  const games = gamesData.games;
  const due = englishNameDue(games, checks, today);
  const dueSet = new Set(due);
  const keys = [...new Set([...first.filter(k => dueSet.has(k)), ...due])].slice(0, limit);
  const named = await lookupEnglishNames(games, keys, checks, today, stores);
  for (const [k, name] of named) games[k].names = mergeNames({ ...games[k].names, en: name });
  return { asked: keys.length, named: named.size };
}

function loadEnglishNameChecks() {
  return fs.existsSync(englishChecksPath) ? JSON.parse(fs.readFileSync(englishChecksPath, 'utf8')) : {};
}

function saveEnglishNameChecks(checks) {
  const sorted = Object.fromEntries(Object.keys(checks).sort().map(k => [k, checks[k]]));
  fs.writeFileSync(englishChecksPath, JSON.stringify(sorted, null, 1) + '\n', 'utf8');
}

// ============================================
// App Store bundle IDs
// ============================================

// data/ios-bundle-ids.json: App Store ID -> bundle ID. An App Store app whose bundle ID is a Google Play package is that app
// (src/build/game-merge.js). An app without one is asked on its storefront once a run, a failed or unlisted one again the next.
const bundleIdsPath = path.join(dataDir, 'ios-bundle-ids.json');

function loadBundleIds() {
  return fs.existsSync(bundleIdsPath) ? JSON.parse(fs.readFileSync(bundleIdsPath, 'utf8')) : {};
}

function saveBundleIds(bundles) {
  const sorted = Object.fromEntries(Object.keys(bundles).sort().map(k => [k, bundles[k]]));
  fs.writeFileSync(bundleIdsPath, JSON.stringify(sorted, null, 1) + '\n', 'utf8');
}

// bundles ← the bundle IDs of the DB's App Store apps that have none. Returns how many were found.
async function fillBundleIds(games, bundles, lookup = lookupIosBatch) {
  const byStorefront = new Map();
  for (const g of Object.values(games)) {
    for (const a of storeAppsOf(g)) {
      if (a.store !== 'ios' || bundles[a.id]) continue;
      if (!byStorefront.has(a.cc)) byStorefront.set(a.cc, new Set());
      byStorefront.get(a.cc).add(a.id);
    }
  }
  let found = 0;
  for (const [cc, ids] of byStorefront) {
    for (const [id, app] of await lookup([...ids].filter(id => !bundles[id]), cc, undefined, 1)) {
      if (app.bundleId && !bundles[id]) { bundles[id] = app.bundleId; found++; }
    }
  }
  return found;
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
    const existing = gamesData.games[targetName] || blankGame();

    const appIds = { ...existing.appIds, steam: appId };
    const aliases = Array.from(new Set([...(existing.aliases || []), gameName].filter(a => a && a !== targetName)));
    const platforms = Array.from(new Set([...(existing.platforms || []), 'steam']));

    const merged = {
      ...existing,
      appIds,
      aliases,
      developer: existing.developer || developer,
      icon: existing.icon || icon,
      slug: existing.slug || newSlug(gamesData.games, targetName, aliases, existing.developer || developer),
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
    const existing = gamesData.games[targetName] || blankGame();
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
      ...existing,
      appIds,
      aliases,
      developer: existing.developer || developer || matched.developer || '',
      icon: existing.icon || icon,
      slug: existing.slug || newSlug(gamesData.games, targetName, aliases, existing.developer || developer || matched.developer),
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
  const existing = gamesData.games[targetName] || blankGame();

  const appIds = { ...existing.appIds, [appIdKey]: appId };
  const aliases = Array.from(new Set([...(existing.aliases || []), gameName, krTitle].filter(a => a && a !== targetName)));
  const platforms = Array.from(new Set([...(existing.platforms || []), platform]));

  gamesData.games[targetName] = {
    ...existing,
    appIds,
    aliases,
    developer: existing.developer || developer,
    icon: existing.icon || icon,
    slug: existing.slug || newSlug(gamesData.games, targetName, aliases, existing.developer || developer),
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

// 같은 앱(같은 스토어 ID, 또는 Google Play 패키지와 같은 App Store 번들 ID)이거나 같은 제목·같은 개발사인, 충돌 없는 스토어 ID 의
// 중복 레코드를 매출 차트 이력이 긴 쪽으로 합친다 (src/build/game-merge.js). 없어진 쪽 슬러그는 legacySlugs 에 남아 301 된다.
// S: 순위 통계 (기본은 history/ 전체), bundles: App Store ID -> 번들 ID (기본은 data/ios-bundle-ids.json).
function mergeSameTitle(gamesData, S = loadRankStats({ force: true }), bundles = loadBundleIds()) {
  return mergeDuplicates(gamesData, chartDaysOf(S), (id) => bundles[id]);
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
  const appIdsBefore = new Map(Object.entries(gamesData.games).map(([k, g]) => [k, JSON.stringify(g.appIds || {})]));

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

  // 시장별 이름 빈 칸 채우기: 이번 실행에 등록·연결된 게임은 출시된 시장의 스토어 이름,
  // 그 밖에는 오늘 그 시장 차트에 실린 제목 (기존 이름은 유지)
  const changedKeys = Object.keys(gamesData.games)
    .filter(k => appIdsBefore.get(k) !== JSON.stringify(gamesData.games[k].appIds || {}));
  for (const [k, titles] of await lookupMarketTitles(gamesData.games, changedKeys)) {
    gamesData.games[k].names = mergeNames(gamesData.games[k].names, titles);
  }
  const todayRows = new Map(todayGames.filter(g => g.platform !== 'steam' && g.appId && g.title)
    .map(g => [`${g.platform}|${g.appId}|${g.region}`, { title: g.title, date: dateStr }]));
  console.log('시장별 이름 보강:', changedKeys.length, '개 게임 스토어 조회,', backfillNames(gamesData, todayRows), '개 게임 차트 제목');

  // 영어판 이름: 영어 이름이 없는 게임에 공식 영어 스토어 이름 (이번 실행의 등록·연결 게임 먼저, 1회 상한)
  const englishChecks = loadEnglishNameChecks();
  const english = await fillEnglishNames(gamesData, englishChecks, changedKeys, dateStr);
  console.log('영어 이름:', english.asked, '개 게임 조회,', english.named, '개 공식 영어 이름');

  // 등록 뒤에 Latin 이름이 생긴 게임(스토어 이름 보강·별칭 추가)은 ASCII 슬러그로 바꾸고 옛 슬러그를 legacySlugs 에 남긴다 (옛 주소 301)
  const reslugged = reslugLatinNamed(gamesData);
  for (const r of reslugged) console.log(`  슬러그 변경: ${r.from} → ${r.to}`);

  // App Store 번들 ID: 없는 앱만 조회 (Google Play 패키지와 같으면 같은 앱으로 통합)
  const bundles = loadBundleIds();
  console.log('App Store 번들 ID:', await fillBundleIds(gamesData.games, bundles), '개 새로 확인');
  for (const m of mergeSameTitle(gamesData, undefined, bundles)) console.log(`  중복 통합: ${m.kept} ← ${m.merged.join(', ')}`);

  // pending 추가/업데이트 (targetName 단위 1건만 유지)
  upsertPending(reviewQueue, Array.from(pendingMap.values()));

  // 저장
  gamesData.lastUpdated = dateStr;
  gamesData.totalGames = Object.keys(gamesData.games).length;
  saveGames(gamesData);
  saveReviewQueue(reviewQueue);
  saveEnglishNameChecks(englishChecks);
  saveBundleIds(bundles);

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
  buildAliasIndex, addAliases, normalizeNameKey, slugifyTitle, uniqueSlug, marketsOfGame, processGame, buildNameKeyIndex, lookupOne, getRegCtx, registerCandidate, lookupIosBatch, lookupAndroid, upsertPending,
  loadLatestChartRows, backfillNames, lookupMarketTitles, resolveMarketName, loadGames, saveGames, loadReviewQueue, saveReviewQueue, pool,
  mergeSameTitle, englishName, nextCheckDate, lookupSteamEnglish, lookupAndroidEnglish, lookupEnglishNames, englishNameDue, fillEnglishNames, loadEnglishNameChecks, saveEnglishNameChecks,
  loadBundleIds, saveBundleIds, fillBundleIds
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
