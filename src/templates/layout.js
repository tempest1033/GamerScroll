/**
 * 레이아웃 조합기
 * 공통 컴포넌트를 조합하여 완전한 HTML 페이지를 생성
 */

// 광고 활성화 여부 (ADS_ENABLED=false면 비활성화)
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';

// 전역 CSS 파일명 (기본 코어 번들)
let globalCssFilename = '/styles-core.css';
function setCssFilename(filename) {
  globalCssFilename = filename;
}
function getCssFilename() {
  return globalCssFilename;
}

function getPageExtraCssFiles(currentPage = '') {
  const page = String(currentPage || '').toLowerCase();
  if (page === 'magazine') return ['/styles-report.css', '/styles-article.css'];
  if (page === 'game') return ['/styles-game.css'];
  if (page === 'wiki' || page === 'tech') return ['/styles-article.css'];
  return [];
}

// 전역 검색 인덱스 버전 (빌드 해시 → 캐시 무효화)
let globalSearchIndexVersion = '';
function setSearchIndexVersion(v) {
  globalSearchIndexVersion = v;
}

// 공통 런타임 스크립트 버전 (자산 해시 기반)
let globalRuntimeAssetVersion = 'v1';
function setRuntimeAssetVersion(v) {
  globalRuntimeAssetVersion = String(v || 'v1');
}

// 전역 사이드바 카운트 (모바일 메뉴용)
let globalSidebarCounts = {};
function setGlobalSidebarCounts(counts) {
  globalSidebarCounts = counts;
}
function getGlobalSidebarCounts() {
  return globalSidebarCounts;
}

// 전역 사이드바 아티클 (모바일 메뉴용 인기/최신)
let globalPopularArticles = [];
let globalLatestArticles = [];
function setGlobalSidebarArticles(popular, latest) {
  globalPopularArticles = popular || [];
  globalLatestArticles = latest || [];
}

const { generateHead } = require('./components/head');
const {
  renderAdCard,
  renderResponsiveTopAd,
  renderResponsiveHomeAd,
  renderHomeAdPair,
  renderMobileOnlyHomeAd,
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
  // 인피드 (모바일 스크롤)
  Infeed001: '6662567459',
  Infeed002: '9737299266',
  Infeed003: '9204970318',
  Infeed004: '3171890915',
  Infeed005: '8232645901',
  // 인아티클 (기사 본문)
  InArticle001: '8021405606',
  InArticle002: '9566421564',
  InArticle003: '6077622756',
  InArticle004: '1648257301',
  InArticle005: '8253339898',
  // 멀티플렉스
  Multiflex001: '5636974986'
};

// 공통 런타임 스크립트 파일명
const LAYOUT_CORE_ASSET = 'layout-core.js';
const LAYOUT_RUNTIME_ASSET = 'layout-runtime.js';

// 상단 검색바 (홈/일반 페이지용)
const searchBarHtml = `
  <div class="search-container">
    <div class="search-box">
      <a href="/" class="search-home-icon" aria-label="홈으로 이동">
        <img src="/favicon.svg" alt="" width="20" height="20">
      </a>
      <input type="text" class="search-input" placeholder="게임 순위 검색" autocomplete="off">
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
// 호버 프리페치 제거됨 (Cloudflare 503 이슈로 비활성화)

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
	          for(var i=sessionStorage.length-1;i>=0;i--){var sk=sessionStorage.key(i);if(sk&&sk.startsWith('gs_si_')&&sk!==SEARCH_INDEX_CACHE_KEY)sessionStorage.removeItem(sk);}
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

      // 아이템 클릭 시 즉시 이동 (추가 HEAD 요청 제거)
      searchDropdown.querySelectorAll('.search-result-info').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const item = link.closest('.search-result-item');
          const game = recent.find(g => g.slug === item.dataset.slug);
          if (!game) return;
          searchDropdown.classList.remove('active');
          searchInput.blur();
          if (!game.slug) {
            location.href = '/games/';
            return;
          }
          saveRecentSearch(game);
          location.href = '/games/' + game.slug + '/';
        });
      });
    }
    searchDropdown.classList.add('active');
  }

	  let currentResults = [];

	  function filterGames(query) {
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

    currentResults = filterGames(query);

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
    return filterGames(query);
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

// 지연 카드 이미지 hydration 공통 유틸 (홈/매거진 공통)
const lazyCardHydrationScript = `
<script>
(function() {
  window.GSUtils = window.GSUtils || {};

  if (typeof window.GSUtils.hydrateLazyCardImage !== 'function') {
    window.GSUtils.hydrateLazyCardImage = function(card) {
      if (!card || card.querySelector('.home-trend-card-image img')) return;
      var src = card.getAttribute('data-lazy-img-src');
      if (!src) return;
      var srcset = card.getAttribute('data-lazy-img-srcset');
      var sizes = card.getAttribute('data-lazy-img-sizes');
      var imageWrap = card.querySelector('.home-trend-card-image');
      if (!imageWrap) return;
      var tag = imageWrap.querySelector('.home-trend-card-tag');
      var img = document.createElement('img');
      img.src = src;
      if (srcset) img.srcset = srcset;
      if (sizes) img.sizes = sizes;
      img.alt = card.getAttribute('data-lazy-img-alt') || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 1600;
      img.height = 900;
      img.setAttribute('fetchpriority', 'auto');
      img.setAttribute('data-img-fallback', 'hide');
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load', function() {
          img.classList.add('loaded');
        }, { once: true });
      }
      if (tag) imageWrap.insertBefore(img, tag);
      else imageWrap.appendChild(img);
      card.removeAttribute('data-lazy-img-src');
      card.removeAttribute('data-lazy-img-srcset');
      card.removeAttribute('data-lazy-img-sizes');
      card.removeAttribute('data-lazy-img-alt');
    };
  }

  if (typeof window.GSUtils.hydrateLazyCardImages !== 'function') {
    window.GSUtils.hydrateLazyCardImages = function(cards) {
      if (!cards || typeof cards.forEach !== 'function') return;
      cards.forEach(window.GSUtils.hydrateLazyCardImage);
    };
  }

  if (typeof window.GSUtils.toggleSidebarArticleTab !== 'function') {
    window.GSUtils.toggleSidebarArticleTab = function(tabId) {
      var sidebarTab = document.getElementById(tabId || 'sidebarArticleTab');
      if (!sidebarTab || sidebarTab.dataset.bound === '1') return;
      sidebarTab.dataset.bound = '1';
      sidebarTab.addEventListener('click', function(e) {
        var btn = e.target.closest('.tab-btn');
        if (!btn) return;
        sidebarTab.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var target = btn.dataset.sidebarTab;
        document.querySelectorAll('.sidebar-article-list').forEach(function(list) {
          list.classList.toggle('active', list.id === 'sidebar-' + target);
        });
      });
    };
  }

  if (typeof window.GSUtils.requestIdle !== 'function') {
    window.GSUtils.requestIdle = function(fn, timeout, fallbackDelay) {
      if (typeof fn !== 'function') return null;
      if ('requestIdleCallback' in window) {
        return requestIdleCallback(fn, { timeout: typeof timeout === 'number' ? timeout : 1000 });
      }
      var delay = typeof fallbackDelay === 'number' ? fallbackDelay : 0;
      return setTimeout(function() {
        fn({ didTimeout: true, timeRemaining: function() { return 0; } });
      }, delay);
    };
  }

  if (typeof window.GSUtils.createIntersectionObserver !== 'function') {
    window.GSUtils.createIntersectionObserver = function(callback, options) {
      if (typeof callback !== 'function') return null;
      if (!('IntersectionObserver' in window)) return null;
      var observer = new IntersectionObserver(function(entries) {
        callback(entries, observer);
      }, options || {});
      return observer;
    };
  }

  if (typeof window.GSUtils.resizeStoreIconUrl !== 'function') {
    window.GSUtils.resizeStoreIconUrl = function(url) {
      if (!url) return '';
      if (url.indexOf('mzstatic.com/') !== -1) return url.replace(/\\/\\d+x\\d+bb\\./, '/100x100bb.');
      if (url.indexOf('googleusercontent.com/') !== -1) return url.split('=')[0] + '=s100';
      return url;
    };
  }

  if (typeof window.GSUtils.initCardFeedPager !== 'function') {
    window.GSUtils.initCardFeedPager = function(options) {
      options = options || {};
      var grid = typeof options.grid === 'string' ? document.querySelector(options.grid) : options.grid;
      var pagination = typeof options.pagination === 'string' ? document.querySelector(options.pagination) : options.pagination;
      if (!grid || !pagination) return;

      var itemSelector = options.itemSelector || '.home-trend-card';
      var items = Array.from(grid.querySelectorAll(itemSelector));
      if (!items.length) return;

      var parsedPageSize = parseInt(pagination.dataset.perPage || '', 10);
      var pageSize = parseInt(options.pageSize, 10) || parsedPageSize || 15;
      var parsedTotal = parseInt(pagination.dataset.total || '', 10);
      var totalItemCount = parsedTotal > 0 ? parsedTotal : items.length;
      var initialRenderCount = parseInt(options.initialRenderCount, 10);
      if (!(initialRenderCount > 0)) initialRenderCount = pageSize;
      initialRenderCount = Math.max(1, Math.min(initialRenderCount, pageSize, totalItemCount || pageSize));
      var idleFillFirstPage = options.idleFillFirstPage === true;
      var idleFillDelay = parseInt(options.idleFillDelay, 10);
      if (!(idleFillDelay >= 0)) idleFillDelay = 120;
      var mobileMaxWidth = parseInt(options.mobileMaxWidth, 10) || 768;
      var isMobile = window.matchMedia
        ? window.matchMedia('(max-width:' + mobileMaxWidth + 'px)').matches
        : window.innerWidth <= mobileMaxWidth;
      var shouldHydrateLazyImages = !!options.hydrateLazyImages;
      var useMobileAds = !!options.mobileAds;
      var adSlots = Array.isArray(options.adSlots) && options.adSlots.length
        ? options.adSlots
        : ['6662567459', '9737299266', '9204970318', '3171890915', '8232645901'];
      var adInterval = parseInt(options.adInterval, 10) || 3;
      var adNodeSelector = '.ad-card-native, .ad-card-content, .ad-card-mobile-only, .ad-card-multiplex, .ad-card-scroll';
      var deferredDataScript = null;
      if (options.deferredJson) {
        deferredDataScript = typeof options.deferredJson === 'string'
          ? document.querySelector(options.deferredJson)
          : options.deferredJson;
      }
      var deferredDataUrl = '';
      if (typeof options.deferredJsonUrl === 'string' && options.deferredJsonUrl.trim()) {
        deferredDataUrl = options.deferredJsonUrl.trim();
      } else if (deferredDataScript && deferredDataScript.getAttribute) {
        deferredDataUrl = deferredDataScript.getAttribute('data-src') || '';
      }
      var deferredTemplate = null;
      if (options.deferredTemplate) {
        deferredTemplate = typeof options.deferredTemplate === 'string'
          ? document.querySelector(options.deferredTemplate)
          : options.deferredTemplate;
      }
      var deferredNodes = deferredTemplate && deferredTemplate.content
        ? Array.from(deferredTemplate.content.childNodes)
        : [];
      var deferredNodeIndex = 0;
      var deferredDataList = [];
      var deferredDataIndex = 0;
      var deferredDataLoadedFromUrl = !deferredDataUrl;
      var deferredDataLoadErrored = false;
      var deferredDataLoadingPromise = null;
      var rerenderAfterDeferredDataLoaded = null;
      function parseDeferredDataList(raw) {
        if (typeof raw !== 'string' || raw.trim() === '') return [];
        try {
          var parsedDeferredData = JSON.parse(raw);
          if (Array.isArray(parsedDeferredData)) {
            return parsedDeferredData.filter(function(item) {
              return typeof item === 'string' && item.trim() !== '';
            });
          }
        } catch (e) {}
        return [];
      }
      if (deferredDataScript) {
        var deferredRaw = deferredDataScript.textContent || deferredDataScript.innerText || '';
        deferredDataList = parseDeferredDataList(deferredRaw);
        if (deferredDataList.length > 0) {
          deferredDataLoadedFromUrl = true;
        }
      }
      function requestDeferredDataLoad() {
        if (!deferredDataUrl || deferredDataLoadedFromUrl || deferredDataLoadErrored) {
          return Promise.resolve(deferredDataList);
        }
        if (deferredDataLoadingPromise) return deferredDataLoadingPromise;

        deferredDataLoadingPromise = fetch(deferredDataUrl, { credentials: 'same-origin' })
          .then(function(response) {
            if (!response || !response.ok) throw new Error('deferred fetch failed');
            return response.text();
          })
          .then(function(raw) {
            deferredDataList = parseDeferredDataList(raw);
            deferredDataIndex = 0;
            deferredDataLoadedFromUrl = true;
            if (deferredDataScript && deferredDataScript.removeAttribute) {
              deferredDataScript.removeAttribute('data-src');
            }
            return deferredDataList;
          })
          .catch(function() {
            deferredDataLoadErrored = true;
            deferredDataLoadedFromUrl = true;
            deferredDataList = [];
            return deferredDataList;
          })
          .finally(function() {
            deferredDataLoadingPromise = null;
            if (typeof rerenderAfterDeferredDataLoaded === 'function') {
              rerenderAfterDeferredDataLoaded();
            }
          });

        return deferredDataLoadingPromise;
      }
      function scheduleDeferredDataPrefetch() {
        if (!deferredDataUrl || deferredDataLoadedFromUrl || deferredDataLoadErrored || deferredDataLoadingPromise) return;
        if (window.GSUtils && typeof window.GSUtils.requestIdle === 'function') {
          window.GSUtils.requestIdle(function() {
            requestDeferredDataLoad();
          }, 1400, 120);
          return;
        }
        setTimeout(function() {
          requestDeferredDataLoad();
        }, 120);
      }
      var prunedCardCount = 0;
      var topSpacer = null;
      var topSpacerHeight = 0;
      var removedTopGroups = [];
      var mobileDomWindowPages = parseInt(options.mobileDomWindowPages, 10);
      if (!(mobileDomWindowPages > 0)) {
        // 콘텐츠 규모별 기본 DOM 윈도우(카드 DOM 누적 억제)
        if (totalItemCount >= pageSize * 16) mobileDomWindowPages = 4;
        else if (totalItemCount >= pageSize * 8) mobileDomWindowPages = 5;
        else mobileDomWindowPages = 6;
      }
      var maxMobileDomItems = mobileDomWindowPages > 0
        ? Math.max(pageSize * mobileDomWindowPages, pageSize * 2)
        : 0;
      var enableMobileDomWindowing = maxMobileDomItems > 0;

      function hydrateVisibleCards(visibleItems) {
        if (!shouldHydrateLazyImages) return;
        if (!window.GSUtils || typeof window.GSUtils.hydrateLazyCardImages !== 'function') return;
        window.GSUtils.hydrateLazyCardImages(visibleItems);
      }

      function isAdNode(node) {
        return !!(node && node.nodeType === 1 && node.matches && node.matches(adNodeSelector));
      }

      function appendDeferredNode(node) {
        if (!node) return;
        if (node.nodeType === 1 && isMobile && useMobileAds && isAdNode(node)) {
          return;
        }
        grid.appendChild(node);
        if (node.nodeType === 1 && window.GSUtils && typeof window.GSUtils.bindImageLoadState === 'function') {
          // 동적 append 카드의 썸네일도 loaded 클래스를 부여해 opacity:0 상태로 남지 않게 함
          window.GSUtils.bindImageLoadState(node);
        }
        if (node.nodeType === 1 && node.matches && node.matches(itemSelector)) {
          items.push(node);
        }
      }

      function consumeDeferredUntil(targetCardCount) {
        if (!deferredNodes.length && deferredDataIndex >= deferredDataList.length) {
          if (deferredDataUrl && !deferredDataLoadedFromUrl && !deferredDataLoadErrored) {
            requestDeferredDataLoad();
          }
          return;
        }
        var targetCount = Math.min(targetCardCount, totalItemCount);
        var loadedCount = prunedCardCount + items.length;
        if (loadedCount >= targetCount) return;

        while ((prunedCardCount + items.length) < targetCount) {
          if (deferredNodeIndex < deferredNodes.length) {
            var srcNode = deferredNodes[deferredNodeIndex++];
            if (!srcNode) continue;
            appendDeferredNode(srcNode.cloneNode(true));
            continue;
          }

          if (deferredDataIndex >= deferredDataList.length) {
            if (deferredDataUrl && !deferredDataLoadedFromUrl && !deferredDataLoadErrored) {
              requestDeferredDataLoad();
            }
            break;
          }

          var deferredCardHtml = deferredDataList[deferredDataIndex++];
          if (!deferredCardHtml) continue;

          var temp = document.createElement('template');
          temp.innerHTML = deferredCardHtml;
          var parsedNodes = Array.from(temp.content.childNodes);
          if (!parsedNodes.length) continue;

          for (var parsedIndex = 0; parsedIndex < parsedNodes.length; parsedIndex++) {
            appendDeferredNode(parsedNodes[parsedIndex]);
            if ((prunedCardCount + items.length) >= targetCount) break;
          }
        }

        if (deferredTemplate && deferredNodeIndex >= deferredNodes.length) {
          deferredTemplate.remove();
          deferredTemplate = null;
          deferredNodes = [];
        }
        if (
          deferredDataScript &&
          deferredDataIndex >= deferredDataList.length &&
          (!deferredDataUrl || deferredDataLoadedFromUrl || deferredDataLoadErrored)
        ) {
          deferredDataScript.remove();
          deferredDataScript = null;
          deferredDataList = [];
          deferredDataUrl = '';
        }

        // 총 개수 메타데이터가 실제 카드 수보다 큰 경우, 무한 대기를 방지
        if (
          deferredNodeIndex >= deferredNodes.length &&
          deferredDataIndex >= deferredDataList.length &&
          (!deferredDataUrl || deferredDataLoadedFromUrl || deferredDataLoadErrored) &&
          (prunedCardCount + items.length) < totalItemCount
        ) {
          totalItemCount = prunedCardCount + items.length;
        }
      }

      if (isMobile) {
        pagination.style.display = 'none';
        var visibleCount = Math.min(initialRenderCount, totalItemCount);
        var observer = null;
        var scrollAdObserver = null;
        var fallbackTicking = false;
        var fallbackBound = false;
        var fallbackTicking2 = false;
        var fallbackThrottleAt = 0;
        var noIoFallbackBound = false;
        var maxDomCards = enableMobileDomWindowing ? maxMobileDomItems : 0;
        var renderedScrollAds = new Map();
        // Phase B: cleanup registry — observers/listeners released on pagehide.
        var __gsAdCleanup = (window.__gsAdCleanup = window.__gsAdCleanup || []);
        if (!window.__gsAdCleanupBound) {
          window.__gsAdCleanupBound = true;
          window.addEventListener('pagehide', function() {
            while (__gsAdCleanup.length) {
              var fn = __gsAdCleanup.shift();
              try { if (typeof fn === 'function') fn(); } catch (e) {}
            }
          });
        }
        function pushScrollAdGuarded(ins) {
          if (!ins) return;
          if (document.body.classList.contains('ads-disabled')) return;
          if (ins.dataset && ins.dataset.gsAdPushed === '1') return;
          var node = ins;
          while (node && node !== document.body) {
            if (node.offsetParent === null) return;
            var cs = window.getComputedStyle ? getComputedStyle(node) : null;
            if (cs && cs.display === 'none') return;
            node = node.parentElement;
          }
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            if (ins.dataset) ins.dataset.gsAdPushed = '1';
          } catch (e) {}
        }
        function ensureScrollAdObserver() {
          if (scrollAdObserver) return scrollAdObserver;
          if (!('IntersectionObserver' in window)) return null;
          scrollAdObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
              if (!entry.isIntersecting) return;
              var ins = entry.target;
              scrollAdObserver.unobserve(ins);
              pushScrollAdGuarded(ins);
            });
          }, { rootMargin: '600px' });
          __gsAdCleanup.push(function() {
            try { if (scrollAdObserver) scrollAdObserver.disconnect(); } catch (e) {}
            scrollAdObserver = null;
          });
          return scrollAdObserver;
        }
        rerenderAfterDeferredDataLoaded = function() {
          consumeDeferredUntil(visibleCount);
          visibleCount = Math.min(visibleCount, getLoadedCardCount());
          showItemsMobile();
          pruneTopCardsIfNeeded();
          showItemsMobile();
          syncMobileAds();
          observeLastItemMobile();
        };
        scheduleDeferredDataPrefetch();

        function getLoadedCardCount() {
          return prunedCardCount + items.length;
        }

        function getVisibleDomCount() {
          return Math.max(0, Math.min(items.length, visibleCount - prunedCardCount));
        }

        function measureNodeOuterHeight(node) {
          if (!node || node.nodeType !== 1) return 0;
          var rect = node.getBoundingClientRect();
          var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
          var marginTop = style ? parseFloat(style.marginTop || '0') : 0;
          var marginBottom = style ? parseFloat(style.marginBottom || '0') : 0;
          var height = rect && rect.height ? rect.height : node.offsetHeight;
          return Math.max(0, height + marginTop + marginBottom);
        }

        function ensureTopSpacer() {
          if (topSpacer) return;
          topSpacer = document.createElement('div');
          topSpacer.className = 'feed-top-spacer';
          topSpacer.setAttribute('aria-hidden', 'true');
          topSpacer.style.height = '0px';
          grid.insertBefore(topSpacer, grid.firstChild);
        }

        function syncTopSpacer() {
          if (!topSpacer && topSpacerHeight <= 0) return;
          ensureTopSpacer();
          if (!topSpacer) return;
          topSpacer.style.height = (topSpacerHeight > 0 ? topSpacerHeight : 0) + 'px';
          if (topSpacerHeight <= 0 && topSpacer.parentNode) {
            topSpacer.parentNode.removeChild(topSpacer);
            topSpacer = null;
          }
        }

        function pruneTopCardsIfNeeded() {
          if (!maxDomCards || maxDomCards < pageSize) return;
          var visibleDomCount = getVisibleDomCount();
          if (visibleDomCount <= maxDomCards) return;

          var overflow = visibleDomCount - maxDomCards;
          var pruneCount = overflow;
          if (pageSize > 1) {
            pruneCount = Math.floor(pruneCount / pageSize) * pageSize;
            if (pruneCount <= 0) pruneCount = pageSize;
          }

          var maxPrune = Math.max(0, visibleDomCount - pageSize);
          pruneCount = Math.min(pruneCount, maxPrune, items.length);
          if (pruneCount <= 0) return;

          var removedNodes = items.splice(0, pruneCount);
          if (!removedNodes.length) return;

          var removedHeight = 0;
          removedNodes.forEach(function(node) {
            removedHeight += measureNodeOuterHeight(node);
            if (node && node.parentNode) node.parentNode.removeChild(node);
          });

          prunedCardCount += removedNodes.length;
          topSpacerHeight += removedHeight;
          removedTopGroups.push({ nodes: removedNodes, height: removedHeight });
          syncTopSpacer();
        }

        function maybeRestoreTopCards() {
          if (!removedTopGroups.length || !topSpacer) return false;
          var rect = topSpacer.getBoundingClientRect();
          if (rect.top < -220) return false;

          var group = removedTopGroups.pop();
          if (!group || !Array.isArray(group.nodes) || !group.nodes.length) return false;

          var fragment = document.createDocumentFragment();
          group.nodes.forEach(function(node) { fragment.appendChild(node); });
          grid.insertBefore(fragment, topSpacer.nextSibling);
          items = group.nodes.concat(items);
          prunedCardCount = Math.max(0, prunedCardCount - group.nodes.length);
          topSpacerHeight = Math.max(0, topSpacerHeight - (group.height || 0));
          syncTopSpacer();
          return true;
        }

        if (useMobileAds) {
          grid.querySelectorAll(adNodeSelector).forEach(function(ad) {
            if (ad && ad.parentNode) ad.parentNode.removeChild(ad);
          });
        }

        function showItemsMobile() {
          var visibleDomCount = getVisibleDomCount();
          items.forEach(function(item, i) {
            item.style.display = i < visibleDomCount ? '' : 'none';
          });
          hydrateVisibleCards(items.slice(0, visibleDomCount));
        }

        function removeTrackedScrollAd(globalCardIndex) {
          var adEl = renderedScrollAds.get(globalCardIndex);
          if (adEl && adEl.parentNode) adEl.parentNode.removeChild(adEl);
          renderedScrollAds.delete(globalCardIndex);
        }

        function clearTrackedScrollAds() {
          renderedScrollAds.forEach(function(adEl) {
            if (adEl && adEl.parentNode) adEl.parentNode.removeChild(adEl);
          });
          renderedScrollAds.clear();
        }

        function createScrollAdElement(globalCardIndex, slotId) {
          var adId = 'scroll-ad-' + (globalCardIndex + 1);
          var adWrap = document.createElement('div');
          adWrap.className = 'ad-card ad-card-scroll';
          adWrap.id = adId;
          adWrap.style.margin = '16px 0';
          adWrap.style.padding = '12px 0';
          adWrap.style.borderTop = '1px solid var(--border)';
          adWrap.style.borderBottom = '1px solid var(--border)';

          var ins = document.createElement('ins');
          ins.className = 'adsbygoogle';
          ins.style.display = 'block';
          ins.setAttribute('data-ad-client', 'ca-pub-9477874183990825');
          ins.setAttribute('data-ad-slot', slotId);
          ins.setAttribute('data-ad-format', 'fluid');
          ins.setAttribute('data-ad-layout-key', '-7m+ex-1f-2m+ae');
          adWrap.appendChild(ins);

          return adWrap;
        }

        function syncMobileAds() {
          if (!useMobileAds || document.body.classList.contains('ads-disabled')) {
            clearTrackedScrollAds();
            return;
          }

          var visibleDomCount = getVisibleDomCount();
          var visibleStart = prunedCardCount;
          var visibleEnd = prunedCardCount + visibleDomCount;
          var staleKeys = [];

          renderedScrollAds.forEach(function(adEl, globalCardIndex) {
            var inVisibleRange = globalCardIndex >= visibleStart && globalCardIndex < visibleEnd;
            var shouldExist = inVisibleRange && ((globalCardIndex + 1) % adInterval === 0);
            if (!shouldExist || !adEl || !adEl.parentNode) {
              staleKeys.push(globalCardIndex);
              return;
            }

            var localIndex = globalCardIndex - prunedCardCount;
            var anchor = items[localIndex];
            if (!anchor || anchor.style.display === 'none') {
              staleKeys.push(globalCardIndex);
              return;
            }

            if (anchor.nextElementSibling !== adEl) {
              anchor.insertAdjacentElement('afterend', adEl);
            }
          });

          staleKeys.forEach(function(globalCardIndex) {
            removeTrackedScrollAd(globalCardIndex);
          });

          for (var i = 0; i < visibleDomCount; i++) {
            var globalCardIndex = prunedCardCount + i;
            if ((globalCardIndex + 1) % adInterval !== 0) continue;

            var anchor = items[i];
            if (!anchor) continue;

            var existingAd = renderedScrollAds.get(globalCardIndex);
            if (existingAd && existingAd.parentNode) {
              if (anchor.nextElementSibling !== existingAd) {
                anchor.insertAdjacentElement('afterend', existingAd);
              }
              continue;
            }

            var adOrder = Math.floor((globalCardIndex + 1) / adInterval);
            var slotId = adSlots[(adOrder - 1) % adSlots.length];
            var adEl = createScrollAdElement(globalCardIndex, slotId);
            anchor.insertAdjacentElement('afterend', adEl);
            renderedScrollAds.set(globalCardIndex, adEl);

            var insEl = adEl.querySelector ? adEl.querySelector('ins.adsbygoogle') : null;
            var io = ensureScrollAdObserver();
            if (io && insEl) {
              io.observe(insEl);
            } else if (insEl) {
              pushScrollAdGuarded(insEl);
            }
          }
        }

        function loadMoreMobile() {
          if (visibleCount >= totalItemCount) {
            unbindFallbackListeners();
            return;
          }
          var nextVisible = Math.min(visibleCount + pageSize, totalItemCount);
          consumeDeferredUntil(nextVisible);
          visibleCount = Math.min(nextVisible, getLoadedCardCount());
          showItemsMobile();
          pruneTopCardsIfNeeded();
          showItemsMobile();
          syncMobileAds();
          observeLastItemMobile();
          if (visibleCount >= totalItemCount) unbindFallbackListeners();
        }

        function isNearLastVisible() {
          if (visibleCount >= totalItemCount) return false;
          if (visibleCount > getLoadedCardCount()) return true;
          var visibleDomCount = getVisibleDomCount();
          if (visibleDomCount <= 0) return true;
          var lastVisible = items[visibleDomCount - 1];
          if (!lastVisible || typeof lastVisible.getBoundingClientRect !== 'function') return false;
          var rect = lastVisible.getBoundingClientRect();
          var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          return rect.top <= viewportHeight + 220;
        }

        function runFallbackCheck() {
          if (fallbackTicking) return;
          fallbackTicking = true;
          requestAnimationFrame(function() {
            fallbackTicking = false;
            if (maybeRestoreTopCards()) {
              showItemsMobile();
              syncMobileAds();
            }
            if (isNearLastVisible()) loadMoreMobile();
          });
        }

        function bindFallbackListeners() {
          if (fallbackBound) return;
          fallbackBound = true;
          window.addEventListener('scroll', runFallbackCheck, { passive: true });
          window.addEventListener('resize', runFallbackCheck);
          __gsAdCleanup.push(function() { try { unbindFallbackListeners(); } catch (e) {} });
        }

        function unbindFallbackListeners() {
          if (!fallbackBound) return;
          fallbackBound = false;
          window.removeEventListener('scroll', runFallbackCheck);
          window.removeEventListener('resize', runFallbackCheck);
        }

        function observeLastItemMobile() {
          if (observer) observer.disconnect();
          if (visibleCount >= totalItemCount) {
            unbindFallbackListeners();
            return;
          }
          consumeDeferredUntil(visibleCount);
          var visibleDomCount = getVisibleDomCount();
          var lastVisible = visibleDomCount > 0 ? items[visibleDomCount - 1] : null;
          if (!lastVisible) {
            loadMoreMobile();
            return;
          }
          if (!('IntersectionObserver' in window)) {
            // Phase B: no-IO fallback — passive scroll + rAF, 200ms throttle, calls loadMoreMobile near bottom.
            if (!noIoFallbackBound) {
              noIoFallbackBound = true;
              var noIoScrollHandler = function() {
                if (fallbackTicking2) return;
                var now = Date.now();
                if (now - fallbackThrottleAt < 200) return;
                fallbackThrottleAt = now;
                fallbackTicking2 = true;
                requestAnimationFrame(function() {
                  fallbackTicking2 = false;
                  var scrollY = window.scrollY || window.pageYOffset || 0;
                  var viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
                  var docH = document.documentElement.scrollHeight || 0;
                  if (scrollY + viewportH >= docH - 600) loadMoreMobile();
                });
              };
              window.addEventListener('scroll', noIoScrollHandler, { passive: true });
              __gsAdCleanup.push(function() {
                try { window.removeEventListener('scroll', noIoScrollHandler); } catch (e) {}
                noIoFallbackBound = false;
              });
            }
            return;
          }
          observer = new IntersectionObserver(function(entries) {
            if (entries[0] && entries[0].isIntersecting) loadMoreMobile();
          }, { rootMargin: '1200px' });
          observer.observe(lastVisible);
          __gsAdCleanup.push(function() { try { if (observer) observer.disconnect(); } catch (e) {} });
        }

        consumeDeferredUntil(visibleCount);
        visibleCount = Math.min(visibleCount, getLoadedCardCount());
        showItemsMobile();
        pruneTopCardsIfNeeded();
        showItemsMobile();
        syncMobileAds();
        observeLastItemMobile();
        bindFallbackListeners();
        runFallbackCheck();
        if (idleFillFirstPage && visibleCount < Math.min(pageSize, totalItemCount)) {
          var targetVisibleCount = Math.min(pageSize, totalItemCount);
          if (window.GSUtils && typeof window.GSUtils.requestIdle === 'function') {
            window.GSUtils.requestIdle(function() {
              consumeDeferredUntil(targetVisibleCount);
              visibleCount = Math.min(targetVisibleCount, getLoadedCardCount());
              showItemsMobile();
              pruneTopCardsIfNeeded();
              showItemsMobile();
              syncMobileAds();
              observeLastItemMobile();
            }, 1400, idleFillDelay);
          } else {
            setTimeout(function() {
              consumeDeferredUntil(targetVisibleCount);
              visibleCount = Math.min(targetVisibleCount, getLoadedCardCount());
              showItemsMobile();
              pruneTopCardsIfNeeded();
              showItemsMobile();
              syncMobileAds();
              observeLastItemMobile();
            }, idleFillDelay);
          }
        }
        return;
      }

      var totalPages = Math.ceil(totalItemCount / pageSize) || 1;
      var currentPage = 1;
      var prevSelector = options.prevSelector || '.home-page-prev, .home-prev';
      var nextSelector = options.nextSelector || '.home-page-next, .home-next';
      var infoSelector = options.infoSelector || '.home-page-info, .home-page-index';
      var prevBtn = pagination.querySelector(prevSelector);
      var nextBtn = pagination.querySelector(nextSelector);
      var pageInfo = pagination.querySelector(infoSelector);
      if (!prevBtn || !nextBtn || !pageInfo) return;
      var didInitialIdleFill = false;

      function updateDesktopPage(start, end) {
        items.forEach(function(item, i) {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });
        hydrateVisibleCards(items.slice(start, end));
      }

      function renderPage() {
        var start = (currentPage - 1) * pageSize;
        var end = Math.min(start + pageSize, totalItemCount);
        var shouldDeferFirstFill = idleFillFirstPage && !didInitialIdleFill && currentPage === 1 && start === 0 && initialRenderCount < end;
        if (!shouldDeferFirstFill) {
          consumeDeferredUntil(end);
        }
        updateDesktopPage(start, shouldDeferFirstFill ? Math.min(end, items.length) : end);
        pageInfo.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;

        if (shouldDeferFirstFill) {
          var idleFill = function() {
            if (currentPage !== 1) return;
            consumeDeferredUntil(end);
            updateDesktopPage(start, end);
          };
          if (window.GSUtils && typeof window.GSUtils.requestIdle === 'function') {
            window.GSUtils.requestIdle(idleFill, 1400, idleFillDelay);
          } else {
            setTimeout(idleFill, idleFillDelay);
          }
          didInitialIdleFill = true;
        }
      }
      rerenderAfterDeferredDataLoaded = function() {
        renderPage();
      };
      scheduleDeferredDataPrefetch();

      prevBtn.addEventListener('click', function() {
        if (currentPage > 1) {
          currentPage--;
          renderPage();
        }
      });
      nextBtn.addEventListener('click', function() {
        if (currentPage < totalPages) {
          currentPage++;
          renderPage();
        }
      });

      renderPage();
    };
  }

  if (typeof window.GSUtils.initListPager !== 'function') {
    window.GSUtils.initListPager = function(options) {
      options = options || {};
      var root = typeof options.root === 'string' ? document.querySelector(options.root) : options.root;
      if (!root) return;

      var itemSelector = options.itemSelector || '.item';
      var prevSelector = options.prevSelector || '.prev';
      var nextSelector = options.nextSelector || '.next';
      var infoSelector = options.infoSelector || '.page-info';
      var items = Array.from(root.querySelectorAll(itemSelector));
      var prevBtn = root.querySelector(prevSelector);
      var nextBtn = root.querySelector(nextSelector);
      var pageInfo = root.querySelector(infoSelector);
      if (!items.length || !prevBtn || !nextBtn || !pageInfo) return;

      var mobileMaxWidth = parseInt(options.mobileMaxWidth, 10) || 768;
      var desktopPageSize = parseInt(options.desktopPageSize || options.pageSize, 10) || 8;
      var mobilePageSize = parseInt(options.mobilePageSize, 10) || desktopPageSize;
      var infoSeparator = options.infoSeparator || '/';
      var hideIfSingle = options.hideIfSingle === true;
      var currentPage = 0;
      var resizeTicking = false;
      var paginationEl = typeof options.pagination === 'string'
        ? root.querySelector(options.pagination)
        : (options.pagination || pageInfo.closest('.video-pagination, .home-pagination'));

      function getPageSize() {
        return window.innerWidth <= mobileMaxWidth ? mobilePageSize : desktopPageSize;
      }

      function render() {
        var pageSize = getPageSize();
        if (!pageSize || pageSize < 1) pageSize = 1;
        var totalPages = Math.ceil(items.length / pageSize) || 1;
        if (currentPage >= totalPages) currentPage = totalPages - 1;
        if (currentPage < 0) currentPage = 0;

        var start = currentPage * pageSize;
        var end = start + pageSize;
        items.forEach(function(item, i) {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });

        if (typeof options.formatPageInfo === 'function') {
          pageInfo.textContent = options.formatPageInfo(currentPage + 1, totalPages);
        } else {
          pageInfo.textContent = (currentPage + 1) + infoSeparator + totalPages;
        }
        prevBtn.disabled = currentPage <= 0;
        nextBtn.disabled = currentPage >= totalPages - 1;

        if (hideIfSingle && paginationEl) {
          paginationEl.style.display = totalPages > 1 ? '' : 'none';
        }
      }

      prevBtn.addEventListener('click', function() {
        if (currentPage > 0) {
          currentPage--;
          render();
        }
      });
      nextBtn.addEventListener('click', function() {
        var pageSize = getPageSize();
        if (!pageSize || pageSize < 1) pageSize = 1;
        var totalPages = Math.ceil(items.length / pageSize) || 1;
        if (currentPage < totalPages - 1) {
          currentPage++;
          render();
        }
      });

      window.addEventListener('resize', function() {
        if (resizeTicking) return;
        resizeTicking = true;
        requestAnimationFrame(function() {
          render();
          resizeTicking = false;
        });
      });

      render();
    };
  }

  if (typeof window.GSUtils.bindImageLoadState !== 'function') {
    window.GSUtils.bindImageLoadState = function(root) {
      var scope = root && root.querySelectorAll ? root : document;
      if (!scope || typeof scope.querySelectorAll !== 'function') return;
      var selector = '.home-trend-card-image img, .category-list-thumb img, .home-popular-thumb img';
      scope.querySelectorAll(selector).forEach(function(img) {
        if (!img || img.dataset.gsLoadBound === '1') return;
        if (img.complete && img.naturalWidth > 0) {
          if (img.classList) img.classList.add('loaded');
          img.dataset.gsLoadBound = '1';
          return;
        }
        img.addEventListener('load', function() {
          if (img.classList) img.classList.add('loaded');
        }, { once: true });
        img.dataset.gsLoadBound = '1';
      });
    };
  }

  if (typeof window.GSUtils.deferTemplateRender !== 'function') {
    window.GSUtils.deferTemplateRender = function(options) {
      options = options || {};
      var target = typeof options.target === 'string' ? document.querySelector(options.target) : options.target;
      var template = typeof options.template === 'string' ? document.querySelector(options.template) : options.template;
      if (!target || !template || !template.content) return;

      var rendered = false;
      var observer = null;
      var rootMargin = options.rootMargin || '260px';
      var idleTimeout = parseInt(options.idleTimeout, 10);
      var fallbackDelay = parseInt(options.fallbackDelay, 10);
      if (!(idleTimeout > 0)) idleTimeout = 2400;
      if (!(fallbackDelay >= 0)) fallbackDelay = 1000;

      function mount() {
        if (rendered) return;
        rendered = true;
        target.appendChild(template.content.cloneNode(true));
        if (template.parentNode) template.parentNode.removeChild(template);
        if (observer) observer.disconnect();
        if (window.GSUtils && typeof window.GSUtils.bindImageLoadState === 'function') {
          window.GSUtils.bindImageLoadState(target);
        }
      }

      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(function(entries) {
          if (entries[0] && entries[0].isIntersecting) mount();
        }, { rootMargin: rootMargin });
        observer.observe(target);
      }

      if (window.GSUtils && typeof window.GSUtils.requestIdle === 'function') {
        window.GSUtils.requestIdle(function() { mount(); }, idleTimeout, fallbackDelay);
      } else {
        setTimeout(function() { mount(); }, fallbackDelay);
      }
    };
  }

  if (typeof window.GSUtils.initSidebarLatestDefer !== 'function') {
    window.GSUtils.initSidebarLatestDefer = function(options) {
      options = options || {};
      var tabRoot = document.getElementById(options.tabId || 'sidebarArticleTab');
      var latestList = document.getElementById(options.latestListId || 'sidebar-latest');
      var latestTemplate = document.getElementById(options.templateId || 'sidebar-latest-template');
      if (!latestList || !latestTemplate || !latestTemplate.content) return;

      var mounted = false;
      var idleTimeout = parseInt(options.idleTimeout, 10);
      var fallbackDelay = parseInt(options.fallbackDelay, 10);
      if (!(idleTimeout > 0)) idleTimeout = 3200;
      if (!(fallbackDelay >= 0)) fallbackDelay = 1600;

      function mountLatest() {
        if (mounted) return;
        mounted = true;
        latestList.appendChild(latestTemplate.content.cloneNode(true));
        if (latestTemplate.parentNode) latestTemplate.parentNode.removeChild(latestTemplate);
        if (window.GSUtils && typeof window.GSUtils.bindImageLoadState === 'function') {
          window.GSUtils.bindImageLoadState(latestList);
        }
      }

      if (tabRoot && tabRoot.dataset.latestDeferBound !== '1') {
        tabRoot.dataset.latestDeferBound = '1';
        tabRoot.addEventListener('click', function(e) {
          var btn = e.target && e.target.closest ? e.target.closest('.tab-btn') : null;
          if (!btn) return;
          if (btn.dataset && btn.dataset.sidebarTab === 'latest') mountLatest();
        });
      }

      if (window.GSUtils && typeof window.GSUtils.requestIdle === 'function') {
        window.GSUtils.requestIdle(function() { mountLatest(); }, idleTimeout, fallbackDelay);
      } else {
        setTimeout(function() { mountLatest(); }, fallbackDelay);
      }
    };
  }

  window.GSUtils.__ready = true;
  if (typeof window.__gsFlushReadyQueue === 'function') {
    window.__gsFlushReadyQueue();
  }
})();
</script>`;

// 공통 스와이프 스크립트 (드래그 중 화면 이동 + 슬라이드 아웃 애니메이션)
const swipeScript = `
<script>
(function() {
  // 터치/코스 포인터가 아닌 환경에서는 스와이프 비활성화
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (!isTouchDevice) return;

  const navSections = ['magazine', 'wiki', 'tech', 'games', 'rankings', 'steam', 'upcoming'];

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
  let isNavigating = false;

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
    isNavigating = true;
    // 검색창 접힘 상태 저장
    try {
      if (document.body.classList.contains('search-hidden')) {
        sessionStorage.setItem('gs-search-hidden', '1');
      }
    } catch(e) {}
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
    if (isNavigating) return;
    if (!e.touches || e.touches.length > 1) return;

    const t = e.target;
    if (t && t.closest && t.closest('.nav, .nav-inner, .search-dropdown, .modal-overlay, input, textarea, .ad-card, .adsbygoogle, .mobile-fab, .mobile-side-panel, .mobile-side-overlay')) return;

    // 검색 드롭다운 닫기 (스와이프 시작 시)
    const searchDropdown = document.querySelector('.search-dropdown');
    if (searchDropdown && searchDropdown.classList.contains('active')) {
      searchDropdown.classList.remove('active');
      const searchInput = document.querySelector('.search-input');
      if (searchInput) searchInput.blur();
    }

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
        // 목표 scrollLeft 저장 (애니메이션 최종 위치)
        try {
          var targetScroll = getNavScrollPosForIndex(targetIdx);
          if (targetScroll !== null) sessionStorage.setItem('gs-nav-scroll', targetScroll);
        } catch(e) {}
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
      // URL과 nav active 상태 불일치 시 새로고침
      var activeNav = document.querySelector('.nav-item.active');
      var currentPath = window.location.pathname;
      var isHome = currentPath === '/' || currentPath === '/index.html';

      if (activeNav) {
        var activeHref = activeNav.getAttribute('href');
        // 홈(/)인데 다른 메뉴가 active → 불일치
        if (isHome) {
          location.reload();
          return;
        }
        // 서브 페이지 불일치 (예: URL=/wiki/ 인데 active=/tech/)
        if (activeHref && !currentPath.startsWith(activeHref.replace(/\\/$/, ''))) {
          location.reload();
          return;
        }
      } else {
        // activeNav가 null = 홈 페이지여야 함 (홈은 nav에 없음)
        // URL이 홈이 아니면 → 불일치
        if (!isHome) {
          location.reload();
          return;
        }
      }

      // main 요소 transform 리셋 (슬라이드 아웃 상태에서 복원 방지)
      var mainEl = document.querySelector('main.site-container');
      if (mainEl) {
        mainEl.style.transition = '';
        mainEl.style.transform = '';
      }
      isNavigating = false;

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

  // 스와이프 이동 시 검색창 접힘 상태 (body 시작 시 이미 적용됨)
  if (document.body.classList.contains('search-hidden')) {
    isHidden = true;
    lastScrollY = window.scrollY;
  }

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

// 폰트 로딩 (공통)
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
})();
</script>`;

// Ad init - AdSense queue is the standard mechanism: push() before script load is auto-processed on arrival.
const adLazyLoadScript = `
<script>
(function() {
  var ads = document.querySelectorAll('.adsbygoogle');
  if (!ads.length) return;

  function isHiddenAd(ad) {
    if (!ad) return true;
    var node = ad;
    while (node && node !== document.body) {
      if (node.offsetParent === null) return true;
      var cs = window.getComputedStyle ? getComputedStyle(node) : null;
      if (cs && cs.display === 'none') return true;
      node = node.parentElement;
    }
    return false;
  }

  // Phase B: cleanup registry — observers/listeners released on pagehide.
  var __gsAdCleanup = (window.__gsAdCleanup = window.__gsAdCleanup || []);
  if (!window.__gsAdCleanupBound) {
    window.__gsAdCleanupBound = true;
    window.addEventListener('pagehide', function() {
      while (__gsAdCleanup.length) {
        var fn = __gsAdCleanup.shift();
        try { if (typeof fn === 'function') fn(); } catch (e) {}
      }
    });
  }

  function getAdVisualWrapper(ad) {
    return ad && ad.closest
      ? ad.closest('.ad-card-responsive-home, .ad-card-responsive-top, .blog-in-article-ad')
      : null;
  }

  function normalizeAdVisualSize(ad) {
    var wrap = getAdVisualWrapper(ad);
    if (!wrap) return;

    var iframe = ad.querySelector && ad.querySelector('iframe');
    if (!iframe) return;

    var iframeHeight = Math.round(iframe.getBoundingClientRect().height || iframe.offsetHeight || 0);
    if (!iframeHeight) return;

    var isTopAd = wrap.classList.contains('ad-card-responsive-home') || wrap.classList.contains('ad-card-responsive-top');
    var minHeight = isTopAd
      ? ((window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ? 100 : 90)
      : 0;
    var targetHeight = Math.max(iframeHeight, minHeight);
    var adHeight = Math.round(ad.getBoundingClientRect().height || ad.offsetHeight || 0);
    var wrapHeight = Math.round(wrap.getBoundingClientRect().height || wrap.offsetHeight || 0);
    var hasExtraSpace = (adHeight - targetHeight > 24) || (wrapHeight - targetHeight > 24);
    var isShortTopAd = isTopAd && iframeHeight < minHeight;

    if (!hasExtraSpace && !isShortTopAd) return;

    wrap.classList.add('gs-ad-compact');
    wrap.style.height = targetHeight + 'px';
    wrap.style.minHeight = targetHeight + 'px';
    ad.style.height = targetHeight + 'px';
    ad.style.minHeight = targetHeight + 'px';

    if (isShortTopAd) {
      iframe.style.minHeight = minHeight + 'px';
    }
  }

  function observeAdVisualSize(ad) {
    if (!ad || ad.getAttribute('data-gs-size-observed') === '1') return;
    ad.setAttribute('data-gs-size-observed', '1');

    var scheduled = false;
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function() {
        scheduled = false;
        normalizeAdVisualSize(ad);
      });
    }

    ad.addEventListener('load', schedule, true);
    if (window.MutationObserver) {
      var mutationObserver = new MutationObserver(schedule);
      mutationObserver.observe(ad, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['style', 'data-ad-status']
      });
    }
    if (window.ResizeObserver) {
      var resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(ad);
      var wrap = getAdVisualWrapper(ad);
      if (wrap) resizeObserver.observe(wrap);
    }

    schedule();
    setTimeout(schedule, 600);
    setTimeout(schedule, 1800);
  }

  function pushAd(ad) {
    if (!ad) return;
    if (document.body.classList.contains('ads-disabled')) return;
    if (ad.getAttribute('data-gs-ad-pushed') === '1') return;
    if (isHiddenAd(ad)) return;
    observeAdVisualSize(ad);
    ad.setAttribute('data-gs-ad-pushed', '1');
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      ad.removeAttribute('data-gs-ad-pushed');
    }
  }

  for (var a = 0; a < ads.length; a++) { observeAdVisualSize(ads[a]); }

  var shouldPushAllAdsNow = !!document.querySelector('.article-layout .article-main');
  if (shouldPushAllAdsNow) {
    for (var eagerIndex = 0; eagerIndex < ads.length; eagerIndex++) {
      pushAd(ads[eagerIndex]);
    }
    return;
  }

  // ATF ad fallback: eager ad slots may already have pushed next to the <ins>.
  pushAd(ads[0]);

  // BTF ads: IntersectionObserver lazy load (with no-IO fallback).
  if (ads.length > 1) {
    if (!('IntersectionObserver' in window)) {
      for (var j = 1; j < ads.length; j++) { pushAd(ads[j]); }
      return;
    }
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          pushAd(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '1200px' });

    for (var i = 1; i < ads.length; i++) { observer.observe(ads[i]); }
    __gsAdCleanup.push(function() { try { observer.disconnect(); } catch (e) {} });
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

  // 이미지 로드 완료 시 loaded 클래스 추가 (FOUC/CLS 방지)
  function markImageLoaded(img) {
    if (img.classList) img.classList.add('loaded');
  }

  function initImageLoadHandlers() {
    document.querySelectorAll('.home-trend-card-image img, .category-list-thumb img, .home-popular-thumb img, .weekly-hot-thumb img, .metric-thumb img, .industry-thumb img').forEach(function(img) {
      if (img.complete && img.naturalWidth > 0) {
        markImageLoaded(img);
      } else {
        img.addEventListener('load', function() { markImageLoaded(img); }, { once: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageLoadHandlers);
  } else {
    initImageLoadHandlers();
  }
})();
</script>`;

// 기본 사이드바 콘텐츠 (카테고리 링크)
function generateDefaultSidebarContent(counts = {}, articles = {}) {
  const c = (key) => counts[key] !== undefined ? ` (${counts[key]})` : '';
  const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 페이지별 articles > 전역 변수 순으로 폴백
  const popularItems = (articles.popular && articles.popular.length > 0) ? articles.popular : globalPopularArticles;
  const latestItems = (articles.latest && articles.latest.length > 0) ? articles.latest : globalLatestArticles;

  const renderArticleList = (items) => items.slice(0, 10).map((item, i) => `
    <a href="${item.url || item.path || item.link || '#'}" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
    </a>
  `).join('');

  return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/issue/" class="sidebar-category-item"><span class="sidebar-category-name">이슈${c('issue')}</span></a>
          <a href="/magazine/insight/" class="sidebar-category-item"><span class="sidebar-category-name">인사이트${c('insight')}</span></a>
          <a href="/magazine/hotpick/" class="sidebar-category-item"><span class="sidebar-category-name">핫픽${c('hotpick')}</span></a>
          <a href="/magazine/ranking/" class="sidebar-category-item"><span class="sidebar-category-name">순위 분석${c('ranking')}</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/wiki/history/" class="sidebar-category-item"><span class="sidebar-category-name">히스토리${c('history')}</span></a>
          <a href="/wiki/knowledge/" class="sidebar-category-item"><span class="sidebar-category-name">지식${c('knowledge')}</span></a>
          <a href="/wiki/business/" class="sidebar-category-item"><span class="sidebar-category-name">비즈니스${c('business')}</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/tech/normal/" class="sidebar-category-item"><span class="sidebar-category-name">일반${c('normal')}</span></a>
          <a href="/tech/ai/" class="sidebar-category-item"><span class="sidebar-category-name">AI${c('ai')}</span></a>
          <a href="/tech/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">바이브코딩${c('vibecoding')}</span></a>
        </div>
      </div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="panelSidebarTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
          <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="panel-sidebar-popular">${renderArticleList(popularItems)}</div>
        <div class="sidebar-article-list" id="panel-sidebar-latest">${renderArticleList(latestItems)}</div>
      </div>
    </div>
  `;
}

// 모바일 사이드 패널 HTML 생성
function generateMobileSidePanel(sidebarContent = '') {
  const content = sidebarContent || generateDefaultSidebarContent();
  return `
    <div class="mobile-side-overlay" id="mobileSideOverlay"></div>
    <div class="mobile-side-panel" id="mobileSidePanel">
      <div class="mobile-side-panel-header">
        <span class="mobile-side-panel-title">메뉴</span>
        <button class="mobile-side-panel-close" id="mobileSidePanelClose" aria-label="닫기">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="mobile-side-panel-body">
        ${content}
      </div>
    </div>
    <button class="mobile-fab" id="mobileFab" aria-label="메뉴 열기">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>
  `;
}

// 모바일 사이드 패널 스크립트
const mobileSidePanelScript = `<script>
(function() {
  const fab = document.getElementById('mobileFab');
  const panel = document.getElementById('mobileSidePanel');
  const overlay = document.getElementById('mobileSideOverlay');
  const closeBtn = document.getElementById('mobileSidePanelClose');
  if (!fab || !panel || !overlay) return;

  function openPanel() {
    panel.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function togglePanel() {
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      openPanel();
    }
  }

  fab.addEventListener('click', togglePanel);
  closeBtn?.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);

  // 패널 내 링크 클릭 시 닫기
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      closePanel();
    }
  });

  // 모바일 사이드 패널 내 인기/최신 토글
  const panelSidebarTab = panel.querySelector('#panelSidebarTab');
  panelSidebarTab?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    panelSidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.sidebarTab;
    panel.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
    panel.querySelector('#panel-sidebar-' + target)?.classList.add('active');
  });
})();
</script>`;

function unwrapScriptTag(scriptBlock = '') {
  const script = String(scriptBlock || '').trim();
  if (!script) return '';
  return script
    .replace(/^<script>\s*/i, '')
    .replace(/\s*<\/script>$/i, '')
    .trim();
}

function buildLayoutCoreBundle() {
  return `${unwrapScriptTag(lazyCardHydrationScript)}\n`;
}

function buildLayoutRuntimeBundle(options = {}) {
  const searchIndexVersion = String(options.searchIndexVersion || globalSearchIndexVersion || 'v1');
  const searchCacheKey = `gs_si_${searchIndexVersion}`;
  const scripts = [
    footerModalScript,
    adLazyLoadScript,
    imageFallbackScript,
    fontAndEmojiScript,
    searchBarScript.replace(/gamerscroll_search_index_v1/g, searchCacheKey),
    swipeScript,
    mobileScrollHideScript,
    mobileSidePanelScript
  ];
  return `${scripts.map(unwrapScriptTag).join('\n\n')}\n`;
}

function buildCardFeedPagerScript(options = {}) {
  const {
    grid = '',
    pagination = '',
    deferredJson = '',
    deferredTemplate = '',
    itemSelector = '.home-trend-card',
    pageSize = 15,
    hydrateLazyImages = true,
    mobileAds = true,
    adInterval = 3,
    mobileDomWindowPages = 5,
    prevSelector = '.home-page-prev, .home-prev',
    nextSelector = '.home-page-next, .home-next',
    infoSelector = '.home-page-info, .home-page-index',
    adSlots = ['6662567459', '9737299266', '9204970318', '3171890915', '8232645901'],
    initialRenderCount = 15,
    idleFillFirstPage = false,
    idleFillDelay = 120,
    sidebarTabId = ''
  } = options;

  if (!grid || !pagination) return '';

  const safeNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const safeBool = (value) => value === true;

  const deferredJsonOption = deferredJson ? `,\n        deferredJson: ${JSON.stringify(deferredJson)}` : '';
  const deferredTemplateOption = deferredTemplate ? `,\n        deferredTemplate: ${JSON.stringify(deferredTemplate)}` : '';
  const sidebarToggleScript = sidebarTabId
    ? `\n      window.GSUtils.toggleSidebarArticleTab(${JSON.stringify(sidebarTabId)});`
    : '';

  return `
  <script>
    (function() {
      var initialized = false;
      var init = function() {
        if (initialized) return;
        initialized = true;
        if (!window.GSUtils || typeof window.GSUtils.initCardFeedPager !== 'function') return;
        window.GSUtils.initCardFeedPager({
          grid: ${JSON.stringify(grid)},
          pagination: ${JSON.stringify(pagination)},
          itemSelector: ${JSON.stringify(itemSelector)},
          pageSize: ${safeNumber(pageSize, 15)},
          hydrateLazyImages: ${safeBool(hydrateLazyImages)},
          mobileAds: ${safeBool(mobileAds)},
          adInterval: ${safeNumber(adInterval, 3)},
          mobileDomWindowPages: ${safeNumber(mobileDomWindowPages, 5)},
          prevSelector: ${JSON.stringify(prevSelector)},
          nextSelector: ${JSON.stringify(nextSelector)},
          infoSelector: ${JSON.stringify(infoSelector)},
          adSlots: ${JSON.stringify(Array.isArray(adSlots) ? adSlots : [])},
          initialRenderCount: ${safeNumber(initialRenderCount, 15)},
          idleFillFirstPage: ${safeBool(idleFillFirstPage)},
          idleFillDelay: ${safeNumber(idleFillDelay, 120)}${deferredJsonOption}${deferredTemplateOption}
        });${sidebarToggleScript}
      };
      if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.initCardFeedPager === 'function') {
        init();
        return;
      }
      if (typeof window.__gsOnReady === 'function') {
        window.__gsOnReady(init);
        return;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    })();
  </script>`;
}

const coreReadyBootstrapScript = `
  <script>
    (function() {
      if (typeof window.__gsOnReady !== 'function') {
        var readyQueue = [];
        window.__gsOnReady = function(fn) {
          if (typeof fn !== 'function') return;
          if (window.GSUtils && window.GSUtils.__ready === true) {
            try { fn(); } catch (e) {}
            return;
          }
          readyQueue.push(fn);
        };
        window.__gsFlushReadyQueue = function() {
          if (!window.GSUtils || window.GSUtils.__ready !== true) return;
          var queue = readyQueue.slice();
          readyQueue.length = 0;
          queue.forEach(function(fn) {
            try { fn(); } catch (e) {}
          });
        };
      }
    })();
  </script>`;

function wrapWithLayout(content, options = {}) {
  const {
    currentPage = 'home',
    title = '게이머스크롤 | 게임 데이터 & 아티클',
    description = '게임 데이터 & 아티클 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    keywords,
    canonical = 'https://gamerscroll.com',
    pageScripts = '',
    showSearchBar = true,
    pageData = {},
    articleSchema = null,  // Article JSON-LD (리포트 페이지용)
    articleSection = '',  // article:section OG 메타 (자동 추론 가능)
    noindex = false,  // 검색엔진 인덱싱 제외 (thin content용)
    breadcrumbs = null,  // BreadcrumbList JSON-LD
    softwareSchema = null,  // SoftwareApplication JSON-LD (게임 페이지용)
    cssFilename = globalCssFilename,  // 기본 CSS 파일명 (전역 설정 사용)
    cssFilenames = null,  // 다중 CSS 파일명
    sidebarContent = '',  // 모바일 사이드 패널 콘텐츠
    sidebarCounts = {},  // 모바일 사이드 패널 카테고리 숫자
    sidebarArticles = {},  // 모바일 사이드 패널 인기/최신 글 { popular: [], latest: [] }
    bodyClass = '',  // 추가 body 클래스 (예: 'category-detail')
    loadApexCharts = false,
    loadTwitterWidget = false,
    ogImage = ''
  } = options;

  // 실제 사용할 counts (페이지별 > 글로벌 순으로 폴백)
  const effectiveCounts = Object.keys(sidebarCounts).length > 0 ? sidebarCounts : globalSidebarCounts;
  const runtimeScriptVersion = encodeURIComponent(globalRuntimeAssetVersion || 'v1');
  const coreScriptUrl = `/assets/${LAYOUT_CORE_ASSET}?v=${runtimeScriptVersion}`;
  const runtimeScriptUrl = `/assets/${LAYOUT_RUNTIME_ASSET}?v=${runtimeScriptVersion}`;
  const baseCssFiles = Array.isArray(cssFilenames) && cssFilenames.length > 0
    ? cssFilenames
    : [cssFilename];
  const resolvedCssFiles = (() => {
    const files = [...baseCssFiles, ...getPageExtraCssFiles(currentPage)];
    const seen = new Set();
    const out = [];
    for (const file of files) {
      const normalized = String(file || '').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  })();

  const shouldLoadApexCharts = loadApexCharts || /ApexCharts/.test(pageScripts || '') || /ApexCharts/.test(content || '');
  const shouldLoadTwitterWidget = loadTwitterWidget || /twitter-tweet/.test(content || '') || /twitter-tweet/.test(pageScripts || '');

  // article:section 자동 추론 (명시적으로 전달되지 않은 경우 canonical URL에서 파생)
  const resolvedArticleSection = articleSection || (() => {
    if (!articleSchema) return '';
    const url = String(canonical || '');
    if (url.includes('/tech/ai/')) return 'AI';
    if (url.includes('/tech/vibecoding/')) return '바이브코딩';
    if (url.includes('/tech/normal/') || url.includes('/tech/')) return '테크';
    if (url.includes('/wiki/')) return '위키';
    if (url.includes('/magazine/issue/')) return '이슈';
    if (url.includes('/magazine/insight/')) return '인사이트';
    if (url.includes('/magazine/hotpick/')) return '핫픽';
    if (url.includes('/magazine/ranking/')) return '순위 분석';
    if (url.includes('/magazine/')) return '매거진';
    return '게임';
  })();

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  ${generateHead({ title, description, keywords, canonical, pageData, articleSchema, articleSection: resolvedArticleSection, noindex, breadcrumbs, softwareSchema, ogImage, cssFilename, cssFilenames: resolvedCssFiles })}
</head>
<body class="${currentPage ? `page-${currentPage}` : ''}${bodyClass ? ` ${bodyClass}` : ''}${!ADS_ENABLED ? ' ads-disabled' : ''}">
  <script>try{if(sessionStorage.getItem('gs-search-hidden')==='1'){document.body.classList.add('search-hidden');sessionStorage.removeItem('gs-search-hidden');}}catch(e){}</script>
  ${generateHeader()}
  ${showSearchBar ? searchBarHtml : ''}
  ${generateNav(currentPage)}
  <main class="site-container">
    ${coreReadyBootstrapScript}
    <script defer src="${coreScriptUrl}"></script>
    ${content}
    ${pageScripts}
  </main>
  ${generateMobileSidePanel(sidebarContent || generateDefaultSidebarContent(effectiveCounts, sidebarArticles))}
  ${generateFooter()}
  <script defer src="${runtimeScriptUrl}"></script>
  ${shouldLoadTwitterWidget ? '<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>' : ''}
  ${shouldLoadApexCharts ? '<script src="https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js" defer></script>' : ''}
  <script>
    (function() {
      if (!('serviceWorker' in navigator)) return;
      if (location.protocol !== 'https:') return;
      var host = location.hostname;
      if (host !== 'gamerscroll.com' && host !== 'www.gamerscroll.com') return;
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js').catch(function() {});
      });
    })();
  </script>
  <script>(function(){if(document.body.classList.contains('search-hidden'))window.scrollTo(0,64);var n=window.innerWidth<=768?document.querySelector('.nav-inner'):null;if(n){n.style.transition='none';n.offsetHeight;n.style.visibility='visible';n.classList.add('nav-ready');}if(n)setTimeout(function(){n.style.transition='';},50);})();</script>
  <script>(function(){document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a||a.target==='_blank')return;try{if(document.body.classList.contains('search-hidden'))sessionStorage.setItem('gs-search-hidden','1');else sessionStorage.removeItem('gs-search-hidden');}catch(ex){}},true);})();</script>
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
  return renderHomeAdPair(pcSlotId, mobileSlotId);
}

// 중간 광고용 (반응형)
function generateMidAdPairSlot(pcSlotId, mobileSlotId) {
  return renderContentAd(pcSlotId);
}

function generateHomeAdPairSlot(pcSlotId, mobileSlotId, options = {}) {
  if (options.mobileOnly) {
    return renderMobileOnlyHomeAd(mobileSlotId || pcSlotId);
  }
  return renderHomeAdPair(pcSlotId, mobileSlotId);
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
  generateMultiplexAdSlot,
  setCssFilename,  // 해시 기반 CSS 파일명 설정
  getCssFilename,
  setSearchIndexVersion,  // 검색 인덱스 버전 설정 (캐시 무효화)
  setRuntimeAssetVersion,
  buildLayoutCoreBundle,
  buildLayoutRuntimeBundle,
  buildCardFeedPagerScript,
  LAYOUT_CORE_ASSET,
  LAYOUT_RUNTIME_ASSET,
  setGlobalSidebarCounts,  // 글로벌 사이드바 카운트 설정
  getGlobalSidebarCounts,
  setGlobalSidebarArticles  // 글로벌 사이드바 인기/최신 글 설정
};
