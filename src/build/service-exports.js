'use strict';

/**
 * Revenue / download estimate bundle published by the forecast repo on its `service-exports` branch.
 * scripts/fetch-service-exports.js downloads it into cache/service-exports (SERVICE_EXPORTS_DIR overrides the
 * directory for previews); this module verifies it and turns it into page data. Build-time only (fs, crypto).
 *
 * Bundle layout (rev-v3, 2026-10-25; every file listed in manifest.json `files: { <path>: { sha256, bytes } }`):
 *   games/<ios|android>/<app_id>.json, games_index.json, genres.json (launch / decay curve maps, see usableCurve),
 *   bands.json (cells: market × store × rank band day/week/month30 q10–q90, tier, coverage80).
 * Record: { app_id, store, title, developer, genre ('Games'), subgenre, release_date, asof, downloads: { asof, play_bucket_min,
 *   ios_ratings: { <market>: n } }, markets: { <market>: { title, tier ('wide'|'beta' shown; anything else → no numbers), tier_by_band, best_rank,
 *   currency, fx_usd: { 'YYYY-MM': local per USD }, daily: [[date, rank|null, q10, q50, q90]] (183 days), no_list_days,
 *   weekly, monthly, mtd, outlook14|null, downloads_est|null, position } } }
 * Hidden tier is per rank band: a hidden day has null quantiles, a week/month/MTD containing one is null; a market with
 * tier 'hidden' keeps no revenue numbers in page data.
 *
 * Page data (docs/games-data/<slug>.json → `revenue`, rendered by src/templates/components/revenue-section.js):
 *   { a: asof, b: { y, m, f } basis of the decay note (genres.window / floor_rank, absent from rev-v3),
 *     om?: { n, c } outlook backtest (manifest outlook_model, see outlookMethod), dl: { p: play bucket min, r: { <market>: iOS rating count } },
 *     m: { <market>: { c: currency, fx: USD per local unit, s: { ios|android: StorePayload | { t: 'hidden' } } } }, cv: { <ref>: curve } }
 *   StorePayload = { t: tier, d0: first day, d: [[rank|null, q10, q50, q90]] (consecutive days), w: [[week_start, q10, q50, q90]],
 *     mo: [[YYYY-MM, q10, q50, q90]], mtd: { m, th, t: [q10, q50, q90] | null, d: [[date, rank|null, q10, q50, q90]] } | null,
 *     o: { c: cutoff, d: [[date, r10, r25, r50, r75, r90, p_below_chart]], t: [q10, q50, q90] | null } | null,
 *     p: { k, ds, rf, dx, lx, dc, lr } | null (see compactStore),   hidden cells are [null, null, null]
 *     de?: { t: tier, b?: basis, d0, d: [[q10, q50, q90]], w, mo } | { t: 'hidden' } }   per-market download estimate (markets.<m>.downloads_est; never CN Android);
 *   kept on a hidden-revenue store too ({ t: 'hidden', de }), since the two estimates have their own tiers.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { idFor } = require('./game-data');
const { revenueShown, downloadsShown, bandTiers, maskBands, MARKET_CURRENCY } = require('../templates/components/revenue-policy');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_DIR = path.join(ROOT, 'cache', 'service-exports');
const MARKETS = ['kr', 'jp', 'us', 'tw', 'cn'];
const STORES = ['ios', 'android'];
const MAX_AGE_DAYS = 2;
const MIN_CURVE_N = 10;
const MAX_CURVE_POINTS = 46;
const DAY_MS = 86400000;

const exportsDir = (env = process.env) => (env.SERVICE_EXPORTS_DIR ? path.resolve(env.SERVICE_EXPORTS_DIR) : DEFAULT_DIR);
const warn = (message) => console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : '  ⚠️ '}service exports: ${message}`);
const kstToday = (now) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function manifestEntries(manifest) {
  const files = manifest.files;
  const entries = Array.isArray(files)
    ? files.map((f) => ({ path: f && f.path, sha256: f && f.sha256 }))
    : Object.entries(files || {}).map(([p, v]) => ({ path: p, sha256: typeof v === 'string' ? v : v && v.sha256 }));
  for (const e of entries) {
    if (typeof e.path !== 'string' || !e.path || path.isAbsolute(e.path) || e.path.split(/[\\/]/).includes('..')) throw new Error(`manifest: bad path ${JSON.stringify(e.path)}`);
    if (!/^[a-f0-9]{64}$/.test(String(e.sha256))) throw new Error(`manifest: bad sha256 for ${e.path}`);
  }
  return entries;
}

/** Throws with the reason when the bundle in `dir` is missing, stale (asof more than 2 days before today, KST) or altered. */
function verifyBundle(dir, { now = new Date() } = {}) {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`no manifest.json in ${dir}`);
  const manifest = readJson(manifestFile);
  if (manifest.schema_version !== 1) throw new Error(`unsupported schema_version ${manifest.schema_version}`);
  if (!isDay(manifest.asof)) throw new Error(`manifest asof ${JSON.stringify(manifest.asof)} is not a date`);
  const age = (Date.parse(kstToday(now)) - Date.parse(manifest.asof)) / DAY_MS;
  if (age > MAX_AGE_DAYS || age < -1) throw new Error(`stale bundle: asof ${manifest.asof} is ${age} days old (limit ${MAX_AGE_DAYS})`);
  const entries = manifestEntries(manifest);
  for (const required of ['genres.json', 'bands.json']) if (!entries.some((e) => e.path === required)) throw new Error(`manifest does not list ${required}`);
  for (const e of entries) {
    const file = path.join(dir, e.path);
    if (!fs.existsSync(file)) throw new Error(`missing ${e.path}`);
    if (sha256(fs.readFileSync(file)) !== e.sha256) throw new Error(`sha256 mismatch: ${e.path}`);
  }
  return { manifest, files: entries.map((e) => e.path) };
}

// ---------- page data ----------
const sig = (v) => (v == null ? null : Number(Number(v).toPrecision(3)));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// q10/q50/q90, or null when the producer hid that day/period (tier hidden is per rank band: a hidden day has null
// quantiles, and a week/month/MTD containing one is null as a whole).
const quantiles = (q, where) => {
  if (Array.isArray(q) && q.length === 3 && q.every((v) => v == null)) return null;
  if (!Array.isArray(q) || q.length !== 3 || !q.every(finite) || q[0] > q[1] || q[1] > q[2] || q[0] < 0) throw new Error(`${where}: bad q10/q50/q90 ${JSON.stringify(q)}`);
  return q.map(sig);
};
const triple = (q, where) => (q == null ? null : quantiles(q, where));
// Inside row arrays a hidden triple stays three nulls (the page reads q10 == null as hidden).
const cells = (q, where) => quantiles(q, where) || [null, null, null];
const isMonth = (value) => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
const dayOrThrow = (value, where) => { if (!isDay(value)) throw new Error(`${where}: bad date ${JSON.stringify(value)}`); return value; };
const rankOrNull = (r, where) => { if (r == null) return null; if (!Number.isInteger(r) || r < 1) throw new Error(`${where}: bad rank ${r}`); return r; };

const consecutive = (daily, where) => daily.forEach((row, i) => {
  if (!isDay(row[0]) || (i && Date.parse(row[0]) - Date.parse(daily[i - 1][0]) !== DAY_MS)) throw new Error(`${where}: daily dates not consecutive at ${row[0]}`);
});
const periodRows = (list, key, where) => (list || []).map((row) => { if (!key.test(String(row[0]))) throw new Error(`${where}: bad period ${row[0]}`); return [row[0], ...cells(row.slice(1, 4), `${where} ${row[0]}`)]; });

// Per-market download estimate (contract addition): { tier, daily: [[date, q10, q50, q90]], weekly, monthly } → { t, d0, d, w, mo }.
// Evidence tiers that show numbers (owner decision 2026-10-26): verified, unverified, assumption (iOS converted from the
// same game's Google Play data), partial_store (CN Android: one store only). Other tiers (dl-v1 'unrated',
// 'pending_prospective', all-null rows) are dropped, so the page shows "not available" with the fallback indicators.
// basis (forecast/downloads_model.py): 'free_rank' (from this storefront's free-chart rank) | 'below_free_200' (off the
// free top 200: a share of the rank-200 level). Only these codes are kept (shown as localised text, never raw).
// dl-v1 writes "<code>; <free English text>": the code is the text before the first ';' (trimmed); the free text is never kept.
// Units (dl-v1 `units`): downloads per day; weekly / monthly rows are the mean per day of that week / month.
const DL_BASES = ['free_rank', 'below_free_200'];
const basisCode = (basis) => (typeof basis === 'string' ? basis.split(';')[0].trim() : null);
function compactDownloads(e, where) {
  if (!e || typeof e !== 'object') return null;
  if (e.tier === 'hidden') return { t: 'hidden' };
  if (!downloadsShown({ t: e.tier })) return null;
  // dl-v1 omits days without a snapshot: the gap stays a null (unknown) cell so the series keeps one row per day.
  const d = [];
  (e.daily || []).forEach((row, i, daily) => {
    if (!isDay(row[0]) || (i && !(Date.parse(row[0]) > Date.parse(daily[i - 1][0])))) throw new Error(`${where} downloads: daily dates not ascending at ${row[0]}`);
    if (i) for (let gap = (Date.parse(row[0]) - Date.parse(daily[i - 1][0])) / DAY_MS - 1; gap > 0; gap--) d.push(null);
    d.push(quantiles(row.slice(1, 4), `${where} downloads ${row[0]}`));
  });
  const out = {
    t: e.tier, ...(DL_BASES.includes(basisCode(e.basis)) ? { b: basisCode(e.basis) } : {}), d0: d.length ? e.daily[0][0] : null, d,
    w: periodRows(e.weekly, /^\d{4}-\d{2}-\d{2}$/, `${where} downloads`), mo: periodRows(e.monthly, /^\d{4}-\d{2}$/, `${where} downloads`),
  };
  const any = d.some(Boolean) || [...out.w, ...out.mo].some((r) => r[1] != null);
  return any ? out : null;
}

const NEW_DAYS = 7;
/**
 * Release / chart-entry anchor of one market record (reports/precision/new_release_ko.md §4 in the forecast repo):
 * rf revenue_from (no revenue before it), b basis ('r' iOS store release | 'c' first grossing-chart day), bf label of the
 * days before it ('r' pre-release | 'c' pre-chart), fc first chart day, cz history censored at collection start,
 * nw fewer than NEW_DAYS days since rf, rs first day whose revenue is shown (new games: the first grossing top-200 day).
 */
function lifeOf(m, daily, asof) {
  if (!isDay(m.revenue_from) || !['ios_release', 'first_chart'].includes(m.revenue_from_basis)) return null;
  const rf = m.revenue_from;
  const nw = (Date.parse(asof) - Date.parse(rf)) / DAY_MS < NEW_DAYS;
  const first = nw ? daily.find((row) => row[0] >= rf && row[1] != null) : null;
  return {
    rf, b: m.revenue_from_basis === 'ios_release' ? 'r' : 'c', bf: m.before_revenue_from === 'pre_release' ? 'r' : 'c',
    fc: isDay(m.first_chart_date) ? m.first_chart_date : null, cz: m.first_chart_censored === true, nw, rs: nw ? (first ? first[0] : null) : rf,
  };
}

function compactStore(m, where, asof) {
  if (!m || typeof m !== 'object') return null;
  // A bad download estimate drops only that estimate (fallback indicators show), never the revenue estimate.
  let de = null;
  try { de = compactDownloads(m.downloads_est, where); } catch (error) { warn(error.message); }
  // Revenue numbers only for the production tiers (beta, wide); any other, unknown or missing tier keeps none.
  if (!revenueShown(m.tier)) return de ? { t: 'hidden', de } : { t: 'hidden' };
  const tb = bandTiers(m.tier_by_band);
  const daily = m.daily || [];
  consecutive(daily, where);
  const l = lifeOf(m, daily, asof);
  // No revenue before the anchor (pre-release / pre-chart) or, for new games, before their first top-200 day.
  const shown = (date) => !l || (l.rs != null && date >= l.rs);
  const d = daily.map((row) => [rankOrNull(row[1], where), ...(shown(row[0]) ? cells(row.slice(2, 5), `${where} ${row[0]}`) : [null, null, null])]);
  const rows = (list, key) => (l && l.nw ? [] : periodRows(list, key, where));
  if (m.mtd && !isMonth(m.mtd.month)) throw new Error(`${where}: bad mtd month ${JSON.stringify(m.mtd.month)}`);
  const mtd = m.mtd ? {
    m: m.mtd.month, th: dayOrThrow(m.mtd.through, `${where} mtd`), t: l && l.nw ? null : triple(m.mtd.total, `${where} mtd`),
    d: (m.mtd.days || []).map((row) => [dayOrThrow(row[0], `${where} mtd`), rankOrNull(row[1], where), ...(shown(row[0]) ? cells(row.slice(2, 5), `${where} mtd ${row[0]}`) : [null, null, null])]),
  } : null;
  // 14-day rank outlook: outlook14 (rev-v3..v6), or `outlook` with the same days rows [date, q10, q25, q50, q75, q90,
  // p_out] (p_out = chance of being outside the top 200 that day; optional → null; kept unrounded, the page classifies it).
  // New games: none at all (a new-release forecast is out of scope: launch_prior did not pass its backtest).
  const ol = l && l.nw ? null : m.outlook14 || m.outlook || null;
  const o = ol && Array.isArray(ol.days) && ol.days.length ? {
    c: ol.cutoff == null ? null : dayOrThrow(ol.cutoff, `${where} outlook`),
    d: ol.days.map((row) => {
      const r = row.slice(1, 6);
      if (!r.every((x) => x == null || finite(x)) || (row[6] != null && (!finite(row[6]) || row[6] < 0 || row[6] > 1))) throw new Error(`${where}: bad outlook row ${row[0]}`);
      return [dayOrThrow(row[0], `${where} outlook`), ...r.map((x) => (x == null ? null : Math.round(x))), row[6] == null ? null : row[6]];
    }),
    t: triple(ol.revenue_total, `${where} outlook`),
  } : null;
  const p = m.position || null;
  const num = (v) => (finite(v) ? v : null);
  // New games: no decay / half-life comparison; the launch reference curve only for launch-cohort games (not regional launches).
  const pos = p && (l && l.nw
    ? { k: p.genre_key || null, ds: num(p.days_since_launch), rf: null, dx: null, lx: p.launch_cohort ? num(p.launch_curve_x) : null, dc: null, lr: p.launch_cohort ? p.launch_curve_ref || null : null }
    : { k: p.genre_key || null, ds: num(p.days_since_launch), rf: finite(p.rel_to_first30) ? sig(p.rel_to_first30) : null, dx: num(p.decay_x), lx: num(p.launch_curve_x), dc: p.decay_curve_ref || null, lr: p.launch_curve_ref || null });
  // Per-band tiers (tb) mask days, periods and totals touching a band that is not shown (revenue-policy.js maskBands).
  return maskBands({
    t: m.tier, d0: daily.length ? daily[0][0] : null, d,
    w: rows(m.weekly, /^\d{4}-\d{2}-\d{2}$/), mo: rows(m.monthly, /^\d{4}-\d{2}$/), mtd, o,
    // ds days since store release, rf revenue vs the first 30 chart days, dx months since the first chart day (decay x),
    // lx days since chart entry for launch-cohort games (launch x), dc/lr curve refs into genres.json
    p: pos,
    ...(l ? { l } : {}),
    tb,
    ...(de ? { de } : {}),
  });
}
// fx_usd: local currency per USD by month ({ 'YYYY-MM': rate }); the page multiplies by USD per local unit of the asof month.
function usdPerUnit(fx, asof) {
  if (finite(fx)) return fx > 0 ? 1 / fx : null;
  if (!fx || typeof fx !== 'object') return null;
  const months = Object.keys(fx).filter((k) => k <= asof.slice(0, 7) && finite(fx[k]) && fx[k] > 0).sort();
  return months.length ? Number((1 / fx[months[months.length - 1]]).toPrecision(4)) : null;
}
const shownDownloads = (p) => Boolean(p && downloadsShown(p.de));

/**
 * genres.json curves → { kind, market, store, genre (store subgenre | 'all'), cohort, n, md, unit, points: [[x, q50, q25, q75]] }.
 *   decay  "decay:<cohort>:<market>:<store>:<subgenre>"  points [month, n, rel_q50, rel_q25, rel_q75], fit.monthly_decline; unit 'rel'
 *   launch "launch:<market>:<store>:<subgenre>"          points [day, n, rank_q50, rank_q25, rank_q75, usd_day_q50, usd_day_q25, usd_day_q75, share]; unit 'usd'
 * Shown only from MIN_CURVE_N listings; points below it are dropped too.
 */
function usableCurve(kind, c) {
  if (!c || !finite(c.n_listings) || c.n_listings < MIN_CURVE_N || !Array.isArray(c.points)) return null;
  // Keys the pages select and label by: known market / store, a string subgenre (escaped wherever it is shown).
  if (!MARKETS.includes(c.market) || !STORES.includes(c.store) || typeof c.genre !== 'string' || (c.cohort != null && typeof c.cohort !== 'string')) return null;
  const cols = kind === 'decay' ? [2, 3, 4] : [5, 6, 7];
  const all = c.points.filter((p) => finite(p[0]) && finite(p[1]) && p[1] >= MIN_CURVE_N && finite(p[cols[0]])).map((p) => [p[0], ...cols.map((i) => sig(p[i]))]);
  if (all.length < 2) return null;
  // Launch curves run up to ~180 daily points: keep at most MAX_CURVE_POINTS (evenly, with the last) for page weight.
  const step = Math.ceil(all.length / MAX_CURVE_POINTS);
  const points = step > 1 ? all.filter((_, i) => i % step === 0 || i === all.length - 1) : all;
  return { kind, market: c.market, store: c.store, genre: c.genre, cohort: c.cohort || null, n: c.n_listings, md: c.fit && finite(c.fit.monthly_decline) ? c.fit.monthly_decline : null, unit: kind === 'decay' ? 'rel' : 'usd', points };
}

/**
 * manifest.json outlook_model { name, frozen_config, backtest: { cov80, cutoffs, period } } → page data om
 * { n: number of weekly backtest cutoffs, c: share of realised ranks inside the 80% range (0–1) }, or null (absent or
 * malformed: the page then shows no accuracy number). Documented schema only: cutoffs a positive integer count, cov80 a
 * fraction in (0, 1]; anything else (percent, lists, strings) → null.
 */
function outlookMethod(model) {
  const b = model && typeof model === 'object' ? model.backtest : null;
  if (!b || typeof b !== 'object') return null;
  return Number.isInteger(b.cutoffs) && b.cutoffs > 0 && finite(b.cov80) && b.cov80 > 0 && b.cov80 <= 1 ? { n: b.cutoffs, c: b.cov80 } : null;
}

function recordsOf(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.games)) return json.games;
  return [json];
}

function buildIndex(dir, files) {
  const records = new Map();
  let invalid = 0;
  for (const rel of files.filter((f) => /^games[\\/]/.test(f))) {
    for (const record of recordsOf(readJson(path.join(dir, rel)))) {
      if (!record || !STORES.includes(record.store) || record.app_id == null || !record.markets) { invalid++; continue; }
      records.set(`${record.store}:${record.app_id}`, record);
    }
  }
  if (invalid) warn(`${invalid} game records without store/app_id/markets skipped`);
  return records;
}

function createExports(dir, verified) {
  const genres = readJson(path.join(dir, 'genres.json'));
  const bands = readJson(path.join(dir, 'bands.json'));
  const records = buildIndex(dir, verified.files);
  const asof = verified.manifest.asof;
  // Curves are page data keys (`cv`, by ref): a ref used by both kinds, or one an object key cannot hold, is dropped.
  const refs = ['decay', 'launch'].flatMap((kind) => Object.entries(genres[kind] || {}).map(([ref, c]) => [kind, ref, c]));
  const clash = new Set(refs.map(([, ref]) => ref).filter((ref, i, all) => ref === '__proto__' || all.indexOf(ref) !== i));
  for (const ref of clash) warn(`genre curve ${JSON.stringify(ref)}: duplicate or reserved name, dropped`);
  const curves = new Map(refs.filter(([, ref]) => !clash.has(ref)).map(([kind, ref, c]) => [ref, usableCurve(kind, c)]).filter(([, c]) => c));
  // Basis of the approved decay note ('<year> ranking records, <months> months … counted at rank <floor>'): not in the bundle yet.
  const window = genres.window || {};
  const basis = { y: isDay(window.start) ? Number(window.start.slice(0, 4)) : null, m: finite(window.months) ? window.months : null, f: finite(genres.floor_rank) ? genres.floor_rank : null };
  const om = outlookMethod(verified.manifest.outlook_model);
  let skipped = 0;

  // Per market: the game's App Store and Google Play ids for that storefront (games.json appIds, see game-data.js idFor).
  // freeRank(market, store, appId, since) → { r: latest free-chart rank | null, b: best since `since` | null }: the site's
  // own free (popular) chart, shown in the downloads block.
  function revenueFor(appIds, { freeRank } = {}) {
    if (!appIds) return null;
    const m = {}, cv = {}, r = {};
    let play = null;
    for (const market of MARKETS) {
      const s = {};
      let currency = null, fx = null;
      for (const store of STORES) {
        // The storefront's own id first (games.json <store>_<cc>, then <store>), then the game's ids for other storefronts:
        // the site's rank stats attribute any of them to the game (stats.js byApp), e.g. a game listed only as ios_us charting in tw.
        const ids = [idFor(appIds, store, market), ...Object.keys(appIds).filter((k) => k.startsWith(`${store}_`)).map((k) => appIds[k])].filter((id, i, a) => id && a.indexOf(id) === i);
        const id = ids.find((x) => records.has(`${store}:${x}`) && records.get(`${store}:${x}`).markets[market]) || ids.find((x) => records.has(`${store}:${x}`));
        const record = id ? records.get(`${store}:${id}`) : null;
        if (!record) continue;
        const dl = record.downloads || {};
        if (store === 'android' && play == null && finite(dl.play_bucket_min)) play = dl.play_bucket_min;
        if (store === 'ios' && dl.ios_ratings && finite(dl.ios_ratings[market])) r[market] = dl.ios_ratings[market];
        // Currency is fixed per market; a record with a shown tier and any other currency is dropped.
        const rec = record.markets[market];
        if (rec && revenueShown(rec.tier) && rec.currency !== MARKET_CURRENCY[market]) { skipped++; warn(`${store}:${id} ${market}: currency ${JSON.stringify(rec.currency)} is not ${MARKET_CURRENCY[market]}`); continue; }
        let payload;
        try { payload = compactStore(record.markets[market], `${store}:${id} ${market}`, asof); } catch (error) { skipped++; warn(error.message); continue; }
        if (!payload) continue;
        // No Google Play in China: CN download estimates cover the App Store only (CN Android is not estimated).
        if (market === 'cn' && store === 'android') delete payload.de;
        // New games: no iOS rating count (read as downloads, and too noisy in the first week).
        if (store === 'ios' && payload.l && payload.l.nw) delete r[market];
        // Free-chart rank (latest; best since revenue_from for new games, over the window otherwise) for the downloads block.
        if (freeRank) {
          const fr = freeRank(market, store, id, payload.l && payload.l.nw ? payload.l.rf : payload.d0 || asof);
          if (fr && (fr.r != null || fr.b != null)) payload.fr = fr;
        }
        s[store] = payload;
        if (revenueShown(payload.t)) {
          currency = MARKET_CURRENCY[market];
          fx = fx || usdPerUnit(record.markets[market].fx_usd, asof);
          for (const ref of [payload.p && payload.p.dc, payload.p && payload.p.lr]) if (ref && curves.has(ref)) cv[ref] = curves.get(ref);
        }
      }
      if (Object.keys(s).length || r[market] != null) m[market] = { c: currency, fx: finite(fx) ? fx : null, s };
    }
    const shown = Object.values(m).some((x) => Object.values(x.s).some((p) => revenueShown(p.t) || shownDownloads(p)));
    if (!shown && play == null && !Object.keys(r).length) return null;
    return { a: asof, b: basis, ...(om ? { om } : {}), dl: { p: play, r }, m, cv };
  }

  return {
    asof, dir, basis, om, records, curves,
    // bands.json cells: one game's revenue at a rank in [lo, hi] per day/week/30 days (local q10/q50/q90), tier, coverage80
    // (cells with a currency other than the market's are dropped)
    bands: (bands.cells || []).filter((b) => MARKETS.includes(b.market) && STORES.includes(b.store) && Number.isInteger(b.lo) && Number.isInteger(b.hi) && b.currency === MARKET_CURRENCY[b.market]).map((b) => ({
      market: b.market, store: b.store, lo: b.lo, hi: b.hi, currency: MARKET_CURRENCY[b.market], tier: b.tier,
      day: !revenueShown(b.tier) || !Array.isArray(b.day) ? null : b.day, month30: !revenueShown(b.tier) || !Array.isArray(b.month30) ? null : b.month30,
      usd: revenueShown(b.tier) && finite(b.day_usd_q50) && Array.isArray(b.day) && b.day[1] > 0 ? b.day_usd_q50 / b.day[1] : null,
      coverage: b.coverage80 && finite(b.coverage80.revenue_daily) ? b.coverage80.revenue_daily : null, coverageN: b.coverage80 ? b.coverage80.n_games : null,
    })),
    revenueFor,
    get skipped() { return skipped; },
  };
}

const cache = new Map();
/** The verified bundle, or null (with a warning) when there is none or it fails verification: pages then omit the sections. */
function loadServiceExports({ dir = exportsDir(), now = new Date(), quiet = false } = {}) {
  if (cache.has(dir)) return cache.get(dir);
  let value = null;
  try {
    value = createExports(dir, verifyBundle(dir, { now }));
  } catch (error) {
    if (!quiet) warn(`${error.message} — revenue sections omitted`);
  }
  cache.set(dir, value);
  return value;
}

/**
 * Launch-gate coverage: of each market × store's current grossing top 200 (rank stats `today`), how many rows map to a
 * game page whose page data has a visible revenue estimate and a visible download estimate for that market and store.
 * revenueBySlug: slug → page `revenue`; slugOf(game) → page slug or undefined.
 */
function coverage(S, revenueBySlug, slugOf) {
  const out = [];
  for (const market of MARKETS) {
    for (const store of STORES) {
      const rows = ((S.today.rows[market] || {})[store] || []).slice(0, 200).filter(Boolean);
      if (!rows.length) continue;
      let page = 0, revenue = 0, downloads = 0;
      const missing = [];
      rows.forEach((row, i) => {
        const g = row.appId ? S.gameOf(store, row) : null;
        const slug = g && slugOf(g);
        if (!slug) { missing.push({ rank: i + 1, appId: row.appId || null, why: 'page' }); return; }
        page++;
        const p = revenueBySlug.get(slug) && revenueBySlug.get(slug).m[market] && revenueBySlug.get(slug).m[market].s[store];
        const rv = Boolean(p && revenueShown(p.t)), dl = shownDownloads(p);
        if (rv) revenue++;
        if (dl) downloads++;
        if (!rv || !dl) missing.push({ rank: i + 1, appId: row.appId, slug, why: !p ? 'no-record' : [!rv && 'revenue-hidden', !dl && 'downloads'].filter(Boolean).join('+') });
      });
      out.push({ market, store, chart: rows.length, page, revenue, downloads, missing });
    }
  }
  return out;
}

module.exports = { loadServiceExports, verifyBundle, coverage, exportsDir, DEFAULT_DIR, MARKETS, MIN_CURVE_N };
