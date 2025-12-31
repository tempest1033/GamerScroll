/**
 * 게임 허브 페이지 템플릿
 * - 인기 게임 TOP 10 (GA4 조회수 기반)
 * - 전체 게임 목록 (초성/알파벳순)
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS, generateAdSlot } = require('../layout');

/**
 * 초성 추출 함수
 */
function getInitial(str) {
  if (!str) return '#';
  const first = str.charAt(0);
  const code = first.charCodeAt(0);

  // 한글
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const cho = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    const index = Math.floor((code - 0xAC00) / 588);
    return cho[index] || '#';
  }

  // 영문
  if (/[a-zA-Z]/.test(first)) {
    return first.toUpperCase();
  }

  // 숫자
  if (/[0-9]/.test(first)) {
    return '0-9';
  }

  return '#';
}

/**
 * 게임 목록을 초성/알파벳별로 그룹화
 */
function groupGamesByInitial(games) {
  const groups = {};

  games.forEach(game => {
    const initial = getInitial(game.name);
    if (!groups[initial]) {
      groups[initial] = [];
    }
    groups[initial].push(game);
  });

  // 각 그룹 내에서 이름순 정렬
  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  });

  return groups;
}

/**
 * 초성 정렬 순서
 */
function getInitialOrder() {
  return [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0-9', '#'
  ];
}

/**
 * 게임 허브 페이지 생성
 * @param {Object} options
 * @param {Array} options.games - games.json의 게임 목록
 * @param {Array} options.popularGames - GA4 인기 게임 TOP 10 [{slug, views}]
 */
function generateGamesHubPage(options = {}) {
  const { games = [], popularGames = [] } = options;

  // 게임 데이터를 배열로 변환
  const gamesList = Object.entries(games).map(([name, data]) => ({
    name,
    slug: data.slug,
    icon: data.icon,
    developer: data.developer,
    platforms: data.platforms || []
  }));

  // 초성별 그룹화
  const grouped = groupGamesByInitial(gamesList);
  const initialOrder = getInitialOrder();

  // 인기 게임 TOP 10 (게임 정보 매칭)
  const popularGamesWithInfo = popularGames.slice(0, 10).map((pg, index) => {
    const gameInfo = gamesList.find(g => g.slug === pg.slug);
    return gameInfo ? { ...gameInfo, rank: index + 1, views: pg.views } : null;
  }).filter(Boolean);

  // 인기 게임 섹션 HTML
  const popularSection = popularGamesWithInfo.length > 0 ? `
    <section class="games-hub-popular">
      <h2 class="games-hub-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="section-icon">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
        이번 달 인기 게임
      </h2>
      <div class="games-hub-popular-grid">
        ${popularGamesWithInfo.map(game => `
          <a href="/games/${game.slug}/" class="games-hub-popular-card">
            <span class="popular-rank">${game.rank}</span>
            <img src="${game.icon}" alt="${game.name}" class="popular-icon" loading="lazy" onerror="this.src='/icon-192.png'">
            <div class="popular-info">
              <span class="popular-name">${game.name}</span>
              <span class="popular-views">${game.views.toLocaleString()}회 조회</span>
            </div>
          </a>
        `).join('')}
      </div>
    </section>
  ` : '';

  // 초성 인덱스 네비게이션
  const existingInitials = initialOrder.filter(i => grouped[i] && grouped[i].length > 0);
  const initialNav = `
    <nav class="games-hub-index">
      ${existingInitials.map(initial => `
        <a href="#initial-${encodeURIComponent(initial)}" class="index-link">${initial}</a>
      `).join('')}
    </nav>
  `;

  // 전체 게임 목록 섹션
  const allGamesSection = `
    <section class="games-hub-all">
      <h2 class="games-hub-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="section-icon">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        전체 게임 (${gamesList.length}개)
      </h2>
      ${initialNav}
      <div class="games-hub-groups">
        ${existingInitials.map(initial => `
          <div class="games-hub-group" id="initial-${encodeURIComponent(initial)}">
            <h3 class="group-title">${initial} <span class="group-count">(${grouped[initial].length})</span></h3>
            <div class="group-games">
              ${grouped[initial].map(game => `
                <a href="/games/${game.slug}/" class="game-item">
                  <img src="${game.icon}" alt="${game.name}" class="game-icon" loading="lazy" onerror="this.src='/icon-192.png'">
                  <span class="game-name">${game.name}</span>
                </a>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;

  const content = `
    ${generateAdSlot(AD_SLOTS.horizontal4, AD_SLOTS.horizontal5)}
    <div class="games-hub-page">
      <header class="games-hub-header">
        <h1 class="games-hub-title">게임 데이터베이스</h1>
        <p class="games-hub-desc">${gamesList.length}개 게임의 순위, 트렌드, 정보를 확인하세요</p>
      </header>
      ${popularSection}
      ${generateAdSlot(AD_SLOTS.rectangle1, AD_SLOTS.rectangle2)}
      ${allGamesSection}
    </div>
  `;

  // 스크롤 시 인덱스 하이라이트 스크립트
  const pageScript = `
<script>
(function() {
  // 인덱스 링크 부드러운 스크롤
  document.querySelectorAll('.index-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', this.getAttribute('href'));
      }
    });
  });

  // 스크롤 시 현재 섹션 하이라이트
  const groups = document.querySelectorAll('.games-hub-group');
  const links = document.querySelectorAll('.index-link');

  function updateActiveLink() {
    let current = '';
    groups.forEach(group => {
      const rect = group.getBoundingClientRect();
      if (rect.top <= 150) {
        current = group.id;
      }
    });

    links.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveLink, { passive: true });
  updateActiveLink();
})();
</script>
  `;

  return wrapWithLayout(content, {
    title: '게임 데이터베이스 | 게이머스크롤',
    description: `${gamesList.length}개 게임의 순위, 트렌드, 커뮤니티 반응을 한눈에. 모바일/스팀 게임 정보를 확인하세요.`,
    canonical: 'https://gamerscrawl.com/games/',
    currentPage: 'games',
    showSearchBar: true,
    pageScript
  });
}

module.exports = {
  generateGamesHubPage
};
