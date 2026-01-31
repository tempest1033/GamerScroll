/**
 * AIScroll GA4 Analytics
 * 최근 7일간 인기 기사 TOP 30 조회
 */

const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const fs = require('fs');
const path = require('path');

const PROPERTY_ID = process.env.AISCROLL_GA4_PROPERTY_ID || '522344489';
const CREDENTIALS_PATH = path.join(__dirname, '../../credentials/aiscroll-ga4-service-account.json');

/**
 * GA4 클라이언트 생성
 */
function createClient() {
  if (!PROPERTY_ID) {
    console.warn('[AIScroll Analytics] No GA4 Property ID configured');
    return null;
  }

  // 환경변수 우선
  if (process.env.AISCROLL_GA4_SERVICE_ACCOUNT) {
    try {
      const credentials = JSON.parse(process.env.AISCROLL_GA4_SERVICE_ACCOUNT);
      return new BetaAnalyticsDataClient({ credentials });
    } catch (err) {
      console.error('[AIScroll Analytics] Invalid AISCROLL_GA4_SERVICE_ACCOUNT JSON:', err.message);
      return null;
    }
  }

  // 로컬 파일 폴백
  if (fs.existsSync(CREDENTIALS_PATH)) {
    return new BetaAnalyticsDataClient({ keyFilename: CREDENTIALS_PATH });
  }

  console.warn('[AIScroll Analytics] No credentials found, skipping GA4 fetch');
  return null;
}

/**
 * 인기 기사 TOP N 조회 (최근 7일)
 * AIScroll URL 구조: /article/{category}/{slug}/
 */
async function fetchPopularArticles(days = 7, limit = 30) {
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
            matchType: 'FULL_REGEXP',
            value: '^/article/[^/]+/[^/]+/?$'
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
      console.log('[AIScroll Analytics] No article data returned from GA4');
      return [];
    }

    const popularArticles = response.rows.map(row => {
      const pagePath = row.dimensionValues[0].value;
      const views = parseInt(row.metricValues[0].value, 10);

      // /article/category/slug/ -> { category, slug, views, path }
      const parts = pagePath.replace('/article/', '').replace(/\/$/, '').split('/');
      const category = parts[0];
      const slug = parts[1];

      if (!category || !slug) return null;

      return { category, slug, views, path: pagePath };
    }).filter(a => a && a.slug);

    console.log(`[AIScroll Analytics] Fetched ${popularArticles.length} popular articles`);
    return popularArticles;

  } catch (error) {
    console.error('[AIScroll Analytics] Error fetching article data:', error.message);
    return [];
  }
}

/**
 * 인기 기사 데이터를 JSON 파일로 저장
 */
async function savePopularArticles(outputPath = 'data/ai-popular-articles.json') {
  const articles = await fetchPopularArticles(7, 30);

  const data = {
    updatedAt: new Date().toISOString(),
    period: '7days',
    articles: articles
  };

  const fullPath = path.join(__dirname, '../..', outputPath);

  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
  console.log(`[AIScroll Analytics] Saved popular articles to ${outputPath}`);

  return data;
}

/**
 * 저장된 인기 기사 데이터 로드
 */
function loadPopularArticles(filePath = 'data/ai-popular-articles.json') {
  const fullPath = path.join(__dirname, '../..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log('[AIScroll Analytics] No cached popular articles found');
    return { articles: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (error) {
    console.error('[AIScroll Analytics] Error loading popular articles:', error.message);
    return { articles: [] };
  }
}

/**
 * 인기 기사 데이터 수집이 필요한지 확인 (자정 기준)
 */
function shouldFetchPopularArticles(filePath = 'data/ai-popular-articles.json') {
  const fullPath = path.join(__dirname, '../..', filePath);

  if (!fs.existsSync(fullPath)) {
    return true;
  }

  try {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    if (!data.updatedAt || !Array.isArray(data.articles) || data.articles.length === 0) {
      return true;
    }

    const lastUpdate = new Date(data.updatedAt);
    const now = new Date();

    const lastDate = lastUpdate.toISOString().slice(0, 10);
    const todayDate = now.toISOString().slice(0, 10);

    if (lastDate !== todayDate) {
      console.log(`[AIScroll Analytics] Last update: ${lastDate} - today is ${todayDate}, refresh needed`);
      return true;
    }

    console.log(`[AIScroll Analytics] Already updated today (${todayDate}) - using cached data`);
    return false;
  } catch (error) {
    console.error('[AIScroll Analytics] Error checking cooldown:', error.message);
    return true;
  }
}

module.exports = {
  fetchPopularArticles,
  savePopularArticles,
  loadPopularArticles,
  shouldFetchPopularArticles
};
