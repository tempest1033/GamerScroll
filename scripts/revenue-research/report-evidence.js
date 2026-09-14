'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { revenueMetrics, rankMetrics } = require('../lib/revenue-model-metrics');
const root = path.resolve(__dirname, '../..');
const load = name => JSON.parse(fs.readFileSync(path.join(root, `reports/rank-models/${name}-2026-09-10.json`), 'utf8'));

function summarizeConstrained(input) {
  return { status: input.status, crossProviderScenario: input.crossProviderScenario || false,
    worldBudget: input.worldBudgetEvidence, scenarioBudgetSource: input.scenarioBudgetSource,
    rows: input.results.map(result => {
      const successful = result.fitted.success && result.folds.every(fold => fold.success);
      return { id: result.id, successful,
        metrics: successful ? revenueMetrics(input.targetsMillion,
          input.names.map((_, i) => result.folds.find(fold => fold.heldoutIndex === i).predictions[i])) : null,
        groupBudgets: result.fitted.success ? Object.fromEntries(result.groupNames.map((group, i) =>
          [group, result.fitted.groupBudgetsMillion[i]])) : null,
        totalTop200Budget: result.fitted.modeledTop200Million,
        unallocatedWorldBudget: result.fitted.unallocatedWorldBudgetMillion,
        countryAccounting: result.countryAccounting || [],
        fgoJapanPrediction: result.fgoJapanPrediction,
        games: successful ? input.names.map((game, i) => ({
          game, reference: input.targetsMillion[i], fitted: result.fitted.predictions[i],
          heldout: result.folds.find(fold => fold.heldoutIndex === i).predictions[i]
        })) : [],
        failures: result.folds.filter(fold => !fold.success) };
    }) };
}

function summarizeRegionalRanks(input) {
  return input.results.map(result => {
    const scopes = ['WW', ...new Set(input.games.flatMap(game =>
      game.regionalRankReferences.map(reference => reference.geography)))];
    return { id: result.id, scopes: scopes.map(scope => {
      const rows = input.games.map((game, i) => ({
        game: game.key, usedForMoneyFit: game.usedForMoneyFit,
        reference: scope === 'WW' ? game.rankReference
          : game.regionalRankReferences.find(reference => reference.geography === scope),
        prediction: scope === 'WW' ? result.predictions[i] : result.countryPredictions[scope][i]
      })).filter(row => row.reference);
      const observed = rows.filter(row => row.prediction > 0);
      const newOnly = observed.filter(row => !row.usedForMoneyFit);
      const orderMetrics = values => values.length ? rankMetrics(
        values.map(row => -row.reference.rank), values.map(row => row.prediction)) : null;
      return { scope, evaluatedGames: observed.length, referenceGames: rows.length,
        unobservedGames: rows.filter(row => row.prediction <= 0).map(row => row.game),
        metrics: orderMetrics(observed), newOnlyCount: newOnly.length,
        newOnlyMetrics: orderMetrics(newOnly),
        rows: observed.sort((a, b) => b.prediction - a.prediction).map((row, i) => ({
          game: row.game, publishedRank: row.reference.rank, predictedRankWithinReference: i + 1,
          usedForMoneyFit: row.usedForMoneyFit
        })) };
    }) };
  });
}

const report = {
  schemaVersion: 1, productionEnabled: false,
  budgetOnly: summarizeConstrained(load('budget-constrained-simulation')),
  countryBounds: summarizeConstrained(load('country-constrained-simulation')),
  regionalRanks: summarizeRegionalRanks(load('regional-rank-predictions')),
  caveats: [
    'Country bounds come from Sensor Tower while fitted game labels come from AppMagic; cross-provider scenario, not a harmonized dataset.',
    'Global and Japan rank comparisons use different providers and provisional regional game families.',
    'The hololive Japanese app IDs were missing in the first expanded panel and are corrected here from primary links and archived titles.',
    'A fitted zero-budget component or a saturated budget cap is an identification warning, not a measured market conclusion.',
    'All simulations reuse the August evidence; no claim of next-month accuracy.'
  ]
};
const f = value => value === null || value === undefined ? '미산정' : value.toFixed(2);
const lines = [
  '# 시장·지역 근거와의 대조', '',
  '> 운영 미적용. 국가 상한은 Sensor Tower, 게임 금액은 AppMagic이므로 공급업체 간 민감도 실험이다.', '',
  '## 글로벌·국가 총액을 넘지 않도록 제한한 결과', '',
  '| 범위 | 구성 | MAPE | WAPE | RMS log ratio | 최대 APE | 역전 | 미배분 세계 예산 (백만 USD) |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...[['세계 상한', report.budgetOnly], ['국가 상한 추가', report.countryBounds]].flatMap(([label, section]) =>
    section.rows.map(row => row.successful
      ? `| ${label} | ${row.id} | ${f(row.metrics.mapePercent)}% | ${f(row.metrics.wapePercent)}% | ${f(row.metrics.rmsLogError)} | ${f(row.metrics.maxAbsolutePercentError)}% | ${row.metrics.rankInversions} | ${f(row.unallocatedWorldBudget)} |`
      : `| ${label} | ${row.id} | 계산 실패 | — | — | — | — | — |`)), '',
  '## 고정 모델과 공개 월간 순위', '',
  '글로벌 25개는 AppMagic 자료, 일본 25개는 Sensor Tower 기반 닛케이 자료다. 순위 전용 게임의 금액은 학습하지 않았다. hololive의 빠진 일본판 ID를 추가한 패널을 사용한다.', '',
  '| 구성 | 지역 | 비교 게임 | Spearman | Kendall tau-b | 역전 / 쌍 | 신규 게임만 역전 / 쌍 |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...report.regionalRanks.flatMap(model => model.scopes.map(scope =>
    `| ${model.id} | ${scope.scope} | ${scope.evaluatedGames}/${scope.referenceGames} | ${f(scope.metrics?.spearman)} | ${f(scope.metrics?.kendallTauB)} | ${scope.metrics?.rankInversions}/${scope.metrics?.comparedPairs} | ${scope.newOnlyMetrics?.rankInversions}/${scope.newOnlyMetrics?.comparedPairs} |`)), '',
  '## 한계', '', ...report.caveats.map(caveat => `- ${caveat}`), ''
];
const prefix = path.join(root, 'reports/rank-models/market-evidence-comparison-2026-09-10');
fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(`${prefix}.md`, lines.join('\n'));
console.log(JSON.stringify({
  countryBounds: report.countryBounds.rows.map(({ games, failures, ...row }) => row),
  regionalRanks: report.regionalRanks.filter(model => ['round13_original_frozen', 'normalized_five_groups', 'normalized_four_groups'].includes(model.id))
    .map(model => ({ id: model.id, scopes: model.scopes.map(({ rows, ...scope }) => scope) }))
}, null, 2));
