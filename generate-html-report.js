require('dotenv').config();
const fs = require('fs');

// 커맨드라인 인자 파싱
const isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';

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
  fetchRankings
} = require('./src/crawlers');

// HTML 템플릿 import
const { generateHTML } = require('./src/templates/html');

async function main() {
  let news, community, rankings, steam, youtube, chzzk, upcoming;

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

    // 캐시 저장
    const cache = { timestamp: new Date().toISOString(), news, community, rankings, steam, youtube, chzzk, upcoming };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('\n💾 캐시 저장 완료');
  }

  console.log('\n📄 GAMERSCRAWL 일일 보고서 생성 중...');
  const html = generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming);

  const filename = `index.html`;
  fs.writeFileSync(filename, html, 'utf8');

  // CSS 파일 복사 (src → root)
  fs.copyFileSync('./src/styles.css', './styles.css');

  console.log(`\n✅ 완료! 파일: ${filename}`);
}

main().catch(console.error);
