require('dotenv').config();
const fs = require('fs');

// 커맨드라인 인자 파싱
const isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';
const HISTORY_DIR = './history';
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

  // 우선순위: 현재 시간대 > 다른 시간대 > 레거시
  const candidates = [
    `${REPORTS_DIR}/${today}-${currentAmPm}.json`,
    `${REPORTS_DIR}/${today}-${otherAmPm}.json`,
    `${REPORTS_DIR}/${today}.json`
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

  const html = generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming, insight, yesterdayData, metacritic, weeklyInsight);

  const filename = `index.html`;
  fs.writeFileSync(filename, html, 'utf8');

  // CSS 파일 복사 (src → root)
  fs.copyFileSync('./src/styles.css', './styles.css');

  console.log(`\n✅ 완료! 파일: ${filename}`);

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
      } catch (e) {}
    }

    const insightHTML = generateInsightHTML(insight);
    fs.writeFileSync(reportFile, insightHTML, 'utf8');
    console.log(`📈 데일리 인사이트 저장: ${reportFile}`);

    // 인사이트 JSON도 저장 (AI 제외한 분석 데이터) - AM/PM 구분
    const amPm = getAmPm();
    const insightJsonFile = `${REPORTS_DIR}/${today}-${amPm}.json`;
    fs.writeFileSync(insightJsonFile, JSON.stringify(insight, null, 2), 'utf8');
  }
}

main().catch(console.error);
