/**
 * 메타크리틱 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS } = require('../layout');
const { getScoreColor } = require('../components/utils');

function generateMetacriticPage(data) {
  const { metacritic } = data;

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
          <div class="metacritic-title">${year}년 메타크리틱 TOP 30</div>
        </div>
        <div class="metacritic-grid">${gameCards}</div>
      </div>
    `;
  }

  const content = `
    <section class="section active" id="metacritic">
      ${SHOW_ADS ? `<div class="ad-slot ad-slot-section pc-only">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="5214702534" data-ad-format="auto" data-full-width-responsive="true"></ins>
      </div>
      <div class="ad-slot ad-slot-section mobile-only">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="5214702534" data-ad-format="auto" data-full-width-responsive="true"></ins>
      </div>` : ''}
      ${generateMetacriticContent()}
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
    title: '게이머스크롤 | 메타크리틱 평점',
    description: '메타크리틱 올해의 게임 TOP 30. 전문 평론가 점수 기준 최고의 게임을 확인하세요. 메타스코어로 보는 명작 게임 추천.',
    canonical: 'https://gamerscrawl.com/metacritic/',
    pageScripts
  });
}

module.exports = { generateMetacriticPage };
