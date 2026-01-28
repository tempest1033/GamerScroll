/**
 * 매거진 허브 페이지
 * - 홈과 동일한 2컬럼 레이아웃
 * - 메인: 정기(일간/주간) + 이슈 15개 그리드
 * - 사이드바: 매거진/위키 메뉴 + 인기/최신글
 */

const fs = require('fs');
const path = require('path');
const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateVerticalAdSlot } = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// docs 폴더 경로 (이미지 로컬 확인용)
const docsDir = path.join(__dirname, '../../../docs');

// 이슈/핫픽/인사이트 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
// size: 'xs' = 모바일용 (200px), 'sm' = PC리스트용 (480px), 'lg' = 상세 페이지용 (1200px)
function getLocalReportThumbnail(type, slug, originalUrl, size = 'sm') {
  if (!type || !slug) return originalUrl || '';

  const sizeMap = { xs: 'thumbnail-xs.webp', sm: 'thumbnail-sm.webp', lg: 'thumbnail.webp' };
  const widthMap = { xs: 200, sm: 480, lg: 1200 };
  const filename = sizeMap[size] || sizeMap.sm;
  const localPath = `/assets/images/${type}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images', type, slug, filename);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 폴백: 기존 thumbnail.webp 확인 (sm/xs가 없을 경우)
  if (size === 'sm' || size === 'xs') {
    const fallbackPath = path.join(docsDir, 'assets/images', type, slug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/${type}/${slug}/thumbnail.webp`;
    }
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  const width = widthMap[size] || 480;
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp` : '';
}

// srcset 헬퍼 - 반응형 이미지용 (xs 200w, sm 480w)
function getLocalReportThumbnailSrcset(type, slug, originalUrl) {
  const xsUrl = getLocalReportThumbnail(type, slug, originalUrl, 'xs');
  const smUrl = getLocalReportThumbnail(type, slug, originalUrl, 'sm');
  // xs와 sm이 같으면 srcset 불필요
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} 200w, ${smUrl} 480w`,
    sizes: '(max-width: 768px) 133px, 253px'
  };
}

// 일간 뉴스 썸네일 로컬 경로 헬퍼 (날짜 + URL 해시 기반)
function getLocalDailyThumbnail(date, originalUrl) {
  if (!originalUrl) return '';
  let url = originalUrl;
  if (url.startsWith('//')) url = 'https:' + url;

  if (!date || !url.startsWith('http')) {
    return url.startsWith('http') ? `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=480&output=webp` : url;
  }

  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  const localPath = `/assets/images/daily/${date}/${hash}.webp`;
  const fullPath = path.join(docsDir, 'assets/images/daily', date, `${hash}.webp`);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=480&output=webp`;
}

// 주간 리포트 썸네일 로컬 경로 헬퍼 (2026-W04 형식)
// size: 'sm' = 리스트용 (480px), 'lg' = 상세용 (1200px)
function getLocalWeeklyThumbnail(weekSlug, originalUrl, size = 'sm') {
  if (!originalUrl || !weekSlug) return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=480&output=webp` : '';

  const filename = size === 'sm' ? 'thumbnail-sm.webp' : 'thumbnail.webp';
  const localPath = `/assets/images/weekly/${weekSlug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images/weekly', weekSlug, filename);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 폴백: 기존 thumbnail.webp 확인
  if (size === 'sm') {
    const fallbackPath = path.join(docsDir, 'assets/images/weekly', weekSlug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/weekly/${weekSlug}/thumbnail.webp`;
    }
  }
  const width = size === 'sm' ? 480 : 1200;
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp`;
}

// 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);

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

/**
 * 매거진 허브 페이지 생성
 */
function generateTrendsHubPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const categoryNames = { history: '히스토리', knowledge: '지식', business: '비즈니스' };

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
          ${item.thumbnail ? `<img ${imgAttrs} alt="${item.title}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${item.title}</h3>
          ${item.summary ? `<p class="home-popular-summary">${item.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="magazine-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">인기</h2>
        </div>
        <div class="home-popular-list">${popularCards}</div>
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

    const latestCards = allLatest.map(item => {
      const thumbData = getLocalReportThumbnailSrcset(item.type, item.slug, item.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="${item.link}" class="home-trend-card">
        <div class="home-trend-card-image">
          ${item.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag ${item.type}">${item.date ? formatDateKr(item.date) : (item.type === 'issue' ? '이슈' : item.type === 'insight' ? '인사이트' : item.type === 'hotpick' ? '핫픽' : '순위 분석')}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${item.title}</span></h3>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="magazine-latest">
        <div class="home-card-header">
          <h2 class="home-card-title">최신</h2>
        </div>
        <div class="home-latest-grid" id="latestGrid">
          ${latestCards}
        </div>
        <div class="home-pagination" id="latestPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바: 매거진/위키/테크 메뉴
  function generateSidebarCategories() {
    const counts = {
      daily: dailyReportsCount,
      weekly: weeklyReportsCount,
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

    // 주간 추가
    weeklyReports.forEach(weekly => {
      const weekSlug = weekly.weekInfo ? `${weekly.weekInfo.year}-W${String(weekly.weekInfo.weekNumber).padStart(2, '0')}` : '';
      allArticles.push({
        title: weekly.ai?.headline || weekly.title || `${weekSlug} 주간`,
        link: `/magazine/weekly/${weekSlug}/`,
        badge: '주간',
        date: weekly.weekInfo?.startDate || ''
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
      ${topAds}
      <h1 class="visually-hidden">매거진 - 게임 업계 이슈, 일간/주간 리포트</h1>

      <div class="home-container">
        <div class="home-main">
          ${generatePopularSection()}
          ${generateLatestGrid()}
        </div>
        <div class="home-sidebar">
          <div class="home-sidebar-sticky">
            ${generateSidebarCategories()}
            ${generateSidebarArticles()}
            ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 최신 그리드 (PC: 페이지네이션, 모바일: 무한스크롤)
    (function() {
      const grid = document.getElementById('latestGrid');
      const pagination = document.getElementById('latestPagination');
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
        items.forEach((item, i) => {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });
        pageIndex.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
      }

      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; updatePagination(); }
      });
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; updatePagination(); }
      });

      updatePagination();
    })();

    // 사이드바 인기/최신 탭
    (function() {
      const tabContainer = document.getElementById('sidebarArticleTab');
      if (!tabContainer) return;
      tabContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        tabContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.sidebarTab;
        document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
        document.getElementById('sidebar-' + tab)?.classList.add('active');
      });
    })();
  </script>`;

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
    ]
  });
}

/**
 * 일간 목록 페이지 생성 (/magazine/daily/)
 */
function generateDailyListPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const categoryNames = { history: '히스토리', knowledge: '지식', tech: '기술', business: '비즈니스' };

  // 일간 그리드 (15개, 페이지네이션)
  function generateDailyGrid() {
    if (dailyReports.length === 0) return '<p>일간 리포트가 없습니다.</p>';

    const dailyCards = dailyReports.map(report => `
      <a href="/magazine/daily/${report.date}/" class="category-list-card">
        <div class="category-list-thumb">
          ${report.thumbnail ? `<img src="${getLocalDailyThumbnail(report.date, report.thumbnail)}" alt="${escapeHtmlAttr(report.headline)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="category-list-badge">${formatDateKr(report.date)}</span>
        </div>
        <div class="category-list-info">
          <h3 class="category-list-title">${report.headline || '일간'}</h3>
          ${report.summary ? `<p class="category-list-summary">${report.summary}</p>` : ''}
        </div>
      </a>
    `).join('');

    return `
      <div class="home-card" id="daily-list">
        <div class="home-card-header">
          <h2 class="home-card-title">일간</h2>
        </div>
        <div class="category-list" id="dailyGrid">${dailyCards}</div>
        <div class="home-pagination" id="dailyPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공통 - 공유 리스트 사용)
  function generateSidebar() {
    const counts = {
      daily: dailyReportsCount,
      weekly: weeklyReportsCount,
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

    const renderList = (items) => items.map((item, i) => `
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
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
        </div>
      </div>
      ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
    `;
  }

  const content = `
    <section class="section active" id="daily-hub">
      ${topAds}
      <h1 class="visually-hidden">일간 리포트 - 매일 업데이트되는 게임 뉴스</h1>
      <div class="home-container">
        <div class="home-main">${generateDailyGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${generateSidebar()}</div></div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('dailyGrid');
      const pagination = document.getElementById('dailyPagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.category-list-card'));
      const pageSize = 15;
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

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '일간 리포트 - 매일 업데이트되는 게임 뉴스',
    description: '일간 리포트 목록 - 매일 업데이트되는 게임 뉴스.',
    canonical: `${siteBaseUrl}/magazine/daily/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '일간', url: `${siteBaseUrl}/magazine/daily/` }
    ]
  });
}

/**
 * 주간 목록 페이지 생성 (/magazine/weekly/)
 */
function generateWeeklyListPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  function generateWeeklyGrid() {
    if (weeklyReports.length === 0) return '<p>주간 리포트가 없습니다.</p>';

    const weeklyCards = weeklyReports.map(report => {
      const slug = `${report.year || report.startDate?.slice(0, 4) || new Date().getFullYear()}-W${String(report.weekNumber).padStart(2, '0')}`;
      const badge = report.startDate && report.endDate
        ? `${formatDateKr(report.startDate)} ~ ${parseInt(report.endDate.slice(5, 7))}월 ${parseInt(report.endDate.slice(8, 10))}일`
        : `${report.weekNumber}주차`;
      return `
        <a href="/magazine/weekly/${slug}/" class="category-list-card">
          <div class="category-list-thumb">
            ${report.thumbnail ? `<img src="${getLocalWeeklyThumbnail(slug, report.thumbnail)}" alt="${escapeHtmlAttr(report.headline)}" loading="lazy" data-img-fallback="hide">` : ''}
            <span class="category-list-badge">${badge}</span>
          </div>
          <div class="category-list-info">
            <h3 class="category-list-title">${report.headline || '주간'}</h3>
            ${report.summary ? `<p class="category-list-summary">${report.summary}</p>` : ''}
          </div>
        </a>
      `;
    }).join('');

    return `
      <div class="home-card" id="weekly-list">
        <div class="home-card-header">
          <h2 class="home-card-title">주간</h2>
        </div>
        <div class="category-list" id="weeklyGrid">${weeklyCards}</div>
        <div class="home-pagination" id="weeklyPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = {
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length, insight: insightReports.length, hotpick: hotpickReports.length, ranking: rankingReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };
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
    ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
  `;

  const content = `
    <section class="section active" id="weekly-hub">
      ${topAds}
      <h1 class="visually-hidden">주간 리포트 - 매주 업데이트되는 게임 트렌드</h1>
      <div class="home-container">
        <div class="home-main">${generateWeeklyGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('weeklyGrid');
      const pagination = document.getElementById('weeklyPagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.category-list-card'));
      const pageSize = 15;
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

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '주간 리포트 - 매주 업데이트되는 게임 트렌드',
    description: '주간 리포트 목록 - 매주 업데이트되는 게임 트렌드.',
    canonical: `${siteBaseUrl}/magazine/weekly/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '주간', url: `${siteBaseUrl}/magazine/weekly/` }
    ]
  });
}

/**
 * 이슈 목록 페이지 생성 (/magazine/issue/)
 */
function generateIssueListPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  function generateIssueGrid() {
    if (issueReports.length === 0) return '<p>리포트가 없습니다.</p>';

    const issueCards = issueReports.map(issue => {
      const thumbData = getLocalReportThumbnailSrcset('issue', issue.slug, issue.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="/magazine/issue/${issue.slug}/" class="category-list-card">
        <div class="category-list-thumb">
          ${issue.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(issue.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="category-list-badge">${issue.date ? formatDateKr(issue.date) : '이슈'}</span>
        </div>
        <div class="category-list-info">
          <h3 class="category-list-title">${issue.title}</h3>
          ${issue.summary ? `<p class="category-list-summary">${issue.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="issue-list">
        <div class="home-card-header">
          <h2 class="home-card-title">이슈</h2>
        </div>
        <div class="category-list" id="issueGrid">${issueCards}</div>
        <div class="home-pagination" id="issuePagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = {
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length, insight: insightReports.length, hotpick: hotpickReports.length, ranking: rankingReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };
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
    ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
  `;

  const content = `
    <section class="section active" id="issue-hub">
      ${topAds}
      <h1 class="visually-hidden">리포트 - 게임 업계 핫이슈</h1>
      <div class="home-container">
        <div class="home-main">${generateIssueGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('issueGrid');
      const pagination = document.getElementById('issuePagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.category-list-card'));
      const pageSize = 15;
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

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '리포트 - 게임 업계 핫이슈',
    description: '리포트 목록 - 게임 업계 핫이슈.',
    canonical: `${siteBaseUrl}/magazine/issue/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '이슈', url: `${siteBaseUrl}/magazine/issue/` }
    ]
  });
}

/**
 * 인사이트 목록 페이지 생성 (/magazine/insight/)
 */
function generateInsightListPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  function generateInsightGrid() {
    if (insightReports.length === 0) return '<p>인사이트 리포트가 없습니다.</p>';

    const insightCards = insightReports.map(insight => {
      const thumbData = getLocalReportThumbnailSrcset('insight', insight.slug, insight.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="/magazine/insight/${insight.slug}/" class="category-list-card">
        <div class="category-list-thumb">
          ${insight.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(insight.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="category-list-badge">${insight.date ? formatDateKr(insight.date) : '인사이트'}</span>
        </div>
        <div class="category-list-info">
          <h3 class="category-list-title">${insight.title}</h3>
          ${insight.summary ? `<p class="category-list-summary">${insight.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="insight-list">
        <div class="home-card-header">
          <h2 class="home-card-title">인사이트</h2>
        </div>
        <div class="category-list" id="insightGrid">${insightCards}</div>
        <div class="home-pagination" id="insightPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = {
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length, insight: insightReports.length, hotpick: hotpickReports.length, ranking: rankingReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };
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
    ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
  `;

  const content = `
    <section class="section active" id="insight-hub">
      ${topAds}
      <h1 class="visually-hidden">인사이트 - 게임 시장 트렌드와 분석</h1>
      <div class="home-container">
        <div class="home-main">${generateInsightGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('insightGrid');
      const pagination = document.getElementById('insightPagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.category-list-card'));
      const pageSize = 15;
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
          const tabName = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(list => {
            list.classList.toggle('active', list.id === 'sidebar-' + tabName);
          });
        });
      }
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '인사이트 - 게임 시장 트렌드와 분석',
    description: '인사이트 리포트 목록 - 게임 시장 트렌드와 분석.',
    canonical: `${siteBaseUrl}/magazine/insight/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '인사이트', url: `${siteBaseUrl}/magazine/insight/` }
    ]
  });
}

function generateHotpickListPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  function generateHotpickGrid() {
    if (hotpickReports.length === 0) return '<p>핫픽 리포트가 없습니다.</p>';

    const hotpickCards = hotpickReports.map(hotpick => {
      const thumbData = getLocalReportThumbnailSrcset('hotpick', hotpick.slug, hotpick.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="/magazine/hotpick/${hotpick.slug}/" class="category-list-card">
        <div class="category-list-thumb">
          ${hotpick.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(hotpick.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="category-list-badge">${hotpick.date ? formatDateKr(hotpick.date) : '핫픽'}</span>
        </div>
        <div class="category-list-info">
          <h3 class="category-list-title">${hotpick.title}</h3>
          ${hotpick.summary ? `<p class="category-list-summary">${hotpick.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="hotpick-list">
        <div class="home-card-header">
          <h2 class="home-card-title">핫픽</h2>
        </div>
        <div class="category-list" id="hotpickGrid">${hotpickCards}</div>
        <div class="home-pagination" id="hotpickPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = {
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length, insight: insightReports.length, hotpick: hotpickReports.length, ranking: rankingReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };
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
    ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
  `;

  const content = `
    <section class="section active" id="hotpick-hub">
      ${topAds}
      <h1 class="visually-hidden">핫픽 - 지금 주목할 게임 추천</h1>
      <div class="home-container">
        <div class="home-main">${generateHotpickGrid()}</div>
        <div class="home-sidebar"><div class="home-sidebar-sticky">${sidebar}</div></div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('hotpickGrid');
      const pagination = document.getElementById('hotpickPagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.category-list-card'));
      const pageSize = 15;
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
          const tabName = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(list => {
            list.classList.toggle('active', list.id === 'sidebar-' + tabName);
          });
        });
      }
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '핫픽 - 지금 주목할 게임 추천',
    description: '핫픽 리포트 목록 - 지금 구매할 만한 게임 추천과 가이드.',
    canonical: `${siteBaseUrl}/magazine/hotpick/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '핫픽', url: `${siteBaseUrl}/magazine/hotpick/` }
    ]
  });
}

/**
 * 순위 분석 목록 페이지 생성
 */
function generateRankingListPage({
  dailyReports = [],
  weeklyReports = [],
  issueReports = [],
  insightReports = [],
  hotpickReports = [],
  rankingReports = [],
  wikiData = {},
  techData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  function generateRankingGrid() {
    if (rankingReports.length === 0) return '<p>순위 분석 리포트가 없습니다.</p>';

    const rankingCards = rankingReports.map(ranking => {
      const thumbData = getLocalReportThumbnailSrcset('ranking', ranking.slug, ranking.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
      <a href="/magazine/ranking/${ranking.slug}/" class="category-list-card">
        <div class="category-list-thumb">
          ${ranking.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(ranking.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="category-list-badge">${ranking.date ? formatDateKr(ranking.date) : '순위 분석'}</span>
        </div>
        <div class="category-list-info">
          <h3 class="category-list-title">${ranking.title}</h3>
          ${ranking.summary ? `<p class="category-list-summary">${ranking.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="ranking-list">
        <div class="home-card-header">
          <h2 class="home-card-title">순위 분석</h2>
        </div>
        <div class="category-list" id="rankingGrid">${rankingCards}</div>
        <div class="home-pagination" id="rankingPagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바 (공유 리스트 사용)
  const counts = {
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length, insight: insightReports.length, hotpick: hotpickReports.length, ranking: rankingReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };
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

  const renderList = (items) => items.map((item, i) => `
    <a href="${item.link || item.path || '#'}" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${item.title}</span>
    </a>
  `).join('');

  const content = `
    <section class="section active" id="ranking-list-page">
      ${topAds}
      <h1 class="visually-hidden">순위 분석 - 게임 순위 심층 분석</h1>

      <div class="home-container">
        <div class="home-main">
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
            ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    (function() {
      const grid = document.getElementById('rankingGrid');
      const pagination = document.getElementById('rankingPagination');
      if (!grid || !pagination) return;

      const items = Array.from(grid.querySelectorAll('.category-list-card'));
      const pageSize = 15;
      let currentPage = 0;
      const totalPages = Math.ceil(items.length / pageSize);

      function showPage(page) {
        items.forEach((item, i) => {
          item.style.display = (i >= page * pageSize && i < (page + 1) * pageSize) ? '' : 'none';
        });
        pagination.querySelector('.home-page-index').textContent = (page + 1) + '/' + totalPages;
      }

      pagination.querySelector('.home-prev').addEventListener('click', () => {
        if (currentPage > 0) { currentPage--; showPage(currentPage); }
      });
      pagination.querySelector('.home-next').addEventListener('click', () => {
        if (currentPage < totalPages - 1) { currentPage++; showPage(currentPage); }
      });

      function updatePagination() {
        pagination.style.display = totalPages > 1 ? '' : 'none';
      }

      showPage(0);
      updatePagination();

      // 사이드바 인기/최신 탭 토글
      const sidebarTab = document.getElementById('sidebarArticleTab');
      if (sidebarTab) {
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tabName = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(list => {
            list.classList.toggle('active', list.id === 'sidebar-' + tabName);
          });
        });
      }
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'magazine',
    title: '순위 분석 - 게임 순위 심층 분석',
    description: '순위 분석 리포트 목록 - 게임 순위 비교와 심층 분석.',
    canonical: `${siteBaseUrl}/magazine/ranking/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '순위 분석', url: `${siteBaseUrl}/magazine/ranking/` }
    ]
  });
}

module.exports = { generateTrendsHubPage, generateDailyListPage, generateWeeklyListPage, generateIssueListPage, generateInsightListPage, generateHotpickListPage, generateRankingListPage };
