/**
 * 모바일 버전 빌드 스크립트
 * docs-mobile/ 디렉토리에 모바일 전용 HTML 생성
 * 이후 GamersCrawl-Mobile 저장소로 복사
 */

// 모바일 빌드 환경 변수 설정 (layout.js에서 layout-mobile.js 사용)
process.env.MOBILE_BUILD = 'true';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 캐시 파일 경로
const CACHE_FILE = './data-cache.json';
const OUTPUT_DIR = './docs-mobile';

// 페이지별 템플릿 import (layout-mobile.js 사용)
const { generateIndexPage } = require('./src/templates/pages/index');
const { generateTrendPage, generateDailyDetailPage, generateWeeklyDetailPage, generateIssueDetailPage } = require('./src/templates/pages/trend');
const { generateTrendsHubPage } = require('./src/templates/pages/trends-hub');
const { generateGamePage } = require('./src/templates/pages/game');
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

// ============ 게임 페이지 생성 헬퍼 (scripts/generate-game-pages.js 참조) ============
const GAMES_PATH = path.join(__dirname, 'data', 'games.json');
const HISTORY_DIR = path.join(__dirname, 'history');
const REPORTS_DIR = path.join(__dirname, 'reports');
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots', 'rankings');

function normalize(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getAppIdForRegion(gameAppIds, platform, region) {
  const regionKey = `${platform}:${region}`;
  return gameAppIds[regionKey] || gameAppIds[platform];
}

function findByTitleMatch(items, normalizedNames) {
  for (let i = 0; i < items.length; i++) {
    const itemTitle = normalize(items[i].title || '');
    if (normalizedNames.includes(itemTitle)) {
      return { index: i, item: items[i] };
    }
  }
  return null;
}

function createSlug(name, appIds = null) {
  if (appIds) {
    if (appIds.android) return String(appIds.android).toLowerCase().replace(/\./g, '-');
    if (appIds.ios && appIds.ios.startsWith('com.')) return String(appIds.ios).toLowerCase().replace(/\./g, '-');
  }
  let slug = name.toLowerCase()
    .replace(/[\u3040-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length < 2) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    slug = 'game-' + Math.abs(hash).toString(36);
  }
  return slug;
}

function loadLatestHistory() {
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('mentions'))
    .sort().reverse();
  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, files[0]), 'utf8'));
}

function getAllHistoryFiles() {
  return fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('mentions'))
    .sort();
}

function loadHistoryFiles(files) {
  const historyList = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) historyList.push({ date: dateMatch[1], file, data });
    } catch (e) {}
  }
  return historyList;
}

function getAllReportFiles() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('weekly'))
    .sort();
}

function loadReportFiles(files) {
  const reports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, file), 'utf8'));
      if (data.ai) {
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        reports.push({ date: dateMatch ? dateMatch[1] : data.ai.date, file, ai: data.ai });
      }
    } catch (e) {}
  }
  return reports;
}

function loadWeeklyReports() {
  const weeklyDir = path.join(REPORTS_DIR, 'weekly');
  if (!fs.existsSync(weeklyDir)) return [];
  const files = fs.readdirSync(weeklyDir).filter(f => f.endsWith('.json')).sort().reverse();
  const reports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(weeklyDir, file), 'utf8'));
      if (data.ai) reports.push({ weekNumber: data.weekInfo?.weekNumber || file.replace('.json', ''), file, ai: data.ai });
    } catch (e) {}
  }
  return reports;
}

function loadHourlySnapshots() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return {};
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const todayStr = kstNow.toISOString().split('T')[0];
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = kstYesterday.toISOString().split('T')[0];
  const platforms = ['ios', 'aos'];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const categories = ['grossing'];
  const result = {};
  for (const platform of platforms) {
    for (const region of regions) {
      for (const cat of categories) {
        const key = `${platform}-${region}-${cat}`;
        const allData = [];
        for (const dateStr of [yesterdayStr, todayStr]) {
          const fileName = `${dateStr}_${platform}_${region}_${cat}.csv`;
          const filePath = path.join(SNAPSHOTS_DIR, fileName);
          if (fs.existsSync(filePath)) {
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const lines = content.split('\n').slice(1);
              for (const line of lines) {
                if (!line.trim()) continue;
                const match = line.match(/^(\d{2}:\d{2}),(\d+),([^,]*),"?([^"]*)"?$/);
                if (match) {
                  const [, time, rank, appId, title] = match;
                  allData.push({ date: dateStr, time, rank: parseInt(rank, 10), appId: appId.trim(), title: title.trim() });
                }
              }
            } catch (e) {}
          }
        }
        const hourlyData = allData.filter(d => d.time.endsWith(':00') || d.time.endsWith(':30'))
          .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        result[key] = hourlyData;
      }
    }
  }
  return result;
}

function extractGameHourlyRanks(gameName, gameInfo, hourlySnapshots) {
  const gameAppIds = gameInfo.appIds || {};
  const result = {};
  const normalizedNames = [normalize(gameName)];
  if (gameInfo.aliases) for (const alias of gameInfo.aliases) normalizedNames.push(normalize(alias));
  for (const [key, data] of Object.entries(hourlySnapshots)) {
    const [platform, region] = key.split('-');
    const expectedAppId = getAppIdForRegion(gameAppIds, platform, region);
    const gameRanks = [];
    const seenTimes = new Set();
    for (const item of data) {
      let matched = false;
      if (expectedAppId && String(item.appId) === String(expectedAppId)) matched = true;
      if (!matched && item.title) {
        const normalizedTitle = normalize(item.title);
        if (normalizedNames.includes(normalizedTitle)) matched = true;
      }
      if (matched) {
        const timeKey = `${item.date} ${item.time}`;
        if (!seenTimes.has(timeKey)) {
          seenTimes.add(timeKey);
          gameRanks.push({ date: item.date, time: item.time, rank: item.rank });
        }
      }
    }
    if (gameRanks.length > 0) {
      gameRanks.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      const lastItem = gameRanks[gameRanks.length - 1];
      const lastDateTime = new Date(`${lastItem.date}T${lastItem.time}:00Z`);
      const cutoffTime = new Date(lastDateTime.getTime() - 24 * 60 * 60 * 1000);
      const cutoffDateStr = cutoffTime.toISOString().split('T')[0];
      const cutoffTimeStr = String(cutoffTime.getUTCHours()).padStart(2, '0') + ':00';
      const cutoffKey = `${cutoffDateStr} ${cutoffTimeStr}`;
      const filtered = gameRanks.filter(r => `${r.date} ${r.time}` >= cutoffKey);
      result[key] = filtered.length > 0 ? filtered : gameRanks.slice(-48);
    }
  }
  return result;
}

function collectReportMentions(normalizedNames, reports) {
  const mentions = [];
  for (const report of reports) {
    const ai = report.ai;
    if (!ai) continue;
    for (const item of ai.rankings || []) {
      if (normalizedNames.includes(normalize(item.title || ''))) {
        mentions.push({ date: report.date, type: 'ranking', tag: item.tag, title: item.title, desc: item.desc, platform: item.platform, rank: item.rank, prevRank: item.prevRank, change: item.change });
      }
    }
    for (const item of ai.community || []) {
      if (normalizedNames.includes(normalize(item.tag || ''))) {
        mentions.push({ date: report.date, type: 'community', tag: item.tag, title: item.title, desc: item.desc });
      }
    }
    for (const item of ai.issues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({ date: report.date, type: 'issue', tag: item.tag, title: item.title, desc: item.desc });
      }
    }
    for (const item of ai.metrics || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({ date: report.date, type: 'metric', tag: item.tag, title: item.title, desc: item.desc });
      }
    }
    for (const item of ai.streaming || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({ date: report.date, type: 'streaming', tag: item.tag, title: item.title, desc: item.desc });
      }
    }
    for (const item of ai.industryIssues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) {
        mentions.push({ date: report.date, type: 'industry', tag: item.tag || '업계', title: item.title, desc: item.desc });
      }
    }
  }
  const uniqueMap = new Map();
  for (const m of mentions) {
    const titleKey = `${m.type}-${(m.title || '').slice(0, 30)}`;
    const existing = uniqueMap.get(titleKey);
    if (!existing) uniqueMap.set(titleKey, m);
    else if (m.type === 'ranking' && Math.abs(m.change || 0) > Math.abs(existing.change || 0)) uniqueMap.set(titleKey, m);
    else if (m.date > existing.date) uniqueMap.set(titleKey, m);
  }
  return Array.from(uniqueMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function collectWeeklyMentions(normalizedNames, weeklyReports) {
  const mentions = [];
  for (const report of weeklyReports) {
    const ai = report.ai;
    if (!ai) continue;
    const weekDate = ai.date || `W${report.weekNumber}`;
    if (ai.mvp && normalizedNames.includes(normalize(ai.mvp.name || ''))) {
      mentions.push({ date: weekDate, type: 'mvp', tag: 'MVP', title: ai.mvp.name, desc: ai.mvp.desc, highlights: ai.mvp.highlights || [] });
    }
    for (const item of ai.issues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) mentions.push({ date: weekDate, type: 'issue', tag: item.tag || '이슈', title: item.title, desc: item.desc });
    }
    for (const item of ai.industryIssues || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) mentions.push({ date: weekDate, type: 'industry', tag: item.tag || '업계', title: item.title, desc: item.desc });
    }
    for (const item of ai.metrics || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) mentions.push({ date: weekDate, type: 'metric', tag: item.tag || '지표', title: item.title, desc: item.desc });
    }
    for (const item of ai.community || []) {
      if (normalizedNames.includes(normalize(item.tag || ''))) mentions.push({ date: weekDate, type: 'community', tag: item.tag, title: item.title, desc: item.desc });
    }
    for (const item of ai.streaming || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) mentions.push({ date: weekDate, type: 'streaming', tag: item.tag || '스트리밍', title: item.title, desc: item.desc });
    }
    for (const item of ai.releases || []) {
      if (normalizedNames.includes(normalize(item.name || item.title || ''))) mentions.push({ date: weekDate, type: 'release', tag: '신규 출시', title: item.name || item.title, desc: item.desc });
    }
    for (const item of ai.global || []) {
      const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
      if (normalizedNames.some(n => text.includes(n))) mentions.push({ date: weekDate, type: 'global', tag: item.tag || '글로벌', title: item.title, desc: item.desc });
    }
  }
  return mentions;
}

function collectGameData(gameName, gameInfo, historyData, reports, allHistory, weeklyReports = [], hourlySnapshots = {}) {
  const allNames = [gameName, ...(gameInfo.aliases || [])];
  const normalizedNames = allNames.map(n => normalize(n));
  const gameAppIds = gameInfo.appIds || {};
  const result = {
    name: gameName, platforms: gameInfo.platforms || [], developer: gameInfo.developer || '', icon: gameInfo.icon || null,
    rankings: {}, rankHistory: [], realtimeRanks: {}, steamHistory: [], news: [], community: [], steam: null, youtube: [], mentions: []
  };
  result.realtimeRanks = extractGameHourlyRanks(gameName, gameInfo, hourlySnapshots);
  const dailyMentions = reports?.length > 0 ? collectReportMentions(normalizedNames, reports) : [];
  const weeklyMentions = weeklyReports?.length > 0 ? collectWeeklyMentions(normalizedNames, weeklyReports) : [];
  result.mentions = [...dailyMentions, ...weeklyMentions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (allHistory?.length > 0) {
    const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
    const categories = ['grossing', 'free'];
    for (const { date, data } of allHistory) {
      const dayRanks = { date };
      let hasAnyRank = false;
      for (const cat of categories) {
        for (const region of regions) {
          for (const platform of ['ios', 'android']) {
            const expectedAppId = getAppIdForRegion(gameAppIds, platform, region);
            const items = data.rankings?.[cat]?.[region]?.[platform] || [];
            let matchedIndex = -1;
            if (expectedAppId) for (let i = 0; i < items.length; i++) if (String(items[i].appId) === String(expectedAppId)) { matchedIndex = i; break; }
            if (matchedIndex < 0) { const titleMatch = findByTitleMatch(items, normalizedNames); if (titleMatch) matchedIndex = titleMatch.index; }
            if (matchedIndex >= 0) { const keyPrefix = platform === 'ios' ? 'ios' : 'aos'; dayRanks[`${cat}-${keyPrefix}-${region}`] = matchedIndex + 1; hasAnyRank = true; }
          }
        }
      }
      if (hasAnyRank) result.rankHistory.push(dayRanks);
      const steamAppId = gameAppIds['steam:global'] || gameAppIds['steam'];
      const steamMostPlayed = data.steam?.mostPlayed || [];
      const steamTopSellers = data.steam?.topSellers || [];
      const findSteamItemByName = (items) => items.find(g => normalizedNames.includes(normalize(g.name || '')));
      let steamDay = null;
      let mpItem = steamAppId ? steamMostPlayed.find(g => String(g.appid) === String(steamAppId)) : null;
      if (!mpItem) mpItem = findSteamItemByName(steamMostPlayed);
      if (mpItem) { if (!steamDay) { steamDay = { date }; result.steamHistory.push(steamDay); } steamDay.ccuRank = mpItem.rank; steamDay.ccu = mpItem.ccu; }
      let tsItem = steamAppId ? steamTopSellers.find(g => String(g.appid) === String(steamAppId)) : null;
      if (!tsItem) tsItem = findSteamItemByName(steamTopSellers);
      if (tsItem) { if (!steamDay) { steamDay = { date }; result.steamHistory.push(steamDay); } steamDay.salesRank = tsItem.rank; }
    }
  }

  if (!historyData) return result;
  const categories = ['grossing', 'free'];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
  const platforms = ['ios', 'android'];
  for (const cat of categories) {
    for (const region of regions) {
      for (const platform of platforms) {
        const expectedAppId = getAppIdForRegion(gameAppIds, platform, region);
        const items = historyData.rankings?.[cat]?.[region]?.[platform] || [];
        let matchedIndex = -1, matchedItem = null;
        if (expectedAppId) for (let i = 0; i < items.length; i++) if (String(items[i].appId) === String(expectedAppId)) { matchedIndex = i; matchedItem = items[i]; break; }
        if (matchedIndex < 0) { const titleMatch = findByTitleMatch(items, normalizedNames); if (titleMatch) { matchedIndex = titleMatch.index; matchedItem = titleMatch.item; } }
        if (matchedIndex >= 0 && matchedItem) {
          result.rankings[`${region}-${platform}-${cat}`] = { rank: matchedIndex + 1, change: matchedItem.change || 0 };
          if (!result.icon && matchedItem.icon) result.icon = matchedItem.icon;
        }
      }
    }
  }
  const mostPlayed = historyData.steam?.mostPlayed || [];
  const topSellers = historyData.steam?.topSellers || [];
  const steamAppId = gameAppIds['steam:global'] || gameAppIds['steam'];
  const findSteamByName = (items) => items.find(item => normalizedNames.includes(normalize(item.name || '')));
  let mpItem = steamAppId ? mostPlayed.find(item => String(item.appid) === String(steamAppId)) : null;
  if (!mpItem) mpItem = findSteamByName(mostPlayed);
  if (mpItem) { result.steam = { currentPlayers: mpItem.ccu || mpItem.currentPlayers, rank: mpItem.rank, img: mpItem.img }; if (!result.icon && mpItem.img) result.icon = mpItem.img; }
  let tsItem = steamAppId ? topSellers.find(item => String(item.appid) === String(steamAppId)) : null;
  if (!tsItem) tsItem = findSteamByName(topSellers);
  if (tsItem) { if (!result.steam) result.steam = { img: tsItem.img }; result.steam.salesRank = tsItem.rank; result.steam.price = tsItem.price || ''; result.steam.discount = tsItem.discount || ''; if (!result.icon && tsItem.img) result.icon = tsItem.img; }
  const newsSources = historyData.news || {};
  for (const [source, items] of Object.entries(newsSources)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = (item.title || '').toLowerCase();
      if (normalizedNames.some(n => title.includes(n))) result.news.push({ title: item.title, link: item.link, thumbnail: item.thumbnail, source, date: item.date });
    }
  }
  const communityData = historyData.community || {};
  for (const [source, items] of Object.entries(communityData)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = (item.title || '').toLowerCase();
      if (normalizedNames.some(n => title.includes(n))) result.community.push({ title: item.title, link: item.link, source, comments: item.comments, views: item.views });
    }
  }
  const youtubeItems = Array.isArray(historyData.youtube) ? historyData.youtube : [];
  for (const item of youtubeItems) {
    const title = (item.title || '').toLowerCase();
    if (normalizedNames.some(n => title.includes(n))) result.youtube.push({ title: item.title, link: item.link, thumbnail: item.thumbnail, channel: item.channel });
  }
  return result;
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
  const cssBundle = bundleCssFile('./src/styles.css');
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

  // ============ 게임 상세 페이지 생성 (모바일 레이아웃) ============
  console.log('\n🎮 게임 상세 페이지 생성...');
  const mobileGamesDir = path.join(OUTPUT_DIR, 'games');

  try {
    const gamesData = JSON.parse(fs.readFileSync(GAMES_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const allHistoryFiles = getAllHistoryFiles();
    const allReportFiles = getAllReportFiles();
    const historyData = loadLatestHistory();
    const allHistory = loadHistoryFiles(allHistoryFiles);
    const allReports = loadReportFiles(allReportFiles);
    const weeklyReportsData = loadWeeklyReports();
    const hourlySnapshots = loadHourlySnapshots();

    let gameCount = 0;
    for (const [gameName, gameInfo] of Object.entries(gamesData.games || {})) {
      const slug = gameInfo.slug || createSlug(gameName, gameInfo.appIds);
      const gameData = collectGameData(gameName, gameInfo, historyData, allReports, allHistory, weeklyReportsData, hourlySnapshots);

      const hasData = Object.keys(gameData.rankings).length > 0 ||
        gameData.news.length > 0 || gameData.community.length > 0 ||
        gameData.steam !== null || gameData.youtube.length > 0 ||
        gameData.mentions.length > 0 || gameData.rankHistory.length > 0 || gameData.steamHistory.length > 0;

      gameData.slug = slug;
      gameData.hasData = hasData;

      const gameDir = path.join(mobileGamesDir, slug);
      if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });

      const html = generateGamePage(gameData);
      fs.writeFileSync(path.join(gameDir, 'index.html'), html, 'utf8');
      gameCount++;
    }

    // search-index.json 복사 (기존 docs에서)
    const searchIndexSrc = './docs/games/search-index.json';
    if (fs.existsSync(searchIndexSrc)) {
      fs.copyFileSync(searchIndexSrc, path.join(mobileGamesDir, 'search-index.json'));
    }

    console.log(`  ✅ 게임 페이지 ${gameCount}개 생성 완료`);
  } catch (e) {
    console.error(`  ❌ 게임 페이지 생성 실패: ${e.message}`);
  }

  // ============ 트렌드 페이지 생성 (모바일 레이아웃) ============
  console.log('\n📊 트렌드 페이지 생성...');
  const mobileTrendDir = path.join(OUTPUT_DIR, 'trend');

  try {
    // 일간/주간 리포트 파일 스캔
    const dailyReports = fs.readdirSync('./reports')
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/))
      .map(f => {
        const date = f.replace('.json', '');
        return { slug: date, file: f, date };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const weeklyReportsFiles = fs.existsSync('./reports/weekly')
      ? fs.readdirSync('./reports/weekly')
          .filter(f => f.match(/^\d{4}-W\d{2}\.json$/))
          .map(f => {
            const weekNum = f.replace('.json', '');
            return { slug: weekNum, file: f, weekNumber: weekNum };
          })
          .sort((a, b) => b.weekNumber.localeCompare(a.weekNumber))
      : [];

    // 이슈 리포트 데이터 로드 (승인된 것만 노출)
    let issueReports = [];
    const issueReportsDir = './reports/issue';
    if (fs.existsSync(issueReportsDir)) {
      issueReports = fs.readdirSync(issueReportsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(issueReportsDir, f), 'utf8'));
            return { ...data, slug: f.replace('.json', '') };
          } catch { return null; }
        })
        .filter(p => p && p.status === 'approved')
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    // 1. 트렌드 허브 페이지 생성
    if (!fs.existsSync(mobileTrendDir)) fs.mkdirSync(mobileTrendDir, { recursive: true });

    const hubHtml = generateTrendsHubPage({
      dailyReports: dailyReports.slice(0, 14).map(r => {
        try {
          const data = JSON.parse(fs.readFileSync(`./reports/${r.file}`, 'utf8'));
          return { slug: r.slug, date: r.date, summary: data.ai?.summary || '' };
        } catch { return { slug: r.slug, date: r.date, summary: '' }; }
      }),
      weeklyReports: weeklyReportsFiles.slice(0, 8).map(r => {
        try {
          const data = JSON.parse(fs.readFileSync(`./reports/weekly/${r.file}`, 'utf8'));
          return { slug: r.slug, weekNumber: r.weekNumber, summary: data.ai?.summary || '' };
        } catch { return { slug: r.slug, weekNumber: r.weekNumber, summary: '' }; }
      }),
      issueReports: issueReports.slice(0, 6).map(p => ({
        slug: p.slug, title: p.title, date: p.date, summary: p.summary
      })),
      news: cache?.news || {}
    });
    fs.writeFileSync(path.join(mobileTrendDir, 'index.html'), hubHtml, 'utf8');
    console.log(`  ✅ trend/index.html`);

    // 2. 일간 상세 페이지 생성
    const dailyDir = path.join(mobileTrendDir, 'daily');
    if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });

    for (let i = 0; i < dailyReports.length; i++) {
      const report = dailyReports[i];
      try {
        const data = JSON.parse(fs.readFileSync(`./reports/${report.file}`, 'utf8'));
        const pageDir = path.join(dailyDir, report.slug);
        if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });

        const nav = {
          prev: dailyReports[i + 1] ? { slug: dailyReports[i + 1].slug, date: dailyReports[i + 1].date } : null,
          next: dailyReports[i - 1] ? { slug: dailyReports[i - 1].slug, date: dailyReports[i - 1].date } : null
        };

        const html = generateDailyDetailPage({ insight: data, slug: report.slug, nav, cache });
        fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
      } catch (e) { console.warn(`  ⚠️ 일간 ${report.slug}: ${e.message}`); }
    }
    console.log(`  ✅ 일간 상세 페이지 ${dailyReports.length}개 생성`);

    // 3. 주간 상세 페이지 생성
    const weeklyDir = path.join(mobileTrendDir, 'weekly');
    if (!fs.existsSync(weeklyDir)) fs.mkdirSync(weeklyDir, { recursive: true });

    for (let i = 0; i < weeklyReportsFiles.length; i++) {
      const report = weeklyReportsFiles[i];
      try {
        const data = JSON.parse(fs.readFileSync(`./reports/weekly/${report.file}`, 'utf8'));
        const pageDir = path.join(weeklyDir, report.slug);
        if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });

        const nav = {
          prev: weeklyReportsFiles[i + 1] ? { slug: weeklyReportsFiles[i + 1].slug, weekNumber: weeklyReportsFiles[i + 1].weekNumber } : null,
          next: weeklyReportsFiles[i - 1] ? { slug: weeklyReportsFiles[i - 1].slug, weekNumber: weeklyReportsFiles[i - 1].weekNumber } : null
        };

        const html = generateWeeklyDetailPage({ weeklyInsight: data, slug: report.slug, nav });
        fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
      } catch (e) { console.warn(`  ⚠️ 주간 ${report.slug}: ${e.message}`); }
    }
    console.log(`  ✅ 주간 상세 페이지 ${weeklyReportsFiles.length}개 생성`);

    // 4. 이슈 리포트 페이지 생성
    if (issueReports.length > 0) {
      const issueOutDir = path.join(mobileTrendDir, 'issue');
      if (!fs.existsSync(issueOutDir)) fs.mkdirSync(issueOutDir, { recursive: true });

      for (let i = 0; i < issueReports.length; i++) {
        const post = issueReports[i];
        try {
          const pageDir = path.join(issueOutDir, post.slug);
          if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });

          const nav = {
            prev: issueReports[i + 1] ? { slug: issueReports[i + 1].slug, title: issueReports[i + 1].title } : null,
            next: issueReports[i - 1] ? { slug: issueReports[i - 1].slug, title: issueReports[i - 1].title } : null
          };

          const html = generateIssueDetailPage({ post, nav });
          fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
        } catch (e) { console.warn(`  ⚠️ 이슈 리포트 ${post.slug}: ${e.message}`); }
      }
      console.log(`  ✅ 이슈 리포트 페이지 ${issueReports.length}개 생성`);
    }
  } catch (e) {
    console.error(`  ❌ 트렌드 페이지 생성 실패: ${e.message}`);
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
