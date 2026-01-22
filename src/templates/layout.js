/**
 * 레이아웃 조합기
 * 공통 컴포넌트를 조합하여 완전한 HTML 페이지를 생성
 */

// 광고 활성화 여부 (ADS_ENABLED=false면 비활성화)
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';

const { generateHead } = require('./components/head');
const {
  renderAdCard,
  renderResponsiveTopAd,
  renderResponsiveHomeAd,
  renderSidebarVerticalAd,
  renderSidebarRectangleAd,
  renderMobileOnlyAd,
  renderContentAd,
  renderNativeAd,
  renderMultiplexAd,
  // 하위 호환 별칭
  renderPCAd,
  renderPCHomeAd,
  renderVerticalAd,
  renderRectangleAd
} = require('./components/ads');
const { generateHeader } = require('./components/header');
const { generateNav } = require('./components/nav');
const { generateFooter } = require('./components/footer');

// 광고 슬롯 (PC + 모바일)
const AD_SLOTS = {
  // PC 홈 전용 (새 슬롯)
  PCHome001: '6527917656',
  PCHome002: '3901754316',
  PCHome003: '7596444984',
  // PC 홈 상단 (728x90) - deprecated
  ResponsivePCHome001: '4377097736',
  // PC 상단 (970x90)
  ResponsivePC001: '1795150514',
  ResponsivePC002: '8458886930',
  ResponsivePC003: '3935062846',
  ResponsivePC004: '1062515168',
  ResponsivePC005: '5214702534',
  // PC 사이드바
  VerticalPC001: '6855905500',
  RectanglePC001: '1104244740',
  // 모바일 (300x100, 300x250)
  Mobile001: '5825162341',
  Mobile002: '4840966314',
  Mobile003: '7467129651',
  Mobile004: '7865094213',
  Mobile005: '3028357040',
  // 네이티브 In-feed (홈페이지)
  Article001: '9737299266',
  Article002: '9737299266',
  Article003: '9204970318',
  Article004: '3171890915',
  Article005: '8232645901',
  // 멀티플렉스
  Multiflex001: '5636974986'
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
	  const RECENT_STORAGE_KEY = 'gamerscroll_recent_searches';
	  const MAX_RECENT = 8;
	  const SEARCH_INDEX_URL = '/games/search-index.json';
	  const SEARCH_INDEX_CACHE_KEY = 'gamerscroll_search_index_v1';
	  let gamesData = [];
	  let gamesDataLoaded = false;
	  let gamesDataPromise = null;
	  let gamesDataScheduled = false;

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
          searchDropdown.classList.remove('active');
          searchInput.blur();
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

      // 검색 결과 클릭 시 페이지 이동
      searchDropdown.querySelectorAll('.search-result-item[data-game]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          try {
            const game = JSON.parse(item.dataset.game);
            saveRecentSearch(game);
          } catch {}
          const href = item.getAttribute('href');
          searchDropdown.classList.remove('active');
          searchInput.blur();
          location.href = href;
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

	  function scheduleLoadGamesData() {
	    if (gamesDataLoaded || gamesDataScheduled) return;
	    gamesDataScheduled = true;
	    if ('requestIdleCallback' in window) {
	      requestIdleCallback(function() { loadGamesDataOnce(); }, { timeout: 1500 });
	    } else {
	      setTimeout(function() { loadGamesDataOnce(); }, 200);
	    }
	  }

	  // 입력 이벤트
	  searchInput.addEventListener('input', (e) => {
	    if (e.target.value.trim()) scheduleLoadGamesData();
	    debouncedSearch(e.target.value.trim());
	  });

	  // 포커스 시 드롭다운 열기
	  searchInput.addEventListener('focus', () => {
	    scheduleLoadGamesData();
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
      // games 페이지 이동 + 검색 쿼리
      var searchUrl = '/games/?q=' + encodeURIComponent(query);
      window.location.href = searchUrl;
    }
    // 검색 드롭다운 닫기
    searchDropdown.classList.remove('active');
    searchInput.blur();
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

// 공통 스와이프 스크립트 (드래그 중 화면 이동 + 슬라이드 아웃 애니메이션)
const swipeScript = `
<script>
(function() {
  // PC에서는 스와이프 비활성화
  if (window.innerWidth > 768) return;

  const navSections = ['magazine', 'wiki', 'games', 'rankings', 'steam', 'upcoming'];

  const SWIPE_THRESHOLD = 0.10; // 10% 넘으면 페이지 이동
  const MAX_DRAG_PERCENT = 0.15; // 최대 15%까지 화면 이동
  const TRANSITION_MS = 120;
  const SLIDE_OUT_MS = 80; // 슬라이드 아웃 애니메이션 시간
  const DIRECTION_LOCK_PX = 10;
  const DIRECTION_LOCK_RATIO = 1.2;
  const VELOCITY_THRESHOLD = 0.5; // 속도 임계값 (px/ms) - 빠른 플릭 감지

  let originalNavIdx = null;
  let previewNavIdx = null;

  function setNavActiveIndex(idx) {
    if (previewNavIdx === idx) return;
    previewNavIdx = idx;

    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return;
    var navItems = navInner.querySelectorAll('.nav-item');
    for (var i = 0; i < navItems.length; i++) navItems[i].classList.remove('active');
    if (idx >= 0 && navItems[idx]) navItems[idx].classList.add('active');
  }

  let touchStartX = null;
  let touchStartY = null;
  let touchStartTime = null;
  let swipeAxis = null;
  let isSwiping = false;
  let swipeMode = null;
  let hasPrevPage = false;
  let hasNextPage = false;
  let scrollableEl = null;
  let mainEl = null;

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    for (let i = 0; i < navSections.length; i++) {
      if (path.includes(navSections[i])) return i;
    }
    return -1;
  }

  function getPrevIndex(idx) {
    if (idx === -1) return navSections.length - 1;
    if (idx === 0) return -1;
    return idx - 1;
  }

  function getNextIndex(idx) {
    if (idx === -1) return 0;
    if (idx >= navSections.length - 1) return -1;
    return idx + 1;
  }

  function getPageByIndex(idx) {
    if (idx === null || idx === undefined) return null;
    if (idx < 0) return 'home';
    return navSections[idx] || null;
  }

  function findScrollableElement(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('chart-scroll') && el.scrollWidth > el.clientWidth) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function isScrollableAtEdge(el, direction) {
    if (!el) return true;
    const isAtStart = el.scrollLeft <= 1;
    const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    return direction === 'next' ? isAtEnd : isAtStart;
  }

  function resetSwipe() {
    if (originalNavIdx !== null && originalNavIdx !== undefined) {
      setNavActiveIndex(originalNavIdx);
      originalNavIdx = null;
      previewNavIdx = null;
    }
    if (mainEl) {
      mainEl.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
      mainEl.style.transform = '';
      setTimeout(function() {
        if (mainEl) mainEl.style.transition = '';
      }, TRANSITION_MS);
    }
    touchStartX = null;
    touchStartY = null;
    touchStartTime = null;
    swipeAxis = null;
    isSwiping = false;
    swipeMode = null;
    scrollableEl = null;
  }

  function slideOutAndNavigate(url, direction) {
    if (!mainEl) {
      window.location.href = url;
      return;
    }
    const screenWidth = window.innerWidth;
    const targetX = direction === 'next' ? -screenWidth : screenWidth;
    mainEl.style.transition = 'transform ' + SLIDE_OUT_MS + 'ms ease-in';
    mainEl.style.transform = 'translate3d(' + targetX + 'px, 0, 0)';
    setTimeout(function() {
      window.location.href = url;
    }, SLIDE_OUT_MS);
  }

  document.addEventListener('touchstart', function(e) {
    if (!e.touches || e.touches.length > 1) return;

    const t = e.target;
    if (t && t.closest && t.closest('.nav, .nav-inner, .search-dropdown, .modal-overlay, input, textarea, .ad-card, .adsbygoogle')) return;

    mainEl = document.querySelector('main.site-container');
    if (!mainEl) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    swipeAxis = null;
    isSwiping = false;
    swipeMode = null;

    originalNavIdx = getCurrentNavIndex();
    previewNavIdx = originalNavIdx;

    scrollableEl = findScrollableElement(e.target);

    const idx = getCurrentNavIndex();
    hasPrevPage = getPrevIndex(idx) !== null;
    hasNextPage = getNextIndex(idx) !== null;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (touchStartX === null || !mainEl) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchStartX - touchX;
    const diffY = touchStartY - touchY;
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    if (!swipeAxis) {
      if (absX < DIRECTION_LOCK_PX && absY < DIRECTION_LOCK_PX) return;
      if (absY > absX * DIRECTION_LOCK_RATIO) { swipeAxis = 'vertical'; return; }
      if (absX > absY * DIRECTION_LOCK_RATIO) swipeAxis = 'horizontal';
      else return;
    }

    if (swipeAxis !== 'horizontal') return;

    e.preventDefault();

    if (diffX > 0 && !hasNextPage) return;
    if (diffX < 0 && !hasPrevPage) return;

    const intendedMode = diffX > 0 ? 'next' : 'prev';

    if (!isScrollableAtEdge(scrollableEl, intendedMode)) return;

    isSwiping = true;
    swipeMode = intendedMode;

    const screenWidth = window.innerWidth;
    const maxDrag = screenWidth * MAX_DRAG_PERCENT;
    const dragAmount = Math.min(absX, maxDrag);
    const translateX = diffX > 0 ? -dragAmount : dragAmount;

    mainEl.style.transition = 'none';
    mainEl.style.transform = 'translate3d(' + translateX + 'px, 0, 0)';

  }, { passive: false });

  document.addEventListener('touchend', function() {
    if (touchStartX === null || !mainEl) return;

    if (!isSwiping) {
      resetSwipe();
      return;
    }

    const screenWidth = window.innerWidth;
    const currentTransform = mainEl.style.transform;
    const match = currentTransform.match(/translate3d\\(([\\-\\d.]+)px/);
    const currentX = match ? parseFloat(match[1]) : 0;
    const dragPercent = Math.abs(currentX) / screenWidth;

    const elapsed = Date.now() - touchStartTime;
    const velocity = elapsed > 0 ? Math.abs(currentX) / elapsed : 0;
    const isFlick = velocity >= VELOCITY_THRESHOLD && Math.abs(currentX) > 30;

    if ((dragPercent >= SWIPE_THRESHOLD || isFlick) && swipeMode) {
      const currentIdx = getCurrentNavIndex();
      const targetIdx = swipeMode === 'next' ? getNextIndex(currentIdx) : getPrevIndex(currentIdx);
      const targetPage = getPageByIndex(targetIdx);

      if (targetPage) {
        const url = targetPage === 'home' ? '/' : '/' + targetPage + '/';
        setNavActiveIndex(targetIdx);
        animateNavToIndex(targetIdx, SLIDE_OUT_MS);
        slideOutAndNavigate(url, swipeMode);
        return;
      }
    }

    resetSwipe();
    scrollNavToIndex(getCurrentNavIndex(), true);
  }, { passive: true });

  document.addEventListener('touchcancel', function() {
    resetSwipe();
    scrollNavToIndex(getCurrentNavIndex(), true);
  }, { passive: true });

  function getNavScrollPosForIndex(idx) {
    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return null;
    var navItems = navInner.querySelectorAll('.nav-item');
    var targetIdx = idx < 0 ? 0 : idx;
    var targetItem = navItems[targetIdx];
    if (!targetItem) return null;

    var itemCenter = targetItem.offsetLeft + (targetItem.offsetWidth / 2);
    var navCenter = navInner.clientWidth / 2;
    var maxScroll = navInner.scrollWidth - navInner.clientWidth;
    if (maxScroll <= 0) return 0;
    return Math.max(0, Math.min(maxScroll, itemCenter - navCenter));
  }

  function animateNavToIndex(idx, durationMs) {
    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return;

    var scrollPos = getNavScrollPosForIndex(idx);
    if (scrollPos === null || scrollPos === undefined) return;

    try {
      sessionStorage.setItem('gc_nav_scroll_state_v1', JSON.stringify({ left: scrollPos, at: Date.now() }));
    } catch (e) {}

    if (!durationMs || durationMs <= 0 || !window.requestAnimationFrame || !window.performance || !performance.now) {
      navInner.scrollLeft = scrollPos;
      return;
    }

    var start = navInner.scrollLeft || 0;
    var delta = scrollPos - start;
    if (Math.abs(delta) < 1) {
      navInner.scrollLeft = scrollPos;
      return;
    }

    var startTime = performance.now();
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function step(now) {
      var t = (now - startTime) / durationMs;
      if (t > 1) t = 1;
      navInner.scrollLeft = start + delta * easeOutCubic(t);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function scrollNavToIndex(idx, smooth) {
    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return;
    var scrollPos = getNavScrollPosForIndex(idx);
    if (scrollPos === null || scrollPos === undefined) return;

    if (smooth && navInner.scrollTo) {
      try {
        navInner.scrollTo({ left: scrollPos, behavior: 'smooth' });
        return;
      } catch (e) {}
    }
    navInner.scrollLeft = scrollPos;
  }

  // 초기 위치는 nav.js 인라인 스크립트에서 처리 (CSS visibility + nav-ready 클래스)
  // pageshow에서 bfcache 복원 시에만 재설정
  window.addEventListener('pageshow', function(e) {
    if (e && e.persisted) {
      var navInner = document.querySelector('.nav-inner');
      if (!navInner) return;
      var targetIdx = getCurrentNavIndex();
      var targetPos = getNavScrollPosForIndex(targetIdx);
      if (targetPos !== null && targetPos !== undefined) {
        navInner.style.scrollBehavior = 'auto';
        navInner.scrollLeft = targetPos;
      }
    }
  });
})();
</script>`;

// 모바일 스크롤 시 검색창 숨김 스크립트
const mobileScrollHideScript = `
<script>
(function() {
  if (window.innerWidth > 768) return;

  let lastScrollY = 0;
  let ticking = false;
  let isHidden = false;
  const showThreshold = 10;   // 위로 10px 이상 스크롤하면 표시
  const hideThreshold = 80;   // 80px 이상에서 아래로 스크롤하면 숨김

  function updateSearchVisibility() {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;

    // overscroll bounce 처리: 맨 위(0 이하)에서는 항상 표시
    if (currentScrollY <= 0) {
      if (isHidden) {
        document.body.classList.remove('search-hidden');
        isHidden = false;
      }
    }
    // 위로 스크롤 (일정량 이상)
    else if (scrollDelta < -showThreshold) {
      if (isHidden) {
        document.body.classList.remove('search-hidden');
        isHidden = false;
      }
    }
    // 아래로 스크롤 (threshold 이상 위치에서)
    else if (scrollDelta > 0 && currentScrollY > hideThreshold) {
      if (!isHidden) {
        document.body.classList.add('search-hidden');
        isHidden = true;
      }
    }

    lastScrollY = currentScrollY;
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

// 모바일 감지 및 is-mobile 클래스 추가 (반응형 통합용)
const mobileDetectScript = `
<script>
(function() {
  function updateMobileClass() {
    if (window.innerWidth <= 768) {
      document.body.classList.add('is-mobile');
    } else {
      document.body.classList.remove('is-mobile');
    }
  }
  updateMobileClass();
  window.addEventListener('resize', updateMobileClass);
})();
</script>`;

// 광고 초기화 - Intersection Observer 방식 (PC/모바일 통합: 900px)
// AdSense 로드 완료 이벤트 수신 후 Observer 시작
const adLazyLoadScript = `
<script>
(function() {
  var ads = document.querySelectorAll('.adsbygoogle');
  if (!ads.length) return;

  function initAdsObserver() {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '900px' });

    ads.forEach(function(ad) { observer.observe(ad); });
  }

  // AdSense 이미 로드됨 → 즉시 시작
  if (window.__adsenseReady) {
    initAdsObserver();
  } else {
    // AdSense 로드 완료 이벤트 대기
    window.addEventListener('adsenseReady', initAdsObserver, { once: true });
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

  var privacyLoaded = false;
  document.querySelectorAll('[data-modal-open]').forEach(function(trigger) {
    trigger.addEventListener('click', function(e) {
      var id = trigger.getAttribute('data-modal-open');
      var modal = getModal(id);
      if (!modal) return;
      e.preventDefault();
      // privacy-modal: 동적 로드 (SEO 개선 - 보일러플레이트 제거)
      if (id === 'privacy-modal' && !privacyLoaded) {
        var body = modal.querySelector('.privacy-modal-body');
        if (body) {
          fetch('/assets/privacy-content.html')
            .then(function(r) { return r.ok ? r.text() : ''; })
            .then(function(html) {
              body.innerHTML = html || '<p>내용을 불러올 수 없습니다.</p>';
              privacyLoaded = true;
              openModal(modal);
            })
            .catch(function() {
              body.innerHTML = '<p>내용을 불러올 수 없습니다.</p>';
              openModal(modal);
            });
          return;
        }
      }
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

function wrapWithLayout(content, options = {}) {
  const {
    currentPage = 'home',
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords,
    canonical = 'https://gamerscroll.com',
    pageScripts = '',
    showSearchBar = true,
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    noindex = false,  // 검색엔진 인덱싱 제외 (thin content용)
    breadcrumbs = null,  // BreadcrumbList JSON-LD
    softwareSchema = null,  // SoftwareApplication JSON-LD (게임 페이지용)
    preloadImages = null
  } = options;

  // 페이지별 데이터 스크립트
  const dataScript = pageData.news || pageData.community || pageData.youtube || pageData.chzzk ? `
  <script>
    window.allNewsData = ${pageData.news ? JSON.stringify(pageData.news) : 'null'};
    window.allCommunityData = ${pageData.community ? JSON.stringify(pageData.community) : 'null'};
    window.allYoutubeData = ${pageData.youtube ? JSON.stringify(pageData.youtube) : 'null'};
    window.allChzzkData = ${pageData.chzzk ? JSON.stringify(pageData.chzzk) : 'null'};
  </script>` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  ${generateHead({ title, description, keywords, canonical, pageData, articleSchema, noindex, breadcrumbs, softwareSchema, preloadImages })}
</head>
<body class="${currentPage ? `page-${currentPage}` : ''}${!ADS_ENABLED ? ' ads-disabled' : ''}">
  ${generateHeader()}
  ${showSearchBar ? searchBarHtml : ''}
  ${generateNav(currentPage)}
  <main class="site-container">
    ${dataScript}
    ${content}
    ${pageScripts}
  </main>
  ${generateFooter()}
  ${footerModalScript}
  ${adLazyLoadScript}
  ${imageFallbackScript}
  ${fontAndEmojiScript}
  ${mobileDetectScript}
  ${showSearchBar ? searchBarScript : ''}
  ${hoverPrefetchScript}
  ${swipeScript}
  ${mobileScrollHideScript}
</body>
</html>`;
}

/**
 * 광고 카드 생성
 * @param {string} slotId - 광고 슬롯 ID
 * @param {Object} options - { width, height, format, fullWidthResponsive }
 */
function generateAdSlot(slotId, options = {}) {
  return renderAdCard(slotId, options);
}

// 통합 반응형 광고 함수들 (PC/모바일 단일 빌드)
function generatePCAdSlot(slotId) {
  return renderResponsiveTopAd(slotId);
}

function generatePCHomeAdSlot(slotId) {
  return renderResponsiveHomeAd(slotId);
}

function generateVerticalAdSlot(slotId) {
  return renderSidebarVerticalAd(slotId);
}

function generateRectangleAdSlot(slotId) {
  return renderSidebarRectangleAd(slotId);
}

// 상단 광고용 (반응형 - PC/모바일 자동 분기)
function generateAdPairSlot(pcSlotId, mobileSlotId) {
  // 반응형: CSS 미디어 쿼리로 PC/모바일 크기 자동 분기
  return renderResponsiveTopAd(pcSlotId);
}

// 중간 광고용 (반응형)
function generateMidAdPairSlot(pcSlotId, mobileSlotId) {
  return renderContentAd(pcSlotId);
}

function generateHomeAdPairSlot(pcSlotId, mobileSlotId) {
  return renderResponsiveHomeAd(pcSlotId);
}

// 모바일 전용 중간 광고 (PC에서는 CSS로 숨김)
function generateMobileOnlyMidAdSlot(mobileSlotId) {
  return renderMobileOnlyAd(mobileSlotId);
}

// 네이티브 광고 (반응형)
function generateNativeAdSlot(slotId) {
  return renderNativeAd(slotId);
}

// 멀티플렉스 광고 (PC + 모바일 공통)
function generateMultiplexAdSlot(slotId) {
  return renderMultiplexAd(slotId);
}

/**
 * Partial 콘텐츠 생성 (레이아웃 없이 메인 콘텐츠만)
 * @param {string} content - 메인 콘텐츠 HTML
 * @param {Object} options - 옵션
 * @param {string} options.pageScripts - 페이지별 스크립트
 */
function generatePartialContent(content, options = {}) {
  const { pageScripts = '' } = options;
  // 콘텐츠 + 페이지별 스크립트만 반환 (layout shell 제외)
  return `${content}
${pageScripts}`;
}

// 통합 반응형 빌드 - PC/모바일 단일 레이아웃
module.exports = {
  wrapWithLayout,
  generatePartialContent,
  AD_SLOTS,
  generateAdSlot,
  generatePCAdSlot,
  generatePCHomeAdSlot,
  generateVerticalAdSlot,
  generateRectangleAdSlot,
  generateAdPairSlot,
  generateMidAdPairSlot,
  generateHomeAdPairSlot,
  generateMobileOnlyMidAdSlot,
  generateNativeAdSlot,
  generateMultiplexAdSlot
};
