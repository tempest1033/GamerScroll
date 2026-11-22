'use strict';

/**
 * URL slug rule for game pages (/games/<slug>/, the same slug in every edition).
 * A game with a Latin-script name gets a plain ASCII slug from it, so no edition's URL carries another edition's script.
 * A game known only by a native-script name (single-market titles) keeps a slug in that script: there is no other name.
 * Used by scripts/migrate-game-slugs.js (existing games) and scripts/sync-and-enrich.js (new games).
 */
const { CJK } = require('../rank/name-script');

const NAME_ORDER = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
const MAX_LENGTH = 60;
const letters = (s) => (String(s).match(/[a-z]/gi) || []).length;
const isLatin = (s) => typeof s === 'string' && !CJK.test(s) && !/[^\u0000-\u024F\u2000-\u214F]/.test(s) && letters(s) >= 2;

function asciiSlug(text) {
  let slug = String(text || '')
    .replace(/[™®©]/g, '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > MAX_LENGTH) slug = slug.slice(0, MAX_LENGTH + 1).replace(/-[^-]*$/, '').replace(/-+$/, '');
  return /[a-z]/.test(slug) && slug.length >= 2 ? slug : '';
}

// The DB key without its disambiguator: " (developer)" or the market ("Name (TW)", "Name (JP 2)").
function baseKey(key, developer) {
  const text = String(key || '');
  const suffix = developer ? ` (${developer})` : null;
  return (suffix && text.endsWith(suffix) ? text.slice(0, -suffix.length) : text).replace(/\s*\([A-Z]{2}(?: \d+)?\)$/, '');
}
const GLOSS_RE = /[(（]([^()（）]*)[)）]/g;

// The game's Latin-script name: English store name → another market's Latin store name → the longest Latin alias →
// the DB key (its "(other-script name)" gloss dropped) → a Latin gloss of a native-script key. null when it has none.
function latinName(key, game = {}) {
  const names = game.names || {};
  for (const code of NAME_ORDER) if (isLatin(names[code])) return names[code];
  const alias = (game.aliases || []).filter((a) => isLatin(a) && letters(a) >= 4).sort((a, b) => b.length - a.length)[0];
  if (alias) return alias;
  const base = baseKey(key, game.developer);
  const main = base.replace(GLOSS_RE, ' ').trim();
  if (isLatin(main)) return main;
  if (isLatin(base)) return base;
  const gloss = [...base.matchAll(GLOSS_RE)].map((m) => m[1].trim()).find((x) => isLatin(x) && (letters(x) >= 6 || /[a-z]\s+[a-z]/i.test(x)));
  return gloss || null;
}

// ASCII slug from the game's Latin name; '' when the game has no Latin name.
function latinSlug(key, game) {
  const name = latinName(key, game);
  return name ? asciiSlug(name) : '';
}

// `slug`, or the first free variant: -<developer>, then -2, -3, ...
function uniqueOf(slug, developer, used) {
  if (!used.has(slug)) return slug;
  const dev = isLatin(developer) ? asciiSlug(developer).split('-').slice(0, 2).join('-') : '';
  if (dev && !slug.endsWith(`-${dev}`) && !used.has(`${slug}-${dev}`)) return `${slug}-${dev}`;
  for (let n = 2; ; n++) if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

// Every slug a game has answered to: the current one first, then the retired ones (data files written before a rename
// still key the game by those, and old URLs redirect from them).
const slugKeys = (game) => (game ? [game.slug, ...(game.legacySlugs || [])].filter(Boolean) : []);

module.exports = { asciiSlug, latinName, latinSlug, uniqueOf, slugKeys, isLatin };
