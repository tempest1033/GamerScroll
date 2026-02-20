/**
 * 매거진 허브 페이지
 * - 홈과 동일한 2컬럼 레이아웃
 * - 메인: 정기(일간) + 이슈 15개 그리드
 * - 사이드바: 매거진/위키 메뉴 + 인기/최신글
 */

const fs = require('fs');
const path = require('path');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot, buildCardFeedPagerScript } = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// docs 폴더 경로 (이미지 로컬 확인용)
const docsDir = path.join(__dirname, '../../../docs');

const { getLocalReportThumbnail, getLocalReportThumbnailSrcset, getLocalDailyThumbnail, getLocalDailyThumbnailSrcset } = require('../helpers/thumbnail');

// 광고 슬롯
const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001);

// URL 수정 헬퍼 (이미지 프록시, width: 용도별 크기)
const fixUrl = (url, width = 480) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  // 모든 외부 이미지 프록시
  if (url.startsWith('http')) {
    const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=' + width + '&output=webp';
    return proxyUrl;
  }
  return url;
};

// 날짜 포맷 헬퍼
const formatDateKr = (dateStr) => {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
};

// HTML 이스케이프
const escapeHtmlAttr = (str) => {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const FEED_PAGE_SIZE = 15;
const INITIAL_FEED_RENDER_COUNT = 9;
function extractSeoLinkFromCardHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const hrefMatch = html.match(/<a[^>]*href="([^"]+)"/i);
  if (!hrefMatch || !hrefMatch[1]) return null;

  let title = '';
  const lazyTitleMatch = html.match(/data-lazy-img-alt="([^"]+)"/i);
  if (lazyTitleMatch && lazyTitleMatch[1]) title = lazyTitleMatch[1];
  if (!title) {
    const titleMatch = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return {
    href: hrefMatch[1],
    title: title || hrefMatch[1]
  };
}
function renderDeferredSeoLinks(links, id = '') {
  if (!Array.isArray(links) || links.length === 0) return '';
  const idAttr = id ? ` id="${id}"` : '';
  return `<div class="visually-hidden"${idAttr}>${links.map(link => `
      <a href="${escapeHtmlAttr(link.href)}">${escapeHtmlAttr(link.title || link.href)}</a>
    `).join('')}</div>`;
}
function serializeDeferredCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return JSON.stringify(cards).replace(/</g, '\\u003c');
}
function splitFeedCardsByIndex(entries, pageSize = FEED_PAGE_SIZE, initialRenderCount = pageSize) {
  const initial = [];
  const deferred = [];
  const deferredSeoLinks = [];
  const safeInitialRenderCount = Math.max(1, Math.min(initialRenderCount, pageSize));
  entries.forEach(entry => {
    if (!entry || typeof entry.html !== 'string') return;
    if ((entry.itemIndex || 0) < safeInitialRenderCount) initial.push(entry.html);
    else {
      deferred.push(entry.html);
      const seoLink = extractSeoLinkFromCardHtml(entry.html);
      if (seoLink) deferredSeoLinks.push(seoLink);
    }
  });
  return {
    initialHtml: initial.join(''),
    deferredHtml: deferred.join(''),
    deferredJson: serializeDeferredCards(deferred),
    deferredSeoLinksHtml: renderDeferredSeoLinks(deferredSeoLinks)
  };
}

const FEED_IMAGE_DIMENSION_ATTRS = 'width="1600" height="900" decoding="async"';
const POPULAR_IMAGE_DIMENSION_ATTRS = 'width="480" height="300" decoding="async"';
const LCP_IMAGE_LOADING_ATTRS = 'loading="eager" fetchpriority="high"';
const LAZY_IMAGE_LOADING_ATTRS = 'loading="lazy" fetchpriority="auto"';
function createLcpImageAttrPicker() {
  let used = false;
  return function pickLcpImageAttrs() {
    if (!used) {
      used = true;
      return LCP_IMAGE_LOADING_ATTRS;
    }
    return LAZY_IMAGE_LOADING_ATTRS;
  };
}
function getFeedImagePerfAttrs(pickLcpImageAttrs = null) {
  const loadingAttrs = typeof pickLcpImageAttrs === 'function'
    ? pickLcpImageAttrs()
    : LAZY_IMAGE_LOADING_ATTRS;
  return `${loadingAttrs} ${FEED_IMAGE_DIMENSION_ATTRS}`;
}
function getPopularImagePerfAttrs(pickLcpImageAttrs = null) {
  const loadingAttrs = typeof pickLcpImageAttrs === 'function'
    ? pickLcpImageAttrs()
    : LAZY_IMAGE_LOADING_ATTRS;
  return `${loadingAttrs} ${POPULAR_IMAGE_DIMENSION_ATTRS}`;
}

const CATEGORY_FEED_PAGER_OPTIONS = {
  itemSelector: '.home-trend-card',
  pageSize: FEED_PAGE_SIZE,
  hydrateLazyImages: true,
  mobileAds: false,
  mobileDomWindowPages: 5
};

function buildCategoryCardFeedPagerScript(gridSelector, paginationSelector, deferredDataSelector = '') {
  return buildCardFeedPagerScript({
    grid: gridSelector,
    pagination: paginationSelector,
    deferredJson: deferredDataSelector,
    itemSelector: CATEGORY_FEED_PAGER_OPTIONS.itemSelector,
    pageSize: CATEGORY_FEED_PAGER_OPTIONS.pageSize,
    hydrateLazyImages: CATEGORY_FEED_PAGER_OPTIONS.hydrateLazyImages,
    mobileAds: CATEGORY_FEED_PAGER_OPTIONS.mobileAds,
    mobileDomWindowPages: CATEGORY_FEED_PAGER_OPTIONS.mobileDomWindowPages,
    initialRenderCount: INITIAL_FEED_RENDER_COUNT,
    idleFillFirstPage: true,
    idleFillDelay: 120,
    sidebarTabId: 'sidebarArticleTab'
  });
}

/**
 * 매거진 허브 페이지 생성
 */
function generateTrendsHubPage({
  dailyReports = [],

  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,

  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  const categoryNames = { history: '히스토리', knowledge: '지식', business: '비즈니스' };

  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  // 인기 기사 Top 3 (매거진 카테고리만 필터링) - 홈페이지 스타일 (썸네일 + 요약)
  function generatePopularSection() {
    // 매거진 카테고리만 필터링 (issue, insight, hotpick, ranking)
    const magazinePopular = sidebarPopularArticles.filter(item => {
      const p = item.path || item.link || '';
      return p.startsWith('/magazine/issue/') || p.startsWith('/magazine/insight/') ||
             p.startsWith('/magazine/hotpick/') || p.startsWith('/magazine/ranking/');
    }).slice(0, 3);

    if (magazinePopular.length === 0) return '';

    const popularCards = magazinePopular.map((item, i) => {
      const thumbData = getLocalReportThumbnailSrcset(item.type, item.slug, item.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="${item.link || item.path || '#'}" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? `<img ${imgAttrs} alt="${item.title}" ${getPopularImagePerfAttrs(pickLcpImageAttrs)}>` : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${item.title}</h3>
          ${item.summary ? `<p class="home-popular-summary">${item.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');
    const popularListId = 'magazinePopularList';

    return `
      <div class="home-card" id="magazine-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">인기</h2>
        </div>
        <div class="home-popular-list" id="${popularListId}">${popularCards}</div>
      </div>
    `;
  }

  // 최신 그리드 (이슈 + 인사이트 + 핫픽 + 순위 분석 합침, 15개, 페이지네이션) - 허브용 3열 그리드
  function generateLatestGrid() {
    // 이슈 + 인사이트 + 핫픽 + 순위 분석 합쳐서 날짜순 정렬
    const allLatest = [
      ...issueReports.map(issue => ({ ...issue, type: 'issue', link: `/magazine/issue/${issue.slug}/` })),
      ...insightReports.map(insight => ({ ...insight, type: 'insight', link: `/magazine/insight/${insight.slug}/` })),
      ...hotpickReports.map(hotpick => ({ ...hotpick, type: 'hotpick', link: `/magazine/hotpick/${hotpick.slug}/` })),
      ...rankingReports.map(ranking => ({ ...ranking, type: 'ranking', link: `/magazine/ranking/${ranking.slug}/` }))
    ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (allLatest.length === 0) return '';

    const latestCardEntries = allLatest.map((item, i) => {
      const thumbData = getLocalReportThumbnailSrcset(item.type, item.slug, item.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      const imgHtml = (i < INITIAL_FEED_RENDER_COUNT && item.thumbnail)
        ? `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">`
        : '';
      const lazySrcsetAttr = thumbData.srcset ? ` data-lazy-img-srcset="${escapeHtmlAttr(thumbData.srcset)}" data-lazy-img-sizes="${escapeHtmlAttr(thumbData.sizes)}"` : '';
      const lazyAttrs = (!imgHtml && thumbData.src)
        ? ` data-lazy-img-src="${escapeHtmlAttr(thumbData.src)}"${lazySrcsetAttr} data-lazy-img-alt="${escapeHtmlAttr(item.title)}"`
        : '';
      return {
        itemIndex: i,
        html: `
      <a href="${item.link}" class="home-trend-card"${lazyAttrs}>
        <div class="home-trend-card-image">
          ${imgHtml}
          <span class="home-trend-card-tag ${item.type}">${item.date ? formatDateKr(item.date) : (item.type === 'issue' ? '이슈' : item.type === 'insight' ? '인사이트' : item.type === 'hotpick' ? '핫픽' : '순위 분석')}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${item.title}</span></h3>
      </a>
    `
      };
    });
    const latestCards = splitFeedCardsByIndex(latestCardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    return `
      <div class="home-card" id="magazine-latest">
        <div class="home-card-header">
          <h2 class="home-card-title">최신</h2>
        </div>
        <div class="home-latest-grid" id="latestGrid">
          ${latestCards.initialHtml}
        </div>
        ${latestCards.deferredJson ? `<script type="application/json" id="latestGridDeferredData">${latestCards.deferredJson}</script>${latestCards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="latestPagination" data-total="${allLatest.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev home-prev" aria-label="이전">‹</button>
          <span class="home-page-info home-page-index">1 / 1</span>
          <button class="home-page-btn home-page-next home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바: 매거진/위키/테크 메뉴
  function generateSidebarCategories() {
    const counts = sidebarCounts;

    const regularCategories = [
      { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily }
    ];

    const issueCategories = [
      { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
      { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
      { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
      { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
    ];

    const wikiCategories = [
      { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
      { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
      { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
    ];

    const techCategories = [
      { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
      { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
      { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
    ];

    const renderItems = (items) => items.map(cat => `
      <a href="${cat.link}" class="sidebar-category-item">
        <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
      </a>
    `).join('');

    return `
      <div class="home-card" id="sidebar-categories">
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div>
          <div class="sidebar-category-list">${renderItems(regularCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
          <div class="sidebar-category-list">${renderItems(issueCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
          <div class="sidebar-category-list">${renderItems(wikiCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
          <div class="sidebar-category-list">${renderItems(techCategories)}</div>
        </div>
      </div>
    `;
  }

  // 사이드바: 인기/최신글 (매거진 전체: 일간/주간/이슈)
  function generateSidebarArticles() {
    const allArticles = [];

    // 일간 추가
    dailyReports.forEach(daily => {
      allArticles.push({
        title: daily.ai?.headline || daily.title || `${daily.date} 일간`,
        link: `/magazine/daily/${daily.date}/`,
        badge: '일간',
        date: daily.date || ''
      });
    });

    // 이슈 추가
    issueReports.forEach(issue => {
      allArticles.push({
        title: issue.title,
        link: `/magazine/issue/${issue.slug}/`,
        badge: '이슈',
        date: issue.date || ''
      });
    });

    // 공통 리스트 사용
    const renderList = (items) => items.map((item, i) => `
      <a href="${item.link || item.path || '#'}" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
        </div>
      </div>
    `;
  }

  const content = `
    <section class="section active" id="magazine-hub">
      <h1 class="visually-hidden">매거진 - 게임 업계 이슈, 일간/주간 리포트</h1>

      <div class="home-container">
        <div class="home-main">
          ${topAds}
          ${generatePopularSection()}
          ${generateLatestGrid()}
        </div>
        <div class="home-sidebar">
          <div class="home-sidebar-sticky">
            ${generateSidebarCategories()}
            ${generateSidebarArticles()}
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#latestGrid', '#latestPagination', '#latestGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '매거진 - 게임 업계 이슈, 일간/주간 리포트',
    description: '게임 업계 이슈, 일간/주간 리포트를 한눈에.',
    keywords: '게임 트렌드, 게임 리포트, 게임 업계 이슈, 게임 순위, 게임 뉴스',
    canonical: `${siteBaseUrl}/magazine/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

/**
 * 일간 목록 페이지 생성 (/magazine/daily/)
 */
function generateDailyListPage({
  dailyReports = [],

  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,

  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  // 일간 그리드 (홈 스타일, 3개마다 광고, 자동 페이지네이션)
  function generateDailyGrid() {
    if (dailyReports.length === 0) return '<p>일간 리포트가 없습니다.</p>';

    const cardEntries = [];
    dailyReports.forEach((report, i) => {
      const firstIssue = report.issues && report.issues[0];
      const thumbUrl = firstIssue?.thumbnail || '';
      const title = firstIssue?.title || '일간';
      const thumbData = getLocalDailyThumbnailSrcset(report.date, thumbUrl);
      const imgAttrs = thumbData.srcset
        ? `src="${escapeHtmlAttr(thumbData.src)}" srcset="${escapeHtmlAttr(thumbData.srcset)}" sizes="${escapeHtmlAttr(thumbData.sizes)}"`
        : (thumbData.src ? `src="${escapeHtmlAttr(thumbData.src)}"` : '');
      cardEntries.push({
        itemIndex: i,
        html: `
      <a href="/magazine/daily/${report.date}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${thumbData.src ? `<img ${imgAttrs} alt="${escapeHtmlAttr(title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag">${formatDateKr(report.date)}</span>
        </div>
        <h3 class="home-trend-card-title">${title}</h3>
      </a>`
      });
    });
    const cards = splitFeedCardsByIndex(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(dailyReports.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="daily-list">
        <div class="home-card-header">
          <h2 class="home-card-title">일간</h2>
        </div>
        <div class="home-trend-grid" id="dailyGrid">${cards.initialHtml}</div>
        ${cards.deferredJson ? `<script type="application/json" id="dailyGridDeferredData">${cards.deferredJson}</script>${cards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="dailyPagination" data-total="${dailyReports.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next"${totalPages <= 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = sidebarCounts;
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
    { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
    { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
    { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
  ];
  const techCategories = [
    { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
    { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
    { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
  ];
  const renderItems = (items) => items.map(cat => `
    <a href="${cat.link}" class="sidebar-category-item">
      <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
    </a>
  `).join('');
  const renderList = (items) => items.map((item, i) => `
    <a href="${item.link || item.path || '#'}" class="sidebar-article-item"><span class="sidebar-article-rank">${i + 1}</span><span class="sidebar-article-title">${item.title}</span></a>
  `).join('');

  const sidebar = `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div><div class="sidebar-category-list">${renderItems(regularCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div><div class="sidebar-category-list">${renderItems(techCategories)}</div></div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
        <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
      </div>
    </div>
  `;

  const content = `
    <section class="section active" id="daily-hub">
      <h1 class="visually-hidden">일간 리포트 - 매일 업데이트되는 게임 뉴스</h1>
      <div class="home-container">
        <div class="home-main">${topAds}${generateDailyGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#dailyGrid', '#dailyPagination', '#dailyGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    bodyClass: 'category-detail',
    title: '일간 리포트 - 매일 업데이트되는 게임 뉴스',
    description: '일간 리포트 목록 - 매일 업데이트되는 게임 뉴스.',
    canonical: `${siteBaseUrl}/magazine/daily/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '일간', url: `${siteBaseUrl}/magazine/daily/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

/**
 * 이슈 목록 페이지 생성 (/magazine/issue/)
 */
function generateIssueListPage({
  dailyReports = [],

  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,

  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  function generateIssueGrid() {
    if (issueReports.length === 0) return '<p>리포트가 없습니다.</p>';

    const cardEntries = [];
    issueReports.forEach((issue, i) => {
      const thumbData = getLocalReportThumbnailSrcset('issue', issue.slug, issue.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      cardEntries.push({
        itemIndex: i,
        html: `
      <a href="/magazine/issue/${issue.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${issue.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(issue.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag issue">${issue.date ? formatDateKr(issue.date) : '이슈'}</span>
        </div>
        <h3 class="home-trend-card-title">${issue.title}</h3>
      </a>`
      });
    });
    const cards = splitFeedCardsByIndex(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(issueReports.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="issue-list">
        <div class="home-card-header">
          <h2 class="home-card-title">이슈</h2>
        </div>
        <div class="home-trend-grid" id="issueGrid">${cards.initialHtml}</div>
        ${cards.deferredJson ? `<script type="application/json" id="issueGridDeferredData">${cards.deferredJson}</script>${cards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="issuePagination" data-total="${issueReports.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next"${totalPages <= 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = sidebarCounts;
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
    { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
    { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
    { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
  ];
  const techCategories = [
    { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
    { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
    { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
  ];
  const renderItems = (items) => items.map(cat => `
    <a href="${cat.link}" class="sidebar-category-item">
      <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
    </a>
  `).join('');
  const renderList = (items) => items.map((item, i) => `
    <a href="${item.link || item.path || '#'}" class="sidebar-article-item"><span class="sidebar-article-rank">${i + 1}</span><span class="sidebar-article-title">${item.title}</span></a>
  `).join('');

  const sidebar = `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div><div class="sidebar-category-list">${renderItems(regularCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div><div class="sidebar-category-list">${renderItems(techCategories)}</div></div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
        <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
      </div>
    </div>
  `;

  const content = `
    <section class="section active" id="issue-hub">
      <h1 class="visually-hidden">리포트 - 게임 업계 핫이슈</h1>
      <div class="home-container">
        <div class="home-main">${topAds}${generateIssueGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#issueGrid', '#issuePagination', '#issueGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    bodyClass: 'category-detail',
    title: '리포트 - 게임 업계 핫이슈',
    description: '리포트 목록 - 게임 업계 핫이슈.',
    canonical: `${siteBaseUrl}/magazine/issue/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '이슈', url: `${siteBaseUrl}/magazine/issue/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

/**
 * 인사이트 목록 페이지 생성 (/magazine/insight/)
 */
function generateInsightListPage({
  dailyReports = [],

  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,

  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  function generateInsightGrid() {
    if (insightReports.length === 0) return '<p>인사이트 리포트가 없습니다.</p>';

    const cardEntries = [];
    insightReports.forEach((insight, i) => {
      const thumbData = getLocalReportThumbnailSrcset('insight', insight.slug, insight.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      cardEntries.push({
        itemIndex: i,
        html: `
      <a href="/magazine/insight/${insight.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${insight.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(insight.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag insight">${insight.date ? formatDateKr(insight.date) : '인사이트'}</span>
        </div>
        <h3 class="home-trend-card-title">${insight.title}</h3>
      </a>`
      });
    });
    const cards = splitFeedCardsByIndex(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(insightReports.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="insight-list">
        <div class="home-card-header">
          <h2 class="home-card-title">인사이트</h2>
        </div>
        <div class="home-trend-grid" id="insightGrid">${cards.initialHtml}</div>
        ${cards.deferredJson ? `<script type="application/json" id="insightGridDeferredData">${cards.deferredJson}</script>${cards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="insightPagination" data-total="${insightReports.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next"${totalPages <= 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = sidebarCounts;
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
    { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
    { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
    { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
  ];
  const techCategories = [
    { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
    { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
    { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
  ];
  const renderItems = (items) => items.map(cat => `
    <a href="${cat.link}" class="sidebar-category-item">
      <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
    </a>
  `).join('');
  const renderList = (items) => items.map((item, i) => `
    <a href="${item.link || item.path || '#'}" class="sidebar-article-item"><span class="sidebar-article-rank">${i + 1}</span><span class="sidebar-article-title">${item.title}</span></a>
  `).join('');

  const sidebar = `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div><div class="sidebar-category-list">${renderItems(regularCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div><div class="sidebar-category-list">${renderItems(techCategories)}</div></div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
        <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
      </div>
    </div>
  `;

  const content = `
    <section class="section active" id="insight-hub">
      <h1 class="visually-hidden">인사이트 - 게임 시장 트렌드와 분석</h1>
      <div class="home-container">
        <div class="home-main">${topAds}${generateInsightGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#insightGrid', '#insightPagination', '#insightGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    bodyClass: 'category-detail',
    title: '인사이트 - 게임 시장 트렌드와 분석',
    description: '인사이트 리포트 목록 - 게임 시장 트렌드와 분석.',
    canonical: `${siteBaseUrl}/magazine/insight/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '인사이트', url: `${siteBaseUrl}/magazine/insight/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

function generateHotpickListPage({
  dailyReports = [],

  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,

  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  function generateHotpickGrid() {
    if (hotpickReports.length === 0) return '<p>핫픽 리포트가 없습니다.</p>';

    const cardEntries = [];
    hotpickReports.forEach((hotpick, i) => {
      const thumbData = getLocalReportThumbnailSrcset('hotpick', hotpick.slug, hotpick.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      cardEntries.push({
        itemIndex: i,
        html: `
      <a href="/magazine/hotpick/${hotpick.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${hotpick.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(hotpick.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag hotpick">${hotpick.date ? formatDateKr(hotpick.date) : '핫픽'}</span>
        </div>
        <h3 class="home-trend-card-title">${hotpick.title}</h3>
      </a>`
      });
    });
    const cards = splitFeedCardsByIndex(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(hotpickReports.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="hotpick-list">
        <div class="home-card-header">
          <h2 class="home-card-title">핫픽</h2>
        </div>
        <div class="home-trend-grid" id="hotpickGrid">${cards.initialHtml}</div>
        ${cards.deferredJson ? `<script type="application/json" id="hotpickGridDeferredData">${cards.deferredJson}</script>${cards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="hotpickPagination" data-total="${hotpickReports.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next"${totalPages <= 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = sidebarCounts;
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
    { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
    { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
    { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
  ];
  const techCategories = [
    { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
    { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
    { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
  ];
  const renderItems = (items) => items.map(cat => `
    <a href="${cat.link}" class="sidebar-category-item">
      <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
    </a>
  `).join('');
  const renderList = (items) => items.map((item, i) => `
    <a href="${item.link || item.path || '#'}" class="sidebar-article-item"><span class="sidebar-article-rank">${i + 1}</span><span class="sidebar-article-title">${item.title}</span></a>
  `).join('');

  const sidebar = `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div><div class="sidebar-category-list">${renderItems(regularCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div><div class="sidebar-category-list">${renderItems(techCategories)}</div></div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
        <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
      </div>
    </div>
  `;

  const content = `
    <section class="section active" id="hotpick-hub">
      <h1 class="visually-hidden">핫픽 - 지금 주목할 게임 추천</h1>
      <div class="home-container">
        <div class="home-main">${topAds}${generateHotpickGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#hotpickGrid', '#hotpickPagination', '#hotpickGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    bodyClass: 'category-detail',
    title: '핫픽 - 지금 주목할 게임 추천',
    description: '핫픽 리포트 목록 - 지금 구매할 만한 게임 추천과 가이드.',
    canonical: `${siteBaseUrl}/magazine/hotpick/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '핫픽', url: `${siteBaseUrl}/magazine/hotpick/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

/**
 * 순위 분석 목록 페이지 생성
 */
function generateRankingListPage({
  dailyReports = [],

  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,

  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  function generateRankingGrid() {
    if (rankingReports.length === 0) return '<p>순위 분석 리포트가 없습니다.</p>';

    const cardEntries = [];
    rankingReports.forEach((ranking, i) => {
      const thumbData = getLocalReportThumbnailSrcset('ranking', ranking.slug, ranking.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      cardEntries.push({
        itemIndex: i,
        html: `
      <a href="/magazine/ranking/${ranking.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${ranking.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(ranking.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag ranking">${ranking.date ? formatDateKr(ranking.date) : '순위 분석'}</span>
        </div>
        <h3 class="home-trend-card-title">${ranking.title}</h3>
      </a>`
      });
    });
    const cards = splitFeedCardsByIndex(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(rankingReports.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="ranking-list">
        <div class="home-card-header">
          <h2 class="home-card-title">순위 분석</h2>
        </div>
        <div class="home-trend-grid" id="rankingGrid">${cards.initialHtml}</div>
        ${cards.deferredJson ? `<script type="application/json" id="rankingGridDeferredData">${cards.deferredJson}</script>${cards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="rankingPagination" data-total="${rankingReports.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next"${totalPages <= 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = sidebarCounts;
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
    { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
    { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
    { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
  ];
  const techCategories = [
    { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
    { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
    { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
  ];
  const renderItems = (items) => items.map(cat => `
    <a href="${cat.link}" class="sidebar-category-item">
      <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
    </a>
  `).join('');

  const renderList = (items) => items.map((item, i) => `
    <a href="${item.link || item.path || '#'}" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${item.title}</span>
    </a>
  `).join('');

  const content = `
    <section class="section active" id="ranking-list-page">
      <h1 class="visually-hidden">순위 분석 - 게임 순위 심층 분석</h1>

      <div class="home-container">
        <div class="home-main">
          ${topAds}
          ${generateRankingGrid()}
        </div>
        <div class="home-sidebar">
          <div class="home-sidebar-sticky">
            <div class="home-card" id="sidebar-categories">
              <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div><div class="sidebar-category-list">${renderItems(regularCategories)}</div></div>
              <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
              <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
              <div class="sidebar-category-group"><div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div><div class="sidebar-category-list">${renderItems(techCategories)}</div></div>
            </div>
            <div class="home-card" id="sidebar-articles">
              <div class="home-card-header">
                <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
                  <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
                  <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
                </div>
              </div>
              <div class="home-card-body">
                <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
                <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#rankingGrid', '#rankingPagination', '#rankingGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    bodyClass: 'category-detail',
    title: '순위 분석 - 게임 순위 심층 분석',
    description: '순위 분석 리포트 목록 - 게임 순위 비교와 심층 분석.',
    canonical: `${siteBaseUrl}/magazine/ranking/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '순위 분석', url: `${siteBaseUrl}/magazine/ranking/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

module.exports = { generateTrendsHubPage, generateDailyListPage, generateIssueListPage, generateInsightListPage, generateHotpickListPage, generateRankingListPage };
