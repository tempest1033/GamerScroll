/**
 * 영상 순위 페이지 템플릿
 */

const { wrapWithLayout } = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

function generateYoutubePage(data) {
  const { youtube, chzzk } = data;

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
              <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" decoding="async">
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
              ${live.thumbnail ? `<img src="${live.thumbnail}" alt="${live.title || live.channel}" loading="lazy" decoding="async">` : ''}
              <span class="youtube-tag">${live.channel}</span>
              <span class="youtube-live">LIVE ${live.viewers.toLocaleString()}</span>
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

      <div class="page-container">
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
    (function() {
      var init = function() {
        if (!window.GSUtils || typeof window.GSUtils.initListPager !== 'function') return;
        const sections = document.querySelectorAll('.video-section-card');
        if (!sections || sections.length === 0) return;

        sections.forEach(function(section) {
          window.GSUtils.initListPager({
            root: section,
            itemSelector: '.youtube-card',
            prevSelector: '.video-prev',
            nextSelector: '.video-next',
            infoSelector: '.video-page-index',
            desktopPageSize: 8,
            mobilePageSize: 4,
            infoSeparator: '/',
            hideIfSingle: true
          });
        });
      };
      if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.initListPager === 'function') {
        init();
      } else if (typeof window.__gsOnReady === 'function') {
        window.__gsOnReady(init);
      } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    })();
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'youtube',
    title: '게임 영상 - 유튜브 인기, 치지직 라이브',
    description: '게임 영상 - 유튜브 인기, 치지직 라이브를 한눈에.',
    keywords: '게임 영상, 유튜브 게임, 치지직 라이브, 게임 스트리밍',
    canonical: `${siteBaseUrl}/youtube/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 영상', url: `${siteBaseUrl}/youtube/` }
    ]
  });
}

module.exports = { generateYoutubePage };
