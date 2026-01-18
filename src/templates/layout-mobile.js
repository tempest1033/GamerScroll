/**
 * 모바일 전용 레이아웃
 * m.gamerscrawl.com에서 사용
 */

const { generateHead } = require('./components/head');
const {
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd,
  renderNativeAd
} = require('./components/ads-mobile');
const { generateHeader } = require('./components/header');
const { generateNav } = require('./components/nav');
const { generateFooter } = require('./components/footer');

const AD_SLOTS = {
  // 모바일용 (300x100, 300x250)
  Responsive001: '5825162341',
  Responsive002: '4840966314',
  Responsive003: '7467129651',
  Responsive004: '7865094213',
  Responsive005: '3028357040',
  // 호환용 (PC 템플릿에서 Mobile001 등으로 참조)
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
  Article005: '8232645901'
};

// 상단 검색바
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

// 검색 스크립트 (layout.js에서 복사)
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

  function getRecentSearches() {
    try { return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY)) || []; }
    catch { return []; }
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
      try {
        const cached = sessionStorage.getItem(SEARCH_INDEX_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          gamesData = Array.isArray(parsed) ? parsed : (parsed.games || []);
          gamesDataLoaded = true;
          return;
        }
      } catch {}
      try {
        const response = await fetch(SEARCH_INDEX_URL);
        if (!response.ok) return;
        const data = await response.json();
        gamesData = Array.isArray(data) ? data : (data.games || []);
        try { sessionStorage.setItem(SEARCH_INDEX_CACHE_KEY, JSON.stringify(gamesData)); } catch {}
      } catch (e) {
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

  function renderRecentSearches() {
    const recent = getRecentSearches();
    if (recent.length === 0) {
      searchDropdown.innerHTML = '<div class="search-no-results">최근 본 게임이 없습니다</div>';
    } else {
      const header = '<div class="search-recent-header"><span class="search-recent-title">최근 본 게임</span><button class="search-clear-all" type="button">전체 삭제</button></div>';
      const items = recent.map(game => {
        return '<div class="search-result-item" data-slug="' + game.slug + '" data-href="/games/' + game.slug + '/"><a href="/games/' + game.slug + '/" class="search-result-info"><div class="search-result-title">' + game.name + '</div></a><button class="search-result-delete" type="button" data-slug="' + game.slug + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
      }).join('');
      searchDropdown.innerHTML = header + items;
      const clearAllBtn = searchDropdown.querySelector('.search-clear-all');
      if (clearAllBtn) clearAllBtn.addEventListener('click', (e) => { e.stopPropagation(); clearAllRecent(); renderRecentSearches(); });
      searchDropdown.querySelectorAll('.search-result-delete').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); removeRecentSearch(btn.dataset.slug); renderRecentSearches(); });
      });
      // 최근 본 게임 클릭 시 페이지 이동
      searchDropdown.querySelectorAll('.search-result-item[data-href]').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.search-result-delete')) return;
          e.preventDefault();
          const href = item.dataset.href;
          searchDropdown.classList.remove('active');
          searchInput.blur();
          window.location.href = href;
        });
      });
    }
    searchDropdown.classList.add('active');
  }

  let currentResults = [];

  function performSearch(query) {
    if (!query || query.length < 1) { currentResults = []; renderRecentSearches(); return; }
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
      return name.includes(lowerQuery) || developer.includes(lowerQuery) || aliases.some(a => (a || '').toLowerCase().includes(lowerQuery));
    }).slice(0, 10);

    if (currentResults.length === 0) {
      searchDropdown.innerHTML = '<div class="search-no-results">검색 결과가 없습니다</div>';
    } else {
      searchDropdown.innerHTML = currentResults.map(game => {
        const name = game.name || game.title || '';
        const slug = game.slug || game.id || '';
        return '<a href="/games/' + slug + '/" class="search-result-item" data-game=\\'' + JSON.stringify({slug, name}).replace(/'/g, "\\\\'") + '\\'><div class="search-result-info"><div class="search-result-title">' + name + '</div></div></a>';
      }).join('');
      // 검색 결과 클릭 시 페이지 이동
      searchDropdown.querySelectorAll('.search-result-item[data-game]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          try { saveRecentSearch(JSON.parse(item.dataset.game)); } catch {}
          const href = item.getAttribute('href');
          searchDropdown.classList.remove('active');
          searchInput.blur();
          window.location.href = href;
        });
      });
    }
    searchDropdown.classList.add('active');
  }

  let debounceTimer;
  const debouncedSearch = (func, delay) => (...args) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => func(...args), delay); };
  const search = debouncedSearch(performSearch, 200);

  searchInput.addEventListener('input', (e) => search(e.target.value.trim()));
  searchInput.addEventListener('focus', () => { loadGamesDataOnce(); if (!searchInput.value.trim()) renderRecentSearches(); else performSearch(searchInput.value.trim()); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-container') && !e.target.closest('.nav-search-btn')) searchDropdown.classList.remove('active'); });
  searchDropdown.addEventListener('mousedown', (e) => e.preventDefault());

  // nav 검색 버튼 클릭 시 검색 드롭다운 열기
  const navSearchBtn = document.querySelector('.nav-search-btn');
  if (navSearchBtn) {
    navSearchBtn.addEventListener('click', () => {
      searchInput.focus();
      loadGamesDataOnce();
      renderRecentSearches();
    });
  }

  function doSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    var searchUrl = '/games/?q=' + encodeURIComponent(query);
    window.location.href = searchUrl;
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchDropdown.classList.remove('active'); searchInput.blur(); }
    else if (e.key === 'Enter') { doSearch(); }
  });

  const searchBtn = document.querySelector('.search-btn');
  if (searchBtn) searchBtn.addEventListener('click', doSearch);
})();
</script>`;

// 네비 캐러셀 상태 저장/복원 (페이지 전환 시 원점 점프 방지)
const navCarouselStateScript = `
<script>
(function() {
  var KEY = 'gc_nav_scroll_state_v1';
  var MAX_AGE_MS = 60000;

  function save() {
    try {
      var overrideLeft = window.__gcNavScrollOverrideLeft;
      var overrideAt = window.__gcNavScrollOverrideAt;
      if (typeof overrideLeft === 'number' && isFinite(overrideLeft)) {
        sessionStorage.setItem(KEY, JSON.stringify({ left: overrideLeft, at: overrideAt || Date.now() }));
        window.__gcNavScrollOverrideLeft = null;
        window.__gcNavScrollOverrideAt = null;
        return;
      }

      var navInner = document.querySelector('.nav-inner');
      if (!navInner) return;
      var state = { left: navInner.scrollLeft || 0, at: Date.now() };
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      var state = null;
      try { state = JSON.parse(raw); } catch (e) { return; }
      if (!state) return;

      var at = parseInt(state.at, 10) || 0;
      if (at && (Date.now() - at) > MAX_AGE_MS) {
        try { sessionStorage.removeItem(KEY); } catch (e) {}
        return;
      }

      var left = parseFloat(state.left);
      if (!isFinite(left)) left = 0;

      var navInner = document.querySelector('.nav-inner');
      if (!navInner) return;
      navInner.scrollLeft = left;
      window.__gcNavScrollRestored = '1';
      window.__gcNavPrevScrollLeft = left;
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    } catch (e) {}
  }

  // nav 렌더 직후 즉시 복원
  restore();

  // nav 클릭/페이지 이탈 시 상태 저장
  document.addEventListener('click', function(e) {
    var link = e.target && e.target.closest ? e.target.closest('a.nav-item') : null;
    if (!link) return;
    save();
  }, true);
  window.addEventListener('pagehide', save);
})();
</script>`;

// 스와이프 스크립트 (좌/우 스와이프 시 페이지 이동, 드래그 중 최대 15% 이동)
const swipeScript = `
<script>
(function() {
  const navSections = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic'];

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
  let touchStartTime = null; // 속도 계산용
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
    if (idx === -1) return navSections.length - 1; // 홈 → 마지막 섹션 (순환)
    if (idx === 0) return -1;
    return idx - 1;
  }

  function getNextIndex(idx) {
    if (idx === -1) return 0;
    if (idx >= navSections.length - 1) return -1; // 마지막 → 홈 (순환)
    return idx + 1;
  }

  function getPageByIndex(idx) {
    if (idx === null || idx === undefined) return null;
    if (idx < 0) return 'home';
    return navSections[idx] || null;
  }

  // 스크롤 가능한 요소(가로 스크롤) 찾기
  function findScrollableElement(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('chart-scroll') && el.scrollWidth > el.clientWidth) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // 가로 스크롤 요소면 끝/처음에서만 페이지 스와이프 허용
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
    isOnAd = false;
  }

  // 슬라이드 아웃 후 페이지 이동
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

  // 터치 시작
  document.addEventListener('touchstart', function(e) {
    if (!e.touches || e.touches.length > 1) return;

    const t = e.target;
    // nav 영역, 검색 드롭다운, 모달, 입력 필드, 광고 제외
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

  // 터치 이동
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

    // 가로 스와이프 확정 시 상하 스크롤 차단
    e.preventDefault();

    // 경계 체크
    if (diffX > 0 && !hasNextPage) return;
    if (diffX < 0 && !hasPrevPage) return;

    const intendedMode = diffX > 0 ? 'next' : 'prev';

    // 가로 스크롤 영역이면 끝/처음이 아니면 스와이프 금지
    if (!isScrollableAtEdge(scrollableEl, intendedMode)) return;

    isSwiping = true;
    swipeMode = intendedMode;

    // 최대 15%까지만 이동
    const screenWidth = window.innerWidth;
    const maxDrag = screenWidth * MAX_DRAG_PERCENT;
    const dragAmount = Math.min(absX, maxDrag);
    const translateX = diffX > 0 ? -dragAmount : dragAmount;

    mainEl.style.transition = 'none';
    mainEl.style.transform = 'translate3d(' + translateX + 'px, 0, 0)';

  }, { passive: false });

  // 터치 종료
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

    // 속도 계산 (px/ms)
    const elapsed = Date.now() - touchStartTime;
    const velocity = elapsed > 0 ? Math.abs(currentX) / elapsed : 0;
    const isFlick = velocity >= VELOCITY_THRESHOLD && Math.abs(currentX) > 30; // 30px 이상 + 빠른 속도

    if ((dragPercent >= SWIPE_THRESHOLD || isFlick) && swipeMode) {
      // 페이지 이동 (슬라이드 아웃 애니메이션)
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

    // threshold 미달 - 원위치
    resetSwipe();
    // 네비게이션도 현재 탭으로 복귀
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

    window.__gcNavScrollOverrideLeft = scrollPos;
    window.__gcNavScrollOverrideAt = Date.now();
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

  // 네비 캐러셀: 특정 인덱스로 스크롤 (-1: 홈, 0~: 섹션)
  // nav에는 홈이 없음 (trend=0, games=1, ... metacritic=6)
  // 1,2번 → 왼쪽 끝, 3,4,5번 → 가운데, 6,7번 → 오른쪽 끝
  function scrollNavToIndex(idx, smooth) {
    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return;
    var navItems = navInner.querySelectorAll('.nav-item');
    var targetIdx = idx < 0 ? 0 : idx;
    var targetItem = navItems[targetIdx];
    if (!targetItem) return;

    // 아이템 중심을 nav 중심에 맞추기
    var itemCenter = targetItem.offsetLeft + (targetItem.offsetWidth / 2);
    var navCenter = navInner.clientWidth / 2;
    var maxScroll = navInner.scrollWidth - navInner.clientWidth;
    if (maxScroll <= 0) return;
    var scrollPos = Math.max(0, Math.min(maxScroll, itemCenter - navCenter));

    if (smooth && navInner.scrollTo) {
      try {
        navInner.scrollTo({ left: scrollPos, behavior: 'smooth' });
        return;
      } catch (e) {}
    }
    navInner.scrollLeft = scrollPos;
  }

  // 활성 탭으로 스크롤 (초기 로드는 애니메이션 없이)
  function scrollNavToActive(smooth) {
    scrollNavToIndex(getCurrentNavIndex(), !!smooth);
  }

  // 초기 로드 시 레이아웃/스타일 적용 전에는 값이 0으로 튈 수 있어 재시도
  function initNavCarousel(attempt) {
    attempt = attempt || 0;
    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return;

    if ((navInner.clientWidth <= 0 || navInner.scrollWidth <= navInner.clientWidth + 1) && attempt < 60) {
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function() { initNavCarousel(attempt + 1); });
      } else {
        setTimeout(function() { initNavCarousel(attempt + 1); }, 16);
      }
      return;
    }

    var prevLeft = window.__gcNavPrevScrollLeft;
    if (typeof prevLeft === 'number' && isFinite(prevLeft)) {
      try { navInner.scrollLeft = prevLeft; } catch (e) {}
    }

    var shouldSmooth = window.__gcNavScrollRestored === '1';
    scrollNavToActive(shouldSmooth);
    window.__gcNavScrollRestored = '';
    window.__gcNavPrevScrollLeft = null;
  }

  initNavCarousel(0);
  window.addEventListener('pageshow', function(e) {
    if (e && e.persisted) initNavCarousel(0);
  });
})();
</script>`;
// 스크롤 시 검색창 숨김
const mobileScrollHideScript = `
<script>
(function() {
  let lastScrollY = 0, isHidden = false;
  function update() {
    const currentScrollY = window.scrollY;
    const delta = currentScrollY - lastScrollY;
    if (currentScrollY <= 0) { if (isHidden) { document.body.classList.remove('search-hidden'); isHidden = false; } }
    else if (delta < -10) { if (isHidden) { document.body.classList.remove('search-hidden'); isHidden = false; } }
    else if (delta > 0 && currentScrollY > 80) { if (!isHidden) { document.body.classList.add('search-hidden'); isHidden = true; } }
    lastScrollY = currentScrollY;
  }
  window.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
})();
</script>`;

// 폰트 + 이모지
const fontAndEmojiScript = `
<script>
(function() {
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
  else setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
  function parseTwemoji() {
    if (window.__gcTwemojiParsed || typeof twemoji === 'undefined') return;
    twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    window.__gcTwemojiParsed = '1';
  }
  parseTwemoji();
  window.addEventListener('load', parseTwemoji);
})();
</script>`;

// 이미지 폴백
const imageFallbackScript = `
<script>
(function() {
  function applyFallback(img) {
    if (!img || img.tagName !== 'IMG' || img.dataset.gcFallback === '1') return;
    img.dataset.gcFallback = '1';
    const action = img.dataset.imgFallback || '';
    if (action === 'hide') img.style.display = 'none';
    else if (action === 'parent-hide' && img.parentElement) img.parentElement.style.display = 'none';
  }
  document.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') applyFallback(e.target); }, true);
})();
</script>`;

// 광고 로딩 - Google 표준 방식 (인라인 push 사용, 별도 스크립트 불필요)
const adLazyLoadScript = ``;

// Footer 모달
const footerModalScript = `
<script>
(function() {
  function openModal(modal) { if (modal) { modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); } }
  function closeModal(modal) { if (modal) { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); } }
  document.querySelectorAll('[data-modal-open]').forEach(t => t.addEventListener('click', (e) => { e.preventDefault(); openModal(document.getElementById(t.getAttribute('data-modal-open'))); }));
  document.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); closeModal(document.getElementById(b.getAttribute('data-modal-close')) || b.closest('.modal-overlay')); }));
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = document.querySelector('.modal-overlay.is-open'); if (m) closeModal(m); } });
})();
</script>`;

/**
 * 모바일 페이지 레이아웃
 */
function wrapWithLayout(content, options = {}) {
  const {
    currentPage = 'home',
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords,
    canonical = 'https://m.gamerscrawl.com',
    pageScripts = '',
    showSearchBar = true,
    pageData = {},
    articleSchema = null,
    noindex = false
  } = options;

  // canonical URL을 PC 도메인으로 정규화
  const desktopCanonical = canonical.replace('https://m.gamerscrawl.com', 'https://gamerscrawl.com');

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
  ${generateHead({ title, description, keywords, canonical: desktopCanonical, pageData, articleSchema, noindex })}
</head>
<body class="${currentPage ? `page-${currentPage}` : ''} is-mobile">
  ${generateHeader()}
  ${showSearchBar ? searchBarHtml : ''}
  ${generateNav(currentPage)}
  ${navCarouselStateScript}
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
  ${showSearchBar ? searchBarScript : ''}
  ${swipeScript}
  ${mobileScrollHideScript}
</body>
</html>`;
}

// 광고 슬롯 생성 함수
function generateAdSlot(slotId, options = {}) {
  return renderMobileAd(slotId);
}

function generateMobileAdSlot(slotId) {
  return renderMobileAd(slotId);
}

function generateMobileTopAdSlot(slotId) {
  return renderMobileTopAd(slotId);
}

function generateMobileMidAdSlot(slotId) {
  return renderMobileMidAd(slotId);
}

// PC 광고는 모바일에서 빈 문자열 반환
function generatePCAdSlot() { return ''; }
function generatePCHomeAdSlot() { return ''; }
function generateVerticalAdSlot() { return ''; }
function generateRectangleAdSlot() { return ''; }
function generateResponsiveAdPairSlot(mobileSlotId) {
  return renderMobileTopAd(mobileSlotId);
}

// PC/모바일 페어 함수 (모바일에서는 모바일 광고만 렌더링)
function generateAdPairSlot(pcSlotId, mobileSlotId) {
  return renderMobileTopAd(mobileSlotId);
}

function generateMidAdPairSlot(pcSlotId, mobileSlotId) {
  return renderMobileMidAd(mobileSlotId);
}

function generateHomeAdPairSlot(pcSlotId, mobileSlotId) {
  return renderMobileTopAd(mobileSlotId);
}

function generateMobileOnlyMidAdSlot(mobileSlotId) {
  return renderMobileMidAd(mobileSlotId);
}

function generateNativeAdSlot(slotId) {
  return renderNativeAd(slotId);
}

/**
 * Partial 콘텐츠 생성 (레이아웃 없이 메인 콘텐츠만)
 */
function generatePartialContent(content, options = {}) {
  const { pageScripts = '' } = options;
  return `${content}
${pageScripts}`;
}

module.exports = {
  wrapWithLayout,
  generatePartialContent,
  AD_SLOTS,
  generateAdSlot,
  generateMobileAdSlot,
  generateMobileTopAdSlot,
  generateMobileMidAdSlot,
  generatePCAdSlot,
  generatePCHomeAdSlot,
  generateResponsiveAdPairSlot,
  generateVerticalAdSlot,
  generateRectangleAdSlot,
  generateAdPairSlot,
  generateMidAdPairSlot,
  generateHomeAdPairSlot,
  generateMobileOnlyMidAdSlot,
  generateNativeAdSlot
};
