/**
 * 트렌드 리포트 허브 페이지 (목록)
 * - 피드 카드 스타일 (썸네일 + 제목)
 * - 주간/일간 섹션 분리 (탭 없음)
 * - 각 섹션별 페이지네이션
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

// 광고 슬롯 (홈페이지와 동일한 분리 배치 방식)
const topAdMobile = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal mobile-only"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '" data-ad-format="horizontal"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';
const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';

// URL 수정 헬퍼 (이미지 프록시)
const fixUrl = (url) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.includes('inven.co.kr')) {
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
 * @param {Array} params.deepDivePosts - Deep Dive 목록 [{slug, title, date, thumbnail, summary}]
 */
function generateTrendsHubPage({ dailyReports = [], weeklyReports = [], deepDivePosts = [] }) {
  // 일간 리포트 카드 렌더링 (피드 카드 스타일)
  const renderDailyCard = (report) => {
    const slug = report.date;
    const title = report.headline || '일간 리포트';
    const thumbnail = fixUrl(report.thumbnail) || '';
    const badgeText = report.date ? `${formatDateKr(report.date)} 리포트` : '일간 리포트';

    return `
      <a href="/trend/daily/${slug}/" class="trend-feed-card" data-type="daily">
        <div class="trend-feed-card-image">
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="trend-feed-card-tag">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title">${title}</h3>
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
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="trend-feed-card-tag weekly">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title">${title}</h3>
      </a>
    `;
  };

  // Deep Dive 카드 렌더링
  const renderDeepDiveCard = (post) => {
    const thumbnail = fixUrl(post.thumbnail) || '';
    const badgeText = post.date ? formatDateKr(post.date) : 'Deep Dive';

    return `
      <a href="/trend/deep-dive/${post.slug}/" class="trend-feed-card trend-feed-card-deepdive" data-type="deepdive">
        <div class="trend-feed-card-image">
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="trend-feed-card-tag deepdive">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title">${post.title}</h3>
      </a>
    `;
  };

  // 카드 HTML
  const renderDailyCards = () => dailyReports.map(r => renderDailyCard(r)).join('');
  const renderWeeklyCards = () => weeklyReports.map(r => renderWeeklyCard(r)).join('');
  const renderDeepDiveCards = () => deepDivePosts.map(p => renderDeepDiveCard(p)).join('');

  const content = `
    <section class="section active" id="trends-hub">
      ${topAdMobile}
      <div class="game-page">
        ${topAdPc}
        <h1 class="visually-hidden">게임 트렌드 리포트 - 게임 업계 이슈, 게임 순위, 게임 뉴스</h1>

        <!-- Deep Dive 섹션 -->
        ${deepDivePosts.length > 0 ? `
        <div class="home-card home-card-full trend-section" data-section="deepdive">
          <div class="home-card-header">
            <h2 class="home-card-title">Deep Dive</h2>
            <div class="trend-pagination">
              <button class="trend-page-btn trend-prev" aria-label="이전">‹</button>
              <span class="trend-page-index">1/1</span>
              <button class="trend-page-btn trend-next" aria-label="다음">›</button>
            </div>
          </div>
          <div class="home-card-body">
            <div class="trend-feed-grid">
              ${renderDeepDiveCards()}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- 주간 리포트 섹션 -->
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
            ${weeklyReports.length === 0 ? '<div class="trend-empty">주간 리포트가 없습니다</div>' : ''}
          </div>
        </div>

        <!-- 일간 리포트 섹션 -->
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
            ${dailyReports.length === 0 ? '<div class="trend-empty">일간 리포트가 없습니다</div>' : ''}
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    // twemoji
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }

    // 각 섹션별 페이지네이션
    (function() {
      // PC: 8개(2줄), 모바일: 4개
      const getPageSize = (sectionType) => {
        if (window.innerWidth <= 768) return 4;
        return sectionType === 'daily' ? 8 : 4; // 일간만 PC에서 8개
      };

      document.querySelectorAll('.trend-section').forEach(section => {
        const sectionType = section.dataset.section;
        const prevBtn = section.querySelector('.trend-prev');
        const nextBtn = section.querySelector('.trend-next');
        const pageIndex = section.querySelector('.trend-page-index');
        const items = section.querySelectorAll('.trend-feed-card');

        if (!items.length) return;

        let currentPage = 0;
        const PAGE_SIZE = getPageSize(sectionType);
        const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;

        function updatePagination() {
          // 아이템 표시/숨김
          items.forEach((item, i) => {
            const start = currentPage * PAGE_SIZE;
            const end = start + PAGE_SIZE;
            item.style.display = (i >= start && i < end) ? '' : 'none';
          });

          // 인덱스 업데이트
          pageIndex.textContent = (currentPage + 1) + '/' + totalPages;

          // 버튼 활성화
          prevBtn.disabled = currentPage <= 0;
          nextBtn.disabled = currentPage >= totalPages - 1;
        }

        // 페이지 이동
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

        // 초기화
        updatePagination();
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: '게임 트렌드 리포트 - 게임 업계 이슈, 게임 순위, 게임 뉴스',
    description: '게임 트렌드 리포트 - 게임 업계 이슈, 게임 순위, 게임 뉴스를 한눈에.',
    keywords: '게임 트렌드, 게임 리포트, 게임 업계 이슈, 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위',
    canonical: 'https://gamerscrawl.com/trend/',
    pageScripts
  });
}

module.exports = { generateTrendsHubPage };
