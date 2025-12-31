/**
 * GA4 Analytics 크롤러
 * 최근 30일간 인기 게임 페이지 TOP 20 조회 (필터링 후 10개 표시용)
 */

const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const fs = require('fs');
const path = require('path');

const PROPERTY_ID = '514721651';
const CREDENTIALS_PATH = path.join(__dirname, '../../credentials/ga4-service-account.json');

/**
 * GA4 클라이언트 생성
 * 로컬: credentials 파일 사용
 * 서버: 환경변수 사용
 */
function createClient() {
  // 환경변수 우선
  if (process.env.GA4_SERVICE_ACCOUNT) {
    try {
      const credentials = JSON.parse(process.env.GA4_SERVICE_ACCOUNT);
      return new BetaAnalyticsDataClient({ credentials });
    } catch (err) {
      console.error('[Analytics] Invalid GA4_SERVICE_ACCOUNT JSON:', err.message);
      return null;
    }
  }

  // 로컬 파일 폴백
  if (fs.existsSync(CREDENTIALS_PATH)) {
    return new BetaAnalyticsDataClient({ keyFilename: CREDENTIALS_PATH });
  }

  console.warn('[Analytics] No credentials found, skipping GA4 fetch');
  return null;
}

/**
 * 인기 게임 TOP 20 조회 (최근 30일) - 필터링 후 10개 표시용
 */
async function fetchPopularGames(days = 30, limit = 20) {
  const client = createClient();

  if (!client) {
    return [];
  }

  try {
    const [response] = await client.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: {
            matchType: 'BEGINS_WITH',
            value: '/games/'
          }
        }
      },
      orderBys: [{
        metric: { metricName: 'screenPageViews' },
        desc: true
      }],
      limit: limit
    });

    if (!response.rows || response.rows.length === 0) {
      console.log('[Analytics] No data returned from GA4');
      return [];
    }

    const popularGames = response.rows.map(row => {
      const pagePath = row.dimensionValues[0].value;
      // /games/game-slug/ -> game-slug
      const slug = pagePath.replace('/games/', '').replace(/\/$/, '');
      const views = parseInt(row.metricValues[0].value, 10);

      return { slug, views };
    }).filter(game => game.slug && game.slug.length > 0);

    console.log(`[Analytics] Fetched ${popularGames.length} popular games`);
    return popularGames;

  } catch (error) {
    console.error('[Analytics] Error fetching GA4 data:', error.message);
    return [];
  }
}

/**
 * 인기 게임 데이터를 JSON 파일로 저장
 */
async function savePopularGames(outputPath = 'data/popular-games.json') {
  const games = await fetchPopularGames();

  const data = {
    updatedAt: new Date().toISOString(),
    period: '30days',
    games: games
  };

  const fullPath = path.join(__dirname, '../..', outputPath);

  // 디렉토리가 없으면 생성
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
  console.log(`[Analytics] Saved popular games to ${outputPath}`);

  return data;
}

/**
 * 저장된 인기 게임 데이터 로드
 */
function loadPopularGames(filePath = 'data/popular-games.json') {
  const fullPath = path.join(__dirname, '../..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log('[Analytics] No cached popular games found');
    return { games: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (error) {
    console.error('[Analytics] Error loading popular games:', error.message);
    return { games: [] };
  }
}

/**
 * 인기 게임 데이터 수집이 필요한지 확인 (24시간 쿨타임)
 * @param {string} filePath - 데이터 파일 경로
 * @returns {boolean} 수집이 필요하면 true
 */
function shouldFetchPopularGames(filePath = 'data/popular-games.json') {
  const fullPath = path.join(__dirname, '../..', filePath);

  if (!fs.existsSync(fullPath)) {
    return true; // 파일이 없으면 수집 필요
  }

  try {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (!data.updatedAt) {
      return true; // updatedAt이 없으면 수집 필요
    }

    const lastUpdate = new Date(data.updatedAt);
    const now = new Date();
    const hoursDiff = (now - lastUpdate) / (1000 * 60 * 60);

    if (hoursDiff >= 24) {
      console.log(`[Analytics] Last update: ${hoursDiff.toFixed(1)} hours ago - refresh needed`);
      return true;
    }

    console.log(`[Analytics] Last update: ${hoursDiff.toFixed(1)} hours ago - using cached data`);
    return false;
  } catch (error) {
    console.error('[Analytics] Error checking cooldown:', error.message);
    return true; // 에러 시 수집 시도
  }
}

module.exports = {
  fetchPopularGames,
  savePopularGames,
  loadPopularGames,
  shouldFetchPopularGames
};
