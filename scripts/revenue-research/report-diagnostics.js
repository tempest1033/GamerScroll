'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { revenueMetrics, rankMetrics } = require('../lib/revenue-model-metrics');
const root = path.resolve(__dirname, '../..');
const load = name => JSON.parse(fs.readFileSync(path.join(root, `reports/rank-models/${name}-2026-09-10.json`), 'utf8'));
const stability = load('normalized-stability');
const expanded = load('expanded-rank-predictions');
const y = stability.targetsMillion;
const nestedPredictions = y.map((_, i) => stability.nestedSelection.find(row => row.heldoutIndex === i).prediction);
const omissionResults = Object.fromEntries(Object.entries(stability.groupOmissions).map(([size, candidates]) => [
  size, Object.fromEntries(Object.entries(candidates).map(([id, folds]) => {
    const actual = [], prediction = [];
    const perGame = y.map(() => []);
    for (const fold of folds) fold.heldoutIndices.forEach((index, k) => {
      actual.push(y[index]); prediction.push(fold.predictions[k]);
      perGame[index].push(fold.predictions[k]);
    });
    // Pooled amount errors describe repeated holdouts; cross-fold rank metrics are not meaningful.
    const pooled = revenueMetrics(actual, prediction);
    const { spearman, kendallTauB, rankInversions, comparedPairs, concordantPairs,
      referenceOnlyTies, predictionOnlyTies, bothTies, ...amountMetrics } = pooled;
    return [id, { fits: folds.length, amountMetrics,
      gameRanges: perGame.map((values, i) => ({ game: stability.names[i],
        min: Math.min(...values), max: Math.max(...values), reference: y[i] })) }];
  }))
]));
const expandedResults = expanded.results.map(result => {
  const rows = expanded.games.map((game, index) => ({
    ...game, score: result.predictions[index]
  })).filter(game => game.rankReference);
  const ranked = rows.filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  const newOnly = ranked.filter(row => !row.usedForMoneyFit);
  const metricsFor = subset => subset.length ? rankMetrics(
    subset.map(row => -row.rankReference.rank), subset.map(row => row.score)) : null;
  return { id: result.id, evaluatedGames: ranked.length,
    missingSignal: rows.filter(row => row.score <= 0).map(row => row.key),
    allTop25Order: metricsFor(ranked), newOnlyOrder: metricsFor(newOnly),
    newOnlyCount: newOnly.length,
    rows: ranked.map((row, i) => ({ game: row.key, publishedRank: row.rankReference.rank,
      modelRankWithinObservedTop25: i + 1, usedForMoneyFit: row.usedForMoneyFit,
      conditionalModelAmount: row.score })) };
});
const report = { schemaVersion: 1, productionEnabled: false,
  nestedSelection: { metrics: revenueMetrics(y, nestedPredictions),
    choices: stability.nestedSelection.map(row => ({ game: stability.names[row.heldoutIndex], selected: row.selected })) },
  omissionResults, expandedResults,
  interpretation: 'Amount errors use repeated overlapping folds. Expanded ranks use frozen full fits and provisional game families; no new monetary target was fabricated.' };
const prefix = path.join(root, 'reports/rank-models/normalized-diagnostics-2026-09-10');
fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  nestedSelection: report.nestedSelection,
  omissions: Object.fromEntries(Object.entries(omissionResults).map(([size, candidates]) =>
    [size, Object.fromEntries(Object.entries(candidates).map(([id, item]) => [id, item.amountMetrics]))])),
  expanded: expandedResults.map(({ rows, ...summary }) => summary)
}, null, 2));
