'use strict';

/** A game page is indexable with 30+ chart days or while it is on a tracked chart (isIndexableGame). Run: node scripts/test-game-indexable.js */
const assert = require('node:assert/strict');
const { isIndexableGame, INDEXABLE_DAYS } = require('../src/templates/helpers/game-rank-summary');

const meta = { days: Array.from({ length: 100 }, (_, i) => `d${i}`) };
const rankWithDays = (n) => ({ s: { kr: { ios: { o: 100 - n, v: Array(n).fill(1) } } } });

assert.equal(isIndexableGame(rankWithDays(INDEXABLE_DAYS), false, meta), true, '30 days of history');
assert.equal(isIndexableGame(rankWithDays(INDEXABLE_DAYS - 1), false, meta), false, 'short history, not charting');
assert.equal(isIndexableGame(rankWithDays(3), true, meta), true, 'short history but charting now');
assert.equal(isIndexableGame(null, true, meta), true, 'no mobile rank data but on a chart (Steam)');
assert.equal(isIndexableGame(null, false, meta), false, 'neither');
console.log('ok - isIndexableGame');
