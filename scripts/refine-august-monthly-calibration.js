'use strict';

// Regularized candidates and nested leave-one-game-out selection.
// Never tune individual game multipliers or overwrite production market weights.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const data = require('../reports/rank-models/august-monthly-features-2026-09-10.json');
const previous = require('../reports/rank-models/august-monthly-calibration-2026-09-10.json');
const qualityCycle = process.argv.includes('--quality-cycle');
const regional = require('../docs/research/major-market-revenue-anchors-2026-09-10.json')
  .amount_groups.find(g => g.id === 'japan_august_retained');
assert.equal(regional.period.start, '2026-08-01');
assert.equal(regional.fee_basis, 'gross');
const fgoIndex = data.names.indexOf('Fate/Grand Order');
const fgoJapanMillion = regional.rows[0][1];
const keys = [...new Set(data.histograms.flatMap(h => Object.keys(h)))].sort();
const y = data.targetsMillion;
const n = y.length;
const all = y.map((_, i) => i);
const alphas = Array.from({ length: 33 }, (_, i) => 0.4 + i * 0.05);
const curves = {
  power: (rank, alpha) => rank ** -alpha,
  top10: (rank, alpha) => rank <= 10 ? rank ** -alpha : 10 ** (1 - alpha) / rank,
  shifted: (rank, alpha) => (rank + 1) ** -alpha
};
const grids = Object.fromEntries(Object.entries(curves).map(([name, curve]) => [
  name, alphas.map(alpha => data.histograms.map(h => keys.map(key =>
    (h[key] || []).reduce((s, w, rank) => rank ? s + w * curve(rank, alpha) : s, 0))))
]));
const shapeGrids = new Map();
function getGrid(config) {
  if (!config.shape) return grids[config.curve || 'power'];
  const signature = JSON.stringify(config.shape);
  if (!shapeGrids.has(signature)) {
    const shape = config.shape;
    shapeGrids.set(signature, alphas.map(alpha => data.histograms.map(h => keys.map(key => {
      const exponent = alpha * (key.endsWith('_cn') ? shape.chinaExponentRatio || 1
        : key === 'aos_jp' && shape.japanAndroidRatio ? shape.japanAndroidRatio
          : key.startsWith('aos_') ? shape.androidExponentRatio || 1 : 1);
      return (h[key] || []).reduce((sum, weight, rank) => {
        if (!rank) return sum;
        const value = shape.knot && rank > shape.knot
          ? shape.knot ** (shape.tail - exponent) * rank ** -shape.tail
          : rank ** -exponent;
        return sum + weight * value;
      }, 0);
    }))));
  }
  return shapeGrids.get(signature);
}
const originalConfigs = [
  { id: 'cn', groups: ['cn'], lambda: 0 },
  ...[0.03, 0.15].flatMap(lambda => [
    { id: `cn-jp-${lambda}`, groups: ['cn', 'jp'], lambda },
    { id: `cn-jp-ios-${lambda}`, groups: ['cn', 'jp', 'ios'], lambda },
    { id: `countries-${lambda}`, groups: ['cn', 'jp', 'kr', 'tw'], lambda }
  ]),
  ...['top10', 'shifted'].flatMap(curve => [
    { id: `${curve}-cn`, groups: ['cn'], lambda: 0, curve },
    { id: `${curve}-cn-jp`, groups: ['cn', 'jp'], lambda: 0.15, curve }
  ])
];
const configs = qualityCycle ? [
  { id: 'simple-control', groups: ['cn'], lambda: 0 },
  { id: 'simple-huber', groups: ['cn'], lambda: 0, huber: 0.25 },
  { id: 'jp-control', groups: ['cn', 'jp'], lambda: 0.15 },
  { id: 'jp-huber', groups: ['cn', 'jp'], lambda: 0.15, huber: 0.25 },
  { id: 'jp-regional', groups: ['cn', 'jp'], lambda: 0.15, regional: true },
  { id: 'jp-regional-huber', groups: ['cn', 'jp'], lambda: 0.15, regional: true, huber: 0.25 }
] : originalConfigs;
const cache = new Map();
function match(key, group) {
  // China is already a separate iOS-only group; avoid duplicate coefficients.
  return group === 'ios' ? key.startsWith('ios_') && !key.endsWith('_cn') : key.endsWith(`_${group}`);
}
function fit(indices, config) {
  const cacheKey = `${config.id}:${indices.join(',')}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  assert(indices.length >= 10 && new Set(indices).size === indices.length);
  function evaluate(params) {
    const ai = params[0];
    const coefficients = keys.map(key => Math.exp(config.groups.reduce(
      (sum, group, j) => sum + (match(key, group) ? params[j + 1] : 0), 0)));
    const activeGrid = getGrid(config);
    const logX = activeGrid[ai].map(row => Math.log(row.reduce((s, v, k) => s + v * coefficients[k], 0)));
    const regionWeight = config.regionWeight ?? 0.5;
    assert(regionWeight >= 0 && regionWeight <= 1);
    const observations = indices.map(i => ({ delta: Math.log(y[i]) - logX[i],
      weight: config.regional && i === fgoIndex ? 1 - regionWeight : 1 }));
    if (config.regional && indices.includes(fgoIndex)) {
      const jp = activeGrid[ai][fgoIndex].reduce((s, v, k) =>
        s + (keys[k].endsWith('_jp') ? v * coefficients[k] : 0), 0);
      assert(jp > 0);
      observations.push({ delta: Math.log(fgoJapanMillion / jp), weight: regionWeight });
    }
    // Global and regional observations share one game's total weight.
    assert(Math.abs(observations.reduce((s, r) => s + r.weight, 0) - indices.length) < 1e-9);
    let intercept = observations.reduce((s, r) => s + r.weight * r.delta, 0) / indices.length;
    if (config.huber) {
      for (let iteration = 0; iteration < 30; iteration++) {
        let numerator = 0, denominator = 0;
        for (const row of observations) {
          const w = row.weight * Math.min(1, config.huber / Math.max(1e-12, Math.abs(intercept - row.delta)));
          numerator += w * row.delta;
          denominator += w;
        }
        const next = numerator / denominator;
        if (Math.abs(next - intercept) < 1e-9) { intercept = next; break; }
        intercept = next;
      }
    }
    if (config.fourthPenalty) {
      for (let iteration = 0; iteration < 30; iteration++) {
        let gradient = 0, curvature = 0;
        for (const row of observations) {
          const error = intercept - row.delta;
          gradient += row.weight * (error + 2 * config.fourthPenalty * error ** 3);
          curvature += row.weight * (1 + 6 * config.fourthPenalty * error ** 2);
        }
        const step = gradient / curvature;
        intercept -= step;
        if (Math.abs(step) < 1e-9) break;
      }
    }
    const mse = observations.reduce((s, r) => {
      const error = Math.abs(intercept - r.delta);
      const loss = config.huber && error > config.huber ? 2 * config.huber * error - config.huber ** 2
        : error ** 2 + (config.fourthPenalty || 0) * error ** 4;
      return s + r.weight * loss;
    }, 0) / indices.length;
    const penalty = config.lambda * params.slice(1).reduce((s, b) => s + b * b, 0);
    return { loss: mse + penalty, mse, intercept, logX };
  }
  let best;
  for (const start of [6, 12]) {
    let params = [start, ...config.groups.map(() => 0)];
    let current = evaluate(params);
    for (const [alphaStep, betaStep] of [[8, 0.4], [4, 0.2], [2, 0.1], [1, 0.05]]) {
      for (let iteration = 0; iteration < 30; iteration++) {
        let changed = false;
        for (let j = 0; j < params.length; j++) {
          let chosen = params, value = current;
          for (const sign of [-1, 1]) {
            const trial = [...params];
            trial[j] += sign * (j ? betaStep : alphaStep);
            if (j === 0 ? trial[j] < 0 || trial[j] >= alphas.length : Math.abs(trial[j]) > Math.log(4)) continue;
            const result = evaluate(trial);
            if (result.loss < value.loss - 1e-12) { chosen = trial; value = result; }
          }
          if (chosen !== params) { params = chosen; current = value; changed = true; }
        }
        if (!changed) break;
      }
    }
    if (!best || current.loss < best.loss) best = {
      config: config.id, curve: config.curve || 'power', alpha: alphas[params[0]],
      multipliers: Object.fromEntries(config.groups.map((g, j) => [g, Math.exp(params[j + 1])])),
      loss: current.loss, mse: current.mse,
      boundary: params[0] === 0 || params[0] === alphas.length - 1,
      predictions: current.logX.map(x => Math.exp(x + current.intercept))
    };
  }
  assert(best.predictions.every(p => Number.isFinite(p) && p > 0));
  cache.set(cacheKey, best);
  return best;
}
function select(indices) {
  return configs.map(config => {
    const loss = indices.reduce((sum, i) => {
      const train = indices.filter(j => j !== i);
      assert(!train.includes(i));
      const p = fit(train, config).predictions[i];
      return sum + Math.log(p / y[i]) ** 2;
    }, 0) / indices.length;
    return { config, innerRmsLogError: Math.sqrt(loss) };
  }).sort((a, b) => a.innerRmsLogError - b.innerRmsLogError);
}
function metrics(predictions) {
  return require('./lib/revenue-model-metrics').revenueMetrics(y, predictions);
}
if (process.argv.some(arg => /^--five-rounds(?:-v[234])?$/.test(arg))) {
  require('./lib/monthly-five-rounds').run({ data, previous, all, fit, metrics, configs, alphas,
    secondCycle: process.argv.some(arg => /^--five-rounds-v[234]$/.test(arg)),
    thirdCycle: process.argv.includes('--five-rounds-v3'),
    fourthCycle: process.argv.includes('--five-rounds-v4') });
  process.exit(0);
}
const selection = select(all);
const fitted = fit(all, selection[0].config);
const nested = all.map(i => {
  const train = all.filter(j => j !== i);
  const chosen = select(train)[0];
  const model = fit(train, chosen.config);
  return { game: data.names[i], prediction: model.predictions[i],
    chosen: chosen.config.id, alpha: model.alpha, multipliers: model.multipliers };
});
const candidates = selection.map(({ config, innerRmsLogError }) => {
  const loo = all.map(i => fit(all.filter(j => j !== i), config).predictions[i]);
  return { ...config, innerRmsLogError, fitted: fit(all, config), leaveOneOut: metrics(loo) };
});
const ranks = fitted.predictions.map(p => 1 + fitted.predictions.filter(v => v > p).length);
const rows = all.map(i => ({
  game: data.names[i], referenceMillion: y[i], fittedMillion: fitted.predictions[i],
  fittedErrorPercent: 100 * (fitted.predictions[i] / y[i] - 1),
  rankWithin13: ranks[i], nestedPredictionMillion: nested[i].prediction,
  nestedErrorPercent: 100 * (nested[i].prediction / y[i] - 1)
})).sort((a, b) => b.referenceMillion - a.referenceMillion);
const report = {
  status: 'research_only_nested_game_holdout_not_future_month_validation', productionEnabled: false,
  period: '2026-08', source: data.source, coverage: data.coverage, identities: data.identities,
  candidateRules: configs, selected: fitted, candidates, nested, rows,
  recommendation: 'Do not adopt solely on full-sample fit. Compare nested error with the prior simple model; retain the prior model if improvement is not demonstrated.',
  qualityCycle: qualityCycle ? {
    priorMonthValidation: 'blocked: no June or July grossing CSV histories',
    methodSource: 'https://www.apptweak.com/en/aso-blog/app-download-revenue-estimates',
    sourceFinding: 'Revenue estimation uses grossing rank, category, country and history; no prediction where recent signals are insufficient.',
    regionalAmount: { game: 'Fate/Grand Order', country: 'JP', amountMillion: fgoJapanMillion, month: '2026-08' },
    policy: 'Regional amount excluded whenever the same game is held out; no duplicated game weight.',
    huberMeaning: 'Bound influence of large log residuals; fixed delta=0.25, no game removed from full-cohort evaluation.',
    roblox: 'Insufficient iOS representation remains an input-quality flag; no ranks fabricated and no game deleted to improve metrics.'
  } : null,
  metrics: { previousTraining: previous.metrics.fittedTraining,
    previousLeaveOneOut: previous.metrics.fittedLeaveOneGameOut,
    training: metrics(fitted.predictions), nestedLeaveOneOut: metrics(nested.map(r => r.prediction)) },
  method: [
    'Bounded power, top-ten/power-tail and shifted-rank curves with market/store multipliers; no game-specific coefficients.',
    'Four curve candidates were added after the first seven market/store candidates failed to improve outer error; all results remain exploratory.',
    'Minimize mean squared log amount error; regularization penalizes squared log market/store multipliers.',
    'Select candidate by inner leave-one-game-out log error, refit excluding outer test game, then predict that game.',
    'All 13 amounts were explored in prior work; nested validation limits current selection leakage but is not a pristine external test.',
    'Five-market features retain all previous missing-country, regional-family, short-chart and missing-day limitations.',
    'Roblox appears in US iOS only 144 snapshots at rank 168..200 and nowhere else in these iOS histories; absence was not fabricated as revenue.',
    'Fitted multipliers absorb omitted markets and data defects; they are not identified market or platform spending corrections.',
    'Search uses deterministic multi-start bounded coordinate descent, not a proof of the global optimum.',
    'No subsequent-month, time-block or audited revenue validation; no production or dictionary changes.'
  ]
};
assert.equal(nested.length, n);
assert.equal(new Set(rows.map(r => r.game)).size, n);
const prefix = qualityCycle ? 'reports/rank-models/august-quality-cycle-2026-09-10'
  : 'reports/rank-models/august-monthly-refinement-2026-09-10';
fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
const fmt = v => v.toFixed(2);
const lines = [
  qualityCycle ? '# 8월 추가 사이클: 이상치 영향 제한·일본 지역 매출' : '# 8월 월간 보정 정리·후보 비교', '',
  '> 연구용. 주요 5개국 30일 이력으로 글로벌 업체 추정액을 설명한다. 순위는 비교한 13개 게임 안에서만 유효하다.', '',
  `후보 내부 선택 모델: ${fitted.config}, 곡선=${fitted.curve}, α=${fmt(fitted.alpha)}. 운영 채택을 뜻하지 않는다.`,
  `상대 계수: ${Object.entries(fitted.multipliers).map(([k, v]) => `${k}=${fmt(v)}`).join(', ')}.`,
  '계수는 누락 국가·상품군·차트 오차를 함께 흡수하므로 시장 규모의 확정 보정률이 아니다.', '',
  '## 검증 방식', '',
  qualityCycle
    ? '기존 형태를 대조군으로 두고 큰 오차의 영향 제한(Huber), 일본 FGO 54백만 달러 지역 제약을 조합한 6개 후보를 비교했다. FGO의 글로벌·지역 금액 가중치 합은 다른 게임 하나와 같고, FGO 검사에서는 두 금액 모두 제외했다.'
    : '시장·스토어 계수 7개 후보가 검증에서 개선되지 않아 상위 10위 구간형·순위 이동형 4개를 추가했다. 총 11개 후보이며 게임별 임의 배수는 넣지 않았다.',
  '바깥 검사에서는 게임 한 개를 완전히 빼고, 나머지 12개 안에서 다시 후보를 고른 뒤 제외한 게임을 예측했다.',
  '이전부터 살펴본 같은 달 표본이므로 완전히 새로운 외부 검증이나 다음 달 예측 검증은 아니다.', '',
  '| 평가 | 평균 절대 백분율 오차 | 로그 오차 | 순서 역전 쌍 |',
  '|---|---:|---:|---:|',
  ...Object.entries(report.metrics).map(([key, m]) => `| ${key} | ${fmt(m.mapePercent)}% | ${fmt(m.rmsLogError)} | ${m.rankInversions}/${m.comparedPairs} |`),
  '', '## 게임별 결과', '', '단위: 백만 달러. 전체 적합에는 해당 게임 금액이 포함된다. 중첩 제외 검증에는 포함되지 않는다.', '',
  '| 게임 | 공개 기준 | 전체 적합 | 표본 순위 | 중첩 제외 검증 | 검증 오차 |',
  '|---|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.game} | ${fmt(r.referenceMillion)} | ${fmt(r.fittedMillion)} | ${r.rankWithin13} | ${fmt(r.nestedPredictionMillion)} | ${fmt(r.nestedErrorPercent)}% |`),
  '', '## 후보별 비교', '',
  '아래 후보별 제외 검증은 후보 선택에 사용했으므로 최종 성능은 위의 중첩 제외 검증으로 판단한다.', '',
  '| 후보 | 평균 절대 백분율 오차 | 로그 오차 | 순서 역전 쌍 |',
  '|---|---:|---:|---:|',
  ...candidates.map(c => `| ${c.id} | ${fmt(c.leaveOneOut.mapePercent)}% | ${fmt(c.leaveOneOut.rmsLogError)} | ${c.leaveOneOut.rankInversions}/${c.leaveOneOut.comparedPairs} |`),
  '', '## 데이터 점검과 한계', '',
  '- Roblox 스토어 ID는 원본 제목과 일치했다. 그러나 iOS는 미국 144개 시점의 168~200위만 존재하고 나머지 4개국에는 없었다. 이를 임의 순위로 채우지 않았다.',
  '- 8월 1일과 123개국 이력, 일부 게임의 해외·지역판 연결 범위가 미확정이다. 전 세계 월간 차트 재현이 아니다.',
  '- 일본·스토어 계수는 실제 시장값으로 해석할 수 없다. 표본 13개로는 국가 규모와 누락·편향을 분리하기 어렵다.',
  '- 향후 달 검증 전에는 운영에 적용하지 않는다. 정확도 향상을 위해 개별 게임만 강제로 맞추지 않았다.',
  ...(qualityCycle ? [
    '- 6~7월 매출표는 있지만 해당 순위 CSV가 없어 이전 달→8월 검증은 불가능했다.',
    '- Roblox를 삭제해 평균 오차를 낮추지 않았다. 모든 13개 게임을 최종 평가에 포함했다.',
    '- 모델 선택에 사용한 값의 일치도와 중첩 검증은 별개이며, 같은 8월 자료를 반복 탐색한 실험이다.',
    '- 방법 참고: https://www.apptweak.com/en/aso-blog/app-download-revenue-estimates'
  ] : []),
  '', `[매출 출처](${data.source.url})`,
  '', '재현: `node scripts/calibrate-august-monthly-benchmarks.js --features` → `node scripts/refine-august-monthly-calibration.js' + (qualityCycle ? ' --quality-cycle' : '') + '`', ''
];
fs.writeFileSync(`${prefix}.md`, lines.join('\n'));
console.log(JSON.stringify({ selected: { config: fitted.config, alpha: fitted.alpha, multipliers: fitted.multipliers },
  metrics: report.metrics, rows, candidates: candidates.map(c => ({ id: c.id, metrics: c.leaveOneOut })),
  outerChoices: nested.map(r => ({ game: r.game, chosen: r.chosen })) }, null, 2));
