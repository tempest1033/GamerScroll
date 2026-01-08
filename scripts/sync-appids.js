/**
 * games.json 자동 동기화
 * - 지역별 appId 자동 수집
 * - 지역별 이름 variants를 aliases에 자동 추가
 */

const fs = require('fs');
const path = require('path');

const gamesPath = path.join(__dirname, '..', 'data', 'games.json');
const historyDir = path.join(__dirname, '..', 'history');

function loadLatestHistory() {
  const files = fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.json') && !f.includes('mentions'))
    .sort()
    .reverse();

  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(historyDir, files[0]), 'utf8'));
}

console.log('🔄 games.json 동기화 시작...\n');

const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf8').replace(/^\uFEFF/, ''));
const history = loadLatestHistory();

if (!history) {
  console.log('❌ 히스토리 파일 없음');
  process.exit(1);
}

const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
const platforms = ['ios', 'android'];

// 1. appId → { names: Set, regions: { platform:region: appId } } 매핑
const appIdToData = new Map();

for (const region of regions) {
  for (const platform of platforms) {
    const items = history.rankings?.grossing?.[region]?.[platform] || [];
    items.forEach((item) => {
      if (!item.title || !item.appId) return;

      const appId = item.appId;
      if (!appIdToData.has(appId)) {
        appIdToData.set(appId, { names: new Set(), regions: {} });
      }

      const data = appIdToData.get(appId);
      data.names.add(item.title);
      data.regions[`${platform}:${region}`] = appId;
    });
  }
}

console.log(`📊 히스토리에서 ${appIdToData.size}개 appId 발견\n`);

// 2. games.json의 appId로 매칭하여 업데이트
let aliasCount = 0;
let regionCount = 0;

for (const [gameName, gameInfo] of Object.entries(gamesData.games)) {
  const currentAliases = new Set(gameInfo.aliases || []);
  currentAliases.add(gameName); // 게임 이름도 포함

  // 모든 appId 수집 (기본 + 지역별)
  const allAppIds = new Set();
  for (const [key, appId] of Object.entries(gameInfo.appIds || {})) {
    allAppIds.add(appId);
  }

  // 각 appId에서 이름과 지역 appId 수집
  for (const appId of allAppIds) {
    const data = appIdToData.get(appId);
    if (!data) continue;

    // 이름 variants를 aliases에 추가
    for (const name of data.names) {
      if (!currentAliases.has(name)) {
        if (!gameInfo.aliases) gameInfo.aliases = [];
        gameInfo.aliases.push(name);
        currentAliases.add(name);
        aliasCount++;
        console.log(`📝 별칭 추가: ${gameName} ← "${name}"`);
      }
    }
  }

  // 현재 aliases에 있는 이름으로도 appId 역탐색
  for (const alias of currentAliases) {
    // 이 이름을 가진 appId 찾기
    for (const [appId, data] of appIdToData) {
      if (data.names.has(alias)) {
        // 지역별 appId 추가
        for (const [regionKey, regionAppId] of Object.entries(data.regions)) {
          const [platform] = regionKey.split(':');
          const baseAppId = gameInfo.appIds?.[platform];

          if (baseAppId && baseAppId !== regionAppId) {
            if (!gameInfo.appIds[regionKey]) {
              gameInfo.appIds[regionKey] = regionAppId;
              regionCount++;
              console.log(`➕ 지역 appId: ${gameName} [${regionKey}] = ${regionAppId}`);
            }
          }
        }
      }
    }
  }
}

// 3. 저장
const json = '\ufeff' + JSON.stringify(gamesData, null, 2).replace(/\n/g, '\r\n') + '\r\n';
fs.writeFileSync(gamesPath, json, 'utf8');

console.log('\n' + '='.repeat(50));
console.log(`✅ 완료!`);
console.log(`   - 별칭 추가: ${aliasCount}개`);
console.log(`   - 지역별 appId 추가: ${regionCount}개`);
