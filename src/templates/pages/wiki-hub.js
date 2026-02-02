/**
 * 게임 위키 허브 페이지
 * - 홈과 동일한 2컬럼 레이아웃
 * - 메인: 전체 최신 15개 그리드 + 페이지네이션
 * - 사이드바: 매거진/위키 메뉴 + 인기/최신글
 */

const path = require('path');
const fs = require('fs');
const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateNativeAdSlot } = require('../layout');

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

// 카테고리 정보 (tech는 별도 메뉴로 분리됨)
const categoryNames = { history: '히스토리', knowledge: '지식', business: '비즈니스' };

// 로컬 위키 이미지 경로 반환
// size: 'sm' = 리스트용 작은 썸네일 (480px), 'lg' = 상세 페이지용 큰 썸네일 (1200px)
function getLocalWikiImagePath(category, slug, originalUrl, size = 'sm') {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;

  const filename = size === 'sm' ? 'thumbnail-sm.webp' : 'thumbnail.webp';
  const localPath = `/assets/images/wiki/${category}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, localPath);

  if (fs.existsSync(fullPath)) return localPath;

  // 폴백: 기존 thumbnail.webp 확인 (sm이 없을 경우)
  if (size === 'sm') {
    const fallbackPath = path.join(docsDir, `/assets/images/wiki/${category}/${slug}/thumbnail.webp`);
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/wiki/${category}/${slug}/thumbnail.webp`;
    }
  }

  const width = size === 'sm' ? 480 : 1200;
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp`;
}

// HTML 이스케이프
function escapeHtmlAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 위키 허브 페이지 생성 (/wiki/)
 */
function generateWikiHubPage({
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  issueReportsCount = 0,
  insightReportsCount = 0,
  hotpickReportsCount = 0,
  rankingReportsCount = 0,
  issueReports = [],
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,
    weekly: weeklyReportsCount,
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

  // 전체 위키 글을 날짜순 정렬
  const allWiki = [];
  for (const cat of Object.keys(wikiData)) {
    for (const article of (wikiData[cat] || [])) {
      allWiki.push({ ...article, category: cat });
    }
  }
  allWiki.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 인기 기사 Top 3 (위키 카테고리만 필터링) - 홈페이지 스타일 (썸네일 + 요약)
  function generatePopularSection() {
    // 위키 카테고리만 필터링
    const wikiPopular = sidebarPopularArticles.filter(item => {
      const p = item.path || item.link || '';
      return p.startsWith('/wiki/');
    }).slice(0, 3);

    if (wikiPopular.length === 0) return '';

    const popularCards = wikiPopular.map((item, i) => {
      const thumbUrl = item.thumbnail ? getLocalWikiImagePath(item.category, item.slug, item.thumbnail) : '';
      return `
      <a href="${item.link || item.path || '#'}" class="home-popular-card">
        <div class="home-popular-thumb">
          ${thumbUrl ? `<img src="${thumbUrl}" alt="${escapeHtmlAttr(item.title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${item.title}</h3>
          ${item.summary ? `<p class="home-popular-summary">${item.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="wiki-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">인기</h2>
        </div>
        <div class="home-popular-list">${popularCards}</div>
      </div>
    `;
  }

  // 위키 그리드 생성 - 허브용 3열 그리드
  function generateWikiGrid() {
    if (allWiki.length === 0) return '<p>위키 글이 없습니다.</p>';

    const wikiCards = allWiki.map(article => {
      const thumbnail = article.thumbnail
        ? getLocalWikiImagePath(article.category, article.slug, article.thumbnail)
        : '';
      const catName = categoryNames[article.category] || '';
      const badgeText = article.date ? formatDateKr(article.date) : catName;

      return `
        <a href="/wiki/${article.category}/${article.slug}/" class="home-trend-card">
          <div class="home-trend-card-image">
            ${thumbnail ? `<img src="${thumbnail}" alt="${escapeHtmlAttr(article.title)}" loading="lazy" data-img-fallback="hide">` : ''}
            <span class="home-trend-card-tag wiki">${badgeText}</span>
          </div>
          <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${article.title}</span></h3>
        </a>
      `;
    }).join('');

    return `
      <div class="home-card" id="wiki-all">
        <div class="home-card-header">
          <h2 class="home-card-title">최신</h2>
        </div>
        <div class="home-latest-grid" id="wikiGrid">${wikiCards}</div>
        <div class="home-pagination" id="wikiPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  function generateSidebar() {
    const counts = sidebarCounts;

    const regularCategories = [
      { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
      { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly }
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
    <section class="section active" id="wiki-hub">
      ${topAds}
      <h1 class="visually-hidden">게임 위키 - 게임 업계 지식백과</h1>
      <div class="home-container">
        <div class="home-main">
          ${generatePopularSection()}
          ${generateWikiGrid()}
        </div>
        <aside class="home-sidebar">
          <div class="home-sidebar-sticky">
            ${generateSidebar()}
          </div>
        </aside>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      // PC: 페이지네이션, 모바일: 무한스크롤
      const grid = document.getElementById('wikiGrid');
      const pagination = document.getElementById('wikiPagination');
      if (!grid || !pagination) return;

      const isMobile = window.matchMedia('(max-width:768px)').matches;
      const items = Array.from(grid.querySelectorAll('.home-trend-card'));
      const pageSize = 15;

      if (isMobile) {
        pagination.style.display = 'none';
        let visibleCount = pageSize;
        let observer;
        let lastAdAfterIndex = -1;
        const adSlots = ['4840966314', '7467129651', '7865094213', '3028357040'];
        let adSlotIndex = 0;
        const adInterval = 3;

        function showItems() {
          items.forEach((item, i) => {
            item.style.display = i < visibleCount ? '' : 'none';
          });
        }

        function insertAds() {
          if (document.body.classList.contains('ads-disabled')) return;
          for (let i = lastAdAfterIndex + 1; i < visibleCount; i++) {
            if ((i + 1) % adInterval === 0) {
              const slotId = adSlots[adSlotIndex % adSlots.length];
              adSlotIndex++;
              const adId = 'scroll-ad-' + adSlotIndex;
              const adHtml = '<div class="ad-card ad-card-scroll" id="' + adId + '" style="margin:16px 0;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">' +
                '<ins class="adsbygoogle" style="display:block;margin:0 auto" ' +
                'data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + slotId + '" data-ad-format="auto" data-full-width-responsive="true"></ins></div>';
              items[i]?.insertAdjacentHTML('afterend', adHtml);
              try {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
              } catch(e) {
                document.getElementById(adId)?.remove();
              }
              lastAdAfterIndex = i;
            }
          }
        }

        function loadMore() {
          if (visibleCount >= items.length) return;
          visibleCount = Math.min(visibleCount + pageSize, items.length);
          showItems();
          insertAds();
          observeLastItem();
        }

        function observeLastItem() {
          if (observer) observer.disconnect();
          if (visibleCount >= items.length) return;
          const lastVisible = items[visibleCount - 1];
          if (!lastVisible) return;
          observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMore();
          }, { rootMargin: '200px' });
          observer.observe(lastVisible);
        }

        showItems();
        insertAds();
        observeLastItem();
        return;
      }

      // PC: 페이지네이션
      const totalPages = Math.ceil(items.length / pageSize) || 1;
      let currentPage = 1;
      const prevBtn = pagination.querySelector('.home-prev');
      const nextBtn = pagination.querySelector('.home-next');
      const pageIndex = pagination.querySelector('.home-page-index');

      function updatePagination() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        items.forEach((item, i) => { item.style.display = (i >= start && i < end) ? '' : 'none'; });
        pageIndex.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
      }

      prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updatePagination(); } });
      nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updatePagination(); } });
      updatePagination();

      // 사이드바 인기/최신 탭 토글
      const sidebarTab = document.getElementById('sidebarArticleTab');
      if (sidebarTab) {
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
          document.getElementById('sidebar-' + target)?.classList.add('active');
        });
      }
    })();
  </script>`;

  // 첫 화면 이미지 프리로드
  const preloadImages = allWiki.slice(0, 3)
    .map(a => a.thumbnail ? getLocalWikiImagePath(a.category, a.slug, a.thumbnail, 'sm') : null)
    .filter(Boolean);

  return wrapWithLayout(content, {
    currentPage: 'wiki',
    title: '게임 위키 - 게임 업계 지식백과',
    description: '게임 업계 비즈니스, 기술, 역사, 용어를 심층적으로 다루는 게임 위키입니다.',
    keywords: '게임 위키, 게임 용어, 게임 비즈니스, ARPU, ROAS, 게임 엔진, 게임 역사',
    canonical: `${siteBaseUrl}/wiki/`,
    pageScripts,
    preloadImages,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 위키', url: `${siteBaseUrl}/wiki/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

/**
 * 위키 카테고리 목록 페이지 생성 (/wiki/{category}/)
 */
function generateWikiCategoryPage({
  category,
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  issueReportsCount = 0,
  insightReportsCount = 0,
  hotpickReportsCount = 0,
  rankingReportsCount = 0,
  issueReports = [],
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    daily: dailyReportsCount,
    weekly: weeklyReportsCount,
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

  const articles = wikiData[category] || [];
  const catName = categoryNames[category] || category;

  function generateCategoryGrid() {
    if (articles.length === 0) return '<p>위키 글이 없습니다.</p>';

    const cards = [];
    articles.forEach((article, i) => {
      const thumbnail = article.thumbnail
        ? getLocalWikiImagePath(category, article.slug, article.thumbnail)
        : '';
      const badgeText = article.date ? formatDateKr(article.date) : catName;

      cards.push(`
        <a href="/wiki/${category}/${article.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
          <div class="home-trend-card-image">
            ${thumbnail ? `<img src="${thumbnail}" alt="${escapeHtmlAttr(article.title)}" loading="lazy" data-img-fallback="hide">` : ''}
            <span class="home-trend-card-tag wiki">${badgeText}</span>
          </div>
          <h3 class="home-trend-card-title">${article.title}</h3>
        </a>`);
      if ((i + 1) % 3 === 0 && i < articles.length - 1) {
        cards.push(generateNativeAdSlot(AD_SLOTS.Article001));
      }
    });

    const totalPages = Math.ceil(articles.length / 15);

    return `
      <div class="home-card" id="wiki-category">
        <div class="home-card-header">
          <h2 class="home-card-title">${catName}</h2>
        </div>
        <div class="home-trend-grid" id="wikiGrid">${cards.join('')}</div>
        <div class="home-pagination" id="wikiPagination" data-total="${articles.length}" data-per-page="15">
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
      { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
      { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly }
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
    <section class="section active" id="wiki-category-page">
      ${topAds}
      <h1 class="visually-hidden">게임 위키 - ${catName}</h1>
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

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('wikiGrid');
      const pagination = document.getElementById('wikiPagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.home-trend-card'));
      const pageSize = 15;
      const isMobile = window.innerWidth <= 768;

      if (isMobile) {
        pagination.style.display = 'none';
        let visibleCount = pageSize;
        let observer;
        function showItems() { items.forEach((item, i) => { item.style.display = i < visibleCount ? '' : 'none'; }); }
        function loadMore() {
          if (visibleCount >= items.length) return;
          visibleCount = Math.min(visibleCount + pageSize, items.length);
          showItems(); observeLastItem();
        }
        function observeLastItem() {
          if (observer) observer.disconnect();
          if (visibleCount >= items.length) return;
          const lastVisible = items[visibleCount - 1];
          if (!lastVisible) return;
          observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: '200px' });
          observer.observe(lastVisible);
        }
        showItems(); observeLastItem();
        return;
      }

      const totalPages = Math.ceil(items.length / pageSize) || 1;
      let currentPage = 1;
      const prevBtn = pagination.querySelector('.home-page-prev');
      const nextBtn = pagination.querySelector('.home-page-next');
      const pageInfo = pagination.querySelector('.home-page-info');
      function updatePagination() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        items.forEach((item, i) => { item.style.display = (i >= start && i < end) ? '' : 'none'; });
        pageInfo.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
      }
      prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updatePagination(); } });
      nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updatePagination(); } });
      updatePagination();

      // 사이드바 인기/최신 탭 토글
      const sidebarTab = document.getElementById('sidebarArticleTab');
      if (sidebarTab) {
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
          document.getElementById('sidebar-' + target)?.classList.add('active');
        });
      }
    })();
  </script>`;

  // 첫 화면 이미지 프리로드
  const preloadImages = articles.slice(0, 3)
    .map(a => a.thumbnail ? getLocalWikiImagePath(category, a.slug, a.thumbnail, 'sm') : null)
    .filter(Boolean);

  return wrapWithLayout(content, {
    currentPage: 'wiki',
    bodyClass: 'category-detail',
    title: `${catName} - 게임 위키`,
    description: `게임 업계 ${catName} 관련 심층 정보를 제공합니다.`,
    keywords: `게임 위키, ${catName}, 게임 ${catName}`,
    canonical: `${siteBaseUrl}/wiki/${category}/`,
    pageScripts,
    preloadImages,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 위키', url: `${siteBaseUrl}/wiki/` },
      { name: catName, url: `${siteBaseUrl}/wiki/${category}/` }
    ],
    sidebarCounts,
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

module.exports = { generateWikiHubPage, generateWikiCategoryPage };
