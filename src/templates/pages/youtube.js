/**
 * 영상 순위 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

function generateYoutubePage(data) {
  const { youtube, chzzk } = data;

  // 광고 슬롯 (홈페이지와 동일한 분리 배치 방식)
  const topAdMobile = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal mobile-only"><ins class="adsbygoogle" style="display:inline-block;width:320px;height:100px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';
  const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" style="display:block;width:100%;max-height:90px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';

  // 유튜브 그리드 생성 (세로형 카드)
  function generateYoutubeGrid(videos) {
    if (!videos || videos.length === 0) {
      return '<div class="youtube-empty"><p>데이터를 불러올 수 없습니다.</p></div>';
    }
    return `
      <div class="youtube-grid">
        ${videos.map((video) => `
          <a class="youtube-card" href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank">
            <div class="youtube-thumb">
              <img src="${video.thumbnail}" alt="" loading="lazy" decoding="async">
              <span class="youtube-tag">${video.channel}</span>
            </div>
            <div class="youtube-info">
              <div class="youtube-title">${video.title}</div>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  // 치지직 그리드 생성 (세로형 카드)
  function generateChzzkGrid(lives) {
    if (!lives || lives.length === 0) {
      return '<div class="youtube-empty"><p>치지직 데이터를 불러올 수 없습니다.</p></div>';
    }
    // 치지직 기본 썸네일 (썸네일 없을 때)
    const defaultThumb = 'https://ssl.pstatic.net/static/nng/glive/icon/favicon.png';
    return `
      <div class="youtube-grid">
        ${lives.map((live) => `
          <a class="youtube-card" href="https://chzzk.naver.com/live/${live.channelId}" target="_blank">
            <div class="youtube-thumb${!live.thumbnail ? ' youtube-thumb-empty' : ''}">
              ${live.thumbnail ? `<img src="${live.thumbnail}" alt="" loading="lazy" decoding="async">` : ''}
              <span class="youtube-tag">${live.channel}</span>
              <span class="youtube-live">🔴 ${live.viewers.toLocaleString()}</span>
            </div>
            <div class="youtube-info">
              <div class="youtube-title">${live.title}</div>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  const content = `
    <section class="section active" id="youtube">
      ${topAdMobile}
      <div class="game-page">
        ${topAdPc}
        <h1 class="visually-hidden">게임 영상 - 유튜브 인기, 치지직 라이브</h1>

        <!-- 유튜브 인기 섹션 -->
        <div class="home-card home-card-full video-section-card" data-section="youtube">
          <div class="home-card-header">
            <h2 class="home-card-title">유튜브 인기</h2>
            <div class="video-pagination">
              <button class="video-page-btn video-prev" aria-label="이전">‹</button>
              <span class="video-page-index">1/1</span>
              <button class="video-page-btn video-next" aria-label="다음">›</button>
            </div>
          </div>
          <div class="home-card-body">
            ${generateYoutubeGrid(youtube?.gaming)}
          </div>
        </div>

        <!-- 치지직 라이브 섹션 -->
        <div class="home-card home-card-full video-section-card" data-section="chzzk">
          <div class="home-card-header">
            <h2 class="home-card-title">치지직 라이브</h2>
            <div class="video-pagination">
              <button class="video-page-btn video-prev" aria-label="이전">‹</button>
              <span class="video-page-index">1/1</span>
              <button class="video-page-btn video-next" aria-label="다음">›</button>
            </div>
          </div>
          <div class="home-card-body">
            ${generateChzzkGrid(chzzk)}
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }
    // twemoji
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }

    // 각 섹션별 페이지네이션
    (function() {
      const getPageSize = () => window.innerWidth <= 768 ? 4 : 8;

      document.querySelectorAll('.video-section-card').forEach(section => {
        const prevBtn = section.querySelector('.video-prev');
        const nextBtn = section.querySelector('.video-next');
        const pageIndex = section.querySelector('.video-page-index');
        const items = section.querySelectorAll('.youtube-card');

        if (!items.length) return;

        let currentPage = 0;

        function updatePagination() {
          const PAGE_SIZE = getPageSize();
          const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;

          items.forEach((item, i) => {
            const start = currentPage * PAGE_SIZE;
            const end = start + PAGE_SIZE;
            item.style.display = (i >= start && i < end) ? '' : 'none';
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
          const PAGE_SIZE = getPageSize();
          const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
          if (currentPage < totalPages - 1) {
            currentPage++;
            updatePagination();
          }
        });

        window.addEventListener('resize', () => {
          const PAGE_SIZE = getPageSize();
          const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
          if (currentPage >= totalPages) currentPage = totalPages - 1;
          updatePagination();
        });

        updatePagination();
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'youtube',
    title: '게임 영상 - 유튜브 인기, 치지직 라이브',
    description: '게임 영상 - 유튜브 인기, 치지직 라이브를 한눈에.',
    keywords: '게임 영상, 유튜브 게임, 치지직 라이브, 게임 스트리밍',
    canonical: 'https://gamerscrawl.com/youtube/',
    pageScripts
  });
}

module.exports = { generateYoutubePage };
