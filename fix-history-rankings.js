/**
 * 히스토리 JSON을 30분별 CSV 데이터 기준 최고 순위로 재정리
 *
 * 사용법:
 *   node fix-history-rankings.js --month 2026-01
 *   node fix-history-rankings.js --all
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HISTORY_DIR = path.join(__dirname, 'history');
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots', 'rankings');

const COUNTRIES = ['kr', 'jp', 'us', 'tw', 'cn'];
const PLATFORMS = ['ios', 'aos'];

// CSV 파일 파싱 (30분별 스냅샷)
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');

  // 헤더 건너뛰기
  const dataLines = lines.slice(1);

  const records = [];
  for (const line of dataLines) {
    // CSV 파싱: time,rank,id,"title" 또는 time,rank,id,title
    const parts = line.split(',');
    if (parts.length >= 4) {
      const time = parts[0];
      const rank = parseInt(parts[1], 10);
      const appId = parts[2];
      // title은 나머지 부분 합치기 (쉼표 포함된 제목 처리)
      let title = parts.slice(3).join(',');
      // \r 제거 후 따옴표 제거 (Windows 줄바꿈 대응)
      title = title.replace(/\r/g, '').trim().replace(/^"|"$/g, '');

      if (!isNaN(rank)) {
        records.push({ time, rank, appId, title });
      }
    }
  }

  return records;
}

// 하루의 모든 30분 스냅샷에서 게임별 최고 순위 계산
function getBestRanksForDay(date, country, platform) {
  // aos -> android 매핑 (CSV 파일명은 aos 사용)
  const csvPlatform = platform === 'android' ? 'aos' : platform;
  const pattern = `${date}_${csvPlatform}_${country}_grossing.csv`;
  const csvPath = path.join(SNAPSHOTS_DIR, pattern);

  const records = parseCSV(csvPath);
  if (records.length === 0) return null;

  // 게임별 최고 순위 집계
  const bestRanks = {}; // appId -> { rank, title, ... }

  for (const record of records) {
    const key = record.appId || record.title; // appId 없으면 title 사용

    if (!bestRanks[key] || record.rank < bestRanks[key].rank) {
      bestRanks[key] = {
        rank: record.rank,
        title: record.title,
        appId: record.appId
      };
    }
  }

  // 최고 순위 기준 정렬
  const sorted = Object.values(bestRanks)
    .sort((a, b) => a.rank - b.rank);

  return sorted;
}

// 히스토리 파일 하나 수정
function fixHistoryFile(historyPath) {
  const filename = path.basename(historyPath, '.json');
  const date = filename; // 2026-01-23 형식

  console.log(`Processing ${date}...`);

  // 기존 히스토리 로드
  let history;
  try {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch (err) {
    console.error(`  Error reading ${historyPath}:`, err.message);
    return false;
  }

  if (!history.rankings) {
    history.rankings = {};
  }
  if (!history.rankings.grossing) {
    history.rankings.grossing = {};
  }

  let updated = false;

  for (const country of COUNTRIES) {
    if (!history.rankings.grossing[country]) {
      history.rankings.grossing[country] = {};
    }

    for (const platform of PLATFORMS) {
      const jsonPlatform = platform === 'aos' ? 'android' : platform;
      const bestRanks = getBestRanksForDay(date, country, platform);

      if (bestRanks && bestRanks.length > 0) {
        // 기존 데이터에서 추가 정보 (developer, icon) 가져오기
        const existingData = history.rankings.grossing[country]?.[jsonPlatform] || [];
        const existingMap = {};
        for (const app of existingData) {
          if (app.appId) existingMap[app.appId] = app;
          if (app.title) existingMap[app.title] = app;
        }

        // 최고 순위 기준으로 새 배열 생성
        const newRankings = bestRanks.map(item => {
          const existing = existingMap[item.appId] || existingMap[item.title] || {};
          return {
            title: item.title,
            developer: existing.developer || '',
            icon: existing.icon || '',
            appId: item.appId || existing.appId || ''
          };
        });

        history.rankings.grossing[country][jsonPlatform] = newRankings;
        updated = true;
      }
    }
  }

  if (updated) {
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    console.log(`  ✅ Updated ${date}`);
  } else {
    console.log(`  ⚠️ No CSV data found for ${date}`);
  }

  return updated;
}

// 메인 함수
async function main() {
  const args = process.argv.slice(2);
  let targetMonth = null;
  let processAll = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--month' && args[i + 1]) {
      targetMonth = args[i + 1];
      i++;
    } else if (args[i] === '--all') {
      processAll = true;
    }
  }

  // 히스토리 파일 목록
  let historyFiles = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  if (targetMonth) {
    historyFiles = historyFiles.filter(f => f.startsWith(targetMonth));
  }

  console.log(`\n🔧 히스토리 파일 수정 (최고 순위 기준)\n`);
  console.log(`대상 파일: ${historyFiles.length}개\n`);

  let updatedCount = 0;

  for (const file of historyFiles) {
    const filePath = path.join(HISTORY_DIR, file);
    if (fixHistoryFile(filePath)) {
      updatedCount++;
    }
  }

  console.log(`\n✅ 완료: ${updatedCount}개 파일 수정됨\n`);
}

main().catch(console.error);
