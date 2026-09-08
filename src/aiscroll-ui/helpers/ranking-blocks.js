'use strict';

/**
 * Shared renderer for ranking-style content blocks.
 *
 * Used by trend.js (ranking page detail), ai-blog/article.js, tech-article.js,
 * and wiki-article.js so that the same content block types render identically
 * regardless of which article template is rendering them.
 *
 * Block types covered: note, chart, chart-group, ranking-bar, ranking-card,
 * ranking-compare.
 *
 * Caller supplies a `ctx` object: { gamesMap, snapshotsDir, escapeHtmlAttr }.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SNAPSHOTS_DIR = path.join(__dirname, '..', '..', '..', 'snapshots', 'rankings');
const DEFAULT_HISTORY_DIR = path.join(__dirname, '..', '..', '..', 'history');

// history/{date}.json 슬림 캐시 — CSV 스냅샷이 없는 날짜의 순위 폴백용.
// (snapshots/는 2026-05-20부터 gitignore라 CI 크롤 CSV가 커밋되지 않음 → 커밋되는 history/로 보충)
const historyDayCache = new Map();

function loadHistoryDaySlim(date, historyDir) {
  const cacheKey = `${historyDir}|${date}`;
  if (historyDayCache.has(cacheKey)) return historyDayCache.get(cacheKey);
  let slim = null;
  const file = path.join(historyDir, `${date}.json`);
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      slim = { bestRanks: raw.bestRanks || null, lists: {} };
      const rankings = raw.rankings || {};
      for (const [cat, regionsObj] of Object.entries(rankings)) {
        if (!regionsObj || typeof regionsObj !== 'object') continue;
        for (const [region, platObj] of Object.entries(regionsObj)) {
          if (!platObj || typeof platObj !== 'object') continue;
          for (const [plat, list] of Object.entries(platObj)) {
            if (!Array.isArray(list)) continue;
            slim.lists[`${plat}_${region}_${cat}`] = list.map(app => ({
              id: String(app.appId || app.id || ''),
              title: String(app.title || '').toLowerCase().trim()
            }));
          }
        }
      }
    } catch (e) {
      slim = null; // 파싱 실패 시 폴백 없음 (CSV 경로 동작 유지)
    }
  }
  historyDayCache.set(cacheKey, slim);
  return slim;
}

function lookupHistoryRank(date, platform, region, category, regionAppId, allNames, ctx) {
  const historyDir = (ctx && ctx.historyDir) || DEFAULT_HISTORY_DIR;
  const day = loadHistoryDaySlim(date, historyDir);
  if (!day) return null;
  const key = `${platform}_${region}_${category}`;
  if (regionAppId && day.bestRanks && day.bestRanks[key]) {
    const r = day.bestRanks[key][String(regionAppId)];
    if (typeof r === 'number' && r > 0) return r;
  }
  const list = day.lists[key];
  if (!list) return null;
  if (regionAppId) {
    const idx = list.findIndex(app => app.id === String(regionAppId));
    if (idx >= 0) return idx + 1;
  }
  const idxByName = list.findIndex(app => allNames.includes(app.title));
  return idxByName >= 0 ? idxByName + 1 : null;
}

function loadGameRankHistory(gameSlug, startDate, endDate, category, market, ctx) {
  const gamesMap = ctx.gamesMap || {};
  const snapshotsDir = ctx.snapshotsDir || DEFAULT_SNAPSHOTS_DIR;
  if (!fs.existsSync(snapshotsDir)) return [];

  let gameInfo = null;
  let gameName = null;
  for (const [name, info] of Object.entries(gamesMap)) {
    if (info.slug === gameSlug) {
      gameInfo = info;
      gameName = name;
      break;
    }
  }
  if (!gameInfo) return [];

  const allNames = [gameName, ...(gameInfo.aliases || [])].map(n => n.toLowerCase().trim());
  const appIds = gameInfo.appIds || {};
  const platform = market === 'ios' ? 'ios' : 'aos';

  const dates = [];
  const s = new Date(startDate);
  const e = new Date(endDate);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const result = [];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];

  for (const date of dates) {
    const dayData = { date };

    for (const region of regions) {
      if (platform === 'aos' && region === 'cn') continue;

      let bestRank = null;
      const regionAppId = appIds[market] || appIds[`${market}:${region}`];
      const csvFile = path.join(snapshotsDir, `${date}_${platform}_${region}_${category}.csv`);
      if (fs.existsSync(csvFile)) try {
        const content = fs.readFileSync(csvFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('time,'));

        for (const line of lines) {
          const match = line.match(/^[^,]+,(\d+),([^,]+),/);
          if (!match) continue;

          const rank = parseInt(match[1], 10);
          const appId = match[2].replace(/"/g, '');

          if (regionAppId && String(appId) === String(regionAppId)) {
            if (bestRank === null || rank < bestRank) {
              bestRank = rank;
            }
          }
        }

        if (bestRank === null) {
          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length < 4) continue;
            const rank = parseInt(parts[1], 10);
            const title = (parts[3] || '').replace(/"/g, '').toLowerCase().trim();
            if (allNames.includes(title)) {
              if (bestRank === null || rank < bestRank) {
                bestRank = rank;
              }
            }
          }
        }
      } catch (e) {
        // CSV read failure - skip this region for this date
      }

      // CSV가 없거나 매칭 실패한 날짜는 커밋되는 history/{date}.json에서 보충
      if (bestRank === null) {
        bestRank = lookupHistoryRank(date, platform, region, category, regionAppId, allNames, ctx);
      }

      if (bestRank !== null) {
        dayData[region] = bestRank;
      }
    }

    if (Object.keys(dayData).length > 1) {
      result.push(dayData);
    }
  }

  return result;
}

function generateComparisonChart(chartBlock, ctx) {
  const gamesMap = ctx.gamesMap || {};
  const { games = [], category = 'grossing', market = 'ios', startDate, endDate, title } = chartBlock;

  if (!games.length || !startDate || !endDate) {
    return '<div class="chart-error">차트 데이터가 부족합니다</div>';
  }

  const gameDataList = games.map(slug => {
    const history = loadGameRankHistory(slug, startDate, endDate, category, market, ctx);
    const gameInfo = Object.entries(gamesMap).find(([name, info]) => info.slug === slug);
    return {
      slug,
      name: gameInfo ? gameInfo[0] : slug,
      icon: gameInfo ? gameInfo[1].icon : null,
      history
    };
  }).filter(g => g.history.length > 0);

  if (gameDataList.length === 0) {
    return '<div class="chart-error">순위 데이터가 없습니다</div>';
  }

  const allDates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

  const rawSeries = [];
  gameDataList.forEach((game) => {
    const data = allDates.map(date => {
      const dayData = game.history.find(h => h.date === date);
      return (dayData && dayData.kr) ? dayData.kr : null;
    });
    const displayName = game.name.length > 12 ? game.name.substring(0, 12) + '...' : game.name;
    rawSeries.push({ name: displayName, data });
  });

  if (rawSeries.length === 0) {
    return '<div class="chart-error">순위 데이터가 없습니다</div>';
  }

  let trimStart = allDates.length;
  let trimEnd = -1;
  rawSeries.forEach(s => {
    for (let i = 0; i < s.data.length; i++) {
      if (s.data[i] !== null) { trimStart = Math.min(trimStart, i); break; }
    }
    for (let i = s.data.length - 1; i >= 0; i--) {
      if (s.data[i] !== null) { trimEnd = Math.max(trimEnd, i); break; }
    }
  });
  if (trimStart > trimEnd) trimStart = 0;
  const labels = allDates.slice(trimStart, trimEnd + 1);
  const series = rawSeries.map(s => ({ name: s.name, data: s.data.slice(trimStart, trimEnd + 1) }));

  const categoryLabel = category === 'grossing' ? '매출' : '인기';
  const marketLabel = market === 'ios' ? 'iOS' : 'Android';
  const chartTitle = title || `${marketLabel} ${categoryLabel} 순위 비교 (한국)`;

  const chartId = `comp-chart-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

  return `
    <div class="ranking-chart-wrapper">
      <h3 class="ranking-chart-title">${String(chartTitle).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</h3>
      <div id="${chartId}" class="ranking-chart"></div>
      <script>
        (function() {
          function init() {
            if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
            var el = document.getElementById('${chartId}');
            if (!el || el.dataset.rendered) return;
            el.dataset.rendered = 'true';
            var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            var labelColor = isDark ? '#adb5bd' : '#666';
            var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
            new ApexCharts(el, {
              series: ${JSON.stringify(series)},
              chart: { type: 'line', height: 350, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', zoom: { enabled: false }, foreColor: labelColor },
              colors: ${JSON.stringify(colors.slice(0, series.length))},
              stroke: { width: 3, curve: 'straight' },
              markers: { size: 4, hover: { size: 6 } },
              xaxis: { categories: ${JSON.stringify(labels)}, labels: { rotate: -45, style: { fontSize: '11px', colors: labelColor } }, tickAmount: 10 },
              yaxis: { reversed: true, min: 1, max: 200, labels: { style: { colors: labelColor }, formatter: function(v) { return Math.round(v) + '위'; } } },
              legend: { position: 'top', horizontalAlign: 'center', labels: { colors: labelColor } },
              tooltip: { y: { formatter: function(v) { return v ? v + '위' : '데이터 없음'; } } },
              grid: { borderColor: gridColor, strokeDashArray: 4 }
            }).render();
          }
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
          else init();
        })();
      </script>
    </div>
  `;
}

function renderNote(block) {
  return `<div class="blog-note">${block.value.replace(/\n/g, '<br>')}</div>`;
}

function renderChartGroup(block, ctx) {
  const items = block.charts.map(c => generateComparisonChart(c, ctx)).join('');
  return `<div class="blog-charts-grid">${items}</div>`;
}

function renderRankingBar(block, ctx) {
  const gamesMap = ctx.gamesMap || {};
  const escapeHtmlAttr = ctx.escapeHtmlAttr;
  const barChartId = `ranking-bar-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const barItems = block.items || [];

  const barIcons = barItems.map(item => {
    const gameData = gamesMap[item.name] || Object.values(gamesMap).find(g => g.slug === item.slug);
    return item.icon || item.img || gameData?.icon || '';
  });

  const barScores = barItems.map(item => item.score);
  const barMaxScore = Math.max(...barScores);

  const getBarColor = (item, idx) => {
    if (item.rank === 1 || idx === 0) return '#FFD700';
    if (item.rank === 2 || idx === 1) return '#C0C0C0';
    if (item.rank === 3 || idx === 2) return '#CD7F32';
    if (item.highlight) return '#FF6B6B';
    return '#4ECDC4';
  };

  const barRowsHtml = barItems.map((item, idx) => {
    const pct = (item.score / barMaxScore) * 100;
    const color = getBarColor(item, idx);
    const icon = barIcons[idx];
    const isLast = idx === barItems.length - 1;
    return `
      <div class="ranking-bar-row" style="display:flex; align-items:center; ${isLast ? '' : 'margin-bottom:8px;'} gap:10px;">
        <img src="${icon}" alt="${escapeHtmlAttr(item.name)}" title="${escapeHtmlAttr(item.name)}" style="width:36px; height:36px; border-radius:8px; object-fit:cover; flex-shrink:0;">
        <div class="ranking-bar-track" style="flex:1; height:32px; background:var(--hover-bg); border-radius:6px; position:relative;">
          <div class="ranking-bar-fill" style="width:${pct}%; height:100%; background:${color}; border-radius:6px; display:flex; align-items:center; justify-content:flex-end; padding-right:8px;">
            <span style="font-size:12px; font-weight:600; color:#333;">${item.score.toLocaleString()}${block.unit !== undefined ? block.unit : '점'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="ranking-chart-wrapper" style="padding: 20px 24px;">
      ${block.title ? `<h3 class="ranking-chart-title" style="margin-bottom:16px;">${escapeHtmlAttr(block.title)}</h3>` : ''}
      <div id="${barChartId}" class="ranking-bar-chart">
        ${barRowsHtml}
      </div>
    </div>
  `;
}

function renderRankingCard(block, ctx) {
  const gamesMap = ctx.gamesMap || {};
  const escapeHtmlAttr = ctx.escapeHtmlAttr;
  const cardItem = block.item || block;
  let cardIcon = cardItem.icon || cardItem.img || '';
  if (!cardIcon && cardItem.slug) {
    for (const [name, game] of Object.entries(gamesMap)) {
      if (game.slug === cardItem.slug && game.icon) { cardIcon = game.icon; break; }
    }
  }
  const cardUnit = cardItem.unit || block.unit || '점';

  return `
    <div class="ranking-card ${cardItem.highlight ? 'ranking-card-highlight' : ''}">
      <img class="ranking-card-icon" src="${cardIcon}" alt="${escapeHtmlAttr(cardItem.name || '')}" loading="lazy">
      <div class="ranking-card-info">
        <div class="ranking-card-name">${escapeHtmlAttr(cardItem.name || '')}</div>
        <div class="ranking-card-score">${cardItem.score?.toLocaleString() || ''}${cardUnit}</div>
      </div>
      <div class="ranking-card-stats">
        ${cardItem.ios ? `<div class="ranking-card-stat stat-ios"><span class="stat-label">${cardItem.iosLabel || 'iOS'}</span><span class="stat-value">${cardItem.ios}</span></div>` : ''}
        ${cardItem.android ? `<div class="ranking-card-stat stat-aos"><span class="stat-label">${cardItem.androidLabel || 'AOS'}</span><span class="stat-value">${cardItem.android}</span></div>` : ''}
      </div>
    </div>
  `;
}

function renderRankingCompare(block, ctx) {
  const gamesMap = ctx.gamesMap || {};
  const escapeHtmlAttr = ctx.escapeHtmlAttr;
  const compChartId = `ranking-compare-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const compItems = block.items || [];
  const compStart = block.startDate || '';
  const compEnd = block.endDate || '';
  const compColors = ['#007AFF', '#3DDC84', '#45B7D1', '#96CEB4'];

  const compAllDates = [];
  if (compStart && compEnd) {
    const s = new Date(compStart);
    const e = new Date(compEnd);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      compAllDates.push(d.toISOString().slice(0, 10));
    }
  }

  const compSeries = [];
  const compLabels = compAllDates.map(d => d.slice(5).replace('-', '/'));

  compItems.forEach((item, idx) => {
    const slug = item.slug || item.game;
    const market = item.market || 'ios';
    const category = item.category || 'grossing';
    let itemName = item.label || slug;

    for (const [name, game] of Object.entries(gamesMap)) {
      if (game.slug === slug) {
        itemName = item.label || (name.length > 15 ? name.substring(0, 15) + '...' : name);
        break;
      }
    }

    const compHistory = loadGameRankHistory(slug, compStart, compEnd, category, market, ctx);
    const histMap = {};
    compHistory.forEach(h => { if (h.kr) histMap[h.date] = h.kr; });

    const itemData = compAllDates.map(d => {
      const rank = histMap[d];
      return (rank && rank <= 200) ? rank : null;
    });

    if (itemData.some(v => v !== null)) {
      compSeries.push({ name: itemName, data: itemData });
    }
  });

  if (compSeries.length === 0) return '';

  return `
    <div class="ranking-chart-wrapper">
      ${block.title ? `<h3 class="ranking-chart-title">${escapeHtmlAttr(block.title)}</h3>` : ''}
      <div id="${compChartId}" class="ranking-chart"></div>
      <script>
        (function() {
          function init() {
            if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
            var el = document.getElementById('${compChartId}');
            if (!el || el.dataset.rendered) return;
            el.dataset.rendered = 'true';
            var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            var labelColor = isDark ? '#adb5bd' : '#666';
            var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
            new ApexCharts(el, {
              series: ${JSON.stringify(compSeries)},
              chart: { type: 'line', height: 320, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', zoom: { enabled: false }, foreColor: labelColor },
              colors: ${JSON.stringify(compColors.slice(0, compSeries.length))},
              stroke: { width: 3, curve: 'straight' },
              markers: { size: 4, hover: { size: 6 } },
              xaxis: { categories: ${JSON.stringify(compLabels)}, labels: { rotate: -45, style: { fontSize: '10px', colors: labelColor } }, tickAmount: Math.min(10, ${compLabels.length}) },
              yaxis: { reversed: true, min: 1, max: 200, labels: { style: { colors: labelColor }, formatter: function(v) { return Math.round(v) + '위'; } } },
              legend: { position: 'top', horizontalAlign: 'center', fontSize: '13px', labels: { colors: labelColor } },
              tooltip: { y: { formatter: function(v) { return v ? v + '위' : '데이터 없음'; } } },
              grid: { borderColor: gridColor, strokeDashArray: 4 },
              forecastDataPoints: { count: 0, fillOpacity: 0.5 }
            }).render();
          }
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
          else init();
        })();
      </script>
    </div>
  `;
}

function groupChartBlocks(blocks) {
  const processed = [];
  let chartGroup = [];
  blocks.forEach((block) => {
    if (block.type === 'chart') {
      chartGroup.push(block);
    } else {
      if (chartGroup.length > 0) {
        processed.push({ type: 'chart-group', charts: chartGroup });
        chartGroup = [];
      }
      processed.push(block);
    }
  });
  if (chartGroup.length > 0) {
    processed.push({ type: 'chart-group', charts: chartGroup });
  }
  return processed;
}

function renderRankingBlock(block, ctx) {
  switch (block.type) {
    case 'note': return renderNote(block);
    case 'chart': return generateComparisonChart(block, ctx);
    case 'chart-group': return renderChartGroup(block, ctx);
    case 'ranking-bar': return renderRankingBar(block, ctx);
    case 'ranking-card': return renderRankingCard(block, ctx);
    case 'ranking-compare': return renderRankingCompare(block, ctx);
    default: return null;
  }
}

module.exports = {
  renderRankingBlock,
  groupChartBlocks,
  DEFAULT_SNAPSHOTS_DIR
};
