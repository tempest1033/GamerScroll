/**
 * 게임 허브 페이지 템플릿
 * - 인기 게임 TOP 10 (GA4 조회수 기반)
 * - 전체 게임 목록 (초성/알파벳순)
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

// 광고 슬롯 (홈페이지와 동일한 분리 배치 방식)
const topAdMobile = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal mobile-only"><ins class="adsbygoogle" data-gc-ad="1" style="display:inline-block;width:100%;height:100px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '"></ins></div>' : '';
const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins></div>' : '';

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
    platforms: data.platforms || [],
    appIds: data.appIds || {}
  }));

  // 초성별 그룹화
  const grouped = groupGamesByInitial(gamesList);
  const initialOrder = getInitialOrder();

  // 인기 게임 TOP 10 (게임 정보 매칭 - slug만)
  // 실제 존재하는 게임 페이지만 표시 (appId 형태 URL은 배제)
  const popularGamesWithInfo = [];
  const seenSlugs = new Set();

  for (const pg of popularGames) {
    if (popularGamesWithInfo.length >= 10) break;

    // slug로만 매칭 (실제 존재하는 페이지)
    const gameInfo = gamesList.find(g => g.slug === pg.slug);

    // 매칭 안되면 스킵 (appId 형태 등)
    if (!gameInfo) continue;

    // 중복 게임 스킵
    if (seenSlugs.has(gameInfo.slug)) continue;
    seenSlugs.add(gameInfo.slug);

    popularGamesWithInfo.push({
      ...gameInfo,
      rank: popularGamesWithInfo.length + 1,
      views: pg.views
    });
  }

  // 인기 게임 섹션 HTML
  const popularSection = popularGamesWithInfo.length > 0 ? `
    <section class="games-hub-popular">
      <h2 class="games-hub-section-title">인기 게임</h2>
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
        <a href="#initial-${initial}" class="index-link">${initial}</a>
      `).join('')}
      <a href="#top" class="index-link index-link-back" title="맨 위로">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </a>
    </nav>
  `;

  // 전체 게임 목록 섹션
  const allGamesSection = `
    <section class="games-hub-all">
      <h2 class="games-hub-section-title">전체 게임 (${gamesList.length}개)</h2>
      ${initialNav}
      <div class="games-hub-groups">
        ${existingInitials.map(initial => `
          <div class="games-hub-group" id="initial-${initial}">
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

  // 검색 결과 섹션 (다른 섹션과 동일한 스타일)
  const searchResultsSection = `
    <section class="games-hub-search-results" id="search-results" style="display:none;">
      <h2 class="games-hub-section-title">
        <span id="search-results-title">검색 결과</span>
        <button class="search-results-close" id="search-close" title="닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </h2>
      <div class="games-hub-recent-grid" id="search-results-grid"></div>
    </section>
  `;

  // 최근 본 게임 섹션 (JS에서 동적 표시)
  const recentGamesSection = `
    <section class="games-hub-recent" id="recent-games" style="display:none;">
      <h2 class="games-hub-section-title">최근 본 게임</h2>
      <div class="games-hub-recent-grid" id="recent-games-grid"></div>
    </section>
  `;

  const content = `
    <section class="section active" id="games">
      ${topAdMobile}
      <div class="games-hub-page" id="top">
        ${topAdPc}
        <h1 class="visually-hidden">게임 DB - 모바일 게임 순위, 스팀 게임 순위, 뉴스 검색</h1>
        ${searchResultsSection}
        ${recentGamesSection}
        ${popularSection}
        ${allGamesSection}
      </div>
    </section>
  `;

  // 페이지 스크립트 (검색 결과 + 최근 본 게임 + 스크롤 처리)
  const pageScript = `
<script>
(function() {
  const RECENT_KEY = 'gamerscrawl_recent_searches';

  // 폰트 로딩 완료 시 화면 표시
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
  } else {
    setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
  }

  // 최근 본 게임 로드
  function getRecentGames() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch (e) { return []; }
  }

  // 검색 인덱스 캐시
  let searchIndexCache = null;

  // 최근 본 게임 섹션 렌더링
  async function renderRecentGames() {
    const recent = getRecentGames();
    const section = document.getElementById('recent-games');
    const grid = document.getElementById('recent-games-grid');

    if (recent.length === 0) {
      section.style.display = 'none';
      return;
    }

    // search-index에서 icon 보완
    if (!searchIndexCache) {
      try {
        const res = await fetch('/games/search-index.json');
        searchIndexCache = await res.json();
      } catch (e) {
        searchIndexCache = [];
      }
    }

    section.style.display = 'block';
    grid.innerHTML = recent.map(game => {
      let iconUrl = game.icon;
      // icon이 없으면 search-index에서 찾기
      if (!iconUrl || iconUrl.length < 5) {
        const indexed = searchIndexCache.find(g => g.slug === game.slug);
        iconUrl = indexed?.icon || '/icon-192.png';
      }
      return \`
        <div class="games-hub-recent-card">
          <button class="recent-remove" data-slug="\${game.slug}" title="삭제">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <a href="/games/\${game.slug}/" class="recent-link">
            <img src="\${iconUrl}" alt="\${game.name}" class="recent-icon" loading="lazy" onerror="this.src='/icon-192.png'">
            <span class="recent-name">\${game.name}</span>
          </a>
        </div>
      \`;
    }).join('');

    // X 버튼 이벤트
    grid.querySelectorAll('.recent-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slug = btn.dataset.slug;
        const recent = getRecentGames().filter(g => g.slug !== slug);
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
        renderRecentGames();
      });
    });
  }

  // 검색 결과 렌더링
  async function handleSearchQuery() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');

    if (!query) return;

    const section = document.getElementById('search-results');
    const title = document.getElementById('search-results-title');
    const grid = document.getElementById('search-results-grid');

    section.style.display = 'block';
    title.textContent = '검색 중...';

    try {
      // 캐시된 인덱스 사용
      if (!searchIndexCache) {
        const res = await fetch('/games/search-index.json');
        searchIndexCache = await res.json();
      }
      const searchIndex = searchIndexCache;

      const q = query.toLowerCase().trim();
      const results = searchIndex.filter(game => {
        const nameMatch = game.name.toLowerCase().includes(q);
        const aliasMatch = (game.aliases || []).some(a => a.toLowerCase().includes(q));
        const devMatch = (game.developer || '').toLowerCase().includes(q);
        return nameMatch || aliasMatch || devMatch;
      });

      // 정렬 (정확 매칭 > 시작 일치 > 이름순)
      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === q;
        const bExact = b.name.toLowerCase() === q;
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name, 'ko');
      });

      title.textContent = \`"\${query}" 검색 결과 (\${results.length}개)\`;

      if (results.length === 0) {
        grid.innerHTML = '';
      } else {
        grid.innerHTML = results.slice(0, 50).map(game => \`
          <a href="/games/\${game.slug}/" class="games-hub-recent-card">
            <img src="\${game.icon || '/icon-192.png'}" alt="\${game.name}" class="recent-icon" loading="lazy" onerror="this.src='/icon-192.png'">
            <span class="recent-name">\${game.name}</span>
          </a>
        \`).join('');
      }
    } catch (err) {
      title.textContent = '검색 오류';
      grid.innerHTML = '<p class="search-no-results">검색 인덱스를 불러올 수 없습니다.</p>';
    }
  }

  // 검색 결과 닫기
  document.getElementById('search-close').addEventListener('click', function() {
    window.history.pushState({}, '', '/games/');
    document.getElementById('search-results').style.display = 'none';
  });

  // 인덱스 링크 부드러운 스크롤
  document.querySelectorAll('.index-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const href = this.getAttribute('href');
      if (href === '#top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      history.pushState(null, '', href);
    });
  });

  // 스크롤 시 현재 섹션 하이라이트
  const groups = document.querySelectorAll('.games-hub-group');
  const links = document.querySelectorAll('.index-link');

  function getScrollThreshold() {
    // 모바일: nav(38px) + 자음필터(~50px) + 여유
    // PC: 자음필터(~44px) + 여유
    return window.innerWidth <= 768 ? 100 : 120;
  }

  function updateActiveLink() {
    let current = '';
    const threshold = getScrollThreshold();
    groups.forEach(group => {
      const rect = group.getBoundingClientRect();
      if (rect.top <= threshold) {
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

  // 스크롤 핸들러 (RAF + ticking으로 최적화)
  let scrollTicking = false;
  function onScroll() {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        updateActiveLink();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 모바일 자음 필터는 CSS sticky로 처리 (JS 로직 제거됨)

  // 초기화
  renderRecentGames();
  handleSearchQuery();

  // 뒤로가기(bfcache) 시 최근 본 게임 갱신
  window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
      renderRecentGames();
    }
  });
})();
</script>
  `;

  return wrapWithLayout(content, {
    title: '게임 DB - 모바일 게임 순위, 스팀 게임 순위, 뉴스 검색',
    description: '게임 DB - 모바일 게임 순위, 스팀 게임 순위, 뉴스 검색을 한눈에.',
    keywords: '게임 순위, 모바일 게임 순위, 스팀 게임 순위, 앱스토어 순위, 플레이스토어 순위, 앱스토어 매출 순위, 플레이스토어 매출 순위, 스팀 매출 순위, 스팀 인기 순위, 게임 뉴스',
    canonical: 'https://gamerscrawl.com/games/',
    currentPage: 'games',
    showSearchBar: true,
    pageScripts: pageScript
  });
}

module.exports = {
  generateGamesHubPage
};
