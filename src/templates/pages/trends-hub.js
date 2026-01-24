/**
 * 매거진 허브 페이지
 * - 홈과 동일한 2컬럼 레이아웃
 * - 메인: 정기(일간/주간) + 이슈 15개 그리드
 * - 사이드바: 매거진/위키 메뉴 + 인기/최신글
 */

const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateVerticalAdSlot } = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);

// URL 수정 헬퍼 (이미지 프록시)
const fixUrl = (url) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  // 모든 외부 이미지 프록시
  if (url.startsWith('http')) {
    const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url);
    if (/\.avif(?:$|[?#])/i.test(url)) return proxyUrl + '&output=webp';
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
  wikiData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  const categoryNames = { history: '히스토리', knowledge: '지식', tech: '기술', business: '비즈니스' };

  // 정기 카드 (일간/주간) - 홈과 동일
  function generateInsightCards() {
    const dailyReport = dailyReports[0];
    const weeklyReport = weeklyReports[0];

    if (!dailyReport && !weeklyReport) return '';

    const dailyCard = dailyReport ? `
      <a href="/magazine/daily/${dailyReport.date}/" class="home-trend-card">
        <div class="home-trend-card-image">
          ${dailyReport.thumbnail ? `<img src="${fixUrl(dailyReport.thumbnail)}" alt="${escapeHtmlAttr(dailyReport.headline)}" loading="eager">` : ''}
          <span class="home-trend-card-tag">${formatDateKr(dailyReport.date)} 일간</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${dailyReport.headline || '일간'}</span></h3>
      </a>
    ` : '';

    const weeklySlug = weeklyReport ? `${weeklyReport.year || weeklyReport.startDate?.slice(0, 4) || new Date().getFullYear()}-W${String(weeklyReport.weekNumber).padStart(2, '0')}` : '';
    const weeklyBadge = weeklyReport?.startDate && weeklyReport?.endDate
      ? `${formatDateKr(weeklyReport.startDate)} ~ ${parseInt(weeklyReport.endDate.slice(5, 7))}월 ${parseInt(weeklyReport.endDate.slice(8, 10))}일`
      : '주간';
    const weeklyCard = weeklyReport ? `
      <a href="/magazine/weekly/${weeklySlug}/" class="home-trend-card">
        <div class="home-trend-card-image">
          ${weeklyReport.thumbnail ? `<img src="${fixUrl(weeklyReport.thumbnail)}" alt="${escapeHtmlAttr(weeklyReport.headline)}" loading="eager">` : ''}
          <span class="home-trend-card-tag weekly">${weeklyBadge}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${weeklyReport.headline || '주간'}</span></h3>
      </a>
    ` : '';

    return `
      <div class="home-card" id="magazine-insight">
        <div class="home-card-header">
          <h2 class="home-card-title">정기</h2>
        </div>
        <div class="home-card-body">
          <div class="home-trend-grid">${dailyCard}${weeklyCard}</div>
        </div>
      </div>
    `;
  }

  // 이슈 그리드 (15개, 페이지네이션) - 허브용 3열 그리드
  function generateIssueGrid() {
    if (issueReports.length === 0) return '';

    const issueCards = issueReports.map(issue => `
      <a href="/magazine/issue/${issue.slug}/" class="home-trend-card">
        <div class="home-trend-card-image">
          ${issue.thumbnail ? `<img src="${fixUrl(issue.thumbnail)}" alt="${escapeHtmlAttr(issue.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag issue">${issue.date ? formatDateKr(issue.date) : '이슈'}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${issue.title}</span></h3>
      </a>
    `).join('');

    return `
      <div class="home-card" id="magazine-issue">
        <div class="home-card-header">
          <h2 class="home-card-title">이슈</h2>
        </div>
        <div class="home-latest-grid" id="issueGrid">
          ${issueCards}
        </div>
        <div class="home-pagination" id="issuePagination">
          <button class="home-page-btn home-prev" aria-label="이전">‹</button>
          <span class="home-page-index">1/1</span>
          <button class="home-page-btn home-next" aria-label="다음">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바: 매거진/위키 메뉴
  function generateSidebarCategories() {
    const counts = {
      daily: dailyReportsCount,
      weekly: weeklyReportsCount,
      issue: issueReports.length,
      history: (wikiData.history || []).length,
      knowledge: (wikiData.knowledge || []).length,
      tech: (wikiData.tech || []).length,
      business: (wikiData.business || []).length
    };

    const regularCategories = [
      { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
      { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly }
    ];

    const issueCategories = [
      { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue }
    ];

    const wikiCategories = [
      { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
      { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
      { id: 'tech', name: '기술', link: '/wiki/tech/', count: counts.tech },
      { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
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
          <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">이슈 리포트</h2></a></div>
          <div class="sidebar-category-list">${renderItems(issueCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
          <div class="sidebar-category-list">${renderItems(wikiCategories)}</div>
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
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
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
          ${generateInsightCards()}
          ${generateIssueGrid()}
        </div>
        <div class="home-sidebar">
          ${generateSidebarCategories()}
          ${generateSidebarArticles()}
          ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 이슈 그리드 페이지네이션 (15개씩)
    (function() {
      const grid = document.getElementById('issueGrid');
      const pagination = document.getElementById('issuePagination');
      if (!grid || !pagination) return;

      const items = Array.from(grid.querySelectorAll('.home-trend-card'));
      const pageSize = 15;
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
  wikiData = {},
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
          ${report.thumbnail ? `<img src="${fixUrl(report.thumbnail)}" alt="${escapeHtmlAttr(report.headline)}" loading="lazy" data-img-fallback="hide">` : ''}
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
      history: (wikiData.history || []).length,
      knowledge: (wikiData.knowledge || []).length,
      tech: (wikiData.tech || []).length,
      business: (wikiData.business || []).length
    };

    const regularCategories = [
      { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
      { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly }
    ];

    const issueCategories = [
      { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue }
    ];

    const wikiCategories = [
      { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
      { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
      { id: 'tech', name: '기술', link: '/wiki/tech/', count: counts.tech },
      { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
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
          <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">이슈 리포트</h2></a></div>
          <div class="sidebar-category-list">${renderItems(issueCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
          <div class="sidebar-category-list">${renderItems(wikiCategories)}</div>
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
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
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
        <div class="home-sidebar">${generateSidebar()}</div>
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
  wikiData = {},
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
            ${report.thumbnail ? `<img src="${fixUrl(report.thumbnail)}" alt="${escapeHtmlAttr(report.headline)}" loading="lazy" data-img-fallback="hide">` : ''}
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
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    tech: (wikiData.tech || []).length, business: (wikiData.business || []).length
  };
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
    { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'tech', name: '기술', link: '/wiki/tech/', count: counts.tech },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
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
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">이슈 리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
        <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
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
        <div class="home-sidebar">${sidebar}</div>
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
  wikiData = {},
  dailyReportsCount = 0,
  weeklyReportsCount = 0,
  sidebarPopularArticles = [],
  sidebarLatestArticles = []
}) {
  function generateIssueGrid() {
    if (issueReports.length === 0) return '<p>이슈 리포트가 없습니다.</p>';

    const issueCards = issueReports.map(issue => `
      <a href="/magazine/issue/${issue.slug}/" class="category-list-card">
        <div class="category-list-thumb">
          ${issue.thumbnail ? `<img src="${fixUrl(issue.thumbnail)}" alt="${escapeHtmlAttr(issue.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="category-list-badge">${issue.date ? formatDateKr(issue.date) : '이슈'}</span>
        </div>
        <div class="category-list-info">
          <h3 class="category-list-title">${issue.title}</h3>
          ${issue.summary ? `<p class="category-list-summary">${issue.summary}</p>` : ''}
        </div>
      </a>
    `).join('');

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
    daily: dailyReportsCount, weekly: weeklyReportsCount, issue: issueReports.length,
    history: (wikiData.history || []).length, knowledge: (wikiData.knowledge || []).length,
    tech: (wikiData.tech || []).length, business: (wikiData.business || []).length
  };
  const regularCategories = [
    { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
    { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly }
  ];
  const issueCategories = [
    { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue }
  ];
  const wikiCategories = [
    { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
    { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
    { id: 'tech', name: '기술', link: '/wiki/tech/', count: counts.tech },
    { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
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
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">이슈 리포트</h2></a></div><div class="sidebar-category-list">${renderItems(issueCategories)}</div></div>
      <div class="sidebar-category-group"><div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div><div class="sidebar-category-list">${renderItems(wikiCategories)}</div></div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
        <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
      </div>
    </div>
    ${generateVerticalAdSlot(AD_SLOTS.PCHome002)}
  `;

  const content = `
    <section class="section active" id="issue-hub">
      ${topAds}
      <h1 class="visually-hidden">이슈 리포트 - 게임 업계 핫이슈</h1>
      <div class="home-container">
        <div class="home-main">${generateIssueGrid()}</div>
        <div class="home-sidebar">${sidebar}</div>
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
    title: '이슈 리포트 - 게임 업계 핫이슈',
    description: '이슈 리포트 목록 - 게임 업계 핫이슈.',
    canonical: `${siteBaseUrl}/magazine/issue/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: '이슈', url: `${siteBaseUrl}/magazine/issue/` }
    ]
  });
}

module.exports = { generateTrendsHubPage, generateDailyListPage, generateWeeklyListPage, generateIssueListPage };
