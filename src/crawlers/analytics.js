/**
 * GA4 Analytics 크롤러
 * 최근 30일간 인기 게임 페이지 TOP 10 조회
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
 * 인기 게임 TOP 10 조회 (최근 30일)
 */
async function fetchPopularGames(days = 30, limit = 10) {
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

module.exports = {
  fetchPopularGames,
  savePopularGames,
  loadPopularGames
};
