#!/usr/bin/env node
'use strict';

/**
 * Renames game slugs that carry a non-Latin script although the game has a Latin name
 * (e.g. "monopoly-go-모노폴리-go" → "monopoly-go"), following src/build/game-slug.js.
 * The old slug is kept in `legacySlugs`: old URLs redirect from it (functions/_lib/game-route.js) and data files keyed
 * by it keep resolving. Games without a Latin name are left alone. Safe to re-run: renamed games are already ASCII.
 *
 *   node scripts/migrate-game-slugs.js            # rewrite data/games.json
 *   node scripts/migrate-game-slugs.js --dry-run  # report only
 */
const fs = require('fs');
const path = require('path');
const { createSlug } = require('../src/build/game-data');
const { latinSlug, asciiSlug, uniqueOf, slugKeys } = require('../src/build/game-slug');

const NON_ASCII = /[^\u0000-\u007F]/;
const isHashSlug = (key, g) => Boolean(g.slug && /^game-[a-z0-9]+$/.test(g.slug) && [key, ...(g.aliases || [])].some((k) => g.slug === createSlug(k) && asciiSlug(k) !== g.slug));

// Mutates gamesData.games; returns [{ key, from, to }].
function migrate(gamesData) {
  const entries = Object.entries(gamesData.games);
  const owners = new Map();
  const own = (s, key) => { if (!owners.has(s)) owners.set(s, new Set()); owners.get(s).add(key); };
  for (const [key, g] of entries) for (const s of slugKeys(g)) own(s, key);
  const renamed = [];
  for (const [key, g] of entries) {
    if (!g.slug || (!NON_ASCII.test(g.slug) && !isHashSlug(key, g))) continue;
    const base = latinSlug(key, g);
    if (!base) continue;
    // A record may take a slug from its own legacySlugs that no other record owns.
    const usedByOther = { has: (s) => { const o = owners.get(s); return Boolean(o && (o.size > 1 || !o.has(key))); } };
    const ownPrefix = usedByOther.has(base)
      ? (g.legacySlugs || []).filter((s) => !NON_ASCII.test(s) && s.startsWith(`${base}-`) && !usedByOther.has(s)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
      : null;
    const to = ownPrefix || uniqueOf(base, g.developer, usedByOther);
    own(to, key);
    renamed.push({ key, from: g.slug, to });
    g.legacySlugs = [...new Set([g.slug, ...(g.legacySlugs || [])])].filter((s) => s !== to);
    g.slug = to;
  }
  return renamed;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const file = path.join(__dirname, '..', 'data', 'games.json');
  const gamesData = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const renamed = migrate(gamesData);
  const left = Object.values(gamesData.games).filter((g) => g.slug && NON_ASCII.test(g.slug)).length;
  for (const r of renamed.slice(0, 40)) console.log(`  ${r.from} → ${r.to}`);
  console.log(`${dryRun ? '[dry-run] ' : ''}renamed ${renamed.length} slugs; ${left} games without a Latin name keep a native-script slug`);
  if (!dryRun && renamed.length) fs.writeFileSync(file, '\ufeff' + JSON.stringify(gamesData, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8');
}

module.exports = { migrate };
