/**
 * 출시 게임 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

// 광고 슬롯 변수 (함수 내에서 정의)

// 플랫폼별 기본 로고 SVG
const platformLogos = {
  steam: '<svg viewBox="0 0 24 24" fill="#1b2838"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/></svg>',
  nintendo: '<svg viewBox="0 0 24 24" fill="#e60012"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>',
  ps5: '<svg viewBox="0 0 24 24" fill="#003791"><path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.153 0-3.247-1.199-4.872-3.545-5.596-1.017-.317-2.962-.709-4.269-1.086-1.311-.379-2.017-.683-2.017-.683z"/><path d="M16.997 14.963c-1.387.471-1.81.832-1.81 1.457 0 .571.312.934.991.934.596 0 1.224-.279 1.78-.607v1.623c-.559.328-1.401.583-2.253.583-1.596 0-2.649-.857-2.649-2.181 0-1.45 1.105-2.135 2.812-2.713l1.129-.399V12.1c0-.857-.262-1.262-.936-1.262-.596 0-1.225.314-1.812.643v-1.652c.558-.328 1.401-.553 2.253-.553 1.656 0 2.526.827 2.526 2.426v4.261c0 .857.107 1.284.304 1.602h-2.04c-.165-.285-.262-.596-.262-.931v-.002z"/><path d="M1 18.156v-1.623c.952.5 2.116.91 3.109.91.905 0 1.262-.28 1.262-.704 0-.424-.357-.643-1.453-.991l-.952-.314c-1.355-.44-2.116-1.284-2.116-2.569 0-1.596 1.087-2.569 3.202-2.569.905 0 2.253.286 3.078.643v1.623c-.905-.471-2.166-.881-3.078-.881-.875 0-1.233.286-1.233.674 0 .387.387.613 1.325.931l.952.314c1.566.5 2.253 1.315 2.253 2.629 0 1.596-1.147 2.569-3.23 2.569-.905 0-2.253-.286-3.119-.643z"/></svg>',
  mobile: '<svg viewBox="0 0 24 24" fill="#34a853"><rect x="5" y="2" width="14" height="20" rx="2" stroke="#34a853" stroke-width="2" fill="none"/><circle cx="12" cy="18" r="1.5" fill="#34a853"/></svg>'
};

function generateUpcomingPage(data) {
  const { upcoming } = data;

  // 광고 슬롯 - 모바일 최상단 광고는 layout.js에서 container 밖에 배치됨
  
  const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins></div>' : '';

  // 출시 예정 게임 섹션 생성
  function generateUpcomingSection(items, platform) {
    if (!items || items.length === 0) {
      return '<div class="upcoming-empty">출시 예정 정보를 불러올 수 없습니다</div>';
    }
    const defaultLogo = platformLogos[platform] || platformLogos.mobile;
    const header = `
      <div class="upcoming-table-header">
        <div>순위</div>
        <div>게임</div>
        <div>출시일</div>
      </div>
    `;
    const rows = items.map((game, i) => {
      const isSteam = platform === 'steam' && game.appid;
      const fallbackImg = isSteam ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/capsule_231x87.jpg` : '';
      const onerrorHandler = isSteam
        ? `if(!this.dataset.retry){this.dataset.retry='1';this.src='${fallbackImg}';}else{this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none';}`
        : `this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none'`;

      return `
      <a class="upcoming-item" href="${game.link || '#'}" target="_blank" rel="noopener">
        <div class="upcoming-col-rank">
          <span class="upcoming-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
        </div>
        <div class="upcoming-col-game">
          ${game.img ? `<img class="upcoming-icon" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="${onerrorHandler}">` : ''}<div class="upcoming-icon-placeholder ${game.img ? 'hidden' : ''}">${defaultLogo}</div>
          <div class="upcoming-info">
            <div class="upcoming-name">${game.name}</div>
            ${game.publisher ? `<div class="upcoming-publisher">${game.publisher}</div>` : ''}
          </div>
        </div>
        <div class="upcoming-col-date">${game.releaseDate || '-'}</div>
      </a>
    `;
    }).join('');
    return header + rows;
  }

  const content = `
    <section class="section active" id="upcoming">
      
      <div class="page-wrapper">
        ${topAdPc}
        <h1 class="visually-hidden">출시 게임 - 신작 게임, 출시 예정 게임</h1>
        <div class="upcoming-card home-card">
          <div class="home-card-header">
            <h2 class="home-card-title">출시 게임</h2>
          </div>
          <div class="rankings-tabs-row">
            <div class="tab-group" id="upcomingTab">
              <button class="tab-btn active" data-upcoming="steam">
                <img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="" class="news-favicon">스팀
              </button>
              <button class="tab-btn" data-upcoming="ps5">
                <img src="https://www.google.com/s2/favicons?domain=playstation.com&sz=32" alt="" class="news-favicon">PS5
              </button>
              <button class="tab-btn" data-upcoming="nintendo">
                <svg viewBox="0 0 24 24" fill="#e60012" class="news-favicon" style="width:20px;height:20px"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>닌텐도
              </button>
              <button class="tab-btn" data-upcoming="mobile">
                <img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">모바일
              </button>
            </div>
          </div>
          <div class="home-card-body">
            <div class="upcoming-section active" id="upcoming-steam">
              ${generateUpcomingSection(upcoming?.steam || [], 'steam')}
            </div>
            <div class="upcoming-section" id="upcoming-ps5">
              ${generateUpcomingSection(upcoming?.ps5 || [], 'ps5')}
            </div>
            <div class="upcoming-section" id="upcoming-nintendo">
              ${generateUpcomingSection(upcoming?.nintendo || [], 'nintendo')}
            </div>
            <div class="upcoming-section" id="upcoming-mobile">
              ${generateUpcomingSection(upcoming?.mobile || [], 'mobile')}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }
    // twemoji
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
    // 출시 게임 탭 전환
    document.querySelectorAll('#upcomingTab .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#upcomingTab .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.upcoming;
        document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
        document.getElementById('upcoming-' + target)?.classList.add('active');
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'upcoming',
    title: '출시 게임 - 신작 게임, 출시 예정 게임',
    description: '출시 게임 - 신작 게임, 출시 예정 게임 정보를 한눈에.',
    keywords: '출시 게임, 신작 게임, 출시 예정 게임, 스팀 출시, 닌텐도 출시, PS5 출시, 모바일 신작',
    canonical: 'https://gamerscrawl.com/upcoming/',
    pageScripts
  });
}

module.exports = { generateUpcomingPage };
