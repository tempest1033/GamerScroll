'use strict';

/**
 * Page data of the game page revenue section, split for the request-time CPU limit (Workers Free: 10 ms per request).
 * docs/games-data/<slug>.json carries
 *   revenue  light: what the server-rendered text needs. Series rows keep their leading columns (rank, date) and, for
 *            the numbers, 1 or null (whether the row has them), so every layout decision of the server render matches
 *            the browser's; totals (months, month to date, outlook) stay whole; curves keep their facts without
 *            points; h = hash of the whole payload (the browser checks it against the page).
 *   rvz      heavy: the complete chart and table series, read only by the browser. Written as the LAST key of the file.
 *   rvb      the FIRST key, fixed format `{"rvb":"<10 digits>"`: the UTF-8 byte offset where `,"rvz":` starts. The boundary
 *            comes from this position, never from a text search, so no data key or value can move it.
 * The file stays one JSON document (the browser, build scripts and tests read it whole). functions/_lib/game-route.js
 * decodes and parses only the bytes before the offset (parseGameData); the browser (src/build/revenue-client.js) fetches
 * the same file and joins both halves (joinRevenue) before rendering the charts and tables. Pure, Workers-safe.
 */
const HEAVY_KEY = 'rvz';
const BOUNDARY_KEY = 'rvb';
const HEAVY_MARK = `,"${HEAVY_KEY}":`;
const BOUNDARY_HEAD = `{"${BOUNDARY_KEY}":"`;
const OFFSET_DIGITS = 10;
const HEADER_LENGTH = BOUNDARY_HEAD.length + OFFSET_DIGITS + 1; // + closing quote

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

const utf8Length = (text) => new TextEncoder().encode(text).length;

/**
 * Game page data (+ the heavy half of splitRevenue, or null) → docs/games-data/<slug>.json text. The reserved keys are
 * rejected: the boundary must only ever come from this writer.
 */
function stringifyGameData(game, heavy) {
  for (const key of [BOUNDARY_KEY, HEAVY_KEY]) if (Object.prototype.hasOwnProperty.call(game, key)) throw new Error(`game data: reserved key ${key}`);
  const json = JSON.stringify(game);
  if (!heavy) return json;
  const body = json.slice(1, -1);
  // The header has a fixed length, so the offset does not depend on its own digits.
  const light = (at) => `${BOUNDARY_HEAD}${String(at).padStart(OFFSET_DIGITS, '0')}"${body ? `,${body}` : ''}`;
  const at = utf8Length(light(0));
  if (String(at).length > OFFSET_DIGITS) throw new Error('game data: light half too large');
  return `${light(at)}${HEAVY_MARK}${JSON.stringify(heavy)}}`;
}

// The validated byte offset of the heavy half, or -1 (no header, or one that does not point at `,"rvz":` before the end).
function heavyAt(bytes) {
  if (bytes.length < HEADER_LENGTH + HEAVY_MARK.length + 1) return -1;
  for (let i = 0; i < BOUNDARY_HEAD.length; i++) if (bytes[i] !== BOUNDARY_HEAD.charCodeAt(i)) return -1;
  let at = 0;
  for (let i = BOUNDARY_HEAD.length; i < BOUNDARY_HEAD.length + OFFSET_DIGITS; i++) {
    const d = bytes[i] - 48;
    if (!(d >= 0 && d <= 9)) return -1;
    at = at * 10 + d;
  }
  if (bytes[HEADER_LENGTH - 1] !== 0x22 || at < HEADER_LENGTH || at + HEAVY_MARK.length >= bytes.length || bytes[bytes.length - 1] !== 0x7d) return -1;
  for (let i = 0; i < HEAVY_MARK.length; i++) if (bytes[at + i] !== HEAVY_MARK.charCodeAt(i)) return -1;
  return at;
}

const whole = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

/**
 * docs/games-data/<slug>.json (UTF-8 bytes, or text) → the game without the heavy revenue half and the boundary key.
 * Only the bytes before the offset are decoded and parsed; a file whose header does not hold is parsed whole.
 */
function parseGameData(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const at = heavyAt(bytes);
  let game;
  if (at < 0) game = whole(bytes);
  else {
    try { game = JSON.parse(`${new TextDecoder().decode(bytes.subarray(0, at))}}`); } catch { game = whole(bytes); }
  }
  delete game[BOUNDARY_KEY];
  delete game[HEAVY_KEY];
  return game;
}

module.exports = { HEAVY_KEY, BOUNDARY_KEY, splitRevenue, joinRevenue, stringifyGameData, parseGameData };
