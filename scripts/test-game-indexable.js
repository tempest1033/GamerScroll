'use strict';

/** A game page is indexable in an edition while it is in that market's revenue TOP 100 on one of the last 14 chart days (chartsInMarket, the sitemap's priority games), or with a Steam record (isIndexableGame). Run: node scripts/test-game-indexable.js */
const assert = require('node:assert/strict');
const { isIndexableGame, chartsInMarket, PRIORITY_RANK, PRIORITY_DAYS } = require('../src/templates/helpers/game-rank-summary');

const meta = { days: Array.from({ length: 100 }, (_, i) => `d${i}`) };
// n chart days at `rank` in Korea's App Store chart, ending `gap` days before the latest day
const rankWith = (n, rank, gap = 0) => ({ s: { kr: { ios: { o: 100 - gap - n, v: Array(n).fill(rank) } } } });

assert.equal(isIndexableGame(rankWith(1, PRIORITY_RANK), false, meta, 'kr'), true, 'in the market TOP 100 today');
assert.equal(isIndexableGame(rankWith(1, PRIORITY_RANK, PRIORITY_DAYS - 1), false, meta, 'kr'), true, 'in the TOP 100 on the oldest day of the window');
assert.equal(isIndexableGame(rankWith(60, 1, PRIORITY_DAYS), false, meta, 'kr'), false, 'long history, but not in the TOP 100 in the last 14 days');
assert.equal(isIndexableGame(rankWith(90, PRIORITY_RANK + 1), false, meta, 'kr'), false, 'on the chart every day, below the TOP 100');
assert.equal(isIndexableGame(rankWith(90, 1), false, meta, 'jp'), false, 'another market\'s game stays out of this edition');
assert.equal(isIndexableGame(rankWith(3, 150), true, meta, 'jp'), true, 'a Steam record: every edition');
assert.equal(isIndexableGame(null, true, meta, 'us'), true, 'no mobile rank data but a Steam record');
assert.equal(isIndexableGame(null, false, meta, 'us'), false, 'neither');
assert.equal(chartsInMarket(rankWith(3, 150), meta, 'kr') || chartsInMarket(null, meta, 'kr'), false, 'the sitemap set has no game outside the market TOP 100');
console.log('ok - isIndexableGame');
