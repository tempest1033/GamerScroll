/**
 * 헤더 컴포넌트 (로고)
 */

function generateHeader() {
  return `
  <style>
    .gs-header { padding: 22px 0 !important; position: relative; z-index: 100000; }
    .gs-header-inner {
      display: flex !important;
      align-items: center;
      justify-content: space-between !important;
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 32px !important;
      gap: 24px;
    }
    .gs-logo { flex-shrink: 0; }
    .gs-logo .logo-svg { height: 40px; width: auto; }
    .gs-search { position: relative; flex-shrink: 0; width: 300px; }
    .gs-search .search-box {
      display: flex;
      align-items: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 8px 16px;
      transition: border-color 0.15s;
    }
    .gs-search .search-box:focus-within { border-color: var(--primary); }
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
          <svg class="logo-svg" viewBox="0 0 660 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#2563EB" />
                <stop offset="100%" stop-color="#60A5FA" />
              </linearGradient>
            </defs>
            <text class="logo-text-svg" x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="62" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">GAMER SCROLL</text>
            <rect x="8" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
            <rect x="26" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
            <rect x="44" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
            <rect x="606" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
            <rect x="624" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
            <rect x="642" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
          </svg>
        </a>
      </div>
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
    </div>
  </header>`;
}

module.exports = { generateHeader };
