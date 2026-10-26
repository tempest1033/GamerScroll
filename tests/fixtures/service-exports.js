'use strict';

/**
 * Writes a synthetic service-exports bundle in the shape of the forecast repo's real `service-exports` branch
 * (rev-v3, 2026-10-25): manifest.json, games/<store>/<app_id>.json, games_index.json, genres.json, bands.json.
 * Numbers are made up from the given ranks with a simple power law — shape only, no model.
 *
 *   writeFixture(dir, { asof: 'YYYY-MM-DD', games: [{ store, app_id, title, developer, subgenre, release_date,
 *     markets: { <market>: { ranks: [183 ranks|null], tier, hiddenDays, downloads } }, play_bucket_min, ios_ratings: { <market>: n } }] })
 *   tier: 'wide' (default) | 'beta' | 'hidden' | any crafted value; tierByBand, downloadsTier: crafted overrides; hiddenDays: the last n days fall in a hidden rank band (null quantiles,
 *   and their week / month / MTD are null too); downloads: downloads_est tier ('verified' | 'unverified' | 'assumption' | 'partial_store' | 'hidden'),
 *   or 'unrated' (dl-v1 today: no numbers), default null; downloadsGaps: daily indexes left out (missing snapshots, as in dl-v1);
 *   downloadsBad: one malformed download row.
 * genres.json also carries `window` / `floor_rank` (basis of the approved decay note), which the real bundle does not have yet.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DAY_MS = 86400000;
const DAYS = 183;
// Local currency per USD (fx_usd is a month → rate map in the bundle).
const CURRENCY = { kr: ['KRW', 1390], jp: ['JPY', 152], us: ['USD', 1], tw: ['TWD', 32.3], cn: ['CNY', 7.15] };
// Daily revenue at rank 1 in local currency (App Store; Google Play × 0.8).
const SCALE = { kr: 1.5e9, jp: 2.0e8, us: 2.5e6, tw: 2.0e7, cn: 2.5e7 };
const STORE_FACTOR = { ios: 1, android: 0.8 };
const SUBGENRES = ['all', 'Role Playing', 'Strategy', 'Casual', 'Action', 'Card'];
const BANDS = [...Array.from({ length: 10 }, (_, i) => [i + 1, i + 1]), ...Array.from({ length: 8 }, (_, i) => [11 + i * 5, 15 + i * 5]), ...Array.from({ length: 5 }, (_, i) => [51 + i * 10, 60 + i * 10]), ...Array.from({ length: 5 }, (_, i) => [101 + i * 20, 120 + i * 20])];

const addDays = (d, n) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);
const round = (v) => Number(v.toPrecision(3));
const daily50 = (market, store, rank) => SCALE[market] * STORE_FACTOR[store] * (rank == null ? 190 ** -0.75 : rank ** -0.75);
const q = (v, lo, hi) => [round(v * lo), round(v), round(v * hi)];
const NULLS = [null, null, null];
const sum = (rows, i) => rows.reduce((s, r) => s + r[i], 0);
// fx_usd: the window's months and the next one, as in the bundle
const fxMap = (market, asof) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [new Date(Date.UTC(Number(asof.slice(0, 4)), Number(asof.slice(5, 7)) - 7 + i, 1)).toISOString().slice(0, 7), CURRENCY[market][1]]));
// Sum of one quantile over rows, or null when any row is hidden.
const total = (rows, i, lo, hi) => (rows.some((r) => r[i] == null) ? NULLS : q(sum(rows, i), lo, hi));

function downloadsEst(market, store, spec, dates) {
  if (!spec.downloads) return null;
  if (spec.downloads === 'hidden') return { tier: 'hidden' };
  // dl-v1 today: tier 'unrated', no daily rows, null weekly / monthly numbers.
  if (spec.downloads === 'unrated') return { tier: 'unrated', basis: 'free_rank', daily: [], weekly: dates.filter((d) => new Date(d).getUTCDay() === 1).map((d) => [d, ...NULLS]), monthly: [...new Set(dates.map((d) => d.slice(0, 7)))].map((m) => [m, ...NULLS]) };
  const daily = dates.map((d, i) => { const r = spec.ranks[i] ?? null; return [d, ...q(8000 * STORE_FACTOR[store] * (r == null ? 0.6 * 250 ** -0.6 : r ** -0.6) * (market === 'us' ? 4 : 1), 0.55, 1.7)]; });
  // dl-v1 (rev-v3 bundle) leaves out days without a snapshot; downloadsBad: a malformed row (q10 > q50).
  for (const i of [...(spec.downloadsGaps || [])].sort((a, b) => b - a)) daily.splice(i, 1);
  if (spec.downloadsBad) daily[3] = [daily[3][0], 9, 1, 5];
  const weekly = [];
  for (let i = dates.findIndex((d) => new Date(d).getUTCDay() === 1); i >= 0 && i + 7 <= DAYS; i += 7) weekly.push([dates[i], ...q(sum(daily.slice(i, i + 7), 2), 0.65, 1.5)]);
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const est = { tier: spec.downloads, daily, weekly, monthly: months.map((m) => [m, ...q(sum(daily.filter((r) => r[0].startsWith(m)), 2), 0.7, 1.45)]) };
  // downloadsTier: crafted tier on a numeric estimate (undefined → no tier field)
  if ('downloadsTier' in spec) { if (spec.downloadsTier === undefined) delete est.tier; else est.tier = spec.downloadsTier; }
  return est;
}

function marketRecord(market, store, spec, asof, game) {
  const [currency] = CURRENCY[market];
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(asof, i - DAYS + 1));
  // crafted tiers: tier key present but undefined → no tier field; tierByBand replaces tier_by_band (undefined → none)
  const tier = 'tier' in spec ? spec.tier : 'wide';
  const byBand = 'tierByBand' in spec ? spec.tierByBand : { '1-10': tier, '11-50': tier, '51-200': tier };
  const base = { title: game.title, ...(tier === undefined ? {} : { tier }), ...(byBand === undefined ? {} : { tier_by_band: byBand }), currency, fx_usd: fxMap(market, asof) };
  if (tier === 'hidden') return { ...base, downloads_est: downloadsEst(market, store, spec, dates) };
  const hiddenFrom = DAYS - (spec.hiddenDays || 0);
  // Anchor (new_release_ko.md §4): iOS from the store release date, Google Play from the first grossing-chart day.
  const firstRanked = spec.ranks.findIndex((r) => r != null);
  const firstChart = firstRanked >= 0 ? dates[firstRanked] : null;
  const revenueFrom = store === 'ios' ? game.release_date : firstChart || game.release_date;
  const anchor = {
    first_chart_date: firstChart, days_since_first_chart: firstChart ? Math.round((Date.parse(asof) - Date.parse(firstChart)) / DAY_MS) : null,
    first_chart_censored: firstRanked === 0, revenue_from: revenueFrom, revenue_from_basis: store === 'ios' ? 'ios_release' : 'first_chart', before_revenue_from: store === 'ios' ? 'pre_release' : 'pre_chart',
  };
  // No revenue before revenue_from (the producer's rows are null there; totals cover the days from it).
  const daily = dates.map((d, i) => { const r = spec.ranks[i] ?? null; return [d, r, ...(i >= hiddenFrom || d < revenueFrom ? NULLS : q(daily50(market, store, r), 0.45, 2.2))]; });
  const live = daily.filter((r) => r[0] >= revenueFrom);
  const ranked = spec.ranks.filter((r) => r != null);
  const weekly = [];
  // weeks start on Monday and may begin before the window (the real bundle's first week does)
  for (let i = dates.findIndex((d) => new Date(d).getUTCDay() === 1); i >= 0 && i < DAYS; i += 7) { const rows = daily.slice(i, i + 7).filter((r) => r[0] >= revenueFrom); if (rows.length) weekly.push([dates[i], ...total(rows, 3, 0.6, 1.7)]); }
  const months = [...new Set(live.map((d) => d[0].slice(0, 7)))];
  const monthly = months.map((m) => [m, ...total(live.filter((r) => r[0].startsWith(m)), 3, 0.62, 1.65)]);
  const month = asof.slice(0, 7);
  const mtdDays = daily.filter((r) => r[0].startsWith(month));
  const last = [...spec.ranks].reverse().find((r) => r != null);
  const outlook = last == null ? null : Array.from({ length: 14 }, (_, i) => {
    const r50 = Math.round(last * 1.02 ** (i + 1));
    const r90 = Math.round(r50 * 1.75);
    return [addDays(asof, i + 1), Math.max(1, Math.round(r50 * 0.6)), Math.max(1, Math.round(r50 * 0.8)), r50, Math.round(r50 * 1.3), r90 > 200 ? null : r90, Math.round(Math.min(0.9, Math.max(0, (r50 * 1.75 - 200) / 400)) * 1000) / 1000];
  });
  const sg = game.subgenre || 'all';
  const cohort = Boolean(game.launch_cohort);
  return {
    ...base, best_rank: ranked.length ? Math.min(...ranked) : null, ...anchor, daily, no_list_days: [], weekly, monthly,
    mtd: mtdDays.length ? { month, through: asof, total: total(mtdDays.filter((r) => r[0] >= revenueFrom), 3, 0.7, 1.5), days: mtdDays.map((r) => [r[0], r[1], r[2], r[3], r[4]]) } : null,
    outlook14: outlook && { cutoff: asof, days: outlook, revenue_total: q(outlook.reduce((s, d) => s + daily50(market, store, d[3]), 0), 0.4, 2.4), revenue_daily: outlook.map((d) => [d[0], ...q(daily50(market, store, d[3]), 0.35, 2.8)]) },
    downloads_est: downloadsEst(market, store, spec, dates),
    position: { genre_key: sg, days_since_launch: Math.round((Date.parse(asof) - Date.parse(game.release_date)) / DAY_MS), launch_cohort: cohort, launch_curve_x: cohort ? 40 : null, rel_to_first30: 0.45, decay_x: cohort ? 1 : 5, decay_curve_ref: `decay:all:${market}:${store}:${sg}`, launch_curve_ref: `launch:${market}:${store}:${sg}` },
  };
}

function genresJson(asof) {
  const launch = {}, decay = {};
  SUBGENRES.forEach((sg, gi) => {
    Object.keys(CURRENCY).forEach((market, mi) => {
      for (const store of ['ios', 'android']) {
        if (market === 'cn' && store === 'android') continue;
        const n = sg === 'Card' ? 8 : 40 + ((gi * 37 + mi * 23 + (store === 'ios' ? 11 : 0)) % 120);
        const md = 0.03 + ((gi * 3 + mi * 2 + (store === 'ios' ? 1 : 0)) % 12) / 100;
        const usd = SCALE[market] / CURRENCY[market][1] / 60;
        // only points with n >= 10 listings are exported, as in the real bundle (Card stays below it and is omitted)
        if (n >= 10) {
          launch[`launch:${market}:${store}:${sg}`] = { market, store, genre: sg, n_listings: n, n_apps: n, points: Array.from({ length: 60 }, (_, d) => { const v = usd * (0.4 + 1.2 * Math.exp(-d / 15)); return [d, n - Math.floor(d / 10), Math.round(40 + d), Math.round(25 + d), Math.round(70 + d), round(v), round(v * 0.6), round(v * 1.8), round(1 - d / 120)]; }) };
          decay[`decay:all:${market}:${store}:${sg}`] = { cohort: 'all', market, store, genre: sg, n_listings: n, n_apps: n, fit: { monthly_decline: md, monthly_decline_95: [md * 0.8, md * 1.2], half_life_months: round(Math.log(0.5) / Math.log(1 - md)) }, points: Array.from({ length: 10 }, (_, m) => { const v = (1 - md) ** m; return [m, n - m, round(v), round(v * 0.75), round(v * 1.1)]; }) };
        }
      }
    });
  });
  return {
    schema_version: 1, asof, min_n: 10, launch_columns: ['day_since_chart_entry', 'n', 'rank_q50', 'rank_q25', 'rank_q75', 'usd_day_q50', 'usd_day_q25', 'usd_day_q75', 'share_in_chart'],
    decay_columns: ['month', 'n', 'rel_q50', 'rel_q25', 'rel_q75'], launch, decay,
    window: { start: '2026-02-01', end: '2026-09-30', months: 8 }, floor_rank: 200,
  };
}

function bandsJson(asof, bandTiers = {}) {
  const cells = [];
  for (const market of Object.keys(CURRENCY)) {
    for (const store of ['ios', 'android']) {
      if (market === 'cn' && store === 'android') continue;
      for (const [lo, hi] of BANDS) {
        const mid = Math.sqrt(lo * hi);
        const hidden = market === 'us' && store === 'android' && lo > 180;
        const day = q(daily50(market, store, mid), 0.45, 2.2);
        const group = hi <= 10 ? '1-10' : hi <= 50 ? '11-50' : '51-200';
        cells.push({ market, store, band: lo === hi ? String(lo) : `${lo}-${hi}`, lo, hi, currency: CURRENCY[market][0], tier: bandTiers[`${market}|${store}|${lo}`] || (hidden ? 'hidden' : lo <= 10 ? 'wide' : 'beta'),
          ...(hidden ? {} : { day, week: q(day[1] * 7, 0.55, 1.9), month30: q(day[1] * 30, 0.6, 1.7), day_usd_q50: round(day[1] / CURRENCY[market][1]) }),
          coverage80: { band_group: group, window: '1-14', n_games: 120, n_cutoffs: 32, revenue_total: 0.78, revenue_daily: group === '1-10' ? 0.829 : group === '11-50' ? 0.81 : 0.792, rank_daily: 0.8 } });
      }
    }
  }
  return { schema_version: 1, asof, model_version: 'fixture', bands: 'band_table granularity: 1..10 single ranks, 11-50 by 5, 51-100 by 10, 101-200 by 20', notes: [], cells };
}

// bandTiers: { '<market>|<store>|<lo>': tier } crafted bands.json tiers (numbers kept)
function writeFixture(dir, { asof, games, bandTiers }) {
  fs.rmSync(dir, { recursive: true, force: true });
  const files = {};
  const write = (rel, value) => {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const bytes = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(file, bytes);
    files[rel.replace(/\\/g, '/')] = { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  };
  for (const game of games) {
    const markets = Object.fromEntries(Object.entries(game.markets).map(([m, spec]) => [m, marketRecord(m, game.store, spec, asof, game)]));
    const downloads = { asof: addDays(asof, 1), play_bucket_min: game.store === 'android' ? game.play_bucket_min ?? null : null, ios_ratings: game.store === 'ios' ? game.ios_ratings || {} : {} };
    write(`games/${game.store}/${game.app_id}.json`, { app_id: game.app_id, store: game.store, title: game.title, developer: game.developer || '', genre: 'Games', subgenre: game.subgenre || null, release_date: game.release_date, asof, downloads, markets });
  }
  write('games_index.json', { schema_version: 1, asof, columns: ['store', 'app_id', 'title', 'markets'], games: games.map((g) => [g.store, g.app_id, g.title, Object.keys(g.markets)]) });
  write('genres.json', genresJson(asof));
  write('bands.json', bandsJson(asof, bandTiers));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schema_version: 1, asof, generated_at: `${asof}T00:00:00Z`, model_version: 'fixture', n_games: games.length, window_days: DAYS, outlook_days: 14, files }, null, 1));
  return dir;
}

// Synthetic 183-day rank history: settling around `base`, with `gap` leading days off the chart.
function syntheticRanks(base, { gap = 0 } = {}) {
  return Array.from({ length: DAYS }, (_, i) => (i < gap ? null : Math.max(1, Math.round(base * (0.6 + 0.4 * (i / DAYS)) + 3 * Math.sin(i / 5)))));
}

module.exports = { writeFixture, syntheticRanks, DAYS };
