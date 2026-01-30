/**
 * AIScroll 홈페이지 템플릿
 * GamerScroll 스타일 기반, AI 블로그 전용
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

  // 인기 카드 (가로형 3개)
  function generatePopularCards() {
    const items = popularArticles.slice(0, 3);
    if (items.length === 0) return '';

    const cards = items.map((item, i) => `
      <a href="/article/${item.slug}/" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? `<img src="${getThumbUrl(item.thumbnail)}" alt="${escapeHtml(item.title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
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
        <div class="home-popular-list">${cards}</div>
      </div>
    `;
  }

  // 최신 카드 (3컬럼 그리드)
  function generateLatestGrid() {
    const items = articles;
    if (items.length === 0) return '';

    const cards = items.map((item, i) => `
      <a href="/article/${item.slug}/" class="home-trend-card home-latest-item" data-index="${i}">
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

  // 사이드바: 인기/최신 토글
  function generateSidebarArticles() {
    const renderList = (items) => items.slice(0, 10).map((item, i) => `
      <a href="/article/${item.slug}/" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
      </a>
    `).join('');

    return `
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

    // 검색 기능
    (function() {
      const searchInput = document.querySelector('.search-input');
      const searchDropdown = document.querySelector('.search-dropdown');
      if (!searchInput || !searchDropdown) return;

      const articles = ${JSON.stringify(articles.map(a => ({ slug: a.slug, title: a.title })))};

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
            '<a href="/article/' + a.slug + '/" class="search-result-item">' +
              '<div class="search-result-title">' + a.title + '</div>' +
            '</a>'
          ).join('');
        }
        searchDropdown.classList.add('active');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
          searchDropdown.classList.remove('active');
        }
      });
    })();
  </script>`;

  return wrapWithLayout(content, {
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    keywords: SITE_CONFIG.keywords,
    canonical: SITE_CONFIG.baseUrl + '/',
    pageScripts: pageScripts
  });
}

/**
 * 레이아웃 래퍼
 */
function wrapWithLayout(content, options = {}) {
  const {
    title = SITE_CONFIG.title,
    description = SITE_CONFIG.description,
    keywords = SITE_CONFIG.keywords,
    canonical = SITE_CONFIG.baseUrl,
    pageScripts = ''
  } = options;

  // 로고 SVG
  const logoSvg = `<svg viewBox="0 0 120 24" fill="currentColor" class="logo-svg">
    <text x="0" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700">AIScroll</text>
  </svg>`;

  // 검색바
  const searchBar = `
    <div class="search-container">
      <div class="search-box">
        <a href="/" class="search-home-icon" aria-label="Home">
          <img src="${SITE_CONFIG.favicon}" alt="" width="20" height="20">
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/svg+xml" href="${SITE_CONFIG.favicon}">

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}">
  <meta property="og:locale" content="en_US">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}">

  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="header-container">
      <a href="/" class="site-logo" aria-label="${SITE_CONFIG.name}">
        ${logoSvg}
      </a>
    </div>
  </header>

  <div class="search-bar-wrapper">
    ${searchBar}
  </div>

  <main class="site-main">
    ${content}
  </main>

  <footer class="site-footer">
    <div class="footer-container">
      <p>&copy; ${new Date().getFullYear()} ${SITE_CONFIG.name}. All rights reserved.</p>
    </div>
  </footer>

  ${pageScripts}
</body>
</html>`;
}

module.exports = {
  generateAIBlogIndex,
  wrapWithLayout,
  SITE_CONFIG,
  formatDateEn,
  escapeHtml,
  getThumbUrl
};
