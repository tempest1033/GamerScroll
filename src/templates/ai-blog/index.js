/**
 * AIScroll 홈페이지 템플릿
 * GamerScroll 레이아웃 기반, AI 블로그 전용
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCardFeedPagerScript, LAYOUT_CORE_ASSET, buildLayoutCoreBundle, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');

// 사이트 설정
const SITE_CONFIG = {
  name: 'AIScroll',
  baseUrl: 'https://aiscroll.io',
  title: 'AIScroll - AI Industry Insights',
  description: 'Latest AI news, trends, and insights. Stay updated with the AI industry.',
  keywords: 'AI news, artificial intelligence, ChatGPT, Claude, machine learning, AI trends',
  favicon: '/favicon.svg',
  ogImage: '/og-image.png'
};

// AIScroll 헤더 (로고 + 검색창 - PC용)
function generateHeader() {
  return `
  <header id="aiscroll-header" class="header aiscroll-header">
    <div class="header-inner aiscroll-header-inner">
      <div class="header-title aiscroll-logo">
        <a href="/">
          <span class="visually-hidden">AIScroll</span>
          <svg class="logo-svg" viewBox="0 0 400 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#4f46e5" />
                <stop offset="100%" stop-color="#06b6d4" />
              </linearGradient>
            </defs>
            <text class="logo-text-svg" x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="52" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">AI SCROLL</text>
            <!-- 왼쪽 안테나 -->
            <rect x="6" y="18" width="8" height="20" rx="4" fill="url(#techGrad)" opacity="0.4"/>
            <rect x="20" y="12" width="8" height="32" rx="4" fill="url(#techGrad)" opacity="0.7"/>
            <rect x="34" y="6" width="8" height="44" rx="4" fill="url(#techGrad)"/>
            <!-- 오른쪽 안테나 -->
            <rect x="358" y="6" width="8" height="44" rx="4" fill="url(#techGrad)"/>
            <rect x="372" y="12" width="8" height="32" rx="4" fill="url(#techGrad)" opacity="0.7"/>
            <rect x="386" y="18" width="8" height="20" rx="4" fill="url(#techGrad)" opacity="0.4"/>
          </svg>
        </a>
      </div>
      <div class="aiscroll-search">
        <div class="search-box">
          <input type="text" class="search-input" placeholder="Search articles..." autocomplete="off">
          <button class="search-btn" type="button" aria-label="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>
        <div class="search-dropdown"></div>
      </div>
    </div>
  </header>`;
}

// AIScroll 검색 컨테이너 (모바일용 - GamerScroll 스타일)
function generateSearchContainer() {
  return `
  <div class="search-container">
    <div class="search-box">
      <a href="/" class="search-home-icon" aria-label="Home">
        <img src="/favicon.svg" alt="" width="20" height="20">
      </a>
      <input type="text" class="search-input" placeholder="Search articles..." autocomplete="off">
      <button class="search-btn" type="button" aria-label="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </button>
    </div>
    <div class="search-dropdown"></div>
  </div>`;
}

// AIScroll 푸터 (GamerScroll 스타일, 영문)
function generateFooter() {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <span>© ${year} AIScroll</span>
    <span class="footer-divider">|</span>
    <a href="/privacy/" class="footer-privacy-link">Privacy Policy</a>
  </footer>`;
}

// AIScroll 네비게이션 (카테고리 5개)
const AI_NAV_ITEMS = [
  { id: 'general', label: 'General', href: '/article/general/' },
  { id: 'openai', label: 'OpenAI', href: '/article/openai/' },
  { id: 'google', label: 'Google', href: '/article/google/' },
  { id: 'anthropic', label: 'Anthropic', href: '/article/anthropic/' },
  { id: 'vibecoding', label: 'Coding', href: '/article/vibecoding/' }
];

// 글로벌 사이드바 카운트 (모바일 메뉴용)
let globalSidebarCounts = {};
let globalPopularArticles = [];
let globalLatestArticles = [];

function setGlobalSidebarCounts(counts) {
  globalSidebarCounts = counts;
}

function setGlobalSidebarArticles(popular, latest) {
  globalPopularArticles = popular || [];
  globalLatestArticles = latest || [];
}

// 모바일 사이드 패널 기본 콘텐츠 생성
function generateDefaultSidebarContent(counts = {}) {
  const c = (key) => counts[key] !== undefined ? ` (${counts[key]})` : '';
  const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const renderArticleList = (items) => items.slice(0, 10).map((item, i) => `
    <a href="/article/${item.category || 'general'}/${item.slug}/" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
    </a>
  `).join('');

  return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><span class="home-card-title-link"><h2 class="home-card-title">Categories</h2></span></div>
        <div class="sidebar-category-list">
          <a href="/article/general/" class="sidebar-category-item"><span class="sidebar-category-name">General${c('general')}</span></a>
          <a href="/article/openai/" class="sidebar-category-item"><span class="sidebar-category-name">OpenAI${c('openai')}</span></a>
          <a href="/article/google/" class="sidebar-category-item"><span class="sidebar-category-name">Google${c('google')}</span></a>
          <a href="/article/anthropic/" class="sidebar-category-item"><span class="sidebar-category-name">Anthropic${c('anthropic')}</span></a>
          <a href="/article/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">Vibe Coding${c('vibecoding')}</span></a>
        </div>
      </div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="panelSidebarTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">Popular</button>
          <button class="tab-btn small" data-sidebar-tab="latest">Latest</button>
        </div>
      </div>
      <div class="home-card-body">
        <div class="sidebar-article-list active" id="panel-sidebar-popular">${renderArticleList(globalPopularArticles)}</div>
        <div class="sidebar-article-list" id="panel-sidebar-latest">${renderArticleList(globalLatestArticles)}</div>
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
        <span class="mobile-side-panel-title">Menu</span>
        <button class="mobile-side-panel-close" id="mobileSidePanelClose" aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="mobile-side-panel-body">
        ${content}
      </div>
    </div>
    <button class="mobile-fab" id="mobileFab" aria-label="Open menu">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>
  `;
}

// 모바일 사이드 패널 스크립트
const mobileSidePanelScript = `<script>
(function() {
  var fab = document.getElementById('mobileFab');
  var panel = document.getElementById('mobileSidePanel');
  var overlay = document.getElementById('mobileSideOverlay');
  var closeBtn = document.getElementById('mobileSidePanelClose');
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

  fab.addEventListener('click', function() {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  });
  overlay.addEventListener('click', closePanel);
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  // 사이드바 탭 전환 (Popular/Latest)
  var panelTabWrap = document.getElementById('panelSidebarTab');
  if (panelTabWrap) {
    panelTabWrap.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-sidebar-tab]');
      if (!btn) return;
      var tab = btn.getAttribute('data-sidebar-tab');
      panelTabWrap.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var popList = document.getElementById('panel-sidebar-popular');
      var latList = document.getElementById('panel-sidebar-latest');
      if (popList) popList.classList.toggle('active', tab === 'popular');
      if (latList) latList.classList.toggle('active', tab === 'latest');
    });
  }
})();
</script>`;

function generateNav(currentPage = 'home') {
  const currentIdx = AI_NAV_ITEMS.findIndex(item => item.id === currentPage);
  return `
  <nav class="nav">
    <div class="nav-inner">
      ${AI_NAV_ITEMS.map(item => `
      <a class="nav-item${item.id === currentPage ? ' active' : ''}" href="${item.href}">${item.label}</a>`).join('')}
    </div>
  </nav>
  <script>
  (function(){
    if(window.innerWidth>768)return;
    function init(r){
      var n=document.querySelector('.nav-inner');
      if(!n)return;
      var cw=n.clientWidth,sw=n.scrollWidth;
      if(cw<=0){if(!r)requestAnimationFrame(function(){init(1);});return;}
      if(sw<=cw+1){n.classList.add('nav-ready');return;}
      var idx=${currentIdx};
      var items=n.querySelectorAll('.nav-item');
      var t=idx<0?items[0]:items[idx];
      if(t){
        var left=t.offsetLeft,tw=t.offsetWidth;
        n.scrollLeft=Math.max(0,left+tw/2-cw/2);
      }
      n.classList.add('nav-ready');
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
    else init();
  })();
  </script>`;
}

// 검색바는 헤더에 통합됨 (aiscroll-search)
const searchBarHtml = '';

// 날짜 포맷 헬퍼 (2026-01-30 → Jan 30, 2026)
function formatDateEn(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// HTML 이스케이프
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 썸네일 URL 처리
function getThumbUrl(url, width = 480) {
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  // 로컬 경로는 그대로 사용 (이미지 복사됨)
  if (url.startsWith('/assets/') || url.startsWith('/favicon')) {
    return url;
  }
  if (url.startsWith('http')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp`;
  }
  return url;
}

function getThumbSrcset(url, xsWidth = 240, smWidth = 480, sizes = '(max-width: 768px) 133px, 253px') {
  const xsUrl = getThumbUrl(url, xsWidth);
  const smUrl = getThumbUrl(url, smWidth);
  if (!smUrl) return { src: '', srcset: '' };
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} ${xsWidth}w, ${smUrl} ${smWidth}w`,
    sizes
  };
}

const FEED_PAGE_SIZE = 15;
const INITIAL_FEED_RENDER_COUNT = 9;
const AI_LAYOUT_ASSET_VERSION = (() => {
  try {
    const coreBundle = buildLayoutCoreBundle();
    if (!coreBundle || typeof coreBundle !== 'string') return 'v1';
    return crypto.createHash('md5').update(coreBundle).digest('hex').slice(0, 10);
  } catch (_) {
    return 'v1';
  }
})();

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

function extractSeoLinkFromCardHtml(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return null;
  const hrefMatch = cardHtml.match(/<a[^>]*href="([^"]+)"/i);
  if (!hrefMatch || !hrefMatch[1]) return null;

  let title = '';
  const lazyTitleMatch = cardHtml.match(/alt="([^"]+)"/i);
  if (lazyTitleMatch && lazyTitleMatch[1]) title = lazyTitleMatch[1];
  if (!title) {
    const titleMatch = cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return {
    href: hrefMatch[1],
    title: title || hrefMatch[1]
  };
}

function serializeDeferredCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return JSON.stringify(cards).replace(/</g, '\\u003c');
}

function renderDeferredSeoLinks(links, id = '') {
  if (!Array.isArray(links) || links.length === 0) return '';
  const idAttr = id ? ` id="${id}"` : '';
  return `<div class="visually-hidden"${idAttr}>${links.map((link) => `
    <a href="${escapeHtml(link.href)}">${escapeHtml(link.title || link.href)}</a>
  `).join('')}</div>`;
}

function buildDeferredCardPayload(cardHtmlList, pageSize = FEED_PAGE_SIZE, initialRenderCount = pageSize) {
  const safeCards = Array.isArray(cardHtmlList) ? cardHtmlList.filter(item => typeof item === 'string' && item.trim() !== '') : [];
  const safeInitialRenderCount = Math.max(1, Math.min(initialRenderCount, pageSize));
  const initialCards = safeCards.slice(0, safeInitialRenderCount);
  const deferredCards = safeCards.slice(safeInitialRenderCount);
  const deferredLinks = deferredCards.map(extractSeoLinkFromCardHtml).filter(Boolean);

  return {
    initialHtml: initialCards.join(''),
    deferredJson: serializeDeferredCards(deferredCards),
    deferredSeoLinksHtml: renderDeferredSeoLinks(deferredLinks)
  };
}

/**
 * AIScroll 홈페이지 생성
 */
function generateAIBlogIndex(data) {
  const { articles = [], popularArticles = [], latestArticles = [] } = data;
  const hasPopularLcpCandidate = popularArticles.length > 0;
  const lcpImageAttrs = 'loading="eager" fetchpriority="high" decoding="async"';
  const lazyImageAttrs = 'loading="lazy" fetchpriority="auto" decoding="async"';

  // 인기 카드 (1,2등 그리드 + 3,4,5등 가로형)
  function generatePopularCards() {
    const items = popularArticles.slice(0, 5);
    if (items.length === 0) return '';

    // 1, 2등: 2컬럼 그리드
    const topItems = items.slice(0, 2);
    const topGrid = topItems.map((item, idx) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="home-trend-card">
        <div class="home-trend-card-image">
          ${item.thumbnail ? (() => {
            const thumbData = getThumbSrcset(item.thumbnail, 320, 640, '(max-width: 768px) 46vw, 360px');
            const imgAttrs = thumbData.srcset
              ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
              : `src="${thumbData.src}"`;
            const perfAttrs = idx === 0 ? lcpImageAttrs : lazyImageAttrs;
            return `<img ${imgAttrs} alt="${escapeHtml(item.title)}" ${perfAttrs} data-img-fallback="hide">`;
          })() : ''}
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(item.title)}</span></h3>
      </a>
    `).join('');

    // 3, 4, 5등: 가로형
    const restItems = items.slice(2, 5);
    const restList = restItems.map((item) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? (() => {
            const thumbData = getThumbSrcset(item.thumbnail, 200, 400, '(max-width: 768px) 33vw, 200px');
            const imgAttrs = thumbData.srcset
              ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
              : `src="${thumbData.src}"`;
            return `<img ${imgAttrs} alt="${escapeHtml(item.title)}" ${lazyImageAttrs} data-img-fallback="hide">`;
          })() : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${escapeHtml(item.title)}</h3>
          ${item.summary ? `<p class="home-popular-summary">${escapeHtml(item.summary)}</p>` : ''}
        </div>
      </a>
    `).join('');

    return `
      <div class="home-card" id="home-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">Popular</h2>
        </div>
        <div class="popular-top-grid">${topGrid}</div>
        <div class="home-popular-list">${restList}</div>
      </div>
    `;
  }

  // 최신 카드 (3컬럼 그리드)
  function generateLatestGrid() {
    const items = articles;
    if (items.length === 0) return '';

    const cardEntries = items.map((item, i) => {
      const thumbData = getThumbSrcset(item.thumbnail, 240, 480, '(max-width: 768px) 133px, 253px');
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      const perfAttrs = (!hasPopularLcpCandidate && i === 0) ? lcpImageAttrs : lazyImageAttrs;
      return `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${thumbData.src ? `<img ${imgAttrs} alt="${escapeHtml(item.title)}" ${perfAttrs} data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag">${formatDateEn(item.date)}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(item.title)}</span></h3>
      </a>
    `;
    });
    const cardPayload = buildDeferredCardPayload(cardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);

    const totalPages = Math.ceil(items.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="home-latest">
        <div class="home-card-header">
          <h2 class="home-card-title">Latest</h2>
        </div>
        <div class="home-latest-grid" id="homeLatestGrid">${cardPayload.initialHtml}</div>
        ${cardPayload.deferredJson ? `<script type="application/json" id="homeLatestDeferredData">${cardPayload.deferredJson}</script>${cardPayload.deferredSeoLinksHtml}` : ''}
        <div class="home-pagination" data-total="${items.length}" data-per-page="${FEED_PAGE_SIZE}" data-initial-render="${INITIAL_FEED_RENDER_COUNT}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next">›</button>
        </div>
      </div>
    `;
  }

  // 카테고리 메뉴
  function generateCategoryMenu() {
    const categories = [
      { id: 'general', label: 'General' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'google', label: 'Google' },
      { id: 'anthropic', label: 'Anthropic' },
      { id: 'vibecoding', label: 'Vibe Coding' }
    ];
    // 카테고리별 기사 개수 계산
    const countByCategory = {};
    articles.forEach(a => {
      const cat = a.category || 'general';
      countByCategory[cat] = (countByCategory[cat] || 0) + 1;
    });
    return `
      <div class="home-card" id="sidebar-categories">
        <div class="sidebar-category-group">
          <div class="home-card-header">
            <h3 class="home-card-title">Categories</h3>
          </div>
          <div class="sidebar-category-list">
            ${categories.map(cat => `
              <a href="/article/${cat.id}/" class="sidebar-category-item">
                <span class="sidebar-category-name">${cat.label} (${countByCategory[cat.id] || 0})</span>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 사이드바: 인기/최신 토글
  function generateSidebarArticles() {
    const renderList = (items) => items.slice(0, 10).map((item, i) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
      </a>
    `).join('');
    const latestListHtml = renderList(latestArticles);

    return `
      ${generateCategoryMenu()}
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">Popular</button>
            <button class="tab-btn small" data-sidebar-tab="latest">Latest</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(popularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest"></div>
          <template id="sidebar-latest-template">${latestListHtml}</template>
        </div>
      </div>
    `;
  }

  // 상단 광고
  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001);

  // 메인 콘텐츠
  const content = `
    <section class="home-section active" id="home">
      <h1 class="visually-hidden">${SITE_CONFIG.title}</h1>
      <div class="page-container">
        <div class="home-container">
          <div class="home-main">
            ${topAds}
            ${generatePopularCards()}
            ${generateLatestGrid()}
          </div>
          <div class="home-sidebar">
            <div class="home-sidebar-sticky">
              ${generateSidebarArticles()}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // 페이지 스크립트 (GamerScroll 공통 페이저/탭 유틸 동일 사용)
  const sidebarLatestDeferScript = `
  <script>
    (function() {
      var init = function() {
        if (!window.GSUtils || typeof window.GSUtils.initSidebarLatestDefer !== 'function') return;
        window.GSUtils.initSidebarLatestDefer({
          tabId: 'sidebarArticleTab',
          latestListId: 'sidebar-latest',
          templateId: 'sidebar-latest-template',
          idleTimeout: 3200,
          fallbackDelay: 1600
        });
      };
      if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.initSidebarLatestDefer === 'function') {
        init();
      } else if (typeof window.__gsOnReady === 'function') {
        window.__gsOnReady(init);
      } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    })();
  </script>`;
  const pageScripts = `
    ${buildCardFeedPagerScript({
      grid: '#homeLatestGrid',
      pagination: '.home-pagination',
      deferredJson: '#homeLatestDeferredData',
      itemSelector: '.home-latest-item',
      pageSize: FEED_PAGE_SIZE,
      hydrateLazyImages: false,
      mobileAds: false,
      prevSelector: '.home-page-prev',
      nextSelector: '.home-page-next',
      infoSelector: '.home-page-info',
      initialRenderCount: INITIAL_FEED_RENDER_COUNT,
      idleFillFirstPage: true,
      idleFillDelay: 120,
      mobileDomWindowPages: 5,
      sidebarTabId: 'sidebarArticleTab'
    })}
    ${sidebarLatestDeferScript}
  `;

  // WebSite JSON-LD for homepage (includes SearchAction)
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": SITE_CONFIG.name,
    "alternateName": ["AI Scroll", "aiscroll"],
    "url": SITE_CONFIG.baseUrl,
    "description": SITE_CONFIG.description,
    "publisher": {
      "@type": "Organization",
      "name": SITE_CONFIG.name,
      "url": SITE_CONFIG.baseUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${SITE_CONFIG.baseUrl}/icon-192.png`
      }
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${SITE_CONFIG.baseUrl}/search/?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return wrapWithLayout(content, {
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    keywords: SITE_CONFIG.keywords,
    canonical: SITE_CONFIG.baseUrl + '/',
    pageScripts: pageScripts,
    jsonLd: websiteJsonLd
  });
}

// 이미지 fallback 스크립트 (GamerScroll 공통)
const imageFallbackScript = `
<script>
(function() {
  function applyFallback(img) {
    if (!img || img.tagName !== 'IMG') return;
    if (img.dataset.gcImgFallbackApplied === '1') return;
    var action = img.dataset.imgFallback || '';
    if (action === 'hide') {
      img.style.display = 'none';
    } else if (action === 'hide-visibility') {
      img.style.visibility = 'hidden';
    }
    img.dataset.gcImgFallbackApplied = '1';
  }
  document.addEventListener('error', function(e) {
    var t = e && e.target;
    if (t && t.tagName === 'IMG') applyFallback(t);
  }, true);

  // 이미지 로드 완료 시 loaded 클래스 추가 (FOUC/CLS 방지)
  function markImageLoaded(img) {
    if (img.classList) img.classList.add('loaded');
  }

  function initImageLoadHandlers() {
    document.querySelectorAll('.home-trend-card-image img, .home-popular-thumb img').forEach(function(img) {
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

// 폰트 로딩 스크립트
const fontScript = `
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

/**
 * 레이아웃 래퍼 (GamerScroll 스타일)
 */
function wrapWithLayout(content, options = {}) {
  const {
    title = SITE_CONFIG.title,
    description = SITE_CONFIG.description,
    keywords = SITE_CONFIG.keywords,
    canonical = SITE_CONFIG.baseUrl,
    pageScripts = '',
    currentPage = 'home',
    jsonLd = null,
    ogImage = null,
    // Article-specific OG tags
    articleMeta = null,  // { publishedTime, modifiedTime, section, author, tags }
    ogType = 'website',   // 'website' for homepage, 'article' for articles
    noindex = false,      // true이면 검색엔진 인덱싱 차단
    sidebarCounts = {},  // 모바일 사이드 패널 카테고리 숫자
    cssFilenames = null
  } = options;

  // 실제 사용할 counts (페이지별 > 글로벌 순으로 폴백)
  const effectiveCounts = Object.keys(sidebarCounts).length > 0 ? sidebarCounts : globalSidebarCounts;
  const runtimeAssetVersion = encodeURIComponent(AI_LAYOUT_ASSET_VERSION || 'v1');
  const coreScriptUrl = `/assets/${LAYOUT_CORE_ASSET}?v=${runtimeAssetVersion}`;
  const shouldLoadTwitterWidget = /twitter-tweet/.test(content || '') || /twitter-tweet/.test(pageScripts || '');
  const hasBlogArticleLayout = /\bblog-card\b/.test(content || '');
  const baseCssFiles = Array.isArray(cssFilenames) && cssFilenames.length > 0
    ? cssFilenames
    : ['/styles-core.css'];
  const resolvedCssFiles = (() => {
    const files = hasBlogArticleLayout ? [...baseCssFiles, '/styles-article.css'] : baseCssFiles;
    const seen = new Set();
    const out = [];
    for (const file of files) {
      const normalized = String(file || '').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out.length > 0 ? out : ['/styles-core.css'];
  })();
  const blockingCssFile = resolvedCssFiles[0] || '/styles-core.css';
  const deferredCssFiles = resolvedCssFiles.slice(1);
  const blockingCssHtml = `<link rel="stylesheet" href="${escapeHtml(blockingCssFile)}">`;
  const deferredCssHtml = deferredCssFiles.map((file) => {
    const safeFile = escapeHtml(file);
    return `<link rel="preload" href="${safeFile}" as="style" onload="this.onload=null;this.rel='stylesheet'" data-deferred-css="1"><noscript><link rel="stylesheet" href="${safeFile}"></noscript>`;
  }).join('\n  ');
  const cssLinksHtml = deferredCssHtml ? `${blockingCssHtml}\n  ${deferredCssHtml}` : blockingCssHtml;
  const deferredCssGuardScript = deferredCssFiles.length > 0 ? `
  <script>
    (function() {
      var root = document.documentElement;
      if (!root || !root.classList || !root.classList.contains('deferred-css-pending')) return;
      var links = document.querySelectorAll('link[data-deferred-css="1"]');
      var pending = links.length;
      if (!pending) {
        root.classList.remove('deferred-css-pending');
        return;
      }
      var finished = false;
      function markDone() {
        if (finished) return;
        pending -= 1;
        if (pending <= 0) {
          finished = true;
          root.classList.remove('deferred-css-pending');
        }
      }
      links.forEach(function(link) {
        link.addEventListener('load', markDone, { once: true });
        link.addEventListener('error', markDone, { once: true });
      });
      setTimeout(function() {
        if (finished) return;
        finished = true;
        links.forEach(function(link) {
          if (link.rel === 'preload') link.rel = 'stylesheet';
        });
        root.classList.remove('deferred-css-pending');
      }, 3000);
    })();
  </script>` : '';
  const htmlClassNames = ['dark-mode'];
  if (deferredCssFiles.length > 0) htmlClassNames.push('deferred-css-pending');
  const htmlClassAttr = escapeHtml(htmlClassNames.join(' '));

  const ogImageUrl = ogImage || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`;
  const jsonLdScript = jsonLd ? `\n  <!-- JSON-LD Structured Data -->\n  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '';

  // Article OG tags
  const articleTagsMeta = (articleMeta?.tags || []).map(tag =>
    `<meta property="article:tag" content="${escapeHtml(tag)}">`
  ).join('\n  ');
  const articleOgTags = articleMeta ? `
  <meta property="article:published_time" content="${articleMeta.publishedTime}">
  <meta property="article:modified_time" content="${articleMeta.modifiedTime}">
  <meta property="article:section" content="${escapeHtml(articleMeta.section)}">
  <meta property="article:author" content="AIScroll Team">
  ${articleTagsMeta}` : '';

  return `<!DOCTYPE html>
<html lang="en" class="${htmlClassAttr}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- AdSense -->
  <script>
    (function() {
      var s = document.createElement('script');
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.fetchPriority = 'high';
      s.onload = function() {
        window.__adsenseReady = true;
        window.dispatchEvent(new Event('adsenseReady'));
      };
      document.head.appendChild(s);
    })();
  </script>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords)}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : `<link rel="canonical" href="${canonical}">`}

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="${SITE_CONFIG.favicon}">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <meta name="application-name" content="${SITE_CONFIG.name}">
  <meta name="apple-mobile-web-app-title" content="${SITE_CONFIG.name}">
  <meta name="theme-color" content="#4f46e5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#1a1a2e" media="(prefers-color-scheme: dark)">

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:alt" content="${escapeHtml(title)}">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="${SITE_CONFIG.name}">${articleOgTags}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aiscroll_io">
  <meta name="twitter:creator" content="@aiscroll_io">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="twitter:image:alt" content="${escapeHtml(title)}">

  <!-- RSS -->
  <link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${SITE_CONFIG.baseUrl}/rss.xml">

  <!-- preconnect: 핵심 도메인 (PageSpeed 권고) -->
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://www.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://firebaseinstallations.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://ep1.adtrafficquality.google" crossorigin>
  <link rel="preconnect" href="https://wsrv.nl" crossorigin>
  <!-- dns-prefetch: fallback -->
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://www.gstatic.com">
  <link rel="dns-prefetch" href="https://firebaseinstallations.googleapis.com">
  <link rel="dns-prefetch" href="https://wsrv.nl">${jsonLdScript}

  ${cssLinksHtml}
  ${deferredCssGuardScript}
  <style>
    html.deferred-css-pending *,
    html.deferred-css-pending *::before,
    html.deferred-css-pending *::after {
      transition: none !important;
      animation: none !important;
    }
    /* AIScroll 전용: 모바일 상단 마진 (!important: styles.css의 padding 단축 속성보다 우선) */
    .page-container {
      padding-top: var(--space-block-y) !important;
    }
    /* AIScroll 헤더 레이아웃 */
    .aiscroll-header {
      padding: 16px 0;
      position: relative;
      z-index: 100000;
    }
    .aiscroll-header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .aiscroll-logo {
      flex-shrink: 0;
    }
    .aiscroll-logo .logo-svg {
      height: 40px;
      width: auto;
    }
    .aiscroll-search {
      position: relative;
      flex-shrink: 0;
      width: 300px;
    }
    .aiscroll-search .search-box {
      display: flex;
      align-items: center;
      background: var(--glass-bg, rgba(255,255,255,0.05));
      border: 1px solid var(--border-color, rgba(255,255,255,0.1));
      border-radius: 24px;
      padding: 8px 16px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .aiscroll-search .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary, #fff);
      font-size: 14px;
    }
    .aiscroll-search .search-input::placeholder {
      color: var(--text-muted, rgba(255,255,255,0.5));
    }
    .aiscroll-search .search-btn {
      background: transparent;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--text-muted, rgba(255,255,255,0.5));
    }
    .aiscroll-search .search-btn svg {
      width: 18px;
      height: 18px;
    }
    .aiscroll-search .search-dropdown {
      position: absolute !important;
      top: calc(100% + 4px) !important;
      left: 0 !important;
      right: 0 !important;
      transform: none !important;
      width: 100% !important;
      max-width: none !important;
      background: var(--bg-secondary, #1a1a2e) !important;
      border: 1px solid var(--border-color, rgba(255,255,255,0.1)) !important;
      border-radius: 12px !important;
      display: none;
      z-index: 99999 !important;
      max-height: 400px !important;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
      margin-top: 0 !important;
    }
    .aiscroll-search .search-dropdown.active {
      display: block;
    }
    .aiscroll-search .search-result-item {
      display: block;
      padding: 12px 16px;
      color: var(--text-primary, #fff);
      text-decoration: none;
      border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1));
      transition: background 0.2s;
    }
    .aiscroll-search .search-result-item:last-child {
      border-bottom: none;
    }
    .aiscroll-search .search-result-item:hover {
      background: var(--glass-bg, rgba(255,255,255,0.05));
    }
    .aiscroll-search .search-result-title {
      font-size: 14px;
      line-height: 1.4;
    }
    .aiscroll-search .search-no-results {
      padding: 16px;
      text-align: center;
      color: var(--text-muted, rgba(255,255,255,0.5));
      font-size: 14px;
    }
    /* ===== 모바일 레이아웃 (GamerScroll 스타일) ===== */
    @media (max-width: 768px) {
      /* 헤더 숨김 - ID로 우선순위 최대화 */
      #aiscroll-header,
      #aiscroll-header.header,
      .header.aiscroll-header,
      header.aiscroll-header,
      .aiscroll-header {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
        position: absolute !important;
        left: -9999px !important;
      }
      /* 카테고리 페이지 카드 헤더 숨김 */
      #category .home-card-header {
        display: none !important;
      }
      /* 검색 컨테이너 - fixed 상단 */
      .search-container {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 200 !important;
        padding: 8px 16px !important;
        border-bottom: 1px solid var(--border) !important;
        background: var(--bg) !important;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .search-container .search-box {
        display: flex;
        align-items: center;
        background: var(--glass-bg);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 0 12px;
        height: 48px;
        flex: 1;
      }
      .search-container .search-home-icon {
        display: flex !important;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 40px;
        height: 100%;
      }
      .search-container .search-home-icon img {
        width: 32px;
        height: 32px;
      }
      .search-container .search-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--text-primary);
        font-size: var(--font-body-size, 15px);
        min-width: 0;
      }
      .search-container .search-btn {
        background: transparent;
        border: none;
        padding: 0;
        color: var(--text-muted);
        cursor: pointer;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .search-container .search-btn svg {
        width: 20px;
        height: 20px;
      }
      .search-container .search-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 16px;
        right: 16px;
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 12px;
        display: none;
        z-index: 9999;
        max-height: 300px;
        overflow-y: auto;
      }
      .search-container .search-dropdown.active {
        display: block;
      }
      /* 네비게이션 - fixed, 검색바 아래 */
      .nav {
        position: fixed !important;
        top: 64px !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 199 !important;
        padding: 4px 0 !important;
        background: var(--glass-bg-solid) !important;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      /* nav-inner 스와이프 스타일 */
      .nav-inner {
        justify-content: flex-start !important;
        padding: 0 !important;
        gap: 0 !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        visibility: hidden;
      }
      .nav-inner.nav-ready {
        visibility: visible;
      }
      .nav-inner::-webkit-scrollbar {
        display: none;
      }
      /* 5개 카테고리용 20% */
      .nav-item {
        min-width: 20% !important;
        flex: 0 0 20% !important;
        justify-content: center;
        text-align: center;
        padding: 8px 4px 10px;
        margin: 0;
      }
      /* 네비 밑줄 위치 조정 */
      .nav-item.active::after {
        bottom: 0 !important;
      }
      /* 모바일 페이지네이션 숨김 */
      .home-pagination {
        display: none !important;
      }
      /* 본문 콘텐츠 - fixed 헤더 높이만큼 여백 */
      .site-container {
        padding-top: 120px !important;
        transition: padding-top 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      /* 스크롤 시 검색창 숨김 */
      body.search-hidden .search-container {
        transform: translateY(-100%) !important;
        pointer-events: none !important;
      }
      body.search-hidden .nav {
        transform: translateY(-64px) !important;
      }
      body.search-hidden .site-container {
        padding-top: 120px !important;
      }
    }
    /* PC에서 검색 컨테이너 숨김 */
    @media (min-width: 769px) {
      .search-container {
        display: none;
      }
      .search-home-icon {
        display: none;
      }
    }
    /* Popular 상단 2컬럼 그리드 */
    .popular-top-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      padding: 16px 20px 0;
    }
    @media (max-width: 600px) {
      .popular-top-grid {
        grid-template-columns: 1fr;
        padding: 12px 12px 0;
      }
    }
    /* 사이드바 스티키 (네비 높이 + 여백) */
    .home-sidebar-sticky {
      top: 70px !important;
    }
    /* Categories 카드 */
    #sidebar-categories {
      margin-bottom: 16px;
    }
    #sidebar-categories .home-card-header {
      padding: 12px 16px 8px;
      border-bottom: none;
    }
    #sidebar-categories .home-card-title {
      font-size: 15px;
    }
    /* 검색 결과 페이지 */
    .search-loading, .search-empty {
      padding: 32px 16px;
      text-align: center;
      color: var(--text-muted);
      font-size: var(--font-body-size);
    }
    /* 모바일 플로팅 버튼 + 사이드 패널 */
    .mobile-fab { display: none; }
    .mobile-side-panel { display: none; }
    .mobile-side-overlay { display: none; }
    @media (max-width: 768px) {
      .mobile-fab {
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        bottom: 20px;
        left: 16px;
        width: 47px;
        height: 47px;
        min-width: 47px;
        min-height: 47px;
        padding: 0;
        margin: 0;
        background: var(--card);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        cursor: pointer;
        z-index: 10001;
        transition: background 0.2s, box-shadow 0.2s;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .mobile-fab:active { background: var(--card-hover); }
      .mobile-fab svg {
        width: 22px;
        height: 22px;
        pointer-events: none;
        flex-shrink: 0;
        stroke: var(--text);
      }
      .mobile-side-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        z-index: 9998;
      }
      .mobile-side-overlay.open { display: block; }
      .mobile-side-panel {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        width: 300px;
        max-width: 85vw;
        height: 100%;
        background: var(--bg);
        box-shadow: 4px 0 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .mobile-side-panel.open { transform: translateX(0); }
      .mobile-side-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
        position: sticky;
        top: 0;
        background: var(--bg);
        z-index: 1;
      }
      .mobile-side-panel-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text);
      }
      .mobile-side-panel-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        border-radius: 50%;
        transition: background 0.15s;
      }
      .mobile-side-panel-close:hover { background: var(--bg-hover); }
      .mobile-side-panel-body { padding: 0; }
      .mobile-side-panel-body .home-card {
        margin-bottom: 0;
        background: transparent;
        border-radius: 0;
        border: none;
        box-shadow: none;
      }
      .mobile-side-panel-body .home-card-header,
      .mobile-side-panel-body #sidebar-categories .home-card-header {
        padding: 0;
        border-bottom: none;
      }
      .mobile-side-panel-body .home-card-title-link {
        display: block;
        padding: 12px 16px 8px;
      }
      .mobile-side-panel-body .sidebar-category-list {
        display: flex;
        flex-direction: column;
        padding: 0;
      }
      .mobile-side-panel-body .sidebar-category-item {
        padding: 10px 16px;
      }
    }
  </style>
  <!-- Firebase Analytics (프로덕션만) -->
  <script>
    // 페이지뷰 큐 (Firebase 로드 전 이벤트 저장) - 일반 스크립트로 즉시 실행
    (function() {
      var host = window.location.hostname;
      if (host !== 'aiscroll.io') return;
      window.__asPageViewQueue = [];
      window.__asLogPageView = function(path) {
        window.__asPageViewQueue.push(path);
      };
    })();
  </script>
  <script type="module">
    (function() {
      var host = window.location.hostname;
      if (host !== 'aiscroll.io') return;

      // 페이지 로드 완료 후 Firebase 초기화 (LCP 영향 제거)
      function initFirebase() {
        (async function() {
          try {
            const [{ initializeApp }, { getAnalytics, logEvent }] = await Promise.all([
              import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
              import('https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js')
            ]);
            const firebaseConfig = {
              apiKey: "AIzaSyBrklaUMi0oCBdwdAKidy-ZrZSNeHR9irg",
              authDomain: "aiscroll.firebaseapp.com",
              projectId: "aiscroll",
              storageBucket: "aiscroll.firebasestorage.app",
              messagingSenderId: "616378969440",
              appId: "1:616378969440:web:9a8e65a68fe990cc934205",
              measurementId: "G-RKW0H8HYMS"
            };
            const app = initializeApp(firebaseConfig);
            const analytics = getAnalytics(app);

            // 큐에 쌓인 페이지뷰 처리
            if (window.__asPageViewQueue) {
              window.__asPageViewQueue.forEach(function(path) {
                logEvent(analytics, 'page_view', {
                  page_path: path,
                  page_location: window.location.origin + path
                });
              });
            }

            // 실제 로깅 함수로 교체 (SPA 페이지 전환용)
            window.__asLogPageView = function(path) {
              logEvent(analytics, 'page_view', {
                page_path: path,
                page_location: window.location.origin + path
              });
            };
          } catch (e) {}
        })();
      }
      if (document.readyState === 'complete') {
        setTimeout(initFirebase, 0);
      } else {
        window.addEventListener('load', initFirebase);
      }
    })();
  </script>
</head>
<body>
  <script>try{if(sessionStorage.getItem('ai-search-hidden')==='1'){document.body.classList.add('search-hidden');sessionStorage.removeItem('ai-search-hidden');}}catch(e){}</script>
  ${generateHeader()}
  ${generateSearchContainer()}
  ${generateNav(currentPage)}
  <main class="site-container">
    ${coreReadyBootstrapScript}
    <script defer src="${coreScriptUrl}"></script>
    ${content}
  </main>
  ${generateMobileSidePanel(generateDefaultSidebarContent(effectiveCounts))}
  ${generateFooter()}
  ${mobileSidePanelScript}
  ${imageFallbackScript}
  ${fontScript}
  <script>
    const loadArticlesShared = (function() {
      if (typeof window.__asLoadArticles === 'function') return window.__asLoadArticles;
      window.__asLoadArticles = function() {
        if (window.__asArticlesPromise) return window.__asArticlesPromise;
        window.__asArticlesPromise = fetch('/articles.json', { credentials: 'same-origin' })
          .then(function(res) { return res.ok ? res.json() : []; })
          .then(function(data) { return Array.isArray(data) ? data : []; })
          .catch(function() { return []; });
        return window.__asArticlesPromise;
      };
      return window.__asLoadArticles;
    })();

    const loadSearchArticlesShared = (function() {
      if (typeof window.__asLoadSearchArticles === 'function') return window.__asLoadSearchArticles;
      window.__asLoadSearchArticles = function() {
        if (window.__asSearchArticlesPromise) return window.__asSearchArticlesPromise;
        window.__asSearchArticlesPromise = fetch('/articles-search.json', { credentials: 'same-origin' })
          .then(function(res) {
            if (!res || !res.ok) throw new Error('search index fetch failed');
            return res.json();
          })
          .then(function(data) {
            return Array.isArray(data) ? data : [];
          })
          .catch(function() {
            return loadArticlesShared().then(function(list) {
              const safeList = Array.isArray(list) ? list : [];
              return safeList.map(function(item) {
                const title = item && item.title ? String(item.title) : '';
                return {
                  title: title,
                  titleLower: title.toLowerCase(),
                  category: item && item.category ? String(item.category) : 'general',
                  slug: item && item.slug ? String(item.slug) : ''
                };
              });
            });
          });
        return window.__asSearchArticlesPromise;
      };
      return window.__asLoadSearchArticles;
    })();

    const getArticleSearchIndex = (function() {
      return function() {
        if (window.__asSearchIndexPromise) return window.__asSearchIndexPromise;
        window.__asSearchIndexPromise = loadSearchArticlesShared().then(function(data) {
          const list = Array.isArray(data) ? data : [];
          window.__asSearchIndex = list.map(function(item) {
            const title = item && item.title ? String(item.title) : '';
            const titleLower = item && item.titleLower ? String(item.titleLower) : title.toLowerCase();
            return {
              title: title,
              titleLower: titleLower,
              category: item && item.category ? String(item.category) : 'general',
              slug: item && item.slug ? String(item.slug) : ''
            };
          });
          return window.__asSearchIndex;
        }).catch(function() {
          window.__asSearchIndex = [];
          return window.__asSearchIndex;
        });
        return window.__asSearchIndexPromise;
      };
    })();

    function escapeSearchHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function bindSearchBox(options) {
      options = options || {};
      const container = document.querySelector(options.containerSelector || '');
      if (!container) return;
      const searchInput = container.querySelector('.search-input');
      const searchDropdown = container.querySelector('.search-dropdown');
      if (!searchInput || !searchDropdown) return;

      const mobileMode = options.mobileMode === true;
      const loadingHtml = mobileMode
        ? '<div class="search-no-results" style="padding:16px;text-align:center;color:var(--text-muted);">Loading...</div>'
        : '<div class="search-no-results">Loading...</div>';
      const emptyHtml = mobileMode
        ? '<div class="search-no-results" style="padding:16px;text-align:center;color:var(--text-muted);">No results found</div>'
        : '<div class="search-no-results">No results found</div>';
      let latestQuery = '';
      let debounceTimer = null;
      let prefetchScheduled = false;

      function hideDropdown() {
        searchDropdown.classList.remove('active');
      }

      function renderResults(results) {
        if (!results || results.length === 0) {
          searchDropdown.innerHTML = emptyHtml;
          searchDropdown.classList.add('active');
          return;
        }
        searchDropdown.innerHTML = results.map(function(item) {
          const href = '/article/' + (item.category || 'general') + '/' + item.slug + '/';
          const title = escapeSearchHtml(item.title);
          if (mobileMode) {
            return '<a href="' + href + '" style="display:block;padding:12px 16px;color:var(--text-primary);text-decoration:none;border-bottom:1px solid var(--border);">' + title + '</a>';
          }
          return '<a href="' + href + '" class="search-result-item"><div class="search-result-title">' + title + '</div></a>';
        }).join('');
        searchDropdown.classList.add('active');
      }

      function runSearch(query) {
        const normalized = String(query || '').toLowerCase().trim();
        if (normalized.length < 2) {
          searchDropdown.innerHTML = '';
          hideDropdown();
          return;
        }

        latestQuery = normalized;
        if (!window.__asSearchIndex) {
          searchDropdown.innerHTML = loadingHtml;
          searchDropdown.classList.add('active');
        }

        getArticleSearchIndex().then(function(index) {
          if (latestQuery !== normalized) return;
          const safeIndex = Array.isArray(index) ? index : [];
          const matched = safeIndex.filter(function(item) {
            return item && item.titleLower && item.titleLower.indexOf(normalized) !== -1;
          }).slice(0, 8);
          renderResults(matched);
        }).catch(function() {
          if (latestQuery !== normalized) return;
          searchDropdown.innerHTML = emptyHtml;
          searchDropdown.classList.add('active');
        });
      }

      function schedulePrefetch() {
        if (window.__asSearchIndexPromise || prefetchScheduled) return;
        prefetchScheduled = true;
        const run = function() {
          prefetchScheduled = false;
          getArticleSearchIndex();
        };
        if ('requestIdleCallback' in window) {
          requestIdleCallback(run, { timeout: 1400 });
        } else {
          setTimeout(run, 200);
        }
      }

      searchInput.addEventListener('focus', function() {
        schedulePrefetch();
      });

      searchInput.addEventListener('input', function(e) {
        const query = e && e.target ? e.target.value : '';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          runSearch(query);
        }, 120);
      });

      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim();
          if (query.length >= 2) {
            window.location.href = '/search/?q=' + encodeURIComponent(query);
          }
        }
      });

      searchDropdown.addEventListener('mousedown', function(e) {
        e.preventDefault();
      });
    }

    bindSearchBox({ containerSelector: '.aiscroll-search', mobileMode: false });
    bindSearchBox({ containerSelector: '.search-container', mobileMode: true });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.aiscroll-search') && !e.target.closest('.search-container')) {
        document.querySelectorAll('.search-dropdown.active').forEach(function(dropdown) {
          dropdown.classList.remove('active');
        });
      }
    });

    // 모바일 스크롤 시 검색창 숨기기
    (function() {
      if (window.innerWidth > 768) return;
      let lastScrollY = 0;
      let ticking = false;
      let isHidden = false;
      const showThreshold = 10;
      const hideThreshold = 80;

      // 스와이프 이동 시 검색창 접힘 상태 (body 시작 시 이미 적용됨)
      if (document.body.classList.contains('search-hidden')) {
        isHidden = true;
        lastScrollY = window.scrollY;
      }

      function updateSearchVisibility() {
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollY;
        if (currentScrollY <= 0) {
          if (isHidden) {
            document.body.classList.remove('search-hidden');
            isHidden = false;
          }
        } else if (scrollDelta < -showThreshold) {
          if (isHidden) {
            document.body.classList.remove('search-hidden');
            isHidden = false;
          }
        } else if (scrollDelta > 0 && currentScrollY > hideThreshold) {
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
  </script>
  <script>
  // 모바일 스와이프 네비게이션 (AIScroll)
  (function() {
    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!isTouchDevice) return;

    const navSections = ['home', 'general', 'openai', 'google', 'anthropic', 'vibecoding'];
    const currentPage = '${currentPage}';

    const SWIPE_THRESHOLD = 0.10;
    const VELOCITY_THRESHOLD = 0.5;
    const MAX_DRAG_PERCENT = 0.35;
    const DIRECTION_LOCK_PX = 10;
    const DIRECTION_LOCK_RATIO = 1.5;
    const TRANSITION_MS = 200;
    const SLIDE_OUT_MS = 180;

    function getCurrentNavIndex() {
      const idx = navSections.indexOf(currentPage);
      return idx >= 0 ? idx : 0;
    }

    function getPrevIndex(idx) {
      if (idx <= 0) return navSections.length - 1; // home에서 왼쪽 → anthropic
      return idx - 1;
    }

    function getNextIndex(idx) {
      if (idx >= navSections.length - 1) return 0; // anthropic에서 오른쪽 → home
      return idx + 1;
    }

    function getPageByIndex(idx) {
      if (idx === null || idx < 0 || idx >= navSections.length) return null;
      return navSections[idx];
    }

    let touchStartX = null;
    let touchStartY = null;
    let touchStartTime = null;
    let swipeAxis = null;
    let isSwiping = false;
    let swipeMode = null;
    let hasPrevPage = false;
    let hasNextPage = false;
    let mainEl = null;
    let isNavigating = false;

    function resetSwipe() {
      if (mainEl) {
        mainEl.style.transition = 'transform ' + TRANSITION_MS + 'ms ease';
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
    }

    function slideOutAndNavigate(url, direction) {
      isNavigating = true;
      // 검색창 접힘 상태 저장
      try {
        if (document.body.classList.contains('search-hidden')) {
          sessionStorage.setItem('ai-search-hidden', '1');
        }
      } catch(e) {}
      if (!mainEl) {
        window.location.href = url;
        return;
      }
      const translateX = direction === 'next' ? '-100%' : '100%';
      mainEl.style.transition = 'transform ' + SLIDE_OUT_MS + 'ms ease';
      mainEl.style.transform = 'translate3d(' + translateX + ', 0, 0)';
      setTimeout(function() {
        window.location.href = url;
      }, SLIDE_OUT_MS);
    }

    document.addEventListener('touchstart', function(e) {
      if (isNavigating) return;
      if (!e.touches || e.touches.length > 1) return;

      const t = e.target;
      if (
        t && t.closest &&
        t.closest('.nav, .nav-inner, .search-dropdown, .search-container, .mobile-side-panel, .mobile-side-overlay, .mobile-fab, #mobileSidePanel, #mobileSideOverlay, #mobileFab, input, textarea')
      ) return;

      mainEl = document.querySelector('main.site-container');
      if (!mainEl) return;

      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
      swipeAxis = null;
      isSwiping = false;
      swipeMode = null;

      const idx = getCurrentNavIndex();
      hasPrevPage = true; // 순환 네비게이션
      hasNextPage = true;
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

      if (diffX > 0 && !hasNextPage) return;
      if (diffX < 0 && !hasPrevPage) return;

      e.preventDefault();

      isSwiping = true;
      swipeMode = diffX > 0 ? 'next' : 'prev';

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
          const url = targetPage === 'home' ? '/' : '/article/' + targetPage + '/';
          slideOutAndNavigate(url, swipeMode);
          return;
        }
      }

      resetSwipe();
    }, { passive: true });

    document.addEventListener('touchcancel', function() {
      resetSwipe();
    }, { passive: true });
  })();
  </script>
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
    if (window.__adsenseReady) {
      initAdsObserver();
    } else {
      window.addEventListener('adsenseReady', initAdsObserver, { once: true });
    }
  })();
  </script>
  ${pageScripts}
  ${shouldLoadTwitterWidget ? '<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>' : ''}
  <script>
    (function() {
      if (!('serviceWorker' in navigator)) return;
      if (location.protocol !== 'https:') return;
      if (location.hostname !== 'aiscroll.io') return;
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js').catch(function() {});
      });
    })();
  </script>
  <script>(function(){if(document.body.classList.contains('search-hidden'))window.scrollTo(0,64);var n=window.innerWidth<=768?document.querySelector('.nav-inner'):null;if(n){n.style.transition='none';n.offsetHeight;n.style.visibility='visible';n.classList.add('nav-ready');}document.body.style.visibility='visible';if(n)setTimeout(function(){n.style.transition='';},50);})();</script>
  <script>(function(){document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a||a.target==='_blank')return;try{if(document.body.classList.contains('search-hidden'))sessionStorage.setItem('ai-search-hidden','1');else sessionStorage.removeItem('ai-search-hidden');}catch(ex){}},true);})();</script>
</body>
</html>`;
}

/**
 * 검색 결과 페이지 생성
 */
function generateSearchPage() {
  const content = `
    <section class="home-section active" id="search">
      <div class="page-container issue-container">
        <div class="home-card">
          <div class="home-card-header">
            <h1 class="home-card-title">Search Results</h1>
          </div>
          <div class="home-card-body" id="search-results">
            <p class="search-loading">Loading...</p>
          </div>
          <div class="home-pagination" id="search-pagination" style="display:none;">
            <button class="home-page-btn home-page-prev" disabled>‹</button>
            <span class="home-page-info">1 / 1</span>
            <button class="home-page-btn home-page-next">›</button>
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `<script>
    (function() {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q') || '';
      const resultsContainer = document.getElementById('search-results');
      const pagination = document.getElementById('search-pagination');
      const searchInput = document.querySelector('.search-input');

      if (searchInput) searchInput.value = query;

      if (!query || query.length < 2) {
        resultsContainer.innerHTML = '<p class="search-empty">Please enter a search term (at least 2 characters).</p>';
        return;
      }

      const perPage = 10;
      let currentPage = 1;
      let allResults = [];

      function resolveSearchThumbUrl(url) {
        const raw = String(url || '');
        if (!raw) return '';
        if (raw.startsWith('/assets/') || raw.startsWith('/favicon')) return raw;
        if (raw.startsWith('https://wsrv.nl/')) return raw;
        if (/^https?:\/\//i.test(raw)) {
          return 'https://wsrv.nl/?url=' + encodeURIComponent(raw) + '&w=480&output=webp';
        }
        return raw;
      }

      function renderPage() {
        const totalPages = Math.ceil(allResults.length / perPage) || 1;
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;
        const pageResults = allResults.slice(start, end);

        resultsContainer.innerHTML = '<div class="category-list">' +
          pageResults.map(a =>
            '<a href="/article/' + (a.category || 'general') + '/' + a.slug + '/" class="category-list-card">' +
              '<div class="category-list-thumb">' +
                (a.thumbnail ? '<img src="' + resolveSearchThumbUrl(a.thumbnail) + '" alt="" loading="lazy" decoding="async" data-img-fallback="hide">' : '') +
                (a.date ? '<span class="category-list-badge">' + a.date + '</span>' : '') +
              '</div>' +
              '<div class="category-list-info">' +
                '<h3 class="category-list-title">' + a.title + '</h3>' +
                (a.summary ? '<p class="category-list-summary">' + a.summary + '</p>' : '') +
              '</div>' +
            '</a>'
          ).join('') +
        '</div>';

        if (totalPages > 1) {
          pagination.style.display = '';
          pagination.querySelector('.home-page-info').textContent = currentPage + ' / ' + totalPages;
          pagination.querySelector('.home-page-prev').disabled = currentPage <= 1;
          pagination.querySelector('.home-page-next').disabled = currentPage >= totalPages;
        }
      }

      const loadArticles = (typeof window.__asLoadArticles === 'function')
        ? window.__asLoadArticles
        : function() {
          return fetch('/articles.json', { credentials: 'same-origin' })
            .then(function(res) { return res.ok ? res.json() : []; })
            .then(function(data) { return Array.isArray(data) ? data : []; })
            .catch(function() { return []; });
        };

      loadArticles()
        .then(articles => {
          const q = query.toLowerCase();
          allResults = articles.filter(a => a.title.toLowerCase().includes(q));

          if (allResults.length === 0) {
            resultsContainer.innerHTML = '<p class="search-empty">No results found for "' + query + '"</p>';
            return;
          }

          renderPage();

          pagination.querySelector('.home-page-prev').addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderPage(); }
          });
          pagination.querySelector('.home-page-next').addEventListener('click', () => {
            const totalPages = Math.ceil(allResults.length / perPage);
            if (currentPage < totalPages) { currentPage++; renderPage(); }
          });
        })
        .catch(() => {
          resultsContainer.innerHTML = '<p class="search-empty">Failed to load search results.</p>';
        });
    })();
  </script>`;

  return wrapWithLayout(content, {
    title: `Search - ${SITE_CONFIG.name}`,
    description: 'Search articles on AIScroll',
    keywords: SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}/search/`,
    pageScripts: pageScripts,
    noindex: true
  });
}

/**
 * 카테고리 페이지 생성
 */
function generateCategoryPage(categoryId, categoryLabel, articles, popularArticles = [], latestArticles = []) {
  const categoryArticles = articles.filter(a => a.category === categoryId);
  const lcpImageAttrs = 'loading="eager" fetchpriority="high" decoding="async"';
  const lazyImageAttrs = 'loading="lazy" fetchpriority="auto" decoding="async"';
  const categoryCardEntries = categoryArticles.map((a, i) => {
    const thumbData = getThumbSrcset(a.thumbnail, 240, 480, '(max-width: 768px) 133px, 253px');
    const imgAttrs = thumbData.srcset
      ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
      : `src="${thumbData.src}"`;
    const perfAttrs = i === 0 ? lcpImageAttrs : lazyImageAttrs;
    return `
    <a href="/article/${a.category}/${a.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
      <div class="home-trend-card-image">
        ${thumbData.src ? `<img ${imgAttrs} alt="${escapeHtml(a.title)}" ${perfAttrs} data-img-fallback="hide">` : ''}
        <span class="home-trend-card-tag">${formatDateEn(a.date)}</span>
      </div>
      <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(a.title)}</span></h3>
    </a>
  `;
  });
  const categoryCardPayload = buildDeferredCardPayload(categoryCardEntries, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);
  const categoryTotalPages = Math.ceil(categoryArticles.length / FEED_PAGE_SIZE) || 1;

  const articleListHtml = categoryArticles.length > 0
    ? `<div class="home-latest-grid" id="categoryGrid">
        ${categoryCardPayload.initialHtml}
      </div>
      ${categoryCardPayload.deferredJson ? `<script type="application/json" id="categoryGridDeferredData">${categoryCardPayload.deferredJson}</script>${categoryCardPayload.deferredSeoLinksHtml}` : ''}
      <div class="home-pagination" id="categoryPagination" data-total="${categoryArticles.length}" data-per-page="${FEED_PAGE_SIZE}" data-initial-render="${INITIAL_FEED_RENDER_COUNT}">
        <button class="home-page-btn home-prev" aria-label="Previous">‹</button>
        <span class="home-page-index">1 / ${categoryTotalPages}</span>
        <button class="home-page-btn home-next" aria-label="Next">›</button>
      </div>`
    : '<p class="search-empty">No articles in this category yet.</p>';

  // 카테고리별 기사 개수 계산
  const countByCategory = {};
  articles.forEach(a => {
    const cat = a.category || 'general';
    countByCategory[cat] = (countByCategory[cat] || 0) + 1;
  });

  const categories = [
    { id: 'general', label: 'General' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'google', label: 'Google' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'vibecoding', label: 'Vibe Coding' }
  ];

  // 사이드바 렌더링
  const renderSidebarList = (items) => items.slice(0, 10).map((item, i) => `
    <a href="/article/${item.category || 'general'}/${item.slug}/" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
    </a>
  `).join('');
  const latestSidebarListHtml = renderSidebarList(latestArticles);

  const sidebarHtml = `
    <div class="home-sidebar">
      <div class="home-sidebar-sticky">
        <div class="home-card" id="sidebar-categories">
          <div class="sidebar-category-group">
            <div class="home-card-header">
              <h3 class="home-card-title">Categories</h3>
            </div>
            <div class="sidebar-category-list">
              ${categories.map(cat => `
                <a href="/article/${cat.id}/" class="sidebar-category-item">
                  <span class="sidebar-category-name">${cat.label} (${countByCategory[cat.id] || 0})</span>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="home-card" id="sidebar-articles">
          <div class="home-card-header">
            <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
              <button class="tab-btn small active" data-sidebar-tab="popular">Popular</button>
              <button class="tab-btn small" data-sidebar-tab="latest">Latest</button>
            </div>
          </div>
          <div class="home-card-body">
            <div class="sidebar-article-list active" id="sidebar-popular">${renderSidebarList(popularArticles)}</div>
            <div class="sidebar-article-list" id="sidebar-latest"></div>
            <template id="sidebar-latest-template">${latestSidebarListHtml}</template>
          </div>
        </div>
      </div>
    </div>
  `;

  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001);

  const content = `
    <section class="home-section active" id="category">
      <div class="page-container">
        <div class="home-container">
          <div class="home-main">
            ${topAds}
            <div class="home-card">
              <div class="home-card-header">
                <h1 class="home-card-title">${escapeHtml(categoryLabel)}</h1>
              </div>
              <div class="home-card-body">
                ${articleListHtml}
              </div>
            </div>
          </div>
          ${sidebarHtml}
        </div>
      </div>
    </section>
  `;

  const sidebarLatestDeferScript = `
  <script>
    (function() {
      var init = function() {
        if (!window.GSUtils || typeof window.GSUtils.initSidebarLatestDefer !== 'function') return;
        window.GSUtils.initSidebarLatestDefer({
          tabId: 'sidebarArticleTab',
          latestListId: 'sidebar-latest',
          templateId: 'sidebar-latest-template',
          idleTimeout: 3200,
          fallbackDelay: 1600
        });
      };
      if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.initSidebarLatestDefer === 'function') {
        init();
      } else if (typeof window.__gsOnReady === 'function') {
        window.__gsOnReady(init);
      } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    })();
  </script>`;
  const pageScripts = `
    ${buildCardFeedPagerScript({
      grid: '#categoryGrid',
      pagination: '#categoryPagination',
      deferredJson: '#categoryGridDeferredData',
      itemSelector: '.home-trend-card',
      pageSize: FEED_PAGE_SIZE,
      hydrateLazyImages: false,
      mobileAds: false,
      prevSelector: '.home-prev',
      nextSelector: '.home-next',
      infoSelector: '.home-page-index',
      initialRenderCount: INITIAL_FEED_RENDER_COUNT,
      idleFillFirstPage: true,
      idleFillDelay: 120,
      mobileDomWindowPages: 5,
      sidebarTabId: 'sidebarArticleTab'
    })}
    ${sidebarLatestDeferScript}
  `;

  // CollectionPage JSON-LD for category pages
  const categoryJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": categoryLabel,
    "description": `${categoryLabel} articles on AIScroll`,
    "url": `${SITE_CONFIG.baseUrl}/article/${categoryId}/`,
    "isPartOf": {
      "@type": "WebSite",
      "name": SITE_CONFIG.name,
      "url": `${SITE_CONFIG.baseUrl}/`
    }
  };

  return wrapWithLayout(content, {
    title: `${categoryLabel} - ${SITE_CONFIG.name}`,
    description: `${categoryLabel} articles on AIScroll`,
    keywords: `${categoryLabel}, AI news, ${SITE_CONFIG.keywords}`,
    canonical: `${SITE_CONFIG.baseUrl}/article/${categoryId}/`,
    pageScripts,
    currentPage: categoryId,
    jsonLd: categoryJsonLd
  });
}

module.exports = {
  generateAIBlogIndex,
  generateSearchPage,
  generateCategoryPage,
  wrapWithLayout,
  setGlobalSidebarCounts,
  setGlobalSidebarArticles,
  SITE_CONFIG,
  formatDateEn,
  escapeHtml,
  getThumbUrl
};
