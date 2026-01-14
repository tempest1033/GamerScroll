/**
 * 모바일 전용 레이아웃
 * m.gamerscrawl.com에서 사용
 */

const { generateHead, SHOW_ADS } = require('./components/head');
const {
  renderMobileAd,
  renderMobileTopAd,
  renderMobileMidAd
} = require('./components/ads-mobile');
const { generateHeader } = require('./components/header');
const { generateNav } = require('./components/nav');
const { generateFooter } = require('./components/footer');

const AD_SLOTS = {
  // 모바일용 (320x150, 300x250)
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
  Mobile005: '3028357040'
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
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-container')) searchDropdown.classList.remove('active'); });
  searchDropdown.addEventListener('mousedown', (e) => e.preventDefault());

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

// 스와이프 스크립트 (좌/우 스와이프 시 페이지 이동, 드래그 중 최대 15% 이동)
const swipeScript = `
<script>
(function() {
  const navSections = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic'];

  const SWIPE_THRESHOLD = 0.15; // 15% 넘으면 페이지 이동
  const MAX_DRAG_PERCENT = 0.15; // 최대 15%까지 화면 이동
  const TRANSITION_MS = 150;
  const SLIDE_OUT_MS = 100; // 슬라이드 아웃 애니메이션 시간
  const DIRECTION_LOCK_PX = 10;
  const DIRECTION_LOCK_RATIO = 1.2;
  const AD_SWIPE_MIN_PX = 30; // 광고 위에서는 30px 이상 이동해야 스와이프 시작

  let touchStartX = null;
  let touchStartY = null;
  let swipeAxis = null;
  let isSwiping = false;
  let swipeMode = null;
  let hasPrevPage = false;
  let hasNextPage = false;
  let scrollableEl = null;
  let mainEl = null;
  let isOnAd = false; // 광고 위에서 시작했는지

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    for (let i = 0; i < navSections.length; i++) {
      if (path.includes(navSections[i])) return i;
    }
    return -1;
  }

  function getPrevIndex(idx) {
    if (idx === -1) return null;
    if (idx === 0) return -1;
    return idx - 1;
  }

  function getNextIndex(idx) {
    if (idx === -1) return 0;
    if (idx >= navSections.length - 1) return null;
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
    if (mainEl) {
      mainEl.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
      mainEl.style.transform = '';
      setTimeout(function() {
        if (mainEl) mainEl.style.transition = '';
      }, TRANSITION_MS);
    }
    touchStartX = null;
    touchStartY = null;
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
    }, SLIDE_OUT_MS - 50);
  }

  // 터치 시작
  document.addEventListener('touchstart', function(e) {
    if (!e.touches || e.touches.length > 1) return;

    const t = e.target;
    // nav 영역, 검색 드롭다운, 모달, 입력 필드 제외
    if (t && t.closest && t.closest('.nav, .nav-inner, .search-dropdown, .modal-overlay, input, textarea')) return;

    mainEl = document.querySelector('main.site-container');
    if (!mainEl) return;

    // 광고 위에서 시작했는지 체크
    isOnAd = !!(t && t.closest && t.closest('.adsbygoogle, ins'));

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swipeAxis = null;
    isSwiping = false;
    swipeMode = null;

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

    // 광고 위에서 시작한 경우, 충분히 이동해야 스와이프 시작 (탭은 클릭으로 통과)
    if (isOnAd && absX < AD_SWIPE_MIN_PX) return;

    // 경계 체크
    if (diffX > 0 && !hasNextPage) return;
    if (diffX < 0 && !hasPrevPage) return;

    const intendedMode = diffX > 0 ? 'next' : 'prev';

    // 가로 스크롤 영역이면 끝/처음이 아니면 스와이프 금지
    if (!isScrollableAtEdge(scrollableEl, intendedMode)) return;

    e.preventDefault();
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

    if (dragPercent >= SWIPE_THRESHOLD && swipeMode) {
      // 페이지 이동 (슬라이드 아웃 애니메이션)
      const currentIdx = getCurrentNavIndex();
      const targetIdx = swipeMode === 'next' ? getNextIndex(currentIdx) : getPrevIndex(currentIdx);
      const targetPage = getPageByIndex(targetIdx);

      if (targetPage) {
        const url = targetPage === 'home' ? '/' : '/' + targetPage + '/';
        slideOutAndNavigate(url, swipeMode);
        return;
      }
    }

    // threshold 미달 - 원위치
    resetSwipe();
  }, { passive: true });

  document.addEventListener('touchcancel', function() {
    resetSwipe();
  }, { passive: true });
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

// 모바일: js-defer로 인해 전체가 숨겨지는 케이스 방지 (레이아웃 모바일에는 defer 해제 스크립트가 없을 수 있음)
const mobileDeferReleaseScript = `
<script>
(function() {
  var html = document.documentElement;
  if (!html || !html.classList.contains('js-defer')) return;

  function release() {
    try { html.classList.remove('js-defer'); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', release, { once: true });
  } else {
    release();
  }

  // 폴백: 어떤 이유로든 DOMContentLoaded가 늦거나 누락되면 강제 해제
  setTimeout(release, 1500);

  // bfcache 복귀 케이스
  window.addEventListener('pageshow', function(e) {
    if (e && e.persisted) release();
  });
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

// 모바일 광고 초기화 (슬롯당 1회 push, AdSense 로드 대기)
const mobileAdInitScript = `
<script>
(function() {
  var RETRY_INTERVAL = 1500;
  var MAX_RETRIES = 5;
  var ADSENSE_WAIT_MS = 100;
  var ADSENSE_MAX_WAIT = 5000;

  // AdSense 로드 대기
  function waitForAdsense(callback) {
    if (window.__gcAdsenseLoaded === '1' || window.adsbygoogle) {
      callback();
      return;
    }
    if (window.__gcAdsenseFailed === '1') return;

    var waited = 0;
    var check = setInterval(function() {
      waited += ADSENSE_WAIT_MS;
      if (window.__gcAdsenseLoaded === '1' || window.adsbygoogle) {
        clearInterval(check);
        callback();
      } else if (waited >= ADSENSE_MAX_WAIT || window.__gcAdsenseFailed === '1') {
        clearInterval(check);
      }
    }, ADSENSE_WAIT_MS);
  }

  // 요소가 보이는 상태인지 체크
  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function safePush(ad) {
    if (!ad || ad.getAttribute('data-gc-ad-pushed') === '1') return;
    if (!isVisible(ad)) return;
    ad.setAttribute('data-gc-ad-pushed', '1');
    try {
      (adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {}
  }

  function initAds(scope) {
    var root = scope || document;
    var ads;
    try {
      ads = root.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status]):not([data-gc-ad-pushed])');
    } catch (e) {
      return;
    }

    for (var i = 0; i < ads.length; i++) {
      safePush(ads[i]);
    }
  }

  function retryInit(retryCount) {
    if (retryCount >= MAX_RETRIES) return;
    setTimeout(function() {
      var pending;
      try {
        pending = document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status]):not([data-gc-ad-pushed])');
      } catch (e) {
        pending = null;
      }
      if (pending && pending.length > 0) {
        initAds();
        retryInit(retryCount + 1);
      }
    }, RETRY_INTERVAL);
  }

  function startAdInit() {
    waitForAdsense(function() {
      initAds();
      retryInit(0);
    });
  }

  // 광고 초기화 함수 (외부 호출용)
  window.__gcInitAds = function(scope) {
    waitForAdsense(function() { initAds(scope); });
  };
  window.__gcRefreshAds = window.__gcInitAds;

  // js-defer 해제 후 초기화 (숨김 상태에서 push 방지)
  function onDeferReleased() {
    setTimeout(startAdInit, 50);
  }

  // js-defer 해제 감지
  if (document.documentElement.classList.contains('js-defer')) {
    var observer = new MutationObserver(function(mutations) {
      if (!document.documentElement.classList.contains('js-defer')) {
        observer.disconnect();
        onDeferReleased();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // 폴백: 3초 후에도 해제 안 되면 강제 시작
    setTimeout(function() {
      observer.disconnect();
      startAdInit();
    }, 3000);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startAdInit);
    } else {
      startAdInit();
    }
  }

  window.addEventListener('load', function() {
    setTimeout(function() { window.__gcInitAds(); }, 300);
  });

  // bfcache 복귀 시
  window.addEventListener('pageshow', function(e) {
    if (e && e.persisted) setTimeout(function() { window.__gcInitAds(); }, 150);
  });
})();
</script>
`;

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

  // canonical URL을 m. 도메인으로 변경
  const mobileCanonical = canonical.replace('https://gamerscrawl.com', 'https://m.gamerscrawl.com');

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
  ${generateHead({ title, description, keywords, canonical: mobileCanonical, pageData, articleSchema, noindex })}
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
</head>
<body class="${currentPage ? `page-${currentPage}` : ''} is-mobile">
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
  ${imageFallbackScript}
  ${fontAndEmojiScript}
  ${mobileDeferReleaseScript}
  ${showSearchBar ? searchBarScript : ''}
  ${swipeScript}
  ${mobileScrollHideScript}
  ${mobileAdInitScript}
</body>
</html>`;
}

// 광고 슬롯 생성 함수
function generateAdSlot(slotId, options = {}) {
  if (!SHOW_ADS) return '';
  return renderMobileAd(slotId);
}

function generateMobileAdSlot(slotId) {
  if (!SHOW_ADS) return '';
  return renderMobileAd(slotId);
}

function generateMobileTopAdSlot(slotId) {
  if (!SHOW_ADS) return '';
  return renderMobileTopAd(slotId);
}

function generateMobileMidAdSlot(slotId) {
  if (!SHOW_ADS) return '';
  return renderMobileMidAd(slotId);
}

// PC 광고는 모바일에서 빈 문자열 반환
function generatePCAdSlot() { return ''; }
function generatePCHomeAdSlot() { return ''; }
function generateVerticalAdSlot() { return ''; }
function generateRectangleAdSlot() { return ''; }
function generateResponsiveAdPairSlot(mobileSlotId) {
  if (!SHOW_ADS) return '';
  return renderMobileTopAd(mobileSlotId);
}

// PC/모바일 페어 함수 (모바일에서는 모바일 광고만 렌더링)
function generateAdPairSlot(pcSlotId, mobileSlotId) {
  if (!SHOW_ADS) return '';
  return renderMobileTopAd(mobileSlotId);
}

function generateMidAdPairSlot(pcSlotId, mobileSlotId) {
  if (!SHOW_ADS) return '';
  return renderMobileMidAd(mobileSlotId);
}

function generateHomeAdPairSlot(pcSlotId, mobileSlotId) {
  if (!SHOW_ADS) return '';
  return renderMobileTopAd(mobileSlotId);
}

function generateMobileOnlyMidAdSlot(mobileSlotId) {
  if (!SHOW_ADS) return '';
  return renderMobileMidAd(mobileSlotId);
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
  SHOW_ADS,
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
  generateMobileOnlyMidAdSlot
};
