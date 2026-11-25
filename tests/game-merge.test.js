'use strict';
// The daily sync merges duplicate game records itself (scripts/sync-and-enrich.js mergeSameTitle).
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSameTitle } = require('../scripts/sync-and-enrich');

const fixture = () => ({ games: {
  Arknights: { appIds: { android: 'com.YoStarEN.Arknights' }, aliases: [], developer: 'Yostar Limited.', slug: 'arknights', platforms: ['android'], names: { en: 'Arknights' } },
  'Arknights (YOSTAR (HONG KONG) LIMITED)': { appIds: { ios_us: '1464872022' }, aliases: ['Arknights'], developer: 'YOSTAR (HONG KONG) LIMITED', slug: 'arknights-us', platforms: ['ios'], names: { en: 'Arknights' }, legacySlugs: ['arknights-old'] },
  Solitaire: { appIds: { ios: '1' }, aliases: [], developer: 'MobilityWare', slug: 'solitaire', platforms: ['ios'], names: { ko: '솔리테어' } },
  'Solitaire Fish': { appIds: { android: 'fish' }, aliases: [], developer: 'Wood Puzzle Sudoku Games', slug: 'solitaire-fish', platforms: ['android'], names: { ko: '솔리테어' } },
  'Cats A': { appIds: { android: 'a.one' }, aliases: [], developer: 'Neowiz', slug: 'cats', platforms: ['android'], names: { en: 'Cats' } },
  'Cats B': { appIds: { android: 'b.two' }, aliases: [], developer: 'Neowiz', slug: 'cats-b', platforms: ['android'], names: { en: 'Cats' } },
} });
// Revenue-chart days per app: the App Store US app has the longer history.
const S = { daysOnChart: (country, store, id) => (id === '1464872022' ? 100 : id === 'com.YoStarEN.Arknights' ? 1 : 0) };

test('sync merges records with one title, one developer and compatible store IDs into the one with the longer chart history', () => {
  const gamesData = fixture();
  assert.deepEqual(mergeSameTitle(gamesData, S), [{ kept: 'arknights-us', merged: ['arknights'] }]);
  const kept = gamesData.games['Arknights (YOSTAR (HONG KONG) LIMITED)'];
  assert.equal(gamesData.games.Arknights, undefined);
  assert.deepEqual(kept.appIds, { ios_us: '1464872022', android: 'com.YoStarEN.Arknights' });
  assert.deepEqual(kept.legacySlugs, ['arknights-old', 'arknights']);
  assert.deepEqual(kept.platforms, ['ios', 'android']);
  assert.ok(gamesData.games.Solitaire && gamesData.games['Solitaire Fish'], 'other developer: kept apart');
  assert.ok(gamesData.games['Cats A'] && gamesData.games['Cats B'], 'two different apps for one store: kept apart');
  assert.equal(gamesData.totalGames, 5);
  assert.deepEqual(mergeSameTitle(gamesData, S), [], 'a merged DB stays as it is');
});

test('the committed game DB has no duplicate left for the sync to merge', () => {
  const { loadGames } = require('../scripts/sync-and-enrich');
  assert.deepEqual(mergeSameTitle(loadGames()), []);
});
