'use strict';

/**
 * Display allowlists for the revenue estimate bundle, applied twice: at ingestion (src/build/service-exports.js drops
 * the numbers) and at render (revenue-section.js / revenue-reference.js re-check the page data). Pure, Workers-safe.
 *   revenue numbers   only for tiers beta and wide (the production revenue tiers), per rank band where the record has
 *                     tier_by_band; any other, unknown or missing tier → no numbers ("hidden" note)
 *   download numbers  only for verified, unverified, assumption, partial_store; anything else → "not available"
 */
const REVENUE_TIERS = ['beta', 'wide'];
const DOWNLOAD_TIERS = ['verified', 'unverified', 'assumption', 'partial_store'];
// The only currency per market: a record or band cell with any other currency string is dropped (never rendered).
const MARKET_CURRENCY = { kr: 'KRW', jp: 'JPY', us: 'USD', tw: 'TWD', cn: 'CNY' };
// tier_by_band key of the chart floor: off-chart days (rank null) are estimated at the 181–200 band revenue (genres.json
// caveats), which the bundle's '51-200' band carries. Absent or not shown → those days are masked.
const OFF_CHART_BAND = [51, 200];
const NULL3 = [null, null, null];

const revenueShown = (tier) => REVENUE_TIERS.includes(tier);
const downloadsShown = (de) => Boolean(de && DOWNLOAD_TIERS.includes(de.t));

// tier_by_band { 'lo-hi': tier } → [[lo, hi, tier]] by rank. Missing, non-object, empty or without one valid key → []
// (no band allowed: every number is masked).
function bandTiers(byBand) {
  if (!byBand || typeof byBand !== 'object' || Array.isArray(byBand)) return [];
  return Object.entries(byBand).map(([k, v]) => { const m = /^(\d+)-(\d+)$/.exec(k); return m ? [Number(m[1]), Number(m[2]), v] : null; })
    .filter(Boolean).sort((a, b) => a[0] - b[0]);
}
// Page-data tb → only well-formed [lo, hi, tier] rows; anything else → [] (nothing allowed).
const validTb = (tb) => (Array.isArray(tb) ? tb.filter((b) => Array.isArray(b) && Number.isInteger(b[0]) && Number.isInteger(b[1]) && typeof b[2] === 'string') : []);
// A rank's band must have a shown tier; off-chart days (rank null) use the OFF_CHART_BAND key exactly. A rank outside
// every band, or no bands at all, is not shown.
function bandShown(tb, rank) {
  if (!Array.isArray(tb)) return false;
  const band = rank == null ? tb.find(([lo, hi]) => lo === OFF_CHART_BAND[0] && hi === OFF_CHART_BAND[1]) : tb.find(([lo, hi]) => rank >= lo && rank <= hi);
  return Boolean(band && revenueShown(band[2]));
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Consecutive days from d0, built once per isolate (request-time CPU is capped; most pages share the same d0).
const sequences = new Map();
function dateSeq(d0, n) {
  let seq = sequences.get(d0);
  if (!seq || seq.length < n) { seq = Array.from({ length: n }, (_, i) => addDays(d0, i)); sequences.set(d0, seq); }
  return seq;
}
// rows.map(f), or rows itself when f keeps every row (re-rendered pages are mostly unmasked: no copies).
function remap(rows, f) {
  let out = rows;
  for (let i = 0; i < rows.length; i++) {
    const r = f(rows[i], i);
    if (r !== rows[i]) { if (out === rows) out = rows.slice(); out[i] = r; }
  }
  return out;
}
// Last day of the week starting on `day` (week starts are shared by every page: computed once per isolate).
const weekEnds = new Map();
function weekEnd(day) {
  let end = weekEnds.get(day);
  if (end === undefined) { end = addDays(day, 6); weekEnds.set(day, end); }
  return end;
}
// First index i < n with dates[i] > day (after) or >= day (otherwise); dates ascending ISO strings.
function bound(dates, n, day, after) {
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (after ? dates[mid] <= day : dates[mid] < day) lo = mid + 1; else hi = mid; }
  return lo;
}

// Compact store payload (see service-exports.js compactStore) with per-band tiers tb: days in a band that is not shown
// lose their numbers, and so do the week / month / month-to-date totals containing one, and the 14-day revenue total
// when any outlook median rank falls in such a band. No (valid) bands → every number masked. Idempotent.
function maskBands(p) {
  const tb = validTb(p.tb);
  if (!tb.length) {
    const blank = (r) => [r[0], ...NULL3];
    return {
      ...p, tb,
      d: (p.d || []).map((r) => [r[0], ...NULL3]), w: (p.w || []).map(blank), mo: (p.mo || []).map(blank),
      mtd: p.mtd ? { ...p.mtd, t: null, d: p.mtd.d.map((r) => [r[0], r[1], ...NULL3]) } : p.mtd,
      o: p.o ? { ...p.o, t: null } : p.o,
    };
  }
  // bad[i]: masked days before index i; a period [from, to] (inclusive ISO strings) is hit when it holds one.
  const n = p.d.length, dates = dateSeq(p.d0, n), bad = new Int32Array(n + 1);
  const d = remap(p.d, (r, i) => { const ok = bandShown(tb, r[0]); bad[i + 1] = bad[i] + (ok ? 0 : 1); return ok ? r : [r[0], ...NULL3]; });
  const hit = (from, to) => bad[n] > 0 && bad[bound(dates, n, to, true)] - bad[bound(dates, n, from, false)] > 0;
  const period = (r, from, to) => (hit(from, to) ? [r[0], ...NULL3] : r);
  const mtd = p.mtd ? {
    ...p.mtd,
    d: remap(p.mtd.d, (r) => (bandShown(tb, r[1]) ? r : [r[0], r[1], ...NULL3])),
    t: p.mtd.d.some((r) => !bandShown(tb, r[1])) || hit(`${p.mtd.m}-01`, p.mtd.th || `${p.mtd.m}-31`) ? null : p.mtd.t,
  } : p.mtd;
  const o = p.o && p.o.t && p.o.d.some((r) => !bandShown(tb, r[3])) ? { ...p.o, t: null } : p.o;
  return { ...p, tb, d, w: remap(p.w, (r) => period(r, r[0], weekEnd(r[0]))), mo: remap(p.mo, (r) => period(r, `${r[0]}-01`, `${r[0]}-31`)), mtd, o };
}

// Page-data store payload → what may be rendered: revenue only for shown tiers (per band), downloads only for shown
// tiers ('hidden' kept for its note). Free-chart rank is not an estimate and stays.
function displayStore(p) {
  const de = p.de && (downloadsShown(p.de) || p.de.t === 'hidden') ? p.de : null;
  const { de: _drop, ...rest } = revenueShown(p.t) ? maskBands(p) : { t: 'hidden', ...(p.fr ? { fr: p.fr } : {}) };
  return de ? { ...rest, de } : rest;
}

module.exports = { REVENUE_TIERS, DOWNLOAD_TIERS, MARKET_CURRENCY, OFF_CHART_BAND, revenueShown, downloadsShown, bandTiers, bandShown, maskBands, displayStore, dateSeq };
