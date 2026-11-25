'use strict';
const { t, formatDay, formatYearMonth } = require('../../i18n');
/**
 * 스팀 허브 · 스팀 게임 상세 (정적 HTML)
 *   /steam/            동접자 TOP 100 · 한국 스토어 판매 TOP 100 · 월간 평균 동접 · 역대 최고 동접
 *   /steam/{appid}/    게임별 동접 추이 · 월별 기록 · 판매 순위 — 게임 DB에 없는 앱만. 게임 DB에 있는 앱은 그 게임 페이지
 *                      (/games/<slug>/)가 같은 기록을 보여 주고, /steam/{appid}/ 는 그리로 301 (src/build/game-data.js steamPageSlugs).
 * 데이터는 src/rank/steam-stats.js (history/ 일별 이력). 스타일은 60-rank-chart.css + 63-steam-hub.css (.rk-*).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { loadSteamStats } = require('../../rank/steam-stats');
const { steamRecord, renderSteamRecord, steamLead, steamPills, steamStoreLink, esc, fmt, avg, pct } = require('../helpers/steam-game');

const siteBaseUrl = 'https://gamerscroll.com';
const pctChg = (p) => (p == null ? '<span class="rk-chg new">NEW</span>' : `<span class="rk-chg ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(0)}%</span>`);
const rankChg = (cur, prev) => (prev == null ? '<span class="rk-chg new">NEW</span>' : cur < prev ? `<span class="rk-chg up">▲${prev - cur}</span>` : cur > prev ? `<span class="rk-chg down">▼${cur - prev}</span>` : '<span class="rk-chg same">=</span>');

// Apps with a record page (pageApps): merged = app ID → game slug (the game page shows the record), built = /steam/<id>/ pages.
let targets = null;
function steamTargets() {
  if (!targets) {
    const pages = new Set(loadSteamStats().pageApps(14));
    const merged = require('../../build/game-data').steamPageSlugs(require('../../rank/stats').loadRankStats().games, pages);
    targets = { merged, built: [...pages].filter((id) => !merged.has(id)) };
  }
  return targets;
}
// The app's record page, or null when it has none (the row is plain text). Game pages with a Steam record are indexable in every edition.
const steamHref = (id) => {
  const { merged, built } = steamTargets();
  const key = String(id);
  return merged.has(key) ? `/games/${encodeURIComponent(merged.get(key))}/` : built.includes(key) ? `/steam/${key}/` : null;
};
const monthlyRows = (ST) => ST.monthlyTop(ST.latestMonth, 10);
const peakRows = (ST) => ST.allTimePeaks(10);
// Game pages the hub links (its two charts and two record tables): every edition's game sitemap lists them.
function steamHubGameSlugs() {
  const ST = loadSteamStats();
  const ids = [...ST.today.mp, ...ST.today.sellers, ...monthlyRows(ST), ...peakRows(ST)].map((r) => String(r.appid));
  return new Set(ids.map((id) => steamTargets().merged.get(id)).filter(Boolean));
}
const nameLink = (href, name) => (href ? `<a data-name href="${href}">${esc(name)}</a>` : `<span data-name>${esc(name)}</span>`);

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
const subnav = (active) => { const item = (id, href, label, cls = '') => `<a class="${[active === id ? 'active' : '', cls].filter(Boolean).join(' ')}" href="${href}">${label}</a>`; return `<nav class="rk-subnav" aria-label="${t('steam.steam_ranking_types')}">${item('ccu', '/steam/', t('steam.concurrent_2'))}${item('sell', '/steam/#sell', t('steam.sales_2'))}${item('monthly', '/steam/#monthly', t('rank.monthly'))}${item('records', '/steam/#records', t('steam.all_time_records'))}${item('about', '/rankings/about/', t('steam.methodology'), 'right')}</nav>`; };
const appCell = (m) => `<div class="rk-app cap"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div><div class="t">${nameLink(steamHref(m.appid), m.name)}</div><div class="d" data-name>${esc(m.developer)}</div></div></div>`;

function shell(ST, { body, title, brand = true, description, canonical, crumbs, keywords }) {
  const content = `
    <section class="section active" id="steam">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'steam',
    pageScripts: `<script>(function(){function sync(){if(location.hash==='#sell'){const tab=document.getElementById('rk-st-ios');if(tab)tab.checked=true;}else if(location.hash==='#rk-list'){const tab=document.getElementById('rk-st-and');if(tab)tab.checked=true;}}window.addEventListener('hashchange',sync);sync();})();</script>`,
    title, brand, description, keywords, canonical,
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
    const href = info && steamHref(row.appid);
    const tag = href ? 'a' : 'div';
    return `<div class="rk-stat rk-steam-game-card"><div class="l">${label}</div>${info ? `<${tag} class="rk-steam-card-game"${href ? ` href="${href}"` : ''}><img src="${esc(info.img)}" alt="" width="68" height="44"><span>${esc(info.name)}</span></${tag}>` : t('steam.no_record')}<div class="s"><strong>${value}</strong>${detail ? `<br>${detail}` : ''}</div></div>`;
  };
  const kpi = `<div class="rk-stats four rk-steam-summary">
<div class="rk-stat"><div class="l">${t('steam.top_100_concurrent_players')}</div><div class="v"><span>${fmt(total)}</span><small>${t('home.players')}</small></div><div class="s">${t('steam.vs_7_day_average', { p0: total7 ? `<span class="rk-chg ${total >= total7 ? 'up' : 'down'}">${total >= total7 ? '▲' : '▼'}${Math.abs(pct(total, total7)).toFixed(1)}%</span>` : '-' })}</div></div>
${gameSummary(t('steam.concurrent_players_1'), top, `${t('steam.players', { p0: fmt(top.ccu) })}`, t('steam.current_concurrent_players_2'))}
${gameSummary(t('steam.biggest_7_day_increase'), up && up.r, up ? `▲${up.p.toFixed(0)}%` : '-', up ? `${t('steam.now_players', { p0: fmt(up.r.ccu) })}` : t('steam.no_comparison_record'))}
${gameSummary(t('steam.recent_new_entry'), fresh, fresh ? `${t('steam.players', { p0: fmt(fresh.ccu) })}` : '-', fresh ? `${t('steam.now', { rank: fresh.rank })}` : t('steam.no_new_entries_in_the'))}</div>`;

  const VISIBLE = 20;
  const mpRows = T.mp.map((r, i) => { const m = ST.info(r.appid); const p = pct(r.ccu, ST.ccuOf(wk, r.appid)); const pr = ST.rankOf(Y, r.appid); return `<li${i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${i < 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm">${nameLink(steamHref(r.appid), m.name)}<span class="dv" data-name>${esc(m.developer)}</span></div><div class="num"><b>${fmt(r.ccu)}</b><i>${t('steam.rank', { p0: pr == null ? 'NEW' : pr === r.rank ? '=' : pr > r.rank ? `▲${pr - r.rank}` : `▼${r.rank - pr}` })}</i></div><div class="pct">${pctChg(p)}</div>${spark(ST.series(r.appid).slice(-30))}</li>`; }).join('');
  const sellRows = T.sellers.map((r, i) => { const m = ST.info(r.appid); const pr = ST.sellOf(Y, r.appid); return `<li${i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${i < 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm">${nameLink(steamHref(r.appid), m.name)}<span class="dv" data-name>${esc(m.developer)}</span></div><div class="rk-price">${r.discount ? `<span class="rk-disc">${esc(r.discount)}</span>` : ''}<span>${esc(r.price || '')}</span></div><div class="rt">${rankChg(r.rank, pr)}</div></li>`; }).join('');
  const col = (id, s, title, sub, rows, n) => `<div class="rk-col ${s}"${s === 'ios' ? ' id="sell"' : ''}><div class="rk-colh"><h2>${title}</h2><small>${sub}</small></div><input type="checkbox" id="${id}" class="rk-more-toggle rk-control" aria-label="${t('steam.show_full_ranking', { title })}"><ol class="rk-list steam${s === 'ios' ? ' sell' : ''}">${rows}</ol>${n > VISIBLE ? expandLabel(id, n, VISIBLE) : ''}</div>`;
  const cols = `<input type="radio" name="rk-store" id="rk-st-and" class="rk-control" checked><input type="radio" name="rk-store" id="rk-st-ios" class="rk-control"><div class="rk-storeseg"><label for="rk-st-and">${t('steam.concurrent_2')}</label><label for="rk-st-ios">${t('steam.sales_2')}</label></div>
<div class="rk-cols" id="rk-list">${col('rk-more-ccu', 'and', t('steam.concurrent_player_rankings'), t('steam.players_at_collection_time_vs'), mpRows, T.mp.length)}${col('rk-more-sell', 'ios', t('steam.sales_rankings'), t('steam.korea_store_price_discount_rate'), sellRows, T.sellers.length)}</div>`;

  const mo = ST.latestMonth;
  const monthly = monthlyRows(ST).map((a) => `<tr><td class="rk-rank ${a.rank <= 3 ? 'top' : ''}">${a.rank}</td><td>${appCell(ST.info(a.appid))}</td><td class="v">${fmt(a.avg)}<small>${t('home.monthly_avg_concurrent_players')}</small></td></tr>`).join('');
  const peaks = peakRows(ST).map((a, i) => `<tr><td class="rk-rank ${i < 3 ? 'top' : ''}">${i + 1}</td><td>${appCell(ST.info(a.appid))}</td><td class="v">${fmt(a.ccu)}<small>${formatDay(a.date)}</small></td></tr>`).join('');
  const lead = `${t('steam.steam_concurrent_players_1_players', { name: ST.info(top.appid).name, p1: fmt(top.ccu), p2: T.mp[1] ? ST.info(T.mp[1].appid).name : '-', p3: T.mp[2] ? ST.info(T.mp[2].appid).name : '-', p4: T.sellers[0] ? ST.info(T.sellers[0].appid).name : '-', date: formatDay(T.date) })}`;
  const body = `<div class="rk-head"><h1>${t('steam.game_rankings')}</h1></div>
${kpi}
${cols}
<div class="rk-grid2 home" id="monthly"><div class="rk-card"><h2>${t('steam.monthly_concurrent_player_rankings')} <small>${t('steam.average_of_daily_records_top', { mo: formatYearMonth(mo) })}</small></h2><table class="rk-table"><tbody>${monthly}</tbody></table></div><div class="rk-card" id="records"><h2>${t('steam.peak_concurrent_player_records')} <small>${t('steam.top_10_since', { date: formatDay(days[0].date) })}</small></h2><table class="rk-table"><tbody>${peaks}</tbody></table></div></div>`;
  const canonical = `${siteBaseUrl}/steam/`;
  return shell(ST, {
    body,
    // No date: the URL always shows the latest charts.
    title: t('steam.steam_game_rankings_concurrent_players'),
    description: lead,
    keywords: t('steam.steam_rankings_steam_concurrent_player'),
    canonical,
    crumbs: [],
  });
}

// ---------- 2. 스팀 게임 상세 (게임 DB에 없는 앱) ----------
function renderSteamGame(appid) {
  const d = steamRecord(loadSteamStats(), appid);
  const body = `<div class="rk-crumb"><a href="/steam/">${t('layout.steam')}</a><span>›</span><span data-name>${esc(d.name)}</span></div>
<div class="rk-hero"><img src="${esc(d.img)}" alt="" fetchpriority="high"><div><h1 data-name>${esc(d.name)}</h1><div class="meta"><b data-name>${esc(d.developer)}</b><span>·</span><span>Steam</span>${d.first ? `<span>·</span><span>${t('steam.first_recorded', { first: formatDay(d.first) })}</span>` : ''}</div>${steamPills(d)}</div><div class="actions">${steamStoreLink(d)}</div></div>
${renderSteamRecord(d)}`;
  const canonical = `${siteBaseUrl}/steam/${d.id}/`;
  const title = require('../helpers/fit-description').fitTitle(d.name, (name) => ['steam.steam_concurrent_players_and_sales', 'game.seo_title_steam_short'].map((k) => t(k, { name })));
  return shell(null, {
    body,
    title,
    brand: title !== d.name,
    description: steamLead(d),
    keywords: `${t('steam.concurrent_players_steam_ranking_concurrent', { name: d.name, name2: d.name, name3: d.name, name4: d.name })}`,
    canonical,
    crumbs: [{ name: d.name, url: canonical }],
  });
}

// /steam/<appid>/ pages to build: record apps without a game page
function steamGameIds() { return steamTargets().built; }

module.exports = { renderSteamHub, renderSteamGame, steamGameIds, steamHref, steamTargets, steamHubGameSlugs };
