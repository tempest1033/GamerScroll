'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planSchedule, auditRun } = require('./prospective-ranks');

test('scheduled samples retain their hard budget and final verification reserve', () => {
  const minute = 60000;
  assert.deepEqual(planSchedule(0, 108 * minute, 4, 30 * minute, 6 * minute, 10 * minute),
    [0, 30 * minute, 60 * minute, 90 * minute]);
  assert.deepEqual(planSchedule(0, 100 * minute, 4, 30 * minute, 6 * minute, 10 * minute),
    [0, 30 * minute, 60 * minute]);
  assert.deepEqual(planSchedule(0, 15 * minute, 4, 30 * minute, 6 * minute, 10 * minute), []);
});

test('audit identifies metadata gaps without treating older chart rows as current', () => {
  const day = {
    date: '2026-09-11', ids: ['first', 'second'],
    lists: { ios_jp_grossing: { times: ['12:00'], ranks: [[0, 1]] } },
    runs: {
      '12:00': { charts: { ios_jp_grossing: { status: 'ok', count: 2 } } },
      '12:30': { charts: { ios_jp_grossing: { status: 'error', count: 0 } } },
    },
  };
  const apps = { 'ios:first': { t: 'Title' } };
  const first = auditRun(day, '12:00', apps).charts[0];
  assert.deepEqual(first.metadataAbsentFromResearchDictionary, [{ rank: 2, id: 'second' }]);
  assert.deepEqual(first.orderedIds, ['first', 'second']);
  const failed = auditRun(day, '12:30', apps).charts[0];
  assert.equal(failed.status, 'error');
  assert.equal(failed.retainedCount, 0);
  assert.deepEqual(failed.orderedIds, []);
});
