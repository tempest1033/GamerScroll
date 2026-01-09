/**
 * 주요 뉴스 페이지 템플릿
 */

const { wrapWithLayout, AD_SLOTS, generateAdSlot } = require('../layout');

function generateNewsPage(data) {
  const { news } = data;

  // 광고 슬롯 (모바일/PC 분리)
  const topAdsMobile = generateAdSlot(AD_SLOTS.Responsive001, { type: 'mobile-top', visibility: 'mobile-only' });
  const topAdsPC = generateAdSlot(AD_SLOTS.ResponsivePC001, { type: 'pc-top', visibility: 'pc-only' });
  const topAds = topAdsMobile + topAdsPC;

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
            ${item.thumbnail ? `<img src="${item.thumbnail}" alt="" loading="lazy" decoding="async" data-img-fallback="hide">` : ''}
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
      document.querySelectorAll('.news-section-card').forEach(section => {
        const prevBtn = section.querySelector('.news-prev');
        const nextBtn = section.querySelector('.news-next');
        const pageIndex = section.querySelector('.gm-page-index');
        const columns = section.querySelectorAll('.news-column');

        if (!columns.length) return;

        let currentPage = 0;
        const totalPages = columns.length;

        function updatePagination() {
          columns.forEach((col, i) => {
            col.style.display = (i === currentPage) ? '' : 'none';
          });

          pageIndex.textContent = (currentPage + 1) + '/' + totalPages;
          prevBtn.disabled = currentPage <= 0;
          nextBtn.disabled = currentPage >= totalPages - 1;
        }

        prevBtn.addEventListener('click', () => {
          if (currentPage > 0) {
            currentPage--;
            updatePagination();
          }
        });

        nextBtn.addEventListener('click', () => {
          if (currentPage < totalPages - 1) {
            currentPage++;
            updatePagination();
          }
        });

        updatePagination();
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'news',
    title: '게임 뉴스',
    description: '게임 뉴스를 한눈에.',
    keywords: '게임 뉴스, 게임 소식',
    canonical: 'https://gamerscrawl.com/news/',
    pageScripts
  });
}

module.exports = { generateNewsPage };
