/**
 * 스팀 순위 페이지 템플릿
 */

const { wrapWithLayout, AD_SLOTS, generateAdSlot } = require('../layout');

function generateSteamPage(data) {
  const { steam } = data;

  // 광고 슬롯 (모바일/PC)
  const topAds = generateAdSlot(AD_SLOTS.PC_LongHorizontal001, AD_SLOTS.Mobile_Horizontal001);

  // 스팀 placeholder SVG
  const steamPlaceholder = '<svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg>';

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
              <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" data-img-fallback="hide-show-next" data-img-fallback-show-next="1" data-img-fallback-show-display="flex">
              <div class="steam-img-placeholder">${steamPlaceholder}</div>
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
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">스팀 게임 순위</h1>
        <div class="steam-card home-card">
          <div class="home-card-header">
            <h2 class="visually-hidden">스팀 순위, 스팀 매출, 스팀 동접자</h2>
            <span class="home-card-title">스팀 게임 순위</span>
            <div class="home-card-controls">
              <div class="tab-group" id="steamTab">
                <button class="tab-btn steam-btn active" data-steam="topsellers">매출</button>
                <button class="tab-btn steam-btn" data-steam="mostplayed">인기</button>
              </div>
            </div>
          </div>
          <div class="home-card-body">
            <div class="steam-section active" id="steam-topsellers">
              ${generateTopSellersTable()}
            </div>
            <div class="steam-section" id="steam-mostplayed" data-steam-loaded="0">
              <div class="steam-empty">"인기" 탭을 선택하면 불러옵니다</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
	  <script>
	    (function() {
	      const STEAM_DATA_URL = '/steam/data.json';
	      const STEAM_DATA_CACHE_KEY = 'gamerscrawl_steam_data_v1';
	      const STEAM_PLACEHOLDER = ${JSON.stringify(steamPlaceholder)};

	      let steamData = null;
	      let steamDataPromise = null;
	      let mostPlayedRenderPromise = null;

	      function escapeHtml(v) {
	        return String(v ?? '').replace(/[&<>"']/g, (c) => (
	          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
	        ));
	      }

	      async function loadSteamDataOnce() {
	        if (steamData) return steamData;
	        if (steamDataPromise) return steamDataPromise;

	        steamDataPromise = (async () => {
	          try {
	            const cached = sessionStorage.getItem(STEAM_DATA_CACHE_KEY);
	            if (cached) {
	              steamData = JSON.parse(cached);
	              return steamData;
	            }
	          } catch (e) {}

	          try {
	            const res = await fetch(STEAM_DATA_URL);
	            if (!res.ok) throw new Error('steam data fetch failed');
	            steamData = await res.json();
	            try {
	              sessionStorage.setItem(STEAM_DATA_CACHE_KEY, JSON.stringify(steamData));
	            } catch (e) {}
	            return steamData;
	          } catch (e) {
	            steamData = null;
	            return null;
	          }
	        })();

	        return steamDataPromise;
	      }

	      function formatNumber(v) {
	        const n = Number(v);
	        if (!Number.isFinite(n)) return escapeHtml(v);
	        return n.toLocaleString();
	      }

	      function renderMostPlayedTable(list) {
	        if (!Array.isArray(list) || list.length === 0) {
	          return '<div class="steam-empty">데이터를 불러올 수 없습니다</div>';
	        }

	        return (
	          '<div class="steam-table">' +
	            '<div class="steam-table-header">' +
	              '<div>순위</div>' +
	              '<div>게임</div>' +
	              '<div>접속자수</div>' +
	            '</div>' +
	            list.map((game, i) => (
	              '<div class="steam-table-row">' +
	                '<div class="steam-col-rank">' +
	                  '<span class="steam-rank ' + (i < 3 ? ('top' + (i + 1)) : '') + '">' + (i + 1) + '</span>' +
	                '</div>' +
	                '<div class="steam-col-game">' +
	                  '<img class="steam-img" src="' + escapeHtml(game?.img || '') + '" alt="" loading="lazy" decoding="async" data-img-fallback="hide-show-next" data-img-fallback-show-next="1" data-img-fallback-show-display="flex">' +
	                  '<div class="steam-img-placeholder">' + STEAM_PLACEHOLDER + '</div>' +
	                  '<div class="steam-game-info">' +
	                    '<div class="steam-game-name">' + escapeHtml(game?.name || '') + '</div>' +
	                    '<div class="steam-game-dev">' + escapeHtml(game?.developer || '') + '</div>' +
	                  '</div>' +
	                '</div>' +
	                '<div class="steam-col-players">' + formatNumber(game?.ccu) + '</div>' +
	              '</div>'
	            )).join('') +
	          '</div>'
	        );
	      }

	      function ensureMostPlayedRendered() {
	        const section = document.getElementById('steam-mostplayed');
	        if (!section) return Promise.resolve();
	        if (section.dataset.steamLoaded === '1') return Promise.resolve();
	        if (mostPlayedRenderPromise) return mostPlayedRenderPromise;

	        section.innerHTML = '<div class="steam-empty">불러오는 중...</div>';

	        mostPlayedRenderPromise = (async () => {
	          const data = await loadSteamDataOnce();
	          const list = data && Array.isArray(data.mostPlayed) ? data.mostPlayed : [];
	          if (!list || list.length === 0) {
	            section.innerHTML = '<div class="steam-empty">데이터를 불러올 수 없습니다</div>';
	            section.dataset.steamLoaded = '0';
	            mostPlayedRenderPromise = null;
	            return;
	          }
	          section.innerHTML = renderMostPlayedTable(list);
	          section.dataset.steamLoaded = '1';
	        })();

	        return mostPlayedRenderPromise;
	      }

	      // 스팀 탭 전환
	      document.querySelectorAll('#steamTab .tab-btn').forEach(btn => {
	        btn.addEventListener('click', () => {
	          document.querySelectorAll('#steamTab .tab-btn').forEach(b => b.classList.remove('active'));
	          btn.classList.add('active');
	          const target = btn.dataset.steam;
	          document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
	          document.getElementById('steam-' + target)?.classList.add('active');

	          if (target === 'mostplayed') {
	            ensureMostPlayedRendered();
	          }
	        });
	      });
	    })();
	  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'steam',
    title: '스팀 게임 순위 - 스팀 매출, 스팀 동접자',
    description: '스팀 게임 순위 TOP 100. 스팀 매출 순위와 동접자 인기 순위를 실시간으로 확인하세요.',
    keywords: '스팀 게임 순위, 스팀 순위, 스팀 매출, 스팀 동접자, 게임 순위',
    canonical: 'https://gamerscrawl.com/steam/',
    pageScripts
  });
}

module.exports = { generateSteamPage };
