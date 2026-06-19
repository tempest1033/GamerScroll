/**
 * AIScroll 홈페이지 템플릿
 * GamerScroll 레이아웃 기반, AI 블로그 전용
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCardFeedPagerScript, LAYOUT_CORE_ASSET, buildLayoutCoreBundle, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');

// 광고 활성화 여부 (ADS_ENABLED=false면 비활성화)
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';

// 사이트 설정
const SITE_CONFIG = {
  name: 'AIScroll',
  baseUrl: 'https://aiscroll.io',
  title: 'AIScroll - AI Industry Insights',
  description: 'AIScroll tracks AI industry shifts, model launches, coding agents, and research trends with concise news and practical insight.',
  keywords: 'AI news, artificial intelligence, ChatGPT, Claude, machine learning, AI trends',
  favicon: '/favicon.svg',
  ogImage: '/og-image.png'
};

// i18n labels
const I18N = {
  en: {
    popular: 'Popular', latest: 'Latest', search: 'Search',
    searchPlaceholder: 'Search articles...',
    privacy: 'Privacy Policy', categories: 'Categories',
    readMore: 'Read more', publishedAt: 'Published',
    noResults: 'No results', sources: 'Sources', related: 'Related Articles',
    previous: 'Previous', next: 'Next', list: 'List',
    copyright: '© 2026 AIScroll. All rights reserved.',
    categoryLabels: { general: 'General', ai: 'AI', 'ai-tools': 'AI Tools', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', vibecoding: 'Coding' },
    menu: 'Menu', vibeCoding: 'Vibe Coding'
  },
  ko: {
    popular: '인기', latest: '최신', search: '검색',
    searchPlaceholder: '기사 검색...',
    privacy: '개인정보처리방침', categories: '카테고리',
    readMore: '더 보기', publishedAt: '게시일',
    noResults: '검색 결과 없음', sources: '출처', related: '관련 기사',
    previous: '이전', next: '다음', list: '목록',
    copyright: '© 2026 AIScroll. 모든 권리 보유.',
    categoryLabels: { general: '일반', ai: 'AI', 'ai-tools': 'AI 도구', openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic', vibecoding: '바이브코딩' },
    menu: '메뉴', vibeCoding: '바이브코딩'
  }
};

function langPrefixOf(lang) { return lang === 'ko' ? '/ko' : ''; }
function normalizeLang(lang) { return lang === 'ko' ? 'ko' : 'en'; }
function pathForLang(pathname = '/', lang = 'en') {
  const prefix = langPrefixOf(normalizeLang(lang));
  const normalizedPath = `/${String(pathname || '/').replace(/^\/+/, '')}`;
  if (!prefix) return normalizedPath;
  return normalizedPath === '/' ? `${prefix}/` : `${prefix}${normalizedPath}`;
}
function articleHref(category = 'general', slug = '', lang = 'en') {
  return pathForLang(`/article/${category || 'general'}/${slug}/`, lang);
}
function categoryHref(category = 'general', lang = 'en') {
  return pathForLang(`/article/${category || 'general'}/`, lang);
}
function homeHref(lang = 'en') { return pathForLang('/', lang); }
function searchHref(lang = 'en') { return pathForLang('/search/', lang); }

const AI_CATEGORY_IDS = ['general', 'ai', 'ai-tools', 'openai', 'google', 'anthropic', 'vibecoding'];
// Sidebar shows only the nav-aligned categories (excludes low-volume ai / ai-tools)
const SIDEBAR_CATEGORY_IDS = ['general', 'openai', 'google', 'anthropic', 'vibecoding'];

// AIScroll 헤더 (로고 + 검색창 - PC용)
function generateHeader(lang = 'en') {
  const _t = I18N[lang] || I18N.en;
  const _homeHref = homeHref(lang);
  return `
  <header id="aiscroll-header" class="header aiscroll-header">
    <div class="header-inner aiscroll-header-inner">
      <div class="header-title aiscroll-logo">
        <a href="${_homeHref}">
          <span class="visually-hidden">AIScroll</span>
          <svg class="logo-svg" viewBox="0 0 400 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#2563EB" />
                <stop offset="100%" stop-color="#60A5FA" />
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
          <input type="text" class="search-input" placeholder="${_t.searchPlaceholder}" autocomplete="off">
          <button class="search-btn" type="button" aria-label="${_t.search}">
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
function generateSearchContainer(lang = 'en') {
  const _t = I18N[lang] || I18N.en;
  const _homeHref = homeHref(lang);
  return `
  <div class="search-container">
    <div class="search-box">
      <a href="${_homeHref}" class="search-home-icon" aria-label="Home">
        <img src="/favicon.svg" alt="" width="20" height="20">
      </a>
      <input type="text" class="search-input" placeholder="${_t.searchPlaceholder}" autocomplete="off">
      <button class="search-btn" type="button" aria-label="${_t.search}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </button>
    </div>
    <div class="search-dropdown"></div>
  </div>`;
}

// AIScroll 푸터 (GamerScroll 스타일, 영문)
function generateFooter(lang = 'en') {
  const _t = I18N[lang] || I18N.en;
  const _p = lang === 'ko' ? '/ko' : '';
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <span>© ${year} AIScroll</span>
    <span class="footer-divider">|</span>
    <a href="${_p}/privacy/" class="footer-privacy-link">${_t.privacy}</a>
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
function generateDefaultSidebarContent(counts = {}, lang = 'en') {
  const _t = I18N[lang] || I18N.en;
  const _cat = _t.categoryLabels;
  const c = (key) => counts[key] !== undefined ? ` (${counts[key]})` : '';
  const cNum = (key) => counts[key] !== undefined ? `<span class="sidebar-category-count">${counts[key]}</span>` : '';
  const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const categories = SIDEBAR_CATEGORY_IDS.map(id => ({
    id,
    label: id === 'vibecoding' ? (_t.vibeCoding || _cat[id]) : _cat[id]
  }));

  const renderArticleList = (items) => items.slice(0, 10).map((item, i) => `
    <a href="${articleHref(item.category || 'general', item.slug, lang)}" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
    </a>
  `).join('');

  return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><span class="home-card-title-link"><h2 class="home-card-title">${_t.categories}</h2></span></div>
        <div class="sidebar-category-list">
          ${categories.map(cat => `<a href="${categoryHref(cat.id, lang)}" class="sidebar-category-item"><span class="sidebar-category-name">${cat.label}</span>${cNum(cat.id)}</a>`).join('')}
        </div>
      </div>
    </div>
    <div class="home-card" id="sidebar-articles">
      <div class="home-card-header">
        <div class="home-chart-toggle sidebar-full-toggle" id="panelSidebarTab">
          <button class="tab-btn small active" data-sidebar-tab="popular">${_t.popular}</button>
          <button class="tab-btn small" data-sidebar-tab="latest">${_t.latest}</button>
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
function generateMobileSidePanel(sidebarContent = '', lang = 'en') {
  const _t = I18N[lang] || I18N.en;
  const content = sidebarContent || generateDefaultSidebarContent({}, lang);
  return `
    <div class="mobile-side-overlay" id="mobileSideOverlay"></div>
    <div class="mobile-side-panel" id="mobileSidePanel">
      <div class="mobile-side-panel-header">
        <span class="mobile-side-panel-title">${_t.menu}</span>
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

function generateNav(currentPage = 'home', lang = 'en') {
  const _t = I18N[lang] || I18N.en;
  const _navItems = AI_NAV_ITEMS.map(it => ({
    ...it,
    label: _t.categoryLabels[it.id] || (it.id === 'vibecoding' ? (_t.vibeCoding || it.label) : it.label),
    href: categoryHref(it.id, lang)
  }));
  const currentIdx = AI_NAV_ITEMS.findIndex(item => item.id === currentPage);
  return `
  <nav class="nav">
    <div class="nav-inner">
      ${_navItems.map(item => `
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

function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
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
  const _lang = data.lang === 'ko' ? 'ko' : 'en';
  const _langPrefix = _lang === 'ko' ? '/ko' : '';
  const lcpImageAttrs = 'loading="eager" fetchpriority="high" decoding="async"';
  const lazyImageAttrs = 'loading="lazy" fetchpriority="auto" decoding="async"';

  // 인기 카드 (1,2등 그리드 + 3,4,5등 가로형)
  function generatePopularCards() {
    const items = popularArticles.slice(0, 5);
    if (items.length === 0) return '';

    // 1, 2등: 2컬럼 그리드
    const topItems = items.slice(0, 2);
    const topGrid = topItems.map((item, idx) => `
      <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="home-trend-card">
        <div class="home-trend-card-image">
          ${item.thumbnail ? (() => {
            const thumbData = getThumbSrcset(item.thumbnail, 320, 640, '(max-width: 768px) 46vw, 360px');
            const imgAttrs = thumbData.srcset
              ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
              : `src="${thumbData.src}"`;
            const perfAttrs = lazyImageAttrs;
            return `<img ${imgAttrs} width="640" height="360" alt="${escapeHtml(item.title)}" ${perfAttrs} data-img-fallback="hide">`;
          })() : ''}
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(item.title)}</span></h3>
      </a>
    `).join('');

    // 3, 4, 5등: 가로형
    const restItems = items.slice(2, 5);
    const restList = restItems.map((item) => `
      <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? (() => {
            const thumbData = getThumbSrcset(item.thumbnail, 200, 400, '(max-width: 768px) 33vw, 200px');
            const imgAttrs = thumbData.srcset
              ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
              : `src="${thumbData.src}"`;
            return `<img ${imgAttrs} width="400" height="225" alt="${escapeHtml(item.title)}" ${lazyImageAttrs} data-img-fallback="hide">`;
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
          <h2 class="home-card-title">${(I18N[_lang] || I18N.en).popular}</h2>
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
      const perfAttrs = i === 0 ? lcpImageAttrs : lazyImageAttrs;
      return `
      <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${thumbData.src ? `<img ${imgAttrs} width="480" height="270" alt="${escapeHtml(item.title)}" ${perfAttrs} data-img-fallback="hide">` : ''}
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
          <h2 class="home-card-title">${(I18N[_lang] || I18N.en).latest}</h2>
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
    const _menuT = I18N[_lang] || I18N.en;
    const categories = SIDEBAR_CATEGORY_IDS.map(id => ({
      id,
      label: id === 'vibecoding' ? (_menuT.vibeCoding || _menuT.categoryLabels[id]) : _menuT.categoryLabels[id]
    }));
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
            <h3 class="home-card-title">${(I18N[_lang] || I18N.en).categories}</h3>
          </div>
          <div class="sidebar-category-list">
            ${categories.map(cat => `
              <a href="${categoryHref(cat.id, _lang)}" class="sidebar-category-item">
                <span class="sidebar-category-name">${cat.label}</span><span class="sidebar-category-count">${countByCategory[cat.id] || 0}</span>
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
      <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="sidebar-article-item">
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
            <button class="tab-btn small active" data-sidebar-tab="popular">${(I18N[_lang] || I18N.en).popular}</button>
            <button class="tab-btn small" data-sidebar-tab="latest">${(I18N[_lang] || I18N.en).latest}</button>
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
  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001, { narrow: true });
  const _homeTitle = _lang === 'ko' ? 'AIScroll - AI 산업 인사이트' : SITE_CONFIG.title;
  const _homeDescription = _lang === 'ko'
    ? 'AIScroll은 AI 모델 출시, 코딩 에이전트, 빅테크 전략, 연구 동향을 빠르게 정리해 주는 AI 산업 인사이트 허브입니다.'
    : SITE_CONFIG.description;
  const _homeKeywords = _lang === 'ko' ? 'AI 뉴스, 인공지능, ChatGPT, Claude, 머신러닝, AI 트렌드' : SITE_CONFIG.keywords;

  // 메인 콘텐츠
  const content = `
    <section class="home-section active" id="home">
      <h1 class="visually-hidden">${_homeTitle}</h1>
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
      mobileAds: true,
      prevSelector: '.home-page-prev',
      nextSelector: '.home-page-next',
      infoSelector: '.home-page-info',
      adInterval: 6,
      initialRenderCount: INITIAL_FEED_RENDER_COUNT,
      idleFillFirstPage: false,
      idleFillDelay: 120,
      mobileDomWindowPages: 1,
      mobileInitialPages: 1,
      mobileLoadBatchPages: 1,
      eagerScrollAdPushLimit: 1,
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
    "url": `${SITE_CONFIG.baseUrl}${homeHref(_lang)}`,
    "description": _homeDescription,
    "inLanguage": _lang === 'ko' ? 'ko-KR' : 'en-US',
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
        "urlTemplate": `${SITE_CONFIG.baseUrl}${searchHref(_lang)}?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return wrapWithLayout(content, {
    title: _homeTitle,
    description: _homeDescription,
    keywords: _homeKeywords,
    canonical: SITE_CONFIG.baseUrl + _langPrefix + '/',
    pageScripts: pageScripts,
    jsonLd: websiteJsonLd,
    lang: _lang,
    alternates: data.alternates || null
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
    ogTitle = null,       // 전체 헤드라인 (og:title/twitter:title/og:image:alt용); null이면 title 재사용
    ogType = 'website',   // 'website' for homepage, 'article' for articles
    noindex = false,      // true이면 검색엔진 인덱싱 차단
    sidebarCounts = {},  // 모바일 사이드 패널 카테고리 숫자
    cssFilenames = null,
    lang = 'en',
    alternates = null
  } = options;
  const isKo = lang === 'ko';
  const ogLocale = isKo ? 'ko_KR' : 'en_US';
  const rssHref = isKo ? `${SITE_CONFIG.baseUrl}/ko/rss.xml` : `${SITE_CONFIG.baseUrl}/rss.xml`;
  const hreflangLinks = alternates ? `
  <link rel="alternate" hreflang="en" href="${alternates.en}">
  <link rel="alternate" hreflang="ko" href="${alternates.ko}">
  <link rel="alternate" hreflang="x-default" href="${alternates.en}">` : '';

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
  const blockingCssFiles = hasBlogArticleLayout
    ? resolvedCssFiles
    : [resolvedCssFiles[0] || '/styles-core.css'];
  const deferredCssFiles = hasBlogArticleLayout ? [] : resolvedCssFiles.slice(1);
  const blockingCssHtml = blockingCssFiles
    .map((file) => `<link rel="stylesheet" href="${escapeHtml(file)}">`)
    .join('\n  ');
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

  // Description 155자 제한 (모든 페이지 공통 적용)
  const safeDescription = description.length > 155
    ? description.slice(0, 152).replace(/\s+\S*$/, '') + '...'
    : description;

  // og:title/twitter:title은 전체 헤드라인 사용 (SNS 공유 카드 절단 방지)
  const effectiveOgTitle = ogTitle || title;

  // noindex 페이지(404 등)에는 AdSense 로드 금지 — 정책 + impression 가치 보호
  const _adsActive = ADS_ENABLED && !noindex;

  const ogImageUrl = ogImage || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`;
  const ogImageWidth = options.ogImageWidth || 1200;
  const ogImageHeight = options.ogImageHeight || 630;
  const runtimeLangPrefix = langPrefixOf(lang);
  const runtimeHomePath = homeHref(lang);
  const runtimeSearchPath = searchHref(lang);
  const runtimeArticlesJsonPath = pathForLang('/articles.json', lang);
  const runtimeSearchJsonPath = pathForLang('/articles-search.json', lang);
  const jsonLdScript = jsonLd ? `\n  <!-- JSON-LD Structured Data -->\n  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script>` : '';

  // Article OG tags
  const articleTagsMeta = (articleMeta?.tags || []).map(tag =>
    `<meta property="article:tag" content="${escapeHtml(tag)}">`
  ).join('\n  ');
  const articleOgTags = articleMeta ? [
    `<meta property="article:published_time" content="${articleMeta.publishedTime}">`,
    articleMeta.modifiedTime ? `<meta property="article:modified_time" content="${articleMeta.modifiedTime}">` : '',
    `<meta property="article:section" content="${escapeHtml(articleMeta.section)}">`,
    `<meta property="article:author" content="AIScroll Team">`,
    articleTagsMeta
  ].filter(Boolean).join('\n  ') : '';

  return `<!DOCTYPE html>
<html lang="${lang}" class="${htmlClassAttr}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- preconnect: 핵심 도메인 (PageSpeed 권고) -->${_adsActive ? `
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
  <link rel="preconnect" href="https://tpc.googlesyndication.com" crossorigin>` : ''}
  <!-- AdSense: preload + static async (preload scanner picks it up at first byte) -->${_adsActive ? `
  <link rel="preload" as="script" crossorigin="anonymous" fetchpriority="high" href="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825">
  <script async crossorigin="anonymous" fetchpriority="high" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825"></script>` : ''}
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(safeDescription)}">
  <meta name="keywords" content="${escapeHtml(keywords)}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : `<meta name="robots" content="max-image-preview:large">
  <link rel="canonical" href="${canonical}">`}

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
  <meta property="og:title" content="${escapeHtml(effectiveOgTitle)}">
  <meta property="og:description" content="${escapeHtml(safeDescription)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="${ogImageWidth}">
  <meta property="og:image:height" content="${ogImageHeight}">
  <meta property="og:image:alt" content="${escapeHtml(effectiveOgTitle)}">
  <meta property="og:locale" content="${ogLocale}">
  <meta property="og:locale:alternate" content="${isKo ? 'en_US' : 'ko_KR'}">
  <meta property="og:site_name" content="${SITE_CONFIG.name}">${articleOgTags}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aiscroll_io">
  <meta name="twitter:creator" content="@aiscroll_io">
  <meta name="twitter:title" content="${escapeHtml(effectiveOgTitle)}">
  <meta name="twitter:description" content="${escapeHtml(safeDescription)}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="twitter:image:alt" content="${escapeHtml(title)}">

  <!-- RSS -->
  <link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${rssHref}">${hreflangLinks}

  <!-- preconnect: 핵심 도메인 (PageSpeed 권고) -->
  <link rel="preconnect" href="https://www.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://firebaseinstallations.googleapis.com" crossorigin>
  <link rel="preconnect" href="https://ep1.adtrafficquality.google" crossorigin>
  <link rel="preconnect" href="https://wsrv.nl" crossorigin>
  <!-- dns-prefetch: fallback -->${ADS_ENABLED ? `
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://googleads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://tpc.googlesyndication.com">` : ''}
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
      max-width: 1076px;
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
      padding: 16px 0 0;
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
  ${generateHeader(lang)}
  ${generateSearchContainer(lang)}
  ${generateNav(currentPage, lang)}
  <main class="site-container">
    ${coreReadyBootstrapScript}
    <script defer src="${coreScriptUrl}"></script>
    ${content}
  </main>
  ${generateMobileSidePanel(generateDefaultSidebarContent(effectiveCounts, lang), lang)}
  ${generateFooter(lang)}
  ${mobileSidePanelScript}
  ${imageFallbackScript}
  ${fontScript}
  <script>
    const AS_LANG_PREFIX = ${JSON.stringify(runtimeLangPrefix)};
    const AS_HOME_PATH = ${JSON.stringify(runtimeHomePath)};
    const AS_SEARCH_PATH = ${JSON.stringify(runtimeSearchPath)};
    const AS_ARTICLES_JSON_PATH = ${JSON.stringify(runtimeArticlesJsonPath)};
    const AS_SEARCH_JSON_PATH = ${JSON.stringify(runtimeSearchJsonPath)};
    function asArticleHref(category, slug) {
      return AS_LANG_PREFIX + '/article/' + (category || 'general') + '/' + slug + '/';
    }

    const loadArticlesShared = (function() {
      if (typeof window.__asLoadArticles === 'function') return window.__asLoadArticles;
      window.__asLoadArticles = function() {
        if (window.__asArticlesPromise) return window.__asArticlesPromise;
        window.__asArticlesPromise = fetch(AS_ARTICLES_JSON_PATH, { credentials: 'same-origin' })
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
        window.__asSearchArticlesPromise = fetch(AS_SEARCH_JSON_PATH, { credentials: 'same-origin' })
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
          const href = asArticleHref(item.category || 'general', item.slug);
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
            window.location.href = AS_SEARCH_PATH + '?q=' + encodeURIComponent(query);
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
        t.closest('.nav, .nav-inner, .search-dropdown, .search-container, .mobile-side-panel, .mobile-side-overlay, .mobile-fab, #mobileSidePanel, #mobileSideOverlay, #mobileFab, .ad-card, .adsbygoogle, input, textarea')
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
          const url = targetPage === 'home' ? AS_HOME_PATH : AS_LANG_PREFIX + '/article/' + targetPage + '/';
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
        ? ad.closest('.ad-card-responsive-home, .ad-card-responsive-top, .ad-card-mobile-top, .blog-in-article-ad')
        : null;
    }
    function getAdCollapseWrapper(ad) {
      return ad && ad.closest ? ad.closest('.blog-in-article-ad') : null;
    }
    function getAdFrameHeight(ad) {
      var iframe = ad && ad.querySelector && ad.querySelector('iframe');
      if (!iframe) return 0;
      var rect = iframe.getBoundingClientRect ? iframe.getBoundingClientRect() : null;
      return Math.round((rect && rect.height) || iframe.offsetHeight || 0);
    }

    function isAdSenseServingReady() {
      return !!(window.adsbygoogle && window.adsbygoogle.loaded);
    }
    function retryPendingAd(ad, reason) {
      if (!ad || !isAdSenseServingReady()) return false;
      if (ad.getAttribute('data-ad-status') || ad.getAttribute('data-adsbygoogle-status')) return false;
      if (getAdFrameHeight(ad) > 1) return false;
      if (isHiddenAd(ad)) return false;
      var retryCount = parseInt(ad.getAttribute('data-gs-ad-retry-count') || '0', 10);
      if (retryCount >= 2) return false;
      var nextRetryCount = retryCount + 1;
      ad.setAttribute('data-gs-ad-retry-count', String(nextRetryCount));
      if (reason) ad.setAttribute('data-gs-ad-retry-reason', reason);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setTimeout(function() {
          maybeMarkAdEmpty(ad, true, 'empty-after-retry-' + nextRetryCount);
        }, 12000);
        return true;
      } catch (e) {
        ad.setAttribute('data-gs-ad-retry-error', '1');
        return false;
      }
    }
    function markAdEmpty(ad, reason) {
      var wrap = getAdCollapseWrapper(ad);
      if (!wrap || ad.getAttribute('data-gs-ad-empty') === '1') return;
      ad.setAttribute('data-gs-ad-empty', '1');
      if (reason) ad.setAttribute('data-gs-ad-empty-reason', reason);
      wrap.setAttribute('data-gs-ad-empty', '1');
      if (reason) wrap.setAttribute('data-gs-ad-empty-reason', reason);
      wrap.classList.add('gs-ad-empty');
      wrap.style.setProperty('display', 'none', 'important');
      wrap.style.setProperty('min-height', '0', 'important');
      wrap.style.setProperty('height', '0', 'important');
      wrap.style.setProperty('margin', '0', 'important');
    }
    function maybeMarkAdEmpty(ad, collapseMode, reason) {
      if (!ad || !getAdCollapseWrapper(ad)) return false;
      if (ad.getAttribute('data-gs-ad-pushed') !== '1') return false;
      var status = ad.getAttribute('data-ad-status') || '';
      if (status === 'filled') return false;
      if (status === 'unfilled') {
        markAdEmpty(ad, reason || 'unfilled');
        return true;
      }
      // Status not yet resolved ('(none)'/missing): treat as PENDING and never
      // collapse. Only an explicit AdSense 'unfilled' may hide a slot now, so a
      // slow network or a late-painting iframe can no longer drop a fillable
      // impression. Still nudge a retry while serving is ready and no frame exists.
      if (collapseMode && isAdSenseServingReady() && getAdFrameHeight(ad) <= 1) {
        retryPendingAd(ad, reason || 'pending-no-frame');
      }
      return false;
    }
    function scheduleAdEmptyWatch(ad) {
      if (!ad || !getAdCollapseWrapper(ad) || ad.getAttribute('data-gs-ad-empty-watch') === '1') return;
      ad.setAttribute('data-gs-ad-empty-watch', '1');
      function isNearViewport() {
        var wrap = getAdCollapseWrapper(ad) || ad;
        if (!wrap || typeof wrap.getBoundingClientRect !== 'function') return true;
        var rect = wrap.getBoundingClientRect();
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top <= viewportHeight + 3600 && rect.bottom >= -1200;
      }
      function startTimers() {
        if (ad.getAttribute('data-gs-ad-empty-timer') === '1') return;
        ad.setAttribute('data-gs-ad-empty-timer', '1');
        setTimeout(function() { maybeMarkAdEmpty(ad, 'missing-frame', 'empty-timeout-near-30s'); }, 30000);
        setTimeout(function() { maybeMarkAdEmpty(ad, true, 'empty-timeout-near-60s'); }, 60000);
      }
      if (isNearViewport()) {
        startTimers();
      } else if ('IntersectionObserver' in window) {
        var emptyTimerObserver = new IntersectionObserver(function(entries) {
          if (!entries[0] || !entries[0].isIntersecting) return;
          emptyTimerObserver.disconnect();
          startTimers();
        }, { rootMargin: '3600px 0px' });
        emptyTimerObserver.observe(getAdCollapseWrapper(ad));
        __gsAdCleanup.push(function() { try { emptyTimerObserver.disconnect(); } catch (e) {} });
      } else {
        setTimeout(startTimers, 20000);
      }
    }
    function normalizeAdVisualSize(ad) {
      if (maybeMarkAdEmpty(ad, false, 'status')) return;
      var wrap = getAdVisualWrapper(ad);
      if (!wrap) return;
      var iframe = ad.querySelector && ad.querySelector('iframe');
      if (!iframe) return;
      var iframeHeight = Math.round(iframe.getBoundingClientRect().height || iframe.offsetHeight || 0);
      if (!iframeHeight) return;
      var isMobileTopAd = wrap.classList.contains('ad-card-mobile-top');
      var isTopAd = isMobileTopAd || wrap.classList.contains('ad-card-responsive-home') || wrap.classList.contains('ad-card-responsive-top');
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
      if (isShortTopAd) iframe.style.minHeight = minHeight + 'px';
      if (isMobileTopAd) {
        var mobileAdMaxWidth = 320;
        var parentRect = wrap.parentElement && wrap.parentElement.getBoundingClientRect
          ? wrap.parentElement.getBoundingClientRect()
          : null;
        var viewportWidth = document.documentElement.clientWidth || window.innerWidth || mobileAdMaxWidth;
        var parentWidth = Math.floor((parentRect && parentRect.width) || mobileAdMaxWidth);
        var mobileAdWidth = Math.min(mobileAdMaxWidth, parentWidth || mobileAdMaxWidth, viewportWidth || mobileAdMaxWidth);
        if (!mobileAdWidth || mobileAdWidth < 1) mobileAdWidth = mobileAdMaxWidth;
        var mobileAdWidthPx = Math.round(mobileAdWidth) + 'px';
        wrap.style.setProperty('width', mobileAdWidthPx, 'important');
        wrap.style.setProperty('max-width', '320px', 'important');
        wrap.style.setProperty('height', '100px', 'important');
        wrap.style.setProperty('min-height', '100px', 'important');
        wrap.style.setProperty('max-height', '100px', 'important');
        ad.style.setProperty('width', mobileAdWidthPx, 'important');
        ad.style.setProperty('max-width', '320px', 'important');
        ad.style.setProperty('height', '100px', 'important');
        ad.style.setProperty('min-height', '100px', 'important');
        ad.style.setProperty('max-height', '100px', 'important');
        iframe.style.setProperty('width', mobileAdWidthPx, 'important');
        iframe.style.setProperty('max-width', '320px', 'important');
        iframe.style.setProperty('height', '100px', 'important');
        iframe.style.setProperty('min-height', '100px', 'important');
        iframe.style.setProperty('max-height', '100px', 'important');
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
          if (maybeMarkAdEmpty(ad, false, 'mutation')) return;
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
      scheduleAdEmptyWatch(ad);
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
    // AdSense queue is the standard mechanism: push() before script load is auto-processed on arrival.
    for (var a = 0; a < ads.length; a++) { observeAdVisualSize(ads[a]); }
    var shouldPushAllAdsNow = !!document.querySelector('.article-layout .article-main');
    if (shouldPushAllAdsNow) {
      for (var eagerIndex = 0; eagerIndex < ads.length; eagerIndex++) {
        pushAd(ads[eagerIndex]);
      }
      return;
    }
    var viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    var firstVisibleIndex = -1;
    for (var fi = 0; fi < ads.length; fi++) {
      if (!isHiddenAd(ads[fi])) { firstVisibleIndex = fi; break; }
    }
    if (firstVisibleIndex >= 0) pushAd(ads[firstVisibleIndex]);
    if (ads.length > 1) {
      var btfObserver = null;
      if ('IntersectionObserver' in window) {
        btfObserver = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            btfObserver.unobserve(entry.target);
            pushAd(entry.target);
          });
        }, { rootMargin: '2000px 0px' }); // widened from 1200px: request slightly sooner on intent-to-scroll
        __gsAdCleanup.push(function() { try { btfObserver.disconnect(); } catch (e) {} });
      }
      for (var j = (firstVisibleIndex >= 0 ? firstVisibleIndex + 1 : 1); j < ads.length; j++) {
        // Eager-push slots already within the first screen (+25% slack): visible
        // without scrolling, so requesting them costs no viewability but recovers
        // impressions from no-scroll/bounce sessions.
        var rect = ads[j].getBoundingClientRect ? ads[j].getBoundingClientRect() : null;
        if (rect && rect.top < viewportH * 1.25 && rect.width > 0) {
          pushAd(ads[j]);
          continue;
        }
        if (btfObserver) btfObserver.observe(ads[j]);
        else pushAd(ads[j]);
      }
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
function generateSearchPage(lang = 'en') {
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
            '<a href="' + asArticleHref(a.category || 'general', a.slug) + '" class="category-list-card">' +
              '<div class="category-list-thumb">' +
                (a.thumbnail ? '<img src="' + resolveSearchThumbUrl(a.thumbnail) + '" alt="" width="480" height="270" loading="lazy" decoding="async" data-img-fallback="hide">' : '') +
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
          return fetch(AS_ARTICLES_JSON_PATH, { credentials: 'same-origin' })
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

  const _langPrefix = lang === 'ko' ? '/ko' : '';
  const _searchTitle = lang === 'ko' ? `검색 - ${SITE_CONFIG.name}` : `Search - ${SITE_CONFIG.name}`;
  const _searchDescription = lang === 'ko' ? 'AIScroll 기사 검색' : 'Search articles on AIScroll';
  return wrapWithLayout(content, {
    title: _searchTitle,
    description: _searchDescription,
    keywords: SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}${_langPrefix}/search/`,
    pageScripts: pageScripts,
    noindex: true,
    lang,
    alternates: { en: `${SITE_CONFIG.baseUrl}/search/`, ko: `${SITE_CONFIG.baseUrl}/ko/search/` }
  });
}

/**
 * 카테고리 페이지 생성
 */
function generateCategoryPage(categoryId, categoryLabel, articles, popularArticles = [], latestArticles = [], lang = 'en') {
  const _lang = lang === 'ko' ? 'ko' : 'en';
  const _langPrefix = _lang === 'ko' ? '/ko' : '';
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
    <a href="${articleHref(a.category || 'general', a.slug, _lang)}" class="home-trend-card home-latest-item" data-index="${i}">
      <div class="home-trend-card-image">
        ${thumbData.src ? `<img ${imgAttrs} width="480" height="270" alt="${escapeHtml(a.title)}" ${perfAttrs} data-img-fallback="hide">` : ''}
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

  const _catT = I18N[_lang] || I18N.en;
  const categories = SIDEBAR_CATEGORY_IDS.map(id => ({
    id,
    label: id === 'vibecoding' ? (_catT.vibeCoding || _catT.categoryLabels[id]) : _catT.categoryLabels[id]
  }));

  // 사이드바 렌더링
  const renderSidebarList = (items) => items.slice(0, 10).map((item, i) => `
    <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="sidebar-article-item">
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
              <h3 class="home-card-title">${(I18N[_lang] || I18N.en).categories}</h3>
            </div>
            <div class="sidebar-category-list">
              ${categories.map(cat => `
                <a href="${categoryHref(cat.id, _lang)}" class="sidebar-category-item">
                  <span class="sidebar-category-name">${cat.label}</span><span class="sidebar-category-count">${countByCategory[cat.id] || 0}</span>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="home-card" id="sidebar-articles">
          <div class="home-card-header">
            <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
              <button class="tab-btn small active" data-sidebar-tab="popular">${(I18N[_lang] || I18N.en).popular}</button>
              <button class="tab-btn small" data-sidebar-tab="latest">${(I18N[_lang] || I18N.en).latest}</button>
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

  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001, { narrow: true });

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
      mobileAds: true,
      prevSelector: '.home-prev',
      nextSelector: '.home-next',
      infoSelector: '.home-page-index',
      adInterval: 6,
      initialRenderCount: INITIAL_FEED_RENDER_COUNT,
      idleFillFirstPage: false,
      idleFillDelay: 120,
      mobileDomWindowPages: 1,
      mobileInitialPages: 1,
      mobileLoadBatchPages: 1,
      eagerScrollAdPushLimit: 1,
      sidebarTabId: 'sidebarArticleTab'
    })}
    ${sidebarLatestDeferScript}
  `;

  const _catInLanguage = _lang === 'ko' ? 'ko-KR' : 'en-US';
  const categoryDescription = _lang === 'ko'
    ? `${categoryLabel} 관련 AIScroll 기사 모음입니다.`
    : `${categoryLabel} articles on AIScroll`;
  const categoryKeywords = _lang === 'ko'
    ? `${categoryLabel}, AI 뉴스, 인공지능, ${SITE_CONFIG.name}`
    : `${categoryLabel}, AI news, ${SITE_CONFIG.keywords}`;
  // CollectionPage + BreadcrumbList JSON-LD for category pages
  const categoryJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": categoryLabel,
      "description": categoryDescription,
      "inLanguage": _catInLanguage,
      "url": `${SITE_CONFIG.baseUrl}${_langPrefix}/article/${categoryId}/`,
      "isPartOf": {
        "@type": "WebSite",
        "name": SITE_CONFIG.name,
        "url": `${SITE_CONFIG.baseUrl}${_langPrefix}/`
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": _lang === 'ko' ? '홈' : 'Home',
          "item": `${SITE_CONFIG.baseUrl}${_langPrefix}/`
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": categoryLabel,
          "item": `${SITE_CONFIG.baseUrl}${_langPrefix}/article/${categoryId}/`
        }
      ]
    }
  ];

  return wrapWithLayout(content, {
    title: `${categoryLabel} - ${SITE_CONFIG.name}`,
    description: categoryDescription,
    keywords: categoryKeywords,
    canonical: `${SITE_CONFIG.baseUrl}${_langPrefix}/article/${categoryId}/`,
    pageScripts,
    currentPage: categoryId,
    jsonLd: categoryJsonLd,
    lang,
    alternates: { en: `${SITE_CONFIG.baseUrl}/article/${categoryId}/`, ko: `${SITE_CONFIG.baseUrl}/ko/article/${categoryId}/` }
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
  formatDateKo,
  I18N,
  langPrefixOf,
  pathForLang,
  articleHref,
  categoryHref,
  homeHref,
  searchHref,
  AI_CATEGORY_IDS,
  escapeHtml,
  getThumbUrl
};
