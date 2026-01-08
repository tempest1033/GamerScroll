/**
 * 중복 게임 통합 스크립트
 * - 1단계: 같은 appId를 가진 게임들을 하나로 병합
 * - 2단계: 같은 kr 이름(히스토리 + API 조회)을 가진 게임들을 하나로 병합
 */

const fs = require('fs');
const path = require('path');
const gplay = require('google-play-scraper');
const appStore = require('app-store-scraper');

const gamesPath = path.join(__dirname, '..', 'data', 'games.json');
const historyDir = path.join(__dirname, '..', 'history');

// 게임 데이터 로드
const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8').replace(/^\uFEFF/, ''));
const games = gamesData.games;

// 게임 병합 함수
function mergeGames(mainGame, otherGame, otherName, mainName) {
  if (!mainGame.aliases) mainGame.aliases = [];
  if (!mainGame.aliases.includes(otherName) && otherName !== mainName) {
    mainGame.aliases.push(otherName);
  }
  for (const alias of otherGame.aliases || []) {
    if (!mainGame.aliases.includes(alias) && alias !== mainName) {
      mainGame.aliases.push(alias);
    }
  }
  for (const [key, id] of Object.entries(otherGame.appIds || {})) {
    if (!mainGame.appIds[key]) {
      mainGame.appIds[key] = id;
    }
  }
  if (!mainGame.developer && otherGame.developer) {
    mainGame.developer = otherGame.developer;
  }
  if (!mainGame.icon && otherGame.icon) {
    mainGame.icon = otherGame.icon;
  }
}

// 메인 게임 선택 (한국어 > 영어 > 기타)
function selectMainGame(gameList) {
  return [...gameList].sort((a, b) => {
    const aKorean = /[가-힣]/.test(a.name);
    const bKorean = /[가-힣]/.test(b.name);
    if (aKorean && !bKorean) return -1;
    if (!aKorean && bKorean) return 1;
    const aEnglish = /^[a-zA-Z0-9\s:'\-&!?.]+$/.test(a.name);
    const bEnglish = /^[a-zA-Z0-9\s:'\-&!?.]+$/.test(b.name);
    if (aEnglish && !bEnglish) return -1;
    if (!aEnglish && bEnglish) return 1;
    return 0;
  });
}

// 이름 정규화
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[\s:\-·•&!?.,()（）【】「」『』\[\]'"''""]+/g, '')
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]/g, '');
}

// 히스토리에서 kr title 맵 생성
function buildKrTitleMapFromHistory() {
  const krTitleMap = new Map();
  const historyFiles = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort().reverse();

  for (const file of historyFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
    for (const cat of ['grossing', 'free']) {
      for (const platform of ['ios', 'android']) {
        const list = data.rankings?.[cat]?.kr?.[platform] || [];
        for (const game of list) {
          if (game.appId && game.title && !krTitleMap.has(game.appId)) {
            krTitleMap.set(game.appId, normalizeTitle(game.title));
          }
        }
      }
    }
  }
  return krTitleMap;
}

// API로 iOS kr 이름 조회
async function getIosKrTitle(appId) {
  try {
    const result = await appStore.app({ id: appId, country: 'kr' });
    return result?.title ? normalizeTitle(result.title) : null;
  } catch (e) {
    return null;
  }
}

// API로 Android kr 이름 조회
async function getAndroidKrTitle(appId) {
  try {
    const result = await gplay.app({ appId, country: 'kr', lang: 'ko' });
    return result?.title ? normalizeTitle(result.title) : null;
  } catch (e) {
    return null;
  }
}

// API로 kr 이름 추가 조회
async function fetchKrTitlesFromApi(games, existingMap) {
  const toFetch = [];

  for (const [name, info] of Object.entries(games)) {
    for (const [key, appId] of Object.entries(info.appIds || {})) {
      if (!existingMap.has(appId)) {
        if (key.startsWith('ios:')) {
          toFetch.push({ type: 'ios', appId });
        } else if (key.startsWith('android:')) {
          toFetch.push({ type: 'android', appId });
        }
      }
    }
  }

  const uniqueFetch = [...new Map(toFetch.map(t => [t.appId, t])).values()];
  console.log('API 조회 대상:', uniqueFetch.length, '개');

  let fetched = 0;
  for (let i = 0; i < uniqueFetch.length; i++) {
    const item = uniqueFetch[i];
    let title = null;

    if (item.type === 'ios') {
      title = await getIosKrTitle(item.appId);
    } else {
      title = await getAndroidKrTitle(item.appId);
    }

    if (title) {
      existingMap.set(item.appId, title);
      fetched++;
    }

    await new Promise(r => setTimeout(r, 100));

    if ((i + 1) % 100 === 0) {
      console.log(`  진행: ${i + 1}/${uniqueFetch.length} (조회됨: ${fetched})`);
    }
  }

  console.log('API로 조회된 kr 이름:', fetched, '개');
}

// 메인 실행
async function main() {
  console.log('=== 중복 게임 통합 시작 ===');
  console.log('기존 게임 수:', Object.keys(games).length);

  // ============================================
  // 1단계: appId 기반 통합
  // ============================================
  console.log('\n--- 1단계: appId 기반 통합 ---');

  const appIdToGames = new Map();
  for (const [name, info] of Object.entries(games)) {
    for (const [key, appId] of Object.entries(info.appIds || {})) {
      if (!appIdToGames.has(appId)) {
        appIdToGames.set(appId, []);
      }
      appIdToGames.get(appId).push({ name, game: info });
    }
  }

  let mergedByAppId = 0;
  const toRemove1 = new Set();
  const mergeLog = [];

  for (const [appId, gameList] of appIdToGames) {
    if (gameList.length <= 1) continue;
    const sorted = selectMainGame(gameList);
    const main = sorted[0];
    const others = sorted.slice(1);
    if (others.length === 0) continue;

    const mainGame = games[main.name];
    for (const other of others) {
      if (toRemove1.has(other.name) || other.name === main.name) continue;
      mergeGames(mainGame, games[other.name], other.name, main.name);
      toRemove1.add(other.name);
      mergedByAppId++;
    }

    const merged = others.map(o => o.name).filter(n => toRemove1.has(n));
    if (merged.length > 0) {
      mergeLog.push({ main: main.name, merged, type: 'appId', key: appId });
    }
  }

  for (const name of toRemove1) {
    delete games[name];
  }
  console.log('appId 통합:', mergedByAppId, '개');

  // ============================================
  // 2단계: kr 이름 기반 통합
  // ============================================
  console.log('\n--- 2단계: kr 이름 기반 통합 ---');

  const krTitleMap = buildKrTitleMapFromHistory();
  console.log('히스토리에서 조회:', krTitleMap.size, '개');

  await fetchKrTitlesFromApi(games, krTitleMap);
  console.log('총 kr title 맵:', krTitleMap.size, '개');

  // 각 게임의 kr 이름 찾기
  function getKrTitle(info) {
    for (const [key, appId] of Object.entries(info.appIds || {})) {
      if (krTitleMap.has(appId)) {
        return krTitleMap.get(appId);
      }
    }
    return null;
  }

  const krNameToGames = new Map();
  for (const [name, info] of Object.entries(games)) {
    const krTitle = getKrTitle(info);
    if (!krTitle) continue;
    if (!krNameToGames.has(krTitle)) {
      krNameToGames.set(krTitle, []);
    }
    krNameToGames.get(krTitle).push({ name, game: info });
  }

  let mergedByKrName = 0;
  const toRemove2 = new Set();

  for (const [krTitle, gameList] of krNameToGames) {
    if (gameList.length <= 1) continue;
    const sorted = selectMainGame(gameList);
    const main = sorted[0];
    const others = sorted.slice(1);
    if (others.length === 0) continue;

    const mainGame = games[main.name];
    for (const other of others) {
      if (toRemove2.has(other.name) || other.name === main.name) continue;
      mergeGames(mainGame, games[other.name], other.name, main.name);
      toRemove2.add(other.name);
      mergedByKrName++;
    }

    const merged = others.map(o => o.name).filter(n => toRemove2.has(n));
    if (merged.length > 0) {
      mergeLog.push({ main: main.name, merged, type: 'krTitle', key: krTitle });
    }
  }

  for (const name of toRemove2) {
    delete games[name];
  }
  console.log('kr이름 통합:', mergedByKrName, '개');

  // ============================================
  // 결과 저장
  // ============================================
  gamesData.totalGames = Object.keys(games).length;
  gamesData.lastMerged = new Date().toISOString().split('T')[0];
  const json = '\ufeff' + JSON.stringify(gamesData, null, 2).replace(/\n/g, '\r\n') + '\r\n';
  fs.writeFileSync(gamesPath, json, 'utf8');

  console.log('\n=== 결과 ===');
  console.log('총 통합:', mergedByAppId + mergedByKrName, '개');
  console.log('- appId 기반:', mergedByAppId);
  console.log('- kr이름 기반:', mergedByKrName);
  console.log('최종 게임 수:', Object.keys(games).length);

  const krMergeLogs = mergeLog.filter(l => l.type === 'krTitle');
  if (krMergeLogs.length > 0) {
    console.log('\n=== kr이름 통합 로그 ===');
    krMergeLogs.forEach(log => {
      console.log(`[${log.main}] (kr: ${log.key})`);
      console.log(`  병합: ${log.merged.join(', ')}`);
    });
  }

  console.log('\n저장 완료!');
}

main().catch(console.error);
