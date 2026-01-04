/**
 * 메타크리틱 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');
const { getScoreColor } = require('../components/utils');

function generateMetacriticPage(data) {
  const { metacritic } = data;

  // 광고 슬롯 (홈페이지와 동일한 분리 배치 방식)
  const topAdMobile = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal mobile-only"><ins class="adsbygoogle" data-gc-ad="1" style="display:inline-block;width:100%;height:100px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '"></ins></div>' : '';
  const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%;max-height:90px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins></div>' : '';

  // 메타크리틱 콘텐츠 생성
  function generateMetacriticContent() {
    if (!metacritic || !metacritic.games || metacritic.games.length === 0) {
      return '<div class="metacritic-empty">메타크리틱 데이터를 불러올 수 없습니다</div>';
    }

    const year = metacritic.year || new Date().getFullYear();
    const games = metacritic.games;

    const gameCards = games.slice(0, 30).map((game, i) => {
      const scoreColor = getScoreColor(game.score);
      const rankClass = i < 3 ? 'top' + (i + 1) : '';

      return `
      <div class="metacritic-card">
        <div class="metacritic-card-rank ${rankClass}">${i + 1}</div>
        <div class="metacritic-card-poster">
          ${game.img ? `<img src="${game.img}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="metacritic-card-score" style="background:${scoreColor}">${game.score}</div>
        </div>
        <div class="metacritic-card-info">
          <div class="metacritic-card-title">${game.title}</div>
          ${game.platform ? `<div class="metacritic-card-platform">${game.platform}</div>` : ''}
        </div>
      </div>
    `;
    }).join('');

    return `
      <div class="metacritic-card-container">
        <div class="metacritic-header">
          <h2 class="metacritic-title">${year}년 메타크리틱 TOP 30</h2>
        </div>
        <div class="metacritic-grid">${gameCards}</div>
      </div>
    `;
  }

  const content = `
    <section class="section active" id="metacritic">
      ${topAdMobile}
      <div class="page-wrapper">
        ${topAdPc}
        <h1 class="visually-hidden">메타크리틱 - 게임 평점, 게임 리뷰</h1>
        ${generateMetacriticContent()}
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 폰트 로딩 완료 감지
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }
    // twemoji 적용
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'metacritic',
    title: '메타크리틱 - 게임 평점, 게임 리뷰',
    description: '메타크리틱 - 게임 평점, 게임 리뷰를 한눈에.',
    keywords: '메타크리틱, 게임 평점, 게임 리뷰, 메타스코어, 명작 게임',
    canonical: 'https://gamerscrawl.com/metacritic/',
    pageScripts
  });
}

module.exports = { generateMetacriticPage };
