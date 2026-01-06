/**
 * 404 페이지 템플릿
 * - /games/xxx/ 패턴: 최근 본 게임에서 삭제 후 /games/로 리디렉션
 * - 그 외: 홈페이지로 리디렉션
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

  const redirectScript = `
<script>
(function() {
  var RECENT_KEY = 'gamerscrawl_recent_searches';
  var path = location.pathname;

  // /games/xxx/ 패턴 확인
  var gameMatch = path.match(/^\\/games\\/([^\\/]+)\\/?$/);

  if (gameMatch) {
    // 게임 페이지 404 → 최근 본 게임에서 삭제 후 /games/로 이동
    var slug = gameMatch[1];
    try {
      var recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
      var filtered = recent.filter(function(g) { return g.slug !== slug; });
      if (filtered.length !== recent.length) {
        localStorage.setItem(RECENT_KEY, JSON.stringify(filtered));
        console.log('[404] 최근 본 게임에서 삭제:', slug);
      }
    } catch (e) {}

    location.replace('/games/');
  } else {
    // 그 외 404 → 홈으로 이동
    location.replace('/');
  }
})();
</script>
  `;

  return wrapWithLayout(content, {
    title: '페이지를 찾을 수 없습니다 | 게이머스크롤',
    description: '요청하신 페이지가 존재하지 않습니다.',
    currentPage: '',
    showSearchBar: true,
    pageScripts: redirectScript,
    noindex: true
  });
}

module.exports = { generate404Page };
