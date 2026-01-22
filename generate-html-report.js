require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateRSS } = require('./src/rss/generate-rss');

// 커맨드라인 인자 파싱
let isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');
const isMobileBuild = process.argv.includes('--mobile') || process.argv.includes('-m');
const includeDrafts = process.argv.includes('--draft') || process.argv.includes('-d');

// 모바일 빌드 시 환경변수 설정 (layout-mobile.js 사용)
if (isMobileBuild) {
  process.env.MOBILE_BUILD = 'true';
}

// 드래프트 포함 모드 안내
if (includeDrafts) {
  console.log('📝 드래프트 모드: draft 상태 이슈 리포트 포함\n');
}

// CI 환경에서 캐시가 최근 것이면 자동으로 퀵 모드 (크롤링 스킵)
const CACHE_FRESHNESS_MINUTES = 30; // 30분 주기 - 캐시 최신이면 스킵
if (!isQuickMode && process.env.CI && fs.existsSync('./data-cache.json')) {
  try {
    const cache = JSON.parse(fs.readFileSync('./data-cache.json', 'utf8'));
    if (cache.timestamp) {
      const cacheAge = (Date.now() - new Date(cache.timestamp).getTime()) / 1000 / 60;
      if (cacheAge < CACHE_FRESHNESS_MINUTES) {
        console.log(`⚡ 캐시가 최신입니다 (${Math.round(cacheAge)}분 전) - 크롤링 스킵`);
        isQuickMode = true;
      }
    }
  } catch (e) {
    // 캐시 파싱 실패 시 일반 모드로 진행
  }
}

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';
const HISTORY_DIR = './history';
const SNAPSHOTS_DIR = './snapshots';
const REPORTS_DIR = './reports';
const WEEKLY_REPORTS_DIR = './reports/weekly';
const WIKI_DIR = './data/wiki';

// 위키 데이터 로드 함수
function loadWikiData() {
  const categories = ['business', 'tech', 'history', 'knowledge'];
  const wikiData = {};

  for (const category of categories) {
    const categoryDir = `${WIKI_DIR}/${category}`;
    wikiData[category] = [];

    if (!fs.existsSync(categoryDir)) continue;

    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(`${categoryDir}/${file}`, 'utf8').replace(/^\uFEFF/, '');
        const article = JSON.parse(raw);
        const status = article.status || '';
        const isApproved = status === 'approved' || status === 'published';
        const isDraft = status === 'draft';
        if (isApproved || (includeDrafts && isDraft)) {
          const slug = article.slug || file.replace('.json', '');
          wikiData[category].push({
            ...article,
            slug
          });
        }
      } catch (e) {
        console.warn(`  ⚠️ 위키 파일 로드 실패: ${categoryDir}/${file}`);
      }
    }

    // 날짜 기준 정렬 (최신순)
    wikiData[category].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  return wikiData;
}

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

// 페이지별 템플릿 import
const { generateIndexPage } = require('./src/templates/pages/index');
const { generateTrendPage, generateDailyDetailPage, generateWeeklyDetailPage, generateIssueDetailPage } = require('./src/templates/pages/trend');
const { generateTrendsHubPage } = require('./src/templates/pages/trends-hub');
const { generateNewsPage } = require('./src/templates/pages/news');
const { generateCommunityPage } = require('./src/templates/pages/community');
const { generateYoutubePage } = require('./src/templates/pages/youtube');
const { generateRankingsPage } = require('./src/templates/pages/rankings');
const { generateSteamPage } = require('./src/templates/pages/steam');
const { generateUpcomingPage } = require('./src/templates/pages/upcoming');
const { generateMetacriticPage } = require('./src/templates/pages/metacritic');
const { generateSearchPage } = require('./src/templates/pages/search');
const { generateGamesHubPage } = require('./src/templates/pages/games-hub');
const { generateWikiHubPage } = require('./src/templates/pages/wiki-hub');
const { generateWikiArticlePage } = require('./src/templates/pages/wiki-article');
const { generate404Page } = require('./src/templates/pages/404');
const { loadPopularGames, savePopularGames, shouldFetchPopularGames } = require('./src/crawlers/analytics');

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

function stripBom(text) {
  if (!text) return '';
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function normalizeLineEndingsToLf(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function toCrlf(text) {
  return String(text).replace(/\n/g, '\r\n');
}

function bundleCssFile(entryPath) {
  const entryAbsPath = path.resolve(entryPath);

  function bundleRecursive(filePath, stack) {
    const absPath = path.resolve(filePath);
    if (stack.has(absPath)) {
      const cycle = [...stack, absPath].map(p => path.relative(process.cwd(), p)).join(' -> ');
      throw new Error(`CSS @import cycle detected: ${cycle}`);
    }

    stack.add(absPath);

    const dir = path.dirname(absPath);
    const raw = fs.readFileSync(absPath, 'utf8');
    const css = normalizeLineEndingsToLf(stripBom(raw));
    const lines = css.split('\n');
    const out = [];

    for (const line of lines) {
      const match = line.match(/^\s*@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;\s*$/);
      if (!match) {
        out.push(line);
        continue;
      }

      const importTarget = match[1];
      const isRemote = /^https?:\/\//.test(importTarget) || /^\/\//.test(importTarget);
      const isSpecial = importTarget.startsWith('/') || importTarget.startsWith('data:');
      if (isRemote || isSpecial) {
        out.push(line);
        continue;
      }

      const importedPath = path.resolve(dir, importTarget);
      out.push(bundleRecursive(importedPath, stack));
    }

    stack.delete(absPath);
    return out.join('\n').trimEnd() + '\n';
  }

  const bundled = bundleRecursive(entryAbsPath, new Set());
  return toCrlf('\ufeff' + bundled);
}

/**
 * 인사이트 JSON 파일 경로 찾기 (날짜 검증 포함)
 * @param {string} today - YYYY-MM-DD 형식 날짜
 * @returns {string|null} 존재하는 파일 경로 또는 null
 */
function findInsightJsonFile(today) {
  if (!fs.existsSync(REPORTS_DIR)) {
    console.log('⚠️ reports 디렉토리 없음');
    return null;
  }

  // 모든 일간 리포트 파일을 최신순으로 정렬
  const allFiles = fs.readdirSync(REPORTS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();

  for (const file of allFiles) {
    const filePath = `${REPORTS_DIR}/${file}`;

    // 파일 내용의 AI 날짜가 파일명 날짜와 일치하는지 검증
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const fileDate = file.replace('.json', '');
      const aiDate = String(content.ai?.date || '').trim();

      // AI 인사이트가 없는 파일은 폴백 대상으로 사용하지 않음
      if (!content.ai || !aiDate) {
        continue;
      }

      if (aiDate && fileDate !== aiDate) {
        console.log(`⚠️ 날짜 불일치로 스킵: ${file} (파일: ${fileDate}, AI: ${aiDate})`);
        continue;
      }

      // 유효한 파일 발견
      if (fileDate !== today) {
        console.log(`📂 오늘 인사이트 없음 → 폴백: ${file}`);
      }
      return filePath;
    } catch (e) {
      console.log(`⚠️ 파일 검증 실패: ${file} - ${e.message}`);
      continue;
    }
  }

  console.log('⚠️ 사용 가능한 인사이트 파일 없음');
  return null;
}

/**
 * JSON 파일에서 AI 인사이트 데이터 로드하여 insight 객체에 병합
 * @param {string} filePath - JSON 파일 경로
 * @param {object} insight - 병합 대상 insight 객체
 * @param {boolean} includeStock - 주가 데이터 포함 여부
 * @returns {boolean} 성공 여부
 */
function loadAIInsightFromFile(filePath, insight, includeStock = true) {
  if (!filePath || !fs.existsSync(filePath)) return false;

  try {
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (saved.ai) {
      insight.ai = saved.ai;
      insight.aiGeneratedAt = saved.aiGeneratedAt;
      if (includeStock) {
        insight.stockMap = saved.stockMap || {};
        insight.stockPrices = saved.stockPrices || {};
      }
      return true;
    }
  } catch (e) {
    console.log(`⚠️ AI 인사이트 파싱 실패: ${e.message}`);
  }
  return false;
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

    // iOS 인기 순위 (5개국)
    iosCountries.forEach(country => {
      const data = rankings?.free?.[country]?.ios || [];
      if (data.length > 0) {
        const rows = data.map((app, i) => ({ rank: i + 1, id: app.id || app.appId || '', title: app.title }));
        appendCsv(`${rankingsDir}/${snapshotDate}_ios_${country}_free.csv`, rows);
      }
    });

    // Android 인기 순위 (4개국, 중국 제외)
    aosCountries.forEach(country => {
      const data = rankings?.free?.[country]?.android || [];
      if (data.length > 0) {
        const rows = data.map((app, i) => ({ rank: i + 1, id: app.appId || '', title: app.title }));
        appendCsv(`${rankingsDir}/${snapshotDate}_aos_${country}_free.csv`, rows);
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
  if (loadAIInsightFromFile(insightJsonFile, insight)) {
    console.log(`📂 AI 인사이트 로드 완료 (${insightJsonFile.split('/').pop()})`);
    // 파일명에서 날짜 추출하여 저장 (링크 생성용)
    const fileMatch = insightJsonFile.match(/(\d{4}-\d{2}-\d{2})\.json$/);
    if (fileMatch) {
      insight.insightDate = fileMatch[1];
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

  // HTML 생성
  console.log('\n📄 GAMERSCRAWL 일일 보고서 생성 중...');

  // 이슈 리포트 데이터 로드 (홈페이지용, 승인된 것만)
  const ISSUE_REPORTS_DIR_HOME = './reports/issue';
  let issueReportsForHome = [];
  if (fs.existsSync(ISSUE_REPORTS_DIR_HOME)) {
    const files = fs.readdirSync(ISSUE_REPORTS_DIR_HOME).filter(f => f.endsWith('.json'));
    issueReportsForHome = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(`${ISSUE_REPORTS_DIR_HOME}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  const data = { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, weeklyInsight, issueReports: issueReportsForHome };

  // games.json 로드 (게임 허브용)
  let gamesData = {};
  try {
    const gamesJson = JSON.parse(fs.readFileSync('./data/games.json', 'utf8').replace(/^\uFEFF/, ''));
    gamesData = gamesJson.games || {};
    console.log(`  📦 games.json 로드: ${Object.keys(gamesData).length}개 게임`);
  } catch (err) {
    console.warn('  ⚠️ games.json 로드 실패:', err.message);
  }

  // GA4 인기 게임 데이터 수집 (24시간 쿨타임)
  if (process.env.GA4_SERVICE_ACCOUNT && shouldFetchPopularGames()) {
    console.log('  📊 GA4 인기 게임 데이터 수집 중...');
    try {
      await savePopularGames();
      console.log('  ✅ 인기 게임 데이터 갱신 완료');
    } catch (err) {
      console.warn('  ⚠️ GA4 인기 게임 수집 실패:', err.message);
    }
  }

  // 인기 게임 데이터 로드
  const popularGamesData = loadPopularGames();
  if (popularGamesData.games && popularGamesData.games.length > 0) {
    console.log(`  📊 인기 게임 데이터 로드: TOP ${popularGamesData.games.length}`);
  }

  // 위키 데이터 로드 (홈페이지용)
  const homeWikiData = loadWikiData();

  const pages = [
    { filename: 'index.html', generator: (d) => generateIndexPage({ ...d, popularGames: popularGamesData.games || [], games: gamesData, wikiData: homeWikiData }) },
    { filename: 'news.html', generator: generateNewsPage },
    { filename: 'community.html', generator: generateCommunityPage },
    { filename: 'youtube.html', generator: generateYoutubePage },
    { filename: 'rankings.html', generator: (d) => generateRankingsPage({ ...d, games: gamesData }) },
    { filename: 'steam.html', generator: generateSteamPage },
    { filename: 'upcoming.html', generator: generateUpcomingPage },
    { filename: 'metacritic.html', generator: generateMetacriticPage },
    { filename: 'search/index.html', generator: generateSearchPage },
    { filename: 'games/index.html', generator: () => generateGamesHubPage({ games: gamesData, popularGames: popularGamesData.games || [] }) },
    { filename: 'wiki/index.html', generator: () => generateWikiHubPage({ wikiData: loadWikiData() }) },
    { filename: '404.html', generator: generate404Page }
  ];

  for (const page of pages) {
    try {
      const html = page.generator(data);
      // 디렉토리가 있으면 생성
      const dir = require('path').dirname(page.filename);
      if (dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(page.filename, html, 'utf8');
      console.log(`  ✅ ${page.filename}`);
    } catch (err) {
      console.error(`  ❌ ${page.filename}: ${err.message}`);
    }
  }

  // CSS 파일 복사
  let didBundleCss = false;
  try {
    const bundledCss = bundleCssFile('./src/styles.css');
    fs.writeFileSync('./styles.css', bundledCss, 'utf8');
    didBundleCss = true;
  } catch (e) {
    console.error(`⚠️ CSS 번들링 실패 → 원본 복사: ${e.message}`);
    fs.copyFileSync('./src/styles.css', './styles.css');
  }
  // 분리된 CSS 모듈 동기화 (src/styles/*.css -> styles/)
  const SRC_STYLES_DIR = './src/styles';
  if (fs.existsSync(SRC_STYLES_DIR)) {
    const OUT_STYLES_DIR = './styles';
    if (!fs.existsSync(OUT_STYLES_DIR)) {
      fs.mkdirSync(OUT_STYLES_DIR, { recursive: true });
    }
    const cssFiles = fs.readdirSync(SRC_STYLES_DIR).filter(f => f.endsWith('.css'));
    const cssFileSet = new Set(cssFiles);

    // src/styles에서 삭제된 CSS가 styles/에 남아있는 것을 방지
    const outCssFiles = fs.readdirSync(OUT_STYLES_DIR).filter(f => f.endsWith('.css'));
    for (const file of outCssFiles) {
      if (!cssFileSet.has(file)) {
        fs.unlinkSync(`${OUT_STYLES_DIR}/${file}`);
      }
    }
    for (const file of cssFiles) {
      fs.copyFileSync(`${SRC_STYLES_DIR}/${file}`, `${OUT_STYLES_DIR}/${file}`);
    }
  }

  // ============================================
  // 트렌드 리포트 페이지 생성 (목록 + 상세)
  // ============================================
  console.log('\n📊 트렌드 리포트 페이지 생성 중...');

  // 1. 일간 리포트 JSON 스캔
  const dailyReports = [];
  if (fs.existsSync(REPORTS_DIR)) {
    const files = fs.readdirSync(REPORTS_DIR);
    const dailyJsonFiles = files.filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));

    for (const file of dailyJsonFiles) {
      try {
        const filePath = `${REPORTS_DIR}/${file}`;
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (content.ai) {
          const slug = file.replace('.json', '');
          const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})/);
          const fileDate = dateMatch ? dateMatch[1] : slug;
          const aiDate = String(content.ai?.date || '').trim();

          // 파일 날짜와 AI 인사이트 날짜가 불일치하면 스킵
          if (aiDate && fileDate !== aiDate) {
            console.warn(`  ⚠️ 날짜 불일치로 스킵: ${file} (파일: ${fileDate}, AI: ${aiDate})`);
            continue;
          }

          dailyReports.push({
            slug,
            date: fileDate,
            headline: content.ai.headline || '',
            summary: content.ai.summary || '',
            thumbnail: content.ai.thumbnail || '',
            issues: content.ai.issues || [],
            insight: content
          });
        }
      } catch (e) {
        console.warn(`  ⚠️ 일간 리포트 로드 실패: ${file}`);
      }
    }
    // 날짜 내림차순 정렬
    dailyReports.sort((a, b) => b.slug.localeCompare(a.slug));
  }

  // 2. 주간 리포트 JSON 스캔
  const weeklyReports = [];
  if (fs.existsSync(WEEKLY_REPORTS_DIR)) {
    const files = fs.readdirSync(WEEKLY_REPORTS_DIR);
    const weeklyJsonFiles = files.filter(f => /^\d{4}-W\d{2}\.json$/.test(f));

    for (const file of weeklyJsonFiles) {
      try {
        const filePath = `${WEEKLY_REPORTS_DIR}/${file}`;
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (content.ai) {
          const slug = file.replace('.json', '');
          const wInfo = content.weekInfo || {};
          weeklyReports.push({
            slug,
            year: wInfo.startDate?.slice(0, 4) || slug.slice(0, 4),
            weekNumber: wInfo.weekNumber || content.ai.weekNumber || parseInt(slug.match(/W(\d+)/)?.[1] || '0'),
            startDate: wInfo.startDate || '',
            endDate: wInfo.endDate || '',
            headline: content.ai.headline || '',
            summary: content.ai.summary || '',
            thumbnail: content.ai.thumbnail || '',
            issues: content.ai.issues || [],
            weeklyInsight: content
          });
        }
      } catch (e) {
        console.warn(`  ⚠️ 주간 리포트 로드 실패: ${file}`);
      }
    }
    // 주차 내림차순 정렬
    weeklyReports.sort((a, b) => b.slug.localeCompare(a.slug));
  }

  console.log(`  📅 일간 리포트: ${dailyReports.length}개`);
  console.log(`  📊 주간 리포트: ${weeklyReports.length}개`);

  // 3. 목록 페이지 생성 (trends/index.html)
  const trendsDir = './trend';
  if (!fs.existsSync(trendsDir)) {
    fs.mkdirSync(trendsDir, { recursive: true });
  }

  // 이슈 리포트 데이터 로드 (허브/상세에서 사용, 승인된 것만 노출)
  const ISSUE_REPORTS_DIR = './reports/issue';
  let issueReports = [];
  if (fs.existsSync(ISSUE_REPORTS_DIR)) {
    const files = fs.readdirSync(ISSUE_REPORTS_DIR).filter(f => f.endsWith('.json'));
    issueReports = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(`${ISSUE_REPORTS_DIR}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  try {
    const hubHtml = generateTrendsHubPage({
      dailyReports: dailyReports.map(r => ({
        date: r.date,
        headline: r.headline,
        summary: r.summary,
        thumbnail: r.thumbnail,
        issues: r.issues
      })),
      weeklyReports: weeklyReports.map(r => ({
        weekNumber: r.weekNumber,
        year: r.year,
        startDate: r.startDate,
        endDate: r.endDate,
        headline: r.headline,
        summary: r.summary,
        thumbnail: r.thumbnail,
        issues: r.issues
      })),
      issueReports: issueReports.map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        thumbnail: p.thumbnail,
        summary: p.summary
      })),
      news: news
    });
    fs.writeFileSync(`${trendsDir}/index.html`, hubHtml, 'utf8');
    console.log(`  ✅ trend/index.html`);
  } catch (err) {
    console.error(`  ❌ trend/index.html: ${err.message}`);
  }

  // 4. 일간 상세 페이지 생성 (trend/daily/{slug}/index.html)
  const dailyDir = `${trendsDir}/daily`;
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }

  // 기존에 남아있는 불필요한 일간 페이지 정리 (현재 dailyReports 목록에 없는 폴더 제거)
  try {
    const expectedDailySlugs = new Set(dailyReports.map(r => r.slug));
    const existingDailyDirs = fs.readdirSync(dailyDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const dirName of existingDailyDirs) {
      if (!expectedDailySlugs.has(dirName)) {
        fs.rmSync(`${dailyDir}/${dirName}`, { recursive: true, force: true });
      }
    }
  } catch (e) {
    // 정리 실패 시에도 생성은 계속 진행
  }

  for (let i = 0; i < dailyReports.length; i++) {
    const report = dailyReports[i];
    const pageDir = `${dailyDir}/${report.slug}`;
    if (!fs.existsSync(pageDir)) {
      fs.mkdirSync(pageDir, { recursive: true });
    }

    try {
      const nav = {
        prev: dailyReports[i + 1]?.slug || null,
        next: dailyReports[i - 1]?.slug || null
      };

      // history 뉴스 데이터 로드 (썸네일 매칭 fallback용)
      const historyFile = `${HISTORY_DIR}/${report.slug}.json`;
      let historyNews = [];
      if (fs.existsSync(historyFile)) {
        try {
          const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
          // 모든 뉴스 소스에서 썸네일 있는 것만 수집
          historyNews = [
            ...(historyData.news?.inven || []),
            ...(historyData.news?.ruliweb || []),
            ...(historyData.news?.gamemeca || []),
            ...(historyData.news?.thisisgame || [])
          ].filter(n => n.thumbnail && n.title);
        } catch (e) {
          // 로드 실패 시 빈 배열
        }
      }

      const html = generateDailyDetailPage({
        insight: report.insight,
        slug: report.slug,
        nav,
        historyNews
      });
      fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
    } catch (err) {
      console.error(`  ❌ trend/daily/${report.slug}: ${err.message}`);
    }
  }
  console.log(`  ✅ 일간 상세 페이지 ${dailyReports.length}개 생성`);

  // 5. 주간 상세 페이지 생성 (trend/weekly/{slug}/index.html)
  const weeklyDir = `${trendsDir}/weekly`;
  if (!fs.existsSync(weeklyDir)) {
    fs.mkdirSync(weeklyDir, { recursive: true });
  }

  // 기존에 남아있는 불필요한 주간 페이지 정리 (현재 weeklyReports 목록에 없는 폴더 제거)
  try {
    const expectedWeeklySlugs = new Set(weeklyReports.map(r => r.slug));
    const existingWeeklyDirs = fs.readdirSync(weeklyDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const dirName of existingWeeklyDirs) {
      if (!expectedWeeklySlugs.has(dirName)) {
        fs.rmSync(`${weeklyDir}/${dirName}`, { recursive: true, force: true });
      }
    }
  } catch (e) {
    // 정리 실패 시에도 생성은 계속 진행
  }

  for (let i = 0; i < weeklyReports.length; i++) {
    const report = weeklyReports[i];
    const pageDir = `${weeklyDir}/${report.slug}`;
    if (!fs.existsSync(pageDir)) {
      fs.mkdirSync(pageDir, { recursive: true });
    }

    try {
      const nav = {
        prev: weeklyReports[i + 1]?.slug || null,
        next: weeklyReports[i - 1]?.slug || null
      };
      const html = generateWeeklyDetailPage({
        weeklyInsight: report.weeklyInsight,
        slug: report.slug,
        nav
      });
      fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
    } catch (err) {
      console.error(`  ❌ trend/weekly/${report.slug}: ${err.message}`);
    }
  }
  console.log(`  ✅ 주간 상세 페이지 ${weeklyReports.length}개 생성`);

  // 6. 이슈 리포트 페이지 생성 (trend/issue/{slug}/index.html)
  const issueDir = `${trendsDir}/issue`;
  const wikiDataForIssue = loadWikiData(); // 이슈 리포트에서 관련 위키 참조용

  if (issueReports.length > 0) {
    if (!fs.existsSync(issueDir)) {
      fs.mkdirSync(issueDir, { recursive: true });
    }

    for (let i = 0; i < issueReports.length; i++) {
      const post = issueReports[i];
      const pageDir = `${issueDir}/${post.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      try {
        const nav = {
          prev: issueReports[i + 1] ? { slug: issueReports[i + 1].slug, title: issueReports[i + 1].title } : null,
          next: issueReports[i - 1] ? { slug: issueReports[i - 1].slug, title: issueReports[i - 1].title } : null
        };
        const html = generateIssueDetailPage({ post, nav, issueReports, wikiData: wikiDataForIssue });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
      } catch (err) {
        console.error(`  ❌ trend/issue/${post.slug}: ${err.message}`);
      }
    }
    console.log(`  ✅ 이슈 리포트 페이지 ${issueReports.length}개 생성`);
  }

  // 위키 개별 항목 페이지 생성
  console.log('\n📚 위키 페이지 생성...');
  const wikiData = loadWikiData();
  const categories = ['business', 'tech', 'history', 'knowledge'];

  for (const category of categories) {
    const articles = wikiData[category] || [];
    if (articles.length === 0) continue;

    const categoryDir = `./wiki/${category}`;
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const pageDir = `${categoryDir}/${article.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      try {
        // 관련 항목: JSON에 명시된 경우만 사용 (자동 생성 없음)
        const relatedArticles = (article.relatedArticles || [])
          .map(slug => {
            const found = articles.find(a => a.slug === slug);
            return found ? { ...found, category } : null;
          })
          .filter(Boolean);

        // 이전/다음 항목
        const prevNext = {
          prev: articles[i + 1] ? { slug: articles[i + 1].slug, title: articles[i + 1].title } : null,
          next: articles[i - 1] ? { slug: articles[i - 1].slug, title: articles[i - 1].title } : null
        };

        const html = generateWikiArticlePage({
          article,
          category,
          relatedArticles,
          prevNext,
          issueReports,
          allWikiData: wikiData
        });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
      } catch (err) {
        console.error(`  ❌ wiki/${category}/${article.slug}: ${err.message}`);
      }
    }
    console.log(`  ✅ ${category} 위키 페이지 ${articles.length}개 생성`);
  }

  // docs 폴더 동기화 (로컬 개발 환경용)
  // 모바일 빌드 시 docs-mobile/ 폴더에 출력
  const DOCS_DIR = isMobileBuild ? './docs-mobile' : './docs';
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
  fs.copyFileSync('./index.html', `${DOCS_DIR}/index.html`);
  fs.copyFileSync('./404.html', `${DOCS_DIR}/404.html`);
  const subPages = ['news', 'community', 'youtube', 'rankings', 'steam', 'upcoming', 'metacritic'];
  for (const page of subPages) {
    const pageDir = `${DOCS_DIR}/${page}`;
    if (!fs.existsSync(pageDir)) {
      fs.mkdirSync(pageDir, { recursive: true });
    }
    fs.copyFileSync(`./${page}.html`, `${pageDir}/index.html`);
  }

  // privacy 페이지 복사 (푸터 링크 폴백/SEO용)
  try {
    const srcPrivacy = './privacy/index.html';
    if (fs.existsSync(srcPrivacy)) {
      const privacyDir = `${DOCS_DIR}/privacy`;
      if (!fs.existsSync(privacyDir)) {
        fs.mkdirSync(privacyDir, { recursive: true });
      }
      fs.copyFileSync(srcPrivacy, `${privacyDir}/index.html`);
    }
  } catch (err) {
    console.warn('  ⚠️ privacy 페이지 복사 실패:', err.message);
  }

  // wiki 폴더 복사
  try {
    const srcWiki = './wiki';
    if (fs.existsSync(srcWiki)) {
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = `${src}/${entry.name}`;
          const destPath = `${dest}/${entry.name}`;
          if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };
      copyDir(srcWiki, `${DOCS_DIR}/wiki`);
    }
  } catch (err) {
    console.warn('  ⚠️ wiki 폴더 복사 실패:', err.message);
  }

  // steam 탭 전환용 데이터(JSON) 생성 (초기 HTML/DOM 부하 줄이기)
  try {
    const steamDir = `${DOCS_DIR}/steam`;
    if (!fs.existsSync(steamDir)) {
      fs.mkdirSync(steamDir, { recursive: true });
    }

    const topSellers = Array.isArray(steam?.topSellers) ? steam.topSellers.map(g => ({
      name: g?.name || '',
      developer: g?.developer || '',
      img: g?.img || '',
      price: g?.price || '',
      discount: g?.discount || ''
    })) : [];

    const mostPlayed = Array.isArray(steam?.mostPlayed) ? steam.mostPlayed.map(g => ({
      name: g?.name || '',
      developer: g?.developer || '',
      img: g?.img || '',
      ccu: g?.ccu ?? 0
    })) : [];

    fs.writeFileSync(`${steamDir}/data.json`, JSON.stringify({ topSellers, mostPlayed }), 'utf8');
  } catch (err) {
    console.warn('  ⚠️ steam/data.json 생성 실패:', err.message);
  }

  // rankings 탭 전환용 데이터(JSON) 생성 (초기 HTML/DOM 부하 줄이기)
  try {
    const rankingsDir = `${DOCS_DIR}/rankings`;
    if (!fs.existsSync(rankingsDir)) {
      fs.mkdirSync(rankingsDir, { recursive: true });
    }

    const iosSlugMap = {};
    const androidSlugMap = {};
    const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
    Object.values(gamesData || {}).forEach(g => {
      if (!g || !g.slug || !g.appIds) return;
      // 기본 iOS/Android
      if (g.appIds.ios) iosSlugMap[String(g.appIds.ios)] = g.slug;
      if (g.appIds.android) androidSlugMap[String(g.appIds.android)] = g.slug;
      // 지역별 앱 ID (ios_cn, ios_jp, android_jp 등)
      regions.forEach(r => {
        if (g.appIds[`ios_${r}`]) iosSlugMap[String(g.appIds[`ios_${r}`])] = g.slug;
        if (g.appIds[`android_${r}`]) androidSlugMap[String(g.appIds[`android_${r}`])] = g.slug;
      });
    });

	    function buildChart(chartData) {
	      const out = {};
	      const entries = Object.entries(chartData || {});
	      for (const [countryCode, perCountry] of entries) {
	        const iosList = Array.isArray(perCountry?.ios) ? perCountry.ios : [];
	        const androidList = Array.isArray(perCountry?.android) ? perCountry.android : [];
	        out[countryCode] = {
	          ios: iosList.map(app => ({ ...app, slug: iosSlugMap[String(app?.appId)] || null })),
	          android: androidList.map(app => ({ ...app, slug: androidSlugMap[String(app?.appId)] || null }))
	        };
	      }
	      return out;
	    }

	    function buildChartStore(chartData, store) {
	      const out = {};
	      const entries = Object.entries(chartData || {});
	      const slugMap = store === 'ios' ? iosSlugMap : androidSlugMap;
	      for (const [countryCode, perCountry] of entries) {
	        const list = Array.isArray(perCountry?.[store]) ? perCountry[store] : [];
	        out[countryCode] = list.map(app => ({ ...app, slug: slugMap[String(app?.appId)] || null }));
	      }
	      return out;
	    }

	    const rankingsClientData = {
	      grossing: buildChart(rankings?.grossing),
	      free: buildChart(rankings?.free)
	    };

	    fs.writeFileSync(`${rankingsDir}/data.json`, JSON.stringify(rankingsClientData), 'utf8');

	    // 화면별/탭별 부분 로드용 (payload 절감)
	    fs.writeFileSync(`${rankingsDir}/grossing-ios.json`, JSON.stringify(buildChartStore(rankings?.grossing, 'ios')), 'utf8');
	    fs.writeFileSync(`${rankingsDir}/grossing-android.json`, JSON.stringify(buildChartStore(rankings?.grossing, 'android')), 'utf8');
	    fs.writeFileSync(`${rankingsDir}/free-ios.json`, JSON.stringify(buildChartStore(rankings?.free, 'ios')), 'utf8');
	    fs.writeFileSync(`${rankingsDir}/free-android.json`, JSON.stringify(buildChartStore(rankings?.free, 'android')), 'utf8');
	  } catch (err) {
	    console.warn('  ⚠️ rankings/data.json 생성 실패:', err.message);
	  }
  // search 페이지는 search/index.html로 직접 생성됨
  const searchDir = `${DOCS_DIR}/search`;
  if (!fs.existsSync(searchDir)) {
    fs.mkdirSync(searchDir, { recursive: true });
  }
  fs.copyFileSync('./search/index.html', `${searchDir}/index.html`);

  // games 허브 페이지 복사 (기존 게임 개별 페이지와 별도)
  if (fs.existsSync('./games/index.html')) {
    fs.copyFileSync('./games/index.html', `${DOCS_DIR}/games/index.html`);
    console.log('  ✅ games/index.html → docs/games/index.html');
  }

  // trend 폴더 복사 (일간/주간 리포트 페이지)
  const srcTrendDir = './trend';
  const destTrendDir = `${DOCS_DIR}/trend`;
  if (fs.existsSync(srcTrendDir)) {
    // 기존 docs/trend 정리 후 재복사 (삭제되지 않는 잔존 파일 방지)
    if (fs.existsSync(destTrendDir)) {
      fs.rmSync(destTrendDir, { recursive: true, force: true });
    }

    // trend 디렉토리 재귀 복사
    const copyDirRecursive = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = `${src}/${entry.name}`;
        const destPath = `${dest}/${entry.name}`;
        if (entry.isDirectory()) {
          copyDirRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    copyDirRecursive(srcTrendDir, destTrendDir);
    console.log('  ✅ trend/ → docs/trend/');
  }

  try {
    if (didBundleCss && fs.existsSync('./styles.css')) {
      fs.copyFileSync('./styles.css', `${DOCS_DIR}/styles.css`);
    } else {
      const bundledCss = bundleCssFile('./src/styles.css');
      fs.writeFileSync(`${DOCS_DIR}/styles.css`, bundledCss, 'utf8');
    }
  } catch (e) {
    console.error(`⚠️ CSS 번들링 실패(docs) → 원본 복사: ${e.message}`);
    fs.copyFileSync('./src/styles.css', `${DOCS_DIR}/styles.css`);
  }
  // 분리된 CSS 모듈 동기화 (src/styles/*.css -> docs/styles/)
  if (fs.existsSync(SRC_STYLES_DIR)) {
    const docsStylesDir = `${DOCS_DIR}/styles`;
    if (!fs.existsSync(docsStylesDir)) {
      fs.mkdirSync(docsStylesDir, { recursive: true });
    }
    const cssFiles = fs.readdirSync(SRC_STYLES_DIR).filter(f => f.endsWith('.css'));
    for (const file of cssFiles) {
      fs.copyFileSync(`${SRC_STYLES_DIR}/${file}`, `${docsStylesDir}/${file}`);
    }
  }

  // sitemap.xml 동적 생성 (lastmod 자동 업데이트 + 게임 페이지 포함)
  const sitemapDate = new Date().toISOString().split('T')[0];
  const siteBaseUrl = isMobileBuild ? 'https://m.gamerscrawl.com' : 'https://gamerscrawl.com';

  // 주차 → 날짜 변환 헬퍼 (ISO week)
  const getDateFromWeek = (weekStr) => {
    const match = weekStr.match(/(\d{4})-W(\d{2})/);
    if (!match) return sitemapDate;
    const [, year, week] = match;
    const jan4 = new Date(parseInt(year), 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const firstMonday = new Date(jan4);
    firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);
    const targetDate = new Date(firstMonday);
    targetDate.setDate(firstMonday.getDate() + (parseInt(week) - 1) * 7);
    return targetDate.toISOString().split('T')[0];
  };
  const normalizeLastmodDate = (value) => {
    if (!value) return sitemapDate;
    const text = String(value).trim();
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : sitemapDate;
  };

  // 메인 페이지 URL 목록 (changefreq/priority 제거 - Google이 무시함)
  const mainPages = [
    { loc: `${siteBaseUrl}/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/trend/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/news/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/community/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/youtube/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/rankings/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/steam/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/upcoming/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/metacritic/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/games/`, lastmod: sitemapDate },
    { loc: `${siteBaseUrl}/wiki/`, lastmod: sitemapDate }
  ];

  // 위키 페이지 자동 스캔
  const wikiSitemapData = loadWikiData();
  const wikiCategories = ['business', 'tech', 'history', 'knowledge'];
  let wikiPages = [];
  for (const category of wikiCategories) {
    const articles = wikiSitemapData[category] || [];
    wikiPages.push(...articles.map(article => ({
      loc: `${siteBaseUrl}/wiki/${category}/${article.slug}/`,
      lastmod: normalizeLastmodDate(article.date)
    })));
  }

  // 트렌드 리포트 페이지 자동 스캔
  let trendPages = [];
  if (fs.existsSync(destTrendDir)) {
    // 일간 리포트 (폴더명이 날짜: 2026-01-19)
    const dailyTrendDir = `${destTrendDir}/daily`;
    if (fs.existsSync(dailyTrendDir)) {
      const dailyFolders = fs.readdirSync(dailyTrendDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      trendPages.push(...dailyFolders.map(slug => ({
        loc: `${siteBaseUrl}/trend/daily/${slug}/`,
        lastmod: slug  // 폴더명이 날짜 형식
      })));
    }
    // 주간 리포트 (폴더명이 주차: 2026-W03)
    const weeklyTrendDir = `${destTrendDir}/weekly`;
    if (fs.existsSync(weeklyTrendDir)) {
      const weeklyFolders = fs.readdirSync(weeklyTrendDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      trendPages.push(...weeklyFolders.map(slug => ({
        loc: `${siteBaseUrl}/trend/weekly/${slug}/`,
        lastmod: getDateFromWeek(slug)  // 주차 → 날짜 변환
      })));
    }

    // 이슈 리포트 페이지 (JSON의 date 필드 사용)
    const issueSitemapDir = `${destTrendDir}/issue`;
    if (fs.existsSync(issueSitemapDir)) {
      const issueFolders = fs.readdirSync(issueSitemapDir).filter(f =>
        fs.statSync(`${issueSitemapDir}/${f}`).isDirectory()
      );
      trendPages.push(...issueFolders.map(slug => {
        // JSON에서 date 읽기
        let issueDate = sitemapDate;
        try {
          const jsonPath = `${ISSUE_REPORTS_DIR}/${slug}.json`;
          if (fs.existsSync(jsonPath)) {
            const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
            if (json.date) issueDate = normalizeLastmodDate(json.date);
          }
        } catch (e) {}
        return {
          loc: `${siteBaseUrl}/trend/issue/${slug}/`,
          lastmod: issueDate
        };
      }));
    }
  }

  // 게임 페이지 자동 스캔 (noindex 페이지는 sitemap에서 제외)
  const gamesDir = `${DOCS_DIR}/games`;
  let gamePages = [];
  if (fs.existsSync(gamesDir)) {
    const gameFolders = fs.readdirSync(gamesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    gamePages = gameFolders.map(slug => {
      const indexPath = `${gamesDir}/${slug}/index.html`;
      let hasNoindex = false;
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf8').slice(0, 1000);
        hasNoindex = html.includes('noindex');
      }
      return hasNoindex ? null : {
        loc: `${siteBaseUrl}/games/${slug}/`,
        lastmod: sitemapDate
      };
    }).filter(p => p !== null);  // noindex 페이지는 sitemap에서 제외
  }

  // Sitemap XML 생성 (PC URL만 - 중복 신호 최소화로 색인 효율 향상)
  const allPages = [...mainPages, ...wikiPages, ...gamePages, ...trendPages];
  const sitemapEntries = allPages.map(page => {
    return `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${page.lastmod || sitemapDate}</lastmod>
  </url>`;
  }).join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;
  fs.writeFileSync(`${DOCS_DIR}/sitemap.xml`, sitemapXml, 'utf8');
  console.log(`📍 Sitemap 생성: 메인 ${mainPages.length}개 + 위키 ${wikiPages.length}개 + 게임 ${gamePages.length}개 + 트렌드 ${trendPages.length}개 = 총 ${allPages.length}개 URL`);

  // RSS 피드 생성 (PC 빌드만)
  if (!isMobileBuild) {
    try {
      const rssCount = generateRSS('./reports', `${DOCS_DIR}/rss.xml`);
      console.log(`📡 RSS 피드 생성: ${rssCount}개 항목`);
    } catch (err) {
      console.warn('⚠️ RSS 생성 실패:', err.message);
    }
  }

  // 모바일 빌드 시 robots.txt 생성 (sitemap 참조 제거 - PC sitemap만 구글에 제출)
  if (isMobileBuild) {
    fs.writeFileSync(`${DOCS_DIR}/robots.txt`, `User-agent: *
Allow: /`, 'utf8');
    console.log('📱 모바일: robots.txt 생성 (sitemap 참조 없음)');
  }

  // Service Worker 캐시 버전 자동 업데이트 (빌드마다 새 버전)
  const swPath = `${DOCS_DIR}/service-worker.js`;
  if (fs.existsSync(swPath)) {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const cacheVersion = `gamerscrawl-${Date.now()}`;
    const updatedSw = swContent.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${cacheVersion}';`);
    fs.writeFileSync(swPath, updatedSw, 'utf8');
    console.log(`🔄 Service Worker 캐시 버전: ${cacheVersion}`);
  }

  const buildType = isMobileBuild ? 'docs-mobile/ (모바일)' : 'docs/ (PC)';
  console.log(`\n✅ 완료! (${buildType} 동기화 + sitemap 갱신)`);

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
    loadAIInsightFromFile(savedJsonFile, insight, false);

    const insightHTML = generateInsightHTML(insight);
    fs.writeFileSync(reportFile, insightHTML, 'utf8');
    console.log(`📈 데일리 인사이트 저장: ${reportFile}`);

    // 인사이트 JSON도 저장 - 기존 AI 데이터 보존
    const outputJsonFile = `${REPORTS_DIR}/${today}.json`;
    loadAIInsightFromFile(outputJsonFile, insight);
    // 폴백 AI(다른 날짜)가 섞여 있으면 JSON에는 저장하지 않음 (날짜 불일치 경고/스킵 방지)
    const outputAiDate = String(insight.ai?.date || '').trim();
    if (outputAiDate && outputAiDate !== today) {
      delete insight.ai;
      delete insight.aiGeneratedAt;
      delete insight.stockMap;
      delete insight.stockPrices;
    }
    fs.writeFileSync(outputJsonFile, JSON.stringify(insight, null, 2), 'utf8');
  }
}

main().catch(console.error);
