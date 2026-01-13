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
const { spaRouterScript, spaTransitionCss } = require('../scripts/spa-router');

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
      // 최근 본 게임 클릭 시 SPA 이동
      searchDropdown.querySelectorAll('.search-result-item[data-href]').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.search-result-delete')) return;
          e.preventDefault();
          const href = item.dataset.href;
          searchDropdown.classList.remove('active');
          searchInput.blur();
          if (window.spaNavigateTo) {
            history.pushState({}, '', href);
            window.spaNavigateTo('games', { pushState: false });
          } else {
            window.location.href = href;
          }
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
      // 검색 결과 클릭 시 SPA 이동
      searchDropdown.querySelectorAll('.search-result-item[data-game]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          try { saveRecentSearch(JSON.parse(item.dataset.game)); } catch {}
          const href = item.getAttribute('href');
          searchDropdown.classList.remove('active');
          searchInput.blur();
          if (window.spaNavigateTo) {
            history.pushState({}, '', href);
            window.spaNavigateTo('games', { pushState: false });
          } else {
            window.location.href = href;
          }
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
    if (window.spaNavigateTo) {
      history.pushState({}, '', searchUrl);
      window.spaNavigateTo('games', { pushState: false });
    } else {
      window.location.href = searchUrl;
    }
    searchDropdown.classList.remove('active');
    searchInput.blur();
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchDropdown.classList.remove('active'); searchInput.blur(); }
    else if (e.key === 'Enter') { doSearch(); }
  });

  const searchBtn = document.querySelector('.search-btn');
  if (searchBtn) searchBtn.addEventListener('click', doSearch);
})();
</script>`;

// 스와이프 스크립트 (15% 도달 시 즉시 이동, 미만이면 취소)
const swipeScript = `
<script>
(function() {
  const navSections = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic'];
  const MAX_DRAG_PERCENT = 0.15;
  const TRANSITION_MS = 120;
  const DIRECTION_LOCK_PX = 8;

  let touchStartX = null, touchStartY = null;
  let currentX = 0;
  let isSwiping = false;
  let swipeDirection = null;
  let hasPrevPage = false, hasNextPage = false;
  let screenWidth = window.innerWidth;
  let navigated = false;

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    for (let i = 0; i < navSections.length; i++) {
      if (path.includes(navSections[i])) return i;
    }
    return -1;
  }

  function getTargetPage(index) {
    if (index < -1) index = navSections.length - 1;
    if (index >= navSections.length) index = -1;
    return index < 0 ? 'home' : navSections[index];
  }

  function resetSwipe() {
    const main = document.querySelector('main.site-container');
    if (main) {
      main.style.transform = '';
      main.style.transition = '';
    }
    document.body.classList.remove('is-swiping');
    isSwiping = false;
    swipeDirection = null;
    currentX = 0;
    navigated = false;
  }

  function doNavigate(direction) {
    if (navigated) return;
    navigated = true;

    const idx = getCurrentNavIndex();
    const targetIndex = direction > 0 ? idx + 1 : idx - 1;
    const targetPage = getTargetPage(targetIndex);

    resetSwipe();
    if (window.spaNavigateTo) {
      window.spaNavigateTo(targetPage);
    }
  }

  // 터치 시작
  document.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) return;
    if (navigated) return;
    const t = e.target;
    if (t && t.closest && t.closest('.search-dropdown, .modal-overlay, input, textarea')) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    currentX = 0;
    swipeDirection = null;
    screenWidth = window.innerWidth;

    const idx = getCurrentNavIndex();
    hasPrevPage = idx > 0;
    hasNextPage = idx < navSections.length - 1;
    if (idx === -1) { hasPrevPage = false; hasNextPage = true; }
    if (idx === 0) hasPrevPage = true;
  }, { passive: true });

  // 터치 이동
  document.addEventListener('touchmove', function(e) {
    if (touchStartX === null || navigated) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchStartX - touchX;
    const diffY = touchStartY - touchY;

    if (!swipeDirection) {
      if (Math.abs(diffX) < DIRECTION_LOCK_PX && Math.abs(diffY) < DIRECTION_LOCK_PX) return;
      if (Math.abs(diffY) > Math.abs(diffX) + 5) { swipeDirection = 'vertical'; return; }
      swipeDirection = 'horizontal';
    }

    if (swipeDirection !== 'horizontal') return;

    // 경계 체크
    if (diffX > 0 && !hasNextPage) return;
    if (diffX < 0 && !hasPrevPage) return;

    e.preventDefault();

    if (!isSwiping) {
      isSwiping = true;
      document.body.classList.add('is-swiping');
    }

    // 최대 15%로 제한
    const maxDrag = screenWidth * MAX_DRAG_PERCENT;
    currentX = Math.max(-maxDrag, Math.min(maxDrag, diffX));

    const main = document.querySelector('main.site-container');
    if (main) {
      main.style.transform = 'translateX(' + (-currentX) + 'px)';
    }

    // 15% 도달 시 즉시 이동
    if (Math.abs(currentX) >= maxDrag - 1) {
      doNavigate(currentX);
    }
  }, { passive: false });

  // 터치 종료
  document.addEventListener('touchend', function() {
    if (navigated) {
      touchStartX = null;
      touchStartY = null;
      return;
    }

    if (!isSwiping) {
      touchStartX = null;
      touchStartY = null;
      return;
    }

    // 15% 미만이면 취소 - 원위치
    const main = document.querySelector('main.site-container');
    if (main) {
      main.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
      main.style.transform = 'translateX(0)';
      setTimeout(resetSwipe, TRANSITION_MS);
    }

    touchStartX = null;
    touchStartY = null;
  }, { passive: true });

  document.addEventListener('touchcancel', function() {
    resetSwipe();
    touchStartX = null;
    touchStartY = null;
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

// 모바일 광고 초기화 (단순화 버전)
const mobileAdInitScript = `
<script>
(function() {
  var RETRY_INTERVAL = 1500;
  var MAX_RETRIES = 5;
  var adsenseReady = false;
  var pendingInits = [];

  // AdSense 스크립트 로드 감지
  function checkAdsenseReady() {
    // adsbygoogle.loaded 또는 adsbygoogle.push가 함수인지 체크
    if (window.adsbygoogle && typeof window.adsbygoogle.push === 'function') {
      adsenseReady = true;
      return true;
    }
    return false;
  }

  // 광고 초기화 함수 (scope 내 모든 미초기화 광고에 push)
  function initAds(scope) {
    var root = scope || document;
    var ads = root.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])');
    if (ads.length === 0) return;

    // AdSense가 아직 로드 안 됐으면 큐에 저장
    if (!checkAdsenseReady()) {
      pendingInits.push(scope);
      return;
    }

    for (var i = 0; i < ads.length; i++) {
      try {
        (adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}
    }
  }

  // 광고 영역 새로 생성 (SPA/스와이프 전환용 - innerHTML 교체 시에만 사용)
  function refreshAds(scope) {
    var root = scope || document;
    var ads = root.querySelectorAll('ins.adsbygoogle');
    ads.forEach(function(ad) {
      // 이미 로드된 광고는 새 요소로 교체
      if (ad.hasAttribute('data-adsbygoogle-status') || ad.querySelector('iframe')) {
        var newIns = document.createElement('ins');
        newIns.className = ad.className;
        newIns.style.cssText = ad.style.cssText;
        if (ad.getAttribute('data-ad-client')) newIns.setAttribute('data-ad-client', ad.getAttribute('data-ad-client'));
        if (ad.getAttribute('data-ad-slot')) newIns.setAttribute('data-ad-slot', ad.getAttribute('data-ad-slot'));
        ad.parentNode.replaceChild(newIns, ad);
      }
    });
    setTimeout(function() { initAds(root); }, 50);
  }

  // 대기 중인 광고 초기화 처리
  function processPendingInits() {
    if (!checkAdsenseReady()) return;
    var scopes = pendingInits.slice();
    pendingInits = [];
    scopes.forEach(function(scope) {
      initAds(scope);
    });
    // 전체 문서도 한 번 체크
    initAds(document);
  }

  // 재시도 로직 (초기 로드 실패 대비)
  function retryInit(retryCount) {
    if (retryCount >= MAX_RETRIES) return;
    setTimeout(function() {
      // AdSense 로드 체크
      if (checkAdsenseReady()) {
        processPendingInits();
      }
      var pending = document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])');
      if (pending.length > 0) {
        initAds();
        retryInit(retryCount + 1);
      }
    }, RETRY_INTERVAL);
  }

  // 전역 함수 등록
  window.__gcInitAds = initAds;
  window.__gcRefreshAds = refreshAds;

  // 페이지 로드 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initAds();
      retryInit(0);
    });
  } else {
    initAds();
    retryInit(0);
  }

  // load 이벤트 (AdSense 로드 완료 후 처리)
  window.addEventListener('load', function() {
    setTimeout(function() {
      processPendingInits();
      initAds();
    }, 100);
  });

  // bfcache 복귀 시
  window.addEventListener('pageshow', function(e) {
    if (e && e.persisted) {
      setTimeout(function() {
        processPendingInits();
        initAds();
      }, 100);
    }
  });
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

  // canonical URL을 m. 도메인으로 변경
  const mobileCanonical = canonical.replace('https://gamerscrawl.com', 'https://m.gamerscrawl.com');

  // 페이지별 데이터 스크립트 (SPA 전환 시 재로드를 위해 main 안에 삽입)
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
  ${spaTransitionCss}
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
  ${spaRouterScript}
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
 * SPA용 partial 콘텐츠 생성 (레이아웃 없이 메인 콘텐츠만)
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
