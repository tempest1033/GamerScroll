/**
 * 레이아웃 조합기
 * 공통 컴포넌트를 조합하여 완전한 HTML 페이지를 생성
 */

const { generateHead, SHOW_ADS } = require('./components/head');
const { generateHeader } = require('./components/header');
const { generateNav } = require('./components/nav');
const { generateFooter } = require('./components/footer');

// 상단 검색바 (홈/일반 페이지용)
const searchBarHtml = `
  <div class="search-container">
    <div class="search-box">
      <a href="/" class="search-home-icon" aria-label="홈으로 이동">
        <img src="/favicon.svg" alt="" width="20" height="20">
      </a>
      <input type="text" class="search-input" placeholder="게임 이름을 입력해주세요" autocomplete="off">
      <button class="search-btn" type="button" aria-label="검색">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </button>
    </div>
    <div class="search-dropdown"></div>
  </div>`;

/**
 * 페이지를 레이아웃으로 감싸기
 * @param {string} content - 메인 콘텐츠 HTML
 * @param {Object} options - 옵션
 * @param {string} options.currentPage - 현재 페이지 ID (nav active 표시용)
 * @param {string} options.title - 페이지 제목
 * @param {string} options.description - 페이지 설명 (SEO)
 * @param {string} options.canonical - 페이지 URL
 * @param {string} options.pageScripts - 페이지별 추가 스크립트
 * @param {boolean} options.showSearchBar - 상단 검색바 표시 여부
 * @param {Object} options.pageData - 페이지별 데이터 (JSON)
 */
// 호버 프리페치 스크립트
const hoverPrefetchScript = `
<script>
(function() {
  const prefetched = new Set();
  document.querySelectorAll('a.nav-item').forEach(link => {
    link.addEventListener('mouseenter', () => {
      const href = link.getAttribute('href');
      if (href && !prefetched.has(href)) {
        prefetched.add(href);
        const prefetch = document.createElement('link');
        prefetch.rel = 'prefetch';
        prefetch.href = href;
        prefetch.as = 'document';
        document.head.appendChild(prefetch);
      }
    }, { passive: true });
  });
})();
</script>`;

// 상단 검색 스크립트
const searchBarScript = `
<script>
(function() {
  const RECENT_STORAGE_KEY = 'gamerscrawl_recent_searches';
  const MAX_RECENT = 8;
  let gamesData = [];

  // 최근 검색 저장/로드
  function getRecentSearches() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY)) || [];
    } catch { return []; }
  }

  function saveRecentSearch(game) {
    const recent = getRecentSearches().filter(g => g.slug !== game.slug);
    recent.unshift(game);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  }

  function removeRecentSearch(slug) {
    const recent = getRecentSearches().filter(g => g.slug !== slug);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
  }

  function clearAllRecent() {
    localStorage.removeItem(RECENT_STORAGE_KEY);
  }

  async function loadGamesData() {
    try {
      const response = await fetch('/games/search-index.json');
      if (!response.ok) return;
      const data = await response.json();
      gamesData = Array.isArray(data) ? data : (data.games || []);
    } catch (e) {
      console.warn('검색 인덱스 로드 실패:', e);
      gamesData = [];
    }
  }

  loadGamesData();

  const searchInput = document.querySelector('.search-input');
  const searchDropdown = document.querySelector('.search-dropdown');

  if (!searchInput || !searchDropdown) return;

  // 최근 검색 렌더링
  function renderRecentSearches() {
    const recent = getRecentSearches();
    if (recent.length === 0) {
      searchDropdown.innerHTML = '<div class="search-no-results">최근 본 게임이 없습니다</div>';
    } else {
      const header = '<div class="search-recent-header"><span class="search-recent-title">최근 본 게임</span><button class="search-clear-all" type="button">전체 삭제</button></div>';
      const items = recent.map(game => {
        const name = game.name || '';
        const slug = game.slug || '';
        return (
          '<div class="search-result-item" data-slug="' + slug + '">' +
            '<a href="/games/' + slug + '/" class="search-result-info">' +
              '<div class="search-result-title">' + name + '</div>' +
            '</a>' +
            '<button class="search-result-delete" type="button" data-slug="' + slug + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
          '</div>'
        );
      }).join('');
      searchDropdown.innerHTML = header + items;

      // 전체 삭제 이벤트
      const clearAllBtn = searchDropdown.querySelector('.search-clear-all');
      if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearAllRecent();
          renderRecentSearches();
        });
      }

      // 개별 삭제 이벤트
      searchDropdown.querySelectorAll('.search-result-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeRecentSearch(btn.dataset.slug);
          renderRecentSearches();
        });
      });

      // 아이템 클릭 시 저장
      searchDropdown.querySelectorAll('.search-result-info').forEach(link => {
        link.addEventListener('click', () => {
          const item = link.closest('.search-result-item');
          const game = recent.find(g => g.slug === item.dataset.slug);
          if (game) saveRecentSearch(game);
        });
      });
    }
    searchDropdown.classList.add('active');
  }

  let currentResults = [];

  function performSearch(query) {
    if (!query || query.length < 1) {
      currentResults = [];
      renderRecentSearches();
      return;
    }

    const lowerQuery = query.toLowerCase();
    currentResults = gamesData.filter(game => {
      const name = (game.name || game.title || '').toLowerCase();
      const developer = (game.developer || game.publisher || '').toLowerCase();
      const aliases = Array.isArray(game.aliases) ? game.aliases : [];
      const aliasMatch = aliases.some(a => (a || '').toLowerCase().includes(lowerQuery));
      return name.includes(lowerQuery) || developer.includes(lowerQuery) || aliasMatch;
    }).slice(0, 10);

    if (currentResults.length === 0) {
      searchDropdown.innerHTML = '<div class="search-no-results">검색 결과가 없습니다</div>';
    } else {
      searchDropdown.innerHTML = currentResults.map(game => {
        const icon = game.icon || game.iconUrl || '';
        const name = game.name || game.title || '';
        const publisher = game.publisher || game.developer || '';
        const slug = game.slug || game.id || '';
        return (
          '<a href="/games/' + slug + '/" class="search-result-item" data-game=\\'' + JSON.stringify({slug, name, icon, publisher}).replace(/'/g, "\\\\'") + '\\'>' +
            '<div class="search-result-info">' +
              '<div class="search-result-title">' + name + '</div>' +
            '</div>' +
          '</a>'
        );
      }).join('');

      // 검색 결과 클릭 시 최근 검색에 저장
      searchDropdown.querySelectorAll('.search-result-item[data-game]').forEach(item => {
        item.addEventListener('click', () => {
          try {
            const game = JSON.parse(item.dataset.game);
            saveRecentSearch(game);
          } catch {}
        });
      });
    }
    searchDropdown.classList.add('active');
  }

  let debounceTimer;
  function debounce(func, delay) {
    return function(...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
  }

  const debouncedSearch = debounce(performSearch, 200);

  // 입력 이벤트
  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value.trim());
  });

  // 포커스 시 드롭다운 열기
  searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim()) {
      renderRecentSearches();
    } else {
      performSearch(searchInput.value.trim());
    }
  });

  // 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchDropdown.classList.remove('active');
    }
  });

  // 드롭다운 클릭 시 input blur 방지
  searchDropdown.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  // 즉시 검색 (debounce 없이)
  function searchImmediate(query) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    return gamesData.filter(game => {
      const name = (game.name || game.title || '').toLowerCase();
      const developer = (game.developer || game.publisher || '').toLowerCase();
      const aliases = Array.isArray(game.aliases) ? game.aliases : [];
      const aliasMatch = aliases.some(a => (a || '').toLowerCase().includes(lowerQuery));
      return name.includes(lowerQuery) || developer.includes(lowerQuery) || aliasMatch;
    }).slice(0, 10);
  }

  // 검색 실행 (결과 1개면 바로 이동)
  function executeSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    // 즉시 검색 실행
    const results = searchImmediate(query);

    if (results.length === 1) {
      const game = results[0];
      const slug = game.slug || game.id || '';
      saveRecentSearch({ slug, name: game.name || game.title, icon: game.icon, publisher: game.publisher });
      window.location.href = '/games/' + slug + '/';
    } else {
      window.location.href = '/search/?q=' + encodeURIComponent(query);
    }
  }

  // 키보드 이벤트
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchDropdown.classList.remove('active');
      searchInput.blur();
    } else if (e.key === 'Enter') {
      executeSearch();
    }
  });

  // 검색 버튼 클릭
  const searchBtn = document.querySelector('.search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', executeSearch);
  }
})();
</script>`;

// 공통 스와이프 스크립트
const swipeScript = `
<script>
(function() {
  // 네비게이션 섹션 정의 (모바일 순서 기준, PC는 CSS order로 시각 조정)
  const navSections = ['trend', 'news', 'rankings', 'community', 'youtube', 'steam', 'upcoming', 'metacritic'];
  const getNavSections = () => navSections;
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let touchedElement = null;
  let isTouchMoving = false;

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    const sections = getNavSections();
    for (let i = 0; i < sections.length; i++) {
      if (path.includes(sections[i])) return i;
    }
    return -1; // 홈
  }

  function switchNavSection(index) {
    const sections = getNavSections();
    if (index < 0 || index >= sections.length) {
      window.location.href = '/';
      return;
    }
    window.location.href = '/' + sections[index];
  }

  // 스크롤 가능한 요소 찾기
  function findScrollableElement(el) {
    while (el && el !== document.body) {
      if (el.classList.contains('chart-scroll') && el.scrollWidth > el.clientWidth) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  let scrollableEl = null;

  // 터치 이벤트
  document.body.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    isTouchMoving = false;
    touchedElement = e.target.closest('.nav-item, .tab-btn');
    scrollableEl = findScrollableElement(e.target);
  }, { passive: true });

  document.body.addEventListener('touchmove', (e) => {
    const diffX = Math.abs(touchStartX - e.changedTouches[0].screenX);
    const diffY = Math.abs(touchStartY - e.changedTouches[0].screenY);
    if (diffX > 10 || diffY > 10) {
      isTouchMoving = true;
      document.body.classList.add('is-swiping');
      document.activeElement?.blur();
      if (touchedElement) {
        touchedElement.style.pointerEvents = 'none';
        touchedElement.classList.add('swiping');
      }
    }
  }, { passive: true });

  document.body.addEventListener('touchcancel', () => {
    document.body.classList.remove('is-swiping');
    if (touchedElement) {
      touchedElement.style.pointerEvents = '';
      touchedElement.classList.remove('swiping');
      touchedElement = null;
    }
    isTouchMoving = false;
  }, { passive: true });

  // 네비게이션 캐러셀 위치 조정
  function updateNavCarousel(index) {
    const navInner = document.querySelector('.nav-inner');
    if (window.innerWidth <= 768 && navInner) {
      let offset = 0;
      if (index >= 6) offset = -60;
      else if (index >= 5) offset = -40;
      else if (index >= 4) offset = -20;
      navInner.style.transform = 'translateX(' + offset + '%)';
    }
  }

  // 페이지 로드 시 nav 위치 조정 (초기 로드시 애니메이션 없이)
  const currentIdx = getCurrentNavIndex();
  if (currentIdx >= 0) {
    const navInner = document.querySelector('.nav-inner');
    if (window.innerWidth <= 768 && navInner) {
      navInner.style.transition = 'none';
      let offset = 0;
      if (currentIdx >= 6) offset = -60;
      else if (currentIdx >= 5) offset = -40;
      else if (currentIdx >= 4) offset = -20;
      navInner.style.transform = 'translateX(' + offset + '%)';
      // 강제 리플로우로 즉시 적용
      void navInner.offsetHeight;
      // transition 복구
      navInner.style.transition = '';
    }
  }

  document.body.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;

    if (Math.abs(diffX) <= Math.abs(diffY)) {
      cleanup();
      return;
    }

    // 스크롤 영역 경계 체크
    if (scrollableEl) {
      const isAtStart = scrollableEl.scrollLeft <= 1;
      const isAtEnd = scrollableEl.scrollLeft + scrollableEl.clientWidth >= scrollableEl.scrollWidth - 1;
      // 왼쪽 스와이프(다음 페이지) - 오른쪽 끝에서만 허용
      if (diffX > 0 && !isAtEnd) { cleanup(); return; }
      // 오른쪽 스와이프(이전 페이지) - 왼쪽 끝에서만 허용
      if (diffX < 0 && !isAtStart) { cleanup(); return; }
    }

    if (Math.abs(diffX) > 75) {
      isSwiping = true;
      setTimeout(() => { isSwiping = false; }, 300);

      const currentIndex = getCurrentNavIndex();
      if (currentIndex === -1) {
        if (diffX > 0) switchNavSection(0);
        else switchNavSection(getNavSections().length - 1);
      } else {
        if (diffX > 0) switchNavSection(currentIndex + 1);
        else switchNavSection(currentIndex - 1);
      }
    }
    cleanup();

    function cleanup() {
      if (isTouchMoving && touchedElement) {
        const el = touchedElement;
        requestAnimationFrame(() => {
          el.style.pointerEvents = 'none';
          el.classList.add('swiping');
          setTimeout(() => {
            document.body.classList.remove('is-swiping');
            el.style.pointerEvents = '';
            el.classList.remove('swiping');
          }, 300);
        });
      }
      touchedElement = null;
      isTouchMoving = false;
    }
  }, { passive: true });
})();
</script>`;

function wrapWithLayout(content, options = {}) {
  const {
    currentPage = 'home',
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    canonical = 'https://gamerscrawl.com',
    pageScripts = '',
    showSearchBar = true,
    pageData = {}
  } = options;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  ${generateHead({ title, description, canonical, pageData })}
</head>
<body>
  ${generateHeader()}
  ${showSearchBar ? searchBarHtml : ''}
  ${generateNav(currentPage)}
  <main class="container">
    ${content}
  </main>
  ${generateFooter()}
  ${pageScripts}
  ${showSearchBar ? searchBarScript : ''}
  ${hoverPrefetchScript}
  ${swipeScript}
</body>
</html>`;
}

module.exports = { wrapWithLayout, SHOW_ADS };
