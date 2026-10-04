'use strict';
const { t, formatDay, formatMonthDay, formatYearMonth } = require('../../i18n');
/**
 * 스팀 허브 · 스팀 게임 상세 (정적 HTML)
 *   /steam/            동접자 TOP 100 · 한국 스토어 판매 TOP 100 · 월간 평균 동접 · 역대 최고 동접
 *   /steam/{appid}/    게임별 동접 추이 · 월별 기록 · 판매 순위
 * 데이터는 src/rank/steam-stats.js (history/ 일별 이력). 스타일은 60-rank-chart.css + 63-steam-hub.css (.rk-*).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { loadSteamStats } = require('../../rank/steam-stats');

const siteBaseUrl = 'https://gamerscroll.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '-' : Math.round(n).toLocaleString(require('../../i18n').currentEdition().intl));
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
const pctChg = (p) => (p == null ? '<span class="rk-chg new">NEW</span>' : `<span class="rk-chg ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(0)}%</span>`);
const rankChg = (cur, prev) => (prev == null ? '<span class="rk-chg new">NEW</span>' : cur < prev ? `<span class="rk-chg up">▲${prev - cur}</span>` : cur > prev ? `<span class="rk-chg down">▼${cur - prev}</span>` : '<span class="rk-chg same">=</span>');
const gameHref = (id) => `/steam/${id}/`;

// 동접자 스파크라인 (값이 클수록 위)
function spark(vals, { w = 72, h = 22, color } = {}) {
  const nums = vals.filter((x) => x != null);
  if (nums.length < 2) return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const y = (v) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4));
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + ((i / (vals.length - 1)) * w).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; pen = true; });
  const c = color || (nums[nums.length - 1] > nums[0] ? 'var(--rk-up)' : nums[nums.length - 1] < nums[0] ? 'var(--rk-down)' : 'var(--rk-dim)');
  return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
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
const subnav = (active) => { const item = (id, href, label, cls = '') => `<a class="${[active === id ? 'active' : '', cls].filter(Boolean).join(' ')}" href="${href}">${label}</a>`; return `<nav class="rk-subnav" aria-label="${t('steam.steam_ranking_types')}">${item('ccu', '/steam/', t('steam.concurrent_2'))}${item('sell', '/steam/#sell', t('steam.sales_2'))}${item('monthly', '/steam/#monthly', t('rank.monthly'))}${item('records', '/steam/#records', t('steam.all_time_records'))}${item('about', '/rankings/about/', t('steam.methodology'), 'right')}</nav>`; };
const appCell = (m, href) => `<div class="rk-app cap"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div><div class="t"><a data-name href="${href}">${esc(m.name)}</a></div><div class="d" data-name>${esc(m.developer)}</div></div></div>`;

function shell(ST, { body, title, description, canonical, crumbs, keywords }) {
  const content = `
    <section class="section active" id="steam">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'steam',
    pageScripts: `<script>(function(){function sync(){if(location.hash==='#sell'){const tab=document.getElementById('rk-st-ios');if(tab)tab.checked=true;}else if(location.hash==='#rk-list'){const tab=document.getElementById('rk-st-and');if(tab)tab.checked=true;}}window.addEventListener('hashchange',sync);sync();})();</script>`,
    title, description, keywords, canonical,
    breadcrumbs: [{ name: t('about.home'), url: `${siteBaseUrl}/` }, { name: t('layout.steam'), url: `${siteBaseUrl}/steam/` }, ...(crumbs || [])].filter((c, i, a) => a.findIndex((d) => d.url === c.url) === i),
  });
}

// ---------- 1. 스팀 허브 ----------
function renderSteamHub() {
  const { expandLabel } = require('../components/list-actions');
  const ST = loadSteamStats();
  const { today: T, yday: Y, days } = ST;
  const wk = days[Math.max(0, days.length - 8)];
  const total = ST.sumToday(T);
  const total7 = avg(days.slice(-8, -1).map(ST.sumToday));
  const movers = T.mp.map((r) => ({ r, p: pct(r.ccu, ST.ccuOf(wk, r.appid)) })).filter((x) => x.p != null);
  const up = movers.sort((a, b) => b.p - a.p)[0];
  const fresh = T.mp.find((r) => { const s = ST.firstSeen(r.appid); return s && s >= days[Math.max(0, days.length - 15)].date; });
  const top = T.mp[0];
  const gameSummary = (label, row, value, detail) => {
    const info = row ? ST.info(row.appid) : null;
    return `<div class="rk-stat rk-steam-game-card"><div class="l">${label}</div>${info ? `<a class="rk-steam-card-game" href="${gameHref(row.appid)}"><img src="${esc(info.img)}" alt="" width="68" height="44"><span>${esc(info.name)}</span></a>` : t('steam.no_record')}<div class="s"><strong>${value}</strong>${detail ? `<br>${detail}` : ''}</div></div>`;
  };
  const kpi = `<div class="rk-stats four rk-steam-summary">
<div class="rk-stat"><div class="l">${t('steam.top_100_concurrent_players')}</div><div class="v"><span>${fmt(total)}</span><small>${t('home.players')}</small></div><div class="s">${t('steam.vs_7_day_average', { p0: total7 ? `<span class="rk-chg ${total >= total7 ? 'up' : 'down'}">${total >= total7 ? '▲' : '▼'}${Math.abs(pct(total, total7)).toFixed(1)}%</span>` : '-' })}</div></div>
${gameSummary(t('steam.concurrent_players_1'), top, `${t('steam.players', { p0: fmt(top.ccu) })}`, t('steam.current_concurrent_players_2'))}
${gameSummary(t('steam.biggest_7_day_increase'), up && up.r, up ? `▲${up.p.toFixed(0)}%` : '-', up ? `${t('steam.now_players', { p0: fmt(up.r.ccu) })}` : t('steam.no_comparison_record'))}
${gameSummary(t('steam.recent_new_entry'), fresh, fresh ? `${t('steam.players', { p0: fmt(fresh.ccu) })}` : '-', fresh ? `${t('steam.now', { rank: fresh.rank })}` : t('steam.no_new_entries_in_the'))}</div>`;

  const VISIBLE = 20;
  const mpRows = T.mp.map((r, i) => { const m = ST.info(r.appid); const p = pct(r.ccu, ST.ccuOf(wk, r.appid)); const pr = ST.rankOf(Y, r.appid); return `<li${i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${i < 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><a data-name href="${gameHref(r.appid)}">${esc(m.name)}</a><span class="dv" data-name>${esc(m.developer)}</span></div><div class="num"><b>${fmt(r.ccu)}</b><i>${t('steam.rank', { p0: pr == null ? 'NEW' : pr === r.rank ? '=' : pr > r.rank ? `▲${pr - r.rank}` : `▼${r.rank - pr}` })}</i></div><div class="pct">${pctChg(p)}</div>${spark(ST.series(r.appid).slice(-30))}</li>`; }).join('');
  const sellRows = T.sellers.map((r, i) => { const m = ST.info(r.appid); const pr = ST.sellOf(Y, r.appid); return `<li${i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${i < 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><a data-name href="${gameHref(r.appid)}">${esc(m.name)}</a><span class="dv" data-name>${esc(m.developer)}</span></div><div class="rk-price">${r.discount ? `<span class="rk-disc">${esc(r.discount)}</span>` : ''}<span>${esc(r.price || '')}</span></div><div class="rt">${rankChg(r.rank, pr)}</div></li>`; }).join('');
  const col = (id, s, title, sub, rows, n) => `<div class="rk-col ${s}"${s === 'ios' ? ' id="sell"' : ''}><div class="rk-colh"><h2>${title}</h2><small>${sub}</small></div><input type="checkbox" id="${id}" class="rk-more-toggle rk-control" aria-label="${t('steam.show_full_ranking', { title })}"><ol class="rk-list steam${s === 'ios' ? ' sell' : ''}">${rows}</ol>${n > VISIBLE ? expandLabel(id, n, VISIBLE) : ''}</div>`;
  const cols = `<input type="radio" name="rk-store" id="rk-st-and" class="rk-control" checked><input type="radio" name="rk-store" id="rk-st-ios" class="rk-control"><div class="rk-storeseg"><label for="rk-st-and">${t('steam.concurrent_2')}</label><label for="rk-st-ios">${t('steam.sales_2')}</label></div>
<div class="rk-cols" id="rk-list">${col('rk-more-ccu', 'and', t('steam.concurrent_player_rankings'), t('steam.players_at_collection_time_vs'), mpRows, T.mp.length)}${col('rk-more-sell', 'ios', t('steam.sales_rankings'), t('steam.korea_store_price_discount_rate'), sellRows, T.sellers.length)}</div>`;

  const mo = ST.latestMonth;
  const monthly = ST.monthlyTop(mo, 10).map((a) => `<tr><td class="rk-rank ${a.rank <= 3 ? 'top' : ''}">${a.rank}</td><td>${appCell(ST.info(a.appid), gameHref(a.appid))}</td><td class="v">${fmt(a.avg)}<small>${t('home.monthly_avg_concurrent_players')}</small></td></tr>`).join('');
  const peaks = ST.allTimePeaks(10).map((a, i) => `<tr><td class="rk-rank ${i < 3 ? 'top' : ''}">${i + 1}</td><td>${appCell(ST.info(a.appid), gameHref(a.appid))}</td><td class="v">${fmt(a.ccu)}<small>${formatDay(a.date)}</small></td></tr>`).join('');
  const lead = `${t('steam.steam_concurrent_players_1_players', { name: ST.info(top.appid).name, p1: fmt(top.ccu), p2: T.mp[1] ? ST.info(T.mp[1].appid).name : '-', p3: T.mp[2] ? ST.info(T.mp[2].appid).name : '-', p4: T.sellers[0] ? ST.info(T.sellers[0].appid).name : '-', date: formatDay(T.date) })}`;
  // 화면 h1은 '스팀'을 뺀다 — 상단 탭이 이미 '스팀' (2026-09-09). <title>·메타는 유지.
  const body = `<div class="rk-head"><h1>${t('steam.game_rankings')}</h1></div>
${kpi}
${cols}
<div class="rk-grid2 home" id="monthly"><div class="rk-card"><h2>${t('steam.monthly_concurrent_player_rankings')} <small>${t('steam.average_of_daily_records_top', { mo: formatYearMonth(mo) })}</small></h2><table class="rk-table"><tbody>${monthly}</tbody></table></div><div class="rk-card" id="records"><h2>${t('steam.peak_concurrent_player_records')} <small>${t('steam.top_10_since', { date: formatDay(days[0].date) })}</small></h2><table class="rk-table"><tbody>${peaks}</tbody></table></div></div>`;
  const canonical = `${siteBaseUrl}/steam/`;
  return shell(ST, {
    body,
    title: `${t('steam.steam_game_rankings_concurrent_players', { date: formatDay(T.date) })}`,
    description: lead,
    keywords: t('steam.steam_rankings_steam_concurrent_player'),
    canonical,
    crumbs: [],
  });
}

// ---------- 2. 스팀 게임 상세 ----------
function renderSteamGame(appid) {
  const { listLink } = require('../components/list-actions');
  const ST = loadSteamStats();
  const id = String(appid);
  const m = ST.info(id);
  const { today: T, yday: Y, days } = ST;
  const ser = ST.series(id); const dates = days.map((d) => d.date);
  const cur = ST.ccuOf(T, id), prev = ST.ccuOf(Y, id);
  const last30 = ser.slice(-30).filter((v) => v != null);
  const pk = ST.peak(id);
  const rank = ST.rankOf(T, id), sell = ST.sellOf(T, id);
  const sellRow = T.tsIdx.get(id);
  const first = ST.firstSeen(id);
  const onChart = ST.daysOnChart(id);
  const monthly = ST.months.filter((mo) => ST.daysIn(mo).some((d) => ST.ccuOf(d, id) != null || ST.sellOf(d, id) != null)).map((mo) => {
    const dd = ST.daysIn(mo);
    const v = dd.map((d) => ST.ccuOf(d, id)).filter((x) => x != null);
    const rk = dd.map((d) => ST.rankOf(d, id)).filter((x) => x != null);
    const sl = dd.map((d) => ST.sellOf(d, id)).filter((x) => x != null);
    return { mo, avg: avg(v), max: v.length ? Math.max(...v) : null, rank: avg(rk), bestRank: rk.length ? Math.min(...rk) : null, sell: sl.length ? Math.min(...sl) : null, n: v.length };
  }).reverse();
  const text = `${t('steam.on_steam_concurrent_players_30', { name: m.name, date: formatDay(T.date), p2: cur != null ? `${t('steam.players_concurrent', { p0: fmt(cur), rank })}` : t('steam.outside_concurrent_top_100'), p3: sell ? `${t('steam.korea_store_sales', { sell })}` : '', p4: fmt(avg(last30)), p5: fmt(pk.ccu), p6: pk.date ? formatDay(pk.date) : '-', onChart })}`;
  const body = `<div class="rk-crumb"><a href="/steam/">${t('layout.steam')}</a><span>›</span><span data-name>${esc(m.name)}</span></div>
<div class="rk-hero"><img src="${esc(m.img)}" alt="" fetchpriority="high"><div><h1 data-name>${esc(m.name)}</h1><div class="meta"><b data-name>${esc(m.developer)}</b><span>·</span><span>Steam</span>${first ? `<span>·</span><span>${t('steam.first_recorded', { first: formatDay(first) })}</span>` : ''}</div><div class="rk-pills">${rank ? `<span class="${rank === 1 ? 'one' : ''}">${t('steam.concurrent', { rank })}</span>` : ''}${sell ? `<span class="${sell === 1 ? 'one' : ''}">${t('steam.sales', { sell })}</span>` : ''}${sellRow && sellRow.discount ? `<span>${t('steam.off', { p0: esc(sellRow.discount), p1: esc(sellRow.price || '') })}</span>` : sellRow && sellRow.price ? `<span>${esc(sellRow.price)}</span>` : ''}</div></div><div class="actions"><a class="rk-btn primary" href="https://store.steampowered.com/app/${id}/" target="_blank" rel="noopener">${t('steam.steam_store')}</a></div></div>
<p class="rk-lead">${esc(text)}</p>
<div class="rk-stats four">
<div class="rk-stat"><div class="l">${t('steam.current_concurrent_players')}</div><div class="v">${cur == null ? t('chart.no_record') : fmt(cur)}${cur != null && prev ? `<span class="rk-chg ${cur >= prev ? 'up' : 'down'}">${cur >= prev ? '▲' : '▼'}${Math.abs(pct(cur, prev)).toFixed(1)}%</span>` : ''}</div><div class="s">${cur == null ? t('steam.currently_outside_the_collection_range') : t('steam.vs_previous_day')}</div></div>
<div class="rk-stat"><div class="l">${t('steam.30_day_avg_concurrent_players')}</div><div class="v">${last30.length ? fmt(avg(last30)) : t('chart.no_record')}</div><div class="s">${t('steam.last_days_of_records', { length: last30.length })}</div></div>
<div class="rk-stat"><div class="l">${t('steam.all_time_peak_concurrent_players')}</div><div class="v">${fmt(pk.ccu)}</div><div class="s">${pk.date ? formatDay(pk.date) : '-'}</div></div>
<div class="rk-stat"><div class="l">${t('steam.days_in_concurrent_top_100')}</div><div class="v">${onChart}<small>${t('rank.days')}</small></div><div class="s">${t('steam.of_days', { length: days.length })}</div></div></div>
${ser.filter((v) => v != null).length >= 2 ? `<div class="rk-card"><h2>${t('steam.concurrent_player_trend')} <small>${t('steam.daily', { date: formatDay(days[0].date), date2: formatDay(T.date) })}</small></h2><div class="rk-chart rk-chart-dual">${lineChart(ser, dates)}${lineChart(ser, dates, { w: 360, h: 220, mobile: true })}</div></div>` : ''}
<div class="rk-card rk-month-records"><h2>${t('steam.monthly_records')}</h2><table class="rk-table"><thead><tr><th>${t('rank.month')}</th><th class="r">${t('steam.avg_concurrent_players')}</th><th class="r">${t('home.peak_concurrent_players')}</th><th class="c">${t('rank.avg_rank')}</th><th class="c">${t('home.best_rank')}</th><th class="c">${t('steam.best_sales_rank')}</th><th class="c">${t('steam.recorded_on')}</th></tr></thead><tbody>${monthly.map((r) => `<tr><td><b>${formatYearMonth(r.mo)}</b></td><td class="r">${fmt(r.avg)}</td><td class="r">${fmt(r.max)}</td><td class="c">${r.rank != null ? r.rank.toFixed(1) : '-'}</td><td class="c">${r.bestRank != null ? r.bestRank + t('chart.rank_unit') : '-'}</td><td class="c">${r.sell != null ? r.sell + t('chart.rank_unit') : '-'}</td><td class="c">${r.n}</td></tr>`).join('')}</tbody></table></div>`;
  const canonical = `${siteBaseUrl}/steam/${id}/`;
  return shell(ST, {
    body,
    // 상세 페이지는 날짜 없이 짧게 (2026-09-09 title 정책)
    title: `${t('steam.steam_concurrent_players_and_sales', { name: m.name })}`,
    description: text,
    keywords: `${t('steam.concurrent_players_steam_ranking_concurrent', { name: m.name, name2: m.name, name3: m.name, name4: m.name })}`,
    canonical,
    crumbs: [{ name: m.name, url: canonical }],
  });
}

// 상세 페이지를 만들 앱 ID 목록
function steamGameIds() { return loadSteamStats().pageApps(14); }

module.exports = { renderSteamHub, renderSteamGame, steamGameIds };
