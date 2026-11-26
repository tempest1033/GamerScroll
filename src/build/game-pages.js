'use strict';

/**
 * The game pages of the build, one per slug (the first record with a slug owns it; a record without one has its page under
 * the generated slug), with its name in every edition, its regional versions (src/build/regional-versions.js) and the editions
 * where it is indexable: its own rule (indexableEditionCodes) less those where a same-name page of the same market, store and
 * developer has the longer chart history. scripts/generate-game-pages.js (page data, sitemaps, related links) and
 * src/build/editions.js (in-page links, games hub) read the same list.
 */
const i18n = require('../i18n');
const { createSlug, rankSeries, summaryMeta, steamMatch, steamIdOf } = require('./game-data');
const { regionalVersions } = require('./regional-versions');

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

module.exports = { gamePages };
