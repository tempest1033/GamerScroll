'use strict';

/**
 * Build-time extraction of the compact per-game rank data consumed by
 * src/templates/helpers/game-rank-summary.js (see that file for the shape).
 * Needs the rank statistics (src/rank/stats.js), so it is never part of the Workers bundle.
 */

const STORES = ['ios', 'android'];

const idFor = (appIds, store, country) => appIds[`${store}_${country}`] || appIds[store];

// {o, v}: first..last charted day only, so games with a short chart history stay tiny
function trim(series) {
  const first = series.findIndex((x) => x != null);
  if (first < 0) return null;
  let end = series.length;
  while (series[end - 1] == null) end--;
  return { o: first, v: series.slice(first, end) };
}

// Daily grossing-rank series per country and store ({country: {store: {o, v}}}); {} without app IDs.
function rankSeries(S, appIds) {
  const s = {};
  if (!appIds) return s;
  for (const country of Object.keys(S.COUNTRIES)) {
    for (const store of STORES) {
      const id = idFor(appIds, store, country);
      if (!id) continue;
      const series = trim(S.seriesOf(country, store, id));
      if (series) (s[country] = s[country] || {})[store] = series;
    }
  }
  return s;
}

// null without any App Store / Google Play ID; regional slots (ios_jp, android_tw, ...) count like the base ones.
function collectRankData(S, appIds) {
  if (!appIds || !Object.keys(appIds).some((key) => STORES.includes(key.split('_')[0]))) return null;
  const h = {};
  for (const country of Object.keys(S.COUNTRIES)) {
    for (const store of STORES) {
      const id = idFor(appIds, store, country);
      if (!id) continue;
      const hourly = S.hourlyRanks(store, country, id);
      if (hourly && hourly.some((x) => x.rank != null)) (h[country] = h[country] || {})[store] = hourly.map((x) => [x.time, x.rank]);
    }
  }
  return { s: rankSeries(S, appIds), h };
}

// Shared by every game: the chart days and the archived hourly day.
function summaryMeta(S) {
  return { days: S.days.map((d) => d.date), hourlyDate: S.hourly ? S.hourly.date : '' };
}

function createSlug(name, appIds = null) {
  if (appIds) {
    if (appIds.android) return String(appIds.android).toLowerCase().replace(/\./g, '-');
    if (appIds.ios && String(appIds.ios).startsWith('com.')) return String(appIds.ios).toLowerCase().replace(/\./g, '-');
  }
  let slug = name.toLowerCase().replace(/[\u3040-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (slug.length < 2) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (((hash << 5) - hash) + name.charCodeAt(i)) & 0xffffffff;
    slug = 'game-' + Math.abs(hash).toString(36);
  }
  return slug;
}
module.exports = { collectRankData, rankSeries, summaryMeta, idFor, createSlug };
