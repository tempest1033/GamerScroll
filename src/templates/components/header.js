/**
 * 헤더 컴포넌트 (로고)
 */

const { navItems, navIdOf } = require('./nav');

// 상단 바 오른쪽 상태 문구 (마지막 수집 시각). 빌드 스크립트가 데이터 로드 후 넣는다.
let headerStatus = '';
function setHeaderStatus(text) { headerStatus = String(text || ''); }

// 로고: 막대 4개 + GAMER SCROLL 워드마크 (단색, 18px 높이)
const LOGO_SVG = `<svg class="logo-svg" viewBox="0 0 560 62" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="currentColor"><rect x="0" y="22" width="6" height="18" rx="2"/><rect x="10" y="12" width="6" height="38" rx="2"/><rect x="20" y="4" width="6" height="54" rx="2"/><rect x="30" y="14" width="6" height="34" rx="2"/></g><text x="50" y="49" font-family="'Pretendard Variable', Pretendard, -apple-system, sans-serif" font-weight="900" font-size="58" letter-spacing="-2" fill="currentColor">GAMER SCROLL</text></svg>`;

function generateHeader(currentPage = 'home') {
  const activeId = navIdOf(currentPage);
  return `
  <style>
    .gs-header { padding: 0 !important; position: sticky; top: 0; z-index: 100000; background: rgba(255, 255, 255, .94); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-bottom: 1px solid #e6e6e6; }
    .gs-header-inner {
      display: flex !important;
      align-items: center;
      justify-content: flex-start !important;
      max-width: 1120px;
      height: 60px;
      margin: 0 auto;
      padding: 0 24px !important;
      gap: 32px;
    }
    .gs-logo { flex-shrink: 0; color: #111; }
    .gs-logo .logo-svg { height: 18px; width: 165px; display: block; }
    .gs-nav { display: flex; gap: 26px; }
    .gs-nav a { font-size: 15px; font-weight: 600; color: #6b6b6b; text-decoration: none; white-space: nowrap; padding: 4px 0; position: relative; }
    .gs-nav a:hover, .gs-nav a.active { color: #111; }
    .gs-nav a.active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -19px; height: 2px; background: #111; }
    .gs-status { margin-left: 12px; font-size: 12px; color: #9a9a9a; white-space: nowrap; }
    .gs-search { position: relative; flex-shrink: 0; width: 240px; margin-left: auto; }
    .gs-search .search-box {
      display: flex;
      align-items: center;
      height: 36px;
      background: #f5f5f7;
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 0 12px;
      transition: border-color 0.15s;
    }
    .gs-search .search-box:focus-within { border-color: var(--primary); background: #fff; }
    .gs-search .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text);
      font-size: 14px;
    }
    .gs-search .search-input::placeholder { color: var(--text-muted); }
    .gs-search .search-btn {
      background: transparent;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--text-muted);
      display: flex;
      align-items: center;
    }
    .gs-search .search-btn svg { width: 18px; height: 18px; }
    .gs-search .search-dropdown {
      position: absolute !important;
      top: calc(100% + 4px) !important;
      left: 0 !important;
      right: 0 !important;
      transform: none !important;
      width: 100% !important;
      max-width: none !important;
      background: var(--card) !important;
      border: 1px solid var(--border) !important;
      border-radius: 12px !important;
      display: none;
      z-index: 99999 !important;
      max-height: 400px !important;
      overflow-y: auto;
      box-shadow: var(--shadow-lg) !important;
      margin-top: 0 !important;
    }
    .gs-search .search-dropdown.active { display: block; }
    /* PC에서 별도 search-container 숨김 (헤더 내장으로 대체) */
    @media (min-width: 769px) {
      body:not(.detail-page) > .search-container { display: none !important; }
    }
    @media (max-width: 768px) {
      .gs-header { display: none !important; }
    }
  </style>
  <header class="header gs-header">
    <div class="header-inner gs-header-inner">
      <div class="header-title gs-logo">
        <a href="/">
          <span class="visually-hidden">게이머스크롤</span>
          ${LOGO_SVG}
        </a>
      </div>
      <nav class="gs-nav" aria-label="주 메뉴">${navItems.map((it) => `<a class="${it.id === activeId ? 'active' : ''}" href="${it.href}">${it.label}</a>`).join('')}</nav>
      <div class="gs-search">
        <div class="search-box">
          <input type="text" class="search-input" placeholder="게임 검색..." autocomplete="off">
          <button class="search-btn" type="button" aria-label="검색">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>
        <div class="search-dropdown"></div>
      </div>
      ${headerStatus ? `<span class="gs-status">${headerStatus}</span>` : ''}
    </div>
  </header>`;
}

module.exports = { generateHeader, setHeaderStatus, LOGO_SVG };
