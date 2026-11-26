'use strict';

/**
 * The game pages of the build, one per slug (the first record with a slug owns it; a record without one has its page under
 * the generated slug), with its name in every edition, its regional versions (src/build/regional-versions.js) and the editions
 * where it is indexable: its own rule (indexableEditionCodes) less those where a same-name page of the same market, store and
 * developer has the longer chart history. scripts/generate-game-pages.js (page data, sitemaps, related links) and
 * src/build/editions.js (in-page links, games hub) read the same list.
 */
const path = require('path');
const i18n = require('../i18n');
const { createSlug, rankSeries, summaryMeta, loadLatestSteam, steamLists, steamMatch, steamIdOf, steamPageSlugs } = require('./game-data');
const { regionalVersions } = require('./regional-versions');

const HISTORY_DIR = path.join(__dirname, '..', '..', 'history');
const steamTargetCache = new WeakMap();

// S: src/rank/stats.js loadRankStats(); steam: { lists: game-data.js steamLists, pages: steamPageSlugs, stats: src/rank/steam-stats.js }.
// → [{ g, slug, names: { <code>: name }, editions: [<code>], regional }]
function gamePages(S, steam) {
  const { indexableEditionCodes } = require('../templates/helpers/game-rank-summary');
  const { gameTitle } = require('../templates/pages/game');
  const meta = summaryMeta(S);
  const codes = i18n.EDITIONS.map((e) => e.code);
  const current = i18n.currentEdition().code;
  const taken = new Set();
  const pages = [];
  for (const g of S.games) {
    const slug = g.slug || createSlug(g.key, g.appIds);
    if (taken.has(slug)) continue;
    taken.add(slug);
    const { mp, ts } = steamMatch(g, steam.lists);
    const steamId = steamIdOf(g);
    const s = rankSeries(S, g.appIds);
    const names = {}, titles = {};
    for (const code of codes) {
      i18n.setEdition(code);
      names[code] = S.displayName(g);
      titles[code] = gameTitle(names[code], g.platforms || []);
    }
    const editions = indexableEditionCodes({ s }, Boolean(mp || ts) || steam.pages.get(steamId) === slug, meta);
    pages.push({ g, slug, editions, names, titles, s, steamDays: steamId && steam.stats ? steam.stats.daysOnChart(steamId) : 0, developer: g.developer || '', appIds: g.appIds });
  }
  i18n.setEdition(current);
  const regional = regionalVersions(pages, codes);
  const twin = (slug, code) => Boolean(regional[slug] && regional[slug][code] && regional[slug][code].x);
  return pages.map(({ g, slug, editions, names }) => ({ g, slug, names, regional: regional[slug], editions: editions.filter((code) => !twin(slug, code)) }));
}

// Steam app ID → target game slug: a plain string when every edition indexes the same page, or { _: slug, <code>: winner }
// where an edition marks the app's own page as a noindex regional twin (regional[code].x) and links/redirects to its winner.
function steamPageTargets(steamPages, pages, codes = i18n.EDITIONS.map((e) => e.code)) {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const resolve = (slug, code) => {
    let cur = slug;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const next = bySlug.get(cur) && bySlug.get(cur).regional && bySlug.get(cur).regional[code] && bySlug.get(cur).regional[code].x;
      if (!next) break;
      cur = next;
    }
    const page = bySlug.get(cur);
    return page && page.editions.includes(code) ? cur : null;
  };
  const out = {};
  for (const [id, slug] of steamPages) {
    const diffs = codes.map((c) => [c, resolve(slug, c)]).filter(([, s]) => s !== slug);
    out[id] = diffs.length ? { _: slug, ...Object.fromEntries(diffs) } : slug;
  }
  return out;
}

const steamSlugFor = (entry, code) => (typeof entry === 'string' ? entry : entry ? (Object.prototype.hasOwnProperty.call(entry, code) ? entry[code] : entry._) : null);

function cachedSteamTargets(S, steamStats) {
  let entry = steamTargetCache.get(S);
  if (!entry || entry.steamStats !== steamStats) {
    const pageIds = new Set(steamStats.pageApps(14));
    const merged = steamPageSlugs(S.games, pageIds);
    const lists = steamLists(loadLatestSteam(HISTORY_DIR));
    const pages = gamePages(S, { lists, pages: merged, stats: steamStats });
    entry = { steamStats, merged, built: [...pageIds].filter((id) => !merged.has(id)), targets: steamPageTargets(merged, pages) };
    steamTargetCache.set(S, entry);
  }
  return entry;
}

module.exports = { gamePages, steamPageTargets, steamSlugFor, cachedSteamTargets };
