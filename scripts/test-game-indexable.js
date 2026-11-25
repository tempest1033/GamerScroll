'use strict';

/** A game page is indexable in an edition with 30+ chart days in that edition's market, while on that market's chart, or on Steam (isIndexableGame); the sitemap lists only the market's recent TOP 100 (chartsInMarket). Run: node scripts/test-game-indexable.js */
const assert = require('node:assert/strict');
const { isIndexableGame, chartsInMarket, INDEXABLE_DAYS, PRIORITY_RANK, PRIORITY_DAYS } = require('../src/templates/helpers/game-rank-summary');

const meta = { days: Array.from({ length: 100 }, (_, i) => `d${i}`) };
// n chart days in Korea, ending `gap` days before the latest day
const rankWithDays = (n, gap = 1) => ({ s: { kr: { ios: { o: 100 - gap - n, v: Array(n).fill(1) } } } });
// n chart days at `rank` in Korea's App Store chart, ending `gap` days before the latest day
const rankWith = (n, rank, gap = 0) => ({ s: { kr: { ios: { o: 100 - gap - n, v: Array(n).fill(rank) } } } });

assert.equal(isIndexableGame(rankWithDays(INDEXABLE_DAYS), false, meta, 'kr'), true, '30 days of history in the market');
assert.equal(isIndexableGame(rankWithDays(INDEXABLE_DAYS - 1), false, meta, 'kr'), false, 'short history, off the chart');
assert.equal(isIndexableGame(rankWithDays(3, 0), false, meta, 'kr'), true, 'short history but on the market chart now');
assert.equal(isIndexableGame(rankWithDays(90, 0), false, meta, 'jp'), false, 'another market\'s game stays out of this edition');
assert.equal(isIndexableGame(rankWithDays(3), true, meta, 'jp'), true, 'on Steam: every edition');
assert.equal(isIndexableGame(null, true, meta, 'us'), true, 'no mobile rank data but on Steam');
assert.equal(isIndexableGame(null, false, meta, 'us'), false, 'neither');
assert.equal(isIndexableGame(rankWith(350, 150, 40), false, meta, 'kr'), true, 'a long-charting game stays indexable off the TOP 100');

assert.equal(chartsInMarket(rankWith(1, PRIORITY_RANK), meta, 'kr'), true, 'in the market TOP 100 today');
assert.equal(chartsInMarket(rankWith(1, PRIORITY_RANK, PRIORITY_DAYS - 1), meta, 'kr'), true, 'in the TOP 100 on the oldest day of the window');
assert.equal(chartsInMarket(rankWith(60, 1, PRIORITY_DAYS), meta, 'kr'), false, 'not in the TOP 100 in the last 14 days');
assert.equal(chartsInMarket(rankWith(90, PRIORITY_RANK + 1), meta, 'kr'), false, 'on the chart every day, below the TOP 100');
assert.equal(chartsInMarket(rankWith(90, 1), meta, 'jp') || chartsInMarket(null, meta, 'kr'), false, 'another market or no rank data');
console.log('ok - isIndexableGame');
