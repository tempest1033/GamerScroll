require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 커맨드라인 인자 파싱
const isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');

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

// 페이지별 템플릿 import
const { generateIndexPage } = require('./src/templates/pages/index');
const { generateTrendPage, generateDailyDetailPage, generateWeeklyDetailPage, generateDeepDiveDetailPage } = require('./src/templates/pages/trend');
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

  const data = { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, weeklyInsight };

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

  const pages = [
    { filename: 'index.html', generator: (d) => generateIndexPage({ ...d, popularGames: popularGamesData.games || [], games: gamesData }) },
    { filename: 'news.html', generator: generateNewsPage },
    { filename: 'community.html', generator: generateCommunityPage },
    { filename: 'youtube.html', generator: generateYoutubePage },
    { filename: 'rankings.html', generator: (d) => generateRankingsPage({ ...d, games: gamesData }) },
    { filename: 'steam.html', generator: generateSteamPage },
    { filename: 'upcoming.html', generator: generateUpcomingPage },
    { filename: 'metacritic.html', generator: generateMetacriticPage },
    { filename: 'search/index.html', generator: generateSearchPage },
    { filename: 'games/index.html', generator: () => generateGamesHubPage({ games: gamesData, popularGames: popularGamesData.games || [] }) },
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
    const dailyJsonFiles = files.filter(f => /^\d{4}-\d{2}-\d{2}(-[AP]M)?\.json$/.test(f));

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

  // Deep Dive 데이터 로드 (hub에서 사용)
  const DEEP_DIVE_DATA_DIR = './data/deep-dive';
  let deepDivePosts = [];
  if (fs.existsSync(DEEP_DIVE_DATA_DIR)) {
    const files = fs.readdirSync(DEEP_DIVE_DATA_DIR).filter(f => f.endsWith('.json'));
    deepDivePosts = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(`${DEEP_DIVE_DATA_DIR}/${f}`, 'utf8'));
      } catch (e) {
        return null;
      }
    }).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
      deepDivePosts: deepDivePosts.map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        thumbnail: p.thumbnail,
        summary: p.summary
      }))
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

  // 6. Deep Dive 심층 리포트 페이지 생성 (trend/deep-dive/{slug}/index.html)
  const deepDiveDir = `${trendsDir}/deep-dive`;

  if (deepDivePosts.length > 0) {
    if (!fs.existsSync(deepDiveDir)) {
      fs.mkdirSync(deepDiveDir, { recursive: true });
    }

    for (let i = 0; i < deepDivePosts.length; i++) {
      const post = deepDivePosts[i];
      const pageDir = `${deepDiveDir}/${post.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      try {
        const nav = {
          prev: deepDivePosts[i + 1] ? { slug: deepDivePosts[i + 1].slug, title: deepDivePosts[i + 1].title } : null,
          next: deepDivePosts[i - 1] ? { slug: deepDivePosts[i - 1].slug, title: deepDivePosts[i - 1].title } : null
        };
        const html = generateDeepDiveDetailPage({ post, nav });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
      } catch (err) {
        console.error(`  ❌ trend/deep-dive/${post.slug}: ${err.message}`);
      }
    }
    console.log(`  ✅ Deep Dive 페이지 ${deepDivePosts.length}개 생성`);
  }

  // docs 폴더 동기화 (로컬 개발 환경용)
  const DOCS_DIR = './docs';
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
    Object.values(gamesData || {}).forEach(g => {
      if (!g || !g.slug || !g.appIds) return;
      if (g.appIds.ios) iosSlugMap[String(g.appIds.ios)] = g.slug;
      if (g.appIds.android) androidSlugMap[String(g.appIds.android)] = g.slug;
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

  // 메인 페이지 URL 목록
  const mainPages = [
    { loc: 'https://gamerscrawl.com/', changefreq: 'hourly', priority: '1.0' },
    { loc: 'https://gamerscrawl.com/trend/', changefreq: 'hourly', priority: '0.9' },
    { loc: 'https://gamerscrawl.com/news/', changefreq: 'hourly', priority: '0.9' },
    { loc: 'https://gamerscrawl.com/community/', changefreq: 'hourly', priority: '0.8' },
    { loc: 'https://gamerscrawl.com/youtube/', changefreq: 'hourly', priority: '0.8' },
    { loc: 'https://gamerscrawl.com/rankings/', changefreq: 'hourly', priority: '0.9' },
    { loc: 'https://gamerscrawl.com/steam/', changefreq: 'hourly', priority: '0.8' },
    { loc: 'https://gamerscrawl.com/upcoming/', changefreq: 'daily', priority: '0.7' },
    { loc: 'https://gamerscrawl.com/metacritic/', changefreq: 'daily', priority: '0.7' },
    { loc: 'https://gamerscrawl.com/games/', changefreq: 'daily', priority: '0.9' }
  ];

  // 트렌드 리포트 페이지 자동 스캔
  let trendPages = [];
  if (fs.existsSync(destTrendDir)) {
    // 일간 리포트
    const dailyTrendDir = `${destTrendDir}/daily`;
    if (fs.existsSync(dailyTrendDir)) {
      const dailyFolders = fs.readdirSync(dailyTrendDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      trendPages.push(...dailyFolders.map(slug => ({
        loc: `https://gamerscrawl.com/trend/daily/${slug}/`,
        changefreq: 'weekly',
        priority: '0.7'
      })));
    }
    // 주간 리포트
    const weeklyTrendDir = `${destTrendDir}/weekly`;
    if (fs.existsSync(weeklyTrendDir)) {
      const weeklyFolders = fs.readdirSync(weeklyTrendDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      trendPages.push(...weeklyFolders.map(slug => ({
        loc: `https://gamerscrawl.com/trend/weekly/${slug}/`,
        changefreq: 'weekly',
        priority: '0.7'
      })));
    }

    // Deep Dive 페이지
    const deepDiveSitemapDir = `${destTrendDir}/deep-dive`;
    if (fs.existsSync(deepDiveSitemapDir)) {
      const deepDiveFolders = fs.readdirSync(deepDiveSitemapDir).filter(f =>
        fs.statSync(`${deepDiveSitemapDir}/${f}`).isDirectory()
      );
      trendPages.push(...deepDiveFolders.map(slug => ({
        loc: `https://gamerscrawl.com/trend/deep-dive/${slug}/`,
        changefreq: 'monthly',
        priority: '0.8'
      })));
    }
  }

  // 게임 페이지 자동 스캔 (noindex 페이지는 제외 또는 낮은 priority)
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
      return {
        loc: `https://gamerscrawl.com/games/${slug}/`,
        changefreq: 'weekly',
        priority: hasNoindex ? '0.1' : '0.6'  // noindex면 낮은 priority
      };
    }).filter(p => p.priority !== '0.1');  // noindex 페이지는 sitemap에서 제외
  }

  // Sitemap XML 생성
  const allPages = [...mainPages, ...gamePages, ...trendPages];
  const sitemapEntries = allPages.map(page => `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${sitemapDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;
  fs.writeFileSync(`${DOCS_DIR}/sitemap.xml`, sitemapXml, 'utf8');
  console.log(`📍 Sitemap 생성: 메인 ${mainPages.length}개 + 게임 ${gamePages.length}개 + 트렌드 ${trendPages.length}개 = 총 ${allPages.length}개 URL`);

  console.log(`\n✅ 완료! (docs/ 동기화 + sitemap 갱신)`);

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
