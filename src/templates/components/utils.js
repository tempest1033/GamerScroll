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
	      <img class="rank-icon" data-src="${game.icon}" alt="" loading="lazy" data-img-fallback="hide">
	      <span class="rank-title">${game.title}</span>
	    </div>
	  `;
	}

// 공통 탭 전환 스크립트
function generateTabScript(tabSelector, panelPrefix) {
  return `
    document.querySelectorAll('${tabSelector}').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('${tabSelector}').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab || tab.dataset.news || tab.dataset.community;
        document.querySelectorAll('[id^="${panelPrefix}"]').forEach(p => p.classList.remove('active'));
        document.getElementById('${panelPrefix}' + target)?.classList.add('active');
      });
    });
  `;
}

module.exports = {
  generateNewsItem,
  generateCommunityItem,
  generateRankItem,
  generateTabScript
};
