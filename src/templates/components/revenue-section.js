'use strict';

/**
 * Game page section 'revenue and download estimates (beta)' from docs/games-data/<slug>.json → `revenue`
 * (shape and source: src/build/service-exports.js). Pure, so it runs in the Workers bundle.
 * Every market × store view is rendered up front; radio buttons and CSS only switch them (src/styles/81-game-revenue.css):
 * market tabs (rv-m-*), store (rv-s-all | rv-s-ios | rv-s-and), daily/weekly (rv-p-d | rv-p-w) and USD (rv-usd).
 * Returns '' without data, so pages of games outside the bundle are unchanged.
 *
 * Request-time CPU (Workers Free: 10 ms per request): the server renders the text (headlines, totals, outlook, drop-out
 * label, download range and tier, past-pattern captions) and, for each chart and table, a placeholder of the same box
 * (deferred). The browser (src/build/revenue-client.js) runs this module on the complete page data (revenue-payload.js)
 * in collect mode and swaps each placeholder for its part. Both runs take the same path, so placeholders and parts match.
 */
const { t, currentEdition, formatDay, formatDate, formatMonthDay, formatYearMonth, formatNumber } = require('../../i18n');
const C = require('./revenue-charts');
const P = require('./revenue-policy');

// Browser half: docs/assets/[<code>/]revenue-section.js, versioned by scripts/build-game-ssr.js (build-time constant).
const CLIENT_VERSION = process.env.RV_CLIENT_VERSION || 'dev';
const clientAsset = () => `/assets/${currentEdition().code === 'en' ? '' : `${currentEdition().code}/`}revenue-section.js?v=${CLIENT_VERSION}`;
// Adds the browser half when the section comes within 1200 px of the viewport (at once without IntersectionObserver).
const clientLoader = () => `<script>(function(){var r=document.currentScript.closest('.rv'),d=0;function go(){if(d)return;d=1;var s=document.createElement('script');s.src='${clientAsset()}';s.async=true;document.head.appendChild(s)}if(!('IntersectionObserver'in window))return go();var o=new IntersectionObserver(function(e){if(e.some(function(x){return x.isIntersecting})){o.disconnect();go()}},{rootMargin:'1200px 0px'});o.observe(r)})();</script>`;

// ---------- deferred parts ----------
// collect / full mode: key → { ph: placeholder html, make: () => part html }. SSR mode (null): placeholders only.
// A part renders whole: parts inside it (a chart in a deferred store view) render in place.
let deferred = null;
let deferredN = 0;
let inPart = false;
function lazy(placeholder, make) {
  if (inPart) return make();
  const key = String(deferredN++);
  const ph = placeholder(` data-rv="${key}"`);
  if (deferred) deferred.set(key, { ph, make: () => { inPart = true; try { return make(); } finally { inPart = false; } } });
  return ph;
}
// A plot keeps its box (.rv-plot: fixed height and margins) while it waits.
const plotBox = (make, right = false) => lazy((attr) => `<div class="rv-plot${right ? ' rv-plot-r' : ''}"${attr}></div>`, make);
// A view block (classes: rv-x + the views it belongs to): rendered when it belongs to the default store view, deferred
// otherwise (the browser fills it before it is first shown).
const viewPart = (classes, ctx, make) => (classes.split(' ').includes(VIEW[ctx.defaultStore].cls)
  ? `<div class="${classes}">${make()}</div>`
  : lazy((attr) => `<div class="${classes}"${attr}></div>`, () => `<div class="${classes}">${make()}</div>`));

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
const { dateSeq } = P;
const labels = new Map();
const memo = (kind, value, make) => {
  const key = `${currentEdition().code}|${kind}|${value}`;
  let out = labels.get(key);
  if (out === undefined) { out = make(value); labels.set(key, out); }
  return out;
};
const monthLabel = (date) => memo('m', date.slice(0, 7), (m) => C.esc(formatDate(`${m}-01`, { month: 'short' })));
const yearMonth = (m) => memo('ym', m, (x) => C.esc(formatYearMonth(x)));
const dayShort = (d) => memo('ds', d, (x) => C.esc(formatMonthDay(x, true)));
// i18n formatters pass non-dates through unchanged: escape their output (page data strings come from the bundle).
const dayLong = (d) => memo('dl', d, (x) => C.esc(formatDay(x)));
const storeName = (store) => (store === 'all' ? t('rev.store_all') : t(STORE_KEYS[store]));
const marketName = (market) => t(MARKET_KEYS[market]);
// x labels at month starts only (the partial first month stays unlabeled so labels never collide)
const monthTick = (date) => (date.endsWith('-01') ? monthLabel(date) : null);
const weekTick = (rows) => (d, i) => (i > 0 && d.slice(5, 7) !== rows[i - 1].date.slice(5, 7) ? monthLabel(d) : null);

// ---------- series of one view (a store, or both stores summed) ----------
// Row cells [q10, q50, q90] → q, or null for a hidden day/period (three nulls in the page data).
const qOf = (cells) => (cells[0] == null ? null : cells);
// Fields computed on first read: the day-level series feed only the charts (deferred parts), so the server render never
// builds them; its layout decisions use the flags (hasDaily, rankStores) taken from the raw rows.
function lazyFields(target, fields) {
  for (const [name, make] of Object.entries(fields)) {
    Object.defineProperty(target, name, { configurable: true, enumerable: true, get() { const value = make(); Object.defineProperty(target, name, { value, enumerable: true }); return value; } });
  }
  return target;
}
// raw = { dates, rows, has(row), rank(row) } of a day series; index i of a ↔ index i + off of b (consecutive days).
const dayOffset = (a, b) => (a.dates.length && b.dates.length ? Math.round((Date.parse(a.dates[0]) - Date.parse(b.dates[0])) / DAY_MS) : 0);
function storeSeries(store, p) {
  // New games: the last 30 days only (their history is a few days at the right edge of the 6-month window).
  const l = p.l || null;
  const from = l && l.nw ? Math.max(0, p.d.length - 30) : 0;
  const all = dateSeq(p.d0, p.d.length);
  const dates = from ? all.slice(from) : all;
  const rows = from ? p.d.slice(from) : p.d;
  // Days before revenue_from: no revenue (shaded and labelled pre-release / pre-chart on the daily charts).
  let preN = 0;
  if (l) for (let i = 0; i < rows.length; i++) if (dates[i] < l.rf) preN++;
  return lazyFields({
    nw: Boolean(l && l.nw),
    pre: preN ? { n: preN, label: t(l.bf === 'r' ? 'rev.pre_release' : 'rev.pre_chart') } : null,
    raw: { dates, rows, has: (r) => r[1] != null, rank: (r) => r[0] },
    hasDaily: rows.some((r) => r[1] != null),
    rankStores: rows.some((r) => r[0] != null) ? [store] : [],
    weekly: p.w.map((r) => ({ date: r[0], q: qOf(r.slice(1)) })),
    monthly: p.mo.map((r) => ({ month: r[0], q: qOf(r.slice(1)) })),
    mtd: p.mtd && p.mtd.d.length ? { month: p.mtd.m, through: p.mtd.th, total: p.mtd.t, days: p.mtd.d.map((r) => ({ date: r[0], q: qOf(r.slice(2)) })) } : null,
  }, {
    daily: () => rows.map((r, i) => ({ date: dates[i], q: qOf(r.slice(1)) })),
    ranks: () => [{ store, values: rows.map((r) => r[0]) }],
  });
}
// Over the days both series have: whether some day has both numbers, and the stores with a rank on such a day.
function overlap(a, b, stores) {
  const off = dayOffset(a.raw, b.raw), ranked = [false, false];
  let has = false;
  for (let i = 0; i < a.raw.rows.length; i++) {
    const rb = b.raw.rows[i + off];
    if (rb === undefined) continue;
    const ra = a.raw.rows[i];
    if (a.raw.has(ra) && b.raw.has(rb)) has = true;
    if (a.raw.rank(ra) != null) ranked[0] = true;
    if (b.raw.rank(rb) != null) ranked[1] = true;
  }
  return { has, rankStores: stores.filter((s, k) => ranked[k]) };
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
  const both = overlap(a, b, ['ios', 'android']);
  const s = lazyFields({ nw: a.nw || b.nw, hasDaily: both.has, rankStores: both.rankStores, weekly: sumBy(a.weekly, b.weekly, 'date'), monthly: sumBy(a.monthly, b.monthly, 'month'), mtd }, {
    daily: () => sumBy(a.daily, b.daily, 'date'),
    ranks: () => {
      const dates = new Set(s.daily.map((d) => d.date));
      const align = (x) => ({ store: x.ranks[0].store, values: x.daily.map((d, i) => (dates.has(d.date) ? x.ranks[0].values[i] : undefined)).filter((v) => v !== undefined) });
      return [align(a), align(b)];
    },
    // The later anchor of the two stores bounds the summed days.
    pre: () => [a, b].map((x) => x.pre && { ...x.pre, n: x.pre.n - (x.daily.length - s.daily.length) }).filter((x) => x && x.n > 0).sort((x, y) => y.n - x.n)[0] || null,
  });
  return s;
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
const hasQ = (r) => Boolean(r.q);
// Month table: the rows (month, in-progress tag, hidden note) are rendered by the server so the table keeps its height;
// the number cells come with the deferred part.
const EMPTY_CELLS = () => '<td class="r"></td><td class="r"></td>';
function monthTable(rows, asofMonth, cells) {
  const table = (attr, fill) => `<table class="rk-table rv-table"${attr}><thead><tr><th>${t('rev.col_month')}</th><th class="r">${t('rev.col_median')}</th><th class="r">${t('rev.col_range')}</th></tr></thead><tbody>${rows.slice().reverse().map((m) => `<tr><td>${yearMonth(m.month)}${m.month >= asofMonth ? ` <span class="rv-tag">${t('rev.in_progress')}</span>` : ''}</td>${m.q ? fill(m) : hiddenCells()}</tr>`).join('')}</tbody></table>`;
  return lazy((attr) => table(attr, EMPTY_CELLS), () => table('', cells));
}

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
  const rankLegend = series.rankStores.map((store) => [`rv-sw-rank ${store === 'ios' ? 'rv-rank-ios' : 'rv-rank-and'}`, t('rev.legend_rank', { store: t(STORE_KEYS[store]) })]);
  const legend = C.legend([['rv-sw-band', t('rev.legend_band')], ['rv-sw-med', t('rev.legend_median')], ...rankLegend]);
  const aria = (rows, ranks, period) => {
    const med = medians(rows);
    const best = Math.min(...ranks.flatMap((r) => r.values.filter((v) => v != null)));
    return t('rev.chart_aria', { market: marketName(market), store: storeName(view), period, lo: C.money(Math.min(...med), cur.c, 2), hi: C.money(Math.max(...med), cur.c, 2), rank: Number.isFinite(best) ? t('rev.chart_aria_rank', { best: C.rankText(best) }) : '' });
  };
  const charts = [];
  if (series.nw) parts.push(`<div class="rv-head"><span class="rv-tag rv-new">${t('rev.new_unverified')}</span>${small(t('rev.new_note'))}</div>`);
  const right = rankLegend.length > 0;
  if (series.hasDaily) charts.push(`<div class="rv-pd">${plotBox(() => C.rangeChart({ rows: series.daily, ranks: series.ranks, cur, pre: series.pre, tick: series.nw ? (d, i) => ((series.daily.length - 1 - i) % 7 === 0 ? dayShort(d) : null) : monthTick, aria: aria(series.daily, series.ranks, t('rev.daily')) }), right)}</div>`);
  if (series.weekly.some(hasQ)) {
    charts.push(`<div class="rv-pw">${plotBox(() => {
      const ranks = weeklyRanks(series);
      return C.rangeChart({ rows: series.weekly, ranks, cur, tick: weekTick(series.weekly), aria: aria(series.weekly, ranks, t('rev.weekly')) });
    }, right)}</div>`);
  }
  if (charts.length) {
    const toggle = charts.length === 2 ? `<div class="rv-seg rv-period"><label for="rv-p-d" class="rv-pl-d">${t('rev.daily')}</label><label for="rv-p-w" class="rv-pl-w">${t('rev.weekly')}</label></div>` : '';
    parts.push(`<div class="rv-chartbox${charts.length === 2 ? '' : ' rv-single'}">${toggle}${charts.join('')}${legend}</div>`);
  }
  if (series.monthly.length) {
    parts.push(`<div class="rv-sub"><h4>${t('rev.months_title')}</h4>${monthTable(series.monthly, asofMonth, (m) => `<td class="r"><b>${C.moneyHtml(m.q[1], cur)}</b></td><td class="r">${C.rangeHtml(m.q[0], m.q[2], cur)}</td>`)}</div>`);
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
  const chart = m.days.some(hasQ) ? plotBox(() => {
    const pre = series.pre && series.daily[series.pre.n] && m.days.filter((d) => d.date < series.daily[series.pre.n].date).length;
    return C.barsChart({ days: m.days, cur, pre: pre ? { n: pre, label: series.pre.label } : null, aria: t('rev.mtd_aria', { from: dayLong(`${m.month}-01`), to: dayLong(m.through) }), tick: (d, i) => (i === 0 || i === n - 1 || (n > 10 && i === Math.floor((n - 1) / 2)) ? dayShort(d) : null) });
  }) : '';
  const head = m.total ? `<p class="rv-mid">${t('rev.mtd_headline', { range: `<b>${C.rangeHtml(m.total[0], m.total[2], cur)}</b>` })}</p>${small(t('rev.mtd_note'))}` : small(t('rev.totals_pending'));
  return `<div class="rv-sub rv-mtd">${title}${head}${chart}</div>`;
}

// Day-14 chance of being outside the top 200 (outlook last row p_out) → label: below POSSIBLE low, below LIKELY possible, else likely.
const P_OUT_LEVELS = { POSSIBLE: 0.3, LIKELY: 0.6 };
const pOutLevel = (p) => (p < P_OUT_LEVELS.POSSIBLE ? 'low' : p < P_OUT_LEVELS.LIKELY ? 'possible' : 'likely');

function outlookBlock(store, p, ctx) {
  const o = p.o;
  // New games: no outlook (a new-release forecast is out of scope; launch_prior did not pass its backtest).
  if (!o || !o.d.length || (p.l && p.l.nw)) return '';
  const r10 = o.d.map((d) => d[1]).filter((v) => v != null);
  const r90 = o.d.map((d) => d[5]);
  const lo = r10.length ? C.rankText(Math.min(...r10)) : t('rev.off_chart');
  const hi = r90.some((v) => v == null) ? t('rev.off_chart') : C.rankText(Math.max(...r90));
  const ranks = lo === hi ? lo : `${lo}–${hi}`;
  const dates = dateSeq(p.d0, p.d.length);
  // Games ranked 51–200 on the cutoff day (o.c, else the day before the first outlook day): the chance of being outside
  // the top 200 on the last outlook day (day 14).
  const ci = dates.indexOf(o.c || addDays(o.d[0][0], -1));
  const atCutoff = ci >= 0 ? p.d[ci][0] : null;
  const end = o.d[o.d.length - 1];
  const pOut = atCutoff != null && atCutoff >= 51 && atCutoff <= 200 && Number.isFinite(end[6]) && end[6] >= 0 && end[6] <= 1 ? end[6] : null;
  // No percentage (calibration: low probabilities run 2–4× too high): a 3-level label from P_OUT_LEVELS.
  const pOutLine = pOut == null ? '' : `<p class="rv-text">${t('rev.p_out', { days: formatNumber(o.d.length), date: dayLong(end[0]), p: `<b>${t(`rev.p_out_${pOutLevel(pOut)}`)}</b>` })}</p>`;
  // Backtest accuracy only from the bundle's outlook_model; without it no number is shown.
  const method = ctx.om ? small(t('rev.outlook_method', { n: formatNumber(ctx.om.n), pct: C.percent(ctx.om.c) })) : '';
  const chart = plotBox(() => {
    const history = p.d.slice(-30).map((r, i) => ({ date: dates[p.d.length - Math.min(30, p.d.length) + i], rank: r[0] }));
    return C.fanChart({ history, days: o.d, label: (d) => dayShort(d), aria: t('rev.outlook_aria', { store: t(STORE_KEYS[store]), ranks }) });
  });
  const legend = C.legend([['rv-sw-fan80', t('rev.legend_fan80')], ['rv-sw-fan50', t('rev.legend_fan50')], ['rv-sw-fanmed', t('rev.legend_fan_median')], ['rv-sw-hist', t('rev.legend_history')]]);
  const headline = t('rev.outlook_headline', { ranks: `<b>${ranks}</b>`, range: `<b>${o.t ? C.rangeHtml(o.t[0], o.t[2], ctx.cur) : t('rev.bands_hidden')}</b>` });
  return block(`rv-x ${VIEW[store].cls} ${VIEW.all.cls} rv-outlook`, `<h4>${t('rev.outlook_title')} <span class="rv-beta">${t('rev.beta')}</span> <small>${t(STORE_KEYS[store])}</small></h4><p class="rv-mid">${headline}</p>${pOutLine}${small(t('rev.outlook_note'))}${chart}${legend}${method}`);
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
  // The sentence needs a decline that reads as at least 1% a month ("about 0%" says nothing).
  if (decay && Math.round(decay.md * 100) >= 1) {
    parts.push(`<p class="rv-mid">${t('rev.decay_sentence', { genre: C.esc(genre), pct: Math.round(decay.md * 100), n: formatNumber(decay.n) })}</p>`);
    if (basis && basis.y && basis.m && basis.f) parts.push(small(t('rev.decay_note', { year: C.esc(basis.y), months: C.esc(basis.m), floor: C.esc(basis.f) })));
  }
  // Launch-cohort games only: their first 30 chart days are their launch (other games' history is left-truncated).
  if (pos.lx != null && pos.rf != null) parts.push(`<p class="rv-text">${t('rev.position_now', { days: formatNumber(pos.lx), pct: C.percent(pos.rf) })}</p>`);
  const caption = (c) => t('rev.curve_caption', { genre: C.esc(genre), market: marketName(market), store: t(STORE_KEYS[c.store] || 'rev.store_all'), n: formatNumber(c.n) });
  // marker: () => { x, v } of this game, or null.
  const fig = (c, title, unit, marker) => `<figure class="rv-fig"><figcaption><b>${title}</b><span>${caption(c)}</span></figcaption>${plotBox(() => C.curveChart({ series: [{ cls: CURVE_CLASS[store], points: c.points }], marker: marker && marker(), unit: c.unit, xLabel: unit, aria: t('rev.curve_aria', { genre, n: c.n }) }))}${C.legend([[`rv-sw-curve ${CURVE_CLASS[store]}`, t('rev.genre_avg')], ...(marker ? [['rv-sw-dot', t('rev.this_game')]] : [])])}</figure>`;
  // Launch marker: this game's latest daily median in USD at its day since chart entry (a row has all quantiles or none).
  const lastDay = p.d && p.d.length ? p.d[p.d.length - 1] : null;
  const usdNow = lastDay && lastDay[1] != null && cur.fx ? () => (cur.c === 'USD' ? lastDay[2] : lastDay[2] * cur.fx) : null;
  const figs = [
    decay ? fig(decay, t('rev.decay_chart'), (n) => t('rev.x_months', { n }), pos.dx != null && pos.rf != null ? () => ({ x: pos.dx, v: pos.rf }) : null) : '',
    launch ? fig(launch, t('rev.launch_chart'), (n) => t('rev.x_days', { n }), pos.lx != null && usdNow ? () => ({ x: pos.lx, v: usdNow() }) : null) : '',
  ].filter(Boolean);
  parts.push(`<div class="rv-figs${figs.length > 1 ? ' rv-figs2' : ''}">${figs.join('')}</div>`);
  // Genre curves are past patterns of other games, not a forecast for this one.
  return block(`rv-x ${VIEW[store].cls} ${VIEW.all.cls} rv-position`, `<h4>${t('rev.position_title')} <span class="rv-tag rv-past">${t('rev.past_pattern')}</span> <small>${t(STORE_KEYS[store])}</small></h4>${small(t('rev.past_pattern_note'))}${parts.join('')}`);
}

// ---------- downloads ----------
// Per-market download estimate (payload `de`) when the bundle has one; otherwise the fallback indicators:
// Google Play worldwide install bucket and the App Store rating count of this storefront.
function downloadSeries(p) {
  const dates = dateSeq(p.d0, p.d.length);
  return lazyFields({
    tier: p.t, bases: p.b ? [p.b] : [],
    raw: { dates, rows: p.d, has: (r) => r != null, rank: () => null },
    hasDaily: p.d.some((r) => r != null),
    weekly: p.w.map((r) => ({ date: r[0], q: qOf(r.slice(1)) })), monthly: p.mo.map((r) => ({ month: r[0], q: qOf(r.slice(1)) })),
  }, { daily: () => p.d.map((q, i) => ({ date: dates[i], q })) });
}
// Evidence tiers (downloads_est.tier), least to most uncertain, each with a visible badge: verified, partial_store (part
// of the store's downloads only), unverified and assumption (lighter band). Two stores are summed only when both cover
// the whole store; the sum takes the less certain tier and both bases.
const DL_TIERS = ['verified', 'partial_store', 'unverified', 'assumption'];
const DL_WEAK = new Set(['unverified', 'assumption']);
const DL_BASES = ['free_rank', 'below_free_200'];
const combinable = (a, b) => a.tier !== 'partial_store' && b.tier !== 'partial_store';
const combinedDownloads = (a, b) => lazyFields({ tier: DL_TIERS[Math.max(DL_TIERS.indexOf(a.tier), DL_TIERS.indexOf(b.tier))], bases: [...new Set([...a.bases, ...b.bases])], hasDaily: overlap(a, b, []).has, weekly: sumBy(a.weekly, b.weekly, 'date'), monthly: sumBy(a.monthly, b.monthly, 'month') }, { daily: () => sumBy(a.daily, b.daily, 'date') });
// The assumption label depends on the market: CN iOS has its own level (no CN Google Play to convert from).
const tierKey = (tier, market) => (tier === 'assumption' && market === 'cn' ? 'assumption_cn' : tier);
const tierBadge = (tier, market) => (DL_TIERS.includes(tier) ? `<span class="rv-tag rv-dl-tier rv-dl-tier-${tier}">${t(`rev.dl_tier_${tierKey(tier, market)}`)}</span>` : '');
// Basis of the estimate (localised from the allowlisted code, never the raw bundle string).
const basisLines = (bases) => bases.filter((b) => DL_BASES.includes(b)).map((b) => small(t(`rev.dl_basis_${b}`))).join('');

function downloadView(series, view, ctx) {
  const { market, asofMonth } = ctx;
  const parts = [];
  const badge = tierBadge(series.tier, market);
  const note = small(t(`rev.dl_note_${tierKey(series.tier, market)}`));
  // Units: downloads per day; the month row is the mean per day of that month (dl-v1), shown as such.
  const last = series.monthly.filter((m) => m.month < asofMonth).pop();
  if (last && last.q) parts.push(`<div class="rv-head">${badge ? `<p class="rv-badges">${badge}</p>` : ''}<span class="rv-eyebrow">${t('rev.headline_ctx', { month: yearMonth(last.month), store: storeName(view) })}</span><p class="rv-mid">${t('rev.dl_monthly_headline', { range: `<b>${C.countRange(last.q[0], last.q[2])}</b>`, mid: `<b>${C.count(last.q[1])}</b>` })}</p>${note}${basisLines(series.bases)}</div>`);
  else parts.push(`<div class="rv-head">${badge ? `<p class="rv-badges">${badge}</p>` : ''}${note}${basisLines(series.bases)}</div>`);
  const label = (v) => C.count(v, 2);
  const aria = (rows, period) => { const med = medians(rows); return t('rev.dl_chart_aria', { market: marketName(market), store: storeName(view), period, lo: C.count(Math.min(...med), 2), hi: C.count(Math.max(...med), 2) }); };
  const charts = [];
  if (series.hasDaily) charts.push(`<div class="rv-pd">${plotBox(() => C.rangeChart({ rows: series.daily, label, tick: monthTick, aria: aria(series.daily, t('rev.daily')) }))}</div>`);
  if (series.weekly.some(hasQ)) charts.push(`<div class="rv-pw">${plotBox(() => C.rangeChart({ rows: series.weekly, label, tick: weekTick(series.weekly), aria: aria(series.weekly, t('rev.weekly')) }))}</div>`);
  if (charts.length) {
    const both = charts.length === 2;
    const toggle = both ? `<div class="rv-seg rv-period"><label for="rv-p-d" class="rv-pl-d">${t('rev.daily')}</label><label for="rv-p-w" class="rv-pl-w">${t('rev.weekly')}</label></div>` : '';
    parts.push(`<div class="rv-chartbox${both ? '' : ' rv-single'}${DL_WEAK.has(series.tier) ? ' rv-weak' : ''}">${toggle}${charts.join('')}${C.legend([['rv-sw-band', t('rev.legend_band')], ['rv-sw-med', t('rev.legend_median')]])}${small(t('rev.dl_units'))}</div>`);
  }
  if (series.monthly.length) parts.push(`<div class="rv-sub"><h4>${t('rev.dl_months_title')}</h4>${monthTable(series.monthly, asofMonth, (m) => `<td class="r"><b>${C.count(m.q[1])}</b></td><td class="r">${C.countRange(m.q[0], m.q[2])}</td>`)}</div>`);
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
  const est = Object.fromEntries(stores.filter((s) => P.downloadsShown(data.s[s].de)).map((s) => [s, downloadSeries(data.s[s].de)]));
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
    for (const s of stores) views.push(viewPart(`rv-x ${VIEW[s].cls}${stores.length === 1 ? ` ${VIEW.all.cls}` : ''}`, ctx, () => content([s])));
    if (stores.length === 2) views.push(viewPart(`rv-x ${VIEW.all.cls}`, ctx, () => content(stores)));
  }
  // No Google Play in China: the CN figure covers the App Store only.
  return views.length ? block('rv-dl', `<h4>${t('rev.dl_title')}</h4>${market === 'cn' ? small(t('rev.dl_cn_ios_only')) : ''}${views.join('')}`) : '';
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
  const visible = stores.filter((s) => P.revenueShown(data.s[s].t));
  const mctx = { ...ctx, market, cur: { c: data.c, fx: data.fx } };
  const views = [];
  const series = {};
  for (const store of visible) series[store] = storeSeries(store, data.s[store]);
  // Store views (also shown for 'both' when the market has a single store).
  for (const store of stores) {
    const classes = `rv-block rv-x ${VIEW[store].cls}${stores.length === 1 ? ` ${VIEW.all.cls}` : ''}`;
    views.push(viewPart(classes, ctx, () => (!P.revenueShown(data.s[store].t) ? small(t('rev.hidden')) : badges([store], data, rev.a) + trendBlock(series[store], store, mctx) + mtdBlock(series[store], mctx))));
  }
  if (stores.length === 2) {
    views.push(viewPart(`rv-block rv-x ${VIEW.all.cls}`, ctx, () => {
      const both = visible.length === 2 ? combined(series.ios, series.android) : null;
      return both ? badges(stores, data, rev.a) + trendBlock(both, 'all', mctx) + mtdBlock(both, mctx) : small(t('rev.combined_hidden'));
    }));
  }
  for (const store of options.filter((o) => o !== 'all' && !stores.includes(o))) views.push(block(`rv-x ${VIEW[store].cls}`, small(t('rev.no_store'))));
  const outlook = visible.map((s) => outlookBlock(s, data.s[s], mctx)).join('');
  const position = visible.map((s) => positionBlock(s, data.s[s], mctx)).join('');
  return `<div class="rv-mp ${MARKET_PANEL[market]}"${C.hasUsd(mctx.cur) ? ` data-fx="${mctx.cur.fx}"` : ''}>${views.join('')}${outlook}${position}${downloadsBlock(rev.dl, market, data, mctx)}</div>`;
}

function section(page, slug, loader) {
  if (!page || !page.m) return '';
  // Display allowlists again at render (revenue-policy.js): numbers only for shown tiers, per rank band; the market's own
  // currency only (any other → no revenue numbers there), a numeric USD rate.
  const rev = { ...page, m: Object.fromEntries(Object.entries(page.m).filter(([k]) => MARKETS.includes(k)).map(([k, x]) => {
    const ok = x.c === P.MARKET_CURRENCY[k];
    const fx = typeof x.fx === 'number' && Number.isFinite(x.fx) && x.fx > 0 ? x.fx : null;
    return [k, { c: P.MARKET_CURRENCY[k], fx, s: Object.fromEntries(Object.entries(x.s || {}).map(([s, p]) => {
      const v = P.displayStore(ok ? p : { ...p, t: null });
      if (k === 'cn' && s === 'android') delete v.de; // CN Android downloads are not estimated
      return [s, v];
    })) }];
  })) };
  // Outlook backtest accuracy (page data om): a positive integer cutoff count and a 0–1 share, else none.
  const om = page.om && Number.isInteger(page.om.n) && page.om.n > 0 && Number.isFinite(page.om.c) && page.om.c > 0 && page.om.c <= 1 ? { n: page.om.n, c: page.om.c } : null;
  const home = currentEdition().country;
  const markets = [home, ...MARKETS.filter((m) => m !== home)].filter((m) => rev.m[m]);
  if (!markets.length) return '';
  const storesAt = (m) => ['ios', 'android'].filter((s) => rev.m[m].s[s]);
  const anyStore = new Set(markets.flatMap(storesAt));
  const options = [...(markets.some((m) => storesAt(m).length === 2) ? ['all'] : []), ...['ios', 'android'].filter((s) => anyStore.has(s))];
  const defaultStore = options[0];
  const ctx = { asofMonth: String(rev.a).slice(0, 7), basis: rev.b, curves: rev.cv || {}, om, defaultStore };
  const panels = markets.map((m) => marketPanel(m, rev.m[m], rev, ctx, options));
  const usd = markets.some((m) => C.hasUsd({ c: rev.m[m].c, fx: rev.m[m].fx }) && storesAt(m).some((s) => P.revenueShown(rev.m[m].s[s].t)));
  const inputs = [
    ...markets.map((m, i) => `<input type="radio" name="rv-m" id="${MARKET_ID[m]}" class="rv-ctl"${i === 0 ? ' checked' : ''} aria-label="${C.esc(marketName(m))}">`),
    ...options.map((o) => `<input type="radio" name="rv-s" id="${VIEW[o].id}" class="rv-ctl"${o === defaultStore ? ' checked' : ''} aria-label="${C.esc(storeName(o))}">`),
    '<input type="radio" name="rv-p" id="rv-p-d" class="rv-ctl" checked>', '<input type="radio" name="rv-p" id="rv-p-w" class="rv-ctl">',
    usd ? '<input type="checkbox" id="rv-usd" class="rv-ctl">' : '',
  ].join('');
  const tabs = `<div class="rv-tabs" role="group" aria-label="${t('rev.market_aria')}">${markets.map((m) => `<label for="${MARKET_ID[m]}" class="${MARKET_TAB[m]}">${marketName(m)}</label>`).join('')}</div>`;
  const storeSeg = options.length > 1 ? `<div class="rv-seg rv-stores" role="group" aria-label="${t('rev.store_aria')}">${options.map((o) => `<label for="${VIEW[o].id}" class="${VIEW[o].tab}">${storeName(o)}</label>`).join('')}</div>` : '';
  const usdSwitch = usd ? `<label for="rv-usd" class="rv-usd-switch"><i></i>${t('rev.usd')}</label>` : '';
  // Server render: where the browser half finds the page data, and the payload hash it must match.
  const client = loader ? ` data-rv-src="${C.esc(`/games-data/${encodeURIComponent(slug)}.json`)}" data-rv-h="${C.esc(page.h || '')}"` : '';
  return `<div class="home-card grid-full rv-card" id="revenue-estimates">
          <div class="home-card-header"><h2 class="home-card-title">${t('rev.title')} <span class="rv-beta">${t('rev.beta')}</span></h2><span class="rv-asof">${t('rev.asof', { date: dayLong(rev.a) })}</span></div>
          <div class="home-card-body"><div class="rk rv"${usd ? ` data-intl="${currentEdition().intl}"` : ''}${client}>${inputs}${usd ? C.USD_SCRIPT : ''}${loader ? clientLoader() : ''}<div class="rv-body"><div class="rv-bar">${tabs}<div class="rv-bar-r">${storeSeg}${usdSwitch}</div></div>${panels.join('')}</div></div></div>
        </div>`;
}

/**
 * page: docs/games-data/<slug>.json → revenue (light or complete). Modes:
 *   'ssr' (default)  text + placeholders + the browser loader (slug: the page data file)
 *   'collect'        { html, parts: Map key → { ph, make } } (the browser, on the complete payload)
 *   'full'           text with every part in place, no loader (tests, previews, the browser after a data change)
 */
function renderRevenueSection(page, { slug = '', mode = 'ssr' } = {}) {
  deferredN = 0;
  deferred = mode === 'ssr' ? null : new Map();
  let html, parts;
  try { html = section(page, slug, mode === 'ssr'); parts = deferred; } finally { deferred = null; }
  if (mode === 'collect') return { html, parts };
  if (mode === 'full') for (const part of parts.values()) html = html.replace(part.ph, () => part.make());
  return html;
}

module.exports = { renderRevenueSection };
