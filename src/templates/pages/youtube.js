/**
 * 영상 순위 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS, generateAdSlot } = require('../layout');

function generateYoutubePage(data) {
  const { youtube, chzzk } = data;

  // 유튜브 그리드 생성
  function generateYoutubeGrid(videos) {
    if (!videos || videos.length === 0) {
      return '<div class="youtube-empty"><p>데이터를 불러올 수 없습니다.</p></div>';
    }
    return `
      <div class="youtube-grid">
        ${videos.map((video, i) => `
          <a class="youtube-card" href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank">
            <div class="youtube-thumbnail">
              <img src="${video.thumbnail}" alt="" loading="lazy" decoding="async">
              <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
            </div>
            <div class="youtube-info">
              <div class="youtube-title">${video.title}</div>
              <div class="youtube-channel">${video.channel}</div>
              <div class="youtube-views">조회수 ${video.views.toLocaleString()}회</div>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  // 치지직 그리드 생성
  function generateChzzkGrid(lives) {
    if (!lives || lives.length === 0) {
      return '<div class="youtube-empty"><p>치지직 데이터를 불러올 수 없습니다.</p></div>';
    }
    return `
      <div class="youtube-grid">
        ${lives.map((live, i) => `
          <a class="youtube-card" href="https://chzzk.naver.com/live/${live.channelId}" target="_blank">
            <div class="youtube-thumbnail">
              <img src="${live.thumbnail}" alt="" loading="lazy" decoding="async">
              <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              <span class="live-badge">LIVE</span>
            </div>
            <div class="youtube-info">
              <div class="youtube-title">${live.title}</div>
              <div class="youtube-channel">${live.channel}</div>
              <div class="youtube-views">시청자 ${live.viewers.toLocaleString()}명</div>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  const content = `
    <section class="section active" id="youtube">
      <div class="page-wrapper">
        ${generateAdSlot(AD_SLOTS.horizontal4, AD_SLOTS.horizontal5)}
        <h1 class="visually-hidden">게임 영상 순위</h1>
        <div class="video-controls">
        <div class="tab-group" id="videoTab">
          <button class="tab-btn active" data-video="gaming"><img src="https://www.google.com/s2/favicons?domain=youtube.com&sz=32" alt="" class="news-favicon">유튜브 인기</button>
          <button class="tab-btn" data-video="chzzk"><img src="https://www.google.com/s2/favicons?domain=chzzk.naver.com&sz=32" alt="" class="news-favicon">치지직 라이브</button>
        </div>
      </div>

      <div class="video-section active" id="video-gaming">
        ${generateYoutubeGrid(youtube?.gaming)}
      </div>

      <div class="video-section" id="video-chzzk">
        ${generateChzzkGrid(chzzk)}
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
    // 영상 탭 전환
    document.querySelectorAll('#videoTab .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#videoTab .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.video;
        document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
        document.getElementById('video-' + target)?.classList.add('active');
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'youtube',
    title: '게이머스크롤 | 게임 영상',
    description: '유튜브 게임 카테고리 인기 영상 TOP 50, 치지직·숲 게임 라이브 스트리밍 실시간 순위. 지금 가장 핫한 게임 콘텐츠를 확인하세요.',
    canonical: 'https://gamerscrawl.com/youtube/',
    pageScripts
  });
}

module.exports = { generateYoutubePage };
