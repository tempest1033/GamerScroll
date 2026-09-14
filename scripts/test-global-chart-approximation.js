'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { allocateBudget, proxyInputs, buildModel, renderTable } = require('./build-global-chart-approximation');
const { COUNTRY_CODES } = require('../src/crawlers/storefronts');
const root = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const config = read('data/rank-models/global-chart-2025-v0.2-assumptions.json');
const base = read(config.baseModel);
const macro = read(config.macroData);

test('allocation preserves the budget and assigns rounding residuals deterministically', () => {
  const rows = [{ country: 'AA', weight: 1 }, { country: 'BB', weight: 1 }, { country: 'CC', weight: 1 }];
  assert.deepEqual(allocateBudget(10000, rows), { AA: 4000, BB: 3000, CC: 3000 });
  assert.deepEqual(allocateBudget(10000, [...rows].reverse()), { AA: 4000, BB: 3000, CC: 3000 });
  assert.throws(() => allocateBudget(1000, []));
  assert.throws(() => allocateBudget(1000, [{ country: 'AA', weight: 0 }]));
});

test('missing macro inputs are identified as assumptions rather than observations', () => {
  const result = proxyInputs('AI', config, macro);
  assert.ok(Object.values(result.inputs).every((item) => item.basis === 'explicit_assumption' && item.year === null));
  const noFallback = { ...config, missingIndicatorAssumptions: {} };
  assert.throws(() => proxyInputs('AI', noFallback, macro), /explicit assumption/);
});

test('all 128 countries receive positive weights without changing the 25 base markets', () => {
  const model = buildModel(base, config, macro);
  assert.deepEqual(model.countries.map((row) => row.country).sort(), [...COUNTRY_CODES].sort());
  assert.equal(new Set(model.countries.map((row) => row.country)).size, COUNTRY_CODES.length);
  for (const original of base.countries) {
    const row = model.countries.find((item) => item.country === original.country);
    assert.equal(row.marketProxyUsd, Math.round(original.marketProxyUsdB * 1e9));
    assert.equal(row.storeShares.ios, base.storeShareMethods[original.storeShareMethod].ios);
    assert.equal(row.storeShares.android, base.storeShareMethods[original.storeShareMethod].android);
  }
  let weight = 0;
  for (const row of model.countries) {
    assert.ok(row.marketProxyUsd > 0);
    assert.ok(row.storeWeights.ios >= 0 && row.storeWeights.android >= 0);
    weight += row.storeWeights.ios + row.storeWeights.android;
    if (row.method === 'regional_macro_allocation') {
      assert.equal(row.confidence, 'very_low');
      assert.equal(row.storeShares.basis, 'scenario_assumption');
      for (const item of Object.values(row.macroInputs)) {
        if (item.basis === 'world_bank') assert.ok(item.year >= 2020 && item.year <= 2024);
      }
    }
  }
  assert.ok(Math.abs(weight - 1) < 1e-12);
  assert.equal(model.countries.reduce((sum, row) => sum + row.marketProxyUsd, 0), model.budgets.observedScopeBudgetUsd);
  for (const [region, budget] of Object.entries(model.budgets.residualRegionBudgetsUsd)) {
    assert.equal(model.countries.filter((row) => row.region === region).reduce((sum, row) => sum + row.marketProxyUsd, 0), budget);
  }
  assert.equal(model.productionEnabled, false);
  assert.equal(model.target.outputIsEstimatedRevenue, false);
  const markdown = renderTable(model, config);
  for (const row of model.countries) assert.ok(markdown.includes(`| ${row.name} | ${row.country} |`));
});

test('budget and proxy scenarios change inferred markets but preserve reference markets', () => {
  const nominal = buildModel(base, config, macro);
  for (const total of config.sensitivity.hypotheticalTotalUsd) {
    const modified = { ...config, budget: { ...config.budget, hypotheticalTotalUsd: total } };
    const model = buildModel(base, modified, macro);
    assert.equal(model.countries.find((row) => row.country === 'US').marketProxyUsd,
      nominal.countries.find((row) => row.country === 'US').marketProxyUsd);
    assert.equal(model.budgets.observedScopeBudgetUsd + model.budgets.uncollectedReserveUsd, total);
  }
  const shifted = buildModel(base, { ...config, proxy: { ...config.proxy, incomeExponent: 1 } }, macro);
  assert.notEqual(shifted.countries.find((row) => row.country === 'BR').marketProxyUsd,
    nominal.countries.find((row) => row.country === 'BR').marketProxyUsd);
});
