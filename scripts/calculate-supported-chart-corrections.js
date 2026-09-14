const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

// Recalculate the stored comparison cohort without changing production data.
const modelPath = 'data/rank-models/global-chart-2026-v0.3.json';
const inputPath = 'reports/rank-models/global-chart-2026-growth-preview.json';
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const countries = new Map(model.countries.map(c => [c.country.toLowerCase(), c]));
const budget = model.countries.reduce((sum, c) => sum + c.marketProxyUsd, 0);
assert(Math.abs(budget - model.budgets.observedScopeBudgetUsd) < 0.1);
assert.equal(model.productionEnabled, false);
assert.equal(model.rankCurve.alpha, 1);
const china = countries.get('cn');
assert.equal(china.storeShares.android, 0);
assert.equal(china.storeShares.ios, 1);

const alphas = model.rankCurve.sensitivityAlphas;
assert(alphas.includes(1));
const seenKeys = new Set();
for (const game of input.results) {
  assert(!seenKeys.has(game.key), `Duplicate game: ${game.key}`);
  seenKeys.add(game.key);
  const seenCharts = new Set();
  for (const row of game.charts) {
    const c = countries.get(row.country);
    assert(c, `Unknown country: ${row.country}`);
    assert(['ios', 'android'].includes(row.store));
    assert(Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 200);
    assert(!seenCharts.has(`${row.country}:${row.store}`), `Duplicate chart for ${game.key}`);
    seenCharts.add(`${row.country}:${row.store}`);
  }
}

function calculate(alpha) {
  return input.results.map(game => {
    const score = game.charts.reduce((sum, row) => {
      const c = countries.get(row.country);
      const weight = c.marketProxyUsd / budget * c.storeShares[row.store];
      // Unsupported time coefficients remain neutral; they are not fitted.
      const timeMultiplier = 1;
      return sum + 100 * weight * timeMultiplier / row.rank ** alpha;
    }, 0);
    assert(Number.isFinite(score) && score >= 0 && score <= 100 + 1e-8);
    if (alpha === 1) assert(Math.abs(score - game.score) < 1e-8, `Baseline mismatch: ${game.key}`);
    return { key: game.key, title: game.title, score, identityMapped: game.identityMapped };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .map((game, i) => ({ rank: i + 1, ...game }));
}

const scenarios = alphas.map(alpha => ({
  alpha,
  meaning: alpha === 1 ? 'supported_baseline_with_unvalidated_time_effects_disabled' : 'design_sensitivity_not_fitted_or_a_confidence_interval',
  results: calculate(alpha)
}));
const baseline = scenarios.find(s => s.alpha === 1).results;
const rankMaps = new Map(scenarios.map(s => [s.alpha, new Map(s.results.map(r => [r.key, r.rank]))]));
const evaluatedGames = input.results.length;
const report = {
  calculatedAt: new Date().toISOString(),
  inputPath,
  modelPath,
  snapshot: input.snapshot,
  inputCoverage: input.coverage,
  evaluatedGames,
  fullInputGameCoverage: evaluatedGames === input.coverage.gameKeys,
  outputIsEstimatedRevenue: false,
  productionEnabled: false,
  formula: '100 * sum(country_market_proxy / total_market_proxy * store_share / rank^alpha)',
  corrections: {
    countryAndStoreMarketWeights: 'applied_existing_128_market_proxies_with_inherited_low_confidence_assumptions',
    growth2026: 'applied_existing_recent_trend_scenario_not_a_verified_annual_forecast',
    chinaScope: 'App Store only; no third-party Android expansion',
    monthlySeasonality: { multiplier: 1, status: 'not_calibrated_for_snapshot_period' },
    monthBoundaryAndWeekday: { multiplier: 1, status: 'historical_pattern_evidence_not_a_current_fitted_coefficient' },
    holidays: { multiplier: 1, status: 'no_matched_market_specific_fitted_coefficient' },
    gameEvents: { multiplier: 1, status: 'not_added_to_avoid_unmeasured_double_counting' },
    revenueAnchors: 'not_fitted_periods_do_not_match_single_snapshot',
    calendarDayCount: 'not_applicable_to_single_snapshot_index; no monetary daily allocation',
    rankCurve: 'alpha=1 remains an uncalibrated baseline; sensitivity alternatives are not evidence-based corrections'
  },
  limitations: [
    'This is a snapshot index, not a monthly revenue estimate or a claim that all researched effects were applied.',
    'Source benchmark periods, current dictionary identities and reporting timezones have not been aligned for revenue training.',
    'Existing market and store assumptions are retained, including low-confidence and net-share proxies.',
    'All scenarios rank only games preserved in the input report; omitted games cannot be newly ranked.',
    'A coefficient of 1 means an unsupported correction is disabled, not that its real-world effect is zero.',
    'The source snapshot has legacy run timestamps, short charts and incomplete cross-store game mappings.',
    'External September first-week results are not the same interval as the September 8 snapshot.'
  ],
  scenarios
};

const outBase = 'reports/rank-models/global-chart-supported-corrections';
const lines = [
  '# 확보 근거 기반 보정 재계산',
  '',
  '**금액이 아닌 시장 보정 차트 지수다. 모든 시간 효과를 검증·적용한 결과가 아니다.**',
  '',
  `스냅샷: ${input.snapshot.date} ${input.snapshot.time} ${input.snapshot.timezone}.`,
  `입력 보고서에 보존된 게임 ${evaluatedGames}개를 평가했다. 원본 메타데이터의 전체 게임 수는 ${input.coverage.gameKeys}개다.`,
  evaluatedGames === input.coverage.gameKeys ? '전체 입력 게임을 포함한다.' : '**입력 보고서의 후보 집합 안에서 계산한 순위이며, 누락된 게임까지 포함한 전체 재집계가 아니다.**',
  '',
  '## 적용 범위',
  '',
  '- 128개 시장 근사 규모, 국가별 스토어 비중, 기존 2026 성장 시나리오를 적용했다.',
  '- 중국은 iOS만 포함한다. Google Play 및 제3자 Android를 더하지 않았다.',
  '- 월별·월초·월말·요일·명절 배율은 해당 시점에 검증된 계수가 없어 1로 유지했다.',
  '- 기존 시장 규모와 스토어 비중에는 저신뢰 추산·과거 순매출 비중 대리값이 남아 있다. 새로 검증된 값이라고 해석하지 않는다.',
  '- 새 매출 기준표는 월간·주간·누적 값이므로 9월 8일 단일 스냅샷에 맞춰 학습하지 않았다.',
  '- 단일 시점 지수이므로 월 일수 보정을 적용할 기간 총액이 없다. 지수를 달러로 환산하지 않았다.',
  '- 기존 순위 곡선 alpha=1도 미검증 가정이다. 0.8·1.2는 기존 모델에 정의된 민감도 시나리오이지 추정된 계수가 아니다.',
  '',
  '## 기본 결과와 순위 곡선 민감도',
  '',
  '| 기본 순위 | 게임 | 기본 지수 α=1 | α=0.8 순위 | α=1.2 순위 |',
  '|---:|---|---:|---:|---:|'
];
for (const r of baseline.slice(0, 50)) {
  lines.push(`| ${r.rank} | ${r.title.replaceAll('|', '\\|')} | ${r.score.toFixed(3)} | ${rankMaps.get(0.8).get(r.key)} | ${rankMaps.get(1.2).get(r.key)} |`);
}
lines.push('', '## 판정', '',
  'α=1 재계산값은 기존 2026 성장 보정 지수와 일치했다. 추가로 확보한 연구는 시간 효과의 존재를 뒷받침하지만, 이 스냅샷에 적용할 수치 계수를 제공하지 않으므로 새 배율을 임의로 넣지 않았다.',
  '따라서 “새 보정을 전부 먹여 순위가 개선됐다”고 주장할 수 없다. 다음 실제 보정에는 기간이 맞는 매출·순위 이력과 게임 연결이 필요하다.',
  '',
  '출처: 기존 모델·입력 보고서 경로는 JSON에 기록했다. 매출 표본은 [기준표](../../docs/research/game-revenue-benchmarks-2026-09-10.md)를 참고한다.',
  '운영 페이지·원본 스냅샷·시장 가중치 파일은 수정하지 않았다.',
  '');
fs.mkdirSync(path.dirname(outBase), { recursive: true });
fs.writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(`${outBase}.md`, lines.join('\n'));
console.log(JSON.stringify({
  report: `${outBase}.md`,
  evaluatedGames,
  originalGameCount: input.coverage.gameKeys,
  checks: 'source references, rank validity, duplicate charts, China scope, budget, score bounds and baseline reconciliation passed',
  top20: baseline.slice(0, 20).map(r => ({
    rank: r.rank, title: r.title, score: Number(r.score.toFixed(3)),
    rankAlpha08: rankMaps.get(0.8).get(r.key), rankAlpha12: rankMaps.get(1.2).get(r.key)
  }))
}, null, 2));
