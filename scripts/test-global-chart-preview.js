'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chartDefinitions, selectCompleteRun, evaluateSnapshot, installPreviewIdentities } = require('./preview-global-chart-model');

const model = {
  modelId: 'fixture', baseYear: 2025, rankCurve: { alpha: 1 },
  countries: [
    { country: 'US', storeWeights: { ios: 0.8, android: 0 } },
    { country: 'KR', storeWeights: { ios: 0.2, android: 0 } }
  ]
};
const day = {
  date: '2026-01-01', ids: ['A', 'B', 'C'],
  lists: {
    ios_us_grossing: { times: ['01:00', '02:00'], ranks: [[0, 1], [1, 0]] },
    ios_kr_grossing: { times: ['01:00'], ranks: [[1, 0]] }
  }
};
const stats = {
  COUNTRIES: { us: '미국', kr: '한국' },
  keyOf: (_store, row) => row.appId,
  nameOf: (_store, row) => row.title,
  gameOf: () => ({ known: true }),
  aggregateGlobal: () => ({ list: [] })
};

test('the latest complete revenue cohort is selected without borrowing earlier chart rows', () => {
  const selected = selectCompleteRun([day], chartDefinitions(model));
  assert.equal(selected.time, '01:00');
  assert.deepEqual(selected.skipped[0].missingCharts, ['ios_kr_grossing']);
  assert.throws(() => evaluateSnapshot(day, '02:00', model, {}, stats), /Incomplete snapshot/);
});

test('market size and reciprocal rank jointly determine the index', () => {
  const report = evaluateSnapshot(day, '01:00', model, {}, stats);
  assert.equal(report.results[0].key, 'A');
  assert.equal(report.results[0].score, 90);
  assert.equal(report.results[1].score, 60);
  assert.equal(report.coverage.chartCount, 2);
});

test('aliases on one chart contribute once at their best observed position', () => {
  const aliases = { ...stats, keyOf: () => 'one-game' };
  const report = evaluateSnapshot(day, '01:00', model, {}, aliases);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].score, 100);
  assert.equal(report.coverage.aliasesCollapsed, 2);
});

test('invalid compressed app references cannot silently become anonymous entries', () => {
  const broken = structuredClone(day);
  broken.lists.ios_us_grossing.ranks[0] = [99];
  assert.throws(() => evaluateSnapshot(broken, '01:00', model, {}, stats), /Invalid app index/);
});

test('preview identity additions never overwrite an existing game mapping', () => {
  const existing = { key: 'existing' };
  const target = { byApp: new Map([['ios:old', existing]]) };
  const identities = { games: [{ key: 'joined', appIds: { ios: 'new', android: 'old' } }] };
  installPreviewIdentities(target, identities);
  assert.equal(target.byApp.get('ios:new'), target.byApp.get('android:old'));
  assert.equal(target.byApp.get('ios:old'), existing);
  const size = target.byApp.size;
  assert.throws(() => installPreviewIdentities(target, { games: [{ appIds: { ios: 'other', android: 'old' } }] }), /conflicts/);
  assert.equal(target.byApp.size, size);
});
