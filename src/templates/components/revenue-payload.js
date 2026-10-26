'use strict';

/**
 * Page data of the game page revenue section, split for the request-time CPU limit (Workers Free: 10 ms per request).
 * docs/games-data/<slug>.json carries
 *   revenue  light: what the server-rendered text needs. Series rows keep their leading columns (rank, date) and, for
 *            the numbers, 1 or null (whether the row has them), so every layout decision of the server render matches
 *            the browser's; totals (months, month to date, outlook) stay whole; curves keep their facts without
 *            points; h = hash of the whole payload (the browser checks it against the page).
 *   rvz      heavy: the complete chart and table series, read only by the browser. Written as the LAST key of the file.
 * functions/_lib/game-route.js parses the file only up to `rvz` (parseGameData); the browser (src/build/revenue-client.js)
 * fetches the same file and joins both halves (joinRevenue) before rendering the charts and tables. Pure, Workers-safe.
 */
const HEAVY_KEY = 'rvz';
// JSON.stringify escapes quotes inside strings, so this sequence only occurs where the writer puts the top-level key.
const HEAVY_MARK = `,"${HEAVY_KEY}":`;

// FNV-1a (32 bit) of the payload JSON: a change marker, not a security check.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// The first n - 1 columns of each row and a numbers marker (1, or null for a row without numbers); a null row
// (unknown day of a download estimate) stays null.
const head = (rows, n) => rows.map((r) => (Array.isArray(r) ? [...r.slice(0, n - 1), r[n - 1] == null ? null : 1] : r));

/** Page revenue payload (src/build/service-exports.js revenueFor) → { light, heavy }. */
function splitRevenue(rev) {
  const m = {}, hm = {};
  for (const [market, x] of Object.entries(rev.m || {})) {
    m[market] = { ...x, s: {} };
    hm[market] = {};
    for (const [store, p] of Object.entries(x.s || {})) {
      const light = { ...p }, heavy = {};
      if (Array.isArray(p.d)) { heavy.d = p.d; light.d = head(p.d, 2); }
      if (Array.isArray(p.w)) { heavy.w = p.w; light.w = head(p.w, 2); }
      if (p.mtd && Array.isArray(p.mtd.d)) { heavy.md = p.mtd.d; light.mtd = { ...p.mtd, d: head(p.mtd.d, 3) }; }
      if (p.de) {
        light.de = { ...p.de };
        if (Array.isArray(p.de.d)) { heavy.dd = p.de.d; light.de.d = head(p.de.d, 1); }
        if (Array.isArray(p.de.w)) { heavy.dw = p.de.w; light.de.w = head(p.de.w, 2); }
      }
      m[market].s[store] = light;
      hm[market][store] = heavy;
    }
  }
  const cv = {}, hcv = {};
  for (const [key, c] of Object.entries(rev.cv || {})) { cv[key] = { ...c, points: [] }; hcv[key] = c.points; }
  return { light: { ...rev, m, ...(rev.cv ? { cv } : {}), h: hash(JSON.stringify(rev)) }, heavy: { m: hm, cv: hcv } };
}

/** Light + heavy (both from the same page data file) → the complete payload. */
function joinRevenue(light, heavy) {
  const hm = (heavy && heavy.m) || {}, hcv = (heavy && heavy.cv) || {};
  const m = {};
  for (const [market, x] of Object.entries(light.m || {})) {
    const s = {};
    for (const [store, p] of Object.entries(x.s || {})) {
      const h = (hm[market] && hm[market][store]) || {};
      const full = { ...p };
      if (h.d) full.d = h.d;
      if (h.w) full.w = h.w;
      if (h.md && p.mtd) full.mtd = { ...p.mtd, d: h.md };
      if (p.de && (h.dd || h.dw)) full.de = { ...p.de, ...(h.dd ? { d: h.dd } : {}), ...(h.dw ? { w: h.dw } : {}) };
      s[store] = full;
    }
    m[market] = { ...x, s };
  }
  const cv = light.cv && Object.fromEntries(Object.entries(light.cv).map(([key, c]) => [key, { ...c, points: hcv[key] || c.points }]));
  return { ...light, m, ...(cv ? { cv } : {}) };
}

/** docs/games-data/<slug>.json text → the game without the heavy revenue half (the server never reads it). */
function parseGameData(text) {
  const at = text.indexOf(HEAVY_MARK);
  return JSON.parse(at < 0 ? text : `${text.slice(0, at)}}`);
}

module.exports = { HEAVY_KEY, splitRevenue, joinRevenue, parseGameData };
