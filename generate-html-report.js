require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { PurgeCSS } = require('purgecss');
const { guardHoverRules } = require('./src/build/css-hover-guard');
const buildCache = require('./build-cache');

// 커맨드라인 인자 파싱
let isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');

// 통합 반응형 빌드 (PC/모바일 단일 빌드)

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
const WIKI_DIR = './data/wiki';
const FEED_ASSETS_DIR = './assets/feed';
const { ensureDir, collectHtmlFilesUnderDir } = require('./src/build/utils');
const i18n = require('./src/i18n');
const { buildEditions, writeSitemaps } = require('./src/build/editions');
const { CSS_ASSET_FILES, computeCssAssetVersion, ensureDocsCssAssetCopies } = require('./src/build/css-version');
const { buildServiceWorker } = require('./src/build/service-worker');
let currentCssAssetVersion = '';

function getCssBundlesForDocPath(relativePath) {
  // Edition pages live under /ja/, /zh-cn/, /ko/, /zh-tw/ and use the same bundles as the English root pages.
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^(?:ja|zh-cn|ko|zh-tw)\//, '');
  const bundles = ['/styles-core.css'];
  const needsGameCss =
    normalized === 'index.html' || // 홈 상단 순위 요약(.rk)
    normalized === 'rankings.html' ||
    normalized === 'steam.html' ||
    normalized.startsWith('games/') ||
    normalized.startsWith('rankings/') ||
    normalized.startsWith('trending/') || // 트렌딩 (.rk)
    normalized.startsWith('steam/') ||
    normalized.startsWith('about/') || // 사이트 소개 (.rk)
    normalized.startsWith('privacy/'); // 개인정보처리방침 (.rk, 2026-09-09 템플릿화)

  if (normalized === 'games/index.html') {
    bundles.push('/styles-catalog.css');
  } else if (needsGameCss) {
    bundles.push('/styles-game.css');
  }
  // tech/ 번들 분기는 2026-09-09 제거 (테크 페이지 생성 폐기)

  return bundles.map(withCssAssetVersion);
}

function withCssAssetVersion(href) {
  const cssHref = String(href || '').trim();
  if (!cssHref || !currentCssAssetVersion) return cssHref;
  if (/^\/styles(?:-[a-z]+)?\.[a-f0-9]{8}\.css$/.test(cssHref)) return cssHref;
  if (!cssHref.startsWith('/styles') || !cssHref.endsWith('.css') || cssHref.includes('?') || cssHref.includes('#')) {
    return cssHref;
  }
  return cssHref.replace(/\.css$/, `.${currentCssAssetVersion}.css`);
}

function renderDocsCssLinks(cssFiles, html) {
  return require('./src/build/css-links').renderCssLinks(cssFiles, path.resolve('docs'), html);
}

function rewriteDocsStylesheetLinks(docsDir, includePrefixes = null) {
  const htmlFiles = [];
  collectHtmlFilesUnderDir(docsDir, htmlFiles);
  const localCssHref = String.raw`\/styles(?:[.-][a-z0-9-]+)*\.css(?:\?[^"\s>]+)?`;
  const stylesheetLink = String.raw`[ \t]*<link\s+rel="stylesheet"\s+href="${localCssHref}">\r?\n?`;
  const preloadLink = String.raw`[ \t]*<link\s+rel="preload"\s+href="${localCssHref}"[^>]*>\s*<noscript>\s*<link\s+rel="stylesheet"\s+href="${localCssHref}">\s*<\/noscript>\r?\n?`;
  const styleLinksBlockRe = new RegExp(`(?:${stylesheetLink}|${preloadLink})+`, 'i');
  const localCssTagSearchRe = new RegExp(String.raw`<link\b[^>]*\bhref="${localCssHref}"[^>]*>`, 'i');
  const localCssTagRe = new RegExp(String.raw`[ \t]*<link\b[^>]*\bhref="${localCssHref}"[^>]*>\r?\n?`, 'gi');
  let changedCount = 0;

  for (const filePath of htmlFiles) {
    let html;
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      continue;
    }

    const relPath = path.relative(docsDir, filePath);
    if (includePrefixes) {
      const relPathNorm = relPath.replace(/\\/g, '/');
      if (!includePrefixes.some((p) => relPathNorm.startsWith(p))) continue;
    }
    const cssFiles = getCssBundlesForDocPath(relPath);
    const cssLinks = renderDocsCssLinks(cssFiles, html);
    let replacedHtml = html;
    const headCloseIndex = html.search(/<\/head>/i);
    const firstLocalCssIndex = html.search(localCssTagSearchRe);

    if (headCloseIndex !== -1 && firstLocalCssIndex !== -1 && firstLocalCssIndex < headCloseIndex) {
      const headHtml = html.slice(0, headCloseIndex);
      const tailHtml = html.slice(headCloseIndex);
      const cleanedHead = headHtml
        .replace(/<style\b[^>]*\bdata-layout-css="[^"]*"[^>]*>[\s\S]*?<\/style>\s*/gi, '')
        .replace(/[ \t]*<script data-css-loader>[\s\S]*?<\/script>\r?\n?/gi, '')
        .replace(localCssTagRe, '')
        .replace(/[ \t]*<n\s*oscript>\s*<\/noscript>\r?\n?/gi, '')
        .replace(/[ \t]*<noscript>\s*<\/noscript>\r?\n?/gi, '');
      const mainCssCommentRe = /([ \t]*<!--\s*메인 CSS\s*-->\s*)/i;
      if (mainCssCommentRe.test(cleanedHead)) {
        replacedHtml = `${cleanedHead.replace(mainCssCommentRe, (_, marker) => `${marker}${cssLinks}\n`)}${tailHtml}`;
      } else {
        const insertIndex = Math.min(firstLocalCssIndex, cleanedHead.length);
        replacedHtml = `${cleanedHead.slice(0, insertIndex)}${cssLinks}\n${cleanedHead.slice(insertIndex)}${tailHtml}`;
      }
    } else {
      replacedHtml = html.replace(styleLinksBlockRe, () => `${cssLinks}\n`);
    }

    if (replacedHtml !== html) {
      fs.writeFileSync(filePath, replacedHtml, 'utf8');
      changedCount += 1;
    }
  }

  console.log(`  🎨 CSS 링크 재작성: ${changedCount}개 HTML`);
}

function stripTechSidebarFromNonTechDocs(docsDir, includePrefixes = null) {
  const htmlFiles = [];
  collectHtmlFilesUnderDir(docsDir, htmlFiles);
  // 구형(인라인 카운트)과 신형(카운트 배지 스팬) 사이드바 마크업 모두 매칭
  const techSidebarGroupRe = /\r?\n?[ \t]*<div class="sidebar-category-group">\s*<div class="home-card-header"><a href="\/tech\/" class="home-card-title-link"><h2 class="home-card-title">테크<\/h2><\/a><\/div>\s*<div class="sidebar-category-list">[\s\S]*?<a href="\/tech\/vibecoding\/" class="sidebar-category-item">\s*<span class="sidebar-category-name">바이브코딩(?: \(\d+\))?<\/span>(?:<span class="sidebar-category-count">\d+<\/span>)?\s*<\/a>\s*<\/div>\s*<\/div>/g;
  let changedCount = 0;

  for (const filePath of htmlFiles) {
    const relPath = path.relative(docsDir, filePath).replace(/\\/g, '/');
    if (relPath.startsWith('tech/')) continue;
    if (includePrefixes && !includePrefixes.some((p) => relPath.startsWith(p))) continue;

    let html;
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      continue;
    }

    const nextHtml = html.replace(techSidebarGroupRe, '');
    if (nextHtml !== html) {
      fs.writeFileSync(filePath, nextHtml, 'utf8');
      changedCount += 1;
    }
  }

  console.log(`  🧹 비테크 페이지 테크 사이드바 제거: ${changedCount}개 HTML`);
}

// CSV 스냅샷에서 일 최고순위 계산
function calculateBestRanksFromSnapshots(date) {
  const rankingsDir = `${SNAPSHOTS_DIR}/rankings`;
  if (!fs.existsSync(rankingsDir)) return null;

  const bestRanks = {};
  const platforms = ['ios', 'aos'];
  const categories = ['grossing', 'free'];
  const countries = ['kr', 'jp', 'us', 'cn', 'tw'];

  for (const platform of platforms) {
    for (const cat of categories) {
      for (const country of countries) {
        // 중국 안드로이드는 없음
        if (platform === 'aos' && country === 'cn') continue;

        const csvFile = `${rankingsDir}/${date}_${platform}_${country}_${cat}.csv`;
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

// 히스토리 파일에 bestRanks 업데이트
function updateHistoryBestRanks(date, bestRanks) {
  const historyFile = `${HISTORY_DIR}/${date}.json`;
  if (!fs.existsSync(historyFile)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    data.bestRanks = bestRanks;
    fs.writeFileSync(historyFile, JSON.stringify(data), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

// 일간 히스토리 파일 저장 (게임 상세 페이지의 순위 히스토리 소스)
function saveDailyHistorySnapshot(date, cache) {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }

  const historyFile = `${HISTORY_DIR}/${date}.json`;
  let existing = null;

  if (fs.existsSync(historyFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    } catch (e) {
      existing = null;
    }
  }

  const data = { ...cache };
  if (existing?.bestRanks && !data.bestRanks) {
    data.bestRanks = existing.bestRanks;
  }

  fs.writeFileSync(historyFile, JSON.stringify(data), 'utf8');
  console.log(`📁 일간 히스토리 저장: ${historyFile}`);
}

// CSV 스냅샷에서 일 최고순위 기반 rankings 배열 생성
function getBestRankingsFromCSV(date, country, platform) {
  const rankingsDir = `${SNAPSHOTS_DIR}/rankings`;
  const csvPlatform = platform === 'android' ? 'aos' : platform;
  const csvPath = `${rankingsDir}/${date}_${csvPlatform}_${country}_grossing.csv`;

  if (!fs.existsSync(csvPath)) return null;

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n').slice(1); // 헤더 제외

  const bestRanks = {}; // appId -> { rank, title }

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 4) continue;

    const rank = parseInt(parts[1], 10);
    const appId = parts[2];
    let title = parts.slice(3).join(',').replace(/\r/g, '').trim().replace(/^"|"$/g, '');

    if (isNaN(rank)) continue;

    const key = appId || title;
    if (!bestRanks[key] || rank < bestRanks[key].rank) {
      bestRanks[key] = { rank, title, appId };
    }
  }

  // 최고 순위 기준 정렬
  return Object.values(bestRanks)
    .sort((a, b) => a.rank - b.rank)
    .map(item => ({
      title: item.title,
      developer: '',
      icon: '',
      appId: item.appId
    }));
}

// history의 rankings.grossing을 CSV 기반으로 업데이트
function updateHistoryRankingsFromCSV(date) {
  const historyFile = `${HISTORY_DIR}/${date}.json`;
  if (!fs.existsSync(historyFile)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    if (!data.rankings) data.rankings = {};
    if (!data.rankings.grossing) data.rankings.grossing = {};

    const countries = ['kr', 'jp', 'us', 'tw', 'cn'];
    const platforms = [
      { csv: 'ios', json: 'ios' },
      { csv: 'aos', json: 'android' }
    ];

    let updated = false;

    for (const country of countries) {
      if (!data.rankings.grossing[country]) {
        data.rankings.grossing[country] = {};
      }

      for (const p of platforms) {
        // 중국은 Android 제외
        if (country === 'cn' && p.json === 'android') continue;

        const csvRankings = getBestRankingsFromCSV(date, country, p.json);
        if (csvRankings && csvRankings.length > 0) {
          // 기존 데이터에서 developer, icon 가져오기
          const existing = data.rankings.grossing[country]?.[p.json] || [];
          const existingMap = {};
          for (const app of existing) {
            if (app.appId) existingMap[app.appId] = app;
            if (app.title) existingMap[app.title] = app;
          }

          // CSV 기반 rankings에 기존 메타데이터 병합
          const newRankings = csvRankings.map(item => {
            const ex = existingMap[item.appId] || existingMap[item.title] || {};
            return {
              title: item.title,
              developer: ex.developer || item.developer || '',
              icon: ex.icon || item.icon || '',
              appId: item.appId || ex.appId || ''
            };
          });

          data.rankings.grossing[country][p.json] = newRankings;
          updated = true;
        }
      }
    }

    if (updated) {
      fs.writeFileSync(historyFile, JSON.stringify(data), 'utf8');
    }
    return updated;
  } catch (e) {
    console.error(`Error updating history rankings: ${e.message}`);
    return false;
  }
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
  fetchRankings,
  fetchMetacriticGames
} = require('./src/crawlers');

const { loadPopularGames, savePopularGames, shouldFetchPopularGames } = require('./src/crawlers/analytics');

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
 * CSS 압축 (minify)
 * - 주석 제거, 불필요한 공백/줄바꿈 제거
 * @param {string} css - 원본 CSS
 * @returns {string} 압축된 CSS
 */
function minifyCss(css) {
  return css
    // 주석 제거 (/* ... */)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 연속 공백을 하나로
    .replace(/\s+/g, ' ')
    // 셀렉터/속성 주변 공백 제거 ('+' 제외 — calc(a + b)의 + 양쪽 공백은 CSS 규격상 필수)
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    // 세미콜론 뒤 공백 제거 (속성 간)
    .replace(/;\s*/g, ';')
    // 중괄호 뒤 공백 제거
    .replace(/}\s*/g, '}')
    // 시작 공백 제거
    .trim();
}

const EDITION_PREFIXES = i18n.EDITIONS.map((e) => e.prefix).filter(Boolean);
// PurgeCSS 동적 클래스 safelist (런타임 JS에서 classList.add/toggle/className으로 추가되는 클래스)
const PURGECSS_SAFELIST = require('./src/build/css-safelist');

// PurgeCSS: docs/ 내 CSS 번들에서 미사용 CSS 제거
async function purgeCssInDocs(docsDir) {
  const bundles = [
    {
      css: `${docsDir}/styles-core.css`,
      // 게임 상세는 정적 HTML 이 없고 요청 시 렌더링되므로 템플릿 원본에서 클래스를 보존한다.
      content: [`${docsDir}/**/*.html`, './src/templates/pages/game.js', './src/templates/helpers/game-rank-summary.js'],
      label: 'styles-core.css',
    },
    {
      css: `${docsDir}/styles-game.css`,
      content: [
        `${docsDir}/index.html`,
        `${docsDir}/games/**/*.html`,
        // 게임 상세는 CSS 정리 이후 생성되므로 새 클래스도 원본에서 보존한다.
        './src/templates/pages/game.js',
        './src/templates/helpers/game-rank-summary.js',
        `${docsDir}/rankings/**/*.html`,
        `${docsDir}/steam/**/*.html`,
        `${docsDir}/about/**/*.html`,
        ...EDITION_PREFIXES.flatMap((p) => [`${docsDir}${p}/index.html`, `${docsDir}${p}/games/**/*.html`, `${docsDir}${p}/rankings/**/*.html`, `${docsDir}${p}/steam/**/*.html`, `${docsDir}${p}/about/**/*.html`]),
      ],
      label: 'styles-game.css',
    },
    {
      css: `${docsDir}/styles-catalog.css`,
      content: [`${docsDir}/games/index.html`, ...EDITION_PREFIXES.map((p) => `${docsDir}${p}/games/index.html`), './games/index.html'],
      label: 'styles-catalog.css',
    },
  ];

  console.log('\n🧹 PurgeCSS 실행 중...');
  for (const bundle of bundles) {
    if (!fs.existsSync(bundle.css)) continue;
    const originalSize = Buffer.byteLength(fs.readFileSync(bundle.css), 'utf8');
    if (originalSize === 0) continue;

    try {
      const result = await new PurgeCSS().purge({
        content: bundle.content,
        css: [bundle.css],
        safelist: PURGECSS_SAFELIST,
        fontFace: true,
        keyframes: true,
        variables: true,
      });

      if (result.length > 0 && result[0].css) {
        fs.writeFileSync(bundle.css, result[0].css, 'utf8');
        const purgedSize = Buffer.byteLength(result[0].css, 'utf8');
        const reduction = ((1 - purgedSize / originalSize) * 100).toFixed(1);
        console.log(`  ✅ ${bundle.label}: ${(originalSize / 1024).toFixed(0)}KB → ${(purgedSize / 1024).toFixed(0)}KB (${reduction}% 감소)`);
      }
    } catch (e) {
      console.warn(`  ⚠️ PurgeCSS 실패 (${bundle.label}): ${e.message}`);
    }
  }
}

async function main() {
  let news, community, rankings, steam, youtube, chzzk;

  // KST 시간 계산
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const currentHour = kstNow.getUTCHours();

  // 오늘 히스토리 파일 존재 여부로 크롤링 필요 판단
  const _kstToday = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const todayHistoryFile = `${HISTORY_DIR}/${_kstToday}.json`;
  const needsCrawling = !fs.existsSync(todayHistoryFile);

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
  } else {
    // 일반 모드: 시간대별 조건부 크롤링
    const existingCache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : null;

    // 순위는 빌드마다(1시간) 항상 수집
    console.log('\n🔄 5대 마켓 순위 데이터 수집 중 (200위까지)...\n');
    rankings = await fetchRankings(gplay, store);

    console.log('\n🎮 Steam 순위 데이터 수집 중...');
    steam = await fetchSteamRankings(axios, cheerio);

    // 뉴스/커뮤니티/유튜브/치지직은 하루 한 번만
    if (needsCrawling || !existingCache) {
      console.log(`\n🕐 현재 ${currentHour}시 (KST) - 오늘 첫 실행, 전체 크롤링\n`);

      console.log('📰 뉴스 크롤링 중 (인벤, 루리웹, 게임메카, 디스이즈게임)...\n');
      news = await fetchNews(axios, cheerio);
      const totalNews = news.inven.length + news.ruliweb.length + news.gamemeca.length + news.thisisgame.length;
      console.log(`\n  총 ${totalNews}개 뉴스 수집 완료`);

      console.log('\n💬 커뮤니티 인기글 수집 중 (루리웹, 아카라이브)...');
      community = await fetchCommunityPosts(axios, cheerio, FirecrawlClient, FIRECRAWL_API_KEY);

      console.log('\n📺 YouTube 인기 동영상 수집 중...');
      youtube = await fetchYouTubeVideos(axios, YOUTUBE_API_KEY);

      console.log('\n📡 치지직 라이브 수집 중...');
      chzzk = await fetchChzzkLives(axios);
    } else {
      console.log(`\n🕐 현재 ${currentHour}시 (KST) - 뉴스/커뮤니티/유튜브/치지직 캐시 사용\n`);
      news = existingCache.news;
      community = existingCache.community;
      youtube = existingCache.youtube;
      chzzk = existingCache.chzzk;
    }

    // 캐시 저장 (출시 예정 게임 수집은 2026-09-09 /upcoming/ 폐기와 함께 제거)
    const cache = { timestamp: new Date().toISOString(), news, community, rankings, steam, youtube, chzzk };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('\n💾 캐시 저장 완료');

    // 빌드마다 CSV 스냅샷 저장 (시각은 30분 단위로 내림)
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const snapshotDate = kst.toISOString().split('T')[0];
    const hours = String(kst.getUTCHours()).padStart(2, '0');
    const minutes = String(Math.floor(kst.getUTCMinutes() / 30) * 30).padStart(2, '0');
    const snapshotTime = `${hours}:${minutes}`;

    // 게임 상세 페이지의 일/주/월 순위 히스토리는 history/*.json을 사용한다.
    saveDailyHistorySnapshot(snapshotDate, cache);

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

    // 일 최고순위 업데이트 (CSV 스냅샷 기반)
    const bestRanks = calculateBestRanksFromSnapshots(snapshotDate);
    if (bestRanks) {
      if (updateHistoryBestRanks(snapshotDate, bestRanks)) {
        console.log(`📊 일 최고순위 업데이트: ${snapshotDate}`);
      }
    }

    // rankings.grossing 배열도 CSV 기반으로 업데이트 (재발 방지)
    if (updateHistoryRankingsFromCSV(snapshotDate)) {
      console.log(`📋 rankings 배열 업데이트: ${snapshotDate}`);
    }
  }

  console.log('\n📄 GAMERSCROLL 일일 보고서 생성 중...');

  // HTML 생성
  console.log('\n📄 GAMERSCROLL 일일 보고서 생성 중...');

  const data = { rankings, news, steam, youtube, chzzk, community };

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

  // CSS 파일 번들링 + 압축 (코어/페이지군 분리)
  let didBundleCss = false;
  const generatedCssFiles = [];
  const cssFilename = '/styles-core.css';
  const cssBundles = [
    { entry: './src/styles/bundle-core.css', output: './styles-core.css', publicPath: '/styles-core.css', label: 'styles-core.css', required: true },
    { entry: './src/styles/bundle-catalog.css', output: './styles-catalog.css', publicPath: '/styles-catalog.css', label: 'styles-catalog.css', required: true },
    { entry: './src/styles/bundle-game.css', output: './styles-game.css', publicPath: '/styles-game.css', label: 'styles-game.css', required: false }
  ];

  const buildCssBundle = (bundle) => {
    const bundledCss = guardHoverRules(bundleCssFile(bundle.entry));
    const minifiedCss = minifyCss(bundledCss);
    fs.writeFileSync(bundle.output, minifiedCss, 'utf8');
    const originalSize = Buffer.byteLength(bundledCss, 'utf8');
    const minifiedSize = Buffer.byteLength(minifiedCss, 'utf8');
    const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
    console.log(`  ✅ ${bundle.label} 압축: ${(originalSize / 1024).toFixed(0)}KB → ${(minifiedSize / 1024).toFixed(0)}KB (${reduction}% 감소)`);
    generatedCssFiles.push(bundle.publicPath);
  };

  // 퀵 모드 CSS 동결: src/styles가 빌드 캐시와 동일하고 docs/에 배포본(purge 완료)
  // 해시 CSS가 이미 있으면 번들링·PurgeCSS·재해시 연쇄를 건너뛰고 기존 해시를
  // 그대로 재사용한다. src/styles에 커밋되지 않은 수정이 있으면 동결하지 않는다
  // (CSS 편집을 미리보려면 전체 빌드). git 기준 판정이라 CI/로컬 OS 차이에 무관하다.
  let cssFreezeVersion = '';
  // CI는 동결 금지: CI가 data-cache 신선도로 isQuickMode를 켜는 경로가 있어
  // process.env.CI에서는 항상 전체 CSS 파이프라인을 탄다.
  if (isQuickMode && !process.env.CI) {
    let srcStylesClean = false;
    try {
      const { execSync } = require('child_process');
      srcStylesClean = execSync('git status --porcelain -- src/styles', { encoding: 'utf8' }).trim() === '';
    } catch (e) {
      srcStylesClean = false;
    }
    const docsCssVersion = computeCssAssetVersion('./docs');
    // docs/에 존재하는 모든 안정 번들마다 동결 해시 사본이 있어야 동결 가능
    const allHashedCopiesPresent = !!docsCssVersion && CSS_ASSET_FILES.every((name) => {
      if (!fs.existsSync(`./docs/${name}`)) return true;
      return fs.existsSync(`./docs/${name.replace(/\.css$/, `.${docsCssVersion}.css`)}`);
    });
    if (
      docsCssVersion &&
      srcStylesClean &&
      allHashedCopiesPresent
    ) {
      cssFreezeVersion = docsCssVersion;
      console.log(`  🧊 퀵 모드 CSS 동결: 배포 해시 ${docsCssVersion} 재사용 (번들링·PurgeCSS 생략)`);
    }
  }
  const isCssFrozen = !!cssFreezeVersion;

  if (!isCssFrozen) for (const bundle of cssBundles) {
    try {
      buildCssBundle(bundle);
      if (bundle.publicPath === '/styles-core.css') {
        didBundleCss = true;
      }
    } catch (e) {
      if (bundle.required) {
        console.error(`⚠️ CSS 번들링 실패(${bundle.label}) → 폴백 적용: ${e.message}`);
      } else {
        console.warn(`  ⚠️ 선택 CSS 번들 스킵(${bundle.label}): ${e.message}`);
      }
      fs.writeFileSync(bundle.output, '', 'utf8');
      generatedCssFiles.push(bundle.publicPath);
    }
  }

  const cssHashTargets = CSS_ASSET_FILES.map(filename => `./${filename}`);
  const cssContentHash = didBundleCss
    ? crypto
        .createHash('md5')
        .update(cssHashTargets.map((p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')).join('\n'))
        .digest('hex')
        .slice(0, 8)
    : null;
  currentCssAssetVersion = isCssFrozen ? cssFreezeVersion : (cssContentHash || '');
  if (!isCssFrozen) try {
    const rootFiles = fs.readdirSync('.');
    for (const file of rootFiles) {
      if (
        /^styles(?:-[a-z]+)?\.[a-f0-9]{8}\.css$/.test(file) &&
        (!currentCssAssetVersion || !file.endsWith(`.${currentCssAssetVersion}.css`))
      ) {
        fs.unlinkSync(`./${file}`);
      }
    }
    if (currentCssAssetVersion) {
      for (const bundle of cssBundles) {
        if (!fs.existsSync(bundle.output)) continue;
        const versionedOutput = bundle.output.replace(/\.css$/, `.${currentCssAssetVersion}.css`);
        fs.copyFileSync(bundle.output, versionedOutput);
      }
    }
  } catch (e) {
    console.warn(`  ⚠️ 해시 CSS 파일 생성 실패: ${e.message}`);
  }

  // 전역 CSS 파일명 설정 (템플릿에서 사용)

  // 캐시 버전 해시 (데이터 변경 시 브라우저 캐시 자동 무효화)
  const searchVersionPath = path.join('./docs', 'games', '.search-version');
  const searchIndexVersion = fs.existsSync(searchVersionPath) ? fs.readFileSync(searchVersionPath, 'utf8').trim() : '';
  const rankingsCacheVersion = crypto.createHash('md5').update(JSON.stringify(data.rankings || {})).digest('hex').slice(0, 8);
  const steamCacheVersion = crypto.createHash('md5').update(JSON.stringify(data.steam || {})).digest('hex').slice(0, 8);

  // 루트 디렉토리의 이전 해시 CSS 파일 정리
  if (!isCssFrozen) try {
    const rootFiles = fs.readdirSync('.');
    for (const file of rootFiles) {
      if (
        /^styles(?:-[a-z]+)?\.[a-f0-9]{8}\.css$/.test(file) &&
        (!currentCssAssetVersion || !file.endsWith(`.${currentCssAssetVersion}.css`))
      ) {
        fs.unlinkSync(`./${file}`);
      }
    }
  } catch (e) {
    // 정리 실패는 무시
  }

  // 고아 기사 페이지 정리: 소스 JSON이 삭제된 기사의 docs/ 페이지 디렉토리를
  // 제거한다. 소스가 사라져도 옛 HTML(구버전 인라인 스크립트 포함)이 200으로
  // 계속 서빙되는 화석 페이지를 방지한다. 사이트맵에는 원래 없던 페이지들이다.
  try {
    const orphanTargets = [
      { pagesDir: './docs/wiki/business', sourceDir: path.join(__dirname, 'data', 'wiki', 'business') },
      { pagesDir: './docs/wiki/history', sourceDir: path.join(__dirname, 'data', 'wiki', 'history') },
      { pagesDir: './docs/wiki/knowledge', sourceDir: path.join(__dirname, 'data', 'wiki', 'knowledge') },
      // tech/normal: 2026-08-02 매거진 재배치 후 잔여 화석 페이지 제거 (소스는 .gitkeep만 남은 빈 dir)
      { pagesDir: './docs/tech/normal', sourceDir: path.join(__dirname, 'data', 'tech', 'normal') }
    ];
    for (const target of orphanTargets) {
      if (!fs.existsSync(target.pagesDir) || !fs.existsSync(target.sourceDir)) continue;
      const validSlugs = new Set(
        fs.readdirSync(target.sourceDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace(/\.json$/, ''))
      );
      for (const entry of fs.readdirSync(target.pagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || validSlugs.has(entry.name)) continue;
        fs.rmSync(path.join(target.pagesDir, entry.name), { recursive: true, force: true });
        console.log(`  🧹 고아 페이지 제거: ${target.pagesDir.replace('./docs/', '')}/${entry.name}`);
      }
    }
    // tech/normal 허브 화석 완전 제거 (매거진 재배치 완료 — deploy 브랜치 seed로 되살아나는 index.html 포함)
    if (fs.existsSync('./docs/tech/normal')) {
      fs.rmSync('./docs/tech/normal', { recursive: true, force: true });
      console.log('  🧹 화석 허브 제거: tech/normal (매거진 재배치 완료)');
    }
  } catch (e) {
    // 정리 실패는 무시 (빌드는 계속)
  }

  // ========== 증분 빌드 캐시 로드 ==========
  const incrementalCache = buildCache.loadCache();
  let forceFullRebuild = false;

  // CSS 또는 템플릿 변경 시 전체 재빌드
  // CSS 동결 모드(프리뷰)에서는 전체 재빌드 강제를 걸지 않는다. 변경된 데이터의
  // 페이지는 어차피 최신 템플릿으로 재생성되고, 나머지 페이지는 배포본 그대로 둔다.
  // CI/풀 빌드 경로는 기존과 동일하게 세 가지 변경 감지를 모두 수행한다.
  if (!isCssFrozen) {
    if (buildCache.checkCssChanged(incrementalCache, cssContentHash)) {
      forceFullRebuild = true;
      incrementalCache.meta.cssHash = cssContentHash;
    }
    if (buildCache.checkTemplateChanged(incrementalCache)) {
      forceFullRebuild = true;
      incrementalCache.meta.templateVersion = buildCache.TEMPLATE_VERSION;
    }
    if (buildCache.checkTemplateJsChanged(incrementalCache)) {
      forceFullRebuild = true;
    }
  }

  if (forceFullRebuild) {
    console.log('  🔄 CSS/템플릿 변경 → 전체 재빌드');
  } else {
    console.log('  ⚡ 증분 빌드 모드 (변경된 파일만 빌드)');
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

  // docs 폴더 동기화 (로컬 개발 환경용)
  // 통합 반응형 빌드: 단일 docs/ 폴더에 출력
  const DOCS_DIR = './docs';
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
  require('./src/build/publisher-marks').copyPublisherMarks(__dirname, path.resolve(DOCS_DIR));
  // Edition build: every static page (home, rankings + sub pages, steam, games hub, about, privacy, 404, client data)
  // is rendered once per edition: en → docs/, others → docs/<prefix>/.
  fs.rmSync(FEED_ASSETS_DIR, { recursive: true, force: true });
  ensureDir(FEED_ASSETS_DIR);
  const editionResults = buildEditions({
    docsDir: DOCS_DIR,
    feedDir: FEED_ASSETS_DIR,
    cssFilename,
    cssVersion: currentCssAssetVersion,
    gamesData,
    popularGames: popularGamesData.games || [],
    data,
    rankingsCacheVersion,
    steamCacheVersion
  });
  const runtimeAssetVersion = crypto.createHash('md5').update(editionResults.map((r) => r.assets.version).join('|')).digest('hex').slice(0, 8);
  const englishAssets = editionResults.find((r) => r.code === 'en').assets;

  // 위키 폴더(./wiki → docs/wiki) 복사는 2026-09-09 폐기. 배포본에 남은 docs/wiki 잔재는 매 빌드 제거한다.
  try {
    if (fs.existsSync(`${DOCS_DIR}/wiki`)) {
      fs.rmSync(`${DOCS_DIR}/wiki`, { recursive: true, force: true });
      console.log('  🧹 docs/wiki 잔재 제거 (위키 폐기)');
    }
    // 매거진·리포트 섹션 폐기: deploy 브랜치 seed 로 되살아나는 docs/magazine, docs/reports 제거
    for (const dead of ['magazine', 'reports']) {
      if (fs.existsSync(`${DOCS_DIR}/${dead}`)) {
        fs.rmSync(`${DOCS_DIR}/${dead}`, { recursive: true, force: true });
        console.log(`  🧹 docs/${dead} 잔재 제거 (매거진·리포트 폐기)`);
      }
    }
    if (fs.existsSync(`${DOCS_DIR}/rss.xml`)) {
      fs.rmSync(`${DOCS_DIR}/rss.xml`, { force: true });
      console.log('  🧹 docs/rss.xml 잔재 제거 (RSS 폐기)');
    }
    if (fs.existsSync(`${DOCS_DIR}/upcoming`)) {
      fs.rmSync(`${DOCS_DIR}/upcoming`, { recursive: true, force: true });
      console.log('  🧹 docs/upcoming 잔재 제거 (출시 게임 폐기)');
    }
  } catch (err) {
    console.warn('  ⚠️ 폐기 섹션 잔재 제거 실패:', err.message);
  }

  // tech 폴더 복사
  try {
    const srcTech = './tech';
    if (fs.existsSync(srcTech)) {
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
      copyDir(srcTech, `${DOCS_DIR}/tech`);
    }
  } catch (err) {
    console.warn('  ⚠️ tech 폴더 복사 실패:', err.message);
  }

  if (!isCssFrozen) try {
    // 이전 해시 CSS 파일 삭제 (docs/ 내 styles.*.css)
    const docsFiles = fs.readdirSync(DOCS_DIR);
    for (const file of docsFiles) {
      if (/^styles(?:-[a-z]+)?\.[a-f0-9]{8}\.css$/.test(file)) {
        fs.unlinkSync(`${DOCS_DIR}/${file}`);
      }
    }

    // 기사 섹션과 함께 없앤 묶음: 이전 배포본을 시드로 쓰는 빌드에 남아 있으면 지운다
    for (const stale of ['styles-report.css', 'styles-article.css']) {
      if (fs.existsSync(`${DOCS_DIR}/${stale}`)) fs.unlinkSync(`${DOCS_DIR}/${stale}`);
    }

    for (const filename of CSS_ASSET_FILES) {
      const srcPath = `./${filename}`;
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, `${DOCS_DIR}/${filename}`);
        if (currentCssAssetVersion) {
          const versionedFilename = filename.replace(/\.css$/, `.${currentCssAssetVersion}.css`);
          const versionedSrcPath = `./${versionedFilename}`;
          if (fs.existsSync(versionedSrcPath)) {
            fs.copyFileSync(versionedSrcPath, `${DOCS_DIR}/${versionedFilename}`);
          }
        }
      } else {
        fs.writeFileSync(`${DOCS_DIR}/${filename}`, '', 'utf8');
      }
    }
  } catch (e) {
    console.error(`⚠️ CSS 복사 실패(docs): ${e.message}`);
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

  // 공통 런타임 스크립트 동기화 (assets/layout-core.js, assets/layout-runtime.js)
  try {
    const docsAssetsDir = `${DOCS_DIR}/assets`;
    if (!fs.existsSync(docsAssetsDir)) {
      fs.mkdirSync(docsAssetsDir, { recursive: true });
    }
    // deferred 카드 데이터 JSON 동기화 (assets/feed/*.json)
    const srcFeedDir = './assets/feed';
    const destFeedDir = `${docsAssetsDir}/feed`;
    if (fs.existsSync(srcFeedDir)) {
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
      if (fs.existsSync(destFeedDir)) {
        fs.rmSync(destFeedDir, { recursive: true, force: true });
      }
      copyDirRecursive(srcFeedDir, destFeedDir);
    }

    // 셀프호스팅 벤더 에셋 동기화 (버전 경로라 존재하면 스킵 — deploy 브랜치 seed로 CI 간에도 유지)
    // 경로 버전은 layout.js(ApexCharts)의 참조와 일치해야 한다.
    const apexSrc = './node_modules/apexcharts/dist/apexcharts.min.js';
    const apexDest = `${docsAssetsDir}/apexcharts-3.45.1.min.js`;
    if (!fs.existsSync(apexDest) && fs.existsSync(apexSrc)) {
      fs.copyFileSync(apexSrc, apexDest);
      console.log('  ✅ ApexCharts 셀프호스팅 동기화 (docs/assets/apexcharts-3.45.1.min.js)');
    }
  } catch (e) {
    console.error(`⚠️ 런타임 스크립트 복사 실패(docs/assets): ${e.message}`);
  }

  // 정적 파일 복사 (파비콘, 아이콘, OG이미지 등)
  const staticFiles = ['favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'icon-192.png', 'icon-512.png', 'og-image.png', 'manifest.json'];
  staticFiles.forEach(file => {
    const srcPath = `./${file}`;
    const destPath = `${DOCS_DIR}/${file}`;
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  📋 ${file} → docs/`);
    }
  });

  // docs 전체 HTML의 스타일 링크를 페이지군 기준으로 일괄 정규화.
  if (!isCssFrozen) {
    rewriteDocsStylesheetLinks(DOCS_DIR);
    stripTechSidebarFromNonTechDocs(DOCS_DIR);
  } else {
    // 동결 모드: 스테이징 트리(tech/)에서 복사돼 들어온 페이지만
    // 정규화한다. 증분 스킵으로 스테이징에 남은 구버전 해시 링크를 동결 해시로
    // 교정하기 위함이며, games/ 등 배포본 페이지는 건드리지 않아 churn이 없다.
    const copiedTrees = ['tech/'];
    rewriteDocsStylesheetLinks(DOCS_DIR, copiedTrees);
    stripTechSidebarFromNonTechDocs(DOCS_DIR, copiedTrees);
  }

  // PurgeCSS: 사용되지 않는 CSS 제거 (docs/ 내 CSS만 대상)
  // CSS 동결 모드에서는 docs/의 배포본 CSS를 그대로 두므로 purge·재해시 불필요.
  if (!isCssFrozen) {
    await purgeCssInDocs(DOCS_DIR);

    // CSS 해시: purge 완료본 기준으로 재산출 (게임 생성기와 동일 알고리즘 공유).
    // purge 전에 발급하면 미purge 번들이 해시·배포되어 페이지마다 다른 파일을
    // 받게 되므로, 반드시 purge 이후 docs/ 산출본으로 재해시·재버전·링크 재작성한다.
    const purgedCssVersion = computeCssAssetVersion(DOCS_DIR);
    if (purgedCssVersion && purgedCssVersion !== currentCssAssetVersion) {
      console.log(`  🔁 CSS 해시 재산출(purge 후): ${currentCssAssetVersion || '(none)'} → ${purgedCssVersion}`);
    }
    currentCssAssetVersion = purgedCssVersion;
    ensureDocsCssAssetCopies(DOCS_DIR, currentCssAssetVersion);
    rewriteDocsStylesheetLinks(DOCS_DIR);
  }

  // Sitemaps: a sitemap index (docs/sitemap.xml) with one sitemap per edition (docs/sitemap-<code>.xml)
  const sitemapDate = new Date().toISOString().split('T')[0];
  const sitemapNames = writeSitemaps(DOCS_DIR, editionResults, sitemapDate);
  console.log(`📍 Sitemap index: ${sitemapNames.length} sitemaps, ${editionResults.reduce((n, r) => n + r.sitemap.length, 0)} URLs`);

  // robots.txt 생성
  // 주의: /games/ 페이지는 <meta robots="noindex,follow">이므로 Disallow 금지.
  // Disallow로 크롤 막으면 noindex를 볼 수 없어 URL-only entry로 남아 색인 동결됨.
  const robotsTxt = `# GamerScroll robots.txt
User-agent: *
Allow: /

# Sitemap
Sitemap: https://gamerscroll.com/sitemap.xml
`;
  fs.writeFileSync(`${DOCS_DIR}/robots.txt`, robotsTxt, 'utf8');
  console.log('🤖 robots.txt 생성 완료');

  // 레거시 /tech/* 301은 functions/_middleware.js가 단일 소스 (2026-08-02 전환).
  // 과거 gen-gs-redirects.js가 만들던 docs/_redirects는 CF Pages 동적 룰 상한으로
  // 전부 죽어 있던 무게였음 — 배포 seed로 되살아나지 않게 잔재를 제거한다.
  try {
    if (fs.existsSync(`${DOCS_DIR}/_redirects`)) {
      fs.unlinkSync(`${DOCS_DIR}/_redirects`);
      console.log('🧹 죽은 docs/_redirects 제거 (middleware 단일 소스)');
    }
  } catch (err) {
    // 제거 실패는 무시
  }

  // Cloudflare Pages _headers: long-cache immutable hashed CSS + images/icons.
  try {
    const headerLines = [];
    for (const bundle of cssBundles) {
      const hashedPath = withCssAssetVersion(bundle.publicPath);
      if (!/\.[a-f0-9]{8}\.css$/.test(hashedPath)) continue;
      headerLines.push(hashedPath, '  Cache-Control: public, max-age=31536000, immutable', '');
    }
    headerLines.push('/assets/images/*', '  Cache-Control: public, max-age=604800', '');
    headerLines.push('/icon-*.png', '  Cache-Control: public, max-age=2592000', '');
    headerLines.push('/favicon*', '  Cache-Control: public, max-age=2592000', '');
    // 런타임 JS는 ?v=<content-hash>로 버전되고, feed JSON은 파일명에 해시가 박혀 있어 immutable 안전.
    for (const r of editionResults) {
      headerLines.push(`/assets/${r.assets.core}`, '  Cache-Control: public, max-age=31536000, immutable', '');
      headerLines.push(`/assets/${r.assets.runtime}`, '  Cache-Control: public, max-age=31536000, immutable', '');
    }
    headerLines.push('/assets/feed/*', '  Cache-Control: public, max-age=31536000, immutable', '');
    // 벤더 에셋은 경로에 버전이 박혀 있어 immutable 안전
    headerLines.push('/assets/apexcharts-*.min.js', '  Cache-Control: public, max-age=31536000, immutable', '');
    fs.writeFileSync(`${DOCS_DIR}/_headers`, headerLines.join('\n') + '\n', 'utf8');
    console.log('🧾 _headers 생성 완료');
  } catch (err) {
    console.warn('⚠️ _headers 생성 실패:', err.message);
  }

  // Service Worker 전체 생성 (template literal)
  const swCacheVersion = `gamerscroll-${runtimeAssetVersion}${searchIndexVersion ? `-${searchIndexVersion}` : ''}`;
  const swPrecacheUrls = [
    '/',
    ...cssBundles.map((bundle) => withCssAssetVersion(bundle.publicPath)),
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    `/assets/${englishAssets.core}?v=${englishAssets.version}`,
    `/assets/${englishAssets.runtime}?v=${englishAssets.version}`
  ];
  const swContent = buildServiceWorker({ version: swCacheVersion, precache: swPrecacheUrls });
  fs.writeFileSync(`${DOCS_DIR}/service-worker.js`, swContent, 'utf8');
  console.log(`🔄 Service Worker 생성 완료: ${swCacheVersion} (CSS: ${cssFilename})`);

  // 증분 빌드 캐시 저장
  buildCache.saveCache(incrementalCache);

  console.log(`\n✅ 완료! (docs/ 통합 반응형 빌드 + sitemap 갱신)`);

}

main().catch(console.error);
