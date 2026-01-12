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
        return '<div class="search-result-item" data-slug="' + game.slug + '"><a href="/games/' + game.slug + '/" class="search-result-info"><div class="search-result-title">' + game.name + '</div></a><button class="search-result-delete" type="button" data-slug="' + game.slug + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
      }).join('');
      searchDropdown.innerHTML = header + items;
      const clearAllBtn = searchDropdown.querySelector('.search-clear-all');
      if (clearAllBtn) clearAllBtn.addEventListener('click', (e) => { e.stopPropagation(); clearAllRecent(); renderRecentSearches(); });
      searchDropdown.querySelectorAll('.search-result-delete').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); removeRecentSearch(btn.dataset.slug); renderRecentSearches(); });
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
      searchDropdown.querySelectorAll('.search-result-item[data-game]').forEach(item => {
        item.addEventListener('click', () => { try { saveRecentSearch(JSON.parse(item.dataset.game)); } catch {} });
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

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchDropdown.classList.remove('active'); searchInput.blur(); }
    else if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) window.location.href = '/games/?q=' + encodeURIComponent(query);
    }
  });

  const searchBtn = document.querySelector('.search-btn');
  if (searchBtn) searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) window.location.href = '/games/?q=' + encodeURIComponent(query);
  });
})();
</script>`;

// 스와이프 스크립트
const swipeScript = `
<script>
(function() {
  const navSections = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic'];
  let touchStartX = 0, touchStartY = 0;

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    for (let i = 0; i < navSections.length; i++) {
      if (path.includes(navSections[i])) return i;
    }
    return -1;
  }

  function switchNavSection(index) {
    if (index < 0 || index >= navSections.length) { window.location.href = '/'; return; }
    window.location.href = '/' + navSections[index] + '/';
  }

  document.body.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.body.addEventListener('touchend', (e) => {
    const diffX = touchStartX - e.changedTouches[0].screenX;
    const diffY = touchStartY - e.changedTouches[0].screenY;
    if (Math.abs(diffX) <= Math.abs(diffY)) return;
    if (Math.abs(diffX) > 50) {
      const currentIndex = getCurrentNavIndex();
      if (currentIndex === -1) {
        if (diffX > 0) switchNavSection(0);
        else switchNavSection(navSections.length - 1);
      } else {
        if (diffX > 0) switchNavSection(currentIndex + 1);
        else switchNavSection(currentIndex - 1);
      }
    }
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

// 모바일 광고 초기화 (표준 AdSense 패턴 - 바로 push)
const mobileAdInitScript = `
<script>
(function() {
  function initAds() {
    var ads = document.querySelectorAll('ins.adsbygoogle:not([data-ad-loaded])');
    ads.forEach(function(ad) {
      ad.dataset.adLoaded = 'true';
      try {
        (adsbygoogle = window.adsbygoogle || []).push({});
      } catch(e) { console.warn('[Ad] push error:', e.message); }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAds);
  } else {
    initAds();
  }
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
    ${content}
  </main>
  ${generateFooter()}
  ${footerModalScript}
  ${imageFallbackScript}
  ${fontAndEmojiScript}
  ${pageScripts}
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

module.exports = {
  wrapWithLayout,
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
