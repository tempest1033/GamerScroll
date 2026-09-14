'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { revenueMetrics } = require('../lib/revenue-model-metrics');
const root = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

function summarize(input) {
  const baseline = read('reports/rank-models/august-five-rounds-v4-2026-09-10.json').control;
  const oldNames = read('reports/rank-models/august-monthly-features-2026-09-10.json').names;
  assert.deepEqual(input.names, oldNames, 'Baseline game ordering must match');
  const y = input.targetsMillion;
  const baseMetrics = revenueMetrics(y, baseline.predictions);
  const candidates = input.results.map(result => {
    const predictions = input.names.map((_, index) => {
      const fold = result.folds.find(row => row.heldoutIndex === index);
      assert(fold && !fold.trainingIndices.includes(index));
      assert.equal(fold.trainingIndices.length, input.names.length - 1);
      return fold.prediction;
    });
    const metrics = revenueMetrics(y, predictions);
    const improved = predictions.filter((prediction, index) =>
      Math.abs(prediction / y[index] - 1) < Math.abs(baseline.predictions[index] / y[index] - 1)).length;
    return { id: result.config.id, config: result.config,
      fittedParameterCount: result.groupNames.length,
      metrics, trainingMetrics: revenueMetrics(y, result.fitted.predictions),
      delta: { rmsLogError: metrics.rmsLogError - baseMetrics.rmsLogError,
        mapePercentagePoints: metrics.mapePercent - baseMetrics.mapePercent,
        wapePercentagePoints: metrics.wapePercent - baseMetrics.wapePercent,
        improvedGames: improved },
      coefficients: result.groupNames.map((name, k) => ({
        name, fitted: result.fitted.coefficients[k],
        foldMin: Math.min(...result.folds.map(fold => fold.coefficients[k])),
        foldMax: Math.max(...result.folds.map(fold => fold.coefficients[k]))
      })),
      regionalConsistency: result.regionalConsistency.map(row => ({
        ...row, errorPercent: (row.prediction / row.reference - 1) * 100
      })),
      rows: input.names.map((game, i) => ({ game, referenceMillion: y[i],
        fittedMillion: result.fitted.predictions[i], heldoutMillion: predictions[i],
        heldoutErrorPercent: (predictions[i] / y[i] - 1) * 100,
        baselineHeldoutMillion: baseline.predictions[i] }))
    };
  });
  return { schemaVersion: 1, productionEnabled: false, status: 'reused_sample_diagnostics',
    baseline: { id: 'round13_fixed_configuration', config: baseline.config, metrics: baseMetrics },
    primaryMetric: input.registry.primaryMetric, candidates,
    limitations: [
      'Same 13 August games repeatedly inspected; this is not independent generalization accuracy.',
      'Five-market, 30-day chart signals are not worldwide, full-month revenue coverage.',
      'The curve called round13 was previously selected using this sample.',
      'Numerical normalization does not add evidence for actual country/store market shares.',
      'Regional amounts are consistency checks; their global parent labels enter fitting.',
      'No production coefficient, market weight, or site ranking is changed.'
    ], inputs: input.inputs, runtime: input.runtime };
}

if (require.main === module) {
  const inputPath = process.argv[2] || 'reports/rank-models/normalized-simulation-2026-09-10.json';
  const outputPrefix = process.argv[3] || 'reports/rank-models/normalized-comparison-2026-09-10';
  const report = summarize(read(inputPath));
  const f = value => value === null ? '미산정' : value.toFixed(3);
  const metricRow = (id, metrics) =>
    `| ${id} | ${f(metrics.rmsLogError)} | ${f(metrics.mapePercent)}% | ${f(metrics.wapePercent)}% | ${f(metrics.maxAbsolutePercentError)}% | ${metrics.rankInversions}/${metrics.comparedPairs} | ${f(metrics.spearman)} |`;
  const markdown = [
    '# 정규화·단순화 시뮬레이션', '',
    '> 같은 8월 표본의 연구용 진단. 독립 검증이나 실제 매출 정확도가 아니다. 운영 미적용.', '',
    '기존 13라운드의 구성을 고정한 제외 예측과 비교한다. 새 후보는 곡선을 고정하고 지역별 양수 계수만 표준 SciPy 솔버로 학습했다. 주 지표는 배율 로그 오차이며 금액·순서 지표를 함께 보고한다.', '',
    '| 구성 | RMS log ratio | MAPE | WAPE | 최대 APE | 역전 쌍 | Spearman |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    metricRow(report.baseline.id, report.baseline.metrics),
    ...report.candidates.map(candidate => metricRow(candidate.id, candidate.metrics)), '',
    '## 지역 매출 일관성', '',
    '해당 게임의 글로벌 금액은 학습에 사용했다. 독립 검증이 아니며, 지역별 매출을 직접 추정할 근거가 충분한지도 별도로 판단해야 한다.', '',
    '| 구성 | 게임·지역 | 기준 (백만 USD) | 계산 (백만 USD) | 차이 |',
    '| --- | --- | ---: | ---: | ---: |',
    ...report.candidates.flatMap(candidate => candidate.regionalConsistency.map(row =>
      `| ${candidate.id} | ${row.game} · ${row.geography} | ${f(row.reference)} | ${f(row.prediction)} | ${f(row.errorPercent)}% |`)), '',
    '## 게임별 제외 예측', '',
    ...report.candidates.flatMap(candidate => [
      `### ${candidate.id}`, '',
      '| 게임 | 공개 기준 | 전체 적합 | 제외 예측 | 제외 오차 |',
      '| --- | ---: | ---: | ---: | ---: |',
      ...candidate.rows.map(row => `| ${row.game} | ${f(row.referenceMillion)} | ${f(row.fittedMillion)} | ${f(row.heldoutMillion)} | ${f(row.heldoutErrorPercent)}% |`), ''
    ]),
    '## 제한', '', ...report.limitations.map(line => `- ${line}`), ''
  ].join('\n');
  fs.writeFileSync(path.join(root, `${outputPrefix}.json`), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, `${outputPrefix}.md`), markdown);
  console.log(JSON.stringify({ baseline: report.baseline.metrics,
    candidates: report.candidates.map(candidate => ({
      id: candidate.id, metrics: candidate.metrics, delta: candidate.delta
    })) }, null, 2));
}

module.exports = { summarize };
