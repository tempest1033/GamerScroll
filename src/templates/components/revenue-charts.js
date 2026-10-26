'use strict';

/**
 * Server-rendered charts and number formats of the revenue estimate sections (game page: revenue-section.js,
 * rank hub / genre pages: revenue-reference.js). Pure (no fs), so it also runs in the Workers bundle.
 *
 * A plot is one stretched SVG (viewBox 1000×300, preserveAspectRatio none, non-scaling strokes from the CSS) with HTML
 * axis labels placed in percent around it: the same markup fits 390 px and desktop and the text keeps its CSS size.
 * Styles: src/styles/81-game-revenue.css (.rv-*).
 */
const { t, has, formatNumber, currentEdition } = require('../../i18n');

const W = 1000, H = 300, TOP = 10;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (v) => Math.round(v * 10) / 10;
const at = (v) => `${f1(v * 100)}%`;
const RANK_CLASS = { ios: 'rv-rank-ios', android: 'rv-rank-and' };

// ---------- numbers ----------
// Compact currency in the edition's locale (ko 만/억, ja 万/億, zh 万/亿·萬/億, en K/M/B). Range ends round outward.
// Formatters cached by a short key (i18n.formatNumber keys its cache by JSON of the options — too slow for the
// few hundred numbers of a section under the Workers CPU limit).
const formatters = new Map();
function nf(kind, currency, digits, roundingMode) {
  const intl = currentEdition().intl;
  const key = `${intl}|${kind}|${currency}|${digits}|${roundingMode}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intl, { ...(kind === 'money' ? { style: 'currency', currency } : {}), notation: 'compact', maximumSignificantDigits: digits, ...(roundingMode ? { roundingMode } : {}) });
    formatters.set(key, f);
  }
  return f;
}
const money = (v, currency, digits = 3, roundingMode) => (v == null ? '-' : nf('money', currency, digits, roundingMode).format(v));
const hasUsd = (cur) => Boolean(cur && cur.fx && cur.c !== 'USD');
// Local currency; with a USD rate the value rides along (data-v, rate in the nearest data-fx) and USD_SCRIPT rewrites the
// text when the reader turns the USD switch on — the server formats each amount once.
const sig3 = (v) => Number(Number(v).toPrecision(3));
function moneyHtml(v, cur, digits = 3) {
  const local = money(v, cur.c, digits);
  return hasUsd(cur) ? `<span class="rv-n" data-v="${sig3(v)}" data-d="${digits}">${local}</span>` : local;
}
const rangeText = (lo, hi, currency) => `${money(lo, currency, 2, 'floor')}–${money(hi, currency, 2, 'ceil')}`;
function rangeHtml(lo, hi, cur) {
  const local = rangeText(lo, hi, cur.c);
  return hasUsd(cur) ? `<span class="rv-n" data-v="${sig3(lo)},${sig3(hi)}">${local}</span>` : local;
}
// Inline once after the controls of a card whose amounts carry data-v; the container has data-intl, panels or cells data-fx
// (USD per local unit). Same compact formats and outward rounding as money()/rangeText().
const USD_SCRIPT = `<script>(function(){var r=document.currentScript.closest('[data-intl]'),c=r&&r.querySelector('#rv-usd');if(!c)return;var L=r.getAttribute('data-intl'),F={};function f(v,d,m){var k=d+(m||'');F[k]=F[k]||new Intl.NumberFormat(L,{style:'currency',currency:'USD',notation:'compact',maximumSignificantDigits:d,roundingMode:m});return F[k].format(v)}c.addEventListener('change',function(){r.querySelectorAll('.rv-n').forEach(function(e){if(e.getAttribute('data-l')===null)e.setAttribute('data-l',e.textContent);if(!c.checked){e.textContent=e.getAttribute('data-l');return}var x=+e.closest('[data-fx]').getAttribute('data-fx'),v=e.getAttribute('data-v').split(',').map(Number);e.textContent=v.length>1?f(v[0]*x,2,'floor')+'\\u2013'+f(v[1]*x,2,'ceil'):f(v[0]*x,+e.getAttribute('data-d')||3)})})})();</script>`;
// Download counts: compact, range ends rounded outward like money.
const count = (v, digits = 3, roundingMode) => (v == null ? '-' : nf('count', '', digits, roundingMode).format(v));
const countRange = (lo, hi) => `${count(lo, 2, 'floor')}–${count(hi, 2, 'ceil')}`;
const percent = (v, digits = 0) => formatNumber(v, { style: 'percent', maximumFractionDigits: digits });
const rankText = (r) => t('rank.rank_number', { p0: r });
// Store subgenre of the bundle ('Role Playing', 'Strategy', … App Store genre ids 7001–7019 / Play categories) in the edition.
const subgenreName = (name) => { const key = `rev.sg_${String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`; return has(key) ? t(key) : String(name || ''); };

// Google Play shows installs as the lower bound of a fixed ladder (1+, 5+, 10+, 50+ … 5,000,000+ …).
const PLAY_LADDER = [1, 5, 10, 50, 100, 500, 1e3, 5e3, 1e4, 5e4, 1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9, 5e9, 1e10];
function playBucket(min) {
  if (!(min >= 1)) return null;
  const step = PLAY_LADDER.filter((v) => v <= min).pop();
  return formatNumber(step, { notation: 'compact', maximumFractionDigits: 0 });
}

// ---------- scales ----------
function niceMax(v) {
  if (!(v > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
}
const RANK_STEPS = [10, 25, 50, 100, 200, 300, 500, 1000];
const niceRank = (v) => RANK_STEPS.find((s) => s >= v) || Math.ceil(v / 500) * 500;

// Path data in whole user units (1/1000 of the plot width ≈ 1 px) with implicit line-tos: the daily charts carry
// 183 points per series, so this keeps the section light.
const pt = (x, y) => `${Math.round(x)} ${Math.round(y)}`;
function line(points) {
  let d = '', open = false;
  for (const p of points) {
    if (!p) { open = false; continue; }
    d += open ? ` ${pt(p[0], p[1])}` : `M${pt(p[0], p[1])}`;
    open = true;
  }
  return d;
}
// Closed area between two curves over the same x values; null values (hidden days) split it into separate pieces.
function area(xs, lo, hi) {
  let d = '', run = [];
  const flush = () => { if (run.length) d += `M${run.map((i) => pt(xs[i], hi[i])).join(' ')} ${run.map((i) => pt(xs[i], lo[i])).reverse().join(' ')}Z`; run = []; };
  xs.forEach((_, i) => { if (lo[i] == null || hi[i] == null) flush(); else run.push(i); });
  flush();
  return d;
}

function plot({ svg, aria, left = [], right = [], bottom = [], marks = '' }) {
  // x labels at either edge align inward so they stay inside the card
  const edge = (cls, v) => (cls !== 'rv-xt' ? cls : v <= 0.02 ? 'rv-xt rv-xt-s' : v >= 0.98 ? 'rv-xt rv-xt-e' : cls);
  const labels = (cls, items, prop) => items.map((i) => `<span class="${edge(cls, i.at)}" style="${prop}:${at(i.at)}">${i.html}</span>`).join('');
  return `<div class="rv-plot${right.length ? ' rv-plot-r' : ''}" role="img" aria-label="${esc(aria)}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${svg}</svg>${labels('rv-yl', left, 'top')}${labels('rv-yr', right, 'top')}${labels('rv-xt', bottom, 'left')}${marks}</div>`;
}
const legend = (items) => `<ul class="rv-legend">${items.map(([cls, label]) => `<li><i class="rv-sw ${cls}"></i>${label}</li>`).join('')}</ul>`;
const grid = (ys) => ys.map((y) => `<line class="rv-grid" x1="0" x2="${W}" y1="${f1(y)}" y2="${f1(y)}"/>`).join('') + `<line class="rv-axis" x1="0" x2="${W}" y1="${H}" y2="${H}"/>`;

/**
 * Revenue range over time: q10–q90 band, median line, ranks on an inverted right axis.
 * rows [{ date, q: [q10, q50, q90] }], ranks [{ store, values: [rank|null] }] aligned with rows, tick(date, i) → label|null,
 * label(v) → y axis text (default: money in `cur`; download charts pass a count format).
 */
// Leading days without revenue (before release / chart entry): a shaded strip [0, xEnd] and its label.
function preShade(xEnd, label) {
  const w = Math.max(0, Math.min(W, xEnd));
  if (!w) return { svg: '', marks: '' };
  return { svg: `<rect class="rv-pre" x="0" y="0" width="${f1(w)}" height="${H}"/>`, marks: `<span class="rv-pre-l" style="width:${at(w / W)}">${esc(label)}</span>` };
}

function rangeChart({ rows, ranks = [], cur, aria, tick, pre = null, label = (v) => moneyHtml(v, cur, 2) }) {
  const n = rows.length;
  const x = (i) => (n < 2 ? W / 2 : (i / (n - 1)) * W);
  const shade = pre ? preShade(x(pre.n - 0.5), pre.label) : { svg: '', marks: '' };
  // r.q null = hidden day/period: a gap in the band and the median
  const max = niceMax(Math.max(...rows.filter((r) => r.q).map((r) => r.q[2])));
  const y = (v) => H - (v / max) * (H - TOP);
  const xs = rows.map((_, i) => x(i));
  let svg = shade.svg + grid([0.25, 0.5, 0.75, 1].map((f) => y(max * f)));
  svg += `<path class="rv-band" d="${area(xs, rows.map((r) => (r.q ? y(r.q[0]) : null)), rows.map((r) => (r.q ? y(r.q[2]) : null)))}"/><path class="rv-med" d="${line(rows.map((r, i) => (r.q ? [x(i), y(r.q[1])] : null)))}"/>`;
  const rankValues = ranks.flatMap((r) => r.values.filter((v) => v != null));
  const rMax = rankValues.length ? niceRank(Math.max(...rankValues)) : null;
  const yr = (r) => TOP + ((r - 1) / (rMax - 1)) * (H - TOP);
  if (rMax) svg += ranks.map((r) => `<path class="rv-rank ${RANK_CLASS[r.store]}" d="${line(r.values.map((v, i) => (v == null ? null : [x(i), yr(v)])))}"/>`).join('');
  return plot({
    svg, aria, marks: shade.marks,
    left: [0, 0.5, 1].map((f) => ({ at: y(max * f) / H, html: label(max * f) })),
    right: rMax ? [1, Math.round(rMax / 2), rMax].map((r) => ({ at: yr(r) / H, html: rankText(r) })) : [],
    bottom: rows.map((r, i) => { const label = tick(r.date, i); return label ? { at: x(i) / W, html: label } : null; }).filter(Boolean),
  });
}

/** Day bars (median) with q10–q90 whiskers. days [{ date, q }], tick(date, i) → label|null. */
function barsChart({ days, cur, aria, tick, pre = null }) {
  const n = days.length, slot = W / n;
  const shade = pre ? preShade(pre.n * slot, pre.label) : { svg: '', marks: '' };
  const max = niceMax(Math.max(...days.filter((d) => d.q).map((d) => d.q[2])));
  const y = (v) => H - (v / max) * (H - TOP);
  // all bars in one path (hidden days, q null, stay empty slots)
  const bw = f1(slot * 0.64);
  const bars = days.map((d, i) => (d.q ? `M${f1(i * slot + slot * 0.18)} ${H}V${Math.round(y(d.q[1]))}h${bw}V${H}Z` : '')).join('');
  const whiskers = days.map((d, i) => (d.q ? `M${f1((i + 0.5) * slot)} ${Math.round(y(d.q[0]))}V${Math.round(y(d.q[2]))}` : '')).join('');
  return plot({
    svg: shade.svg + grid([0.5, 1].map((f) => y(max * f))) + `<path class="rv-mbar" d="${bars}"/><path class="rv-whisk" d="${whiskers}"/>`,
    aria, marks: shade.marks,
    left: [0, 0.5, 1].map((f) => ({ at: y(max * f) / H, html: moneyHtml(max * f, cur, 2) })),
    bottom: days.map((d, i) => { const label = tick(d.date, i); return label ? { at: ((i + 0.5) * slot) / W, html: label } : null; }).filter(Boolean),
  });
}

/**
 * Rank fan: recent actual ranks, then 80% (r10–r90) and 50% (r25–r75) bands and the median for the forecast days.
 * Ranks beyond the axis (or null = below the chart) sit on the bottom edge.
 */
function fanChart({ history, days, aria, label }) {
  const h = history.length, n = h + days.length;
  const x = (i) => (n < 2 ? W / 2 : (i / (n - 1)) * W);
  const seen = [...history.map((d) => d.rank), ...days.flatMap((d) => d.slice(1, 6))].filter((v) => v != null);
  const rMax = niceRank(Math.max(10, ...seen));
  const y = (r) => TOP + ((Math.min(r == null ? rMax : r, rMax) - 1) / (rMax - 1)) * (H - TOP);
  // The fan opens from the last actual rank when there is one.
  const lastActual = h && history[h - 1].rank != null ? history[h - 1].rank : null;
  const start = lastActual != null ? [[h - 1, lastActual, lastActual, lastActual, lastActual, lastActual]] : [];
  const fan = [...start, ...days.map((d, i) => [h + i, ...d.slice(1, 6)])];
  const xs = fan.map((f) => x(f[0]));
  const ticks = [1, Math.round(rMax / 2), rMax];
  let svg = grid(ticks.map((r) => y(r)));
  svg += `<path class="rv-fan80" d="${area(xs, fan.map((f) => y(f[5])), fan.map((f) => y(f[1])))}"/>`;
  svg += `<path class="rv-fan50" d="${area(xs, fan.map((f) => y(f[4])), fan.map((f) => y(f[2])))}"/>`;
  svg += `<path class="rv-fanmed" d="${line(fan.map((f) => [x(f[0]), y(f[3])]))}"/>`;
  if (h) svg += `<path class="rv-hist" d="${line(history.map((d, i) => (d.rank == null ? null : [x(i), y(d.rank)])))}"/><line class="rv-cut" x1="${f1(x(h - 1))}" x2="${f1(x(h - 1))}" y1="0" y2="${H}"/>`;
  const dates = [0, h ? h - 1 : null, n - 1].filter((i, k, a) => i != null && a.indexOf(i) === k);
  const dateAt = (i) => (i < h ? history[i].date : days[i - h][0]);
  return plot({
    svg, aria,
    left: ticks.map((r) => ({ at: y(r) / H, html: rankText(r) })),
    bottom: dates.map((i) => ({ at: x(i) / W, html: label(dateAt(i)) })),
  });
}

/**
 * Genre reference curve(s): series [{ cls, points: [[x, q50, q25, q75]] }] (q25–q75 drawn as a light band),
 * unit 'rel' (relative to the first 30 days, 1 = 100%, with a 100% reference line) or 'usd' (USD per day);
 * optional marker { x, v } for this game (an HTML dot so it stays round), xLabel(n) → axis text.
 */
function curveChart({ series, marker = null, aria, xLabel, unit = 'rel' }) {
  const xMax = Math.max(...series.flatMap((s) => s.points.map((p) => p[0])));
  const inRange = marker && marker.x >= 0 && marker.x <= xMax && marker.v != null;
  const values = series.flatMap((s) => s.points.map((p) => (p[3] != null ? p[3] : p[1])));
  const yMax = niceMax(Math.max(unit === 'rel' ? 1 : 0, ...values, inRange ? marker.v : 0));
  const x = (v) => (v / xMax) * W;
  const y = (v) => H - (v / yMax) * (H - TOP);
  let svg = grid([0.5, 1].map((f) => y(yMax * f))) + (unit === 'rel' ? `<line class="rv-ref" x1="0" x2="${W}" y1="${f1(y(1))}" y2="${f1(y(1))}"/>` : '');
  svg += series.map((s) => (s.points.some((p) => p[2] != null && p[3] != null) ? `<path class="rv-cband ${s.cls}" d="${area(s.points.map((p) => x(p[0])), s.points.map((p) => (p[2] == null ? null : y(p[2]))), s.points.map((p) => (p[3] == null ? null : y(p[3]))))}"/>` : '')).join('');
  svg += series.map((s) => `<path class="rv-curve ${s.cls}" d="${line(s.points.map((p) => [x(p[0]), y(p[1])]))}"/>`).join('');
  const marks = inRange ? `<span class="rv-dot${x(marker.x) / W > 0.55 ? ' rv-dot-l' : ''}" style="left:${at(Math.min(0.98, Math.max(0.02, x(marker.x) / W)))};top:${at(y(marker.v) / H)}"><span>${t('rev.this_game')}</span></span>` : '';
  return plot({
    svg, aria, marks,
    left: [0, 0.5, 1].map((f) => ({ at: y(yMax * f) / H, html: unit === 'rel' ? percent(yMax * f) : money(yMax * f, 'USD', 2) })),
    bottom: [0, xMax / 2, xMax].map((v) => ({ at: x(v) / W, html: xLabel(Math.round(v)) })),
  });
}

module.exports = { esc, money, moneyHtml, rangeHtml, rangeText, hasUsd, USD_SCRIPT, count, countRange, percent, rankText, subgenreName, playBucket, rangeChart, barsChart, fanChart, curveChart, legend };
