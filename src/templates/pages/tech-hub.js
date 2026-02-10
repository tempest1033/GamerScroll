/**
 * 테크 허브 페이지
 * - 홈과 동일한 2컬럼 레이아웃
 * - 메인: 전체 최신 15개 그리드 + 페이지네이션
 * - 사이드바: 매거진/위키/테크 메뉴 + 인기/최신글
 */

const path = require('path');
const fs = require('fs');
const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateNativeAdSlot, buildCardFeedPagerScript } = require('../layout');

// 통합 반응형 빌드 - 단일 도메인/경로
const docsDir = path.join(__dirname, '../../../docs');
const siteBaseUrl = 'https://gamerscroll.com';

// 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);

// 날짜 포맷 헬퍼
const formatDateKr = (dateStr) => {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
};

// 카테고리 정보
const categoryNames = { normal: '일반', ai: 'AI', vibecoding: '바이브코딩' };

// 로컬 테크 이미지 경로 반환
function getLocalTechImagePath(category, slug, originalUrl, size = 'sm') {
  if (!originalUrl) return '';
  let url = originalUrl;
  if (url.startsWith('//')) url = `https:${url}`;
  if (!url.startsWith('http')) return url;
  if (!category || !slug) {
    const widthFallback = size === 'xs' ? 200 : (size === 'lg' ? 1200 : 480);
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${widthFallback}&output=webp`;
  }

  const sizeMap = { xs: 'thumbnail-xs.webp', sm: 'thumbnail-sm.webp', lg: 'thumbnail.webp' };
  const widthMap = { xs: 200, sm: 480, lg: 1200 };
  const filename = sizeMap[size] || sizeMap.sm;
  const localPath = `/assets/images/tech/${category}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images/tech', category, slug, filename);

  if (fs.existsSync(fullPath)) return localPath;

  // 폴백: 기존 thumbnail.webp 확인 (sm이 없을 경우)
  if (size === 'sm' || size === 'xs') {
    const fallbackPath = path.join(docsDir, 'assets/images/tech', category, slug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/tech/${category}/${slug}/thumbnail.webp`;
    }
  }

  // 기존 wiki/tech 이미지 폴백
  const wikiLocalPath = `/assets/images/wiki/tech/${slug}/${filename}`;
  const wikiFullPath = path.join(docsDir, wikiLocalPath);
  if (fs.existsSync(wikiFullPath)) return wikiLocalPath;

  const width = widthMap[size] || 480;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp`;
}

function getLocalTechImageSrcset(category, slug, originalUrl) {
  const xsUrl = getLocalTechImagePath(category, slug, originalUrl, 'xs');
  const smUrl = getLocalTechImagePath(category, slug, originalUrl, 'sm');
  if (!smUrl) return { src: '', srcset: '' };
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} 200w, ${smUrl} 480w`,
    sizes: '(max-width: 768px) 133px, 253px'
  };
}

// HTML 이스케이프
function escapeHtmlAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  mobileAds: true,
  adInterval: 3,
  mobileDomWindowPages: 5,
  adSlots: ['4840966314', '7467129651', '7865094213', '3028357040']
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
    adInterval: CATEGORY_FEED_PAGER_OPTIONS.adInterval,
    mobileDomWindowPages: CATEGORY_FEED_PAGER_OPTIONS.mobileDomWindowPages,
    adSlots: CATEGORY_FEED_PAGER_OPTIONS.adSlots,
    initialRenderCount: INITIAL_FEED_RENDER_COUNT,
    idleFillFirstPage: true,
    idleFillDelay: 120,
    sidebarTabId: 'sidebarArticleTab'
  });
}

/**
 * 테크 허브 페이지 생성 (/tech/)
 */
function generateTechHubPage({
  techData = {},
  wikiData = {},
  dailyReportsCount = 0,

  issueReportsCount = 0,
  insightReportsCount = 0,
  hotpickReportsCount = 0,
  rankingReportsCount = 0,
  issueReports = [],
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReportsCount,
    insight: insightReportsCount,
    hotpick: hotpickReportsCount,
    ranking: rankingReportsCount,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  // 전체 테크 글을 날짜순 정렬
  const allTech = [];
  for (const cat of Object.keys(techData)) {
    for (const article of (techData[cat] || [])) {
      allTech.push({ ...article, category: cat });
    }
  }
  allTech.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 인기 기사 Top 3 (테크 카테고리만 필터링) - 홈페이지 스타일 (썸네일 + 요약)
  function generatePopularSection() {
    // 테크 카테고리만 필터링
    const techPopular = sidebarPopularArticles.filter(item => {
      const p = item.path || item.link || '';
      return p.startsWith('/tech/');
    }).slice(0, 3);

    if (techPopular.length === 0) return '';

    const popularCards = techPopular.map((item, i) => {
      const thumbData = item.thumbnail ? getLocalTechImageSrcset(item.category, item.slug, item.thumbnail) : { src: '', srcset: '' };
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="${item.link || item.path || '#'}" class="home-popular-card">
        <div class="home-popular-thumb">
          ${thumbData.src ? `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" ${getPopularImagePerfAttrs(pickLcpImageAttrs)}>` : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${item.title}</h3>
          ${item.summary ? `<p class="home-popular-summary">${item.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');
    const popularListId = 'techPopularList';

    return `
      <div class="home-card" id="tech-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">인기</h2>
        </div>
        <div class="home-popular-list" id="${popularListId}">${popularCards}</div>
      </div>
    `;
  }

  // 테크 그리드 생성 - 허브용 3열 그리드
  function generateTechGrid() {
    if (allTech.length === 0) return '<p>테크 글이 없습니다.</p>';

    const techCardEntries = allTech.map((article, i) => {
      const thumbData = article.thumbnail
        ? getLocalTechImageSrcset(article.category, article.slug, article.thumbnail)
        : { src: '', srcset: '' };
      const imgAttrs = thumbData.srcset
        ? `src="${escapeHtmlAttr(thumbData.src)}" srcset="${escapeHtmlAttr(thumbData.srcset)}" sizes="${escapeHtmlAttr(thumbData.sizes)}"`
        : (thumbData.src ? `src="${escapeHtmlAttr(thumbData.src)}"` : '');
      const catName = categoryNames[article.category] || '';
      const badgeText = article.date ? formatDateKr(article.date) : catName;
      const imgHtml = (i < INITIAL_FEED_RENDER_COUNT && thumbData.src)
        ? `<img ${imgAttrs} alt="${escapeHtmlAttr(article.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">`
        : '';
      const lazySrcsetAttr = thumbData.srcset ? ` data-lazy-img-srcset="${escapeHtmlAttr(thumbData.srcset)}" data-lazy-img-sizes="${escapeHtmlAttr(thumbData.sizes)}"` : '';
      const lazyAttrs = (!imgHtml && thumbData.src)
        ? ` data-lazy-img-src="${escapeHtmlAttr(thumbData.src)}"${lazySrcsetAttr} data-lazy-img-alt="${escapeHtmlAttr(article.title)}"`
        : '';

      return {
        itemIndex: i,
        html: `
        <a href="/tech/${article.category}/${article.slug}/" class="home-trend-card"${lazyAttrs}>
          <div class="home-trend-card-image">
            ${imgHtml}
            <span class="home-trend-card-tag tech">${badgeText}</span>
          </div>
          <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${article.title}</span></h3>
        </a>
      `
      };
    });
    const techCards = splitFeedCardsByIndex(techCardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    return `
      <div class="home-card" id="tech-all">
        <div class="home-card-header">
          <h2 class="home-card-title">최신</h2>
        </div>
        <div class="home-latest-grid" id="techGrid">${techCards.initialHtml}</div>
        ${techCards.deferredJson ? `<script type="application/json" id="techGridDeferredData">${techCards.deferredJson}</script>${techCards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="techPagination" data-total="${allTech.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev home-prev" aria-label="이전">‹</button>
          <span class="home-page-info home-page-index">1 / 1</span>
          <button class="home-page-btn home-page-next home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  function generateSidebar() {
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

    const renderArticleList = (items) => items.map((item, i) => `
      <a href="${item.link || item.path || '#'}" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
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

      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderArticleList(sidebarPopularArticles.slice(0, 10))}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderArticleList(sidebarLatestArticles.slice(0, 10))}</div>
        </div>
      </div>
    `;
  }

  const content = `
    <section class="section active" id="tech-hub">
      ${topAds}
      <h1 class="visually-hidden">테크 - 기술, AI, 개발 도구</h1>
      <div class="home-container">
        <div class="home-main">
          ${generatePopularSection()}
          ${generateTechGrid()}
        </div>
        <aside class="home-sidebar">
          <div class="home-sidebar-sticky">
            ${generateSidebar()}
          </div>
        </aside>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#techGrid', '#techPagination', '#techGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'tech',
    title: '테크 - 기술, AI, 개발 도구',
    description: '기술, AI, 개발 도구, 바이브 코딩 등 테크 관련 심층 정보를 제공합니다.',
    keywords: '테크, 기술, AI, 개발 도구, 바이브 코딩, 게임 엔진',
    canonical: `${siteBaseUrl}/tech/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '테크', url: `${siteBaseUrl}/tech/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

/**
 * 테크 카테고리 목록 페이지 생성 (/tech/{category}/)
 */
function generateTechCategoryPage({
  category,
  techData = {},
  wikiData = {},
  dailyReportsCount = 0,

  issueReportsCount = 0,
  insightReportsCount = 0,
  hotpickReportsCount = 0,
  rankingReportsCount = 0,
  issueReports = [],
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const pickLcpImageAttrs = createLcpImageAttrPicker();
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,

    issue: issueReportsCount,
    insight: insightReportsCount,
    hotpick: hotpickReportsCount,
    ranking: rankingReportsCount,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  const articles = techData[category] || [];
  const catName = categoryNames[category] || category;

  function generateCategoryGrid() {
    if (articles.length === 0) return '<p>테크 글이 없습니다.</p>';

    const cardEntries = [];
    articles.forEach((article, i) => {
      const thumbData = article.thumbnail
        ? getLocalTechImageSrcset(category, article.slug, article.thumbnail)
        : { src: '', srcset: '' };
      const imgAttrs = thumbData.srcset
        ? `src="${escapeHtmlAttr(thumbData.src)}" srcset="${escapeHtmlAttr(thumbData.srcset)}" sizes="${escapeHtmlAttr(thumbData.sizes)}"`
        : (thumbData.src ? `src="${escapeHtmlAttr(thumbData.src)}"` : '');
      const lazySrcsetAttr = thumbData.srcset ? ` data-lazy-img-srcset="${escapeHtmlAttr(thumbData.srcset)}" data-lazy-img-sizes="${escapeHtmlAttr(thumbData.sizes)}"` : '';
      const lazyAttrs = (i >= INITIAL_FEED_RENDER_COUNT && thumbData.src)
        ? ` data-lazy-img-src="${escapeHtmlAttr(thumbData.src)}"${lazySrcsetAttr} data-lazy-img-alt="${escapeHtmlAttr(article.title)}"`
        : '';
      const badgeText = article.date ? formatDateKr(article.date) : catName;

      cardEntries.push({
        itemIndex: i,
        html: `
        <a href="/tech/${category}/${article.slug}/" class="home-trend-card home-latest-item" data-index="${i}"${lazyAttrs}>
          <div class="home-trend-card-image">
            ${(i < INITIAL_FEED_RENDER_COUNT && thumbData.src) ? `<img ${imgAttrs} alt="${escapeHtmlAttr(article.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">` : ''}
            <span class="home-trend-card-tag tech">${badgeText}</span>
          </div>
          <h3 class="home-trend-card-title">${article.title}</h3>
        </a>`
      });
      if ((i + 1) % 3 === 0 && i < articles.length - 1) {
        cardEntries.push({
          itemIndex: i,
          html: generateNativeAdSlot(AD_SLOTS.Article001)
        });
      }
    });
    const cards = splitFeedCardsByIndex(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(articles.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="tech-category">
        <div class="home-card-header">
          <h2 class="home-card-title">${catName}</h2>
        </div>
        <div class="home-trend-grid" id="techGrid">${cards.initialHtml}</div>
        ${cards.deferredJson ? `<script type="application/json" id="techCategoryGridDeferredData">${cards.deferredJson}</script>${cards.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" id="techPagination" data-total="${articles.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next"${totalPages <= 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  function generateSidebar() {
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

    const renderArticleList = (items) => items.map((item, i) => `
      <a href="${item.link || item.path || '#'}" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
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

      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderArticleList(sidebarPopularArticles.slice(0, 10))}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderArticleList(sidebarLatestArticles.slice(0, 10))}</div>
        </div>
      </div>
    `;
  }

  const content = `
    <section class="section active" id="tech-category-page">
      ${topAds}
      <h1 class="visually-hidden">테크 - ${catName}</h1>
      <div class="home-container">
        <div class="home-main">
          ${generateCategoryGrid()}
        </div>
        <aside class="home-sidebar">
          <div class="home-sidebar-sticky">
            ${generateSidebar()}
          </div>
        </aside>
      </div>
    </section>
  `;

  const pageScripts = buildCategoryCardFeedPagerScript('#techGrid', '#techPagination', '#techCategoryGridDeferredData');

  return wrapWithLayout(content, {
    currentPage: 'tech',
    bodyClass: 'category-detail',
    title: `${catName} - 테크`,
    description: `테크 ${catName} 관련 심층 정보를 제공합니다.`,
    keywords: `테크, ${catName}, 기술`,
    canonical: `${siteBaseUrl}/tech/${category}/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '테크', url: `${siteBaseUrl}/tech/` },
      { name: catName, url: `${siteBaseUrl}/tech/${category}/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

module.exports = { generateTechHubPage, generateTechCategoryPage };
