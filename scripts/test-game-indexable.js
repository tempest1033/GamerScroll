'use strict';

/** A game page is indexable in an edition with 30+ chart days in that edition's market, while on that market's chart, or while on a Steam list (isIndexableGame). Run: node scripts/test-game-indexable.js */
const assert = require('node:assert/strict');
const { isIndexableGame, INDEXABLE_DAYS } = require('../src/templates/helpers/game-rank-summary');

const meta = { days: Array.from({ length: 100 }, (_, i) => `d${i}`) };
// n chart days in Korea, ending `gap` days before the latest day
const rankWithDays = (n, gap = 1) => ({ s: { kr: { ios: { o: 100 - gap - n, v: Array(n).fill(1) } } } });

assert.equal(isIndexableGame(rankWithDays(INDEXABLE_DAYS), false, meta, 'kr'), true, '30 days of history in the market');
assert.equal(isIndexableGame(rankWithDays(INDEXABLE_DAYS - 1), false, meta, 'kr'), false, 'short history, off the chart');
assert.equal(isIndexableGame(rankWithDays(3, 0), false, meta, 'kr'), true, 'short history but on the market chart now');
assert.equal(isIndexableGame(rankWithDays(90, 0), false, meta, 'jp'), false, 'another market\'s game stays out of this edition');
assert.equal(isIndexableGame(rankWithDays(3), true, meta, 'jp'), true, 'on a Steam list: every edition');
assert.equal(isIndexableGame(null, true, meta, 'us'), true, 'no mobile rank data but on a Steam list');
assert.equal(isIndexableGame(null, false, meta, 'us'), false, 'neither');
console.log('ok - isIndexableGame');
