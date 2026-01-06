/**
 * 모바일 순위 페이지 템플릿
 */

const { wrapWithLayout, AD_SLOTS, generateAdSlot } = require('../layout');
const { countries } = require('../../crawlers/rankings');

function generateRankingsPage(data) {
  const { rankings, games = {} } = data;
  const INITIAL_ROWS = 30;

  // appId -> slug 빠른 매핑 (iOS/Android)
  const iosSlugMap = {};
  const androidSlugMap = {};
  Object.values(games || {}).forEach(g => {
    if (!g || !g.slug || !g.appIds) return;
    if (g.appIds.ios) iosSlugMap[String(g.appIds.ios)] = g.slug;
    if (g.appIds.android) androidSlugMap[String(g.appIds.android)] = g.slug;
  });

  function findGameSlug(appId, platform) {
    if (!appId) return null;
    return platform === 'ios'
      ? (iosSlugMap[String(appId)] || null)
      : (androidSlugMap[String(appId)] || null);
  }

  // 광고 슬롯 (모바일/PC)
  const topAds = generateAdSlot(AD_SLOTS.PC_LongHorizontal001, AD_SLOTS.Mobile_Horizontal001);

  // 순위 컬럼 생성
  function generateRankColumn(maxItems = 200) {
    const rows = Array.from({length: maxItems}, (_, i) =>
      `<div class="rank-row rank-only"><span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span></div>`
    ).join('');
    return `<div class="country-column rank-column" data-country="rank"><div class="column-header"><span class="country-name">순위</span></div><div class="rank-list">${rows}</div></div>`;
  }

  // iOS 국가별 컬럼 생성 (100위까지)
  function generateCountryColumns(chartData, store = 'ios', maxItems = 100) {
    const rankCol = generateRankColumn(maxItems);
    const countryCols = countries.map(c => {
      const items = chartData[c.code]?.[store] || [];
      const rows = items.length > 0 ? items.slice(0, maxItems).map((app, i) => {
        const slug = findGameSlug(app.appId, store);
        const rowContent = `<img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" data-img-fallback="hide-visibility"><div class="app-info"><div class="app-name">${app.title}</div><div class="app-dev">${app.developer}</div></div>`;
        return slug
          ? `<a class="rank-row rank-row-link" href="/games/${slug}/">${rowContent}</a>`
          : `<div class="rank-row">${rowContent}</div>`;
      }).join('') : '<div class="no-data">데이터 없음</div>';
      return `<div class="country-column" data-country="${c.code}"><div class="column-header"><span class="flag">${c.flag}</span><span class="country-name">${c.name}</span></div><div class="rank-list">${rows}</div></div>`;
    }).join('');
    return rankCol + countryCols;
  }

  // Android 국가별 컬럼 생성
  function generateAndroidColumns(chartData) {
    const rankCol = generateRankColumn();
    const countryCols = countries.map(c => {
      const items = chartData[c.code]?.android || [];
      let rows;
      if (c.code === 'cn') {
        rows = '';
      } else if (items.length > 0) {
        rows = items.map((app, i) => {
          const slug = findGameSlug(app.appId, 'android');
          const rowContent = `<img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" data-img-fallback="hide-visibility"><div class="app-info"><div class="app-name">${app.title}</div><div class="app-dev">${app.developer}</div></div>`;
          return slug
            ? `<a class="rank-row rank-row-link" href="/games/${slug}/">${rowContent}</a>`
            : `<div class="rank-row">${rowContent}</div>`;
        }).join('');
      } else {
        rows = '<div class="no-data">데이터 없음</div>';
      }
      return `<div class="country-column" data-country="${c.code}"><div class="column-header"><span class="flag">${c.flag}</span><span class="country-name">${c.name}</span></div><div class="rank-list">${rows}</div></div>`;
    }).join('');
    return rankCol + countryCols;
  }

  const content = `
    <section class="section active" id="rankings">
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">모바일 게임 순위</h1>
        <div class="rankings-card home-card">
          <div class="home-card-header">
            <h2 class="visually-hidden">앱스토어 게임 순위, 플레이스토어 게임 순위</h2>
            <span class="home-card-title">모바일 게임 순위</span>
            <div class="home-card-controls">
              <div class="tab-group" id="chartTab">
                <button class="tab-btn grossing-btn active" data-chart="grossing">매출</button>
                <button class="tab-btn free-btn" data-chart="free">인기</button>
              </div>
            </div>
          </div>
          <div class="rankings-tabs-row">
            <div class="tab-group" id="storeTab">
              <button class="tab-btn ios-btn active" data-store="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">iOS</button>
              <button class="tab-btn android-btn" data-store="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="" class="news-favicon">Android</button>
            </div>
          </div>
          <div class="home-card-body">
	        <div class="chart-section active" id="ios-grossing">
	          <div class="chart-scroll">
	            <div class="columns-grid" data-rendered="partial" data-chart="grossing" data-store="ios" data-loaded-count="${INITIAL_ROWS}">${generateCountryColumns(rankings.grossing, 'ios', INITIAL_ROWS)}</div>
	          </div>
	        </div>
	        <div class="chart-section" id="ios-free">
	          <div class="chart-scroll">
	            <div class="columns-grid"></div>
	          </div>
	        </div>
	        <div class="chart-section" id="android-grossing">
	          <div class="chart-scroll">
	            <div class="columns-grid"></div>
	          </div>
	        </div>
	        <div class="chart-section" id="android-free">
	          <div class="chart-scroll">
	            <div class="columns-grid"></div>
	          </div>
	        </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
	  <script>
	    const COUNTRIES = ${JSON.stringify(countries)};
	    const INITIAL_COUNT = ${INITIAL_ROWS};
	    const RANKINGS_ALL_DATA_URL = '/rankings/data.json';
	    const RANKINGS_CACHE_VERSION = 'v2';

	    const rankingsCache = {};
	    const rankingsPromise = {};

	    function getMaxItems(store) {
	      return store === 'ios' ? 100 : 200;
	    }

	    function getDataUrl(chart, store) {
	      return '/rankings/' + chart + '-' + store + '.json';
	    }

	    function getCacheKey(chart, store) {
	      return 'gamerscrawl_rankings_' + chart + '_' + store + '_' + RANKINGS_CACHE_VERSION;
	    }

	    function escapeHtml(text) {
	      return String(text || '').replace(/[&<>"']/g, function(ch) {
	        switch (ch) {
	          case '&': return '&amp;';
	          case '<': return '&lt;';
	          case '>': return '&gt;';
	          case '"': return '&quot;';
	          case "'": return '&#39;';
	          default: return ch;
	        }
	      });
	    }

	    async function loadChartData(chart, store) {
	      const key = chart + ':' + store;
	      if (rankingsCache[key]) return rankingsCache[key];
	      if (rankingsPromise[key]) return rankingsPromise[key];

	      rankingsPromise[key] = (async function() {
	        const cacheKey = getCacheKey(chart, store);

	        try {
	          const cached = sessionStorage.getItem(cacheKey);
	          if (cached) {
	            rankingsCache[key] = JSON.parse(cached);
	            return rankingsCache[key];
	          }
	        } catch (e) {}

	        // 1) split 파일 시도 (payload 감소)
	        try {
	          const url = getDataUrl(chart, store);
	          const res = await fetch(url);
	          if (res.ok) {
	            const data = await res.json();
	            rankingsCache[key] = data || {};
	            try { sessionStorage.setItem(cacheKey, JSON.stringify(rankingsCache[key])); } catch (e) {}
	            return rankingsCache[key];
	          }
	        } catch (e) {}

	        // 2) 폴백: legacy /rankings/data.json
	        const res2 = await fetch(RANKINGS_ALL_DATA_URL);
	        if (!res2.ok) throw new Error('rankings data fetch failed');
	        const all = await res2.json();
	        const chartObj = (all && all[chart]) ? all[chart] : {};
	        const out = {};
	        for (let i = 0; i < COUNTRIES.length; i++) {
	          const code = COUNTRIES[i].code;
	          const per = chartObj && chartObj[code] ? chartObj[code] : null;
	          out[code] = (per && per[store]) ? per[store] : [];
	        }
	        rankingsCache[key] = out;
	        try { sessionStorage.setItem(cacheKey, JSON.stringify(rankingsCache[key])); } catch (e) {}
	        return rankingsCache[key];
	      })();

	      try {
	        rankingsCache[key] = await rankingsPromise[key];
	      } finally {
	        delete rankingsPromise[key];
	      }

	      return rankingsCache[key];
	    }

	    function isMobile() {
	      return window.innerWidth <= 768;
	    }

	    function getNetworkConnection() {
	      return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
	    }

	    function canPrefetchIcons() {
	      const connection = getNetworkConnection();
	      if (!connection) return true;
	      if (connection.saveData) return false;
	      const type = String(connection.effectiveType || '');
	      if (type === 'slow-2g' || type === '2g') return false;
	      return true;
	    }

	    function createIconPrefetcher() {
	      if (!canPrefetchIcons()) return { observe: function() {} };

	      const prefetched = new Set();
	      const observed = new WeakSet();
	      const queue = [];
	      let active = 0;

	      function maxConcurrent() {
	        return isMobile() ? 4 : 6;
	      }

	      function pump() {
	        while (active < maxConcurrent() && queue.length > 0) {
	          const src = queue.shift();
	          if (!src) continue;
	          active++;
	          const img = new Image();
	          img.decoding = 'async';
	          img.onload = img.onerror = function() {
	            active--;
	            pump();
	          };
	          img.src = src;
	        }
	      }

	      function enqueue(src) {
	        if (!src) return;
	        if (prefetched.has(src)) return;
	        prefetched.add(src);
	        queue.push(src);
	        pump();
	      }

	      const observer = ('IntersectionObserver' in window)
	        ? new IntersectionObserver(function(entries) {
	          for (let i = 0; i < entries.length; i++) {
	            const entry = entries[i];
	            if (!entry.isIntersecting) continue;
	            const img = entry.target;
	            observer.unobserve(img);
	            enqueue(img.getAttribute('src') || '');
	          }
	        }, { root: null, rootMargin: '2000px 0px', threshold: 0.01 })
	        : null;

	      function getVisibleIcons(grid) {
	        if (!grid) return [];
	        if (isMobile()) {
	          const expanded = grid.querySelector('.country-column.expanded');
	          if (expanded) return expanded.querySelectorAll('img.app-icon');
	          return grid.querySelectorAll('.country-column:not(.rank-column):not(.collapsed) img.app-icon');
	        }
	        return grid.querySelectorAll('img.app-icon');
	      }

	      function observe(grid) {
	        if (!observer) return;
	        const icons = getVisibleIcons(grid);
	        for (let i = 0; i < icons.length; i++) {
	          const img = icons[i];
	          if (!img) continue;
	          if (img.complete && img.naturalWidth > 0) continue;
	          const src = img.getAttribute('src') || '';
	          if (!src) continue;
	          if (prefetched.has(src)) continue;
	          if (observed.has(img)) continue;
	          observed.add(img);
	          observer.observe(img);
	        }
	      }

	      return { observe: observe, enqueue: enqueue };
	    }

	    const iconPrefetcher = createIconPrefetcher();

	    function generateRankRows(start, end) {
	      let rows = '';
	      for (let i = start; i < end; i++) {
	        const rank = i + 1;
	        rows += '<div class="rank-row rank-only"><span class="rank-num ' + (rank <= 3 ? 'top' + rank : '') + '">' + rank + '</span></div>';
	      }
	      return rows;
	    }

	    function generateRankColumn(count) {
	      const rows = generateRankRows(0, count);
	      return '<div class="country-column rank-column" data-country="rank"><div class="column-header"><span class="country-name">순위</span></div><div class="rank-list">' + rows + '</div></div>';
	    }

	    function buildRow(app) {
	      const title = escapeHtml(app && app.title ? app.title : '');
	      const developer = escapeHtml(app && app.developer ? app.developer : '');
	      const icon = escapeHtml(app && app.icon ? app.icon : '');
	      const rowContent =
	        '<img class="app-icon" src="' + icon + '" alt="" loading="lazy" decoding="async" data-img-fallback="hide-visibility">' +
	        '<div class="app-info"><div class="app-name">' + title + '</div><div class="app-dev">' + developer + '</div></div>';

	      if (app && app.slug) {
	        return '<a class="rank-row rank-row-link" href="/games/' + app.slug + '/">' + rowContent + '</a>';
	      }
	      return '<div class="rank-row">' + rowContent + '</div>';
	    }

	    function buildColumnsGridHtml(chartData, store, limit) {
	      const maxItems = getMaxItems(store);
	      const count = Math.min(limit || maxItems, maxItems);
	      const rankCol = generateRankColumn(count);
	      const countryCols = COUNTRIES.map(function(c) {
	        const items = (chartData && chartData[c.code]) ? chartData[c.code] : [];

	        let rows = '';
	        if (store === 'android' && c.code === 'cn') {
	          rows = '';
	        } else if (items.length > 0) {
	          rows = items.slice(0, count).map(buildRow).join('');
	        } else {
	          rows = '<div class="no-data">데이터 없음</div>';
	        }

	        return '<div class="country-column" data-country="' + c.code + '"><div class="column-header"><span class="flag">' + c.flag + '</span><span class="country-name">' + c.name + '</span></div><div class="rank-list">' + rows + '</div></div>';
	      }).join('');

	      return rankCol + countryCols;
	    }

	    function appendRows(grid, chartData, store, start, end) {
	      if (!grid || !chartData) return;

	      const rankList = grid.querySelector('.rank-column .rank-list');
	      if (rankList) {
	        rankList.insertAdjacentHTML('beforeend', generateRankRows(start, end));
	      }

	      for (let i = 0; i < COUNTRIES.length; i++) {
	        const code = COUNTRIES[i].code;
	        if (store === 'android' && code === 'cn') continue;

	        const items = chartData && chartData[code] ? chartData[code] : [];
	        if (!items || items.length === 0) continue;

	        const listEl = grid.querySelector('.country-column[data-country=\"' + code + '\"] .rank-list');
	        if (!listEl) continue;

	        const rowsHtml = items.slice(start, end).map(buildRow).join('');
	        if (rowsHtml) listEl.insertAdjacentHTML('beforeend', rowsHtml);
	      }

	      iconPrefetcher.observe(grid);
	    }

	    function scheduleFill(grid, chartData, store, chart) {
	      if (!grid || !grid.isConnected) return;

	      const maxItems = getMaxItems(store);
	      const loaded0 = parseInt(grid.dataset.loadedCount || '0', 10) || 0;
	      if (loaded0 >= maxItems) {
	        grid.dataset.rendered = '1';
	        grid.dataset.fillInProgress = '0';
	        return;
	      }

	      const fillKey = chart + ':' + store;
	      if (grid.dataset.fillInProgress === '1' && grid.dataset.fillKey === fillKey) return;
	      grid.dataset.fillInProgress = '1';
	      grid.dataset.fillKey = fillKey;
	      const jobId = String(Date.now());
	      grid.dataset.fillJobId = jobId;

	      let loaded = loaded0;
	      const chunkSize = 20;

	      function step(deadline) {
	        if (!grid.isConnected) return;
	        if (grid.dataset.fillJobId !== jobId) return;

	        let remaining = deadline && typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() : 0;
	        do {
	          const next = Math.min(maxItems, loaded + chunkSize);
	          appendRows(grid, chartData, store, loaded, next);
	          loaded = next;
	          grid.dataset.loadedCount = String(loaded);
	          remaining = deadline && typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() : 0;
	        } while (loaded < maxItems && remaining > 6);

	        if (loaded < maxItems) {
	          if ('requestIdleCallback' in window) {
	            requestIdleCallback(step, { timeout: 1000 });
	          } else {
	            setTimeout(function() { step({ timeRemaining: function() { return 0; } }); }, 16);
	          }
	          return;
	        }

	        grid.dataset.rendered = '1';
	        grid.dataset.fillInProgress = '0';
	      }

	      if ('requestIdleCallback' in window) {
	        requestIdleCallback(step, { timeout: 1000 });
	      } else {
	        setTimeout(function() { step({ timeRemaining: function() { return 0; } }); }, 0);
	      }
	    }

	    function initMobileColumns(grid) {
	      if (!grid || grid.dataset.mobileInit === '1') return;
	      grid.dataset.mobileInit = '1';

	      const columns = grid.querySelectorAll('.country-column:not(.rank-column)');
	      if (!columns || columns.length === 0) return;

	      function apply() {
	        if (isMobile()) {
	          columns.forEach((col, i) => {
	            col.classList.toggle('expanded', i === 0);
	            col.classList.toggle('collapsed', i !== 0);
	          });
	        } else {
	          columns.forEach(col => col.classList.remove('expanded', 'collapsed'));
	        }

	        iconPrefetcher.observe(grid);
	      }

	      columns.forEach(col => {
	        col.addEventListener('click', () => {
	          if (!isMobile()) return;
	          columns.forEach(c => {
	            c.classList.toggle('expanded', c === col);
	            c.classList.toggle('collapsed', c !== col);
	          });

	          iconPrefetcher.observe(grid);
	        });
	      });

	      window.addEventListener('resize', apply);
	      apply();
	    }

	    async function ensureSectionRendered(store, chart) {
	      const section = document.getElementById(store + '-' + chart);
	      if (!section) return;

	      const grid = section.querySelector('.columns-grid');
	      if (!grid) return;

	      initMobileColumns(grid);
	      iconPrefetcher.observe(grid);

	      if (grid.dataset.rendered === '1') return;

	      try {
	        const chartData = await loadChartData(chart, store);
	        const maxItems = getMaxItems(store);

	        // SSR로 일부만 렌더된 경우(초기 로드) → 나머지 채우기
	        if (grid.dataset.rendered === 'partial') {
	          const loaded0 = parseInt(grid.dataset.loadedCount || '0', 10) || 0;
	          scheduleFill(grid, chartData, store, chart);
	          if (loaded0 >= maxItems) grid.dataset.rendered = '1';
	          return;
	        }

	        // 아직 렌더되지 않은 섹션 → 일부만 먼저 렌더 후, 나머지는 idle로 채움
	        const initialCount = Math.min(INITIAL_COUNT, maxItems);
	        grid.innerHTML = buildColumnsGridHtml(chartData, store, initialCount);
	        grid.dataset.rendered = 'partial';
	        grid.dataset.loadedCount = String(initialCount);
	        delete grid.dataset.mobileInit;
	        initMobileColumns(grid);
	        iconPrefetcher.observe(grid);
	        scheduleFill(grid, chartData, store, chart);
	      } catch (e) {
	        grid.innerHTML = '<div class="no-data">데이터 로드 실패</div>';
	      }
	    }

	    // 현재 선택된 스토어/차트 상태
	    let currentStore = 'ios';
	    let currentChart = 'grossing';

	    function updateChartSection() {
	      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
	      document.getElementById(currentStore + '-' + currentChart)?.classList.add('active');
	      ensureSectionRendered(currentStore, currentChart);
	    }

	    // 스토어 탭 전환
	    document.querySelectorAll('#storeTab .tab-btn').forEach(btn => {
	      btn.addEventListener('click', () => {
	        document.querySelectorAll('#storeTab .tab-btn').forEach(b => b.classList.remove('active'));
	        btn.classList.add('active');
	        currentStore = btn.dataset.store;
	        updateChartSection();
	      });
	    });

	    // 차트 탭 전환
	    document.querySelectorAll('#chartTab .tab-btn').forEach(btn => {
	      btn.addEventListener('click', () => {
	        document.querySelectorAll('#chartTab .tab-btn').forEach(b => b.classList.remove('active'));
	        btn.classList.add('active');
	        currentChart = btn.dataset.chart;
	        updateChartSection();
	      });
	    });

	    // 초기화
	    updateChartSection();
	  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'rankings',
    title: '모바일 게임 순위 - 앱스토어, 플레이스토어 매출 순위',
    description: '한국, 일본, 미국, 중국, 대만 앱스토어·플레이스토어 게임 매출 순위 TOP 200. 실시간 모바일 게임 인기 차트를 국가별로 비교하세요.',
    keywords: '모바일 게임 순위, 앱스토어 순위, 플레이스토어 순위, 앱스토어 매출 순위, 플레이스토어 매출 순위, 게임 순위, 모바일 게임 매출',
    canonical: 'https://gamerscrawl.com/rankings/',
    pageScripts
  });
}

module.exports = { generateRankingsPage };
