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
    .normalize('NFKD')
    .replace(/[^a-z0-9가-힣]/g, '');
}

// 모든 region 랭킹에서 iOS/Android 동일 이름 선매칭용 맵 생성
function buildGlobalPairs(games) {
  const pairs = new Map(); // key -> { title, ios, android }
  for (const game of games) {
    if (!game.title) continue;
    if (game.platform !== 'ios' && game.platform !== 'android') continue;

    const key = normalizeNameKey(game.title);
    if (!key || key.length < 3) continue;

    const entry = pairs.get(key) || { title: game.title, ios: null, android: null };
    entry[game.platform] = game;
    if (!entry.title && game.title) entry.title = game.title;
    pairs.set(key, entry);
  }
  return pairs;
}

// 기존 게임명 탐색 (과도한 병합 방지: exact 우선, 정규화는 길이 3 이상만 허용)
function findExistingName(gameName, gamesData) {
  if (gamesData.games[gameName]) return gameName;

  const key = normalizeNameKey(gameName);
  if (key.length < 3) return null;

  for (const name of Object.keys(gamesData.games)) {
    if (normalizeNameKey(name) === key) {
      return name;
    }
  }
  return null;
}

// ============================================
// 데이터 로드/저장
// ============================================

function loadGames() {
  const filePath = path.join(dataDir, 'games.json');
  if (!fs.existsSync(filePath)) {
    return { version: '5.0.0', games: {} };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadReviewQueue() {
  const filePath = path.join(dataDir, 'review-queue.json');
  if (!fs.existsSync(filePath)) {
    return { pending: [], approved: [], rejected: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveGames(gamesData) {
  fs.writeFileSync(
    path.join(dataDir, 'games.json'),
    JSON.stringify(gamesData, null, 2)
  );
}

function saveReviewQueue(queue) {
  fs.writeFileSync(
    path.join(dataDir, 'review-queue.json'),
    JSON.stringify(queue, null, 2)
  );
}

// ============================================
// appId 인덱스
// ============================================

function buildAppIdIndex(games) {
  const index = new Map(); // appId -> gameName
  for (const [name, data] of Object.entries(games)) {
    for (const appId of Object.values(data.appIds || {})) {
      index.set(appId, name);
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

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const games = [];

  // 모바일 랭킹 (KR만 대상)
  for (const category of ['grossing', 'free']) {
    for (const platform of ['ios', 'android']) {
      const list = data.rankings?.[category]?.kr?.[platform] || [];
      for (const game of list) {
        if (game.appId && game.title) {
          games.push({
            platform,
            region: 'kr',
            appId: game.appId,
            title: game.title,
            developer: game.developer || '',
            icon: game.icon || ''
          });
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

  if (n1 === n2) return { match: true, type: 'exact' };
  if (n1.includes(n2) || n2.includes(n1)) return { match: true, type: 'partial' };
  return { match: false, type: null };
}

// ============================================
// 메인 처리
// ============================================

async function processGame(game, gamesData, appIdIndex, stats, pairs) {
  const { platform, region, appId, title, developer, icon } = game;

  // 1. appId로 기존 게임 체크
  if (appIdIndex.has(appId)) {
    stats.existing++;
    return null; // 이미 등록됨
  }

  // 2. Steam은 바로 등록 (기존 엔트리 병합 제한)
  if (platform === 'steam') {
    const gameName = title;
    const targetName = findExistingName(gameName, gamesData) || gameName;
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
    appIdIndex.set(appId, targetName);
    stats.steam++;
    console.log(`  [Steam] 등록: "${targetName}"`);
    return null;
  }

  // 3. iOS/Android - kr 마켓에서 한국어 이름 조회
  let krTitle = title;

  // kr이 아닌 region이면 kr 마켓에서 한국어 이름 조회
  if (region !== 'kr') {
    if (platform === 'ios') {
      const krName = await getIosKrTitle(appId);
      if (krName) {
        krTitle = krName;
        console.log(`  kr 이름 조회: "${title}" → "${krTitle}"`);
      }
    } else {
      const krName = await getAndroidKrTitle(appId);
      if (krName) {
        krTitle = krName;
        console.log(`  kr 이름 조회: "${title}" → "${krTitle}"`);
      }
    }
  }

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
      if (pair && pair.ios && pair.android) {
        const oppositeEntry = platform === 'ios' ? pair.android : pair.ios;
        if (oppositeEntry && oppositeEntry.appId !== appId) {
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
    const targetName = findExistingName(gameName, gamesData) || gameName;
    const existing = gamesData.games[targetName] || { appIds: {}, aliases: [], developer: '', icon: '', slug: generateSlug(targetName), platforms: [] };

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
      platforms
    };

    gamesData.games[targetName] = merged;
    appIdIndex.set(appId, targetName);
    appIdIndex.set(matched.appId, targetName);
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
  const targetName = findExistingName(gameName, gamesData) || gameName;
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
    platforms
  };
  appIdIndex.set(appId, targetName);
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
  const dateStr = process.argv[2] || new Date().toISOString().split('T')[0];
  const overrideFile = process.argv[3]; // 테스트 입력 파일 (옵션)

  console.log('=== 통합 게임 동기화 시작 ===');
  console.log('날짜:', dateStr);

  const gamesData = loadGames();
  const reviewQueue = loadReviewQueue();
  const appIdIndex = buildAppIdIndex(gamesData.games);

  console.log('기존 게임:', Object.keys(gamesData.games).length);

  // 히스토리 또는 테스트 파일에서 게임 추출
  const todayGames = extractTodayGames(dateStr, overrideFile);
  console.log('오늘 크롤링 게임:', todayGames.length, overrideFile ? `(from ${overrideFile})` : '');

  // 중복 제거 (같은 appId)
  const uniqueGames = [];
  const seenAppIds = new Set();
  for (const game of todayGames) {
    if (!seenAppIds.has(game.appId)) {
      seenAppIds.add(game.appId);
      uniqueGames.push(game);
    }
  }
  console.log('고유 게임:', uniqueGames.length);

  const stats = { existing: 0, steam: 0, matched: 0, single: 0, pending: 0 };
  // targetName 기준으로 마지막 상태만 저장
  const pendingMap = new Map();
  const globalPairs = buildGlobalPairs(uniqueGames);

  // 각 게임 처리
  for (let i = 0; i < uniqueGames.length; i++) {
    const game = uniqueGames[i];

    if ((i + 1) % 50 === 0) {
      console.log(`\n진행: ${i + 1}/${uniqueGames.length}`);
    }

    const pendingItem = await processGame(game, gamesData, appIdIndex, stats, globalPairs);

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
          status: existing.status === 'matched' || pendingItem.status === 'matched' ? 'matched' : existing.status
        });
      }
      stats.pending++;
    }

    // API 호출 간격
    if (game.platform !== 'steam') {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // pending 추가/업데이트 (targetName 단위 1건만 유지)
  const newPending = Array.from(pendingMap.values());
  const pendingIndexByTitle = new Map();
  for (let i = 0; i < reviewQueue.pending.length; i++) {
    const title = reviewQueue.pending[i]?.title;
    if (title) pendingIndexByTitle.set(title, i);
  }

  for (const item of newPending) {
    if (!item?.title) continue;

    const existingIndex = pendingIndexByTitle.get(item.title);
    if (existingIndex === undefined) {
      reviewQueue.pending.push(item);
      pendingIndexByTitle.set(item.title, reviewQueue.pending.length - 1);
      continue;
    }

    const existing = reviewQueue.pending[existingIndex] || {};
    const mergedAppIds = { ...(existing.appIds || {}), ...(item.appIds || {}) };
    const mergedSearchResults = [
      ...(existing.searchResults || []),
      ...(item.searchResults || [])
    ];
    const uniqueSearchResults = Array.from(
      new Map(
        mergedSearchResults.map(r => [String(r?.appId ?? ''), r])
      ).values()
    ).filter(r => r?.appId);

    reviewQueue.pending[existingIndex] = {
      ...existing,
      ...item,
      appIds: mergedAppIds,
      searchResults: uniqueSearchResults.slice(0, 3),
      status: existing.status === 'matched' || item.status === 'matched' ? 'matched' : (existing.status || item.status),
      addedAt: existing.addedAt || item.addedAt,
      developer: existing.developer || item.developer,
      icon: existing.icon || item.icon
    };
  }

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
  console.log('pending 추가:', stats.pending);
  console.log('최종 게임 수:', gamesData.totalGames);
  console.log('pending 큐:', reviewQueue.pending.length);
  console.log('\n저장 완료!');
}

main().catch(console.error);
