/**
 * 404 페이지 템플릿
 * - 404 안내 UI 표시 (리다이렉트 없음)
 * - "홈으로" / "게임 DB" 링크 제공
 */

const { t } = require('../../i18n');
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
        <h1 class="not-found-title">${t('notfound.page_not_found')}</h1>
        <p class="not-found-desc">${t('notfound.the_page_you_requested_does_2')}</p>
        <div class="not-found-links">
          <a href="/" class="not-found-link">${t('notfound.back_to_home')}</a>
          <a href="/games/" class="not-found-link">${t('layout.game_db')}</a>
        </div>
      </div>
    </div>
  `;

  return wrapWithLayout(content, {
    title: t('notfound.page_not_found_gamerscroll'),
    description: t('notfound.the_page_you_requested_does'),
    currentPage: '',
    showSearchBar: true,
    noindex: true
  });
}

module.exports = { generate404Page };
