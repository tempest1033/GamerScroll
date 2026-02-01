/**
 * 월간 스팀 동시접속자(CCU) 분석 스크립트
 *
 * 사용법:
 *   node monthly-steam-analysis.js [YYYY-MM] [--top=N] [--exclude=appid1,appid2]
 *
 * 예시:
 *   node monthly-steam-analysis.js 2026-01
 *   node monthly-steam-analysis.js 2026-01 --top=20
 *   node monthly-steam-analysis.js 2026-01 --exclude=431960  # Wallpaper Engine 제외
 *
 * 출력:
 *   - reports/monthly/steam-{YYYY-MM}.json
 */

const fs = require('fs');
const path = require('path');

// 인자 파싱
const args = process.argv.slice(2);
const monthArg = args.find(a => /^\d{4}-\d{2}$/.test(a)) || (() => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
})();

const topN = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1]) || 10;
const excludeAppids = (args.find(a => a.startsWith('--exclude='))?.split('=')[1] || '431960').split(',');

console.log(`\n📊 스팀 월간 CCU 분석: ${monthArg}`);
console.log(`   TOP: ${topN} | 제외: ${excludeAppids.join(', ')}\n`);

const historyPath = path.join(__dirname, 'history');
const outputPath = path.join(__dirname, 'reports', 'monthly');

// 출력 디렉토리 생성
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

// 해당 월 파일들
const files = fs.readdirSync(historyPath)
  .filter(f => f.startsWith(monthArg) && f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error(`❌ ${monthArg} 데이터가 없습니다.`);
  process.exit(1);
}

console.log(`📂 ${files.length}일치 데이터 로드\n`);

// 게임별 CCU 집계
const gameStats = {};

files.forEach(file => {
  const date = file.replace('.json', '');
  try {
    const data = JSON.parse(fs.readFileSync(path.join(historyPath, file), 'utf8'));
    const mostPlayed = data.steam?.mostPlayed || [];

    mostPlayed.forEach(g => {
      if (excludeAppids.includes(g.appid)) return;

      if (!gameStats[g.appid]) {
        gameStats[g.appid] = {
          name: g.name,
          appid: g.appid,
          developer: g.developer || '',
          img: g.img || '',
          daily: {}
        };
      }
      gameStats[g.appid].daily[date] = {
        ccu: g.ccu,
        rank: g.rank
      };
      // 최신 이미지/개발사로 업데이트
      if (g.img) gameStats[g.appid].img = g.img;
      if (g.developer) gameStats[g.appid].developer = g.developer;
    });
  } catch (e) {
    console.warn(`  ⚠️ ${file} 파싱 실패:`, e.message);
  }
});

// 통계 계산 및 정렬
const ranked = Object.values(gameStats)
  .map(g => {
    const ccuList = Object.values(g.daily).map(d => d.ccu);
    const rankList = Object.values(g.daily).map(d => d.rank);
    return {
      name: g.name,
      appid: g.appid,
      developer: g.developer,
      img: g.img,
      avgCcu: Math.round(ccuList.reduce((a, b) => a + b, 0) / ccuList.length),
      maxCcu: Math.max(...ccuList),
      minCcu: Math.min(...ccuList),
      bestRank: Math.min(...rankList),
      worstRank: Math.max(...rankList),
      days: ccuList.length,
      daily: g.daily
    };
  })
  .sort((a, b) => b.avgCcu - a.avgCcu);

// TOP N 추출
const topGames = ranked.slice(0, topN).map((g, i) => ({
  rank: i + 1,
  ...g
}));

// 콘솔 출력
console.log(`🏆 TOP ${topN} 스팀 게임 (${monthArg} 평균 CCU):\n`);
topGames.forEach(g => {
  console.log(`${g.rank}. ${g.name} (${g.developer})`);
  console.log(`   평균: ${g.avgCcu.toLocaleString()} | 최고: ${g.maxCcu.toLocaleString()} | 최저: ${g.minCcu.toLocaleString()}`);
  console.log(`   순위: ${g.bestRank}위 ~ ${g.worstRank}위 | 집계: ${g.days}일\n`);
});

// JSON 저장
const output = {
  period: monthArg,
  platform: 'steam',
  metric: 'ccu',
  generatedAt: new Date().toISOString(),
  totalDays: files.length,
  excludedAppids: excludeAppids,
  rankings: topGames.map(g => ({
    rank: g.rank,
    name: g.name,
    appid: g.appid,
    developer: g.developer,
    img: g.img,
    avgCcu: g.avgCcu,
    maxCcu: g.maxCcu,
    minCcu: g.minCcu,
    bestRank: g.bestRank,
    worstRank: g.worstRank,
    days: g.days
  }))
};

const outputFile = path.join(outputPath, `steam-${monthArg}.json`);
fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(`\n✅ 저장 완료: ${outputFile}`);
