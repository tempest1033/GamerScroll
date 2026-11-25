'use strict';
// The daily sync merges duplicate game records itself (scripts/sync-and-enrich.js mergeSameTitle).
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSameTitle } = require('../scripts/sync-and-enrich');

const fixture = () => ({ games: {
  Arknights: { appIds: { android: 'com.YoStarEN.Arknights' }, aliases: [], developer: 'Yostar Limited.', slug: 'arknights', platforms: ['android'], names: { en: 'Arknights' } },
  'Arknights (Yostar)': { appIds: { ios_us: '1464872022' }, aliases: ['Arknights'], developer: 'YOSTAR LIMITED', slug: 'arknights-us', platforms: ['ios'], names: { en: 'Arknights' }, legacySlugs: ['arknights-old'] },
  Solitaire: { appIds: { ios: '1' }, aliases: [], developer: 'MobilityWare', slug: 'solitaire', platforms: ['ios'], names: { ko: '솔리테어' } },
  'Solitaire Fish': { appIds: { android: 'fish' }, aliases: [], developer: 'Wood Puzzle Sudoku Games', slug: 'solitaire-fish', platforms: ['android'], names: { ko: '솔리테어' } },
  'Cats A': { appIds: { android: 'a.one' }, aliases: [], developer: 'Neowiz', slug: 'cats', platforms: ['android'], names: { en: 'Cats' } },
  'Cats B': { appIds: { android: 'b.two' }, aliases: [], developer: 'Neowiz', slug: 'cats-b', platforms: ['android'], names: { en: 'Cats' } },
  // Two different games that share only a zh-tw name; one has no developer.
  '2~4 인용 미니게임': { appIds: { ios: '1269516792' }, aliases: [], developer: 'Jochem Bergman', slug: '2-4-인용-미니게임', platforms: ['ios'], names: { 'zh-tw': '2-4人小遊戲' } },
  '2~4인 미니 게임하기': { appIds: { android: 'com.ction.playergames' }, aliases: [], developer: '', slug: '2-4인-미니-게임하기', platforms: ['android'], names: { 'zh-tw': '2-4人小遊戲' } },
  // Same title and developer, only a prefix of the developer name in common with the next one.
  'Tower A': { appIds: { ios: '7' }, aliases: [], developer: 'Moon Active', slug: 'tower', platforms: ['ios'], names: { en: 'Tower' } },
  'Tower B': { appIds: { android: 'moon.tower' }, aliases: [], developer: 'Moonton', slug: 'tower-b', platforms: ['android'], names: { en: 'Tower' } },
  // A pair without slugs: their pages live under generated slugs.
  'Puzzle Quest': { appIds: { ios: '42' }, aliases: [], developer: 'Infinity Plus 2', platforms: ['ios'], names: { en: 'Puzzle Quest' } },
  'Puzzle Quest (GP)': { appIds: { android: 'com.ip2.pq' }, aliases: [], developer: 'Infinity Plus 2', platforms: ['android'], names: { en: 'Puzzle Quest' } },
} });
// Revenue-chart days per app: the App Store US app and the App Store Puzzle Quest have the longer history.
const DAYS = { 1464872022: 100, 'com.YoStarEN.Arknights': 1, 42: 50 };
const S = { daysOnChart: (country, store, id) => DAYS[id] || 0 };

test('sync merges records with one title, one developer and compatible store IDs into the one with the longer chart history', () => {
  const gamesData = fixture();
  assert.deepEqual(mergeSameTitle(gamesData, S), [{ kept: 'arknights-us', merged: ['arknights'] }, { kept: 'puzzle-quest', merged: ['com-ip2-pq'] }]);
  const kept = gamesData.games['Arknights (Yostar)'];
  assert.equal(gamesData.games.Arknights, undefined);
  assert.deepEqual(kept.appIds, { ios_us: '1464872022', android: 'com.YoStarEN.Arknights' });
  assert.deepEqual(kept.legacySlugs, ['arknights-old', 'arknights']);
  assert.deepEqual(kept.platforms, ['ios', 'android']);
  assert.ok(gamesData.games.Solitaire && gamesData.games['Solitaire Fish'], 'other developer: kept apart');
  assert.ok(gamesData.games['Cats A'] && gamesData.games['Cats B'], 'two different apps for one store: kept apart');
  assert.ok(gamesData.games['2~4 인용 미니게임'] && gamesData.games['2~4인 미니 게임하기'], 'a record without a developer: kept apart');
  assert.ok(gamesData.games['Tower A'] && gamesData.games['Tower B'], 'developer names that only share a prefix: kept apart');
  // the kept page stays under its generated slug although it gains a Google Play ID, which would generate another one
  const pq = gamesData.games['Puzzle Quest'];
  assert.equal(pq.slug, 'puzzle-quest');
  assert.deepEqual(pq.legacySlugs, ['com-ip2-pq']);
  assert.equal(gamesData.totalGames, 10);
  assert.deepEqual(mergeSameTitle(gamesData, S), [], 'a merged DB stays as it is');
});

test('the committed game DB has no duplicate left for the sync to merge', () => {
  const { loadGames } = require('../scripts/sync-and-enrich');
  assert.deepEqual(mergeSameTitle(loadGames()), []);
});
