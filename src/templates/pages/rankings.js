/**
 * 모바일 순위 페이지 템플릿
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');
const { countries } = require('../../crawlers/rankings');

function generateRankingsPage(data) {
  const { rankings } = data;

  // 순위 컬럼 생성
  function generateRankColumn(maxItems = 200) {
    const rows = Array.from({length: maxItems}, (_, i) =>
      `<div class="rank-row rank-only"><span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span></div>`
    ).join('');
    return `<div class="country-column rank-column"><div class="column-header"><span class="country-name">순위</span></div><div class="rank-list">${rows}</div></div>`;
  }

  // iOS 국가별 컬럼 생성 (100위까지)
  function generateCountryColumns(chartData) {
    const rankCol = generateRankColumn(100);
    const countryCols = countries.map(c => {
      const items = chartData[c.code]?.ios || [];
      const rows = items.length > 0 ? items.map((app, i) =>
        `<div class="rank-row"><img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"><div class="app-info"><div class="app-name">${app.title}</div><div class="app-dev">${app.developer}</div></div></div>`
      ).join('') : '<div class="no-data">데이터 없음</div>';
      return `<div class="country-column"><div class="column-header"><span class="flag">${c.flag}</span><span class="country-name">${c.name}</span></div><div class="rank-list">${rows}</div></div>`;
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
        rows = items.map((app, i) =>
          `<div class="rank-row"><img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"><div class="app-info"><div class="app-name">${app.title}</div><div class="app-dev">${app.developer}</div></div></div>`
        ).join('');
      } else {
        rows = '<div class="no-data">데이터 없음</div>';
      }
      return `<div class="country-column"><div class="column-header"><span class="flag">${c.flag}</span><span class="country-name">${c.name}</span></div><div class="rank-list">${rows}</div></div>`;
    }).join('');
    return rankCol + countryCols;
  }

  const content = `
    <section class="section active" id="rankings">
      ${SHOW_ADS ? `<div class="ad-slot ad-slot-section pc-only">
        <ins class="adsbygoogle" style="display:inline-block;width:728px;height:90px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${AD_SLOTS.horizontal4}"></ins>
      </div>
      <div class="ad-slot ad-slot-section mobile-only">
        <ins class="adsbygoogle" style="display:inline-block;width:320px;height:100px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${AD_SLOTS.horizontal5}"></ins>
      </div>` : ''}
      <div class="rankings-controls">
        <div class="control-group">
          <div class="tab-group" id="storeTab">
            <button class="tab-btn ios-btn active" data-store="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="" class="news-favicon">App Store</button>
            <button class="tab-btn android-btn" data-store="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="" class="news-favicon">Google Play</button>
          </div>
        </div>
        <div class="control-group">
          <div class="tab-group" id="chartTab">
            <button class="tab-btn grossing-btn active" data-chart="grossing">매출 순위</button>
            <button class="tab-btn free-btn" data-chart="free">인기 순위</button>
          </div>
        </div>
      </div>

      <div class="rankings-card">
        <div class="chart-section active" id="ios-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="ios-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.free)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.free)}</div>
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

    // 현재 선택된 스토어/차트 상태
    let currentStore = 'ios';
    let currentChart = 'grossing';

    function updateChartSection() {
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById(currentStore + '-' + currentChart)?.classList.add('active');
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
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'rankings',
    title: '게이머스크롤 | 모바일 게임 순위',
    description: '한국, 일본, 미국, 중국, 대만 앱스토어·플레이스토어 게임 매출 순위 TOP 200. 실시간 모바일 게임 인기 차트를 국가별로 비교하세요.',
    canonical: 'https://gamerscrawl.com/rankings/',
    pageScripts
  });
}

module.exports = { generateRankingsPage };
