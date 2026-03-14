/**
 * 404 페이지 템플릿
 * - 404 안내 UI 표시 (리다이렉트 없음)
 * - "홈으로" / "게임 DB" 링크 제공
 */

const { wrapWithLayout } = require('../layout');

function generate404Page() {
  const content = `
    <div class="not-found-container">
      <div class="not-found-content">
        <div class="not-found-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="80" height="80">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h1 class="not-found-title">페이지를 찾을 수 없습니다</h1>
        <p class="not-found-desc">요청하신 페이지가 존재하지 않거나 삭제되었습니다.</p>
        <div class="not-found-links">
          <a href="/" class="not-found-link">홈으로</a>
          <a href="/games/" class="not-found-link">게임 DB</a>
        </div>
      </div>
    </div>
  `;

  return wrapWithLayout(content, {
    title: '페이지를 찾을 수 없습니다 | 게이머스크롤',
    description: '요청하신 페이지가 존재하지 않습니다.',
    currentPage: '',
    showSearchBar: true,
    noindex: true
  });
}

module.exports = { generate404Page };
