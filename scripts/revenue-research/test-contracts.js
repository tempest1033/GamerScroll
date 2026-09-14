'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { revenueMetrics, rankMetrics } = require('../lib/revenue-model-metrics');
const schema = require('../anchors/lib/anchor-schema');

const observation = overrides => ({
  game: 'Example Game', geography: 'JP', stores: ['app_store', 'google_play'],
  period: { kind: 'month', start: '2026-08-01', end: '2026-08-31' },
  amount: 10, currency: 'USD', metric: 'consumer_spend', fee_basis: 'gross',
  provider: 'Example Provider', source_id: 'example', added_on: '2026-09-10',
  evidence_role: 'benchmark', review_status: 'clear', ...overrides
});

test('amount metrics preserve scale-free errors when currency units change', () => {
  const actual = [10, 20, 40, 80], predicted = [15, 10, 30, 100];
  const a = revenueMetrics(actual, predicted);
  const b = revenueMetrics(actual.map(value => value * 1000), predicted.map(value => value * 1000));
  assert.equal(a.mapePercent, b.mapePercent);
  assert.equal(a.wapePercent, b.wapePercent);
  assert.equal(a.rmsLogError, b.rmsLogError);
  assert.equal(b.mae, a.mae * 1000);
  assert.equal(a.medianAbsolutePercentError, 37.5);
  assert.equal(a.aggregateBiasPercent, 5 / 150 * 100);
});

test('ranking metrics handle ties and undefined constant correlations', () => {
  const tied = rankMetrics([1, 1, 3], [1, 2, 3]);
  assert.equal(tied.referenceOnlyTies, 1);
  assert.equal(tied.comparedPairs, 3);
  assert(Math.abs(tied.kendallTauB - 2 / Math.sqrt(6)) < 1e-12);
  assert.equal(rankMetrics([1, 1], [1, 1]).spearman, null);
  assert.equal(rankMetrics([1, 1], [1, 1]).kendallTauB, null);
  const reversed = rankMetrics([1, 2, 3], [3, 2, 1]);
  assert.equal(reversed.rankInversions, 3);
  assert.equal(reversed.spearman, -1);
});

test('money evaluation rejects missing, zero, negative and non-finite values', () => {
  for (const value of [0, -1, NaN, Infinity, undefined]) {
    assert.throws(() => revenueMetrics([1], [value]));
  }
  assert.throws(() => revenueMetrics([], []));
  assert.throws(() => revenueMetrics([1, 2], [1]));
});

test('complete evidence scopes have distinct IDs while store order is immaterial', () => {
  const rows = [
    observation({ stores: ['app_store'] }),
    observation({ stores: ['google_play'] }),
    observation({}),
    observation({ fee_basis: 'net' }),
    observation({ currency: 'JPY' }),
    observation({ period: { kind: 'range', start: '2026-08-01', end: '2026-08-15' } })
  ].map(schema.normalize);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  const reordered = schema.normalize(observation({ stores: ['google_play', 'app_store', 'app_store'] }));
  assert.equal(reordered.id, rows[2].id);
  assert.deepEqual(schema.normalize(reordered), reordered);
});

test('legacy scope collisions return ambiguity instead of selecting a store', () => {
  const rows = [schema.normalize(observation({ stores: ['app_store'] })),
    schema.normalize(observation({ stores: ['google_play'] }))];
  const legacy = rows[0].legacy_ids[0];
  const resolution = schema.resolveAnchorId(rows, legacy);
  assert.equal(resolution.status, 'ambiguous');
  assert.equal(resolution.ids.length, 2);
  assert.equal(schema.resolveAnchorId(rows, rows[0].id).status, 'resolved');
  assert.equal(schema.resolveAnchorId(rows, 'missing').status, 'missing');
});

test('structured evidence status owns eligibility, not words inside notes', () => {
  const reviewed = schema.normalize(observation({ flags: ['review mentioned in an irrelevant quotation'] }));
  assert.equal(reviewed.fit.usable, true);
  const unresolved = schema.normalize(observation({ review_status: 'pending', flags: [] }));
  assert.equal(unresolved.fit.usable, false);
  const duplicate = schema.normalize(observation({ duplicate_of: 'another-observation' }));
  assert.equal(duplicate.fit.usable, false);
  assert.equal(schema.normalize(duplicate).fit.usable, false);
});

test('calendar and amount validation expose invalid data without crashing', () => {
  assert.doesNotThrow(() => schema.validate({}, {}));
  assert.equal(schema.validDate('2026-02-29'), false);
  assert.equal(schema.validDate('2024-02-29'), true);
  assert.equal(schema.validDate('2026-02-30'), false);
  const badDate = schema.normalize(observation({
    period: { kind: 'day', start: '2026-02-30', end: '2026-02-30' }
  }));
  assert(schema.validate(badDate).some(error => error.startsWith('period.start')));
  const overflow = schema.normalize(observation({ amount: 1e250, unit_multiplier: 1e250 }));
  assert(schema.validate(overflow).some(error => error.startsWith('amount_usd_m')));
  assert.throws(() => schema.normalize(observation({ stores: 'app_store' })), /array/);
});

test('gross/net, qualifier and missing-store observations remain distinct eligibility cases', () => {
  assert.equal(schema.normalize(observation({ fee_basis: 'net' })).fit.usable, false);
  assert.equal(schema.normalize(observation({ qualifier: 'more_than' })).fit.usable, false);
  assert.equal(schema.normalize(observation({ stores: [] })).fit.usable, false);
  assert.equal(schema.normalize(observation({ stores: ['one_store'] })).fit.usable, false);
});

test('a new observation period cannot silently inherit an old published rank table', () => {
  const { buildPanel } = require('../anchors/build-model-panel');
  assert.throws(() => buildPanel({
    observationGames: [], observationPeriod: { start: '2026-09-01', end: '2026-09-07' },
    rankReference: { period: { start: '2026-08-01', end: '2026-08-31' }, rows: [] }
  }), /Rank reference period/);
});
