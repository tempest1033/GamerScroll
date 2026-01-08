const fs = require('fs');
const path = require('path');
const gplay = require('google-play-scraper').default;
const store = require('app-store-scraper');

const dataDir = path.join(__dirname, '../data');

// 데이터 로드
function loadGames() {
  const filePath = path.join(dataDir, 'games.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function loadReviewQueue() {
  const filePath = path.join(dataDir, 'review-queue.json');
  if (!fs.existsSync(filePath)) {
    return { pending: [], approved: [], rejected: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function saveGames(data) {
  const json = '\ufeff' + JSON.stringify(data, null, 2).replace(/\n/g, '\r\n') + '\r\n';
  fs.writeFileSync(
    path.join(dataDir, 'games.json'),
    json,
    'utf8'
  );
}

function saveReviewQueue(data) {
  const json = '\ufeff' + JSON.stringify(data, null, 2).replace(/\n/g, '\r\n') + '\r\n';
  fs.writeFileSync(
    path.join(dataDir, 'review-queue.json'),
    json,
    'utf8'
  );
}

// 플랫폼 판단 (iOS만 있는지, Android만 있는지)
function getPlatformStatus(appIds) {
  const platforms = Object.keys(appIds).map(k => k.split(':')[0]);
  const hasIos = platforms.includes('ios');
  const hasAndroid = platforms.includes('android');
  const hasSteam = platforms.includes('steam');

  if (hasSteam) return 'steam'; // Steam은 처리 안 함
  if (hasIos && hasAndroid) return 'both';
  if (hasIos) return 'ios-only';
  if (hasAndroid) return 'android-only';
  return 'unknown';
}

// 한국어 이름인지 확인 (한글 포함 여부)
function isKoreanName(name) {
  return /[가-힣]/.test(name);
}

// 이름 정규화 (완전 일치 비교용) - 특수문자, 괄호 등 제거
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[()（）[\]【】「」『』]/g, ' ') // 괄호류 제거
    .replace(/[:\-–—·•]/g, ' ')              // 구분자 통일
    .replace(/\s+/g, ' ')
    .trim();
}

// 이름 완전 일치 확인 (부분 일치도 체크)
function isNameMatch(original, found) {
  const a = normalizeName(original);
  const b = normalizeName(found);

  // 완전 일치
  if (a === b) return { match: true, type: 'exact' };

  // 한쪽이 다른 쪽을 포함 (예: "소녀총사 키우기" vs "소녀총사 키우기 : 도트 방치형 RPG")
  if (a.includes(b) || b.includes(a)) return { match: true, type: 'partial' };

  return { match: false, type: 'none' };
}

// Android 검색 (iOS 게임의 반대 플랫폼)
async function searchAndroid(title) {
  try {
    const results = await gplay.search({
      term: title,
      country: 'kr',
      lang: 'ko',
      num: 5
    });
    return results.map(r => ({
      appId: r.appId,
      title: r.title,
      developer: r.developer
    }));
  } catch (err) {
    console.log(`  Android 검색 실패: ${err.message}`);
    return [];
  }
}

// appId 기반 중복 통합
function mergeByAppId(gamesData) {
  const games = gamesData.games;
  const appIdMap = new Map(); // appId -> [gameName1, gameName2, ...]

  // 모든 appId 수집
  for (const [name, data] of Object.entries(games)) {
    for (const [key, appId] of Object.entries(data.appIds || {})) {
      if (!appIdMap.has(appId)) {
        appIdMap.set(appId, []);
      }
      appIdMap.get(appId).push(name);
    }
  }

  // 같은 appId를 가진 게임들 통합
  let merged = 0;
  let deleted = 0;
  const processed = new Set();

  for (const [appId, gameNames] of appIdMap) {
    if (gameNames.length < 2) continue;

    // 이미 처리된 게임 제외
    const activeGames = gameNames.filter(n => !processed.has(n) && games[n]);
    if (activeGames.length < 2) continue;

    // 메인 게임 선택 (한국어 이름 우선)
    const sorted = activeGames.sort((a, b) => {
      const aKorean = /[가-힣]/.test(a);
      const bKorean = /[가-힣]/.test(b);
      if (aKorean && !bKorean) return -1;
      if (!aKorean && bKorean) return 1;
      return 0;
    });

    const mainName = sorted[0];
    const mainGame = games[mainName];

    // 다른 게임들을 메인에 병합
    for (let i = 1; i < sorted.length; i++) {
      const otherName = sorted[i];
      const otherGame = games[otherName];
      if (!otherGame) continue;

      console.log(`  통합: "${otherName}" → "${mainName}"`);

      // appIds 병합
      for (const [key, id] of Object.entries(otherGame.appIds || {})) {
        if (!mainGame.appIds[key]) {
          mainGame.appIds[key] = id;
        }
      }

      // aliases 병합
      if (!mainGame.aliases) mainGame.aliases = [];
      if (!mainGame.aliases.includes(otherName)) {
        mainGame.aliases.push(otherName);
      }
      for (const alias of otherGame.aliases || []) {
        if (!mainGame.aliases.includes(alias) && alias !== mainName) {
          mainGame.aliases.push(alias);
        }
      }

      // 기타 정보 병합
      if (!mainGame.developer && otherGame.developer) {
        mainGame.developer = otherGame.developer;
      }
      if (!mainGame.icon && otherGame.icon) {
        mainGame.icon = otherGame.icon;
      }

      // 중복 게임 삭제
      delete games[otherName];
      processed.add(otherName);
      deleted++;
    }

    processed.add(mainName);
    if (sorted.length > 1) merged++;
  }

  return { merged, deleted };
}

// iOS 검색 (Android 게임의 반대 플랫폼)
async function searchIos(title) {
  try {
    const results = await store.search({
      term: title,
      country: 'kr',
      num: 5
    });
    return results.map(r => ({
      appId: r.id.toString(),
      title: r.title,
      developer: r.developer
    }));
  } catch (err) {
    console.log(`  iOS 검색 실패: ${err.message}`);
    return [];
  }
}

// appId로 iOS kr 마켓에서 한국어 이름 조회
async function getIosKrTitle(appId) {
  try {
    const result = await store.app({ id: appId, country: 'kr' });
    return result?.title || null;
  } catch (err) {
    return null;
  }
}

// appId로 Android kr 마켓에서 한국어 이름 조회
async function getAndroidKrTitle(appId) {
  try {
    const result = await gplay.app({ appId, country: 'kr', lang: 'ko' });
    return result?.title || null;
  } catch (err) {
    return null;
  }
}

// item.appIds에서 한국어 이름 조회 (현재 플랫폼 기준)
async function getKrTitleFromItem(item, status) {
  // 현재 플랫폼의 appId로 kr 마켓에서 한국어 이름 조회
  for (const [key, appId] of Object.entries(item.appIds)) {
    if (status === 'ios-only' && (key === 'ios' || key.startsWith('ios:'))) {
      const krTitle = await getIosKrTitle(appId);
      if (krTitle) return krTitle;
    } else if (status === 'android-only' && (key === 'android' || key.startsWith('android:'))) {
      const krTitle = await getAndroidKrTitle(appId);
      if (krTitle) return krTitle;
    }
  }
  return null;
}

// 메인 처리
async function processReviewQueue(limit = 0) {
  console.log('=== Review Queue 처리 시작 ===\n');

  const gamesData = loadGames();
  const reviewQueue = loadReviewQueue();

  const totalPending = reviewQueue.pending.length;
  const itemsToProcess = limit > 0 ? reviewQueue.pending.slice(0, limit) : reviewQueue.pending;
  const remainingItems = limit > 0 ? reviewQueue.pending.slice(limit) : [];

  console.log(`pending 항목: ${totalPending}개`);
  if (limit > 0) console.log(`처리 대상: ${itemsToProcess.length}개 (limit: ${limit})\n`);
  else console.log();

  const newPending = [];
  let autoMerged = 0;      // appId 실제 추가
  let alreadyComplete = 0; // 이름 일치했지만 이미 있음
  let skipped = 0;         // 양쪽 다 있거나 Steam
  let noMatch = 0;         // 이름 불일치

  for (const item of itemsToProcess) {
    console.log(`처리 중: ${item.title}`);

    const status = getPlatformStatus(item.appIds);
    console.log(`  플랫폼 상태: ${status}`);

    // Steam이거나 이미 양쪽 있으면 스킵
    if (status === 'steam') {
      console.log(`  → 스킵 (Steam)`);
      skipped++;
      newPending.push(item);
      continue;
    }

    if (status === 'both') {
      console.log(`  → 스킵 (이미 양쪽 존재)`);
      item.status = 'matched';
      skipped++;
      newPending.push(item);
      continue;
    }

    // 현재 플랫폼에서 한국어 이름 조회
    const krTitle = await getKrTitleFromItem(item, status);
    const searchTitle = krTitle || item.title;

    if (krTitle && krTitle !== item.title) {
      console.log(`  kr 이름 조회: "${krTitle}"`);
    }

    // 반대 플랫폼 검색 (한국어 이름으로)
    let searchResults = [];
    if (status === 'ios-only') {
      searchResults = await searchAndroid(searchTitle);
    } else if (status === 'android-only') {
      searchResults = await searchIos(searchTitle);
    }

    if (searchResults.length === 0) {
      console.log(`  → 검색 결과 없음, pending 유지`);
      newPending.push(item);
      noMatch++;
      continue;
    }

    // 이름 일치 확인 (상위 3개만)
    // krTitle과 item.title 둘 다로 비교
    let matched = null;
    let matchType = null;

    for (const result of searchResults.slice(0, 3)) {
      // 1. 검색에 사용한 이름(searchTitle)과 비교
      const match1 = isNameMatch(searchTitle, result.title);
      // 2. 원본 이름(item.title)과도 비교
      const match2 = isNameMatch(item.title, result.title);

      // 완전 일치 → 바로 채택
      if ((match1.match && match1.type === 'exact') || (match2.match && match2.type === 'exact')) {
        matched = result;
        matchType = 'exact';
        console.log(`  → 이름 완전 일치: "${result.title}" (${result.appId})`);
        break;
      }

      // 부분 일치는 오병합 위험이 높아 제거됨 (exact만 허용)
    }

    if (matched) {
      // games.json에서 appId로 게임 찾기 (이름이 다를 수 있음)
      let gameEntry = null;
      let gameName = null;

      for (const [name, data] of Object.entries(gamesData.games)) {
        for (const [key, appId] of Object.entries(data.appIds || {})) {
          // item.appIds에 있는 appId와 매칭
          if (Object.values(item.appIds).includes(appId)) {
            gameEntry = data;
            gameName = name;
            break;
          }
        }
        if (gameEntry) break;
      }

      // games.json에 없으면 한국어 이름 우선으로 새로 생성
      if (!gameEntry) {
        // 한국어 이름 우선순위: matched.title > krTitle > item.title
        if (isKoreanName(matched.title)) {
          gameName = matched.title;
        } else if (krTitle && isKoreanName(krTitle)) {
          gameName = krTitle;
        } else {
          gameName = item.title;
        }
        gameEntry = {
          appIds: { ...item.appIds },
          aliases: [],
          developer: item.developer || '',
          icon: item.icon || ''
        };
        // 원래 이름이 다르면 aliases에 추가
        if (item.title !== gameName && !gameEntry.aliases.includes(item.title)) {
          gameEntry.aliases.push(item.title);
        }
        gamesData.games[gameName] = gameEntry;
        console.log(`  → games.json에 새 게임 생성: "${gameName}"`);
      }
      if (gameEntry) {
        const newPlatform = status === 'ios-only' ? 'android' : 'ios';
        const newKey = newPlatform;

        if (!gameEntry.appIds[newKey]) {
          gameEntry.appIds[newKey] = matched.appId;
          console.log(`  → games.json 업데이트: ${newKey}=${matched.appId}`);
          autoMerged++;
        } else {
          alreadyComplete++;
        }

        if (!item.appIds[newKey]) {
          item.appIds[newKey] = matched.appId;
        }

        item.status = 'matched';
        item.searchResults = searchResults.slice(0, 3).map(r => ({ title: r.title, appId: r.appId }));
        item.lastSearched = new Date().toISOString();

        // 한국어 이름이면 게임명 업데이트 (영어→한국어)
        if (matched.title !== gameName && isKoreanName(matched.title) && !isKoreanName(gameName)) {
          console.log(`  → 이름 변경: "${gameName}" → "${matched.title}"`);
          // 기존 이름을 aliases로 이동
          if (!gameEntry.aliases.includes(gameName)) {
            gameEntry.aliases.push(gameName);
          }
          if (!gameEntry.aliases.includes(item.title) && item.title !== gameName && item.title !== matched.title) {
            gameEntry.aliases.push(item.title);
          }
          // 새 이름으로 게임 재등록
          delete gamesData.games[gameName];
          gamesData.games[matched.title] = gameEntry;
        }
      }
      // pending 유지 (사람이 최종 확인 후 제거)
      newPending.push(item);
    } else {
      // 부분 일치나 매칭 실패 → pending 유지 (수동 처리 필요)
      console.log(`  → 이름 불일치, pending 유지`);
      console.log(`    검색 결과: ${searchResults.slice(0, 3).map(r => r.title).join(', ')}`);

      // 검색 결과를 item에 첨부 (나중에 수동 처리 시 참고용)
      item.searchResults = searchResults.slice(0, 5).map(r => ({ title: r.title, appId: r.appId }));
      item.lastSearched = new Date().toISOString();
      newPending.push(item);
      noMatch++;
    }

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 500));
  }

  // 저장 (처리 안 한 항목 + 새로 pending된 항목)
  reviewQueue.pending = [...newPending, ...remainingItems];
  saveReviewQueue(reviewQueue);
  saveGames(gamesData);

  console.log('\n=== 1단계 결과 (반대 플랫폼 검색) ===');
  console.log(`자동 통합 (appId 추가): ${autoMerged}개`);
  console.log(`이름 일치 (이미 완료): ${alreadyComplete}개`);
  console.log(`스킵 (Steam/양쪽 있음): ${skipped}개`);
  console.log(`pending 유지 (불일치): ${noMatch}개`);
  console.log(`총 처리: ${autoMerged + alreadyComplete + skipped + noMatch}개`);
  console.log(`남은 pending: ${reviewQueue.pending.length}개`);

  // 2단계: 같은 appId 가진 게임 통합
  console.log('\n=== 2단계: appId 기반 중복 통합 ===');
  const mergeResult = mergeByAppId(gamesData);
  console.log(`통합된 게임: ${mergeResult.merged}개`);
  console.log(`삭제된 중복: ${mergeResult.deleted}개`);

  // 최종 저장
  gamesData.totalGames = Object.keys(gamesData.games).length;
  saveGames(gamesData);
  console.log(`\n최종 게임 수: ${gamesData.totalGames}개`);
}

// 실행 (옵션: node process-review-queue.js [limit])
const limit = parseInt(process.argv[2]) || 0; // 0 = 전체
processReviewQueue(limit).catch(console.error);
