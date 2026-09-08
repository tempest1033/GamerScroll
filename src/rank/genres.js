'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
let cache;
function loadGenres() {
  if (cache) return cache;
  const config = read('game-classifications.json');
  const categories = config.categories;
  const ids = new Set(categories.map(c => c.id));
  const assignments = new Map();
  const official = read('game-store-genres.json');
  for (const [slug, item] of Object.entries(official.games)) {
    for (const id of item.genres) if (!ids.has(id)) throw new Error(`Unknown store category: ${slug}: ${id}`);
    assignments.set(slug, item.genres);
  }
  for (const [slug, item] of Object.entries(config.games)) {
    const values = [...new Set([...(item.genres ?? assignments.get(slug) ?? []), ...(item.tags || [])])];
    for (const id of values) if (!ids.has(id)) throw new Error(`Unknown game category: ${slug}: ${id}`);
    assignments.set(slug, values);
  }
  // 기존 수동 서브컬처 목록은 재사용한다. 새 파일에서 tags를 명시하면 그것이 우선이다.
  for (const item of read('subculture-games.json').games) {
    if (Object.prototype.hasOwnProperty.call(config.games[item.slug] || {}, 'tags')) continue;
    assignments.set(item.slug, [...new Set([...(assignments.get(item.slug) || []), 'subculture'])]);
  }
  cache = {
    categories,
    assignments,
    matches: (game, id) => id === 'all' || !!(game && (assignments.get(game.slug) || []).includes(id)),
    tagsFor: game => game ? assignments.get(game.slug) || [] : [],
  };
  return cache;
}
module.exports = { loadGenres };
