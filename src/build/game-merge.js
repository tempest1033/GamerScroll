'use strict';

/**
 * Merges duplicate game records: records that carry the same store app (one App Store, Google Play or Steam ID), and records
 * that one edition shows under the same title (names[<code>], else the DB name) from the same developer (both named, the
 * same string), whose store IDs never name two different apps for one market and store (e.g. a Google Play record and an
 * App Store US record of one game). Each group becomes the record with the longest revenue-chart history, under the group's
 * clean slug (the one the others extend: "z-route-redemption" of "z-route-redemption-37games-global"); the other slugs join
 * its `legacySlugs`, so their URLs 301 to it through docs/games-data/_redirects.json (scripts/generate-game-pages.js).
 * Run by the daily sync (scripts/sync-and-enrich.js) on every save; merging an already merged DB changes nothing.
 */
const { idFor, createSlug } = require('./game-data');

const CODES = ['en', 'ja', 'zh-cn', 'ko', 'zh-tw'];
const COUNTRIES = ['kr', 'jp', 'us', 'cn', 'tw'];
const STORES = ['ios', 'android'];

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const titleOf = (key, g, code) => norm((g.names && g.names[code]) || key);
const sameDeveloper = (a, b) => Boolean(a.developer) && a.developer === b.developer;
// A record's store apps: `<store>:<id>` (an App Store ID is one app on every storefront).
const appsOf = (g) => Object.entries(g.appIds || {}).filter(([, id]) => id).map(([slot, id]) => `${slot.split(/[_:]/)[0]}:${id}`);
// The URL slug of a record: records without one have their page under the generated slug (scripts/generate-game-pages.js).
const slugOf = (key, g) => g.slug || createSlug(key, g.appIds);
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
  const byApp = new Map();
  for (const key of keys) {
    for (const app of appsOf(games[key])) {
      const first = byApp.get(app);
      if (!first) byApp.set(app, key);
      else if (first !== key && compatible(games[first], games[key])) parent.set(find(key), find(first));
    }
  }
  const groups = new Map();
  for (const key of keys) { const root = find(key); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(key); }
  const days = new Map(keys.map((k) => [k, chartDays(games[k])]));
  return [...groups.values()].filter((g) => g.length > 1)
    // a chain of pairwise matches is merged only when every pair in it is compatible
    .filter((g) => g.every((a, i) => g.slice(i + 1).every((b) => compatible(games[a], games[b]))))
    .map((g) => g.sort((a, b) => days.get(b) - days.get(a) || !games[a].slug - !games[b].slug || slugOf(a, games[a]).length - slugOf(b, games[b]).length || a.localeCompare(b)));
}

// Fields of `from` that `into` lacks, appended after its own.
const fill = (into, from) => ({ ...into, ...Object.fromEntries(Object.entries(from || {}).filter(([k]) => !(into && k in into))) });

function mergeInto(kept, keptKey, other, otherKey) {
  // A generated slug follows the store IDs, which the merge extends: the kept page keeps its URL.
  const keptSlug = slugOf(keptKey, kept);
  if (!kept.slug) kept.slug = keptSlug;
  kept.appIds = fill(kept.appIds, other.appIds);
  if (kept.names || other.names) kept.names = fill(kept.names, other.names);
  kept.platforms = [...new Set([...(kept.platforms || []), ...(other.platforms || [])])];
  kept.aliases = [...new Set([...(kept.aliases || []), ...(otherKey !== keptKey ? [otherKey] : []), ...(other.aliases || [])])].filter((a) => a !== keptKey);
  if (!kept.developer && other.developer) kept.developer = other.developer;
  if (!kept.icon && other.icon) kept.icon = other.icon;
  kept.legacySlugs = [...new Set([...(kept.legacySlugs || []), slugOf(otherKey, other), ...(other.legacySlugs || [])])].filter((s) => s && s !== keptSlug);
}

// The group's clean slug: the one every other slug of the group equals or extends ("<clean>-…"), if there is one.
const cleanSlug = (slugs) => slugs.find((c) => slugs.every((s) => s === c || s.startsWith(`${c}-`)));

// Mutates gamesData.games; returns [{ kept, merged: [slug, ...] }] (kept: the merged record's slug).
function merge(gamesData, chartDays) {
  const games = gamesData.games;
  const out = [];
  for (const [keptKey, ...rest] of duplicateGroups(games, chartDays)) {
    const slugs = [keptKey, ...rest].map((k) => slugOf(k, games[k]));
    const clean = cleanSlug(slugs);
    const kept = games[keptKey];
    for (const key of rest) { mergeInto(kept, keptKey, games[key], key); delete games[key]; }
    if (clean && clean !== kept.slug) {
      kept.legacySlugs = [...new Set([...kept.legacySlugs, kept.slug])].filter((s) => s !== clean);
      kept.slug = clean;
    }
    out.push({ kept: kept.slug, merged: slugs.filter((s) => s !== kept.slug) });
  }
  gamesData.totalGames = Object.keys(games).length;
  return out;
}

module.exports = { merge, duplicateGroups, chartDaysOf };
