/**
 * 메타크리틱 페이지 템플릿
 */

const { wrapWithLayout, AD_SLOTS, generateAdSlot } = require('../layout');

function generateMetacriticPage(data) {
  const { metacritic } = data;

  // 광고 슬롯 (모바일/PC)
  const topAds = generateAdSlot(AD_SLOTS.PC_LongHorizontal001, AD_SLOTS.Mobile_Horizontal001);

  // 메타크리틱 콘텐츠 생성
  function generateMetacriticContent() {
    if (!metacritic || !metacritic.games || metacritic.games.length === 0) {
      return '<div class="metacritic-empty">메타크리틱 데이터를 불러올 수 없습니다</div>';
    }

    const year = metacritic.year || new Date().getFullYear();
    const games = metacritic.games;

    const gameCards = games.slice(0, 30).map((game, i) => {
      const scoreVal = Number(game.score);
      const scoreClass = Number.isFinite(scoreVal)
        ? (scoreVal >= 90 ? 'score-high' : scoreVal >= 75 ? 'score-good' : scoreVal >= 50 ? 'score-mixed' : 'score-bad')
        : 'score-unknown';
      const rankClass = i < 3 ? 'top' + (i + 1) : '';

      return `
      <div class="metacritic-card">
        <div class="metacritic-card-rank ${rankClass}">${i + 1}</div>
        <div class="metacritic-card-poster">
          ${game.img ? `<img data-src="${game.img}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
          <div class="metacritic-card-score ${scoreClass}">${game.score}</div>
        </div>
        <div class="metacritic-card-info">
          <div class="metacritic-card-title">${game.title}</div>
          ${game.platform ? `<div class="metacritic-card-platform">${game.platform}</div>` : ''}
        </div>
      </div>
    `;
	    }).join('');

	    return `
	      <div class="metacritic-card-container home-card">
	        <div class="home-card-header">
	          <span class="home-card-title">${year}년 메타크리틱 TOP 30</span>
	        </div>
	        <div class="home-card-body">
	          <div class="metacritic-grid">${gameCards}</div>
	        </div>
	      </div>
	    `;
	  }

  const content = `
	    <section class="section active" id="metacritic">
	      
	      <div class="page-container metacritic-container content-deferred">
	        ${topAds}
	        <h1 class="visually-hidden">메타크리틱 - 게임 평점, 게임 리뷰</h1>
	        ${generateMetacriticContent()}
	      </div>
	    </section>
  `;

  return wrapWithLayout(content, {
    currentPage: 'metacritic',
    title: '메타크리틱 - 게임 평점, 게임 리뷰',
    description: '메타크리틱 - 게임 평점, 게임 리뷰를 한눈에.',
    keywords: '메타크리틱, 게임 평점, 게임 리뷰, 메타스코어, 명작 게임',
    canonical: 'https://gamerscrawl.com/metacritic/'
  });
}

module.exports = { generateMetacriticPage };
