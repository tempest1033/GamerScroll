/**
 * 헤더 컴포넌트 (로고)
 */

const { navItems, navIdOf } = require('./nav');

// 상단 바 오른쪽 상태 문구 (마지막 수집 시각). 빌드 스크립트가 데이터 로드 후 넣는다.
let headerStatus = '';
function setHeaderStatus(text) { headerStatus = String(text || ''); }

// 로고 글자를 도형으로 고정해 웹폰트 로딩 전후에도 모양이 바뀌지 않는다.
const LOGO_SVG = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../assets/logo-wordmark-outlined.svg'), 'utf8');

function generateHeader(currentPage = 'home') {
  const activeId = navIdOf(currentPage);
  return `
  <style>
    .gs-header { padding: 0 !important; position: sticky; top: 0; z-index: 100000; background: var(--gs-header-bg); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); }
    .gs-header-inner {
      display: flex !important;
      align-items: center;
      justify-content: flex-start !important;
      max-width: var(--site-max-width, 1240px);
      height: 68px;
      margin: 0 auto;
      padding: 0 var(--site-gutter, 40px) !important;
      gap: 32px;
    }
    .gs-logo { flex-shrink: 0; color: var(--text); }
    .gs-logo .logo-svg { height: 18px; width: 165px; display: block; }
    .gs-nav { display: flex; gap: 26px; }
    .gs-nav a { font-size: 15px; font-weight: 600; color: var(--text-muted); text-decoration: none; white-space: nowrap; padding: 4px 0; position: relative; }
    .gs-nav a:hover, .gs-nav a.active { color: var(--primary); }
    .gs-nav a.active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -23px; height: 3px; border-radius: 3px 3px 0 0; background: var(--primary); }
    .gs-status { margin-left: 0; font-size: 11px; color: var(--text-muted); white-space: nowrap; }
    @media (max-width: 1120px) { .gs-status { display: none; } .gs-header-inner { gap: 22px; } .gs-nav { gap: 18px; } }
    .gs-search { position: relative; flex-shrink: 0; width: 240px; margin-left: auto; }
    .gs-search .search-box {
      display: flex;
      align-items: center;
      height: 36px;
      background: var(--bg);
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 0 12px;
      transition: border-color 0.15s;
    }
    .gs-search .search-box:focus-within { border-color: var(--primary); background: var(--card); }
    .gs-search .search-input {
      flex: 1;
      min-width: 0;
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
          <input type="text" class="search-input" aria-label="게임 검색" placeholder="게임 검색" autocomplete="off">
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
