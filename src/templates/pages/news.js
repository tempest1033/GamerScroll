/**
 * 주요 뉴스 페이지 템플릿
 */

const {
  wrapWithLayout,
  AD_SLOTS,
  generateAdPairSlot,
  generateNativeAdSlot,
  generateMobileTopAdSlot
} = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// URL 수정 헬퍼 (이미지 프록시, width: 용도별 크기)
const fixUrl = (url, width = 480) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  // CORS 허용된 도메인은 직접 로드
  const corsAllowed = ['steamstatic.com', 'googleusercontent.com', 'gamerscroll.com'];
  if (corsAllowed.some(d => url.includes(d))) return url;
  // 나머지 외부 이미지는 프록시
  if (url.startsWith('http')) return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=' + width + '&output=webp';
  return url;
};

function generateNewsPage(data) {
  const { news } = data;
  const { insight, weeklyInsight } = data;
  const aiInsight = insight?.ai || null;
  const wai = weeklyInsight?.ai || null;
  const dailyThumbnail = fixUrl(aiInsight?.thumbnail) || '';
  const weeklyThumbnail = fixUrl(wai?.thumbnail) || '';

  // PC + 모바일 광고 슬롯
  const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);

  // 뉴스 소스 정보
  const newsSources = [
    { key: 'thisisgame', name: '디스이즈게임', domain: 'thisisgame.com', url: 'https://www.thisisgame.com/webzine/news/nboard/4/' },
    { key: 'gamemeca', name: '게임메카', domain: 'gamemeca.com', url: 'https://www.gamemeca.com/news.php' },
    { key: 'ruliweb', name: '루리웹', domain: 'ruliweb.com', url: 'https://bbs.ruliweb.com/news' },
    { key: 'inven', name: '인벤', domain: 'inven.co.kr', url: 'https://www.inven.co.kr/webzine/news/' }
  ];

  // 뉴스 섹션 생성 (좌우 2열, 각 열에 카드 2개 좌우 + 리스트 3개)
  function generateNewsSection(source) {
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

    // 컬럼 생성 함수 (카드 2개 좌우 + 리스트 3개)
    function generateColumn(columnItems) {
      const cards = columnItems.slice(0, 2);
      const listItems = columnItems.slice(2, 5);

      const cardsHTML = cards.map((item, i) => `
        <a class="news-grid-card" href="${item.link}" target="_blank" rel="noopener" data-index="${item.originalIndex}">
          <div class="news-grid-card-thumb">
            ${item.thumbnail ? `<img src="${fixUrl(item.thumbnail)}" alt="" loading="lazy" decoding="async" data-img-fallback="hide">` : ''}
            <div class="news-thumb-fallback"><img src="/favicon.svg" alt="" width="48" height="48"></div>
          </div>
          <div class="news-grid-card-title">${item.title}</div>
        </a>
      `).join('');

      const listHTML = listItems.map((item, i) => `
        <a class="news-grid-item" href="${item.link}" target="_blank" rel="noopener" data-index="${item.originalIndex}">
          <span class="news-grid-item-title">${item.title}</span>
        </a>
      `).join('');

      return `
        <div class="news-column">
          <div class="news-cards-row">${cardsHTML}</div>
          <div class="news-list-col">${listHTML}</div>
        </div>
      `;
    }

    // 전체 아이템에 원본 인덱스 추가
    const indexedItems = items.map((item, i) => ({ ...item, originalIndex: i }));

    // 모든 컬럼 HTML 생성 (10개씩 2열)
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
  }

  // 통합 반응형 빌드: PC 구조 사용 (CSS로 반응형 처리)
  const content = `
    <section class="section active" id="news">

      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">게임 뉴스</h1>
        <div class="news-sources-grid">
          ${newsSources.map(source => generateNewsSection(source)).join('')}
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 각 뉴스 섹션별 페이지네이션 (컬럼 1개씩)
    (function() {
      const sections = Array.from(document.querySelectorAll('.news-section-card'));
      if (!sections.length) return;

      const stateMap = new Map();

      function updatePagination(state) {
        state.columns.forEach((col, i) => {
          col.style.display = (i === state.currentPage) ? '' : 'none';
        });

        state.pageIndex.textContent = (state.currentPage + 1) + '/' + state.totalPages;
        state.prevBtn.disabled = state.currentPage <= 0;
        state.nextBtn.disabled = state.currentPage >= state.totalPages - 1;
      }

      sections.forEach(section => {
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

        stateMap.set(section, state);
        updatePagination(state);
      });

      document.addEventListener('click', (event) => {
        const btn = event.target.closest('.news-prev, .news-next');
        if (!btn || btn.disabled) return;

        const section = btn.closest('.news-section-card');
        const state = stateMap.get(section);
        if (!state) return;

        if (btn.classList.contains('news-prev')) {
          if (state.currentPage > 0) state.currentPage--;
        } else {
          if (state.currentPage < state.totalPages - 1) state.currentPage++;
        }

        updatePagination(state);
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'news',
    title: '게임 뉴스',
    description: '게임 뉴스를 한눈에.',
    keywords: '게임 뉴스, 게임 소식',
    canonical: `${siteBaseUrl}/news/`,
    pageScripts,
    preloadImages: [],
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 뉴스', url: `${siteBaseUrl}/news/` }
    ]
  });
}

module.exports = { generateNewsPage };
