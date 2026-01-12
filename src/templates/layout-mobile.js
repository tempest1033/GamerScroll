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

// 스와이프 스크립트 (실시간 페이지 드래그 + 미리보기)
const swipeScript = `
<script>
(function() {
  const navSections = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic'];
  const SWIPE_THRESHOLD = 0.5; // 화면 50% 이상 스와이프하면 전환
  const TRANSITION_MS = 250;

  let touchStartX = 0, touchStartY = 0;
  let currentX = 0;
  let isSwiping = false;
  let swipeDirection = null; // 'horizontal' or 'vertical' or null
  let swipeWrapper = null;
  let prevContent = null, nextContent = null;
  let hasPrevPage = false, hasNextPage = false;
  let screenWidth = window.innerWidth;

  // 프리페치 캐시
  const pageCache = new Map();

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    for (let i = 0; i < navSections.length; i++) {
      if (path.includes(navSections[i])) return i;
    }
    return -1;
  }

  function getPageUrl(index) {
    if (index < -1) return null;  // 홈 이전은 없음
    if (index === -1) return '/'; // 홈
    if (index >= navSections.length) return null;
    return '/' + navSections[index] + '/';
  }

  // 페이지 콘텐츠 가져오기
  function fetchPageContent(url) {
    if (!url) return Promise.resolve(null);
    if (pageCache.has(url)) return Promise.resolve(pageCache.get(url));
    return fetch(url)
      .then(r => r.ok ? r.text() : null)
      .then(html => {
        if (!html) return null;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const main = doc.querySelector('main.site-container');
        const content = main ? main.innerHTML : null;
        if (content) pageCache.set(url, content);
        return content;
      })
      .catch(() => null);
  }

  // 인접 페이지 프리페치
  function prefetchAdjacent() {
    const idx = getCurrentNavIndex();
    const prevUrl = getPageUrl(idx - 1);
    const nextUrl = getPageUrl(idx + 1);
    if (prevUrl && !pageCache.has(prevUrl)) fetchPageContent(prevUrl);
    if (nextUrl && !pageCache.has(nextUrl)) fetchPageContent(nextUrl);
  }

  // 페이지 로드 시 프리페치
  setTimeout(prefetchAdjacent, 500);

  // 스와이프 래퍼 생성
  function createSwipeWrapper(prevHtml, currentHtml, nextHtml) {
    const main = document.querySelector('main.site-container');
    if (!main) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'swipe-wrapper';
    wrapper.style.cssText = 'display:flex;width:300%;transform:translateX(-33.333%);will-change:transform;';

    const prevPane = document.createElement('div');
    prevPane.className = 'swipe-pane swipe-prev';
    prevPane.style.cssText = 'width:33.333%;flex-shrink:0;overflow:hidden;';
    prevPane.innerHTML = prevHtml || '<div class="swipe-empty"></div>';

    const currentPane = document.createElement('div');
    currentPane.className = 'swipe-pane swipe-current';
    currentPane.style.cssText = 'width:33.333%;flex-shrink:0;overflow:hidden;';
    currentPane.innerHTML = currentHtml;

    const nextPane = document.createElement('div');
    nextPane.className = 'swipe-pane swipe-next';
    nextPane.style.cssText = 'width:33.333%;flex-shrink:0;overflow:hidden;';
    nextPane.innerHTML = nextHtml || '<div class="swipe-empty"></div>';

    wrapper.appendChild(prevPane);
    wrapper.appendChild(currentPane);
    wrapper.appendChild(nextPane);

    main.innerHTML = '';
    main.appendChild(wrapper);
    return wrapper;
  }

  // 스와이프 정리
  function cleanupSwipe(keepContent = null) {
    const main = document.querySelector('main.site-container');
    if (!main || !swipeWrapper) return;

    if (keepContent) {
      main.innerHTML = keepContent;
      // 스크립트 재실행
      const scripts = Array.from(main.querySelectorAll('script'));
      scripts.forEach(function(oldScript) {
        const newScript = document.createElement('script');
        if (oldScript.src) newScript.src = oldScript.src;
        else newScript.textContent = '(function(){' + oldScript.textContent + '})();';
        oldScript.remove();
        document.body.appendChild(newScript);
      });
    }

    swipeWrapper = null;
    prevContent = null;
    nextContent = null;
    hasPrevPage = false;
    hasNextPage = false;
    isSwiping = false;
    swipeDirection = null;
  }

  // 터치 시작
  document.body.addEventListener('touchstart', (e) => {
    // 스크롤 가능한 요소 내에서는 무시
    if (e.target.closest('.search-dropdown, .modal-overlay, input, textarea')) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    currentX = 0;
    swipeDirection = null;
    screenWidth = window.innerWidth;

    const currentIndex = getCurrentNavIndex();
    const prevUrl = getPageUrl(currentIndex - 1);
    const nextUrl = getPageUrl(currentIndex + 1);

    // 페이지 존재 여부 (null이면 해당 방향 페이지 없음)
    hasPrevPage = prevUrl !== null;
    hasNextPage = nextUrl !== null;

    // 캐시에서 즉시 가져오기 (없으면 null)
    prevContent = prevUrl ? (pageCache.get(prevUrl) || null) : null;
    nextContent = nextUrl ? (pageCache.get(nextUrl) || null) : null;

    // 캐시에 없으면 백그라운드로 로드 시작
    if (prevUrl && !prevContent) fetchPageContent(prevUrl).then(c => { if (!isSwiping) prevContent = c; });
    if (nextUrl && !nextContent) fetchPageContent(nextUrl).then(c => { if (!isSwiping) nextContent = c; });
  }, { passive: true });

  // 터치 이동
  document.body.addEventListener('touchmove', (e) => {
    if (!touchStartX) { console.log('[swipe] no touchStartX'); return; }

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchStartX - touchX;
    const diffY = touchStartY - touchY;

    // 방향 결정 (첫 움직임에서)
    if (!swipeDirection) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        swipeDirection = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical';
        console.log('[swipe] direction:', swipeDirection);
      }
    }

    // 수직 스크롤이면 무시
    if (swipeDirection !== 'horizontal') return;

    // 경계 체크 (없는 페이지 방향으로는 스와이프 제한)
    if (diffX > 0 && !hasNextPage) { console.log('[swipe] blocked: no next page'); return; }
    if (diffX < 0 && !hasPrevPage) { console.log('[swipe] blocked: no prev page'); return; }

    // 스와이프 시작
    if (!isSwiping) {
      isSwiping = true;
      console.log('[swipe] starting, hasNext:', hasNextPage, 'hasPrev:', hasPrevPage);
      const main = document.querySelector('main.site-container');
      if (main) {
        const currentHtml = main.innerHTML;
        swipeWrapper = createSwipeWrapper(prevContent, currentHtml, nextContent);
        console.log('[swipe] wrapper created:', !!swipeWrapper);
      }
    }

    if (swipeWrapper) {
      currentX = -diffX;
      // 33.333%가 기준점, diffX만큼 이동
      const baseOffset = -33.333;
      const movePercent = (currentX / screenWidth) * 33.333;
      const newTransform = baseOffset + movePercent;
      swipeWrapper.style.transform = 'translateX(' + newTransform + '%)';
      console.log('[swipe] transform:', newTransform.toFixed(2) + '%');
    }
  }, { passive: true });

  // 터치 종료
  document.body.addEventListener('touchend', (e) => {
    if (!isSwiping || !swipeWrapper) {
      touchStartX = 0;
      swipeDirection = null;
      return;
    }

    const threshold = screenWidth * SWIPE_THRESHOLD;
    const currentIndex = getCurrentNavIndex();

    // 전환 여부 결정
    if (Math.abs(currentX) > threshold) {
      // 페이지 전환
      const direction = currentX < 0 ? 'right' : 'left';
      const targetIndex = currentX < 0 ? currentIndex - 1 : currentIndex + 1;
      const targetContent = currentX < 0 ? prevContent : nextContent;

      if (targetContent) {
        // 애니메이션으로 완전히 이동
        swipeWrapper.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
        const targetOffset = currentX < 0 ? 0 : -66.666;
        swipeWrapper.style.transform = 'translateX(' + targetOffset + '%)';

        setTimeout(() => {
          cleanupSwipe(targetContent);
          // URL 업데이트 + nav 상태 업데이트
          const targetUrl = getPageUrl(targetIndex);
          if (targetUrl) {
            history.pushState({ url: targetUrl }, '', targetUrl);
            const targetPage = targetIndex < 0 ? 'home' : navSections[targetIndex];
            // nav active 업데이트
            document.querySelectorAll('.nav-item').forEach(item => {
              item.classList.remove('active');
              const href = item.getAttribute('href') || '';
              if (targetPage === 'home' && href === '/') item.classList.add('active');
              else if (href.startsWith('/' + targetPage)) item.classList.add('active');
            });
            // body 클래스 업데이트
            document.body.className = document.body.className.replace(/page-\\w+/g, '');
            document.body.classList.add('page-' + targetPage);
            // nav 캐러셀 업데이트
            var navInner = document.querySelector('.nav-inner');
            if (navInner) {
              var offset = 0;
              if (targetIndex >= 4) offset = -40;
              else if (targetIndex === 3) offset = -20;
              navInner.style.transform = 'translateX(' + offset + '%)';
            }
            // 광고 갱신
            document.querySelectorAll('.ad-card ins.adsbygoogle').forEach(function(ins) {
              ins.innerHTML = '';
              ins.removeAttribute('data-ad-status');
              ins.removeAttribute('data-ad-loaded');
              try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch(e) {}
            });
            // Firebase Analytics page_view 로깅
            if (window.__gcLogPageView) {
              window.__gcLogPageView(targetUrl);
            }
            // 인접 페이지 프리페치
            prefetchAdjacent();
          }
        }, TRANSITION_MS);
      } else {
        // 콘텐츠 아직 로드 안됨 - 애니메이션 후 SPA 또는 일반 이동
        swipeWrapper.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
        const targetOffset = currentX < 0 ? 0 : -66.666;
        swipeWrapper.style.transform = 'translateX(' + targetOffset + '%)';

        setTimeout(() => {
          const targetUrl = getPageUrl(targetIndex);
          if (targetUrl) {
            // SPA 라우터가 있으면 사용, 없으면 일반 이동
            if (window.spaNavigateTo) {
              const targetPage = targetIndex < 0 ? 'home' : navSections[targetIndex];
              window.spaNavigateTo(targetPage, { direction: direction });
            } else {
              window.location.href = targetUrl;
            }
          }
          cleanupSwipe();
        }, TRANSITION_MS);
      }
    } else {
      // 원복 애니메이션
      swipeWrapper.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
      swipeWrapper.style.transform = 'translateX(-33.333%)';
      setTimeout(() => {
        const main = document.querySelector('main.site-container');
        const currentPane = swipeWrapper?.querySelector('.swipe-current');
        if (main && currentPane) {
          cleanupSwipe(currentPane.innerHTML);
        }
      }, TRANSITION_MS);
    }

    touchStartX = 0;
    swipeDirection = null;
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
  if (document.readyState === 'complete') {
    initAds();
  } else {
    window.addEventListener('load', initAds);
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
