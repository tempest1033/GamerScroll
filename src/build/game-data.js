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

function collectRankData(S, appIds) {
  if (!appIds || (!appIds.ios && !appIds.android)) return null;
  const s = {}, h = {};
  for (const country of Object.keys(S.COUNTRIES)) {
    for (const store of STORES) {
      const id = idFor(appIds, store, country);
      if (!id) continue;
      const series = trim(S.seriesOf(country, store, id));
      if (series) (s[country] = s[country] || {})[store] = series;
      const hourly = S.hourlyRanks(store, country, id);
      if (hourly && hourly.some((x) => x.rank != null)) (h[country] = h[country] || {})[store] = hourly.map((x) => [x.time, x.rank]);
    }
  }
  return { s, h };
}

// Shared by every game: the chart days and the archived hourly day.
function summaryMeta(S) {
  return { days: S.days.map((d) => d.date), hourlyDate: S.hourly ? S.hourly.date : '' };
}

module.exports = { collectRankData, summaryMeta };
