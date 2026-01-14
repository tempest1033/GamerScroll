/**
 * 공통 유틸리티 함수
 */

// 뉴스 아이템 HTML 생성
function generateNewsItem(item, index, sourceName) {
  return `
    <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
      <span class="news-num">${index + 1}</span>
      <div class="news-content">
        <span class="news-title">${item.title}</span>
        <div class="news-tags"><span class="community-tag source-tag">${sourceName}</span></div>
      </div>
    </a>
  `;
}

// 커뮤니티 아이템 HTML 생성
function generateCommunityItem(item, index, sourceName) {
  return `
    <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
      <span class="news-num">${index + 1}</span>
      <div class="news-content">
        <span class="news-title">${item.title}</span>
        <div class="news-tags"><span class="community-tag source-tag">${sourceName}</span></div>
      </div>
    </a>
  `;
}

// 순위 아이템 HTML 생성
	function generateRankItem(game, index) {
	  const rankClass = index < 3 ? `rank-${index + 1}` : '';
	  return `
	    <div class="rank-item ${rankClass}">
	      <span class="rank-num">${index + 1}</span>
	      <img class="rank-icon" src="${game.icon}" alt="" loading="lazy" data-img-fallback="hide">
	      <span class="rank-title">${game.title}</span>
	    </div>
	  `;
	}

module.exports = {
  generateNewsItem,
  generateCommunityItem,
  generateRankItem
};
