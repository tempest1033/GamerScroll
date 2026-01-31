/**
 * AIScroll 홈페이지 템플릿
 * GamerScroll 레이아웃 기반, AI 블로그 전용
 */

const fs = require('fs');
const path = require('path');

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

// AIScroll 네비게이션 (카테고리 4개)
const AI_NAV_ITEMS = [
  { id: 'general', label: 'General', href: '/article/general/' },
  { id: 'openai', label: 'OpenAI', href: '/article/openai/' },
  { id: 'google', label: 'Google', href: '/article/google/' },
  { id: 'anthropic', label: 'Anthropic', href: '/article/anthropic/' }
];

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

/**
 * AIScroll 홈페이지 생성
 */
function generateAIBlogIndex(data) {
  const { articles = [], popularArticles = [], latestArticles = [] } = data;

  // 인기 카드 (1,2등 그리드 + 3,4,5등 가로형)
  function generatePopularCards() {
    const items = popularArticles.slice(0, 5);
    if (items.length === 0) return '';

    // 1, 2등: 2컬럼 그리드
    const topItems = items.slice(0, 2);
    const topGrid = topItems.map((item, i) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="home-trend-card">
        <div class="home-trend-card-image">
          ${item.thumbnail ? `<img src="${getThumbUrl(item.thumbnail)}" alt="${escapeHtml(item.title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(item.title)}</span></h3>
      </a>
    `).join('');

    // 3, 4, 5등: 가로형
    const restItems = items.slice(2, 5);
    const restList = restItems.map((item) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? `<img src="${getThumbUrl(item.thumbnail)}" alt="${escapeHtml(item.title)}" loading="lazy">` : ''}
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

    const cards = items.map((item, i) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
        <div class="home-trend-card-image">
          ${item.thumbnail ? `<img src="${getThumbUrl(item.thumbnail)}" alt="${escapeHtml(item.title)}" loading="lazy">` : ''}
          <span class="home-trend-card-tag">${formatDateEn(item.date)}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(item.title)}</span></h3>
      </a>
    `).join('');

    const totalPages = Math.ceil(items.length / 15);

    return `
      <div class="home-card" id="home-latest">
        <div class="home-card-header">
          <h2 class="home-card-title">Latest</h2>
        </div>
        <div class="home-latest-grid">${cards}</div>
        <div class="home-pagination" data-total="${items.length}" data-per-page="15">
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
      { id: 'anthropic', label: 'Anthropic' }
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
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(latestArticles)}</div>
        </div>
      </div>
    `;
  }

  // 메인 콘텐츠
  const content = `
    <section class="home-section active" id="home">
      <h1 class="visually-hidden">${SITE_CONFIG.title}</h1>
      <div class="page-container">
        <div class="home-container">
          <div class="home-main">
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

  // 페이지 스크립트
  const pageScripts = `<script>
    // 최신 기사 페이지네이션
    (function() {
      const pagination = document.querySelector('.home-pagination');
      if (!pagination) return;

      const perPage = parseInt(pagination.dataset.perPage, 10) || 15;
      const allItems = Array.from(document.querySelectorAll('.home-latest-item'));
      const prevBtn = pagination.querySelector('.home-page-prev');
      const nextBtn = pagination.querySelector('.home-page-next');
      const pageInfo = pagination.querySelector('.home-page-info');
      let currentPage = 1;

      function updatePagination() {
        const totalPages = Math.ceil(allItems.length / perPage) || 1;
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;
        allItems.forEach((item, i) => {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });
        pageInfo.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
      }

      prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; updatePagination(); }
      });
      nextBtn?.addEventListener('click', () => {
        const totalPages = Math.ceil(allItems.length / perPage);
        if (currentPage < totalPages) { currentPage++; updatePagination(); }
      });

      updatePagination();
    })();

    // 사이드바 인기/최신 토글
    (function() {
      const sidebarTab = document.getElementById('sidebarArticleTab');
      if (!sidebarTab) return;
      sidebarTab.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.sidebarTab;
        document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
        document.getElementById('sidebar-' + target)?.classList.add('active');
      });
    })();

  </script>`;

  // WebSite JSON-LD for homepage (includes SearchAction)
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": SITE_CONFIG.name,
    "url": SITE_CONFIG.baseUrl,
    "description": SITE_CONFIG.description,
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
    ogType = 'website'   // 'website' for homepage, 'article' for articles
  } = options;

  const ogImageUrl = ogImage || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`;
  const jsonLdScript = jsonLd ? `\n  <!-- JSON-LD Structured Data -->\n  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '';

  // Article OG tags
  const articleOgTags = articleMeta ? `
  <meta property="article:published_time" content="${articleMeta.publishedTime}">
  <meta property="article:modified_time" content="${articleMeta.modifiedTime}">
  <meta property="article:section" content="${escapeHtml(articleMeta.section)}">
  <meta property="article:author" content="AIScroll Team">` : '';

  return `<!DOCTYPE html>
<html lang="en">
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
      document.head.appendChild(s);
    })();
  </script>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords)}">
  <link rel="canonical" href="${canonical}">

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="${SITE_CONFIG.favicon}">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#4f46e5">

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="${SITE_CONFIG.name}">${articleOgTags}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aiscroll_io">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImageUrl}">

  <!-- RSS -->
  <link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${SITE_CONFIG.baseUrl}/rss.xml">

  <!-- Performance hints -->
  <link rel="preconnect" href="https://wsrv.nl" crossorigin>
  <link rel="dns-prefetch" href="https://wsrv.nl">${jsonLdScript}

  <link rel="stylesheet" href="/styles.css">
  <style>
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
      /* 4개 카테고리용 25% */
      .nav-item {
        min-width: 25% !important;
        flex: 0 0 25% !important;
        justify-content: center;
        text-align: center;
        padding: 8px 4px 10px;
        margin: 0;
      }
      /* 네비 밑줄 위치 조정 */
      .nav-item.active::after {
        bottom: 2px !important;
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
        padding-top: 56px !important;
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
    /* 기사/정책 페이지 상단 마진 */
    .issue-container {
      margin-top: 20px;
    }
    /* blog-card border-radius를 home-card와 동일하게 */
    .blog-card {
      border-radius: 16px;
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
  </style>
  <script type="module">
    (function() {
      var host = window.location.hostname;
      if (host !== 'aiscroll.io') return;

      function initFirebase() {
        (async function() {
          try {
            const [{ initializeApp }, { getAnalytics }] = await Promise.all([
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
            getAnalytics(app);
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
  ${generateHeader()}
  ${generateSearchContainer()}
  ${generateNav(currentPage)}
  <main class="site-container">
    ${content}
  </main>
  ${generateFooter()}
  ${imageFallbackScript}
  ${fontScript}
  <script>
    // 공통 검색 기능
    (function() {
      const searchInput = document.querySelector('.search-input');
      const searchDropdown = document.querySelector('.search-dropdown');
      if (!searchInput || !searchDropdown) return;

      let articles = [];
      fetch('/articles.json')
        .then(res => res.json())
        .then(data => { articles = data; })
        .catch(() => { articles = []; });

      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) {
          searchDropdown.innerHTML = '';
          searchDropdown.classList.remove('active');
          return;
        }

        const results = articles.filter(a => a.title.toLowerCase().includes(query)).slice(0, 8);
        if (results.length === 0) {
          searchDropdown.innerHTML = '<div class="search-no-results">No results found</div>';
        } else {
          searchDropdown.innerHTML = results.map(a =>
            '<a href="/article/' + (a.category || 'general') + '/' + a.slug + '/" class="search-result-item">' +
              '<div class="search-result-title">' + a.title + '</div>' +
            '</a>'
          ).join('');
        }
        searchDropdown.classList.add('active');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.aiscroll-search') && !e.target.closest('.search-container')) {
          searchDropdown.classList.remove('active');
        }
      });

      // 엔터 시 검색 페이지로 이동
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim();
          if (query.length >= 2) {
            window.location.href = '/search/?q=' + encodeURIComponent(query);
          }
        }
      });
    })();

    // 모바일 검색 컨테이너용 검색 기능
    (function() {
      const container = document.querySelector('.search-container');
      if (!container) return;
      const searchInput = container.querySelector('.search-input');
      const searchDropdown = container.querySelector('.search-dropdown');
      if (!searchInput || !searchDropdown) return;

      let articles = [];
      fetch('/articles.json')
        .then(res => res.json())
        .then(data => { articles = data; })
        .catch(() => { articles = []; });

      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length < 2) {
          searchDropdown.innerHTML = '';
          searchDropdown.classList.remove('active');
          return;
        }
        const results = articles.filter(a => a.title.toLowerCase().includes(query)).slice(0, 8);
        if (results.length === 0) {
          searchDropdown.innerHTML = '<div class="search-no-results" style="padding:16px;text-align:center;color:var(--text-muted);">No results found</div>';
        } else {
          searchDropdown.innerHTML = results.map(a =>
            '<a href="/article/' + (a.category || 'general') + '/' + a.slug + '/" style="display:block;padding:12px 16px;color:var(--text-primary);text-decoration:none;border-bottom:1px solid var(--border);">' + a.title + '</a>'
          ).join('');
        }
        searchDropdown.classList.add('active');
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim();
          if (query.length >= 2) {
            window.location.href = '/search/?q=' + encodeURIComponent(query);
          }
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
          searchDropdown.classList.remove('active');
        }
      });
    })();

    // 모바일 스크롤 시 검색창 숨기기
    (function() {
      if (window.innerWidth > 768) return;
      let lastScrollY = 0;
      let ticking = false;
      let isHidden = false;
      const showThreshold = 10;
      const hideThreshold = 80;

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

    const navSections = ['home', 'general', 'openai', 'google', 'anthropic'];
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
      if (!mainEl) return;
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
      if (t && t.closest && t.closest('.nav, .nav-inner, .search-dropdown, .search-container, input, textarea')) return;

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
  ${pageScripts}
  <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
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

      function renderPage() {
        const totalPages = Math.ceil(allResults.length / perPage) || 1;
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;
        const pageResults = allResults.slice(start, end);

        resultsContainer.innerHTML = '<div class="category-list">' +
          pageResults.map(a =>
            '<a href="/article/' + (a.category || 'general') + '/' + a.slug + '/" class="category-list-card">' +
              '<div class="category-list-thumb">' +
                (a.thumbnail ? '<img src="' + a.thumbnail + '" alt="" loading="lazy">' : '') +
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

      fetch('/articles.json')
        .then(res => res.json())
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
    pageScripts: pageScripts
  });
}

/**
 * 카테고리 페이지 생성
 */
function generateCategoryPage(categoryId, categoryLabel, articles, popularArticles = [], latestArticles = []) {
  const categoryArticles = articles.filter(a => a.category === categoryId);

  const articleListHtml = categoryArticles.length > 0
    ? `<div class="home-latest-grid" id="categoryGrid">
        ${categoryArticles.map((a, i) => `
          <a href="/article/${a.category}/${a.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
            <div class="home-trend-card-image">
              ${a.thumbnail ? `<img src="${getThumbUrl(a.thumbnail, 480)}" alt="${escapeHtml(a.title)}" loading="lazy">` : ''}
              <span class="home-trend-card-tag">${formatDateEn(a.date)}</span>
            </div>
            <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${escapeHtml(a.title)}</span></h3>
          </a>
        `).join('')}
      </div>
      <div class="home-pagination" id="categoryPagination">
        <button class="home-page-btn home-prev" aria-label="Previous">‹</button>
        <span class="home-page-index">1/1</span>
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
    { id: 'anthropic', label: 'Anthropic' }
  ];

  // 사이드바 렌더링
  const renderSidebarList = (items) => items.slice(0, 10).map((item, i) => `
    <a href="/article/${item.category || 'general'}/${item.slug}/" class="sidebar-article-item">
      <span class="sidebar-article-rank">${i + 1}</span>
      <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
    </a>
  `).join('');

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
            <div class="sidebar-article-list" id="sidebar-latest">${renderSidebarList(latestArticles)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const content = `
    <section class="home-section active" id="category">
      <div class="page-container">
        <div class="home-container">
          <div class="home-main">
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

  const pageScripts = `<script>
    // 카테고리 페이지네이션
    (function() {
      const grid = document.getElementById('categoryGrid');
      const pagination = document.getElementById('categoryPagination');
      if (!grid || !pagination) return;
      const items = Array.from(grid.querySelectorAll('.home-trend-card'));
      const pageSize = 15;
      const totalPages = Math.ceil(items.length / pageSize) || 1;
      let currentPage = 1;
      const prevBtn = pagination.querySelector('.home-prev');
      const nextBtn = pagination.querySelector('.home-next');
      const pageIndex = pagination.querySelector('.home-page-index');
      function updatePagination() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        items.forEach((item, i) => { item.style.display = (i >= start && i < end) ? '' : 'none'; });
        pageIndex.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
      }
      prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updatePagination(); } });
      nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updatePagination(); } });
      updatePagination();
    })();

    // 사이드바 인기/최신 토글
    (function() {
      const sidebarTab = document.getElementById('sidebarArticleTab');
      if (!sidebarTab) return;
      sidebarTab.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.sidebarTab;
        document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
        document.getElementById('sidebar-' + target)?.classList.add('active');
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    title: `${categoryLabel} - ${SITE_CONFIG.name}`,
    description: `${categoryLabel} articles on AIScroll`,
    keywords: `${categoryLabel}, AI news, ${SITE_CONFIG.keywords}`,
    canonical: `${SITE_CONFIG.baseUrl}/article/${categoryId}/`,
    pageScripts,
    currentPage: categoryId
  });
}

module.exports = {
  generateAIBlogIndex,
  generateSearchPage,
  generateCategoryPage,
  wrapWithLayout,
  SITE_CONFIG,
  formatDateEn,
  escapeHtml,
  getThumbUrl
};
