'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('./prospective-rank-summary');

function manifest(series) {
  return {
    status: 'sampling_complete', finishedAt: '2026-09-11T02:00:00Z',
    protocol: { countries: ['CN'] },
    samples: series.map((ids, index) => ({
      number: index + 1,
      audits: [{
        charts: [{
          key: 'ios_cn_grossing', status: ids ? 'ok' : 'error',
          observedAt: `2026-09-11T0${index}:00:00Z`,
          orderedIds: ids || [], orderedIdSha256: JSON.stringify(ids),
          duplicateIdCount: 0,
          metadataAbsentFromResearchDictionary: [], metadataTitleEmpty: [],
        }],
      }],
    })),
  };
}

test('rank movement and censored arrivals are reported without assigning missing ranks', () => {
  const result = summarize(manifest([['a', 'b', 'c'], ['b', 'a', 'd']]));
  const pair = result.chartSummaries[0].consecutivePairs[0];
  assert.equal(pair.observationGapMinutes, 60);
  assert.equal(pair.commonIds, 2);
  assert.equal(pair.absoluteRankMovementSum, 2);
  assert.deepEqual(pair.newlyObservedIds, ['d']);
  assert.deepEqual(pair.noLongerObservedIds, ['c']);
  assert.deepEqual(pair.movements.map((row) => row.delta), [-1, 1]);
});

test('a failed middle observation breaks the comparison rather than bridging the gap', () => {
  const result = summarize(manifest([['a', 'b'], null, ['b', 'a']]));
  assert.equal(result.validGrossingObservations, 2);
  assert.equal(result.comparableConsecutivePairs, 0);
  assert.equal(result.chartSummaries[0].skippedPairs.length, 2);
});

test('a shorter returned chart censors absent IDs while retained positions remain comparable', () => {
  const result = summarize(manifest([['a', 'b', 'c'], ['a', 'b']]));
  const pair = result.chartSummaries[0].consecutivePairs[0];
  assert.equal(pair.beforeDepth, 3);
  assert.equal(pair.afterDepth, 2);
  assert.equal(pair.movedCommonIds, 0);
  assert.deepEqual(pair.noLongerObservedIds, ['c']);
  assert.deepEqual(pair.movements, []);
});

test('unchanged fetches remain one distinct ordered list', () => {
  const result = summarize(manifest([['a', 'b'], ['a', 'b'], ['a', 'b']]));
  assert.equal(result.identicalConsecutivePairs, 2);
  assert.equal(result.chartSummaries[0].distinctOrderedLists, 1);
});

test('ongoing collection cannot produce a final summary', () => {
  const input = manifest([['a']]);
  input.status = 'collecting';
  assert.throws(() => summarize(input), /settle/);
});
