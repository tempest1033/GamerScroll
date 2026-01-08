/**
 * 레이아웃 조합기
 * 공통 컴포넌트를 조합하여 완전한 HTML 페이지를 생성
 */

const { generateHead, SHOW_ADS } = require('./components/head');
const { renderAdCard } = require('./components/ads');
const { generateHeader } = require('./components/header');
const { generateNav } = require('./components/nav');
const { generateFooter } = require('./components/footer');

const AD_SLOTS = {
  Responsive001: '5039620326',
  Responsive002: '4840966314',
  Responsive003: '7467129651',
  Responsive004: '7865094213',
  Rectangle001: '1104244740',
  Vertical001: '6855905500'
};

// 상단 검색바 (홈/일반 페이지용)
const searchBarHtml = `
  <div class="search-container">
    <div class="search-box">
      <a href="/" class="search-home-icon" aria-label="홈으로 이동">
        <img src="/favicon.svg" alt="" width="20" height="20">
      </a>
      <input type="text" class="search-input" placeholder="게임 검색" autocomplete="off">
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
	  const SEARCH_INDEX_URL = '/games/search-index.json';
	  const SEARCH_INDEX_CACHE_KEY = 'gamerscrawl_search_index_v1';
	  let gamesData = [];
	  let gamesDataLoaded = false;
	  let gamesDataPromise = null;

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

	  async function loadGamesDataOnce() {
	    if (gamesDataLoaded) return;
	    if (gamesDataPromise) return gamesDataPromise;

	    gamesDataPromise = (async () => {
	      // 1) 세션 캐시 우선
	      try {
	        const cached = sessionStorage.getItem(SEARCH_INDEX_CACHE_KEY);
	        if (cached) {
	          const parsed = JSON.parse(cached);
	          gamesData = Array.isArray(parsed) ? parsed : (parsed.games || []);
	          gamesDataLoaded = true;
	          return;
	        }
	      } catch {}

	      // 2) 네트워크 로드
	      try {
	        const response = await fetch(SEARCH_INDEX_URL);
	        if (!response.ok) return;
	        const data = await response.json();
	        gamesData = Array.isArray(data) ? data : (data.games || []);
	        try {
	          sessionStorage.setItem(SEARCH_INDEX_CACHE_KEY, JSON.stringify(gamesData));
	        } catch {}
	      } catch (e) {
	        console.warn('검색 인덱스 로드 실패:', e);
	        gamesData = [];
	      } finally {
	        gamesDataLoaded = true;
	      }
	    })();

	    return gamesDataPromise;
	  }

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

      // 아이템 클릭 시 페이지 존재 확인 후 이동
      searchDropdown.querySelectorAll('.search-result-info').forEach(link => {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const item = link.closest('.search-result-item');
          const game = recent.find(g => g.slug === item.dataset.slug);
          if (!game) return;
          try {
            const res = await fetch('/games/' + game.slug + '/', { method: 'HEAD' });
            if (res.ok) {
              saveRecentSearch(game);
              location.href = '/games/' + game.slug + '/';
            } else {
              removeRecentSearch(game.slug);
              location.href = '/games/';
            }
          } catch {
            removeRecentSearch(game.slug);
            location.href = '/games/';
          }
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

	    if (!gamesDataLoaded) {
	      searchDropdown.innerHTML = '<div class="search-no-results">검색 데이터를 불러오는 중...</div>';
	      searchDropdown.classList.add('active');
	      loadGamesDataOnce().then(() => performSearch(query));
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
	    loadGamesDataOnce();
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
	  async function executeSearch() {
	    const query = searchInput.value.trim();
	    if (!query) return;

	    // 즉시 검색 실행
	    await loadGamesDataOnce();
	    const results = searchImmediate(query);

	    if (results.length === 1) {
	      const game = results[0];
	      const slug = game.slug || game.id || '';
      saveRecentSearch({ slug, name: game.name || game.title, icon: game.icon, publisher: game.publisher });
      window.location.href = '/games/' + slug + '/';
    } else {
      window.location.href = '/games/?q=' + encodeURIComponent(query);
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
  const navSections = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic'];
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
    window.location.href = '/' + sections[index] + '/';
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
      if (index >= 4) offset = -40;
      else if (index === 3) offset = -20;
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
      if (currentIdx >= 4) offset = -40;
      else if (currentIdx === 3) offset = -20;
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

    if (Math.abs(diffX) > 50) {
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

// 모바일 스크롤 시 검색창 숨김 스크립트
const mobileScrollHideScript = `
<script>
(function() {
  if (window.innerWidth > 768) return;

  let ticking = false;
  const threshold = 50;

  function updateSearchVisibility() {
    const currentScrollY = window.scrollY;

    if (currentScrollY < threshold) {
      document.body.classList.remove('search-hidden');
    } else {
      document.body.classList.add('search-hidden');
    }

    ticking = false;
  }

  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(updateSearchVisibility);
      ticking = true;
    }
  }, { passive: true });
})();
</script>`;

// 폰트 로딩 + twemoji 파싱 (공통)
const fontAndEmojiScript = `
<script>
(function() {
  function markFontsLoaded() {
    document.documentElement.classList.add('fonts-loaded');
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(markFontsLoaded);
  } else {
    setTimeout(markFontsLoaded, 100);
  }

  function parseTwemojiOnce() {
    if (window.__gcTwemojiParsed) return;
    if (typeof twemoji === 'undefined') return;
    twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    window.__gcTwemojiParsed = '1';
  }

  parseTwemojiOnce();
  window.addEventListener('load', parseTwemojiOnce);
})();
</script>`;

// Lazy Ad Loader - 비활성화 (전체 즉시 로드로 롤백)
const lazyAdScript = '';

const deferredItemsScript = `
<script>
(function() {
  var html = document.documentElement;
  if (!html.classList.contains('js-defer')) return;

  var ITEM_SELECTOR = [
    '.popular-banner-label',
    '.popular-banner-more',
    '.column-header',
    '.country-name',
    '.flag',
    '.steam-table-header',
    '.upcoming-table-header',
    '.games-hub-section-title',
    '.group-title',
    '.group-count',
    '.index-link',
    '#search-results-title',
    '.search-results-close',
    '.home-card-title',
    '.home-card-more',
    '.community-panel-title',
    '.community-panel-more',
    '.home-news-tab',
    '.home-community-tab',
    '.home-rank-tab',
    '.home-upcoming-tab',
    '.insight-tab',
    '.tab-btn',
    '.home-news-card',
    '.home-news-item',
    '.home-community-item',
    '.home-video-card',
    '.home-video-item',
    '.home-rank-row',
    '.home-steam-row',
    '.home-upcoming-row',
    '.home-trend-card',
    '.popular-banner-item',
    '.news-grid-card',
    '.news-grid-item',
    '.community-item',
    '.youtube-card',
    '.rank-row',
    '.steam-table-row',
    '.upcoming-item',
    '.metacritic-card',
    '.games-hub-popular-card',
    '.game-item',
    '.games-hub-recent-card',
    '.trend-feed-card',
    '.game-hero-stat',
    '.game-rank-country-row',
    '.game-steam-stat',
    '.game-news-item',
    '.game-community-item',
    '.game-youtube-item',
    '.gm-item',
    '.weekly-hot-card',
    '.weekly-rank-card',
    '.weekly-metric-card',
    '.weekly-community-card',
    '.weekly-streaming-card',
    '.weekly-stock-item',
    '.weekly-release-item',
    '.industry-card',
    '.global-card'
  ].join(',');

  var SECTION_SELECTOR = [
    '.home-card',
    '.weekly-section',
    '.community-panel',
    '.games-hub-popular',
    '.games-hub-all',
    '.games-hub-recent',
    '.games-hub-search-results',
    '.popular-banner'
  ].join(',');

  var REVEAL_DELAY_MS = 100;
  var FALLBACK_TIMEOUT_MS = 1500;
  var revealStarted = false;
  var fallbackTimer = null;
  var raf = window.requestAnimationFrame || function(cb) { return setTimeout(cb, 16); };

  function markVisible(el) {
    if (!el || el.classList.contains('gc-defer-visible')) return;
    el.classList.add('gc-defer-visible');
  }

  function revealSequence(items, done) {
    if (!items || items.length === 0) {
      done();
      return;
    }
    var i = 0;
    function step() {
      if (i >= items.length) {
        done();
        return;
      }
      markVisible(items[i]);
      i += 1;
      raf(step);
    }
    raf(step);
  }

  function buildRankingSequence(grid) {
    if (!grid) return [];
    var columns = grid.querySelectorAll('.country-column');
    if (!columns.length) return [];
    var maxRows = 0;

    for (var c = 0; c < columns.length; c++) {
      var rowCount = columns[c].querySelectorAll('.rank-row').length;
      if (rowCount > maxRows) maxRows = rowCount;
    }

    var sequence = [];
    for (var r = 0; r < maxRows; r++) {
      if (r === 0) {
        for (var c0 = 0; c0 < columns.length; c0++) {
          var header = columns[c0].querySelector('.column-header');
          if (header) sequence.push(header);
        }
      }
      for (var c1 = 0; c1 < columns.length; c1++) {
        var rows = columns[c1].querySelectorAll('.rank-row');
        if (rows[r]) sequence.push(rows[r]);
      }
    }
    return sequence;
  }

  function getSectionItems(section) {
    var rankingGrids = section.querySelectorAll('.columns-grid');
    if (rankingGrids.length) {
      var seq = [];
      for (var i = 0; i < rankingGrids.length; i++) {
        var part = buildRankingSequence(rankingGrids[i]);
        if (part.length) seq = seq.concat(part);
      }
      if (seq.length) return seq;
    }

    var nodes = section.querySelectorAll(ITEM_SELECTOR);
    var items = [];
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].closest(SECTION_SELECTOR) === section) items.push(nodes[j]);
    }
    return items;
  }

  function finalize() {
    html.classList.remove('js-defer');
  }

  function startReveal() {
    if (revealStarted) return;
    revealStarted = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    setTimeout(finalize, REVEAL_DELAY_MS);
  }

  function getTopAdIn(containerSelector) {
    var container = document.querySelector(containerSelector);
    if (!container) return null;
    return container.querySelector('ins.adsbygoogle');
  }

  function getFirstAdInMain() {
    var main = document.querySelector('main');
    if (!main) return null;
    return main.querySelector('ins.adsbygoogle');
  }

  function getPriorityAd() {
    var topAd = getTopAdIn('#home-top-ad');
    if (topAd) return topAd;
    return getFirstAdInMain();
  }

  function isAdFilled(ad) {
    return !!(ad && (ad.dataset.adStatus === 'filled' || ad.childElementCount > 0));
  }

  function isAdReady(ad) {
    if (!ad) return false;
    // filled 또는 unfilled면 완료
    if (ad.dataset.adStatus) return true;
    // iframe 로드 완료면 완료
    var frame = ad.querySelector('iframe');
    if (frame && frame.__gcLoaded) return true;
    return false;
  }

  function waitForAd(ad) {
    if (!ad) return false;
    if (isAdReady(ad)) return true;

    // iframe load 이벤트 바인딩
    var frame = ad.querySelector('iframe');
    if (frame && !frame.__gcLoadBound) {
      frame.__gcLoadBound = true;
      frame.addEventListener('load', function() {
        frame.__gcLoaded = true;
        startReveal();
      }, { once: true });
    }

    // MutationObserver로 data-ad-status 감지
    if (!ad.__gcStatusObserver) {
      ad.__gcStatusObserver = new MutationObserver(function() {
        if (ad.dataset.adStatus) startReveal();
      });
      ad.__gcStatusObserver.observe(ad, { attributes: true, attributeFilter: ['data-ad-status'] });
    }
    return false;
  }

  function checkAds() {
    var priorityAd = getPriorityAd();
    if (priorityAd) {
      if (!waitForAd(priorityAd)) setTimeout(checkAds, 50);
      else startReveal();
      return;
    }

    var ads = document.querySelectorAll('ins.adsbygoogle');
    if (!ads.length) {
      startReveal();
      return;
    }
    for (var i = 0; i < ads.length; i++) {
      if (waitForAd(ads[i])) {
        startReveal();
        return;
      }
    }
    setTimeout(checkAds, 50);
  }

  function init() {
    fallbackTimer = setTimeout(startReveal, FALLBACK_TIMEOUT_MS);
    checkAds();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>`;

// Footer 모달(개인정보처리방침) 열기/닫기 공통 처리 (인라인 onclick 제거)
const footerModalScript = `
<script>
(function() {
  function getModal(id) {
    return id ? document.getElementById(id) : null;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    var closeBtn = modal.querySelector('[data-modal-close]');
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  document.querySelectorAll('[data-modal-open]').forEach(function(trigger) {
    trigger.addEventListener('click', function(e) {
      var id = trigger.getAttribute('data-modal-open');
      var modal = getModal(id);
      if (!modal) return;
      e.preventDefault();
      openModal(modal);
    });
  });

  document.querySelectorAll('[data-modal-close]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var id = btn.getAttribute('data-modal-close');
      var modal = getModal(id) || btn.closest('.modal-overlay');
      if (!modal) return;
      e.preventDefault();
      closeModal(modal);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(function(modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.modal-overlay.is-open');
    if (open) closeModal(open);
  });
})();
</script>`;

// 이미지 로드 실패 공통 처리 (인라인 onerror 제거)
// - data-img-fallback: hide | hide-visibility | parent-hide | thumb-fallback | hide-show-next
// - data-img-fallback-src: 실패 시 대체 src
// - data-img-fallback-id: thumb-rect | icon-square
// - data-img-fallback-retry-src: 1회 재시도 src
// - data-img-fallback-show-next: "1"이면 nextElementSibling 표시
// - data-img-fallback-show-display: 표시할 display 값(예: flex)
const imageFallbackScript = `
<script>
(function() {
  var THUMB_PLACEHOLDER = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>';
  var ICON_PLACEHOLDER = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23374151%22 width=%2240%22 height=%2240%22 rx=%228%22/></svg>';

  function placeholderById(id) {
    if (id === 'thumb-rect') return THUMB_PLACEHOLDER;
    if (id === 'icon-square') return ICON_PLACEHOLDER;
    return '';
  }

  function showTarget(img) {
    if (!img || img.dataset.imgFallbackShowNext !== '1') return;
    var el = img.nextElementSibling;
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.remove('is-hidden');
    var display = img.dataset.imgFallbackShowDisplay;
    if (display) el.style.display = display;
  }

  function applyFallback(img) {
    if (!img || img.tagName !== 'IMG') return;
    if (img.dataset.gcImgFallbackApplied === '1') return;

    // 1) 1회 재시도(src 교체)
    var retrySrc = img.dataset.imgFallbackRetrySrc;
    if (retrySrc && img.dataset.gcImgFallbackRetried !== '1') {
      img.dataset.gcImgFallbackRetried = '1';
      img.src = retrySrc;
      return;
    }

    // 2) placeholder id
    var placeholderId = img.dataset.imgFallbackId;
    if (placeholderId && img.dataset.gcImgFallbackIdDone !== '1') {
      var src0 = placeholderById(placeholderId);
      if (src0) {
        img.dataset.gcImgFallbackIdDone = '1';
        img.src = src0;
        return;
      }
    }

    // 3) fallback src
    var fallbackSrc = img.dataset.imgFallbackSrc;
    if (fallbackSrc && img.dataset.gcImgFallbackSrcDone !== '1') {
      img.dataset.gcImgFallbackSrcDone = '1';
      img.src = fallbackSrc;
      return;
    }

    // 4) action
    var action = img.dataset.imgFallback || '';
    if (action === 'thumb-fallback') {
      if (img.parentElement) img.parentElement.classList.add('thumb-fallback');
      img.dataset.gcImgFallbackApplied = '1';
      return;
    }

    if (action === 'parent-hide') {
      if (img.parentElement) img.parentElement.style.display = 'none';
      else img.style.display = 'none';
      img.dataset.gcImgFallbackApplied = '1';
      return;
    }

    if (action === 'hide-show-next') {
      img.style.display = 'none';
      showTarget(img);
      img.dataset.gcImgFallbackApplied = '1';
      return;
    }

    if (action === 'hide-visibility') {
      img.style.visibility = 'hidden';
      img.dataset.gcImgFallbackApplied = '1';
      return;
    }

    if (action === 'hide') {
      img.style.display = 'none';
      img.dataset.gcImgFallbackApplied = '1';
      return;
    }

    // fallback이 없으면 무한 루프 방지용으로만 마킹
    img.dataset.gcImgFallbackApplied = '1';
  }

  document.addEventListener('error', function(e) {
    var t = e && e.target;
    if (t && t.tagName === 'IMG') applyFallback(t);
  }, true);

  function sweepBrokenImages() {
    document.querySelectorAll('img[data-img-fallback],img[data-img-fallback-src],img[data-img-fallback-id],img[data-img-fallback-retry-src]').forEach(function(img) {
      try {
        if (img.complete && img.naturalWidth === 0) applyFallback(img);
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweepBrokenImages);
  } else {
    sweepBrokenImages();
  }
})();
</script>`;

// 광고 초기화 - 별도 스크립트 불필요 (각 슬롯에서 push)
const adInitScript = '';

function wrapWithLayout(content, options = {}) {
  const {
    currentPage = 'home',
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords,
    canonical = 'https://gamerscrawl.com',
    pageScripts = '',
    showSearchBar = true,
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    noindex = false  // 검색엔진 인덱싱 제외 (thin content용)
  } = options;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  ${generateHead({ title, description, keywords, canonical, pageData, articleSchema, noindex })}
</head>
<body class="${currentPage ? `page-${currentPage}` : ''}">
  ${generateHeader()}
  ${showSearchBar ? searchBarHtml : ''}
  ${generateNav(currentPage)}
	  <main class="site-container">
	    ${content}
				  </main>
					  ${generateFooter()}
				  ${footerModalScript}
				  ${imageFallbackScript}
			  ${fontAndEmojiScript}
			  ${pageScripts}
			  ${lazyAdScript}
			  ${deferredItemsScript}
			  ${showSearchBar ? searchBarScript : ''}
			  ${hoverPrefetchScript}
  ${swipeScript}
  ${mobileScrollHideScript}
  ${adInitScript}
</body>
</html>`;
}

/**
 * 광고 카드 생성
 * @param {string} slotId - 광고 슬롯 ID
 * @param {Object} options - { width, height, format, fullWidthResponsive }
 */
function generateAdSlot(slotId, options = {}) {
  if (!SHOW_ADS) return '';
  return renderAdCard(slotId, options);
}

module.exports = { wrapWithLayout, SHOW_ADS, AD_SLOTS, generateAdSlot };
