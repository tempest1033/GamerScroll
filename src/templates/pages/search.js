/**
 * 검색 페이지 → /games/ 리다이렉트
 * 기존 /search/ URL 호환성 유지
 */

const { wrapWithLayout } = require('../layout');

// 모바일 빌드 여부
const isMobileBuild = process.env.MOBILE_BUILD === 'true';
const siteBaseUrl = isMobileBuild ? 'https://m.gamerscroll.com' : 'https://gamerscroll.com';

function generateSearchPage() {
  // 리다이렉트 스크립트
  const redirectScript = `
<script>
(function() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q');
  if (query) {
    window.location.replace('/games/?q=' + encodeURIComponent(query));
  } else {
    window.location.replace('/games/');
  }
})();
</script>
	  `;
	
	  const content = `
	    <div class="search-page search-redirect-container">
	      <p>게임 데이터베이스로 이동 중...</p>
	      <p><a href="/games/">바로 이동하기</a></p>
	    </div>
	  `;

  return wrapWithLayout(content, {
    title: '검색 | 게이머스크롤',
    description: '게임 검색',
    canonical: `${siteBaseUrl}/games/`,
    currentPage: 'games',
    showSearchBar: true,
    pageScripts: redirectScript,
    noindex: true
  });
}

module.exports = {
  generateSearchPage
};
