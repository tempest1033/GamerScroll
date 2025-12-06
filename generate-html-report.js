require('dotenv').config();
const fs = require('fs');

// 커맨드라인 인자 파싱
const isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');
// 멀티페이지 모드
const isMultiPageMode = process.argv.includes('--multi') || process.argv.includes('-m');

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';
const HISTORY_DIR = './history';
const SNAPSHOTS_DIR = './snapshots';
const REPORTS_DIR = './reports';
const WEEKLY_REPORTS_DIR = './reports/weekly';

// 퀵 모드가 아닐 때만 무거운 모듈 로드
let gplay, store, axios, cheerio, FirecrawlClient;
if (!isQuickMode) {
  gplay = require('google-play-scraper').default;
  store = require('app-store-scraper');
  axios = require('axios');
  cheerio = require('cheerio');
  FirecrawlClient = require('@mendable/firecrawl-js').FirecrawlClient;
}

// API 키
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

// 크롤러 모듈 import
const {
  fetchYouTubeVideos,
  fetchChzzkLives,
  fetchCommunityPosts,
  fetchNews,
  fetchSteamRankings,
  fetchUpcomingGames,
  fetchRankings,
  fetchMetacriticGames
} = require('./src/crawlers');

// HTML 템플릿 import
const { generateHTML } = require('./src/templates/html');

// 데일리 인사이트 import
const {
  generateDailyInsight,
  generateInsightHTML,
  loadHistory,
  getTodayDate,
  getYesterdayDate
} = require('./src/insights/daily');

// AI 인사이트 import
const { generateAIInsight } = require('./src/insights/ai-insight');

/**
 * 현재 KST 시간 기준 AM/PM 반환
 * @returns {string} 'AM' 또는 'PM'
 */
function getAmPm() {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const hour = kst.getUTCHours();
  return hour < 12 ? 'AM' : 'PM';
}

/**
 * AM/PM 기반으로 인사이트 JSON 파일 경로 찾기
 * @param {string} today - YYYY-MM-DD 형식 날짜
 * @returns {string|null} 존재하는 파일 경로 또는 null
 */
function findInsightJsonFile(today) {
  const currentAmPm = getAmPm();
  const otherAmPm = currentAmPm === 'AM' ? 'PM' : 'AM';

  // 어제 날짜 계산
  const todayDate = new Date(today + 'T00:00:00+09:00');
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  // 우선순위: 오늘 현재 시간대 > 오늘 다른 시간대 > 오늘 레거시 > 어제 PM > 어제 AM > 어제 레거시
  const candidates = [
    `${REPORTS_DIR}/${today}-${currentAmPm}.json`,
    `${REPORTS_DIR}/${today}-${otherAmPm}.json`,
    `${REPORTS_DIR}/${today}.json`,
    `${REPORTS_DIR}/${yesterday}-PM.json`,
    `${REPORTS_DIR}/${yesterday}-AM.json`,
    `${REPORTS_DIR}/${yesterday}.json`
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  return null;
}

/**
 * 가장 최근 주간 리포트 파일 찾기
 * @returns {string|null} 존재하는 파일 경로 또는 null
 */
function findLatestWeeklyReport() {
  if (!fs.existsSync(WEEKLY_REPORTS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(WEEKLY_REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // 최신 파일 먼저

  if (files.length === 0) {
    return null;
  }

  return `${WEEKLY_REPORTS_DIR}/${files[0]}`;
}

async function main() {
  let news, community, rankings, steam, youtube, chzzk, upcoming, metacritic;

  if (isQuickMode) {
    // 퀵 모드: 캐시에서 로드
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('❌ 캐시 파일이 없습니다. 먼저 일반 모드로 실행해주세요.');
      return;
    }
    console.log('⚡ 퀵 모드 - 캐시 데이터로 빠르게 HTML 생성\n');
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`📂 캐시 로드 완료 (생성: ${cache.timestamp})\n`);
    news = cache.news;
    community = cache.community;
    rankings = cache.rankings;
    steam = cache.steam;
    youtube = cache.youtube;
    chzzk = cache.chzzk;
    upcoming = cache.upcoming;
    metacritic = cache.metacritic;
  } else {
    // 일반 모드: 크롤링 실행
    console.log('📰 뉴스 크롤링 중 (인벤, 루리웹, 게임메카, 디스이즈게임)...\n');
    news = await fetchNews(axios, cheerio);
    const totalNews = news.inven.length + news.ruliweb.length + news.gamemeca.length + news.thisisgame.length;
    console.log(`\n  총 ${totalNews}개 뉴스 수집 완료`);

    console.log('\n💬 커뮤니티 인기글 수집 중 (루리웹, 아카라이브)...');
    community = await fetchCommunityPosts(axios, cheerio, FirecrawlClient, FIRECRAWL_API_KEY);

    console.log('\n🔄 5대 마켓 순위 데이터 수집 중 (200위까지)...\n');
    rankings = await fetchRankings(gplay, store);

    console.log('\n🎮 Steam 순위 데이터 수집 중...');
    steam = await fetchSteamRankings(axios, cheerio);

    console.log('\n📺 YouTube 인기 동영상 수집 중...');
    youtube = await fetchYouTubeVideos(axios, YOUTUBE_API_KEY);

    console.log('\n📡 치지직 라이브 수집 중...');
    chzzk = await fetchChzzkLives(axios);

    // 출시 예정 게임 수집
    upcoming = await fetchUpcomingGames(store, FirecrawlClient, FIRECRAWL_API_KEY);

    // 메타크리틱 연도별 평점
    console.log('\n🏆 메타크리틱 평점 수집 중...');
    metacritic = await fetchMetacriticGames(axios, cheerio);

    // 캐시 저장
    const cache = { timestamp: new Date().toISOString(), news, community, rankings, steam, youtube, chzzk, upcoming, metacritic };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('\n💾 캐시 저장 완료');

    // 일간 히스토리 저장 (하루에 한 번만)
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    const todayDate = getTodayDate();
    const historyFile = `${HISTORY_DIR}/${todayDate}.json`;
    if (!fs.existsSync(historyFile)) {
      fs.writeFileSync(historyFile, JSON.stringify(cache, null, 2), 'utf8');
      console.log(`📁 일간 스냅샷 저장: ${historyFile}`);
    }

    // 30분마다 CSV 스냅샷 저장
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const snapshotDate = kst.toISOString().split('T')[0];
    const hours = String(kst.getUTCHours()).padStart(2, '0');
    const minutes = String(Math.floor(kst.getUTCMinutes() / 30) * 30).padStart(2, '0');
    const snapshotTime = `${hours}:${minutes}`;

    // CSV 헤더
    const csvHeader = 'time,rank,id,title\n';

    // CSV 행 추가 함수 (중복 방지)
    const appendCsv = (filePath, rows) => {
      const isNew = !fs.existsSync(filePath);
      const newContent = rows.map(r => `${snapshotTime},${r.rank},${r.id},"${(r.title || '').replace(/"/g, '""')}"`).join('\n') + '\n';
      if (isNew) {
        fs.writeFileSync(filePath, csvHeader + newContent, 'utf8');
      } else {
        // 이미 해당 시간대 데이터가 있으면 스킵
        const existing = fs.readFileSync(filePath, 'utf8');
        if (existing.includes(`${snapshotTime},`)) {
          return;
        }
        fs.appendFileSync(filePath, newContent, 'utf8');
      }
    };

    // 디렉토리 생성
    const rankingsDir = `${SNAPSHOTS_DIR}/rankings`;
    const steamDir = `${SNAPSHOTS_DIR}/steam`;
    if (!fs.existsSync(rankingsDir)) fs.mkdirSync(rankingsDir, { recursive: true });
    if (!fs.existsSync(steamDir)) fs.mkdirSync(steamDir, { recursive: true });

    // iOS 매출 순위 (5개국)
    const iosCountries = ['kr', 'jp', 'us', 'cn', 'tw'];
    iosCountries.forEach(country => {
      const data = rankings?.grossing?.[country]?.ios || [];
      if (data.length > 0) {
        const rows = data.map((app, i) => ({ rank: i + 1, id: app.id || app.appId || '', title: app.title }));
        appendCsv(`${rankingsDir}/${snapshotDate}_ios_${country}_grossing.csv`, rows);
      }
    });

    // Android 매출 순위 (4개국, 중국 제외)
    const aosCountries = ['kr', 'jp', 'us', 'tw'];
    aosCountries.forEach(country => {
      const data = rankings?.grossing?.[country]?.android || [];
      if (data.length > 0) {
        const rows = data.map((app, i) => ({ rank: i + 1, id: app.appId || '', title: app.title }));
        appendCsv(`${rankingsDir}/${snapshotDate}_aos_${country}_grossing.csv`, rows);
      }
    });

    // Steam 동접
    if (steam?.mostPlayed?.length > 0) {
      const rows = steam.mostPlayed.map((g, i) => ({ rank: i + 1, id: g.appid || '', title: g.name }));
      appendCsv(`${steamDir}/${snapshotDate}_mostplayed.csv`, rows);
    }

    // Steam 판매
    if (steam?.topSellers?.length > 0) {
      const rows = steam.topSellers.map((g, i) => ({ rank: i + 1, id: g.appid || '', title: g.name }));
      appendCsv(`${steamDir}/${snapshotDate}_topsellers.csv`, rows);
    }

    console.log(`📸 CSV 스냅샷 저장: ${snapshotDate} ${snapshotTime}`);
  }

  console.log('\n📄 GAMERSCRAWL 일일 보고서 생성 중...');

  // 인사이트 데이터 생성
  const todayData = { news, community, rankings, steam, youtube, chzzk, upcoming };
  const yesterdayData = loadHistory(getYesterdayDate());
  const insight = generateDailyInsight(todayData, yesterdayData);

  // AI 인사이트 로드 (별도 스크립트로 생성됨)
  const today = getTodayDate();
  const insightJsonFile = findInsightJsonFile(today);

  if (insightJsonFile) {
    try {
      const savedInsight = JSON.parse(fs.readFileSync(insightJsonFile, 'utf8'));
      if (savedInsight.ai) {
        insight.ai = savedInsight.ai;
        insight.aiGeneratedAt = savedInsight.aiGeneratedAt;
        insight.stockMap = savedInsight.stockMap || {};
        insight.stockPrices = savedInsight.stockPrices || {};
        console.log(`📂 AI 인사이트 로드 완료 (${insightJsonFile.split('/').pop()})`);
      }
    } catch (e) {
      console.log('⚠️ AI 인사이트 로드 실패');
    }
  }

  // 주간 인사이트 로드 (별도 스크립트로 생성됨)
  let weeklyInsight = null;
  const weeklyReportFile = findLatestWeeklyReport();
  if (weeklyReportFile) {
    try {
      const weeklyReport = JSON.parse(fs.readFileSync(weeklyReportFile, 'utf8'));
      if (weeklyReport.ai) {
        weeklyInsight = weeklyReport;
        console.log(`📂 주간 인사이트 로드 완료 (${weeklyReportFile.split('/').pop()})`);
      }
    } catch (e) {
      console.log('⚠️ 주간 인사이트 로드 실패');
    }
  }

  // 멀티페이지 모드
  if (isMultiPageMode) {
    console.log('\n📄 멀티페이지 모드: 각 섹션별 HTML 생성');

    // 페이지별 템플릿 import
    const { generateIndexPage } = require('./src/templates/pages/index');
    const { generateInsightPage } = require('./src/templates/pages/insight');
    const { generateNewsPage } = require('./src/templates/pages/news');
    const { generateCommunityPage } = require('./src/templates/pages/community');
    const { generateYoutubePage } = require('./src/templates/pages/youtube');
    const { generateRankingsPage } = require('./src/templates/pages/rankings');
    const { generateSteamPage } = require('./src/templates/pages/steam');
    const { generateUpcomingPage } = require('./src/templates/pages/upcoming');
    const { generateMetacriticPage } = require('./src/templates/pages/metacritic');

    const data = { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, weeklyInsight };

    const pages = [
      { filename: 'index.html', generator: generateIndexPage },
      { filename: 'insight.html', generator: generateInsightPage },
      { filename: 'news.html', generator: generateNewsPage },
      { filename: 'community.html', generator: generateCommunityPage },
      { filename: 'youtube.html', generator: generateYoutubePage },
      { filename: 'rankings.html', generator: generateRankingsPage },
      { filename: 'steam.html', generator: generateSteamPage },
      { filename: 'upcoming.html', generator: generateUpcomingPage },
      { filename: 'metacritic.html', generator: generateMetacriticPage }
    ];

    for (const page of pages) {
      try {
        const html = page.generator(data);
        fs.writeFileSync(page.filename, html, 'utf8');
        console.log(`  ✅ ${page.filename}`);
      } catch (err) {
        console.error(`  ❌ ${page.filename}: ${err.message}`);
      }
    }

    // CSS 파일 복사
    fs.copyFileSync('./src/styles.css', './styles.css');
    console.log(`\n✅ 멀티페이지 생성 완료!`);
  } else {
    // 기존 단일 페이지 모드
    const html = generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming, insight, yesterdayData, metacritic, weeklyInsight);

    const filename = `index.html`;
    fs.writeFileSync(filename, html, 'utf8');

    // CSS 파일 복사 (src → root)
    fs.copyFileSync('./src/styles.css', './styles.css');

    console.log(`\n✅ 완료! 파일: ${filename}`);
  }

  // 데일리 인사이트 생성 (하루에 한 번)
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const reportFile = `${REPORTS_DIR}/${today}.html`;

  // 오늘 리포트가 없으면 생성
  if (!fs.existsSync(reportFile)) {
    console.log('\n📊 데일리 인사이트 생성 중...');

    const todayData = { news, community, rankings, steam, youtube, chzzk, upcoming };
    const yesterdayData = loadHistory(getYesterdayDate());

    const insight = generateDailyInsight(todayData, yesterdayData);

    // AI 인사이트 로드 (별도 스크립트로 생성됨)
    const savedJsonFile = findInsightJsonFile(today);
    if (savedJsonFile) {
      try {
        const savedInsight = JSON.parse(fs.readFileSync(savedJsonFile, 'utf8'));
        if (savedInsight.ai) {
          insight.ai = savedInsight.ai;
          insight.aiGeneratedAt = savedInsight.aiGeneratedAt;
        }
      } catch (e) {
        console.warn(`⚠️ 인사이트 JSON 파싱 실패 (${savedJsonFile}):`, e.message);
      }
    }

    const insightHTML = generateInsightHTML(insight);
    fs.writeFileSync(reportFile, insightHTML, 'utf8');
    console.log(`📈 데일리 인사이트 저장: ${reportFile}`);

    // 인사이트 JSON도 저장 - 기존 AI 데이터 보존
    const amPm = getAmPm();
    const insightJsonFile = `${REPORTS_DIR}/${today}-${amPm}.json`;

    // 기존 파일에 AI 데이터가 있으면 보존
    if (fs.existsSync(insightJsonFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(insightJsonFile, 'utf8'));
        if (existing.ai) {
          insight.ai = existing.ai;
          insight.aiGeneratedAt = existing.aiGeneratedAt;
          insight.stockMap = existing.stockMap;
          insight.stockPrices = existing.stockPrices;
        }
      } catch (e) {
        // 파싱 실패시 무시
      }
    }
    fs.writeFileSync(insightJsonFile, JSON.stringify(insight, null, 2), 'utf8');
  }
}

main().catch(console.error);
