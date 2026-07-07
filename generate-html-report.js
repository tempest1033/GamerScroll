require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { PurgeCSS } = require('purgecss');
const { generateRSS } = require('./src/rss/generate-rss');
const buildCache = require('./build-cache');

// 커맨드라인 인자 파싱
let isQuickMode = process.argv.includes('--quick') || process.argv.includes('-q');
// CI 환경(GitHub Actions)에서는 draft 제외, 로컬에서는 기본 포함
const includeDrafts = !process.env.CI || process.argv.includes('--draft') || process.argv.includes('-d');

// 통합 반응형 빌드 (PC/모바일 단일 빌드)

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
const WIKI_DIR = './data/wiki';
const FEED_ASSETS_DIR = './assets/feed';
const { ensureDir, collectHtmlFilesUnderDir, externalizeDeferredJsonFromHtml } = require('./src/build/utils');
const { CSS_ASSET_FILES, computeCssAssetVersion, ensureDocsCssAssetCopies } = require('./src/build/css-version');
let currentCssAssetVersion = '';

/**
 * 발행시간 자동 기록: date가 비어있고 status === 'approved'인 기사에 현재 시각 기록
 * @param {object} article - 기사 데이터
 * @param {string} jsonFilePath - JSON 파일 경로 (write back용)
 * @param {'KST'|'UTC'} timezone - 시간대
 */
function ensurePublishDate(article, jsonFilePath, timezone) {
  if (article.date || article.status !== 'approved') return;
  const now = new Date();
  if (timezone === 'KST') {
    now.setTime(now.getTime() + 9 * 60 * 60 * 1000);
  }
  // 30분 단위 반올림
  const minutes = now.getUTCMinutes();
  const roundedMinutes = minutes < 15 ? 0 : minutes < 45 ? 30 : 60;
  if (roundedMinutes === 60) {
    now.setUTCHours(now.getUTCHours() + 1);
    now.setUTCMinutes(0);
  } else {
    now.setUTCMinutes(roundedMinutes);
  }
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  article.date = `${yyyy}-${mm}-${dd}T${hh}:${min}${timezone === 'KST' ? '+09:00' : 'Z'}`;
  // JSON 파일에 write back
  try {
    const raw = fs.readFileSync(jsonFilePath, 'utf8').replace(/^\uFEFF/, '');
    const fileData = JSON.parse(raw);
    fileData.date = article.date;
    fs.writeFileSync(jsonFilePath, JSON.stringify(fileData, null, 2), 'utf8');
    console.log(`  📅 발행시간 자동 기록: ${jsonFilePath} → ${article.date}`);
  } catch (e) {
    console.warn(`  ⚠️ 발행시간 write back 실패: ${jsonFilePath}`, e.message);
  }
}

function externalizeDeferredJsonPayloads() {
  ensureDir('./assets');
  if (fs.existsSync(FEED_ASSETS_DIR)) {
    fs.rmSync(FEED_ASSETS_DIR, { recursive: true, force: true });
  }
  ensureDir(FEED_ASSETS_DIR);

  const rootHtmlFiles = ['index.html', '404.html', 'rankings.html', 'steam.html', 'upcoming.html']
    .filter((file) => fs.existsSync(file))
    .map((file) => `./${file}`);
  const nestedHtmlFiles = [];
  ['games', 'wiki', 'tech', 'magazine'].forEach((dir) => collectHtmlFilesUnderDir(`./${dir}`, nestedHtmlFiles));
  const allHtmlFiles = [...rootHtmlFiles, ...nestedHtmlFiles];

  allHtmlFiles.forEach((filePath) => {
    try {
      const originalHtml = fs.readFileSync(filePath, 'utf8');
      const relPath = path.relative('.', filePath);
      const transformedHtml = externalizeDeferredJsonFromHtml(originalHtml, relPath, FEED_ASSETS_DIR);
      if (transformedHtml !== originalHtml) {
        fs.writeFileSync(filePath, transformedHtml, 'utf8');
      }
    } catch (e) {
      console.warn(`  ⚠️ deferred JSON 외부화 실패 (${filePath}): ${e.message}`);
    }
  });
}

function getCssBundlesForDocPath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const bundles = ['/styles-core.css'];
  const needsGameCss =
    normalized === 'rankings.html' ||
    normalized === 'steam.html' ||
    normalized === 'upcoming.html' ||
    normalized.startsWith('games/') ||
    normalized.startsWith('rankings/') ||
    normalized.startsWith('steam/') ||
    normalized.startsWith('upcoming/');

  if (normalized.startsWith('magazine/')) {
    bundles.push('/styles-report.css', '/styles-article.css');
  } else if (needsGameCss) {
    bundles.push('/styles-game.css');
  } else if (normalized.startsWith('wiki/') || normalized.startsWith('tech/')) {
    bundles.push('/styles-article.css');
  }

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

function renderDocsCssLinks(cssFiles) {
  const files = [];
  const seen = new Set();
  for (const file of cssFiles) {
    const href = String(file || '').trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    files.push(href);
  }

  const [blockingCss = '/styles-core.css', ...deferredCssFiles] = files.length > 0 ? files : ['/styles-core.css'];
  const blockingCssHtml = `  <link rel="stylesheet" href="${blockingCss}">`;
  const deferredCssHtml = deferredCssFiles.map((href) => (
    `  <link rel="preload" href="${href}" as="style" onload="this.onload=null;this.rel='stylesheet'" data-deferred-css="1"><noscript><link rel="stylesheet" href="${href}"></noscript>`
  )).join('\n');

  return deferredCssHtml ? `${blockingCssHtml}\n${deferredCssHtml}` : blockingCssHtml;
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
    const cssLinks = renderDocsCssLinks(cssFiles);
    let replacedHtml = html;
    const headCloseIndex = html.search(/<\/head>/i);
    const firstLocalCssIndex = html.search(localCssTagSearchRe);

    if (headCloseIndex !== -1 && firstLocalCssIndex !== -1 && firstLocalCssIndex < headCloseIndex) {
      const headHtml = html.slice(0, headCloseIndex);
      const tailHtml = html.slice(headCloseIndex);
      const cleanedHead = headHtml
        .replace(localCssTagRe, '')
        .replace(/[ \t]*<n\s*oscript>\s*<\/noscript>\r?\n?/gi, '')
        .replace(/[ \t]*<noscript>\s*<\/noscript>\r?\n?/gi, '');
      const mainCssCommentRe = /([ \t]*<!--\s*메인 CSS\s*-->\s*)/i;
      if (mainCssCommentRe.test(cleanedHead)) {
        replacedHtml = `${cleanedHead.replace(mainCssCommentRe, `$1${cssLinks}\n`)}${tailHtml}`;
      } else {
        const insertIndex = Math.min(firstLocalCssIndex, cleanedHead.length);
        replacedHtml = `${cleanedHead.slice(0, insertIndex)}${cssLinks}\n${cleanedHead.slice(insertIndex)}${tailHtml}`;
      }
    } else {
      replacedHtml = html.replace(styleLinksBlockRe, `${cssLinks}\n`);
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

/**
 * relatedDocs 통합 파싱 함수
 * 형식: ["wiki:slug", "wiki:category/slug", "issue:slug", "tech:category/slug",
 *        "insight:slug", "hotpick:slug", "ranking:slug"]
 * 프리픽스 없이 slug만 넣어도 자동 검색 (issue → insight → hotpick → ranking → wiki → tech 순)
 * 하위 호환: relatedArticles, relatedIssues, relatedInsights, relatedHotpicks가 있으면 폴백
 */
function parseRelatedDocs(article, currentCategory, wikiData, techData, issueReports, insightReports = [], hotpickReports = [], rankingReports = []) {
  const result = [];

  // 슬러그로 각 컬렉션 검색하는 헬퍼
  function findBySlugAuto(slug) {
    // issue → insight → hotpick → ranking → wiki → tech 순서
    let found = issueReports.find(r => r.slug === slug);
    if (found) return { type: 'issue', ...found };

    found = insightReports.find(r => r.slug === slug);
    if (found) return { type: 'insight', ...found };

    found = hotpickReports.find(r => r.slug === slug);
    if (found) return { type: 'hotpick', ...found };

    found = rankingReports.find(r => r.slug === slug);
    if (found) return { type: 'ranking', ...found };

    for (const [cat, catArticles] of Object.entries(wikiData)) {
      found = catArticles.find(a => a.slug === slug);
      if (found) return { type: 'wiki', ...found, category: cat };
    }

    for (const [cat, catArticles] of Object.entries(techData)) {
      found = catArticles.find(a => a.slug === slug);
      if (found) return { type: 'tech', ...found, category: cat };
    }

    return null;
  }

  // 1. relatedDocs가 있으면 우선 처리
  if (article.relatedDocs && article.relatedDocs.length > 0) {
    for (const doc of article.relatedDocs) {
      const colonIdx = doc.indexOf(':');

      // 프리픽스 없이 slug만 넣은 경우 → 자동 검색
      if (colonIdx === -1) {
        const found = findBySlugAuto(doc);
        if (found) result.push(found);
        continue;
      }

      const type = doc.substring(0, colonIdx);
      const pathPart = doc.substring(colonIdx + 1);
      if (!pathPart) continue;

      const parts = pathPart.split('/');
      const slug = parts.pop();
      const category = parts.length > 0 ? parts.join('/') : null;

      if (type === 'wiki') {
        if (category && wikiData[category]) {
          const found = wikiData[category].find(a => a.slug === slug);
          if (found) result.push({ type: 'wiki', ...found, category });
        } else {
          for (const [cat, catArticles] of Object.entries(wikiData)) {
            const found = catArticles.find(a => a.slug === slug);
            if (found) { result.push({ type: 'wiki', ...found, category: cat }); break; }
          }
        }
      } else if (type === 'issue') {
        const found = issueReports.find(r => r.slug === slug);
        if (found) result.push({ type: 'issue', ...found });
      } else if (type === 'tech') {
        if (category && techData[category]) {
          const found = techData[category].find(a => a.slug === slug);
          if (found) result.push({ type: 'tech', ...found, category });
        } else {
          for (const [cat, catArticles] of Object.entries(techData)) {
            const found = catArticles.find(a => a.slug === slug);
            if (found) { result.push({ type: 'tech', ...found, category: cat }); break; }
          }
        }
      } else if (type === 'insight') {
        const found = insightReports.find(r => r.slug === slug);
        if (found) result.push({ type: 'insight', ...found });
      } else if (type === 'hotpick') {
        const found = hotpickReports.find(r => r.slug === slug);
        if (found) result.push({ type: 'hotpick', ...found });
      } else if (type === 'ranking') {
        const found = rankingReports.find(r => r.slug === slug);
        if (found) result.push({ type: 'ranking', ...found });
      }
    }
    return result;
  }

  // 2. 레거시 폴백: relatedArticles (위키/테크)
  if (article.relatedArticles && article.relatedArticles.length > 0) {
    for (const item of article.relatedArticles) {
      const itemSlug = typeof item === 'string' ? item : item.slug;
      const itemCat = typeof item === 'string' ? null : (item.category || currentCategory);

      // 위키에서 검색
      if (itemCat && wikiData[itemCat]) {
        const found = wikiData[itemCat].find(a => a.slug === itemSlug);
        if (found) { result.push({ type: 'wiki', ...found, category: itemCat }); continue; }
      }
      for (const [cat, catArticles] of Object.entries(wikiData)) {
        const found = catArticles.find(a => a.slug === itemSlug);
        if (found) { result.push({ type: 'wiki', ...found, category: cat }); break; }
      }
      // 테크에서도 검색
      for (const [cat, catArticles] of Object.entries(techData)) {
        const found = catArticles.find(a => a.slug === itemSlug);
        if (found) { result.push({ type: 'tech', ...found, category: cat }); break; }
      }
    }
  }

  // 3. 레거시 폴백: relatedIssues
  if (article.relatedIssues && article.relatedIssues.length > 0) {
    for (const slug of article.relatedIssues) {
      const found = issueReports.find(r => r.slug === slug);
      if (found) result.push({ type: 'issue', ...found });
    }
  }

  // 4. 레거시 폴백: relatedInsights
  if (article.relatedInsights && article.relatedInsights.length > 0) {
    for (const slug of article.relatedInsights) {
      const found = insightReports.find(r => r.slug === slug);
      if (found) result.push({ type: 'insight', ...found });
    }
  }

  // 5. 레거시 폴백: relatedHotpicks
  if (article.relatedHotpicks && article.relatedHotpicks.length > 0) {
    for (const slug of article.relatedHotpicks) {
      const found = hotpickReports.find(r => r.slug === slug);
      if (found) result.push({ type: 'hotpick', ...found });
    }
  }

  return result;
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
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf8');
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

  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf8');
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
      fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf8');
    }
    return updated;
  } catch (e) {
    console.error(`Error updating history rankings: ${e.message}`);
    return false;
  }
}

// 위키 데이터 로드 함수
function loadWikiData() {
  const categories = ['business', 'history', 'knowledge'];
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
        ensurePublishDate(article, `${categoryDir}/${file}`, 'KST');
        const status = article.status || '';
        const isApproved = status === 'approved' || status === 'published';
        const isDraft = status === 'draft';
        // AIScroll 전용 글은 GamerScroll 빌드/사이트맵에서 제외 (도메인 간 중복 콘텐츠 방지)
        const isAiscrollOnly = article.site === 'aiscroll';
        if (!isAiscrollOnly && (isApproved || (includeDrafts && isDraft))) {
          const slug = article.slug || file.replace('.json', '');
          wikiData[category].push({
            ...article,
            slug,
            _jsonFilePath: `${categoryDir}/${file}`
          });
        }
      } catch (e) {
        console.warn(`  ⚠️ 위키 파일 로드 실패: ${categoryDir}/${file}`);
      }
    }

    // 날짜 기준 정렬 (최신순)
    wikiData[category].sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  return wikiData;
}

// 테크 데이터 로드 함수 (Stage 3: GamerScroll에서 tech 제거)
const TECH_DIR = './data/tech';
function loadTechData() {
  // Disabled in Stage 3 — tech 콘텐츠는 AIScroll로 이관됨.
  return { normal: [], ai: [], vibecoding: [] };  return techData;
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
const { generateIssueDetailPage, generateInsightDetailPage, generateHotpickDetailPage, generateRankingDetailPage } = require('./src/templates/pages/trend');
const { generateTrendsHubPage, generateIssueListPage, generateInsightListPage, generateHotpickListPage, generateRankingListPage } = require('./src/templates/pages/trends-hub');
// 뉴스/커뮤니티/영상 페이지 제거됨 (크롤링 데이터는 유지)
const { generateRankingsPage } = require('./src/templates/pages/rankings');
const { generateSteamPage } = require('./src/templates/pages/steam');
const { generateUpcomingPage } = require('./src/templates/pages/upcoming');
const { generateGamesHubPage } = require('./src/templates/pages/games-hub');
const { generateWikiHubPage, generateWikiCategoryPage } = require('./src/templates/pages/wiki-hub');
const { generateWikiArticlePage } = require('./src/templates/pages/wiki-article');
const { generateTechHubPage, generateTechCategoryPage } = require('./src/templates/pages/tech-hub');
const { generateTechArticlePage } = require('./src/templates/pages/tech-article');
const { generate404Page } = require('./src/templates/pages/404');
const {
  setCssFilename,
  setCssAssetVersion,
  setSearchIndexVersion,
  setRuntimeAssetVersion,
  setGlobalSidebarCounts,
  buildLayoutCoreBundle,
  buildLayoutRuntimeBundle,
  LAYOUT_CORE_ASSET,
  LAYOUT_RUNTIME_ASSET
} = require('./src/templates/layout');
const { loadPopularGames, savePopularGames, shouldFetchPopularGames, loadPopularArticles, savePopularArticles, shouldFetchPopularArticles } = require('./src/crawlers/analytics');

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

// PurgeCSS 동적 클래스 safelist (런타임 JS에서 classList.add/toggle/className으로 추가되는 클래스)
const PURGECSS_SAFELIST = {
  standard: [
    'active', 'loaded', 'open', 'hidden', 'expanded', 'collapsed',
    'fonts-loaded', 'nav-ready', 'thumb-fallback',
    'feed-top-spacer', 'ad-card', 'ad-card-scroll', 'adsbygoogle',
    'ads-disabled', 'deferred-css-pending', 'realtime',
  ],
  deep: [/^search-/, /^is-/, /^has-/, /^apexcharts-/, /^ad-/],
  greedy: [],
};

// PurgeCSS: docs/ 내 CSS 번들에서 미사용 CSS 제거
async function purgeCssInDocs(docsDir) {
  const bundles = [
    {
      css: `${docsDir}/styles-core.css`,
      content: [`${docsDir}/**/*.html`],
      label: 'styles-core.css',
    },
    {
      css: `${docsDir}/styles-report.css`,
      // magazine 페이지는 루트 ./magazine 에 생성된 뒤 빌드 후반에 docs 로 복사되므로,
      // purge 시점에는 docs/magazine 이 비어/오래될 수 있다. 루트 생성본도 함께 스캔해
      // #insight·#hotpick 등 섹션 id 셀렉터가 살아남도록 한다.
      content: [`${docsDir}/magazine/**/*.html`, './magazine/**/*.html'],
      label: 'styles-report.css',
    },
    {
      css: `${docsDir}/styles-game.css`,
      content: [
        `${docsDir}/games/**/*.html`,
        `${docsDir}/rankings/**/*.html`,
        `${docsDir}/steam/**/*.html`,
        `${docsDir}/upcoming/**/*.html`,
      ],
      label: 'styles-game.css',
    },
    {
      css: `${docsDir}/styles-article.css`,
      content: [
        `${docsDir}/magazine/**/*.html`,
        `${docsDir}/wiki/**/*.html`,
        `${docsDir}/tech/**/*.html`,
        // 루트 생성본(아직 docs 로 복사 전)도 스캔 — magazine 섹션 id 보존
        './magazine/**/*.html',
      ],
      label: 'styles-article.css',
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
  let news, community, rankings, steam, youtube, chzzk, upcoming;

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
    upcoming = cache.upcoming;
  } else {
    // 일반 모드: 시간대별 조건부 크롤링
    const existingCache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : null;

    // 순위는 30분마다 항상 수집
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

    // 출시 예정 게임 - 크롤링할 때 같이 갱신
    if (needsCrawling || !existingCache?.upcoming) {
      console.log('\n📅 출시 예정 게임 수집 중...');
      upcoming = await fetchUpcomingGames(store, FirecrawlClient, FIRECRAWL_API_KEY);
    } else {
      console.log('📅 출시 예정 - 캐시 사용');
      upcoming = existingCache.upcoming;
    }

    // 캐시 저장
    const cache = { timestamp: new Date().toISOString(), news, community, rankings, steam, youtube, chzzk, upcoming };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('\n💾 캐시 저장 완료');

    // 30분마다 CSV 스냅샷 저장
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

  // 이슈 리포트 데이터 로드 (홈페이지용, 승인된 것만)
  const ISSUE_REPORTS_DIR_HOME = './reports/issue';
  let issueReportsForHome = [];
  if (fs.existsSync(ISSUE_REPORTS_DIR_HOME)) {
    const files = fs.readdirSync(ISSUE_REPORTS_DIR_HOME).filter(f => f.endsWith('.json'));
    issueReportsForHome = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${ISSUE_REPORTS_DIR_HOME}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${ISSUE_REPORTS_DIR_HOME}/${f}`, 'KST');
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && p.site !== 'aiscroll' && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 인사이트 리포트 데이터 로드 (홈페이지용, 승인된 것만)
  const INSIGHT_REPORTS_DIR_HOME = './reports/insight';
  let insightReportsForHome = [];
  if (fs.existsSync(INSIGHT_REPORTS_DIR_HOME)) {
    const files = fs.readdirSync(INSIGHT_REPORTS_DIR_HOME).filter(f => f.endsWith('.json'));
    insightReportsForHome = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${INSIGHT_REPORTS_DIR_HOME}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${INSIGHT_REPORTS_DIR_HOME}/${f}`, 'KST');
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 핫픽 리포트 데이터 로드 (홈페이지용, 승인된 것만)
  const HOTPICK_REPORTS_DIR_HOME = './reports/hotpick';
  let hotpickReportsForHome = [];
  if (fs.existsSync(HOTPICK_REPORTS_DIR_HOME)) {
    const files = fs.readdirSync(HOTPICK_REPORTS_DIR_HOME).filter(f => f.endsWith('.json'));
    hotpickReportsForHome = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${HOTPICK_REPORTS_DIR_HOME}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${HOTPICK_REPORTS_DIR_HOME}/${f}`, 'KST');
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 순위 분석 리포트 데이터 로드 (홈페이지용, 승인된 것만)
  const RANKING_REPORTS_DIR_HOME = './reports/ranking';
  let rankingReportsForHome = [];
  if (fs.existsSync(RANKING_REPORTS_DIR_HOME)) {
    const files = fs.readdirSync(RANKING_REPORTS_DIR_HOME).filter(f => f.endsWith('.json'));
    rankingReportsForHome = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${RANKING_REPORTS_DIR_HOME}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${RANKING_REPORTS_DIR_HOME}/${f}`, 'KST');
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  const issueReportsCount = issueReportsForHome.length;
  const insightReportsCount = insightReportsForHome.length;
  const hotpickReportsCount = hotpickReportsForHome.length;
  const rankingReportsCount = rankingReportsForHome.length;
  const data = { rankings, news, steam, youtube, chzzk, community, upcoming, issueReports: issueReportsForHome, insightReports: insightReportsForHome, hotpickReports: hotpickReportsForHome, rankingReports: rankingReportsForHome, issueReportsCount, insightReportsCount, hotpickReportsCount, rankingReportsCount };

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

  // GA4 인기 기사 데이터 수집 (24시간 쿨타임, 독립 실행)
  if (process.env.GA4_SERVICE_ACCOUNT && shouldFetchPopularArticles()) {
    console.log('  📰 GA4 인기 기사 데이터 수집 중...');
    try {
      await savePopularArticles();
      console.log('  ✅ 인기 기사 데이터 갱신 완료');
    } catch (err) {
      console.warn('  ⚠️ GA4 인기 기사 수집 실패:', err.message);
    }
  }

  // 인기 게임 데이터 로드
  const popularGamesData = loadPopularGames();
  if (popularGamesData.games && popularGamesData.games.length > 0) {
    console.log(`  📊 인기 게임 데이터 로드: TOP ${popularGamesData.games.length}`);
  }

  // 인기 기사 데이터 로드
  const popularArticlesData = loadPopularArticles();
  if (popularArticlesData.articles && popularArticlesData.articles.length > 0) {
    console.log(`  📰 인기 기사 데이터 로드: TOP ${popularArticlesData.articles.length}`);
  }

  // 위키 데이터 로드 (홈페이지용)
  const homeWikiData = loadWikiData();

  // 테크 데이터 로드 (홈페이지용)
  const homeTechData = loadTechData();

  // CSS 파일 번들링 + 압축 (코어/페이지군 분리)
  let didBundleCss = false;
  const generatedCssFiles = [];
  const cssFilename = '/styles-core.css';
  const cssBundles = [
    { entry: './src/styles/bundle-core.css', output: './styles-core.css', publicPath: '/styles-core.css', label: 'styles-core.css', required: true },
    { entry: './src/styles/bundle-report.css', output: './styles-report.css', publicPath: '/styles-report.css', label: 'styles-report.css', required: false },
    { entry: './src/styles/bundle-game.css', output: './styles-game.css', publicPath: '/styles-game.css', label: 'styles-game.css', required: false },
    { entry: './src/styles/bundle-article.css', output: './styles-article.css', publicPath: '/styles-article.css', label: 'styles-article.css', required: false }
  ];

  const buildCssBundle = (bundle) => {
    const bundledCss = bundleCssFile(bundle.entry);
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

  const cssHashTargets = ['./styles-core.css', './styles-report.css', './styles-game.css', './styles-article.css'];
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
  setCssAssetVersion(currentCssAssetVersion);
  setCssFilename(cssFilename);

  // 글로벌 사이드바 카운트 초기 설정 (위키/테크만, 매거진 counts는 나중에 업데이트)
  setGlobalSidebarCounts({
    issue: 0,
    insight: 0,
    hotpick: 0,
    ranking: 0,
    history: (homeWikiData.history || []).length,
    knowledge: (homeWikiData.knowledge || []).length,
    business: (homeWikiData.business || []).length,
    normal: (homeTechData?.normal || []).length,
    ai: (homeTechData?.ai || []).length,
    vibecoding: (homeTechData?.vibecoding || []).length
  });

  // 캐시 버전 해시 (데이터 변경 시 브라우저 캐시 자동 무효화)
  const searchVersionPath = path.join('./docs', 'games', '.search-version');
  const searchIndexVersion = fs.existsSync(searchVersionPath) ? fs.readFileSync(searchVersionPath, 'utf8').trim() : '';
  if (searchIndexVersion) setSearchIndexVersion(searchIndexVersion);

  // 공통 런타임 번들 생성 (HTML 인라인 스크립트 분리)
  const WEB_ASSETS_DIR = './assets';
  if (!fs.existsSync(WEB_ASSETS_DIR)) {
    fs.mkdirSync(WEB_ASSETS_DIR, { recursive: true });
  }
  const layoutCoreBundle = buildLayoutCoreBundle();
  const layoutRuntimeBundle = buildLayoutRuntimeBundle({ searchIndexVersion });
  const runtimeAssetVersion = crypto
    .createHash('md5')
    .update(layoutCoreBundle)
    .update(layoutRuntimeBundle)
    .digest('hex')
    .slice(0, 8);
  setRuntimeAssetVersion(runtimeAssetVersion);

  fs.writeFileSync(`${WEB_ASSETS_DIR}/${LAYOUT_CORE_ASSET}`, layoutCoreBundle, 'utf8');
  fs.writeFileSync(
    `${WEB_ASSETS_DIR}/${LAYOUT_RUNTIME_ASSET}`,
    layoutRuntimeBundle,
    'utf8'
  );

  const rankingsCacheVersion = crypto.createHash('md5').update(JSON.stringify(data.rankings || {})).digest('hex').slice(0, 8);
  const steamCacheVersion = crypto.createHash('md5').update(JSON.stringify(data.steam || {})).digest('hex').slice(0, 8);

  const pages = [
    { filename: 'rankings.html', generator: (d) => generateRankingsPage({ ...d, games: gamesData, cacheVersion: rankingsCacheVersion }) },
    { filename: 'steam.html', generator: (d) => generateSteamPage({ ...d, cacheVersion: steamCacheVersion }) },
    { filename: 'upcoming.html', generator: generateUpcomingPage },
    { filename: 'games/index.html', generator: () => generateGamesHubPage({ games: gamesData, popularGames: popularGamesData.games || [], searchIndexVersion }) },
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

  // ============================================
  // 트렌드 리포트 페이지 생성 (목록 + 상세)
  // ============================================
  console.log('\n📊 트렌드 리포트 페이지 생성 중...');

  // 3. 목록 페이지 생성 (magazine/index.html)
  const magazineDir = './magazine';
  if (!fs.existsSync(magazineDir)) {
    fs.mkdirSync(magazineDir, { recursive: true });
  }

  // 이슈 리포트 데이터 로드 (허브/상세에서 사용, 승인된 것만 노출)
  const ISSUE_REPORTS_DIR = './reports/issue';
  let issueReports = [];
  if (fs.existsSync(ISSUE_REPORTS_DIR)) {
    const files = fs.readdirSync(ISSUE_REPORTS_DIR).filter(f => f.endsWith('.json'));
    issueReports = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${ISSUE_REPORTS_DIR}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${ISSUE_REPORTS_DIR}/${f}`, 'KST');
        data._jsonFilePath = `${ISSUE_REPORTS_DIR}/${f}`;
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && p.site !== 'aiscroll' && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 인사이트 리포트 데이터 로드 (허브/상세에서 사용, 승인된 것만 노출)
  const INSIGHT_REPORTS_DIR = './reports/insight';
  let insightReports = [];
  if (fs.existsSync(INSIGHT_REPORTS_DIR)) {
    const files = fs.readdirSync(INSIGHT_REPORTS_DIR).filter(f => f.endsWith('.json'));
    insightReports = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${INSIGHT_REPORTS_DIR}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${INSIGHT_REPORTS_DIR}/${f}`, 'KST');
        data._jsonFilePath = `${INSIGHT_REPORTS_DIR}/${f}`;
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 핫픽 리포트 데이터 로드 (허브/상세에서 사용, 승인된 것만 노출)
  const HOTPICK_REPORTS_DIR = './reports/hotpick';
  let hotpickReports = [];
  if (fs.existsSync(HOTPICK_REPORTS_DIR)) {
    const files = fs.readdirSync(HOTPICK_REPORTS_DIR).filter(f => f.endsWith('.json'));
    hotpickReports = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${HOTPICK_REPORTS_DIR}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${HOTPICK_REPORTS_DIR}/${f}`, 'KST');
        data._jsonFilePath = `${HOTPICK_REPORTS_DIR}/${f}`;
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 순위 분석 리포트 데이터 로드 (허브/상세에서 사용, 승인된 것만 노출)
  const RANKING_REPORTS_DIR = './reports/ranking';
  let rankingReports = [];
  if (fs.existsSync(RANKING_REPORTS_DIR)) {
    const files = fs.readdirSync(RANKING_REPORTS_DIR).filter(f => f.endsWith('.json'));
    rankingReports = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(`${RANKING_REPORTS_DIR}/${f}`, 'utf8').replace(/^\uFEFF/, ''));
        ensurePublishDate(data, `${RANKING_REPORTS_DIR}/${f}`, 'KST');
        data._jsonFilePath = `${RANKING_REPORTS_DIR}/${f}`;
        return data;
      } catch (e) {
        return null;
      }
    })
      .filter(p => p && (p.status === 'approved' || (includeDrafts && p.status === 'draft')))
      .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));
  }

  // 공통 인기글/최신글 리스트 생성 (홈, 매거진, 위키에서 공유)
  const categoryNames = { history: '히스토리', knowledge: '지식', business: '비즈니스' };
  const techCategoryNames = { normal: '일반', ai: 'AI', vibecoding: '바이브코딩' };
  const wikiDataForSidebar = loadWikiData();
  const techDataForSidebar = loadTechData();
  const allSidebarArticles = [];
  // 이슈 리포트 추가
  issueReports.forEach(issue => {
    allSidebarArticles.push({ title: issue.title, link: `/magazine/issue/${issue.slug}/`, badge: '이슈', date: issue.date || '' });
  });
  // 인사이트 리포트 추가
  insightReports.forEach(insight => {
    allSidebarArticles.push({ title: insight.title, link: `/magazine/insight/${insight.slug}/`, badge: '인사이트', date: insight.date || '' });
  });
  // 핫픽 리포트 추가
  hotpickReports.forEach(hotpick => {
    allSidebarArticles.push({ title: hotpick.title, link: `/magazine/hotpick/${hotpick.slug}/`, badge: '핫픽', date: hotpick.date || '' });
  });
  // 순위 분석 리포트 추가
  rankingReports.forEach(ranking => {
    allSidebarArticles.push({ title: ranking.title, link: `/magazine/ranking/${ranking.slug}/`, badge: '순위 분석', date: ranking.date || '' });
  });
  // 위키 추가
  for (const cat of Object.keys(wikiDataForSidebar)) {
    for (const article of (wikiDataForSidebar[cat] || [])) {
      allSidebarArticles.push({ title: article.title, link: `/wiki/${cat}/${article.slug}/`, badge: categoryNames[cat] || cat, date: article.date || '' });
    }
  }
  // 테크 추가
  for (const cat of Object.keys(techDataForSidebar)) {
    for (const article of (techDataForSidebar[cat] || [])) {
      allSidebarArticles.push({ title: article.title, link: `/tech/${cat}/${article.slug}/`, badge: techCategoryNames[cat] || '테크', date: article.date || '' });
    }
  }
  // 인기글: GA4 데이터 기반 (썸네일, 요약 포함) - 카테고리별 10위 확보 위해 200개 조회
  let sidebarPopularArticles = (popularArticlesData.articles || []).slice(0, 200).map(article => {
    if (article.type === 'issue') {
      const issue = issueReports.find(i => i.slug === article.slug);
      if (issue) return { title: issue.title, link: `/magazine/issue/${issue.slug}/`, badge: '이슈', thumbnail: issue.thumbnail || '', summary: issue.summary || '', type: 'issue', slug: issue.slug };
    } else if (article.type === 'insight') {
      const insight = insightReports.find(i => i.slug === article.slug);
      if (insight) return { title: insight.title, link: `/magazine/insight/${insight.slug}/`, badge: '인사이트', thumbnail: insight.thumbnail || '', summary: insight.summary || '', type: 'insight', slug: insight.slug };
    } else if (article.type === 'hotpick') {
      const hotpick = hotpickReports.find(h => h.slug === article.slug);
      if (hotpick) return { title: hotpick.title, link: `/magazine/hotpick/${hotpick.slug}/`, badge: '핫픽', thumbnail: hotpick.thumbnail || '', summary: hotpick.summary || '', type: 'hotpick', slug: hotpick.slug };
    } else if (article.type === 'ranking') {
      const ranking = rankingReports.find(r => r.slug === article.slug);
      if (ranking) return { title: ranking.title, link: `/magazine/ranking/${ranking.slug}/`, badge: '순위 분석', thumbnail: ranking.thumbnail || '', summary: ranking.summary || '', type: 'ranking', slug: ranking.slug };
    } else if (article.type === 'wiki' && article.category) {
      const wikiList = wikiDataForSidebar[article.category] || [];
      const wiki = wikiList.find(w => w.slug === article.slug);
      if (wiki) return { title: wiki.title, link: `/wiki/${article.category}/${article.slug}/`, badge: categoryNames[article.category], thumbnail: wiki.thumbnail || '', summary: wiki.summary || '', type: 'wiki', category: article.category, slug: wiki.slug };
    } else if (article.type === 'tech' && article.category) {
      const techList = techDataForSidebar[article.category] || [];
      const tech = techList.find(t => t.slug === article.slug);
      if (tech) return { title: tech.title, link: `/tech/${article.category}/${article.slug}/`, badge: techCategoryNames[article.category] || '테크', thumbnail: tech.thumbnail || '', summary: tech.summary || '', type: 'tech', category: article.category, slug: tech.slug };
    }
    return null;
  }).filter(Boolean);

  // === 인기글: GA4 기반 카테고리별 10위 ===
  const sidebarPopularAll = sidebarPopularArticles.slice(0, 10);
  const sidebarPopularMagazine = sidebarPopularArticles
    .filter(a => ['issue', 'insight', 'hotpick', 'ranking'].includes(a.type)).slice(0, 10);
  const sidebarPopularWiki = sidebarPopularArticles
    .filter(a => a.type === 'wiki').slice(0, 10);
  const sidebarPopularTech = sidebarPopularArticles
    .filter(a => a.type === 'tech').slice(0, 10);

  // === 최신글: 날짜순 카테고리별 10개 ===
  const sidebarLatestAll = [...allSidebarArticles]
    .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99')).slice(0, 10);
  const sidebarLatestMagazine = allSidebarArticles
    .filter(a => ['이슈', '인사이트', '핫픽', '순위 분석'].includes(a.badge))
    .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99')).slice(0, 10);
  const sidebarLatestWiki = allSidebarArticles
    .filter(a => ['히스토리', '지식', '비즈니스'].includes(a.badge))
    .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99')).slice(0, 10);
  const sidebarLatestTech = allSidebarArticles
    .filter(a => ['일반', 'AI', '바이브코딩'].includes(a.badge))
    .sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99')).slice(0, 10);

  console.log(`  📰 사이드바 인기글: 전체 ${sidebarPopularAll.length}개, 매거진 ${sidebarPopularMagazine.length}개, 위키 ${sidebarPopularWiki.length}개, 테크 ${sidebarPopularTech.length}개`);
  console.log(`  📰 사이드바 최신글: 전체 ${sidebarLatestAll.length}개, 매거진 ${sidebarLatestMagazine.length}개, 위키 ${sidebarLatestWiki.length}개, 테크 ${sidebarLatestTech.length}개`);

  try {
    const hubHtml = generateTrendsHubPage({
      issueReports: issueReports.map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        thumbnail: p.thumbnail,
        summary: p.summary
      })),
      insightReports: insightReports.map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        thumbnail: p.thumbnail,
        summary: p.summary
      })),
      hotpickReports: hotpickReports.map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        thumbnail: p.thumbnail,
        summary: p.summary
      })),
      rankingReports: rankingReports.map(p => ({
        slug: p.slug,
        title: p.title,
        date: p.date,
        thumbnail: p.thumbnail,
        summary: p.summary
      })),
      news: news,
      wikiData: loadWikiData(),
      techData: loadTechData(),
      sidebarPopularArticles: sidebarPopularMagazine,
      sidebarLatestArticles: sidebarLatestMagazine
    });
    fs.writeFileSync(`${magazineDir}/index.html`, hubHtml, 'utf8');
    console.log(`  ✅ magazine/index.html`);
  } catch (err) {
    console.error(`  ❌ magazine/index.html: ${err.message}`);
  }

  // 4. 카테고리 목록 페이지 생성 (issue/index.html 등)
  const categoryPageData = {
    issueReports: issueReports.map(p => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      thumbnail: p.thumbnail,
      summary: p.summary
    })),
    insightReports: insightReports.map(p => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      thumbnail: p.thumbnail,
      summary: p.summary
    })),
    hotpickReports: hotpickReports.map(p => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      thumbnail: p.thumbnail,
      summary: p.summary
    })),
    rankingReports: rankingReports.map(p => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      thumbnail: p.thumbnail,
      summary: p.summary
    })),
    wikiData: loadWikiData(),
    techData: loadTechData(),
    sidebarPopularArticles: sidebarPopularMagazine,
    sidebarLatestArticles: sidebarLatestMagazine
  };

  // Issue 목록 페이지
  const issueDir = `${magazineDir}/issue`;
  if (!fs.existsSync(issueDir)) {
    fs.mkdirSync(issueDir, { recursive: true });
  }
  try {
    const issueListHtml = generateIssueListPage(categoryPageData);
    fs.writeFileSync(`${issueDir}/index.html`, issueListHtml, 'utf8');
    console.log(`  ✅ magazine/issue/index.html`);
  } catch (err) {
    console.error(`  ❌ magazine/issue/index.html: ${err.message}`);
  }

  // Insight 목록 페이지
  const insightDir = `${magazineDir}/insight`;
  if (!fs.existsSync(insightDir)) {
    fs.mkdirSync(insightDir, { recursive: true });
  }
  try {
    const insightListHtml = generateInsightListPage({ ...categoryPageData, insightReports });
    fs.writeFileSync(`${insightDir}/index.html`, insightListHtml, 'utf8');
    console.log(`  ✅ magazine/insight/index.html`);
  } catch (err) {
    console.error(`  ❌ magazine/insight/index.html: ${err.message}`);
  }

  // Hotpick 목록 페이지
  const hotpickDir = `${magazineDir}/hotpick`;
  if (!fs.existsSync(hotpickDir)) {
    fs.mkdirSync(hotpickDir, { recursive: true });
  }
  try {
    const hotpickListHtml = generateHotpickListPage({ ...categoryPageData, hotpickReports });
    fs.writeFileSync(`${hotpickDir}/index.html`, hotpickListHtml, 'utf8');
    console.log(`  ✅ magazine/hotpick/index.html`);
  } catch (err) {
    console.error(`  ❌ magazine/hotpick/index.html: ${err.message}`);
  }

  // Ranking 목록 페이지
  const rankingDir = `${magazineDir}/ranking`;
  if (!fs.existsSync(rankingDir)) {
    fs.mkdirSync(rankingDir, { recursive: true });
  }
  try {
    const rankingListHtml = generateRankingListPage({ ...categoryPageData, rankingReports });
    fs.writeFileSync(`${rankingDir}/index.html`, rankingListHtml, 'utf8');
    console.log(`  ✅ magazine/ranking/index.html`);
  } catch (err) {
    console.error(`  ❌ magazine/ranking/index.html: ${err.message}`);
  }

  // 글로벌 사이드바 카운트 설정 (상세 페이지 생성 전 필요)
  setGlobalSidebarCounts({
    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (homeWikiData.history || []).length,
    knowledge: (homeWikiData.knowledge || []).length,
    business: (homeWikiData.business || []).length,
    normal: (homeTechData?.normal || []).length,
    ai: (homeTechData?.ai || []).length,
    vibecoding: (homeTechData?.vibecoding || []).length
  });

  // 7. 이슈 리포트 페이지 생성 (magazine/issue/{slug}/index.html)
  const wikiDataForIssue = loadWikiData(); // 이슈 리포트에서 관련 위키 참조용
  const techDataForIssue = loadTechData(); // 이슈 리포트 사이드바 카운트용
  const wikiCounts = {
    history: (wikiDataForIssue.history || []).length,
    knowledge: (wikiDataForIssue.knowledge || []).length,
    business: (wikiDataForIssue.business || []).length
  };
  const techCounts = {
    normal: (techDataForIssue.normal || []).length,
    ai: (techDataForIssue.ai || []).length,
    vibecoding: (techDataForIssue.vibecoding || []).length
  };
  const magazineCounts = {
    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length
  };

  if (issueReports.length > 0) {
    let issueBuilt = 0, issueSkipped = 0;

    for (let i = 0; i < issueReports.length; i++) {
      const post = issueReports[i];
      const pageDir = `${issueDir}/${post.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      // 증분 빌드: 캐시 체크 (HTML 파일 존재 여부도 확인)
      const cacheKey = post.slug;
      const htmlExists = fs.existsSync(path.join(pageDir, 'index.html'));
      if (!forceFullRebuild && htmlExists && !buildCache.checkItemChanged(incrementalCache.issues, cacheKey, post)) {
        issueSkipped++;
        continue;
      }

      try {
        const nav = {
          prev: issueReports[i + 1] ? { slug: issueReports[i + 1].slug, title: issueReports[i + 1].title } : null,
          next: issueReports[i - 1] ? { slug: issueReports[i - 1].slug, title: issueReports[i - 1].title } : null
        };
        const parsedRelatedDocs = parseRelatedDocs(post, null, wikiDataForIssue, techDataForSidebar, issueReports, insightReports, hotpickReports, rankingReports);
        const html = generateIssueDetailPage({ post, nav, parsedRelatedDocs, issueReports, insightReports, hotpickReports, rankingReports, wikiData: wikiDataForIssue, techData: techDataForSidebar, wikiCounts, techCounts, magazineCounts, sidebarPopularArticles: sidebarPopularMagazine, sidebarLatestArticles: sidebarLatestMagazine });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
        buildCache.updateCacheSection(incrementalCache.issues, cacheKey, post);
        issueBuilt++;
      } catch (err) {
        console.error(`  ❌ magazine/issue/${post.slug}: ${err.message}`);
      }
    }
    buildCache.printBuildStats({ total: issueReports.length, built: issueBuilt, skipped: issueSkipped, type: '이슈 리포트 페이지' });
  }

  // 9. 인사이트 리포트 페이지 생성 (magazine/insight/{slug}/index.html)
  if (insightReports.length > 0) {
    let insightBuilt = 0, insightSkipped = 0;

    for (let i = 0; i < insightReports.length; i++) {
      const post = insightReports[i];
      const pageDir = `${insightDir}/${post.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      // 증분 빌드: 캐시 체크 (HTML 파일 존재 여부도 확인)
      const cacheKey = post.slug;
      const htmlExists = fs.existsSync(path.join(pageDir, 'index.html'));
      if (!forceFullRebuild && htmlExists && !buildCache.checkItemChanged(incrementalCache.insights, cacheKey, post)) {
        insightSkipped++;
        continue;
      }

      try {
        const nav = {
          prev: insightReports[i + 1] ? { slug: insightReports[i + 1].slug, title: insightReports[i + 1].title } : null,
          next: insightReports[i - 1] ? { slug: insightReports[i - 1].slug, title: insightReports[i - 1].title } : null
        };
        const parsedRelatedDocs = parseRelatedDocs(post, null, wikiDataForIssue, techDataForSidebar, issueReports, insightReports, hotpickReports, rankingReports);
        const html = generateInsightDetailPage({ post, nav, parsedRelatedDocs, insightReports, issueReports, hotpickReports, rankingReports, wikiData: wikiDataForIssue, wikiCounts, techCounts, magazineCounts, sidebarPopularArticles: sidebarPopularMagazine, sidebarLatestArticles: sidebarLatestMagazine });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
        buildCache.updateCacheSection(incrementalCache.insights, cacheKey, post);
        insightBuilt++;
      } catch (err) {
        console.error(`  ❌ magazine/insight/${post.slug}: ${err.message}`);
      }
    }
    buildCache.printBuildStats({ total: insightReports.length, built: insightBuilt, skipped: insightSkipped, type: '인사이트 리포트 페이지' });
  }

  // 10. 핫픽 리포트 페이지 생성 (magazine/hotpick/{slug}/index.html)
  if (hotpickReports.length > 0) {
    let hotpickBuilt = 0, hotpickSkipped = 0;

    for (let i = 0; i < hotpickReports.length; i++) {
      const post = hotpickReports[i];
      const pageDir = `${hotpickDir}/${post.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      // 증분 빌드: 캐시 체크 (HTML 파일 존재 여부도 확인)
      const cacheKey = post.slug;
      const htmlExists = fs.existsSync(path.join(pageDir, 'index.html'));
      if (!forceFullRebuild && htmlExists && !buildCache.checkItemChanged(incrementalCache.hotpicks, cacheKey, post)) {
        hotpickSkipped++;
        continue;
      }

      try {
        const nav = {
          prev: hotpickReports[i + 1] ? { slug: hotpickReports[i + 1].slug, title: hotpickReports[i + 1].title } : null,
          next: hotpickReports[i - 1] ? { slug: hotpickReports[i - 1].slug, title: hotpickReports[i - 1].title } : null
        };
        const parsedRelatedDocs = parseRelatedDocs(post, null, wikiDataForIssue, techDataForSidebar, issueReports, insightReports, hotpickReports, rankingReports);
        const html = generateHotpickDetailPage({ post, nav, parsedRelatedDocs, hotpickReports, issueReports, insightReports, rankingReports, wikiData: wikiDataForIssue, wikiCounts, techCounts, magazineCounts, sidebarPopularArticles: sidebarPopularMagazine, sidebarLatestArticles: sidebarLatestMagazine });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
        buildCache.updateCacheSection(incrementalCache.hotpicks, cacheKey, post);
        hotpickBuilt++;
      } catch (err) {
        console.error(`  ❌ magazine/hotpick/${post.slug}: ${err.message}`);
      }
    }
    buildCache.printBuildStats({ total: hotpickReports.length, built: hotpickBuilt, skipped: hotpickSkipped, type: '핫픽 리포트 페이지' });
  }

  // 11. 순위 분석 리포트 페이지 생성 (magazine/ranking/{slug}/index.html)
  if (rankingReports.length > 0) {
    let rankingBuilt = 0, rankingSkipped = 0;

    for (let i = 0; i < rankingReports.length; i++) {
      const post = rankingReports[i];
      const pageDir = `${rankingDir}/${post.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      // 증분 빌드: 캐시 체크 (HTML 파일 존재 여부도 확인)
      const cacheKey = post.slug;
      const htmlExists = fs.existsSync(path.join(pageDir, 'index.html'));
      if (!forceFullRebuild && htmlExists && !buildCache.checkItemChanged(incrementalCache.rankings, cacheKey, post)) {
        rankingSkipped++;
        continue;
      }

      try {
        const nav = {
          prev: rankingReports[i + 1] ? { slug: rankingReports[i + 1].slug, title: rankingReports[i + 1].title } : null,
          next: rankingReports[i - 1] ? { slug: rankingReports[i - 1].slug, title: rankingReports[i - 1].title } : null
        };
        const parsedRelatedDocs = parseRelatedDocs(post, null, wikiDataForIssue, techDataForSidebar, issueReports, insightReports, hotpickReports, rankingReports);
        const html = generateRankingDetailPage({ post, nav, parsedRelatedDocs, rankingReports, issueReports, insightReports, hotpickReports, wikiData: wikiDataForIssue, techData: techDataForSidebar, wikiCounts, techCounts, magazineCounts, sidebarPopularArticles: sidebarPopularMagazine, sidebarLatestArticles: sidebarLatestMagazine });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
        buildCache.updateCacheSection(incrementalCache.rankings, cacheKey, post);
        rankingBuilt++;
      } catch (err) {
        console.error(`  ❌ magazine/ranking/${post.slug}: ${err.message}`);
      }
    }
    buildCache.printBuildStats({ total: rankingReports.length, built: rankingBuilt, skipped: rankingSkipped, type: '순위 분석 리포트 페이지' });
  }

  // 글로벌 사이드바 카운트 설정 (모든 페이지에서 사용)
  setGlobalSidebarCounts({
    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (homeWikiData.history || []).length,
    knowledge: (homeWikiData.knowledge || []).length,
    business: (homeWikiData.business || []).length,
    normal: (homeTechData?.normal || []).length,
    ai: (homeTechData?.ai || []).length,
    vibecoding: (homeTechData?.vibecoding || []).length
  });

  // 기타 페이지 재생성 (정확한 매거진 counts 반영)
  const latePages = [
    { filename: 'rankings.html', generator: (d) => generateRankingsPage({ ...d, games: gamesData, cacheVersion: rankingsCacheVersion }) },
    { filename: 'steam.html', generator: (d) => generateSteamPage({ ...d, cacheVersion: steamCacheVersion }) },
    { filename: 'upcoming.html', generator: generateUpcomingPage },
    { filename: '404.html', generator: generate404Page }
  ];
  for (const page of latePages) {
    try {
      const html = page.generator(data);
      fs.writeFileSync(page.filename, html, 'utf8');
    } catch (err) {
      console.error(`  ❌ ${page.filename} 재생성: ${err.message}`);
    }
  }

  // 홈 페이지 생성 (매거진 로드 후, 정확한 개수 반영)
  try {
    const homeData = { ...data, issueReportsCount: issueReports.length, insightReports, hotpickReports, rankingReports };
    const indexHtml = generateIndexPage({ ...homeData, popularGames: popularGamesData.games || [], popularArticles: popularArticlesData.articles || [], games: gamesData, wikiData: homeWikiData, techData: homeTechData, sidebarPopularArticles: sidebarPopularAll, sidebarLatestArticles: sidebarLatestAll });
    fs.writeFileSync('./index.html', indexHtml, 'utf8');
    console.log(`  ✅ index.html`);
  } catch (err) {
    console.error(`  ❌ index.html: ${err.message}`);
  }

  // 위키 페이지 생성
  console.log('\n📚 위키 페이지 생성...');
  const wikiData = loadWikiData();
  const techData = loadTechData();  // 위키 사이드바에서 테크 카운트 필요
  const categories = ['business', 'history', 'knowledge'];

  // 위키 메인 및 카테고리 목록 페이지 생성
  const wikiCategoryData = {
    wikiData,
    techData,
    issueReportsCount: issueReports.length,
    insightReportsCount: insightReports.length,
    hotpickReportsCount: hotpickReports.length,
    rankingReportsCount: rankingReports.length,
    sidebarPopularArticles: sidebarPopularWiki,
    sidebarLatestArticles: sidebarLatestWiki
  };

  // wiki/index.html 생성
  try {
    const wikiDir = './wiki';
    if (!fs.existsSync(wikiDir)) {
      fs.mkdirSync(wikiDir, { recursive: true });
    }
    const wikiHubHtml = generateWikiHubPage(wikiCategoryData);
    fs.writeFileSync(`${wikiDir}/index.html`, wikiHubHtml, 'utf8');
    console.log(`  ✅ wiki/index.html`);
  } catch (err) {
    console.error(`  ❌ wiki/index.html: ${err.message}`);
  }

  // 카테고리 목록 페이지 생성 (history/index.html, knowledge/index.html 등)
  for (const category of categories) {
    const categoryDir = `./wiki/${category}`;
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    try {
      const categoryHtml = generateWikiCategoryPage({ ...wikiCategoryData, category });
      fs.writeFileSync(`${categoryDir}/index.html`, categoryHtml, 'utf8');
      console.log(`  ✅ wiki/${category}/index.html`);
    } catch (err) {
      console.error(`  ❌ wiki/${category}/index.html: ${err.message}`);
    }
  }

  // 위키 개별 항목 페이지 생성
  for (const category of categories) {
    const articles = wikiData[category] || [];
    if (articles.length === 0) continue;

    const categoryDir = `./wiki/${category}`;
    let wikiBuilt = 0, wikiSkipped = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const pageDir = `${categoryDir}/${article.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      // 증분 빌드: 캐시 체크 (HTML 파일 존재 여부도 확인)
      const cacheKey = `${category}/${article.slug}`;
      const htmlExists = fs.existsSync(path.join(pageDir, 'index.html'));
      if (!forceFullRebuild && htmlExists && !buildCache.checkItemChanged(incrementalCache.wiki, cacheKey, article)) {
        wikiSkipped++;
        continue;
      }

      try {
        // 관련 문서: parseRelatedDocs 통합 함수 사용
        const relatedDocs = parseRelatedDocs(article, category, wikiData, techData, issueReports, insightReports, hotpickReports, rankingReports);

        // 이전/다음 항목
        const prevNext = {
          prev: articles[i + 1] ? { slug: articles[i + 1].slug, title: articles[i + 1].title } : null,
          next: articles[i - 1] ? { slug: articles[i - 1].slug, title: articles[i - 1].title } : null
        };

        const html = generateWikiArticlePage({
          article,
          category,
          relatedDocs,
          prevNext,
          issueReports,
          allWikiData: wikiData,
          allTechData: techData,
          reportCounts: {
            issue: issueReports.length,
            insight: insightReports.length,
            hotpick: hotpickReports.length,
            ranking: rankingReports.length
          },
          magazineCounts: {
          },
          sidebarPopularArticles: sidebarPopularWiki,
          sidebarLatestArticles: sidebarLatestWiki
        });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
        buildCache.updateCacheSection(incrementalCache.wiki, cacheKey, article);
        wikiBuilt++;
      } catch (err) {
        console.error(`  ❌ wiki/${category}/${article.slug}: ${err.message}`);
      }
    }
    buildCache.printBuildStats({ total: articles.length, built: wikiBuilt, skipped: wikiSkipped, type: `${category} 위키 페이지` });
  }

  // ========== 테크 페이지 빌드 ==========
  console.log('\n📱 테크 페이지 빌드...');
  const techCategories = []; // Stage 3: tech 카테고리 제거

  const techCategoryData = {
    techData,
    wikiData,
    issueReportsCount: issueReports.length,
    insightReportsCount: insightReports.length,
    hotpickReportsCount: hotpickReports.length,
    rankingReportsCount: rankingReports.length,
    issueReports,
    insightReports,
    hotpickReports,
    sidebarPopularArticles: sidebarPopularTech,
    sidebarLatestArticles: sidebarLatestTech
  };

  // tech/index.html 생성 (Stage 3: techCategories 비어있으면 skip)
  if (techCategories.length > 0) try {
    const techDir = './tech';
    if (!fs.existsSync(techDir)) {
      fs.mkdirSync(techDir, { recursive: true });
    }
    const techHubHtml = generateTechHubPage(techCategoryData);
    fs.writeFileSync(`${techDir}/index.html`, techHubHtml, 'utf8');
    console.log(`  ✅ tech/index.html`);
  } catch (err) {
    console.error(`  ❌ tech/index.html: ${err.message}`);
  }

  // 테크 카테고리 목록 페이지 생성 (normal/index.html 등)
  for (const category of techCategories) {
    const categoryDir = `./tech/${category}`;
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    try {
      const categoryHtml = generateTechCategoryPage({ ...techCategoryData, category });
      fs.writeFileSync(`${categoryDir}/index.html`, categoryHtml, 'utf8');
      console.log(`  ✅ tech/${category}/index.html`);
    } catch (err) {
      console.error(`  ❌ tech/${category}/index.html: ${err.message}`);
    }
  }

  // 테크 개별 항목 페이지 생성
  for (const category of techCategories) {
    const articles = techData[category] || [];
    if (articles.length === 0) continue;

    const categoryDir = `./tech/${category}`;
    let techBuilt = 0, techSkipped = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const pageDir = `${categoryDir}/${article.slug}`;
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }

      // 증분 빌드: 캐시 체크 (HTML 파일 존재 여부도 확인)
      const cacheKey = `${category}/${article.slug}`;
      const htmlExists = fs.existsSync(path.join(pageDir, 'index.html'));
      if (!forceFullRebuild && htmlExists && !buildCache.checkItemChanged(incrementalCache.tech, cacheKey, article)) {
        techSkipped++;
        continue;
      }

      try {
        // 관련 문서: parseRelatedDocs 통합 함수 사용
        const relatedDocs = parseRelatedDocs(article, category, wikiData, techData, issueReports, insightReports, hotpickReports, rankingReports);

        // 이전/다음 항목
        const prevNext = {
          prev: articles[i + 1] ? { slug: articles[i + 1].slug, title: articles[i + 1].title } : null,
          next: articles[i - 1] ? { slug: articles[i - 1].slug, title: articles[i - 1].title } : null
        };

        const html = generateTechArticlePage({
          article,
          category,
          relatedDocs,
          prevNext,
          issueReports,
          allTechData: techData,
          allWikiData: wikiData,
          reportCounts: {
            issue: issueReports.length,
            insight: insightReports.length,
            hotpick: hotpickReports.length,
            ranking: rankingReports.length
          },
          magazineCounts: {
          },
          sidebarPopularArticles: sidebarPopularTech,
          sidebarLatestArticles: sidebarLatestTech
        });
        fs.writeFileSync(`${pageDir}/index.html`, html, 'utf8');
        buildCache.updateCacheSection(incrementalCache.tech, cacheKey, article);
        techBuilt++;
      } catch (err) {
        console.error(`  ❌ tech/${category}/${article.slug}: ${err.message}`);
      }
    }
    buildCache.printBuildStats({ total: articles.length, built: techBuilt, skipped: techSkipped, type: `${category} 테크 페이지` });
  }

  // 카드 deferred JSON을 외부 정적 파일로 분리 (초기 HTML 경량화)
  externalizeDeferredJsonPayloads();

  // docs 폴더 동기화 (로컬 개발 환경용)
  // 통합 반응형 빌드: 단일 docs/ 폴더에 출력
  const DOCS_DIR = './docs';
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
  fs.copyFileSync('./index.html', `${DOCS_DIR}/index.html`);
  fs.copyFileSync('./404.html', `${DOCS_DIR}/404.html`);
  const subPages = ['rankings', 'steam', 'upcoming'];
  for (const page of subPages) {
    const pageDir = `${DOCS_DIR}/${page}`;
    if (!fs.existsSync(pageDir)) {
      fs.mkdirSync(pageDir, { recursive: true });
    }
    fs.copyFileSync(`./${page}.html`, `${pageDir}/index.html`);
  }

  // privacy 페이지 복사 (푸터 링크 폴백/SEO용) - CSS 해시 동적 교체
  try {
    const srcPrivacy = './privacy/index.html';
    if (fs.existsSync(srcPrivacy)) {
      const privacyDir = `${DOCS_DIR}/privacy`;
      if (!fs.existsSync(privacyDir)) {
        fs.mkdirSync(privacyDir, { recursive: true });
      }
      let privacyHtml = fs.readFileSync(srcPrivacy, 'utf8');
      privacyHtml = privacyHtml.replace(/\/styles\.[a-f0-9]*\.css|\/styles\.css/, cssFilename);
      fs.writeFileSync(`${privacyDir}/index.html`, privacyHtml);
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
  // games 허브 페이지 복사 (기존 게임 개별 페이지와 별도)
  if (fs.existsSync('./games/index.html')) {
    const gamesDir = `${DOCS_DIR}/games`;
    if (!fs.existsSync(gamesDir)) {
      fs.mkdirSync(gamesDir, { recursive: true });
    }
    fs.copyFileSync('./games/index.html', `${gamesDir}/index.html`);
    console.log('  ✅ games/index.html → docs/games/index.html');
  }

  // magazine 폴더 복사
  const srcBriefingDir = './magazine';
  const destBriefingDir = `${DOCS_DIR}/magazine`;
  if (fs.existsSync(srcBriefingDir)) {
    // 덮어쓰기 방식 (incremental build 호환 - 삭제하면 스킵된 파일이 사라짐)

    // magazine 디렉토리 재귀 복사
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
    copyDirRecursive(srcBriefingDir, destBriefingDir);
    console.log('  ✅ magazine/ → docs/magazine/');
  }

  if (!isCssFrozen) try {
    // 이전 해시 CSS 파일 삭제 (docs/ 내 styles.*.css)
    const docsFiles = fs.readdirSync(DOCS_DIR);
    for (const file of docsFiles) {
      if (/^styles(?:-[a-z]+)?\.[a-f0-9]{8}\.css$/.test(file)) {
        fs.unlinkSync(`${DOCS_DIR}/${file}`);
      }
    }

    const cssOutputs = [
      'styles-core.css',
      'styles-report.css',
      'styles-game.css',
      'styles-article.css'
    ];
    for (const filename of cssOutputs) {
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
    const runtimeAssets = [LAYOUT_CORE_ASSET, LAYOUT_RUNTIME_ASSET];
    for (const file of runtimeAssets) {
      const srcPath = `./assets/${file}`;
      const destPath = `${docsAssetsDir}/${file}`;
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
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
    // 동결 모드: 스테이징 트리(magazine/·wiki/·tech/)에서 복사돼 들어온 페이지만
    // 정규화한다. 증분 스킵으로 스테이징에 남은 구버전 해시 링크를 동결 해시로
    // 교정하기 위함이며, games/ 등 배포본 페이지는 건드리지 않아 churn이 없다.
    const copiedTrees = ['magazine/', 'wiki/', 'tech/'];
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
    setCssAssetVersion(currentCssAssetVersion);
    ensureDocsCssAssetCopies(DOCS_DIR, currentCssAssetVersion);
    rewriteDocsStylesheetLinks(DOCS_DIR);
  }

  // sitemap.xml 동적 생성 (lastmod 자동 업데이트 + 게임 페이지 포함)
  const sitemapDate = new Date().toISOString().split('T')[0];
  const siteBaseUrl = 'https://gamerscroll.com'; // 통합 반응형 빌드 - 단일 도메인

  const normalizeLastmodDate = (value) => {
    if (!value) return sitemapDate;
    const text = String(value).trim();
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : sitemapDate;
  };

  // 메인 페이지 URL 목록 (priority: 홈 1.0, 카테고리 0.8, 기사 0.6, 기타 0.4)
  const mainPages = [
    // 홈
    { loc: `${siteBaseUrl}/`, lastmod: sitemapDate, priority: '1.0' },
    // 매거진 (허브 + 목록)
    { loc: `${siteBaseUrl}/magazine/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/magazine/issue/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/magazine/insight/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/magazine/hotpick/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/magazine/ranking/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/magazine/weekly/`, lastmod: sitemapDate, priority: '0.8' },
    // 순위/데이터
    { loc: `${siteBaseUrl}/rankings/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/steam/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/upcoming/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/games/`, lastmod: sitemapDate, priority: '0.8' },
    // 위키 (허브 + 카테고리)
    { loc: `${siteBaseUrl}/wiki/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/wiki/business/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/wiki/history/`, lastmod: sitemapDate, priority: '0.8' },
    { loc: `${siteBaseUrl}/wiki/knowledge/`, lastmod: sitemapDate, priority: '0.8' },
    // 테크 카테고리는 AIScroll로 이관됨 (Stage 3)
  ];

  // 위키 페이지 자동 스캔
  const wikiSitemapData = loadWikiData();
  const wikiSitemapCategories = ['business', 'history', 'knowledge'];
  let wikiPages = [];
  for (const category of wikiSitemapCategories) {
    const articles = wikiSitemapData[category] || [];
    wikiPages.push(...articles.map(article => ({
      loc: `${siteBaseUrl}/wiki/${category}/${article.slug}/`,
      lastmod: normalizeLastmodDate(article.date),
      priority: '0.6'
    })));
  }

  // 테크 페이지 자동 스캔
  const techSitemapData = loadTechData();
  const techSitemapCategories = ['normal', 'ai', 'vibecoding'];
  let techPages = [];
  for (const category of techSitemapCategories) {
    const articles = techSitemapData[category] || [];
    techPages.push(...articles.map(article => ({
      loc: `${siteBaseUrl}/tech/${category}/${article.slug}/`,
      lastmod: normalizeLastmodDate(article.date),
      priority: '0.6'
    })));
  }

  // 브리핑 페이지 자동 스캔
  let magazinePages = [];
  if (fs.existsSync(destBriefingDir)) {
    // 이슈 페이지 (JSON의 date 필드 사용)
    const issueBriefingDir = `${destBriefingDir}/issue`;
    if (fs.existsSync(issueBriefingDir)) {
      const issueFolders = fs.readdirSync(issueBriefingDir).filter(f =>
        fs.statSync(`${issueBriefingDir}/${f}`).isDirectory()
      );
      magazinePages.push(...issueFolders.map(slug => {
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
          loc: `${siteBaseUrl}/magazine/issue/${slug}/`,
          lastmod: issueDate,
          priority: '0.6'
        };
      }));
    }

    // 인사이트 페이지
    const insightBriefingDir = `${destBriefingDir}/insight`;
    if (fs.existsSync(insightBriefingDir)) {
      const insightFolders = fs.readdirSync(insightBriefingDir).filter(f =>
        fs.statSync(`${insightBriefingDir}/${f}`).isDirectory()
      );
      magazinePages.push(...insightFolders.map(slug => {
        let insightDate = sitemapDate;
        try {
          const jsonPath = `${INSIGHT_REPORTS_DIR}/${slug}.json`;
          if (fs.existsSync(jsonPath)) {
            const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
            if (json.date) insightDate = normalizeLastmodDate(json.date);
          }
        } catch (e) {}
        return {
          loc: `${siteBaseUrl}/magazine/insight/${slug}/`,
          lastmod: insightDate,
          priority: '0.6'
        };
      }));
    }

    // 핫픽 페이지
    const hotpickBriefingDir = `${destBriefingDir}/hotpick`;
    if (fs.existsSync(hotpickBriefingDir)) {
      const hotpickFolders = fs.readdirSync(hotpickBriefingDir).filter(f =>
        fs.statSync(`${hotpickBriefingDir}/${f}`).isDirectory()
      );
      magazinePages.push(...hotpickFolders.map(slug => {
        let hotpickDate = sitemapDate;
        try {
          const jsonPath = `${HOTPICK_REPORTS_DIR}/${slug}.json`;
          if (fs.existsSync(jsonPath)) {
            const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
            if (json.date) hotpickDate = normalizeLastmodDate(json.date);
          }
        } catch (e) {}
        return {
          loc: `${siteBaseUrl}/magazine/hotpick/${slug}/`,
          lastmod: hotpickDate,
          priority: '0.6'
        };
      }));
    }

    // 순위 분석 페이지
    const rankingBriefingDir = `${destBriefingDir}/ranking`;
    if (fs.existsSync(rankingBriefingDir)) {
      const rankingFolders = fs.readdirSync(rankingBriefingDir).filter(f =>
        fs.statSync(`${rankingBriefingDir}/${f}`).isDirectory()
      );
      magazinePages.push(...rankingFolders.map(slug => {
        let rankingDate = sitemapDate;
        try {
          const jsonPath = `${RANKING_REPORTS_DIR}/${slug}.json`;
          if (fs.existsSync(jsonPath)) {
            const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
            if (json.date) rankingDate = normalizeLastmodDate(json.date);
          }
        } catch (e) {}
        return {
          loc: `${siteBaseUrl}/magazine/ranking/${slug}/`,
          lastmod: rankingDate,
          priority: '0.6'
        };
      }));
    }

    // 주간 트렌드 페이지 (빌드된 디렉터리 스캔 — 별도 JSON 소스 없음 → 빌드일 lastmod)
    const weeklyBriefingDir = `${destBriefingDir}/weekly`;
    if (fs.existsSync(weeklyBriefingDir)) {
      const weeklyFolders = fs.readdirSync(weeklyBriefingDir).filter(f =>
        fs.statSync(`${weeklyBriefingDir}/${f}`).isDirectory()
      );
      // noindex 페이지는 sitemap 제외 (head 상단 robots 메타 검사)
      const indexableWeeklyFolders = weeklyFolders.filter(slug => {
        try {
          const indexPath = `${weeklyBriefingDir}/${slug}/index.html`;
          if (!fs.existsSync(indexPath)) return false;
          return !fs.readFileSync(indexPath, 'utf8').slice(0, 2000).includes('noindex');
        } catch (e) { return false; }
      });
      magazinePages.push(...indexableWeeklyFolders.map(slug => ({
        loc: `${siteBaseUrl}/magazine/weekly/${slug}/`,
        lastmod: sitemapDate,
        priority: '0.6'
      })));
    }
  }

  // 게임 개별 페이지는 sitemap에서 제외 (thin content)

  // Sitemap XML 생성 (PC URL만 - 중복 신호 최소화로 색인 효율 향상)
  const allPages = [...mainPages, ...wikiPages, ...techPages, ...magazinePages];
  const sitemapEntries = allPages.map(page => {
    return `  <url>
    <loc>${page.loc}</loc>
    <lastmod>${page.lastmod || sitemapDate}</lastmod>${page.priority ? `
    <priority>${page.priority}</priority>` : ''}
  </url>`;
  }).join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>`;
  fs.writeFileSync(`${DOCS_DIR}/sitemap.xml`, sitemapXml, 'utf8');
  console.log(`📍 Sitemap 생성: 메인 ${mainPages.length}개 + 위키 ${wikiPages.length}개 + 테크 ${techPages.length}개 + 매거진 ${magazinePages.length}개 = 총 ${allPages.length}개 URL`);

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

  // GamerScroll -> AIScroll legacy redirects are generated from source tech data.
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'gen-gs-redirects.js')], { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ _redirects 생성 실패:', err.message);
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
    fs.writeFileSync(`${DOCS_DIR}/_headers`, headerLines.join('\n') + '\n', 'utf8');
    console.log('🧾 _headers 생성 완료');
  } catch (err) {
    console.warn('⚠️ _headers 생성 실패:', err.message);
  }

  // RSS 피드 생성
  try {
    const rssCount = generateRSS('./reports', `${DOCS_DIR}/rss.xml`);
    console.log(`📡 RSS 피드 생성: ${rssCount}개 항목`);
  } catch (err) {
    console.warn('⚠️ RSS 생성 실패:', err.message);
  }

  // Service Worker 전체 생성 (template literal)
  const swCacheVersion = `gamerscroll-${runtimeAssetVersion}${searchIndexVersion ? `-${searchIndexVersion}` : ''}`;
  const swPrecacheUrls = [
    '/',
    ...cssBundles.map((bundle) => withCssAssetVersion(bundle.publicPath)),
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    `/assets/${LAYOUT_CORE_ASSET}?v=${runtimeAssetVersion}`,
    `/assets/${LAYOUT_RUNTIME_ASSET}?v=${runtimeAssetVersion}`
  ];
  const swContent = `const CACHE_NAME = '${swCacheVersion}';
const STATIC_CACHE = CACHE_NAME + '-static';
const RUNTIME_CACHE = CACHE_NAME + '-runtime';
const PRECACHE_URLS = ${JSON.stringify(swPrecacheUrls, null, 2)};
const STATIC_EXT_RE = /\\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|json)$/i;

async function cachePut(cacheName, request, response) {
  if (!response || response.status !== 200) return response;
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    return cachePut(cacheName, request, response);
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
  // warm-up: rankings JSON (fire-and-forget, does not block install)
  const warmupUrls = [
    '/rankings/grossing-ios.json',
    '/rankings/grossing-android.json',
    '/rankings/free-ios.json',
    '/rankings/free-android.json'
  ];
  caches.open(RUNTIME_CACHE).then((cache) =>
    Promise.all(
      warmupUrls.map((url) =>
        fetch(url)
          .then((res) => { if (res.status === 200) cache.put(url, res); })
          .catch(() => undefined)
      )
    )
  ).catch(() => undefined);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isHtml = request.mode === 'navigate' || accept.includes('text/html');
  const isStatic = url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/rankings/') ||
    STATIC_EXT_RE.test(url.pathname);

  if (isHtml) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, '/'));
    return;
  }

  if (isStatic) {
    // ?v= 쿼리 또는 hash-named 경로(/x.abcd1234.css)는 immutable → SWR 안전.
    // 그 외 unversioned 경로는 network-first로 신선도 우선 (build 직후 stale CSS/JS 방지).
    const isImmutable = url.searchParams.has('v') || /\\.[a-f0-9]{8,}\\./i.test(url.pathname);
    if (!isImmutable) {
      event.respondWith(networkFirst(request, STATIC_CACHE));
      return;
    }
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const revalidate = fetch(request)
        .then((response) => cachePut(STATIC_CACHE, request, response))
        .catch(() => null);

      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }

      const fresh = await revalidate;
      if (fresh) return fresh;
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
`;
  fs.writeFileSync(`${DOCS_DIR}/service-worker.js`, swContent, 'utf8');
  console.log(`🔄 Service Worker 생성 완료: ${swCacheVersion} (CSS: ${cssFilename})`);

  // 증분 빌드 캐시 저장
  buildCache.saveCache(incrementalCache);

  console.log(`\n✅ 완료! (docs/ 통합 반응형 빌드 + sitemap 갱신)`);

}

main().catch(console.error);
