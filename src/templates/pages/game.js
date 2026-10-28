/**
 * 게임 상세 페이지 템플릿 (/games/<slug>/ 와 에디션 접두사 아래의 같은 경로)
 *
 * 요청 시 Cloudflare Pages Functions 에서 렌더링한다 (functions/_lib/game-route.js). fs/path 를 쓰지 않는 순수 함수라
 * Node 와 Workers 런타임에서 똑같이 동작한다. 입력은 docs/games-data/<slug>.json 한 개와 공용 _meta.json 이다.
 */

const { t, currentEdition, formatNumber, href, formatDay, formatMonthDay } = require('../../i18n');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { renderDesktopOnlyHomeAd } = require('../components/ads');
const { resizeIcon } = require('../../utils/resize-icon');
const { interactiveRankChart } = require('../components/interactive-rank-chart');
const { describeGame, trimDescription, dominantScript } = require('../helpers/game-description');
const { renderGameRankSummary, summaryDays, INDEXABLE_DAYS } = require('../helpers/game-rank-summary');
const { renderRevenueSection } = require('../components/revenue-section');

const siteBaseUrl = 'https://gamerscroll.com';
const REVENUE_SLOT = '<rv-slot></rv-slot>';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 인라인 <script> 안에 안전하게 넣는 JSON
const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');

// 분석 카드 아래: 가로 배너 1개 + 관련 게임 카드 (순위가 비슷한 게임 · 같은 개발사의 다른 게임).
// 배너: PC 는 상단 광고와 같은 970×250 빌보드 고정 요청(250px 예약, ads.js renderDesktopOnlyHomeAd), 모바일은 300×250 단위 —
// 화면 폭에 맞는 하나만 요청된다(layout.js visibleAds). 화면 가까이 오면 요청하고(layout.js btfObserver), unfilled 이고 화면 아래에 있으면 자리를 접는다(layout.js collapseUnfilledInPageAd).
// 관련 게임 데이터(related)는 scripts/generate-game-pages.js 가 에디션별로 만든다. 링크는 localizeHtml 이 같은 에디션 경로로 바꾼다.
// 본문 중간 광고 1개 (관련 게임 위, 지표 분석 탭의 패널 아래). extraClass: 지표 분석은 ga-ad.
function renderInPageAd(extraClass = '') {
  const pcAd = renderDesktopOnlyHomeAd(AD_SLOTS.ResponsivePC001);
  const mobileAd = generateHomeAdPairSlot(null, AD_SLOTS.Mobile001, { mobileOnly: true });
  return pcAd || mobileAd ? `<div class="gs-ad-inpage grid-full${extraClass ? ` ${extraClass}` : ''}">${pcAd}${mobileAd}</div>` : '';
}

function renderRelated(related, code, developer) {
  const ad = renderInPageAd();
  const mine = related && related.e && related.e[code];
  if (!mine) return ad;
  const row = ([index, store, rank]) => {
    const o = related.g[index];
    const rankText = rank ? `${t(store === 'ios' ? 'stats.app_store' : 'stats.google_play')} ${t('rank.rank_number', { p0: rank })}` : '';
    return `<li><a class="rk-rel-item" href="/games/${encodeURIComponent(o.s)}/"><span class="rk-rel-ic">${o.i ? `<img src="${esc(resizeIcon(o.i))}" alt="" loading="lazy" decoding="async" data-img-fallback="hide">` : ''}</span><span class="rk-rel-tx"><span class="t" data-name>${esc((o.n && o.n[code]) || o.k)}</span>${o.d ? `<span class="d" data-name>${esc(o.d)}</span>` : ''}</span>${rankText ? `<span class="rk-rel-rank">${rankText}</span>` : ''}</a></li>`;
  };
  const near = mine.n && mine.n.length
    ? `<div class="rk-card rk-rel-near"><h2>${t(mine.k === 'genre' ? 'game.related_genre_title' : 'game.related_rank_title')}</h2><ul class="rk-rel-list rk-rel-cols" style="--rk-rel-rows:${Math.ceil(mine.n.length / 2)}">${mine.n.map(row).join('')}</ul></div>`
    : '';
  const dev = mine.d && mine.d.length && developer
    ? `<div class="rk-card rk-rel-dev"><h2>${t('game.related_dev_title', { dev: `<span data-name>${esc(developer)}</span>` })}</h2><ul class="rk-rel-list">${mine.d.map(row).join('')}</ul></div>`
    : '';
  return ad + (near || dev ? `<div class="rk rk-related grid-full${near && dev ? '' : ' rk-related-single'}">${near}${dev}</div>` : '');
}

/**
 * @param {object} game  games-data 한 건: { name, names, slug, platforms, developer, icon, ranked, steam, steamHistory, rank, revenue? }
 * @param {object} meta  { days, hourlyDate }
 */
function generateGamePage(game, meta = { days: [], hourlyDate: '' }, preview = {}) {
  const { slug = '', platforms = [], developer = '', icon = null, ranked = false, steamHistory = [], steam = null, rank = null } = game;
  const edition = currentEdition();
  const plainName = (game.names && game.names[edition.code]) || game.name;
  // Localized name (only when the data has one) shown together with the original name.
  const lowerLocal = plainName.toLowerCase(), lowerOrig = String(game.name).toLowerCase();
  const titleName = !lowerLocal.includes(lowerOrig) && !lowerOrig.includes(lowerLocal) && dominantScript(plainName) !== dominantScript(String(game.name)) ? `${plainName} (${game.name})` : plainName;
  const name = esc(titleName);

  // 플랫폼 체크
  const hasMobilePlatform = platforms.some(p => p === 'ios' || p === 'android');
  const hasPcPlatform = platforms.includes('pc') || platforms.includes('steam');
  // 스팀 데이터 표시: PC 플랫폼이 있거나, 모바일 플랫폼이 없으면서 스팀 데이터가 있는 경우
  const hasSteamData = (hasPcPlatform || !hasMobilePlatform) && steam && (steam.currentPlayers || steam.rank || steam.salesRank);
  const isSteamOnly = !ranked && hasSteamData;
  // 모바일 순위 섹션 표시 여부 (모바일 플랫폼이 있거나 모바일 순위 데이터가 있을 때)
  const showMobileRanking = hasMobilePlatform || ranked;

  const summary = renderGameRankSummary(rank, meta, plainName, edition.country);
  // Metrics renderers live outside this repository and are supplied only by the local preview server, never by the public Worker.
  const previewEnabled = preview.localPreview === true && Boolean(game.revenue) && Boolean(preview.generateAnalysisTabs);
  const analysisPage = previewEnabled && preview.active === 'analysis';
  if (preview.active === 'analysis' && !analysisPage) return null;
  const revenueSection = previewEnabled ? '' : renderRevenueSection(game.revenue, { slug });
  const overview = describeGame(game, meta, edition.country);
  const overviewHtml = overview.length
    ? `<div class="home-card grid-full game-overview">
          <div class="home-card-header"><h2 class="home-card-title">${t('game.desc_title')}</h2></div>
          <div class="home-card-body"><p>${esc(overview.join(t('game.desc_join')))}</p></div>
        </div>`
    : '';

  // 플랫폼 배지
  const platformBadges = platforms.map(p => {
    const labels = { ios: 'iOS', android: 'Android', pc: 'PC', ps5: 'PlayStation', xbox: 'Xbox', switch: 'Switch' };
    return `<span class="game-platform-badge">${labels[p] || p}</span>`;
  }).join('');

  // 게임 아이콘
  const iconHtml = icon
    ? `<img class="game-hero-icon" src="${esc(resizeIcon(icon))}" alt="${name}" loading="lazy" data-img-fallback="hide">`
    : '';

  // 스팀 차트 섹션 생성 (type: 'ccu' 또는 'sales')
  function generateSteamChartSection(type) {
    if (!steamHistory || steamHistory.length === 0) {
      return `<div class="game-empty">${t('game.no_data')}</div>`;
    }

    const width = 400;
    const height = 200;
    const padding = { top: 18, right: 12, bottom: 28, left: 36 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const rankKey = type === 'ccu' ? 'ccuRank' : 'salesRank';
    const color = type === 'ccu' ? '#FF4757' : '#3B82F6';
    const sectionId = 'steam-' + type + '-section';
    const seriesName = type === 'ccu' ? t('game.stat_ccu_rank') : t('game.stat_sales_rank');

    // 일간 데이터
    function generateDailyData() {
      const sorted = [...steamHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];
      const byDate = new Map();
      for (const item of sorted) {
        if (!byDate.has(item.date)) byDate.set(item.date, []);
        byDate.get(item.date).push(item);
      }
      const result = [];
      for (const [date, items] of byDate) {
        const ranks = items.map(d => d[rankKey]).filter(v => v);
        if (ranks.length > 0) result.push({ date, rank: Math.min(...ranks) });
      }
      return result.slice(-7);
    }

    // 주간 데이터
    function generateWeeklyData() {
      const sorted = [...steamHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];
      const result = [];
      const latest = new Date(sorted[sorted.length - 1].date + 'T12:00:00');
      for (let w = 6; w >= 0; w--) {
        const weekEnd = new Date(latest);
        weekEnd.setDate(weekEnd.getDate() - (w * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        const weekData = sorted.filter(d => d.date >= weekStart.toISOString().slice(0,10) && d.date <= weekEnd.toISOString().slice(0,10));
        if (weekData.length === 0) continue;
        const ranks = weekData.map(d => d[rankKey]).filter(v => v);
        if (ranks.length > 0) result.push({ date: weekEnd.toISOString().slice(0,10), rank: Math.min(...ranks) });
      }
      return result;
    }

    // 월간 데이터
    function generateMonthlyData() {
      const sorted = [...steamHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];
      const result = [];
      const latest = new Date(sorted[sorted.length - 1].date + 'T12:00:00');
      for (let m = 6; m >= 0; m--) {
        const targetDate = new Date(latest);
        targetDate.setMonth(targetDate.getMonth() - m);
        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().slice(0,10);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().slice(0,10);
        const monthData = sorted.filter(d => d.date >= monthStart && d.date <= monthEnd);
        if (monthData.length === 0) continue;
        const ranks = monthData.map(d => d[rankKey]).filter(v => v);
        if (ranks.length > 0) result.push({ date: monthEnd, rank: Math.min(...ranks) });
      }
      return result;
    }

    const periods = [
      { id: 'daily', label: t('game.period_day'), data: generateDailyData() },
      { id: 'weekly', label: t('game.period_week'), data: generateWeeklyData() },
      { id: 'monthly', label: t('game.period_month'), data: generateMonthlyData() }
    ];

    // 차트 생성 함수
    function createChart(data) {
      if (data.length === 0) return `<div class="game-empty">${t('game.no_data_short')}</div>`;
      let minRank = Infinity, maxRank = 0;
      data.forEach(d => {
        if (d.rank < minRank) minRank = d.rank;
        if (d.rank > maxRank) maxRank = d.rank;
      });
      if (minRank === Infinity) return `<div class="game-empty">${t('game.no_data_short')}</div>`;

      const rangePadding = Math.max(5, Math.ceil((maxRank - minRank) * 0.15));
      const yMin = Math.max(1, minRank - rangePadding);
      const yMax = maxRank + rangePadding;
      const yRange = yMax - yMin || 1;

      const xLabelPadding = 16; // X축 라벨 영역 안쪽 여백
      const xLabelWidth = chartWidth - xLabelPadding * 2;
      const points = data.map((d, i) => ({
        x: padding.left + xLabelPadding + (i / Math.max(1, data.length - 1)) * xLabelWidth,
        y: padding.top + ((d.rank - yMin) / yRange) * chartHeight,
        rank: d.rank,
        date: d.date
      }));

      let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" class="game-chart-svg">';
      // 그리드
      const gridCount = 4;
      const gridStep = yRange / gridCount;
      for (let i = 0; i <= gridCount; i++) {
        const val = Math.round(yMin + i * gridStep);
        const y = padding.top + ((val - yMin) / yRange) * chartHeight;
        svg += '<line class="chart-grid" x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke-dasharray="2,2"/>';
        svg += '<text class="chart-ylabel" x="' + (padding.left - 6) + '" y="' + (y + 4) + '" font-size="10" text-anchor="end">' + val + '</text>';
      }
      // X축 라벨
      data.forEach((d, i) => {
        const x = padding.left + xLabelPadding + (i / Math.max(1, data.length - 1)) * xLabelWidth;
        svg += '<text class="chart-xlabel" x="' + x + '" y="' + (height - 6) + '" text-anchor="middle">' + formatMonthDay(d.date) + '</text>';
      });
      // 라인
      if (points.length > 1) {
        const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
        svg += '<path data-rank-series="0" d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="2"/>';
      }
      // 점 먼저 그리기
      points.forEach(p => {
        svg += '<circle data-rank-series="0" cx="' + p.x + '" cy="' + p.y + '" r="4" fill="' + color + '"/>';
      });
      // 라벨은 나중에 그려서 항상 앞에 표시
      points.forEach(p => {
        const labelY = p.y < 20 ? p.y + 16 : p.y - 8;
        svg += '<text data-rank-series="0" x="' + p.x + '" y="' + labelY + '" fill="' + color + '" font-size="12" text-anchor="middle" font-weight="600">' + p.rank + '</text>';
      });
      svg += '</svg>';
      return interactiveRankChart(svg, data.map(p => p.date), [{ name: seriesName, color, values: data.map(p => p.rank) }], points.map(p => p.x), data.map(p => formatDay(p.date)));
    }

    // 기간별 컨텐츠 생성
    let chartContents = '';
    periods.forEach((period, i) => {
      chartContents += '<div class="trend-content' + (i === 0 ? ' active' : '') + '" data-period="' + period.id + '">' + createChart(period.data) + '</div>';
    });

    return '<div class="rank-trend-section ' + sectionId + '">' +
      '<div class="trend-tab-row"><div class="tab-group trend-tabs-right">' +
      periods.map((p, i) => '<button class="tab-btn' + (i === 0 ? ' active' : '') + '" data-trend-period="' + p.id + '">' + p.label + '</button>').join('') +
      '</div></div><div class="trend-charts">' + chartContents + '</div><p class="game-chart-note">' + t('game.chart_note') + '</p></div>' +
      '<script>(function(){var s=document.querySelector(".' + sectionId + '");if(!s)return;var ap="daily";' +
      's.querySelectorAll("[data-trend-period]").forEach(function(b){b.addEventListener("click",function(){' +
      's.querySelectorAll("[data-trend-period]").forEach(function(x){x.classList.remove("active")});' +
      'b.classList.add("active");ap=b.dataset.trendPeriod;' +
      's.querySelectorAll(".trend-content").forEach(function(c){c.classList.toggle("active",c.dataset.period===ap)});' +
      '});});})();</script>';
  }

  const players = steam && steam.currentPlayers ? formatNumber(steam.currentPlayers) : '-';

  let content = `
    <section class="section active" id="game">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container game-page-grid">
        <!-- 게임 히어로 -->
        <div class="home-card game-hero grid-full">
          <div class="game-crumb"><a href="/games/">${t('game.games_db')}</a><span>›</span><span data-name>${esc(plainName)}</span></div>
          <div class="game-hero-content">
            ${iconHtml}
            <div class="game-hero-info">
              <h1 class="game-hero-title" data-name>${name}</h1>
              ${developer ? `<div class="game-hero-developer" data-name>${esc(developer)}</div>` : ''}
              ${platforms.length > 0 ? `<div class="game-hero-platforms">${platformBadges}</div>` : ''}
            </div>
            ${summary && summary.hero ? summary.hero : ''}
          </div>
        </div>
        ${previewEnabled ? preview.generateAnalysisTabs(game, { lang: edition.code, active: analysisPage ? 'analysis' : 'rank' }) : ''}
        <!-- rank-content-start -->
        ${overviewHtml}
            ${isSteamOnly && steam ? `
        <div class="home-card grid-full game-steam-summary">
          <div class="home-card-header"><h2 class="home-card-title">${t('game.steam_analysis')}</h2></div>
            <div class="game-hero-stats">
              <div class="game-hero-stat stat-ccu">
                <span class="game-hero-stat-label">${t('game.stat_ccu_rank')}</span>
                <span class="game-hero-stat-value">${steam.rank || '-'}</span>
              </div>
              <div class="game-hero-stat stat-sales">
                <span class="game-hero-stat-label">${t('game.stat_sales_rank')}</span>
                <span class="game-hero-stat-value">${steam.salesRank || '-'}</span>
              </div>
              <div class="game-hero-stat stat-players">
                <span class="game-hero-stat-label">${t('game.stat_current_players')}</span>
                <span class="game-hero-stat-value">${players}</span>
              </div>
            </div>
        </div>
            ` : ''}

        ${isSteamOnly ? `
        <!-- 스팀 게임 순위 -->
        <div class="home-card game-steam-chart">
          <div class="home-card-header">
            <h2 class="home-card-title">${t('game.stat_ccu_rank')}</h2>
          </div>
          <div class="home-card-body">${generateSteamChartSection('ccu')}</div>
        </div>
        <!-- 스팀 게임 순위 히스토리 -->
        <div class="home-card game-steam-chart">
          <div class="home-card-header">
            <h2 class="home-card-title">${t('game.stat_sales_rank')}</h2>
          </div>
          <div class="home-card-body">${generateSteamChartSection('sales')}</div>
        </div>
        ` : showMobileRanking ? `
        <!-- 이력이 부족해도 동일한 상세 레이아웃을 유지한다. -->
        <div class="home-card grid-full">
          <div class="home-card-header">
            <h2 class="home-card-title">${t('game.revenue_analysis')}</h2>
          </div>
          <div class="home-card-body">${summary ? summary.html : `<div class="game-empty">${t('game.no_analysis_records')}</div>`}</div>
        </div>
        ` : ''}
        ${renderRelated(game.related, edition.code, developer)}${revenueSection ? REVENUE_SLOT : ''}

      </div>
    </section>
  `;

  if (analysisPage) {
    content = content.slice(0, content.indexOf('<!-- rank-content-start -->')) +
      preview.generateAnalysisContent(game, { lang: edition.code, genreName: require('../components/revenue-charts').subgenreName, ad: () => renderInPageAd('ga-ad'),
        lock: preview.lock || null }) + '</div></section>';
    content = content.replace(`<span data-name>${esc(plainName)}</span></div>`,
      `<a href="${href(`/games/${encodeURIComponent(slug)}/`)}" data-name>${esc(plainName)}</a><span>›</span><span>${esc(preview.analysisText(edition.code).tabAnalysis)}</span></div>`);
  }

  // 최근 본 게임 저장
  const pageScripts = `<script>
    (function() {
      const RECENT_KEY = 'gamerscroll_recent_searches';
      const MAX_RECENT = 8;
      const gameInfo = ${jsonForScript({ name: plainName, slug, icon: icon || '' })};
      try {
        let recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
        recent = recent.filter(g => g.slug !== gameInfo.slug);
        recent.unshift(gameInfo);
        recent = recent.slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      } catch (e) {}
    })();
  </script>`;

  // 순위 이력이 30일 미만이면 noindex (thin content 방지). 30일 이상이면 순위 요약만으로도 고유 콘텐츠가 충분하다.
  const indexable = Boolean(summary && summary.days >= INDEXABLE_DAYS);

  // 2026-09-09 title 정책: 순위 데이터 사이트 어휘로 통일('뉴스' 제거), 상세 페이지는 날짜 없이 60자 안팎
  const seoTitle = t(hasMobilePlatform ? 'game.seo_title_mobile' : 'game.seo_title_steam', { name: titleName });
  // The data-derived overview replaces the formulaic rank-summary / generic description.
  const seoDescription = overview.length
    ? trimDescription(overview, t('game.desc_join'))
    : summary && summary.text
    ? summary.text
    : t(hasMobilePlatform ? 'game.seo_desc_mobile' : 'game.seo_desc_steam', { name: plainName });
  const seoKeywords = t(hasMobilePlatform ? 'game.seo_keywords_mobile' : 'game.seo_keywords_steam', { name: plainName });

  const canonicalUrl = `${siteBaseUrl}${href(analysisPage ? `/analysis/${encodeURIComponent(slug)}/` : `/games/${encodeURIComponent(slug)}/`)}`;

  // 플랫폼에 따른 운영체제 목록 생성
  const osMap = { ios: 'iOS', android: 'Android', pc: 'Windows', steam: 'Windows', ps5: 'PlayStation 5', xbox: 'Xbox', switch: 'Nintendo Switch' };
  const operatingSystems = [...new Set(platforms.map(p => osMap[p]).filter(Boolean))];
  const operatingSystem = operatingSystems.length > 0 ? operatingSystems.join(', ') : null;

  const html = wrapWithLayout(content, {
    currentPage: 'game',
    title: seoTitle,
    description: seoDescription,
    keywords: seoKeywords,
    canonical: canonicalUrl,
    pageScripts,
    noindex: previewEnabled || !indexable,
    breadcrumbs: [
      { name: t('game.home'), url: `${siteBaseUrl}${href('/')}` },
      { name: t('game.games_db'), url: `${siteBaseUrl}${href('/games/')}` },
      { name: plainName, url: canonicalUrl }
    ],
    softwareSchema: indexable ? { name: plainName, description: seoDescription, image: icon || null, operatingSystem } : null  // noindex 페이지는 스키마 생략
  });
  // The revenue section (no links, images or names to post-process; its charts and tables render in the browser) joins
  // after the layout's whole-page passes, which would otherwise rescan it within the Workers CPU budget.
  return revenueSection ? html.replace(REVENUE_SLOT, () => revenueSection) : html;
}

module.exports = { generateGamePage, summaryDays, renderInPageAd };
