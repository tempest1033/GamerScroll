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
	      <img class="rank-icon" src="${game.icon}" alt="${game.title}" loading="lazy" data-img-fallback="hide">
	      <span class="rank-title">${game.title}</span>
	    </div>
	  `;
	}

// 카드 메타용 짧은 날짜 (2026-09-05 → 2026.09.05) — AIScroll 카드와 같은 표기
function formatDateShortKr(dateStr) {
  if (!dateStr) return '';
  const match = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}.${match[2]}.${match[3]}`;
}

// 목록 카드 본문: 메타(카테고리 · YYYY.MM.DD) → 제목 → 요약 2줄.
// 게이머스크롤 홈·허브와 AIScroll 피드 카드가 같은 마크업(.home-trend-card-body)을 쓴다.
function renderFeedCardBody({ category = '', date = '', title = '', summary = '' } = {}) {
  const dateLabel = formatDateShortKr(date);
  const dateAttr = String(date || '').slice(0, 10).replace(/"/g, '');
  const metaHtml = (category || dateLabel)
    ? `<div class="home-trend-card-meta">${category ? `<span class="home-trend-card-category">${category}</span>` : ''}${dateLabel ? `<time class="home-trend-card-date" datetime="${dateAttr}">${dateLabel}</time>` : ''}</div>`
    : '';
  return `
        <div class="home-trend-card-body">
          ${metaHtml}
          <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${title}</span></h3>
          ${summary ? `<p class="home-trend-card-summary">${summary}</p>` : ''}
        </div>`;
}

module.exports = {
  generateNewsItem,
  generateCommunityItem,
  generateRankItem,
  formatDateShortKr,
  renderFeedCardBody
};
