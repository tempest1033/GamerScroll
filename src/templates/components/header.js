/**
 * 헤더 컴포넌트 (로고)
 */

function generateHeader() {
  return `
  <header class="header">
    <div class="header-inner">
      <h1 class="header-title">
        <a href="/" style="text-decoration: none; color: inherit;">
          <span class="visually-hidden">게이머스크롤 - 게임 인사이트, 순위, 뉴스를 한눈에</span>
          <svg class="logo-svg" viewBox="0 0 660 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#4f46e5" />
                <stop offset="100%" stop-color="#06b6d4" />
              </linearGradient>
            </defs>
            <text class="logo-text-svg" x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="62" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">GAMERS CRAWL</text>
            <!-- 왼쪽 안테나 -->
            <rect x="8" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
            <rect x="26" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
            <rect x="44" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
            <!-- 오른쪽 안테나 -->
            <rect x="606" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
            <rect x="624" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
            <rect x="642" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
          </svg>
        </a>
      </h1>
    </div>
  </header>`;
}

module.exports = { generateHeader };
