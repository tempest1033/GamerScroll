/**
 * 월간 모바일 순위 분석 스크립트
 *
 * 사용법:
 *   node monthly-mobile-analysis.js --month 2026-01 --country kr
 *   node monthly-mobile-analysis.js --month 2026-01 --country kr --min-days 15
 *
 * 출력:
 *   reports/monthly/mobile-2026-01-kr.json
 */

const fs = require('fs');
const path = require('path');

// 기본 설정
const HISTORY_DIR = path.join(__dirname, 'history');
const GAMES_FILE = path.join(__dirname, 'data', 'games.json');
const REPORTS_DIR = path.join(__dirname, 'reports', 'monthly');
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots', 'rankings');

// 인자 파싱
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    month: null,      // YYYY-MM 형식
    country: 'kr',    // kr, jp, us, cn, tw
    minDays: 15,      // 최소 출현 일수
    limit: 100        // TOP N
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--month' && args[i + 1]) {
      options.month = args[i + 1];
      i++;
    } else if (args[i] === '--country' && args[i + 1]) {
      options.country = args[i + 1];
      i++;
    } else if (args[i] === '--min-days' && args[i + 1]) {
      options.minDays = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!options.month) {
    // 기본값: 지난 달
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    options.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  return options;
}

// games.json 로드하여 appId → gameKey 매핑 생성
function loadGamesMapping() {
  let content = fs.readFileSync(GAMES_FILE, 'utf8');
  // BOM 제거
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  const gamesData = JSON.parse(content);
  const iosMap = {};    // iOS appId → gameKey
  const androidMap = {}; // Android packageName → gameKey

  for (const [gameKey, gameInfo] of Object.entries(gamesData.games)) {
    if (gameInfo.appIds) {
      if (gameInfo.appIds.ios) {
        iosMap[gameInfo.appIds.ios] = gameKey;
      }
      if (gameInfo.appIds.android) {
        androidMap[gameInfo.appIds.android] = gameKey;
      }
    }
  }

  return { iosMap, androidMap, gamesData: gamesData.games };
}

// 해당 월의 히스토리 파일 목록 가져오기
function getMonthHistoryFiles(month) {
  const [year, mon] = month.split('-');
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith(`${year}-${mon}`))
    .sort();

  return files.map(f => path.join(HISTORY_DIR, f));
}

// 30분별 CSV 스냅샷에서 월간 최고/최저 순위 계산
function getMinMaxFromSnapshots(month, country, iosMap, androidMap) {
  const [year, mon] = month.split('-');

  // CSV 파일 목록
  const csvFiles = fs.existsSync(SNAPSHOTS_DIR)
    ? fs.readdirSync(SNAPSHOTS_DIR).filter(f =>
        f.endsWith('.csv') &&
        f.startsWith(`${year}-${mon}`) &&
        f.includes(`_${country}_grossing`)
      )
    : [];

  const gameMinMax = {}; // gameKey → { ios: { min, max }, aos: { min, max } }

  for (const csvFile of csvFiles) {
    const platform = csvFile.includes('_ios_') ? 'ios' : 'aos';
    const appIdMap = platform === 'ios' ? iosMap : androidMap;

    const csvPath = path.join(SNAPSHOTS_DIR, csvFile);
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.trim().split('\n').slice(1); // 헤더 제외

    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 4) continue;

      const rank = parseInt(parts[1], 10);
      const appId = parts[2];
      let title = parts.slice(3).join(',').replace(/\r/g, '').trim().replace(/^"|"$/g, '');

      if (isNaN(rank)) continue;

      const gameKey = appIdMap[appId];
      if (!gameKey) continue;

      if (!gameMinMax[gameKey]) {
        gameMinMax[gameKey] = {
          ios: { min: null, max: null },
          aos: { min: null, max: null }
        };
      }

      const current = gameMinMax[gameKey][platform];
      if (current.min === null || rank < current.min) {
        current.min = rank;
      }
      if (current.max === null || rank > current.max) {
        current.max = rank;
      }
    }
  }

  return gameMinMax;
}

// 순위 데이터 집계
function aggregateRankings(historyFiles, country, iosMap, androidMap) {
  const gameStats = {}; // gameKey → { ios: { ranks: [], days: 0, bestRank: null }, aos: { ranks: [], days: 0, bestRank: null } }
  const unknownApps = { ios: new Set(), android: new Set() }; // 매핑 안된 앱들

  let totalDays = 0;

  // appId → gameKey 역매핑 (bestRanks용)
  const iosAppIdToKey = {};
  const androidAppIdToKey = {};
  for (const [appId, gameKey] of Object.entries(iosMap)) {
    iosAppIdToKey[appId] = gameKey;
  }
  for (const [appId, gameKey] of Object.entries(androidMap)) {
    androidAppIdToKey[appId] = gameKey;
  }

  for (const filePath of historyFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (!data.rankings || !data.rankings.grossing) continue;

      const countryData = data.rankings.grossing[country];
      if (!countryData) continue;

      totalDays++;
      const dateStr = path.basename(filePath, '.json');

      // bestRanks에서 일별 최고 순위 수집 (정확한 순위)
      const bestRanks = data.bestRanks || {};
      const iosBestRanks = bestRanks[`ios_${country}_grossing`] || {};
      const aosBestRanks = bestRanks[`aos_${country}_grossing`] || {};

      // iOS bestRanks 처리
      for (const [appId, rank] of Object.entries(iosBestRanks)) {
        const gameKey = iosAppIdToKey[appId];
        if (gameKey && typeof rank === 'number') {
          if (!gameStats[gameKey]) {
            gameStats[gameKey] = {
              ios: { ranks: [], days: 0, bestRank: null },
              aos: { ranks: [], days: 0, bestRank: null },
              title: '',
              developer: '',
              icon: ''
            };
          }
          // 일별 bestRank를 ranks에 추가 (평균 계산용)
          gameStats[gameKey].ios.ranks.push(rank);
          gameStats[gameKey].ios.days++;
          // 전체 최고 순위 갱신
          if (gameStats[gameKey].ios.bestRank === null || rank < gameStats[gameKey].ios.bestRank) {
            gameStats[gameKey].ios.bestRank = rank;
          }
        }
      }

      // Android bestRanks 처리
      for (const [appId, rank] of Object.entries(aosBestRanks)) {
        const gameKey = androidAppIdToKey[appId];
        if (gameKey && typeof rank === 'number') {
          if (!gameStats[gameKey]) {
            gameStats[gameKey] = {
              ios: { ranks: [], days: 0, bestRank: null },
              aos: { ranks: [], days: 0, bestRank: null },
              title: '',
              developer: '',
              icon: ''
            };
          }
          gameStats[gameKey].aos.ranks.push(rank);
          gameStats[gameKey].aos.days++;
          if (gameStats[gameKey].aos.bestRank === null || rank < gameStats[gameKey].aos.bestRank) {
            gameStats[gameKey].aos.bestRank = rank;
          }
        }
      }

      // rankings 배열에서 title, developer, icon 정보 수집
      if (countryData.ios && Array.isArray(countryData.ios)) {
        countryData.ios.forEach((app) => {
          const gameKey = iosMap[app.appId];
          if (gameKey && gameStats[gameKey]) {
            if (!gameStats[gameKey].title) gameStats[gameKey].title = app.title;
            if (!gameStats[gameKey].developer) gameStats[gameKey].developer = app.developer;
            if (!gameStats[gameKey].icon) gameStats[gameKey].icon = app.icon;
          } else if (!gameKey) {
            unknownApps.ios.add(JSON.stringify({ appId: app.appId, title: app.title }));
          }
        });
      }

      if (countryData.android && Array.isArray(countryData.android)) {
        countryData.android.forEach((app) => {
          const gameKey = androidMap[app.appId];
          if (gameKey && gameStats[gameKey]) {
            if (!gameStats[gameKey].title) gameStats[gameKey].title = app.title;
            if (!gameStats[gameKey].developer) gameStats[gameKey].developer = app.developer;
            if (!gameStats[gameKey].icon) gameStats[gameKey].icon = app.icon;
          } else if (!gameKey) {
            unknownApps.android.add(JSON.stringify({ appId: app.appId, title: app.title }));
          }
        });
      }
    } catch (err) {
      console.error(`Error reading ${filePath}:`, err.message);
    }
  }

  return { gameStats, totalDays, unknownApps };
}

// 평균 계산
function calculateAverage(ranks) {
  if (!ranks || ranks.length === 0) return null;
  return ranks.reduce((a, b) => a + b, 0) / ranks.length;
}

// 최고/최저 순위 계산
function calculateMinMax(ranks) {
  if (!ranks || ranks.length === 0) return { min: null, max: null };
  return {
    min: Math.min(...ranks),  // 최고 순위 (가장 낮은 숫자)
    max: Math.max(...ranks)   // 최저 순위 (가장 높은 숫자)
  };
}

// 총점 계산 (1위=100점, 100위=1점, OUT=0점)
function calculateTotalPoints(ranks) {
  if (!ranks || ranks.length === 0) return 0;
  return ranks.reduce((sum, rank) => {
    const points = Math.max(0, 101 - rank); // 100위 이하는 1점, 101위 이상은 0점
    return sum + points;
  }, 0);
}

// 결과 정리
function processResults(gameStats, gamesData, minDays, limit, totalDays, snapshotMinMax) {
  const results = [];
  const newEntries = []; // 15일 미만 신규/단기

  for (const [gameKey, stats] of Object.entries(gameStats)) {
    const gameInfo = gamesData[gameKey] || {};

    const iosAvg = calculateAverage(stats.ios.ranks);
    const aosAvg = calculateAverage(stats.aos.ranks);

    // 최고 순위: bestRank(bestRanks에서 수집) > snapshotMinMax(CSV) > calculateMinMax(일별 평균)
    const snapshotData = snapshotMinMax[gameKey] || { ios: { min: null, max: null }, aos: { min: null, max: null } };
    const calcIosMinMax = calculateMinMax(stats.ios.ranks);
    const calcAosMinMax = calculateMinMax(stats.aos.ranks);

    const iosMinMax = {
      min: stats.ios.bestRank !== null ? stats.ios.bestRank : (snapshotData.ios.min !== null ? snapshotData.ios.min : calcIosMinMax.min),
      max: snapshotData.ios.max !== null ? snapshotData.ios.max : calcIosMinMax.max
    };
    const aosMinMax = {
      min: stats.aos.bestRank !== null ? stats.aos.bestRank : (snapshotData.aos.min !== null ? snapshotData.aos.min : calcAosMinMax.min),
      max: snapshotData.aos.max !== null ? snapshotData.aos.max : calcAosMinMax.max
    };

    // 총점 계산 (1위=100점, 100위=1점)
    const iosPoints = calculateTotalPoints(stats.ios.ranks);
    const aosPoints = calculateTotalPoints(stats.aos.ranks);
    const totalPoints = iosPoints + aosPoints;

    // 통합 평균: 양쪽 있으면 평균, 한쪽만 있으면 그 값
    let combinedAvg = null;
    if (iosAvg !== null && aosAvg !== null) {
      combinedAvg = (iosAvg + aosAvg) / 2;
    } else if (iosAvg !== null) {
      combinedAvg = iosAvg;
    } else if (aosAvg !== null) {
      combinedAvg = aosAvg;
    }

    const totalDaysPresent = Math.max(stats.ios.days, stats.aos.days);

    const entry = {
      gameKey,
      slug: gameInfo.slug || gameKey,
      title: stats.title || gameKey,
      developer: stats.developer || gameInfo.developer || '',
      icon: stats.icon || gameInfo.icon || '',
      genre: gameInfo.genre || null,
      ios: {
        avgRank: iosAvg ? Math.round(iosAvg * 10) / 10 : null,
        minRank: iosMinMax.min,  // 최고 순위
        maxRank: iosMinMax.max,  // 최저 순위
        days: stats.ios.days,
        points: iosPoints
      },
      aos: {
        avgRank: aosAvg ? Math.round(aosAvg * 10) / 10 : null,
        minRank: aosMinMax.min,  // 최고 순위
        maxRank: aosMinMax.max,  // 최저 순위
        days: stats.aos.days,
        points: aosPoints
      },
      combinedAvg: combinedAvg ? Math.round(combinedAvg * 10) / 10 : null,
      totalPoints,  // 총점 (iOS + AOS)
      totalDays: totalDaysPresent
    };

    if (totalDaysPresent >= minDays) {
      results.push(entry);
    } else if (totalDaysPresent > 0) {
      newEntries.push(entry);
    }
  }

  // 총점 기준 정렬 (높을수록 좋음)
  results.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  newEntries.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

  return {
    regular: results.slice(0, limit),
    newEntries: newEntries.slice(0, 50) // 신규는 50개까지
  };
}

// 장르별 집계
function aggregateByGenre(results) {
  const genreStats = {};

  for (const game of results) {
    const genre = game.genre || 'unclassified';
    if (!genreStats[genre]) {
      genreStats[genre] = { count: 0, games: [], avgRanks: [] };
    }
    genreStats[genre].count++;
    genreStats[genre].games.push(game.title);
    if (game.combinedAvg) {
      genreStats[genre].avgRanks.push(game.combinedAvg);
    }
  }

  // 평균 순위대 계산
  for (const genre of Object.keys(genreStats)) {
    const ranks = genreStats[genre].avgRanks;
    if (ranks.length > 0) {
      genreStats[genre].avgPosition = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length * 10) / 10;
    }
  }

  return genreStats;
}

// 메인 함수
async function main() {
  const options = parseArgs();
  console.log(`\n📊 월간 모바일 순위 분석: ${options.month} (${options.country.toUpperCase()})\n`);

  // games.json 로드
  console.log('Loading games.json...');
  const { iosMap, androidMap, gamesData } = loadGamesMapping();
  console.log(`  iOS 매핑: ${Object.keys(iosMap).length}개`);
  console.log(`  Android 매핑: ${Object.keys(androidMap).length}개`);

  // 히스토리 파일 로드
  const historyFiles = getMonthHistoryFiles(options.month);
  console.log(`\nHistory files: ${historyFiles.length}개`);

  if (historyFiles.length === 0) {
    console.error('No history files found for', options.month);
    process.exit(1);
  }

  // 순위 집계
  console.log('Aggregating rankings...');
  const { gameStats, totalDays, unknownApps } = aggregateRankings(
    historyFiles, options.country, iosMap, androidMap
  );
  console.log(`  총 분석 일수: ${totalDays}일`);
  console.log(`  수집된 게임: ${Object.keys(gameStats).length}개`);

  // 30분별 스냅샷에서 min/max 계산
  console.log('Loading snapshot min/max...');
  const snapshotMinMax = getMinMaxFromSnapshots(options.month, options.country, iosMap, androidMap);
  console.log(`  스냅샷 데이터: ${Object.keys(snapshotMinMax).length}개 게임`);

  // 결과 처리
  const { regular, newEntries } = processResults(
    gameStats, gamesData, options.minDays, options.limit, totalDays, snapshotMinMax
  );

  // 장르 미분류 게임 찾기
  const unclassified = regular.filter(g => !g.genre);

  // 장르별 집계
  const genreStats = aggregateByGenre(regular);

  // 결과 객체 생성
  const report = {
    meta: {
      month: options.month,
      country: options.country,
      minDays: options.minDays,
      totalDays,
      generatedAt: new Date().toISOString()
    },
    summary: {
      totalGames: regular.length,
      unclassifiedCount: unclassified.length,
      newEntriesCount: newEntries.length
    },
    genreDistribution: genreStats,
    rankings: {
      regular,      // 정규 순위 (minDays 이상)
      newEntries    // 신규/단기 (minDays 미만)
    },
    unclassified: unclassified.map(g => ({
      gameKey: g.gameKey,
      title: g.title,
      combinedAvg: g.combinedAvg,
      ios: g.ios,
      aos: g.aos
    }))
  };

  // 결과 저장
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const outputFile = path.join(REPORTS_DIR, `mobile-${options.month}-${options.country}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n✅ 저장 완료: ${outputFile}`);

  // 콘솔 요약 출력
  console.log('\n' + '='.repeat(60));
  console.log(`📱 ${options.month} ${options.country.toUpperCase()} 모바일 매출순위 분석`);
  console.log('='.repeat(60));

  if (unclassified.length > 0) {
    console.log(`\n⚠️  장르 미분류 게임 (${unclassified.length}개):`);
    unclassified.slice(0, 15).forEach((g, i) => {
      const iosStr = g.ios.avgRank ? `iOS: ${g.ios.avgRank}위(${g.ios.days}일)` : 'iOS: -';
      const aosStr = g.aos.avgRank ? `AOS: ${g.aos.avgRank}위(${g.aos.days}일)` : 'AOS: -';
      console.log(`  ${i + 1}. ${g.title} (통합 ${g.combinedAvg}위) - ${iosStr}, ${aosStr}`);
    });
    if (unclassified.length > 15) {
      console.log(`  ... 외 ${unclassified.length - 15}개`);
    }
  }

  console.log(`\n📊 총점 TOP 20:`);
  regular.slice(0, 20).forEach((g, i) => {
    const iosStr = g.ios.minRank ? `iOS:${g.ios.minRank}~${g.ios.maxRank}(${g.ios.days}일)` : '-';
    const aosStr = g.aos.minRank ? `AOS:${g.aos.minRank}~${g.aos.maxRank}(${g.aos.days}일)` : '-';
    const genreStr = g.genre ? `[${g.genre}]` : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${g.title.substring(0, 20).padEnd(20)} ${String(g.totalPoints).padStart(5)}점 (${iosStr}/${aosStr}) ${genreStr}`);
  });

  console.log(`\n📈 장르별 분포 (TOP ${options.limit} 기준):`);
  const sortedGenres = Object.entries(genreStats)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [genre, stats] of sortedGenres) {
    const pct = Math.round(stats.count / regular.length * 100);
    const avgPos = stats.avgPosition ? `평균 ${stats.avgPosition}위` : '';
    console.log(`  ${genre}: ${stats.count}개 (${pct}%) ${avgPos}`);
  }

  if (newEntries.length > 0) {
    console.log(`\n🆕 신규/단기 진입 (${options.minDays}일 미만, ${newEntries.length}개):`);
    newEntries.slice(0, 10).forEach((g, i) => {
      const iosStr = g.ios.avgRank ? `iOS:${g.ios.avgRank}위(${g.ios.days}일)` : '-';
      const aosStr = g.aos.avgRank ? `AOS:${g.aos.avgRank}위(${g.aos.days}일)` : '-';
      console.log(`  ${i + 1}. ${g.title} - ${iosStr}, ${aosStr}`);
    });
  }

  console.log('\n');
}

main().catch(console.error);
