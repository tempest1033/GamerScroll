'use strict';

/**
 * Merges duplicate game records: records that one edition shows under the same title (names[<code>], else the DB name),
 * from the same developer (the first four letters of the developer names agree, or one has none), whose store IDs never
 * name two different apps for one market and store (e.g. "arknights" Google Play + "arknights-us" App Store US).
 * Each group becomes the record with the longest revenue-chart history; the others' slugs join its `legacySlugs`, so their
 * URLs 301 to it through docs/games-data/_redirects.json (scripts/generate-game-pages.js).
 * Run by the daily sync (scripts/sync-and-enrich.js) on every save; merging an already merged DB changes nothing.
 */
const { idFor, createSlug } = require('./game-data');

const CODES = ['en', 'ja', 'zh-cn', 'ko', 'zh-tw'];
const COUNTRIES = ['kr', 'jp', 'us', 'cn', 'tw'];
const STORES = ['ios', 'android'];

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const titleOf = (key, g, code) => norm((g.names && g.names[code]) || key);
const devKey = (g) => String(g.developer || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const sameDeveloper = (a, b) => { const x = devKey(a), y = devKey(b); return !x || !y || x.slice(0, 4) === y.slice(0, 4); };
const steamOf = (g) => (g.appIds && (g.appIds['steam:global'] || g.appIds.steam)) || null;
function compatible(a, b) {
  for (const country of COUNTRIES) {
    for (const store of STORES) {
      const x = a.appIds && idFor(a.appIds, store, country);
      const y = b.appIds && idFor(b.appIds, store, country);
      if (x && y && String(x) !== String(y)) return false;
    }
  }
  const sa = steamOf(a), sb = steamOf(b);
  return !(sa && sb && String(sa) !== String(sb));
}

// Revenue-chart days of a record's apps over every market and store (S: src/rank/stats.js loadRankStats()).
const chartDaysOf = (S) => (g) => COUNTRIES.reduce((n, country) => n + STORES.reduce((m, store) => {
  const id = g.appIds && idFor(g.appIds, store, country);
  return m + (id ? S.daysOnChart(country, store, id) : 0);
}, 0), 0);

// Groups of DB keys to merge, kept key first. chartDays(game) → revenue-chart days of the record's apps.
function duplicateGroups(games, chartDays) {
  const keys = Object.keys(games);
  const parent = new Map(keys.map((k) => [k, k]));
  const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  const byTitle = new Map();
  for (const key of keys) {
    for (const code of CODES) {
      const title = titleOf(key, games[key], code);
      if (!title) continue;
      const id = `${code}\u0000${title}`;
      if (!byTitle.has(id)) byTitle.set(id, []);
      byTitle.get(id).push(key);
    }
  }
  for (const list of byTitle.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = games[list[i]], b = games[list[j]];
        if (sameDeveloper(a, b) && compatible(a, b)) parent.set(find(list[i]), find(list[j]));
      }
    }
  }
  const groups = new Map();
  for (const key of keys) { const root = find(key); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(key); }
  const days = new Map(keys.map((k) => [k, chartDays(games[k])]));
  return [...groups.values()].filter((g) => g.length > 1)
    // a chain of pairwise matches is merged only when every pair in it is compatible
    .filter((g) => g.every((a, i) => g.slice(i + 1).every((b) => compatible(games[a], games[b]))))
    .map((g) => g.sort((a, b) => days.get(b) - days.get(a) || !games[a].slug - !games[b].slug || games[a].slug.length - games[b].slug.length || a.localeCompare(b)));
}

// Fields of `from` that `into` lacks, appended after its own.
const fill = (into, from) => ({ ...into, ...Object.fromEntries(Object.entries(from || {}).filter(([k]) => !(into && k in into))) });

function mergeInto(kept, keptKey, other, otherKey) {
  kept.appIds = fill(kept.appIds, other.appIds);
  if (kept.names || other.names) kept.names = fill(kept.names, other.names);
  kept.platforms = [...new Set([...(kept.platforms || []), ...(other.platforms || [])])];
  kept.aliases = [...new Set([...(kept.aliases || []), ...(otherKey !== keptKey ? [otherKey] : []), ...(other.aliases || [])])].filter((a) => a !== keptKey);
  if (!kept.developer && other.developer) kept.developer = other.developer;
  if (!kept.icon && other.icon) kept.icon = other.icon;
  // A record without a slug has its page under the generated one (scripts/generate-game-pages.js).
  const otherSlug = other.slug || createSlug(otherKey, other.appIds);
  kept.legacySlugs = [...new Set([...(kept.legacySlugs || []), otherSlug, ...(other.legacySlugs || [])])].filter((s) => s && s !== kept.slug);
}

// Mutates gamesData.games; returns [{ kept, merged: [slug, ...] }].
function merge(gamesData, chartDays) {
  const games = gamesData.games;
  const out = [];
  for (const [keptKey, ...rest] of duplicateGroups(games, chartDays)) {
    out.push({ kept: games[keptKey].slug, merged: rest.map((k) => games[k].slug || createSlug(k, games[k].appIds)) });
    for (const key of rest) { mergeInto(games[keptKey], keptKey, games[key], key); delete games[key]; }
  }
  gamesData.totalGames = Object.keys(games).length;
  return out;
}

module.exports = { merge, duplicateGroups, chartDaysOf };
