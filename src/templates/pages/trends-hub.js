/**
 * 트렌드 리포트 허브 페이지 (목록)
 * - 피드 카드 스타일 (썸네일 + 제목)
 * - 주간/일간 섹션 분리 (탭 없음)
 * - 각 섹션별 페이지네이션
 * - 뉴스 섹션 통합 (4개 소스)
 */

const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateMidAdPairSlot, generateNativeAdSlot } = require('../layout');

// 모바일 빌드 여부
const isMobileBuild = process.env.MOBILE_BUILD === 'true';
const siteBaseUrl = isMobileBuild ? 'https://m.gamerscroll.com' : 'https://gamerscroll.com';

// PC + 모바일 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);
const nativeAd1 = generateNativeAdSlot(AD_SLOTS.Article001);
const midAds = generateMidAdPairSlot(AD_SLOTS.ResponsivePC002, AD_SLOTS.Mobile002);

// 뉴스 소스 정보
const newsSources = [
  { key: 'thisisgame', name: '디스이즈게임', url: 'https://www.thisisgame.com/webzine/news/nboard/4/' },
  { key: 'gamemeca', name: '게임메카', url: 'https://www.gamemeca.com/news.php' },
  { key: 'ruliweb', name: '루리웹', url: 'https://bbs.ruliweb.com/news' },
  { key: 'inven', name: '인벤', url: 'https://www.inven.co.kr/webzine/news/' }
];

// URL 수정 헬퍼 (이미지 프록시)
const fixUrl = (url) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.includes('inven.co.kr') || url.includes('nateimg.co.kr')) {
    const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url);
    if (/\.avif(?:$|[?#])/i.test(url)) return proxyUrl + '&output=webp';
    return proxyUrl;
  }
  return url;
};

// 날짜 포맷 헬퍼 (2026-01-01 → 2026년 1월 1일)
const formatDateKr = (dateStr) => {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
};

/**
 * 트렌드 허브 페이지 생성
 * @param {Object} params
 * @param {Array} params.dailyReports - 일간 리포트 목록 [{date, headline, summary, thumbnail}]
 * @param {Array} params.weeklyReports - 주간 리포트 목록 [{weekNumber, startDate, endDate, headline, summary, thumbnail}]
 * @param {Array} params.issueReports - 이슈 리포트 목록 [{slug, title, date, thumbnail, summary}]
 * @param {Object} params.news - 뉴스 데이터 {thisisgame: [], gamemeca: [], ruliweb: [], inven: []}
 */
function generateTrendsHubPage({ dailyReports = [], weeklyReports = [], issueReports = [], news = {} }) {
  // 일간 리포트 카드 렌더링 (피드 카드 스타일)
  const renderDailyCard = (report) => {
    const slug = report.date;
    const title = report.headline || '일간 리포트';
    const thumbnail = fixUrl(report.thumbnail) || '';
    const badgeText = report.date ? `${formatDateKr(report.date)} 리포트` : '일간 리포트';

    return `
      <a href="/trend/daily/${slug}/" class="trend-feed-card" data-type="daily">
        <div class="trend-feed-card-image">
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="trend-feed-card-tag">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title"><span class="trend-feed-card-title-text">${title}</span></h3>
      </a>
    `;
  };

  // 주간 리포트 카드 렌더링 (피드 카드 스타일)
  const renderWeeklyCard = (report) => {
    const slug = `${report.year || report.startDate?.slice(0, 4) || new Date().getFullYear()}-W${String(report.weekNumber).padStart(2, '0')}`;
    const title = report.headline || '주간 리포트';
    const thumbnail = fixUrl(report.thumbnail) || '';
    const badgeText = report.startDate && report.endDate
      ? `${formatDateKr(report.startDate)} ~ ${parseInt(report.endDate.slice(5, 7))}월 ${parseInt(report.endDate.slice(8, 10))}일`
      : `${report.weekNumber}주차`;

    return `
      <a href="/trend/weekly/${slug}/" class="trend-feed-card trend-feed-card-weekly" data-type="weekly">
        <div class="trend-feed-card-image">
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="trend-feed-card-tag weekly">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title"><span class="trend-feed-card-title-text">${title}</span></h3>
      </a>
    `;
  };

  // 이슈 리포트 카드 렌더링
  const renderIssueCard = (post) => {
    const thumbnail = fixUrl(post.thumbnail) || '';
    const badgeText = post.date ? formatDateKr(post.date) : '이슈 리포트';

    return `
      <a href="/trend/issue/${post.slug}/" class="trend-feed-card trend-feed-card-issue" data-type="issue">
        <div class="trend-feed-card-image">
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="trend-feed-card-tag issue">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title"><span class="trend-feed-card-title-text">${post.title}</span></h3>
      </a>
    `;
  };

  // 카드 HTML
  const renderDailyCards = () => dailyReports.map(r => renderDailyCard(r)).join('');
  const renderWeeklyCards = () => weeklyReports.map(r => renderWeeklyCard(r)).join('');
  const renderIssueCards = () => issueReports.map(p => renderIssueCard(p)).join('');

  // 뉴스 섹션 생성 (좌우 2열, 각 열에 카드 2개 + 리스트 3개)
  const generateNewsSection = (source) => {
    const items = news?.[source.key] || [];
    if (items.length === 0) {
      return `
        <div class="home-card news-section-card" data-section="${source.key}">
          <div class="home-card-header">
            <h2 class="home-card-title">${source.name}</h2>
          </div>
          <div class="home-card-body">
            <div class="news-empty">뉴스를 불러올 수 없습니다</div>
          </div>
        </div>
      `;
    }

    // 컬럼 생성 함수 (카드 2개 + 리스트 3개)
    const generateColumn = (columnItems) => {
      const cards = columnItems.slice(0, 2);
      const listItems = columnItems.slice(2, 5);

      const cardsHTML = cards.map((item) => `
        <a class="news-grid-card" href="${item.link}" target="_blank" rel="noopener">
          <div class="news-grid-card-thumb">
            ${item.thumbnail ? `<img src="${fixUrl(item.thumbnail)}" alt="" loading="lazy" decoding="async" data-img-fallback="hide">` : ''}
            <div class="news-thumb-fallback"><img src="/favicon.svg" alt="" width="48" height="48"></div>
          </div>
          <div class="news-grid-card-title">${item.title}</div>
        </a>
      `).join('');

      const listHTML = listItems.map((item) => `
        <a class="news-grid-item" href="${item.link}" target="_blank" rel="noopener">
          <span class="news-grid-item-title">${item.title}</span>
        </a>
      `).join('');

      return `
        <div class="news-column">
          <div class="news-cards-row">${cardsHTML}</div>
          <div class="news-list-col">${listHTML}</div>
        </div>
      `;
    };

    // 전체 아이템 인덱싱
    const indexedItems = items.map((item, i) => ({ ...item, originalIndex: i }));

    // 모든 컬럼 HTML 생성 (5개씩 1열)
    const allColumnsHTML = [];
    for (let i = 0; i < indexedItems.length; i += 5) {
      const columnItems = indexedItems.slice(i, i + 5);
      if (columnItems.length > 0) {
        allColumnsHTML.push(generateColumn(columnItems));
      }
    }

    return `
      <div class="home-card news-section-card" data-section="${source.key}">
        <div class="home-card-header">
          <h2 class="home-card-title">${source.name}</h2>
          <div class="gm-pagination">
            <button class="gm-page-btn news-prev" aria-label="이전">‹</button>
            <span class="gm-page-index">1/1</span>
            <button class="gm-page-btn news-next" aria-label="다음">›</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="news-grid-container">
            ${allColumnsHTML.join('')}
          </div>
        </div>
      </div>
    `;
  };

  const content = `
    <section class="section active" id="trends-hub">
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">게임 트렌드 리포트 - 게임 업계 이슈, 게임 순위, 게임 뉴스</h1>

        <!-- 이슈 리포트 섹션 -->
        ${issueReports.length > 0 ? `
        <div class="home-card home-card-full trend-section" data-section="issue">
          <div class="home-card-header">
            <h2 class="home-card-title">이슈 리포트</h2>
            <div class="trend-pagination">
              <button class="trend-page-btn trend-prev" aria-label="이전">‹</button>
              <span class="trend-page-index">1/1</span>
              <button class="trend-page-btn trend-next" aria-label="다음">›</button>
            </div>
          </div>
          <div class="home-card-body">
            <div class="trend-feed-grid">
              ${renderIssueCards()}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- 일간 리포트 -->
        ${dailyReports.length > 0 ? `
        <div class="home-card home-card-full trend-section" data-section="daily">
          <div class="home-card-header">
            <h2 class="home-card-title">일간 리포트</h2>
            <div class="trend-pagination">
              <button class="trend-page-btn trend-prev" aria-label="이전">‹</button>
              <span class="trend-page-index">1/1</span>
              <button class="trend-page-btn trend-next" aria-label="다음">›</button>
            </div>
          </div>
          <div class="home-card-body">
            <div class="trend-feed-grid">
              ${renderDailyCards()}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- 주간 리포트 -->
        ${weeklyReports.length > 0 ? `
        <div class="home-card home-card-full trend-section" data-section="weekly">
          <div class="home-card-header">
            <h2 class="home-card-title">주간 리포트</h2>
            <div class="trend-pagination">
              <button class="trend-page-btn trend-prev" aria-label="이전">‹</button>
              <span class="trend-page-index">1/1</span>
              <button class="trend-page-btn trend-next" aria-label="다음">›</button>
            </div>
          </div>
          <div class="home-card-body">
            <div class="trend-feed-grid">
              ${renderWeeklyCards()}
            </div>
          </div>
        </div>
        ` : ''}

        ${nativeAd1}

        <!-- 뉴스 섹션 1 (디스이즈게임, 게임메카) -->
        <div class="news-sources-grid">
          ${newsSources.slice(0, 2).map(source => generateNewsSection(source)).join('')}
        </div>

        ${isMobileBuild ? midAds : ''}

        <!-- 뉴스 섹션 2 (루리웹, 인벤) -->
        <div class="news-sources-grid">
          ${newsSources.slice(2, 4).map(source => generateNewsSection(source)).join('')}
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 각 섹션별 페이지네이션
    (function() {
      // PC: 4개, 모바일: 1개
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const getPageSize = (sectionType) => {
        // 이슈 리포트는 PC/모바일 모두 4개
        if (sectionType === 'issue') return 4;
        // 일간/주간 리포트: PC 4개, 모바일 1개
        return isMobile ? 1 : 4;
      };

      const trendStateMap = new Map();
      const newsStateMap = new Map();

      function updateTrendPagination(state) {
        const start = state.currentPage * state.pageSize;
        const end = start + state.pageSize;

        state.items.forEach((item, i) => {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });

        state.pageIndex.textContent = (state.currentPage + 1) + '/' + state.totalPages;
        state.prevBtn.disabled = state.currentPage <= 0;
        state.nextBtn.disabled = state.currentPage >= state.totalPages - 1;
      }

      function updateNewsPagination(state) {
        state.columns.forEach((col, i) => {
          col.style.display = (i === state.currentPage) ? '' : 'none';
        });

        state.pageIndex.textContent = (state.currentPage + 1) + '/' + state.totalPages;
        state.prevBtn.disabled = state.currentPage <= 0;
        state.nextBtn.disabled = state.currentPage >= state.totalPages - 1;
      }

      document.querySelectorAll('.trend-section').forEach(section => {
        const sectionType = section.dataset.section;
        const prevBtn = section.querySelector('.trend-prev');
        const nextBtn = section.querySelector('.trend-next');
        const pageIndex = section.querySelector('.trend-page-index');
        const items = Array.from(section.querySelectorAll('.trend-feed-card'));

        if (!items.length || !prevBtn || !nextBtn || !pageIndex) return;

        const pageSize = getPageSize(sectionType);
        const totalPages = Math.ceil(items.length / pageSize) || 1;

        const state = {
          section,
          prevBtn,
          nextBtn,
          pageIndex,
          items,
          pageSize,
          totalPages,
          currentPage: 0
        };

        trendStateMap.set(section, state);
        updateTrendPagination(state);
      });

      // 뉴스 섹션별 페이지네이션 (컬럼 1개씩)
      document.querySelectorAll('.news-section-card').forEach(section => {
        const prevBtn = section.querySelector('.news-prev');
        const nextBtn = section.querySelector('.news-next');
        const pageIndex = section.querySelector('.gm-page-index');
        const columns = Array.from(section.querySelectorAll('.news-column'));

        if (!columns.length || !prevBtn || !nextBtn || !pageIndex) return;

        const state = {
          section,
          prevBtn,
          nextBtn,
          pageIndex,
          columns,
          currentPage: 0,
          totalPages: columns.length
        };

        newsStateMap.set(section, state);
        updateNewsPagination(state);
      });

      document.addEventListener('click', (event) => {
        const trendBtn = event.target.closest('.trend-prev, .trend-next');
        if (trendBtn) {
          if (trendBtn.disabled) return;
          const section = trendBtn.closest('.trend-section');
          const state = trendStateMap.get(section);
          if (!state) return;

          if (trendBtn.classList.contains('trend-prev')) {
            if (state.currentPage > 0) state.currentPage--;
          } else {
            if (state.currentPage < state.totalPages - 1) state.currentPage++;
          }

          updateTrendPagination(state);
          return;
        }

        const newsBtn = event.target.closest('.news-prev, .news-next');
        if (!newsBtn || newsBtn.disabled) return;

        const section = newsBtn.closest('.news-section-card');
        const state = newsStateMap.get(section);
        if (!state) return;

        if (newsBtn.classList.contains('news-prev')) {
          if (state.currentPage > 0) state.currentPage--;
        } else {
          if (state.currentPage < state.totalPages - 1) state.currentPage++;
        }

        updateNewsPagination(state);
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: '게임 트렌드 리포트 - 게임 업계 이슈, 게임 순위, 게임 뉴스',
    description: '게임 트렌드 리포트 - 게임 업계 이슈, 게임 순위, 게임 뉴스를 한눈에.',
    keywords: '게임 트렌드, 게임 리포트, 게임 업계 이슈, 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위',
    canonical: `${siteBaseUrl}/trend/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '트렌드 리포트', url: `${siteBaseUrl}/trend/` }
    ]
  });
}

module.exports = { generateTrendsHubPage };
