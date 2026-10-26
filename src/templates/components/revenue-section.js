'use strict';

/**
 * Game page section 'revenue and download estimates (beta)' from docs/games-data/<slug>.json → `revenue`
 * (shape and source: src/build/service-exports.js). Pure, so it runs in the Workers bundle.
 * Every market × store view is rendered up front; radio buttons and CSS only switch them (src/styles/81-game-revenue.css):
 * market tabs (rv-m-*), store (rv-s-all | rv-s-ios | rv-s-and), daily/weekly (rv-p-d | rv-p-w) and USD (rv-usd).
 * Returns '' without data, so pages of games outside the bundle are unchanged.
 */
const { t, currentEdition, formatDay, formatDate, formatMonthDay, formatYearMonth, formatNumber } = require('../../i18n');
const C = require('./revenue-charts');

const MARKETS = ['kr', 'jp', 'us', 'tw', 'cn'];
const MARKET_KEYS = { kr: 'stats.korea', jp: 'stats.japan', us: 'stats.united_states', tw: 'stats.taiwan', cn: 'stats.china' };
const STORE_KEYS = { ios: 'stats.app_store', android: 'stats.google_play' };
// Literal ids and classes (selected by the CSS file).
const MARKET_ID = { kr: 'rv-m-kr', jp: 'rv-m-jp', us: 'rv-m-us', tw: 'rv-m-tw', cn: 'rv-m-cn' };
const MARKET_PANEL = { kr: 'rv-mp-kr', jp: 'rv-mp-jp', us: 'rv-mp-us', tw: 'rv-mp-tw', cn: 'rv-mp-cn' };
const MARKET_TAB = { kr: 'rv-tab-kr', jp: 'rv-tab-jp', us: 'rv-tab-us', tw: 'rv-tab-tw', cn: 'rv-tab-cn' };
const VIEW = { all: { id: 'rv-s-all', cls: 'rv-x-all', tab: 'rv-st-all' }, ios: { id: 'rv-s-ios', cls: 'rv-x-ios', tab: 'rv-st-ios' }, android: { id: 'rv-s-and', cls: 'rv-x-and', tab: 'rv-st-and' } };
const CURVE_CLASS = { ios: 'rv-c-ios', android: 'rv-c-and' };
const DAY_MS = 86400000;
const addDays = (date, n) => new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
// Request-time CPU is capped (Workers Free 10 ms): the 183-day date sequences and month labels are built once per isolate.
const sequences = new Map();
function dateSeq(d0, n) {
  let seq = sequences.get(d0);
  if (!seq || seq.length < n) { seq = Array.from({ length: n }, (_, i) => addDays(d0, i)); sequences.set(d0, seq); }
  return seq;
}
const labels = new Map();
const memo = (kind, value, make) => {
  const key = `${currentEdition().code}|${kind}|${value}`;
  let out = labels.get(key);
  if (out === undefined) { out = make(value); labels.set(key, out); }
  return out;
};
const monthLabel = (date) => memo('m', date.slice(0, 7), (m) => C.esc(formatDate(`${m}-01`, { month: 'short' })));
const yearMonth = (m) => memo('ym', m, formatYearMonth);
const dayShort = (d) => memo('ds', d, (x) => C.esc(formatMonthDay(x, true)));
const dayLong = (d) => memo('dl', d, formatDay);
const storeName = (store) => (store === 'all' ? t('rev.store_all') : t(STORE_KEYS[store]));
const marketName = (market) => t(MARKET_KEYS[market]);
// x labels at month starts only (the partial first month stays unlabeled so labels never collide)
const monthTick = (date) => (date.endsWith('-01') ? monthLabel(date) : null);
const weekTick = (rows) => (d, i) => (i > 0 && d.slice(5, 7) !== rows[i - 1].date.slice(5, 7) ? monthLabel(d) : null);

// ---------- series of one view (a store, or both stores summed) ----------
// Row cells [q10, q50, q90] → q, or null for a hidden day/period (three nulls in the page data).
const qOf = (cells) => (cells[0] == null ? null : cells);
function storeSeries(store, p) {
  // New games: the last 30 days only (their history is a few days at the right edge of the 6-month window).
  const l = p.l || null;
  const from = l && l.nw ? Math.max(0, p.d.length - 30) : 0;
  const all = dateSeq(p.d0, p.d.length);
  const dates = from ? all.slice(from) : all;
  const rows = from ? p.d.slice(from) : p.d;
  const daily = rows.map((r, i) => ({ date: dates[i], q: qOf(r.slice(1)) }));
  const rank = rows.map((r) => r[0]);
  // Days before revenue_from: no revenue (shaded and labelled pre-release / pre-chart on the daily charts).
  const preN = l ? dates.slice(0, rows.length).filter((d) => d < l.rf).length : 0;
  return {
    nw: Boolean(l && l.nw),
    pre: preN ? { n: preN, label: t(l.bf === 'r' ? 'rev.pre_release' : 'rev.pre_chart') } : null,
    daily,
    ranks: [{ store, values: rank }],
    weekly: p.w.map((r) => ({ date: r[0], q: qOf(r.slice(1)) })),
    monthly: p.mo.map((r) => ({ month: r[0], q: qOf(r.slice(1)) })),
    mtd: p.mtd && p.mtd.d.length ? { month: p.mtd.m, through: p.mtd.th, total: p.mtd.t, days: p.mtd.d.map((r) => ({ date: r[0], q: qOf(r.slice(2)) })) } : null,
  };
}
// q null = hidden by the producer (rank band with tier hidden); a sum with a hidden part is hidden too.
const add = (a, b) => (a && b ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : null);
const medians = (rows) => rows.filter((r) => r.q).map((r) => r.q[1]);
const hiddenCells = () => `<td class="r" colspan="2"><small>${t('rev.bands_hidden')}</small></td>`;
// Sum by key; only keys both stores have. Adding the bounds assumes the stores move together, so the range is wide.
function sumBy(a, b, key) {
  const other = new Map(b.map((r) => [r[key], r]));
  return a.filter((r) => other.has(r[key])).map((r) => ({ ...r, q: add(r.q, other.get(r[key]).q) }));
}
function combined(a, b) {
  const mtd = a.mtd && b.mtd && a.mtd.month === b.mtd.month
    ? { month: a.mtd.month, through: a.mtd.through < b.mtd.through ? a.mtd.through : b.mtd.through, total: add(a.mtd.total, b.mtd.total), days: sumBy(a.mtd.days, b.mtd.days, 'date') }
    : null;
  const daily = sumBy(a.daily, b.daily, 'date');
  const dates = new Set(daily.map((d) => d.date));
  const align = (s) => ({ store: s.ranks[0].store, values: s.daily.map((d, i) => (dates.has(d.date) ? s.ranks[0].values[i] : undefined)).filter((v) => v !== undefined) });
  // The later anchor of the two stores bounds the summed days.
  const pre = [a, b].map((s) => s.pre && { ...s.pre, n: s.pre.n - (s.daily.length - daily.length) }).filter((x) => x && x.n > 0).sort((x, y) => y.n - x.n)[0] || null;
  return { nw: a.nw || b.nw, pre, daily, ranks: [align(a), align(b)], weekly: sumBy(a.weekly, b.weekly, 'date'), monthly: sumBy(a.monthly, b.monthly, 'month'), mtd };
}
// Average daily rank of each week (ranks on the weekly chart).
// Average daily rank of each week (ranks on the weekly chart). Daily rows are consecutive, so a week is an index range.
function weeklyRanks(series) {
  const base = series.daily.length ? Date.parse(series.daily[0].date) : 0;
  const starts = series.weekly.map((w) => Math.round((Date.parse(w.date) - base) / DAY_MS));
  return series.ranks.map((r) => ({ store: r.store, values: starts.map((start) => {
    let sum = 0, n = 0;
    for (let i = Math.max(0, start); i < start + 7 && i < r.values.length; i++) if (r.values[i] != null) { sum += r.values[i]; n++; }
    return n ? Math.round(sum / n) : null;
  }) }));
}

// ---------- blocks ----------
const small = (text) => `<p class="rv-small">${text}</p>`;
const block = (cls, body) => `<div class="rv-block ${cls}">${body}</div>`;

function trendBlock(series, view, ctx) {
  const { cur, market, asofMonth } = ctx;
  const parts = [];
  const complete = series.monthly.filter((m) => m.month < asofMonth);
  const last = complete[complete.length - 1];
  if (last) {
    const eyebrow = `<span class="rv-eyebrow">${t('rev.headline_ctx', { month: yearMonth(last.month), store: storeName(view) })}</span>`;
    parts.push(last.q
      ? `<div class="rv-head">${eyebrow}<p class="rv-big">${t('rev.monthly_headline', { range: `<b>${C.rangeHtml(last.q[0], last.q[2], cur)}</b>`, mid: `<b>${C.moneyHtml(last.q[1], cur)}</b>` })}</p>${small(t('rev.monthly_note'))}</div>`
      : `<div class="rv-head">${eyebrow}${small(t('rev.period_hidden'))}</div>`);
  }
  const rankLegend = series.ranks.filter((r) => r.values.some((v) => v != null)).map((r) => [`rv-sw-rank ${r.store === 'ios' ? 'rv-rank-ios' : 'rv-rank-and'}`, t('rev.legend_rank', { store: t(STORE_KEYS[r.store]) })]);
  const legend = C.legend([['rv-sw-band', t('rev.legend_band')], ['rv-sw-med', t('rev.legend_median')], ...rankLegend]);
  const aria = (rows, ranks, period) => {
    const med = medians(rows);
    const best = Math.min(...ranks.flatMap((r) => r.values.filter((v) => v != null)));
    return t('rev.chart_aria', { market: marketName(market), store: storeName(view), period, lo: C.money(Math.min(...med), cur.c, 2), hi: C.money(Math.max(...med), cur.c, 2), rank: Number.isFinite(best) ? t('rev.chart_aria_rank', { best: C.rankText(best) }) : '' });
  };
  const charts = [];
  if (series.nw) parts.push(`<div class="rv-head"><span class="rv-tag rv-new">${t('rev.new_unverified')}</span>${small(t('rev.new_note'))}</div>`);
  if (medians(series.daily).length) charts.push(`<div class="rv-pd">${C.rangeChart({ rows: series.daily, ranks: series.ranks, cur, pre: series.pre, tick: series.nw ? (d, i) => ((series.daily.length - 1 - i) % 7 === 0 ? dayShort(d) : null) : monthTick, aria: aria(series.daily, series.ranks, t('rev.daily')) })}</div>`);
  if (medians(series.weekly).length) {
    const ranks = weeklyRanks(series);
    charts.push(`<div class="rv-pw">${C.rangeChart({ rows: series.weekly, ranks, cur, tick: weekTick(series.weekly), aria: aria(series.weekly, ranks, t('rev.weekly')) })}</div>`);
  }
  if (charts.length) {
    const toggle = charts.length === 2 ? `<div class="rv-seg rv-period"><label for="rv-p-d" class="rv-pl-d">${t('rev.daily')}</label><label for="rv-p-w" class="rv-pl-w">${t('rev.weekly')}</label></div>` : '';
    parts.push(`<div class="rv-chartbox${charts.length === 2 ? '' : ' rv-single'}">${toggle}${charts.join('')}${legend}</div>`);
  }
  if (series.monthly.length) {
    const rows = series.monthly.slice().reverse().map((m) => `<tr><td>${yearMonth(m.month)}${m.month >= asofMonth ? ` <span class="rv-tag">${t('rev.in_progress')}</span>` : ''}</td>${m.q ? `<td class="r"><b>${C.moneyHtml(m.q[1], cur)}</b></td><td class="r">${C.rangeHtml(m.q[0], m.q[2], cur)}</td>` : hiddenCells()}</tr>`).join('');
    parts.push(`<div class="rv-sub"><h4>${t('rev.months_title')}</h4><table class="rk-table rv-table"><thead><tr><th>${t('rev.col_month')}</th><th class="r">${t('rev.col_median')}</th><th class="r">${t('rev.col_range')}</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  } else if (series.nw) parts.push(`<div class="rv-sub"><h4>${t('rev.months_title')}</h4>${small(t('rev.totals_pending'))}</div>`);
  if (view === 'all') parts.push(small(t('rev.combined_note')));
  return parts.join('');
}

function mtdBlock(series, ctx) {
  const m = series.mtd;
  if (!m) return '';
  const { cur } = ctx;
  const n = m.days.length;
  const title = `<h4>${t('rev.mtd_title')} <small>${yearMonth(m.month)}</small></h4>`;
  if (!m.total && !series.nw) return `<div class="rv-sub rv-mtd">${title}${small(t('rev.period_hidden'))}</div>`;
  // New games: the day bars from their first top-200 day, the total withheld until NEW_DAYS days.
  const pre = series.pre && series.daily[series.pre.n] && m.days.filter((d) => d.date < series.daily[series.pre.n].date).length;
  const chart = m.days.some((d) => d.q) ? C.barsChart({ days: m.days, cur, pre: pre ? { n: pre, label: series.pre.label } : null, aria: t('rev.mtd_aria', { from: dayLong(`${m.month}-01`), to: dayLong(m.through) }), tick: (d, i) => (i === 0 || i === n - 1 || (n > 10 && i === Math.floor((n - 1) / 2)) ? dayShort(d) : null) }) : '';
  const head = m.total ? `<p class="rv-mid">${t('rev.mtd_headline', { range: `<b>${C.rangeHtml(m.total[0], m.total[2], cur)}</b>` })}</p>${small(t('rev.mtd_note'))}` : small(t('rev.totals_pending'));
  return `<div class="rv-sub rv-mtd">${title}${head}${chart}</div>`;
}

function outlookBlock(store, p, ctx) {
  const o = p.o;
  if (!o) return '';
  const r10 = o.d.map((d) => d[1]).filter((v) => v != null);
  const r90 = o.d.map((d) => d[5]);
  const lo = r10.length ? C.rankText(Math.min(...r10)) : t('rev.off_chart');
  const hi = r90.some((v) => v == null) ? t('rev.off_chart') : C.rankText(Math.max(...r90));
  const ranks = lo === hi ? lo : `${lo}–${hi}`;
  const dates = dateSeq(p.d0, p.d.length);
  const history = p.d.slice(-30).map((r, i) => ({ date: dates[p.d.length - Math.min(30, p.d.length) + i], rank: r[0] }));
  const pMax = Math.max(...o.d.map((d) => d[6]));
  const chart = C.fanChart({ history, days: o.d, label: (d) => dayShort(d), aria: t('rev.outlook_aria', { store: t(STORE_KEYS[store]), ranks }) });
  const legend = C.legend([['rv-sw-fan80', t('rev.legend_fan80')], ['rv-sw-fan50', t('rev.legend_fan50')], ['rv-sw-fanmed', t('rev.legend_fan_median')], ['rv-sw-hist', t('rev.legend_history')]]);
  // New games: rank fan only, labelled; no revenue total.
  const nw = Boolean(p.l && p.l.nw);
  const headline = nw
    ? t('rev.outlook_headline_rank', { ranks: `<b>${ranks}</b>` })
    : t('rev.outlook_headline', { ranks: `<b>${ranks}</b>`, range: `<b>${o.t ? C.rangeHtml(o.t[0], o.t[2], ctx.cur) : t('rev.bands_hidden')}</b>` });
  const tag = nw ? ` <span class="rv-tag rv-new">${t('rev.new_tag')}</span>` : '';
  return block(`rv-x ${VIEW[store].cls} ${VIEW.all.cls} rv-outlook`, `<h4>${t('rev.outlook_title')} <span class="rv-beta">${t('rev.beta')}</span>${tag} <small>${t(STORE_KEYS[store])}</small></h4><p class="rv-mid">${headline}</p>${small(t(nw ? 'rev.outlook_new_note' : 'rev.outlook_note'))}${chart}${legend}${pMax >= 0.005 ? small(t('rev.below_chart', { p: C.percent(pMax) })) : ''}`);
}

function positionBlock(store, p, ctx) {
  const pos = p.p;
  if (!pos) return '';
  const decay = pos.dc && ctx.curves[pos.dc];
  const launch = pos.lr && ctx.curves[pos.lr];
  if (!decay && !launch) return '';
  const { basis, market, cur } = ctx;
  const genre = C.subgenreName((decay || launch).genre);
  const parts = [];
  if (decay && decay.md > 0) {
    parts.push(`<p class="rv-mid">${t('rev.decay_sentence', { genre: C.esc(genre), pct: Math.round(decay.md * 100), n: formatNumber(decay.n) })}</p>`);
    if (basis && basis.y && basis.m && basis.f) parts.push(small(t('rev.decay_note', { year: basis.y, months: basis.m, floor: basis.f })));
  }
  // Launch-cohort games only: their first 30 chart days are their launch (other games' history is left-truncated).
  if (pos.lx != null && pos.rf != null) parts.push(`<p class="rv-text">${t('rev.position_now', { days: formatNumber(pos.lx), pct: C.percent(pos.rf) })}</p>`);
  const caption = (c) => t('rev.curve_caption', { genre: C.esc(genre), market: marketName(market), store: t(STORE_KEYS[c.store] || 'rev.store_all'), n: formatNumber(c.n) });
  const fig = (c, title, unit, marker) => `<figure class="rv-fig"><figcaption><b>${title}</b><span>${caption(c)}</span></figcaption>${C.curveChart({ series: [{ cls: CURVE_CLASS[store], points: c.points }], marker, unit: c.unit, xLabel: unit, aria: t('rev.curve_aria', { genre, n: c.n }) })}${C.legend([[`rv-sw-curve ${CURVE_CLASS[store]}`, t('rev.genre_avg')], ...(marker ? [['rv-sw-dot', t('rev.this_game')]] : [])])}</figure>`;
  // Launch marker: this game's latest daily median in USD at its day since chart entry.
  const lastDay = p.d && p.d.length ? p.d[p.d.length - 1] : null;
  const usdNow = lastDay && lastDay[2] != null && cur.fx ? (cur.c === 'USD' ? lastDay[2] : lastDay[2] * cur.fx) : null;
  const figs = [
    decay ? fig(decay, t('rev.decay_chart'), (n) => t('rev.x_months', { n }), pos.dx != null && pos.rf != null ? { x: pos.dx, v: pos.rf } : null) : '',
    launch ? fig(launch, t('rev.launch_chart'), (n) => t('rev.x_days', { n }), pos.lx != null && usdNow != null ? { x: pos.lx, v: usdNow } : null) : '',
  ].filter(Boolean);
  parts.push(`<div class="rv-figs${figs.length > 1 ? ' rv-figs2' : ''}">${figs.join('')}</div>`);
  return block(`rv-x ${VIEW[store].cls} ${VIEW.all.cls} rv-position`, `<h4>${t('rev.position_title')} <small>${t(STORE_KEYS[store])}</small></h4>${parts.join('')}`);
}

// ---------- downloads ----------
// Per-market download estimate (payload `de`) when the bundle has one; otherwise the fallback indicators:
// Google Play worldwide install bucket and the App Store rating count of this storefront.
function downloadSeries(p) {
  const dates = dateSeq(p.d0, p.d.length);
  return { tier: p.t, daily: p.d.map((q, i) => ({ date: dates[i], q })), weekly: p.w.map((r) => ({ date: r[0], q: qOf(r.slice(1)) })), monthly: p.mo.map((r) => ({ month: r[0], q: qOf(r.slice(1)) })) };
}
// Evidence tiers (downloads_est.tier), least to most uncertain: verified (plain range), partial_store (CN Android, one
// store only), unverified and assumption (badge + lighter band). Two stores are summed only when both cover the whole
// store; the sum takes the less certain tier.
const DL_TIERS = ['verified', 'partial_store', 'unverified', 'assumption'];
const DL_WEAK = new Set(['unverified', 'assumption']);
const combinable = (a, b) => a.tier !== 'partial_store' && b.tier !== 'partial_store';
const combinedDownloads = (a, b) => ({ tier: DL_TIERS[Math.max(DL_TIERS.indexOf(a.tier), DL_TIERS.indexOf(b.tier))], daily: sumBy(a.daily, b.daily, 'date'), weekly: sumBy(a.weekly, b.weekly, 'date'), monthly: sumBy(a.monthly, b.monthly, 'month') });
const tierBadge = (tier) => (tier === 'verified' ? '' : `<span class="rv-tag rv-dl-tier rv-dl-tier-${tier}">${t(`rev.dl_tier_${tier}`)}</span>`);

function downloadView(series, view, ctx) {
  const { market, asofMonth } = ctx;
  const parts = [];
  const badge = tierBadge(series.tier);
  const last = series.monthly.filter((m) => m.month < asofMonth).pop();
  if (last && last.q) parts.push(`<div class="rv-head">${badge ? `<p class="rv-badges">${badge}</p>` : ''}<span class="rv-eyebrow">${t('rev.headline_ctx', { month: yearMonth(last.month), store: storeName(view) })}</span><p class="rv-mid">${t('rev.dl_monthly_headline', { range: `<b>${C.countRange(last.q[0], last.q[2])}</b>`, mid: `<b>${C.count(last.q[1])}</b>` })}</p>${small(t(`rev.dl_note_${series.tier}`))}</div>`);
  else parts.push(`<div class="rv-head">${badge ? `<p class="rv-badges">${badge}</p>` : ''}${small(t(`rev.dl_note_${series.tier}`))}</div>`);
  const label = (v) => C.count(v, 2);
  const aria = (rows, period) => { const med = medians(rows); return t('rev.dl_chart_aria', { market: marketName(market), store: storeName(view), period, lo: C.count(Math.min(...med), 2), hi: C.count(Math.max(...med), 2) }); };
  const charts = [];
  if (medians(series.daily).length) charts.push(`<div class="rv-pd">${C.rangeChart({ rows: series.daily, label, tick: monthTick, aria: aria(series.daily, t('rev.daily')) })}</div>`);
  if (medians(series.weekly).length) charts.push(`<div class="rv-pw">${C.rangeChart({ rows: series.weekly, label, tick: weekTick(series.weekly), aria: aria(series.weekly, t('rev.weekly')) })}</div>`);
  if (charts.length) {
    const both = charts.length === 2;
    const toggle = both ? `<div class="rv-seg rv-period"><label for="rv-p-d" class="rv-pl-d">${t('rev.daily')}</label><label for="rv-p-w" class="rv-pl-w">${t('rev.weekly')}</label></div>` : '';
    parts.push(`<div class="rv-chartbox${both ? '' : ' rv-single'}${DL_WEAK.has(series.tier) ? ' rv-weak' : ''}">${toggle}${charts.join('')}${C.legend([['rv-sw-band', t('rev.legend_band')], ['rv-sw-med', t('rev.legend_median')]])}</div>`);
  }
  if (series.monthly.length) {
    const rows = series.monthly.slice().reverse().map((m) => `<tr><td>${yearMonth(m.month)}${m.month >= asofMonth ? ` <span class="rv-tag">${t('rev.in_progress')}</span>` : ''}</td>${m.q ? `<td class="r"><b>${C.count(m.q[1])}</b></td><td class="r">${C.countRange(m.q[0], m.q[2])}</td>` : hiddenCells()}</tr>`).join('');
    parts.push(`<div class="rv-sub"><h4>${t('rev.dl_months_title')}</h4><table class="rk-table rv-table"><thead><tr><th>${t('rev.col_month')}</th><th class="r">${t('rev.col_median')}</th><th class="r">${t('rev.col_range')}</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  return parts.join('');
}

function fallbackItem(store, dl, market) {
  if (store === 'android') {
    const play = dl && C.playBucket(dl.p);
    return play ? `<div class="rv-dl-item"><span class="rv-eyebrow">${t('stats.google_play')}</span><p class="rv-mid"><b>${t('rev.dl_play', { n: play })}</b></p>${small(t('rev.dl_play_note'))}</div>` : '';
  }
  const ratings = dl && dl.r && dl.r[market];
  return ratings != null ? `<div class="rv-dl-item"><span class="rv-eyebrow">${t('stats.app_store')} · ${marketName(market)}</span><p class="rv-mid"><b>${t('rev.dl_ios', { n: formatNumber(ratings) })}</b></p>${small(t('rev.dl_ios_note'))}</div>` : '';
}

// New games: the site's free (popular) chart rank of this storefront, latest and best since release / chart entry.
function freeItem(store, p, market) {
  const fr = p && p.fr;
  if (!fr) return '';
  const now = fr.r != null ? C.rankText(fr.r) : t('rev.off_chart');
  return `<div class="rv-dl-item"><span class="rv-eyebrow">${t(STORE_KEYS[store])} · ${marketName(market)}</span><p class="rv-mid"><b>${t('rev.free_rank', { rank: now })}</b>${fr.b != null ? ` <small>${t('rev.free_best', { rank: C.rankText(fr.b) })}</small>` : ''}</p></div>`;
}

// Store without a usable estimate (none, a non-display tier, or hidden): "not available" with its reason.
function noEstimateItem(store, p, market) {
  const why = p && p.de && p.de.t === 'hidden' ? 'rev.dl_hidden' : 'rev.dl_none_note';
  return `<div class="rv-dl-item rv-dl-none"><span class="rv-eyebrow">${t(STORE_KEYS[store])} · ${marketName(market)}</span><p class="rv-mid"><b>${t('rev.dl_none')}</b></p>${small(t(why))}</div>`;
}

// Per store: the per-market estimate (tier-labelled) or "not available", then the cumulative fallbacks
// (Play install bucket, App Store rating count) and the free-chart rank, which stay in every case.
function downloadsBlock(dl, market, data, ctx) {
  const all = ['ios', 'android'];
  const stores = all.filter((s) => data.s[s]);
  const est = Object.fromEntries(stores.filter((s) => data.s[s].de && data.s[s].de.t !== 'hidden').map((s) => [s, downloadSeries(data.s[s].de)]));
  const extras = (list) => { const items = list.map((s) => fallbackItem(s, dl, market) + freeItem(s, data.s[s], market)).filter(Boolean); return items.length ? `<div class="rv-dl-grid">${items.join('')}</div>` : ''; };
  const content = (list) => {
    const missing = list.filter((s) => !est[s]).map((s) => noEstimateItem(s, data.s[s], market));
    const views = list.length === 2 && est.ios && est.android && combinable(est.ios, est.android)
      ? downloadView(combinedDownloads(est.ios, est.android), 'all', ctx)
      : list.filter((s) => est[s]).map((s) => `${list.length > 1 ? `<span class="rv-eyebrow">${t(STORE_KEYS[s])}</span>` : ''}${downloadView(est[s], s, ctx)}`).join('');
    return `${views}${missing.length ? `<div class="rv-dl-grid">${missing.join('')}</div>` : ''}${extras(list)}`;
  };
  const views = [];
  if (!stores.length) {
    // No record in this market: the fallback indicators for every view.
    const items = all.map((s) => fallbackItem(s, dl, market)).filter(Boolean);
    if (items.length) views.push(`<div class="rv-dl-grid">${items.join('')}</div>`);
  } else {
    for (const s of stores) views.push(`<div class="rv-x ${VIEW[s].cls}${stores.length === 1 ? ` ${VIEW.all.cls}` : ''}">${content([s])}</div>`);
    if (stores.length === 2) views.push(`<div class="rv-x ${VIEW.all.cls}">${content(stores)}</div>`);
  }
  return views.length ? block('rv-dl', `<h4>${t('rev.dl_title')}</h4>${views.join('')}`) : '';
}

// Age badge: iOS "day n since release" (store release date), otherwise "day n on the chart" (first chart day; never
// "release" for Google Play). Day 1 = the anchor day. Shown while the anchor lies inside the daily window; not for
// histories censored at collection start (the count would be a lower bound).
function ageBadge(store, p, asof) {
  const l = p && p.l;
  if (!l) return '';
  const release = l.b === 'r';
  const anchor = release ? l.rf : l.fc || l.rf;
  if ((!release && l.cz) || anchor < p.d0) return '';
  const n = formatNumber(Math.round((Date.parse(asof) - Date.parse(anchor)) / DAY_MS) + 1);
  const tip = release ? '' : ` title="${C.esc(t('rev.age_chart_tip'))}"`;
  return `<span class="rv-tag rv-age"${tip}>${t(STORE_KEYS[store])} · ${t(release ? 'rev.age_release' : 'rev.age_chart', { n })}</span>`;
}
const badges = (stores, data, asof) => { const html = stores.map((s) => ageBadge(s, data.s[s], asof)).join(''); return html ? `<p class="rv-badges">${html}</p>` : ''; };

function marketPanel(market, data, rev, ctx, options) {
  const stores = ['ios', 'android'].filter((s) => data.s[s]);
  const visible = stores.filter((s) => data.s[s].t !== 'hidden');
  const mctx = { ...ctx, market, cur: { c: data.c, fx: data.fx } };
  const views = [];
  const series = {};
  for (const store of visible) series[store] = storeSeries(store, data.s[store]);
  // Store views (also shown for 'both' when the market has a single store).
  for (const store of stores) {
    const classes = `rv-x ${VIEW[store].cls}${stores.length === 1 ? ` ${VIEW.all.cls}` : ''}`;
    views.push(block(classes, data.s[store].t === 'hidden' ? small(t('rev.hidden')) : badges([store], data, rev.a) + trendBlock(series[store], store, mctx) + mtdBlock(series[store], mctx)));
  }
  if (stores.length === 2) {
    const both = visible.length === 2 ? combined(series.ios, series.android) : null;
    views.push(block(`rv-x ${VIEW.all.cls}`, both ? badges(stores, data, rev.a) + trendBlock(both, 'all', mctx) + mtdBlock(both, mctx) : small(t('rev.combined_hidden'))));
  }
  for (const store of options.filter((o) => o !== 'all' && !stores.includes(o))) views.push(block(`rv-x ${VIEW[store].cls}`, small(t('rev.no_store'))));
  const outlook = visible.map((s) => outlookBlock(s, data.s[s], mctx)).join('');
  const position = visible.map((s) => positionBlock(s, data.s[s], mctx)).join('');
  return `<div class="rv-mp ${MARKET_PANEL[market]}"${C.hasUsd(mctx.cur) ? ` data-fx="${mctx.cur.fx}"` : ''}>${views.join('')}${outlook}${position}${downloadsBlock(rev.dl, market, data, mctx)}</div>`;
}

function renderRevenueSection(rev) {
  if (!rev || !rev.m) return '';
  const home = currentEdition().country;
  const markets = [home, ...MARKETS.filter((m) => m !== home)].filter((m) => rev.m[m]);
  if (!markets.length) return '';
  const storesAt = (m) => ['ios', 'android'].filter((s) => rev.m[m].s[s]);
  const anyStore = new Set(markets.flatMap(storesAt));
  const options = [...(markets.some((m) => storesAt(m).length === 2) ? ['all'] : []), ...['ios', 'android'].filter((s) => anyStore.has(s))];
  const ctx = { asofMonth: String(rev.a).slice(0, 7), basis: rev.b, curves: rev.cv || {} };
  const panels = markets.map((m) => marketPanel(m, rev.m[m], rev, ctx, options));
  const usd = markets.some((m) => C.hasUsd({ c: rev.m[m].c, fx: rev.m[m].fx }) && storesAt(m).some((s) => rev.m[m].s[s].t !== 'hidden'));
  const defaultStore = options[0];
  const inputs = [
    ...markets.map((m, i) => `<input type="radio" name="rv-m" id="${MARKET_ID[m]}" class="rv-ctl"${i === 0 ? ' checked' : ''} aria-label="${C.esc(marketName(m))}">`),
    ...options.map((o) => `<input type="radio" name="rv-s" id="${VIEW[o].id}" class="rv-ctl"${o === defaultStore ? ' checked' : ''} aria-label="${C.esc(storeName(o))}">`),
    '<input type="radio" name="rv-p" id="rv-p-d" class="rv-ctl" checked>', '<input type="radio" name="rv-p" id="rv-p-w" class="rv-ctl">',
    usd ? '<input type="checkbox" id="rv-usd" class="rv-ctl">' : '',
  ].join('');
  const tabs = `<div class="rv-tabs" role="group" aria-label="${t('rev.market_aria')}">${markets.map((m) => `<label for="${MARKET_ID[m]}" class="${MARKET_TAB[m]}">${marketName(m)}</label>`).join('')}</div>`;
  const storeSeg = options.length > 1 ? `<div class="rv-seg rv-stores" role="group" aria-label="${t('rev.store_aria')}">${options.map((o) => `<label for="${VIEW[o].id}" class="${VIEW[o].tab}">${storeName(o)}</label>`).join('')}</div>` : '';
  const usdSwitch = usd ? `<label for="rv-usd" class="rv-usd-switch"><i></i>${t('rev.usd')}</label>` : '';
  return `<div class="home-card grid-full rv-card" id="revenue-estimates">
          <div class="home-card-header"><h2 class="home-card-title">${t('rev.title')} <span class="rv-beta">${t('rev.beta')}</span></h2><span class="rv-asof">${t('rev.asof', { date: dayLong(rev.a) })}</span></div>
          <div class="home-card-body"><div class="rk rv"${usd ? ` data-intl="${currentEdition().intl}"` : ''}>${inputs}${usd ? C.USD_SCRIPT : ''}<div class="rv-body"><div class="rv-bar">${tabs}<div class="rv-bar-r">${storeSeg}${usdSwitch}</div></div>${panels.join('')}</div></div></div>
        </div>`;
}

module.exports = { renderRevenueSection };
