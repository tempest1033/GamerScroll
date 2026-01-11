/**
 * 모바일 버전 빌드 스크립트
 * docs-mobile/ 디렉토리에 모바일 전용 HTML 생성
 * 이후 GamersCrawl-Mobile 저장소로 복사
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 모바일 레이아웃 사용을 위해 layout.js를 layout-mobile.js로 교체
// Node.js 모듈 캐시를 활용해 layout 모듈을 대체
const layoutMobilePath = require.resolve('./src/templates/layout-mobile.js');
const layoutPath = require.resolve('./src/templates/layout.js');

// layout.js 모듈을 layout-mobile.js로 대체
require.cache[layoutPath] = require.cache[layoutMobilePath] || {
  id: layoutPath,
  filename: layoutPath,
  loaded: true,
  exports: require(layoutMobilePath)
};

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';
const OUTPUT_DIR = './docs-mobile';

// 페이지별 템플릿 import (layout-mobile.js 사용)
const { generateIndexPage } = require('./src/templates/pages/index');
const { generateTrendPage, generateDailyDetailPage, generateWeeklyDetailPage } = require('./src/templates/pages/trend');
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
const { loadPopularGames } = require('./src/crawlers/analytics');

function stripBom(text) {
  if (!text) return '';
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function normalizeLineEndingsToLf(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function bundleCssFile(entryPath) {
  const entryAbsPath = path.resolve(entryPath);

  function bundleRecursive(filePath, stack) {
    const absPath = path.resolve(filePath);
    if (stack.has(absPath)) return '';

    stack.add(absPath);

    const dir = path.dirname(absPath);
    const raw = fs.readFileSync(absPath, 'utf8');
    const css = normalizeLineEndingsToLf(stripBom(raw));
    const lines = css.split('\n');
    const out = [];

    for (const line of lines) {
      const importMatch = line.match(/^@import\s+['"]([^'"]+)['"]\s*;?\s*$/);
      if (importMatch) {
        const importPath = path.resolve(dir, importMatch[1]);
        out.push(bundleRecursive(importPath, stack));
      } else {
        out.push(line);
      }
    }

    stack.delete(absPath);
    return out.join('\n');
  }

  return bundleRecursive(entryAbsPath, new Set());
}

async function generateMobilePages() {
  console.log('📱 모바일 버전 빌드 시작...\n');

  // 캐시 로드
  if (!fs.existsSync(CACHE_FILE)) {
    console.error('❌ 캐시 파일이 없습니다. 먼저 npm run build를 실행하세요.');
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  console.log(`📂 캐시 로드 완료 (생성: ${cache._meta?.generatedAt || 'unknown'})\n`);

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 데이터 추출
  const {
    youtube = [],
    chzzk = [],
    community = [],
    news = [],
    steamRankings = [],
    upcomingGames = [],
    rankings = {},
    metacriticGames = []
  } = cache;

  // 인기 게임 데이터 로드
  let popularGames = [];
  try {
    popularGames = loadPopularGames();
    console.log(`  📊 인기 게임 데이터 로드: TOP ${popularGames.length}`);
  } catch (e) {
    console.log('  ⚠️ 인기 게임 데이터 없음');
  }

  // 인사이트 로드
  let aiInsight = null;
  let weeklyInsight = null;
  const today = new Date().toISOString().split('T')[0];

  try {
    const aiInsightPath = `./reports/${today}.json`;
    if (fs.existsSync(aiInsightPath)) {
      aiInsight = JSON.parse(fs.readFileSync(aiInsightPath, 'utf8'));
    } else {
      // 가장 최근 파일 찾기
      const files = fs.readdirSync('./reports').filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/)).sort().reverse();
      if (files.length > 0) {
        aiInsight = JSON.parse(fs.readFileSync(`./reports/${files[0]}`, 'utf8'));
      }
    }
  } catch (e) {}

  try {
    const weekFiles = fs.readdirSync('./reports/weekly').filter(f => f.match(/^\d{4}-W\d{2}\.json$/)).sort().reverse();
    if (weekFiles.length > 0) {
      weeklyInsight = JSON.parse(fs.readFileSync(`./reports/weekly/${weekFiles[0]}`, 'utf8'));
    }
  } catch (e) {}

  // 페이지 생성
  const pages = [
    { name: 'index.html', fn: () => generateIndexPage({ youtube, chzzk, community, news, rankings, steamRankings, upcomingGames, popularGames, aiInsight, weeklyInsight }) },
    { name: 'news.html', fn: () => generateNewsPage(news) },
    { name: 'community.html', fn: () => generateCommunityPage(community) },
    { name: 'youtube.html', fn: () => generateYoutubePage(youtube, chzzk) },
    { name: 'rankings.html', fn: () => generateRankingsPage(rankings) },
    { name: 'steam.html', fn: () => generateSteamPage(steamRankings) },
    { name: 'upcoming.html', fn: () => generateUpcomingPage(upcomingGames) },
    { name: 'metacritic.html', fn: () => generateMetacriticPage(metacriticGames) },
    { name: 'search/index.html', fn: () => generateSearchPage() },
    { name: 'games/index.html', fn: () => generateGamesHubPage() },
    { name: '404.html', fn: () => generate404Page() }
  ];

  for (const page of pages) {
    try {
      const html = page.fn();
      const outPath = path.join(OUTPUT_DIR, page.name);
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(outPath, html);
      console.log(`  ✅ ${page.name}`);
    } catch (e) {
      console.error(`  ❌ ${page.name}: ${e.message}`);
    }
  }

  // CSS 복사
  console.log('\n📦 CSS 번들링...');
  const cssBundle = bundleCssFile('./src/styles/main.css');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'styles.css'), cssBundle);
  console.log('  ✅ styles.css');

  // 정적 파일 복사
  console.log('\n📦 정적 파일 복사...');
  const staticFiles = [
    'favicon.svg',
    'favicon.ico',
    'favicon-placeholder.svg',
    'CNAME'
  ];

  // CNAME을 m.gamerscrawl.com으로 설정
  fs.writeFileSync(path.join(OUTPUT_DIR, 'CNAME'), 'm.gamerscrawl.com');
  console.log('  ✅ CNAME (m.gamerscrawl.com)');

  // docs에서 정적 파일 복사
  for (const file of staticFiles.filter(f => f !== 'CNAME')) {
    const srcPath = path.join('./docs', file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(OUTPUT_DIR, file));
      console.log(`  ✅ ${file}`);
    }
  }

  // games 폴더 복사 (게임 상세 페이지)
  console.log('\n📦 게임 페이지 복사...');
  const gamesDir = './docs/games';
  const mobileGamesDir = path.join(OUTPUT_DIR, 'games');

  if (fs.existsSync(gamesDir)) {
    copyDirSync(gamesDir, mobileGamesDir);
    console.log('  ✅ games/ 복사 완료');
  }

  // trend 폴더 복사
  console.log('\n📦 트렌드 페이지 복사...');
  const trendDir = './docs/trend';
  const mobileTrendDir = path.join(OUTPUT_DIR, 'trend');

  if (fs.existsSync(trendDir)) {
    copyDirSync(trendDir, mobileTrendDir);
    console.log('  ✅ trend/ 복사 완료');
  }

  // sitemap 복사
  if (fs.existsSync('./docs/sitemap.xml')) {
    let sitemap = fs.readFileSync('./docs/sitemap.xml', 'utf8');
    sitemap = sitemap.replace(/https:\/\/gamerscrawl\.com/g, 'https://m.gamerscrawl.com');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemap);
    console.log('  ✅ sitemap.xml (URL 변환)');
  }

  // robots.txt
  fs.writeFileSync(path.join(OUTPUT_DIR, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: https://m.gamerscrawl.com/sitemap.xml`);
  console.log('  ✅ robots.txt');

  console.log('\n✅ 모바일 빌드 완료! (docs-mobile/)');
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

generateMobilePages().catch(console.error);
