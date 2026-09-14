'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { selectGrowth, projectModel, compareReports } = require('./preview-global-chart-growth-2026');
const root = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const config = read('data/rank-models/global-chart-2026-growth-assumptions.json');
const base = read(config.baseModel);

test('country evidence precedes region and global proxy assumptions', () => {
  assert.equal(selectGrowth('DE', config).rate, 0.07);
  assert.equal(selectGrowth('IT', config).rate, 0.10);
  assert.equal(selectGrowth('BR', config).rate, -0.02);
  assert.equal(selectGrowth('ID', config).rate, 0);
});

test('growth changes only market sizes and weights, retaining store shares and chart scope', () => {
  const model = projectModel(base, config);
  const before = new Map(base.countries.map((row) => [row.country, row]));
  assert.equal(model.countries.length, base.countries.length);
  for (const row of model.countries) {
    const old = before.get(row.country);
    assert.equal(row.marketProxyUsd, Math.round(old.marketProxyUsd * (1 + selectGrowth(row.country, config).rate)));
    assert.deepEqual(row.storeShares, old.storeShares);
    assert.equal(row.storeWeights.android === 0, old.storeWeights.android === 0);
  }
  assert.ok(Math.abs(model.countries.reduce((sum, row) => sum + row.storeWeights.ios + row.storeWeights.android, 0) - 1) < 1e-12);
  assert.equal(model.countries.reduce((sum, row) => sum + row.marketProxyUsd, 0), model.budgets.observedScopeBudgetUsd);
  assert.deepEqual(model.rankCurve, base.rankCurve);
  assert.equal(model.productionEnabled, false);
  assert.equal(model.target.outputIsEstimatedRevenue, false);
});

test('zero growth preserves weights and scenario multipliers remain explicit', () => {
  const neutral = projectModel(base, config, 0);
  for (const row of neutral.countries) {
    const old = base.countries.find((item) => item.country === row.country);
    assert.equal(row.marketProxyUsd, old.marketProxyUsd);
    assert.ok(Math.abs(row.marketWeight - old.marketWeight) < 1e-12);
  }
  for (const multiplier of config.sensitivityMultipliers) {
    const model = projectModel(base, config, multiplier);
    assert.ok(model.countries.every((row) => row.growth.multiplier === multiplier && row.marketProxyUsd > 0));
  }
  assert.throws(() => projectModel(base, config, -1), /Invalid growth/);
});

test('comparison rejects a date change instead of attributing it to growth', () => {
  const before = { snapshot: { date: '2026-09-08' }, results: [{ key: 'a', rank: 2, score: 10 }] };
  const after = { snapshot: before.snapshot, results: [{ key: 'a', rank: 1, score: 11 }] };
  const row = compareReports(before, after)[0];
  assert.equal(row.baseline2025Rank, 2);
  assert.equal(row.growthRankChange, 1);
  assert.ok(Math.abs(row.scoreChangePercent - 10) < 1e-10);
  assert.throws(() => compareReports(before, { ...after, snapshot: { date: '2026-09-09' } }), /same snapshot/);
});
