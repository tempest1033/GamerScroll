#!/usr/bin/env node
/**
 * 기존 히스토리 파일에 bestRanks 추가
 * - snapshots/rankings/ CSV 파일에서 일 최고순위 계산
 * - history/*.json 파일에 bestRanks 필드 추가
 */

const fs = require('fs');
const path = require('path');

const HISTORY_DIR = './history';
const SNAPSHOTS_DIR = './snapshots/rankings';

// CSV에서 최고순위 계산
function calculateBestRanksFromSnapshots(date) {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return null;

  const bestRanks = {};
  const platforms = ['ios', 'aos'];
  const categories = ['grossing', 'free'];
  const countries = ['kr', 'jp', 'us', 'cn', 'tw'];

  for (const platform of platforms) {
    for (const cat of categories) {
      for (const country of countries) {
        // 중국 안드로이드는 없음
        if (platform === 'aos' && country === 'cn') continue;

        const csvFile = `${SNAPSHOTS_DIR}/${date}_${platform}_${country}_${cat}.csv`;
        if (!fs.existsSync(csvFile)) continue;

        try {
          const content = fs.readFileSync(csvFile, 'utf8');
          const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('time,'));

          // appId별 최고순위 계산
          const appBestRanks = {};
          for (const line of lines) {
            const match = line.match(/^[\d:]+,(\d+),([^,]+),/);
            if (match) {
              const rank = parseInt(match[1]);
              const appId = match[2];
              if (!appBestRanks[appId] || rank < appBestRanks[appId]) {
                appBestRanks[appId] = rank;
              }
            }
          }

          const key = `${platform}_${country}_${cat}`;
          bestRanks[key] = appBestRanks;
        } catch (e) {
          // 파싱 실패 무시
        }
      }
    }
  }

  return Object.keys(bestRanks).length > 0 ? bestRanks : null;
}

// 메인 실행
function main() {
  console.log('\n🔄 기존 히스토리 파일 마이그레이션 시작\n');

  if (!fs.existsSync(HISTORY_DIR)) {
    console.log('❌ history 디렉토리가 없습니다.');
    return;
  }

  const historyFiles = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
    .sort();

  console.log(`📁 히스토리 파일: ${historyFiles.length}개\n`);

  let updated = 0;
  let skipped = 0;
  let noSnapshot = 0;

  for (const file of historyFiles) {
    const date = file.replace('.json', '');
    const historyPath = path.join(HISTORY_DIR, file);

    // bestRanks 계산
    const bestRanks = calculateBestRanksFromSnapshots(date);

    if (!bestRanks) {
      noSnapshot++;
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

      // 이미 bestRanks가 있고 동일하면 스킵
      if (data.bestRanks && JSON.stringify(data.bestRanks) === JSON.stringify(bestRanks)) {
        skipped++;
        continue;
      }

      data.bestRanks = bestRanks;
      fs.writeFileSync(historyPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ ${date} - 업데이트 완료`);
      updated++;
    } catch (e) {
      console.log(`❌ ${date} - 오류: ${e.message}`);
    }
  }

  console.log(`\n📊 결과:`);
  console.log(`   업데이트: ${updated}개`);
  console.log(`   스킵 (변경없음): ${skipped}개`);
  console.log(`   스냅샷 없음: ${noSnapshot}개`);
  console.log('\n✅ 마이그레이션 완료\n');
}

main();
