'use strict';

/**
 * A game's Steam record (concurrent-player trend, monthly records, sales rank): the body of /steam/<appid>/ and the Steam
 * section of the game page that replaces it (/games/<slug>/, see src/build/game-data.js steamPageSlugs).
 * steamRecord extracts the plain data at build time (docs/games-data/<slug>.json → steamRecord); the renderers are pure,
 * so the request-time game page (Workers) draws the same HTML as the static Steam page.
 */
const { t, formatDay, formatMonthDay, formatYearMonth, currentEdition } = require('../../i18n');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '-' : Math.round(n).toLocaleString(currentEdition().intl));
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

// ST = src/rank/steam-stats.js loadSteamStats()
function steamRecord(ST, appid) {
  const id = String(appid);
  const m = ST.info(id);
  const { today: T, yday: Y, days } = ST;
  const series = ST.series(id);
  const last30 = series.slice(-30).filter((v) => v != null);
  const sellRow = T.tsIdx.get(id);
  const monthly = ST.months.filter((mo) => ST.daysIn(mo).some((d) => ST.ccuOf(d, id) != null || ST.sellOf(d, id) != null)).map((mo) => {
    const dd = ST.daysIn(mo);
    const v = dd.map((d) => ST.ccuOf(d, id)).filter((x) => x != null);
    const rk = dd.map((d) => ST.rankOf(d, id)).filter((x) => x != null);
    const sl = dd.map((d) => ST.sellOf(d, id)).filter((x) => x != null);
    return { mo, avg: avg(v), max: v.length ? Math.max(...v) : null, rank: avg(rk), bestRank: rk.length ? Math.min(...rk) : null, sell: sl.length ? Math.min(...sl) : null, n: v.length };
  }).reverse();
  return {
    id, name: m.name, img: m.img, developer: m.developer,
    date: T.date, firstDay: days[0].date, totalDays: days.length,
    cur: ST.ccuOf(T, id), prev: ST.ccuOf(Y, id), rank: ST.rankOf(T, id), sell: ST.sellOf(T, id),
    price: (sellRow && sellRow.price) || '', discount: (sellRow && sellRow.discount) || '',
    first: ST.firstSeen(id), onChart: ST.daysOnChart(id), peak: ST.peak(id),
    avg30: avg(last30), n30: last30.length,
    series, dates: days.map((d) => d.date), monthly,
  };
}

// 큰 선 그래프 (동접자)
// mobile: 좁은 viewBox(360px) 변형. 데스크톱 1040px 차트를 화면 폭으로 축소하면 축 글자가 5px가 되므로
// 두 벌을 렌더하고 CSS(.rk-chartsvg-m)로 화면 폭에 따라 하나만 보인다 (2026-09-09).
function lineChart(vals, dates, { w = 1040, h = 260, mobile = false } = {}) {
  const nums = vals.filter((v) => v != null);
  if (!nums.length) return '';
  const hi = Math.max(...nums) * 1.05, L = mobile ? 46 : 60, R = 12, T = 12, B = 26, n = vals.length;
  const fs = mobile ? 12 : 11, xTicks = mobile ? 4 : 8;
  const x = (i) => L + (i / Math.max(n - 1, 1)) * (w - L - R);
  const y = (v) => T + (1 - v / hi) * (h - T - B);
  const fmtAxis = (v) => (mobile && v >= 10000 ? `${t('home.0k', { p0: Math.round(v / 10000) })}` : fmt(v));
  let grid = '';
  for (let k = 0; k <= 4; k++) { const v = (hi * k) / 4; grid += `<line x1="${L}" x2="${w - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--rk-line)"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="${fs}" fill="var(--rk-dim)">${fmtAxis(v)}</text>`; }
  let lab = '';
  for (let i = 0; i < n; i += Math.max(1, Math.ceil(n / xTicks))) lab += `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="${fs}" fill="var(--rk-dim)" text-anchor="middle">${formatMonthDay(dates[i])}</text>`;
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  return `<svg class="rk-chartsvg${mobile ? ' rk-chartsvg-m' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${t('steam.daily_concurrent_player_trend')}">${grid}${lab}<path d="${d}" fill="none" stroke="var(--rk-accent)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

const steamLead = (d) => t('steam.on_steam_concurrent_players_30', { name: d.name, date: formatDay(d.date), p2: d.cur != null ? `${t('steam.players_concurrent', { p0: fmt(d.cur), rank: d.rank })}` : t('steam.outside_concurrent_top_100'), p3: d.sell ? `${t('steam.korea_store_sales', { sell: d.sell })}` : '', p4: fmt(d.avg30), p5: fmt(d.peak.ccu), p6: d.peak.date ? formatDay(d.peak.date) : '-', onChart: d.onChart });

// Current concurrent-player and sales ranks, price or discount.
const steamPills = (d) => `<div class="rk-pills">${d.rank ? `<span class="${d.rank === 1 ? 'one' : ''}">${t('steam.concurrent', { rank: d.rank })}</span>` : ''}${d.sell ? `<span class="${d.sell === 1 ? 'one' : ''}">${t('steam.sales', { sell: d.sell })}</span>` : ''}${d.discount ? `<span>${t('steam.off', { p0: esc(d.discount), p1: esc(d.price) })}</span>` : d.price ? `<span>${esc(d.price)}</span>` : ''}</div>`;
const steamStoreLink = (d) => `<a class="rk-btn primary" href="https://store.steampowered.com/app/${esc(d.id)}/" target="_blank" rel="noopener">${t('steam.steam_store')}</a>`;

// Lead sentence, key figures, trend chart and monthly records.
function renderSteamRecord(d) {
  return `<p class="rk-lead">${esc(steamLead(d))}</p>
<div class="rk-stats four">
<div class="rk-stat"><div class="l">${t('steam.current_concurrent_players')}</div><div class="v">${d.cur == null ? t('chart.no_record') : fmt(d.cur)}${d.cur != null && d.prev ? `<span class="rk-chg ${d.cur >= d.prev ? 'up' : 'down'}">${d.cur >= d.prev ? '▲' : '▼'}${Math.abs(pct(d.cur, d.prev)).toFixed(1)}%</span>` : ''}</div><div class="s">${d.cur == null ? t('steam.currently_outside_the_collection_range') : t('steam.vs_previous_day')}</div></div>
<div class="rk-stat"><div class="l">${t('steam.30_day_avg_concurrent_players')}</div><div class="v">${d.n30 ? fmt(d.avg30) : t('chart.no_record')}</div><div class="s">${t('steam.last_days_of_records', { length: d.n30 })}</div></div>
<div class="rk-stat"><div class="l">${t('steam.all_time_peak_concurrent_players')}</div><div class="v">${fmt(d.peak.ccu)}</div><div class="s">${d.peak.date ? formatDay(d.peak.date) : '-'}</div></div>
<div class="rk-stat"><div class="l">${t('steam.days_in_concurrent_top_100')}</div><div class="v">${d.onChart}<small>${t('rank.days')}</small></div><div class="s">${t('steam.of_days', { length: d.totalDays })}</div></div></div>
${d.series.filter((v) => v != null).length >= 2 ? `<div class="rk-card"><h2>${t('steam.concurrent_player_trend')} <small>${t('steam.daily', { date: formatDay(d.firstDay), date2: formatDay(d.date) })}</small></h2><div class="rk-chart rk-chart-dual">${lineChart(d.series, d.dates)}${lineChart(d.series, d.dates, { w: 360, h: 220, mobile: true })}</div></div>` : ''}
<div class="rk-card rk-month-records"><h2>${t('steam.monthly_records')}</h2><table class="rk-table"><thead><tr><th>${t('rank.month')}</th><th class="r">${t('steam.avg_concurrent_players')}</th><th class="r">${t('home.peak_concurrent_players')}</th><th class="c">${t('rank.avg_rank')}</th><th class="c">${t('home.best_rank')}</th><th class="c">${t('steam.best_sales_rank')}</th><th class="c">${t('steam.recorded_on')}</th></tr></thead><tbody>${d.monthly.map((r) => `<tr><td><b>${formatYearMonth(r.mo)}</b></td><td class="r">${fmt(r.avg)}</td><td class="r">${fmt(r.max)}</td><td class="c">${r.rank != null ? r.rank.toFixed(1) : '-'}</td><td class="c">${r.bestRank != null ? r.bestRank + t('chart.rank_unit') : '-'}</td><td class="c">${r.sell != null ? r.sell + t('chart.rank_unit') : '-'}</td><td class="c">${r.n}</td></tr>`).join('')}</tbody></table></div>`;
}

module.exports = { steamRecord, renderSteamRecord, steamLead, steamPills, steamStoreLink, esc, fmt, avg, pct };
