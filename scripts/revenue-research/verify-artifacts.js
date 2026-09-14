'use strict';

// Essential data/provenance checks only; model accuracy remains an advisory research outcome.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const schema = require('../anchors/lib/anchor-schema');
const root = path.resolve(__dirname, '../..');
const load = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const failures = [];
const passed = [];
const check = (name, fn) => {
  try { fn(); passed.push(name); } catch (error) { failures.push({ name, error: error.message }); }
};
const ledger = schema.readLedger();
const sources = schema.readSources();
check('canonical ledger scopes and source references', () => {
  assert.equal(new Set(ledger.map(row => row.id)).size, ledger.length);
  for (const row of ledger) {
    assert.equal(row.schema_version, 2);
    assert.deepEqual(schema.validate(row, sources), [], row.id);
    assert.equal(row.id, schema.makeId(row));
    if (row.duplicate_of) assert(ledger.some(candidate => candidate.id === row.duplicate_of));
  }
});
check('pre-migration observations remain recoverable by legacy IDs and amounts', () => {
  const previous = fs.readFileSync(path.join(schema.LEDGER_DIR, 'anchors.pre-scope-v2.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse);
  for (const old of previous) {
    const resolution = schema.resolveAnchorId(ledger, old.id);
    assert.notEqual(resolution.status, 'missing', old.id);
    assert(ledger.some(row => resolution.ids.includes(row.id)
      && row.currency === old.currency
      && row.amount * row.unit_multiplier === old.amount * old.unit_multiplier), old.id);
  }
});
check('complete Japan holiday store budgets survive ledger construction', () => {
  const rows = ledger.filter(row => row.source_id === 'N01' && row.metric === 'market_total');
  assert.equal(rows.length, 3);
  const totals = Object.fromEntries(rows.map(row => [row.stores.join('+'), row.amount_usd_m]));
  assert.equal(totals['app_store+google_play'], totals.app_store + totals.google_play);
  assert(rows.every(row => row.fee_basis === 'gross'));
});
for (const name of ['normalized-simulation', 'normalized-grouping-simulation']) {
  check(`${name}: parent inputs and held-out separation`, () => {
    const report = load(`reports/rank-models/${name}-2026-09-10.json`);
    assert.equal(report.productionEnabled, false);
    for (const input of report.inputs) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, input.path))).digest('hex');
      assert.equal(hash, input.sha256, `Stale input: ${input.path}`);
    }
    for (const result of report.results) {
      assert.equal(result.folds.length, report.names.length);
      for (const fold of result.folds) {
        assert(!fold.trainingIndices.includes(fold.heldoutIndex));
        assert.equal(new Set(fold.trainingIndices).size, report.names.length - 1);
        assert(Number.isFinite(fold.prediction) && fold.prediction > 0);
      }
    }
  });
}
for (const name of ['budget-constrained-simulation', 'country-constrained-simulation']) {
  check(`${name}: accounting bounds and declared failures`, () => {
    const report = load(`reports/rank-models/${name}-2026-09-10.json`);
    const ceiling = report.worldBudgetEvidence.scenarioBudgetMillion;
    assert.equal(report.productionEnabled, false);
    for (const result of report.results) {
      for (const fit of [result.fitted, ...result.folds]) {
        if (!fit.success) { assert(Array.isArray(fit.failures) && fit.failures.length); continue; }
        assert(fit.groupBudgetsMillion.every(amount => Number.isFinite(amount) && amount >= 0));
        assert(fit.modeledTop200Million <= ceiling + 1e-5);
        assert(fit.predictions.every(amount => Number.isFinite(amount) && amount >= 0));
      }
      for (const country of result.countryAccounting || []) {
        if (country.modeledTop200Million !== null) assert(country.modeledTop200Million <= country.capMillion + 1e-5);
      }
    }
  });
}
check('identity-only September panel contains no August labels', () => {
  const panel = load('reports/rank-models/september-boundary-observations-2026-09-10.json');
  assert.equal(panel.observationOnly, true);
  assert(panel.games.every(game => game.reference === null));
  assert.equal(panel.regionalAnchors.length, 0);
  assert.equal(panel.source, null);
});
check('Japan ordinal profile keeps co-optimal sets rather than a hidden selected point', () => {
  const profile = load('reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json');
  assert(profile.coOptimalSet.size > 0);
  assert.equal(profile.folds.length, profile.names.length);
  assert.equal(profile.productionEnabled, false);
  for (const fold of profile.folds) {
    assert(fold.coOptimalSet.size > 0);
    assert(fold.heldoutViolationRange[0] >= 0);
    assert(fold.heldoutViolationRange[1] <= fold.heldoutPairCount);
  }
});
check('calendar diagnostics contain every declared distinct completed case', () => {
  for (const name of ['japan-calendar-stability', 'japan-calendar-elapsed']) {
    const relative = `reports/rank-models/${name}-2026-09-10.json`;
    if (!fs.existsSync(path.join(root, relative))) continue;
    const report = load(relative);
    assert.equal(report.productionEnabled, false);
    assert.equal(report.status, 'completed');
    assert.equal(report.results.length, report.plannedCases);
    assert.equal(report.completedCases, report.plannedCases);
    assert.equal(new Set(report.results.map(row => row.excludedObservationDates.join(','))).size,
      report.plannedCases);
    for (const row of report.results) {
      assert(Number.isFinite(row.minimumPairViolations));
      assert(row.minimumPairViolations >= 0 && row.minimumPairViolations <= row.comparedPairs);
    }
  }
});
check('temporal transfer amounts conserve country contributions without extrapolation', () => {
  const report = load('reports/rank-models/september-weekly-transfer-2026-09-10.json');
  assert.equal(report.productionEnabled, false);
  assert.equal(report.source.periodBoundsExplicitInSource, false);
  for (const row of report.rows) {
    for (const scenario of row.scenarios) {
      if (scenario.status === 'insufficient_boundary_history') {
        assert.equal(scenario.predictionMillion, undefined);
        continue;
      }
      assert(Number.isFinite(scenario.predictionMillion) && scenario.predictionMillion >= 0);
      const sum = Object.values(scenario.countryPredictionsMillion).reduce((a, b) => a + b, 0);
      assert(Math.abs(sum - scenario.predictionMillion) < 1e-8);
    }
  }
});
check('holiday money diagnostics retain every ordinal candidate and published qualifier', () => {
  const report = load('reports/rank-models/japan-holiday-money-2026-09-10.json');
  const profile = load('reports/rank-models/japan-ordinal-profile-resolution-2026-09-10.json');
  assert.equal(report.parameterCount, profile.coOptimalSet.size);
  assert.equal(report.rows.length, report.parameterCount);
  assert.equal(report.reference.qualifier, 'more_than');
  for (const row of report.rows) {
    const sum = Object.values(row.storeUpperMillion).reduce((a, b) => a + b, 0);
    assert(Number.isFinite(sum) && sum >= 0);
    assert(Math.abs(sum - row.fullStoreBudgetUpperMillion) < 1e-8);
  }
});
const receipt = { schemaVersion: 1, checkedAt: new Date().toISOString(), passed, failures, productionEnabled: false };
fs.writeFileSync(path.join(root, 'reports/rank-models/research-integrity-2026-09-10.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
process.exitCode = failures.length ? 1 : 0;
