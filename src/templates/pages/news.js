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

// 모바일 빌드 여부
const isMobileBuild = process.env.MOBILE_BUILD === 'true';

// URL 수정 헬퍼 (이미지 프록시)
const fixUrl = (url) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  // CORS 허용된 도메인은 직접 로드
  const corsAllowed = ['steamstatic.com', 'googleusercontent.com', 'gamerscrawl.com'];
  if (corsAllowed.some(d => url.includes(d))) return url;
  // 나머지 외부 이미지는 프록시
  if (url.startsWith('http')) return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
  return url;
};

function generateNewsPage(data) {
  const { news } = data;

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

  let content;

  if (isMobileBuild) {
    // 모바일 전용: 일간/주간 리포트 + 인피드 + 뉴스4개 + 리스폰스
    const { insight, weeklyInsight } = data;
    const aiInsight = insight?.ai || null;
    const insightFileDate = insight?.insightDate || '';

    // 날짜 포맷 헬퍼
    const formatDateKr = (dateStr) => {
      if (!dateStr) return '';
      const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return dateStr;
      return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
    };

    // 일간 리포트
    const dailyThumbnail = fixUrl(aiInsight?.thumbnail) || '';
    const dailyHeadline = aiInsight?.headline || '일간 리포트';
    const dailyLink = insightFileDate ? `/trend/daily/${insightFileDate}/` : '/trend/';

    // 주간 리포트
    const wai = weeklyInsight?.ai || null;
    const wInfo = weeklyInsight?.weekInfo || {};
    const weeklyThumbnail = fixUrl(wai?.thumbnail) || '';
    const weeklyHeadline = wai?.headline || '주간 리포트';
    const weekNum = wInfo.weekNumber || wai?.weekNumber || '';
    const weekYear = wInfo.year || new Date().getFullYear();
    const weeklySlug = weekNum ? `${weekYear}-W${String(weekNum).padStart(2, '0')}` : '';
    const weeklyLink = weeklySlug ? `/trend/weekly/${weeklySlug}/` : '/trend/';

    // 리포트 그리드
    const reportGrid = `
      <div class="home-trend-grid">
        <a href="${dailyLink}" class="home-trend-card">
          <div class="home-trend-card-image">
            ${dailyThumbnail ? `<img src="${dailyThumbnail}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
            <span class="home-trend-card-tag">일간 리포트</span>
          </div>
          <h3 class="home-trend-card-title">${dailyHeadline}</h3>
        </a>
        <a href="${weeklyLink}" class="home-trend-card">
          <div class="home-trend-card-image">
            ${weeklyThumbnail ? `<img src="${weeklyThumbnail}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
            <span class="home-trend-card-tag weekly">주간 리포트</span>
          </div>
          <h3 class="home-trend-card-title">${weeklyHeadline}</h3>
        </a>
      </div>`;

    // 모든 뉴스 합치기 (4개 소스에서 각 1개씩)
    let allNews = [];
    newsSources.forEach(src => {
      const items = news?.[src.key] || [];
      items.filter(item => item.thumbnail).slice(0, 1).forEach(item => {
        allNews.push({ ...item, source: src.name });
      });
    });

    // 뉴스 카드 렌더
    const renderNewsCard = (item) => `
      <a href="${item.link}" class="home-trend-card" target="_blank" rel="noopener">
        <div class="home-trend-card-image">
          <img src="${fixUrl(item.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-img-fallback="hide">
          <span class="home-trend-card-tag">${item.source}</span>
        </div>
        <h3 class="home-trend-card-title">${item.title}</h3>
      </a>`;

    content = `
      <section class="section active" id="news">
        <div class="page-container">
          ${topAds}
          <h1 class="visually-hidden">게임 뉴스</h1>
          ${reportGrid}
          ${generateNativeAdSlot(AD_SLOTS.Article001)}
          ${allNews[0] ? renderNewsCard(allNews[0]) : ''}
          ${allNews[1] ? renderNewsCard(allNews[1]) : ''}
          ${generateMobileTopAdSlot(AD_SLOTS.Responsive001)}
          ${allNews[2] ? renderNewsCard(allNews[2]) : ''}
          ${allNews[3] ? renderNewsCard(allNews[3]) : ''}
        </div>
      </section>
    `;
  } else {
    // PC: 기존 레이아웃
    content = `
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
  }

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
