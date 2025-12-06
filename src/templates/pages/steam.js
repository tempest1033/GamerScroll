/**
 * 스팀 순위 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS } = require('../layout');
const { getFavicon } = require('../components/favicons');

function generateSteamPage(data) {
  const { steam } = data;

  // 스팀 placeholder SVG
  const steamPlaceholder = '<svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg>';

  // 최다 플레이 테이블 생성
  function generateMostPlayedTable() {
    if (!steam?.mostPlayed || steam.mostPlayed.length === 0) {
      return '<div class="steam-empty">데이터를 불러올 수 없습니다</div>';
    }

    return `
      <div class="steam-table">
        <div class="steam-table-header">
          <div>순위</div>
          <div>게임</div>
          <div>접속자수</div>
        </div>
        ${steam.mostPlayed.map((game, i) => `
          <div class="steam-table-row">
            <div class="steam-col-rank">
              <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
            </div>
            <div class="steam-col-game">
              <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
              <div class="steam-img-placeholder" style="display:none">${steamPlaceholder}</div>
              <div class="steam-game-info">
                <div class="steam-game-name">${game.name}</div>
                <div class="steam-game-dev">${game.developer}</div>
              </div>
            </div>
            <div class="steam-col-players">${game.ccu.toLocaleString()}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 최고 판매 테이블 생성
  function generateTopSellersTable() {
    if (!steam?.topSellers || steam.topSellers.length === 0) {
      return '<div class="steam-empty">데이터를 불러올 수 없습니다</div>';
    }

    return `
      <div class="steam-table">
        <div class="steam-table-header">
          <div>순위</div>
          <div>게임</div>
          <div>가격</div>
        </div>
        ${steam.topSellers.map((game, i) => `
          <div class="steam-table-row">
            <div class="steam-col-rank">
              <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
            </div>
            <div class="steam-col-game">
              <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
              <div class="steam-img-placeholder" style="display:none">${steamPlaceholder}</div>
              <div class="steam-game-info">
                <div class="steam-game-name">${game.name}</div>
                <div class="steam-game-dev">${game.developer}</div>
              </div>
            </div>
            <div class="steam-col-players steam-price-info">${game.discount ? `<span class="steam-discount">${game.discount}</span>` : ''}<span class="steam-price">${game.price}</span></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const content = `
    <section class="section active" id="steam">
      ${SHOW_ADS ? `<div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="steam-controls">
        <div class="tab-group" id="steamTab">
          <button class="tab-btn steam-btn active" data-steam="mostplayed"><img src="${getFavicon('store.steampowered.com')}" alt="" class="news-favicon">최다 플레이</button>
          <button class="tab-btn steam-btn" data-steam="topsellers"><img src="${getFavicon('store.steampowered.com')}" alt="" class="news-favicon">최고 판매</button>
        </div>
      </div>

      <div class="steam-section active" id="steam-mostplayed">
        ${generateMostPlayedTable()}
      </div>

      <div class="steam-section" id="steam-topsellers">
        ${generateTopSellersTable()}
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
    // 스팀 탭 전환
    document.querySelectorAll('#steamTab .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#steamTab .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.steam;
        document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
        document.getElementById('steam-' + target)?.classList.add('active');
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'steam',
    title: '게이머스크롤 | 스팀 게임 순위',
    description: '스팀 동시접속자 TOP 50, 베스트셀러 게임 순위. PC 게임 트렌드와 인기 게임을 실시간으로 확인하세요.',
    canonical: 'https://gamerscrawl.com/steam',
    pageScripts
  });
}

module.exports = { generateSteamPage };
