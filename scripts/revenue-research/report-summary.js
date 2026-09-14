'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { revenueMetrics } = require('../lib/revenue-model-metrics');
const { readLedger, readSources } = require('../anchors/lib/anchor-schema');
const root = path.resolve(__dirname, '../..');
const load = name => JSON.parse(fs.readFileSync(path.join(root, `reports/rank-models/${name}-2026-09-10.json`), 'utf8'));
const optional = name => {
  try { return load(name); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const comparisons = load('normalized-grouping-comparison');
const diagnostics = load('normalized-diagnostics');
const convex = load('convex-objective-simulation');
const market = load('market-evidence-comparison');
const japan = load('japan-ordinal-profile-resolution');
const transfer = load('september-daily-transfer');
const weekly = load('september-weekly-transfer');
const bounds = load('partial-identification-bounds');
const calendar = optional('japan-calendar-stability');
const elapsedCalendar = optional('japan-calendar-elapsed');
const elapsedProfile = optional('japan-ordinal-elapsed');
const expandedBoundary = optional('japan-boundary-expanded');
const holidayMoney = load('japan-holiday-money');
const panel = load('normalized-august-regional-panel');
const originalJapan = market.regionalRanks.find(row => row.id === 'round13_original_frozen')
  .scopes.find(row => row.scope === 'JP');
const ledger = readLedger();
const f = value => Number(value).toFixed(2);
const models = [...new Set(transfer.rows.map(row => row.model))];
const dayMetrics = models.map(model => {
  const rows = transfer.rows.filter(row => row.model === model);
  const actual = rows.map(row => row.amountMillion);
  const utc = revenueMetrics(actual, rows.map(row => row.utcScenario.predictionMillion));
  const clocks = rows[0].scenarios.filter(scenario => scenario.predictionMillion !== undefined).map(scenario => {
    const same = rows.map(row => row.scenarios.find(item => item.utcOffsetHours === scenario.utcOffsetHours));
    if (same.some(item => item.predictionMillion === undefined)) return null;
    return { utcOffsetHours: scenario.utcOffsetHours,
      metrics: revenueMetrics(actual, same.map(item => item.predictionMillion)) };
  }).filter(Boolean);
  return { model, utc, clockScenarios: clocks.length,
    mapeAcrossClockScenarios: [Math.min(...clocks.map(item => item.metrics.mapePercent)),
      Math.max(...clocks.map(item => item.metrics.mapePercent))] };
});
const summarizeCalendar = value => value ? {
  artifactStatus: value.status, completedCases: value.completedCases, plannedCases: value.plannedCases,
  pairViolationRange: value.results.length ? [
    Math.min(...value.results.map(row => row.minimumPairViolations)),
    Math.max(...value.results.map(row => row.minimumPairViolations))] : null,
  exponentBoundaryCases: value.results.filter(row => row.coOptimalSet.touchesExponentBoundary).length,
  mixtureBoundaryCases: value.results.filter(row => row.coOptimalSet.touchesMixtureBoundary).length,
  byBlockLength: [...new Set(value.results.map(row => row.excludedObservationDates.length))].map(length => {
    const rows = value.results.filter(row => row.excludedObservationDates.length === length);
    return { length, cases: rows.length,
      pairViolationRange: [Math.min(...rows.map(row => row.minimumPairViolations)),
        Math.max(...rows.map(row => row.minimumPairViolations))],
      parameterEnvelope: Object.fromEntries(['iosExponentRange', 'googlePlayExponentRange',
        'iosTop200BudgetMixtureRange'].map(key => [key, [
          Math.min(...rows.map(row => row.coOptimalSet[key][0])),
          Math.max(...rows.map(row => row.coOptimalSet[key][1]))]])) };
  })
} : { artifactStatus: 'not_available' };
const calendarSummary = summarizeCalendar(calendar);
const elapsedCalendarSummary = summarizeCalendar(elapsedCalendar);
const calendarPairs = calendar?.status === 'completed' && elapsedCalendar?.status === 'completed'
  ? calendar.results.map(row => {
    const paired = elapsedCalendar.results.find(other =>
      other.excludedObservationDates.join(',') === row.excludedObservationDates.join(','));
    if (!paired) throw new Error('Calendar comparisons require matching omitted dates');
    return paired.minimumPairViolations - row.minimumPairViolations;
  }) : null;
const pairedSampling = calendarPairs && {
  cases: calendarPairs.length,
  fewerInversions: calendarPairs.filter(value => value < 0).length,
  unchanged: calendarPairs.filter(value => value === 0).length,
  moreInversions: calendarPairs.filter(value => value > 0).length,
  maximumAbsoluteChange: Math.max(...calendarPairs.map(Math.abs))
};
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), productionEnabled: false,
  decision: 'Keep production unchanged. Preserve the original global baseline; retain Japan rank profiling as a separate research direction, not a global revenue estimator.',
  data: { ledgerRows: ledger.length, sources: Object.keys(readSources()).length,
    observationEligibleRows: ledger.filter(row => row.fit.usable).length,
    amountFitGames: panel.games.filter(game => game.reference).length,
    expandedGames: panel.games.length,
    globalRankReferences: panel.games.filter(game => game.rankReference).length,
    japanRankReferences: panel.games.filter(game => game.regionalRankReferences?.some(row => row.geography === 'JP')).length },
  global: { baseline: comparisons.baseline,
    fixedCandidates: comparisons.candidates.filter(row => ['normalized_four_groups', 'normalized_five_groups'].includes(row.id)),
    nestedSelectionMetrics: diagnostics.nestedSelection.metrics,
    convexObjectiveNestedMetrics: revenueMetrics(convex.targetsMillion,
      convex.names.map((_, i) => convex.nestedSelection.find(row => row.heldoutIndex === i).prediction)),
    countryConstraintScenarios: market.countryBounds.rows.map(row => ({ id: row.id, metrics: row.metrics })) },
  japan: { minimumPairViolations: japan.minimumPairViolations, comparedPairs: japan.comparedPairs,
    coOptimalSet: japan.coOptimalSet, unusedMoneyConsistency: japan.unusedMoneyConsistency,
    holidayMoney: { ...holidayMoney, rows: undefined },
    elapsedProfile: elapsedProfile && { minimumPairViolations: elapsedProfile.minimumPairViolations,
      coOptimalSet: elapsedProfile.coOptimalSet },
    expandedBoundary: expandedBoundary && { omittedDates: expandedBoundary.excludedObservationDates,
      minimumPairViolations: expandedBoundary.minimumPairViolations, coOptimalSet: expandedBoundary.coOptimalSet } },
  september: dayMetrics,
  septemberWeekly: {
    source: weekly.source,
    rows: weekly.rows.map(({ scenarios, ...row }) => row),
    limitations: weekly.limitations
  },
  calendar: calendarSummary,
  elapsedCalendar: elapsedCalendarSummary,
  pairedSampling,
  identification: bounds.global.map(row => ({ crossProviderScenario: row.crossProviderScenario,
    feasible: row.feasible, latentRevenueRange: row.unobservedKnownGameRevenueRangeMillion })),
  caveats: [
    'The low-error global proxy can violate real market accounting or drive a store contribution toward zero.',
    'All August model-family comparisons remain exposed to repeated selection.',
    'Japanese money comparison assumes the full country budget is allocated to the modeled TOP200; it is an upper-budget scenario.',
    'The January-to-December 2021 Italy paper concerns free-app downloads, not 2026 game revenue.',
    'September daily checks cover one game on three days; weekly checks assume September 1-7 and retain unresolved reporting timezone.',
    'No automatic production admission, commit, push or publication is performed.'
  ]
};
const lines = [
  '# 매출 모델 정규화·리서치·시뮬레이션 요약', '',
  '**결론: 글로벌 매출 추정의 운영 적용은 보류한다. 재현 가능한 연구 구조를 정리했고, 일본 단일 시장의 순위 곡선에서 별도 연구 후보를 확보했다.**', '',
  `생성 시각: ${report.generatedAt}. 아래 오차는 실제 개발사 매출이 아닌 공개 업체 추정치와의 차이다.`, '',
  '## 1. 관리 구조 개선', '',
  `- 원장 ${report.data.ledgerRows}건·출처 ${report.data.sources}개를 기간·국가·스토어·통화·결제 기준으로 구분했다. 관측 수준의 학습 후보는 ${report.data.observationEligibleRows}건이며, 실제 8월 금액 적합은 13개 게임이다.`,
  '- 전체·iOS·Google Play 시장액이 같은 ID로 덮어써질 수 있던 문제를 수정했다. 기존 원장과 ID 연결은 보존했다.',
  '- 설명 문장 검색으로 사용 여부를 정하던 방식을 명시적 상태 필드로 교체했다.',
  '- 순위 관측, 시장 가중치, 곡선, 오차 지표, 고정 모델 내보내기를 분리하고 표준 SciPy 솔버를 사용한다.',
  `- 글로벌·일본 공개 순위를 합쳐 ${report.data.expandedGames}개 게임을 대조했다. 빠졌던 hololive 일본판 ID도 근거에 따라 추가했다.`, '',
  '## 2. 글로벌 금액 비교', '',
  '| 방식 | MAPE | WAPE | RMS log ratio | 최대 오차 |',
  '| --- | ---: | ---: | ---: | ---: |',
  `| 기존 13라운드 구성 고정 대조군 | ${f(report.global.baseline.metrics.mapePercent)}% | ${f(report.global.baseline.metrics.wapePercent)}% | ${f(report.global.baseline.metrics.rmsLogError)} | ${f(report.global.baseline.metrics.maxAbsolutePercentError)}% |`,
  ...report.global.fixedCandidates.map(row =>
    `| ${row.id} | ${f(row.metrics.mapePercent)}% | ${f(row.metrics.wapePercent)}% | ${f(row.metrics.rmsLogError)} | ${f(row.metrics.maxAbsolutePercentError)}% |`), '',
  `**이 숫자만으로 개선안을 채택하지 않았다.** 후보 선택까지 포함한 추가 중첩 검사의 MAPE는 ${f(report.global.nestedSelectionMetrics.mapePercent)}%였고, 낮은 오차 모델에서 일본 Google Play 기여 소멸과 시장 총액 초과가 나타났다. 같은 달 미국·중국·일본 상한을 적용하면 오차가 다시 커졌다. 누락 시장의 영향을 시장 계수가 대신 흡수한 정황이다.`, '',
  `상대 최소제곱·최대 상대 오차 최소화까지 추가한 별도 중첩 비교의 MAPE는 ${f(report.global.convexObjectiveNestedMetrics.mapePercent)}%였다. 후보 구성이 다른 실험이며 같은 8월 표본에 대한 탐색이다. 국가·상품군 범위 문제를 해결한 결과로 해석하지 않는다.`, '',
  '## 3. 일본 시장별 순위 곡선', '',
  `공개 일본 월간 ${report.data.japanRankReferences}개 게임의 순서만 사용한 탐색에서 역전은 ${japan.minimumPairViolations}/${japan.comparedPairs}쌍이었다. 기존 글로벌 모델의 일본 순위 대조는 ${originalJapan.metrics.rankInversions}/${originalJapan.metrics.comparedPairs}쌍이었다. 이 비교는 적합 결과이며 별도 달 검증이 아니다.`,
  `- 같은 최소 오차를 내는 계수 조합: ${japan.coOptimalSet.size}개. 임의로 하나를 고르지 않았다.`,
  `- iOS 지수: ${japan.coOptimalSet.iosExponentRange.map(f).join('~')}, Google Play 지수: ${japan.coOptimalSet.googlePlayExponentRange.map(f).join('~')}.`,
  `- 금액을 선택에 쓰지 않은 FGO 일본 대조: TOP200에 국가 전체 예산을 배정한 상한 시나리오에서는 ${japan.unusedMoneyConsistency.fullMarketAllocatedToTop200FgoRangeMillion.map(f).join('~')}백만 달러. AppMagic 기준은 54백만 달러다.`,
  '- 국가 시장액은 Sensor Tower, FGO 금액은 AppMagic이며 TOP200 바깥 매출도 미확정이다. 위 근접값을 검증된 매출 정확도로 해석하지 않는다.', '',
  `휴가철 8월 8~16일 실제 순위와 공개 스토어별 예산을 대조한 FGO 계산 범위는 ${holidayMoney.fullStoreBudgetUpperRangeMillion.map(f).join('~')}백만 달러였다. 공개값은 ${holidayMoney.reference.amountMillion}백만 달러 초과이며, 동일 날짜 예산 배분·TOP200 전체 예산 가정 아래 모순이 없다는 뜻일 뿐 정확도 검증은 아니다.`, '',
  '## 4. 다른 기간·수집 누락 점검', '',
  '9월 4~6일 포켓몬 GO를 8월에 고정한 모델로 대조했다. UTC는 확인된 집계 시간대가 아니라 비교 시나리오다.', '',
  '| 모델 | UTC 시나리오 MAPE | 시간대별 MAPE 범위 |',
  '| --- | ---: | ---: |',
  ...dayMetrics.map(row => `| ${row.model} | ${f(row.utc.mapePercent)}% | ${row.mapeAcrossClockScenarios.map(f).join('~')}% |`), '',
  '별도로 공개 자료의 “9월 첫 주”를 9월 1~7일로 해석한 조건부 대조를 수행했다. 이 날짜 경계는 원문에서 확정되지 않았으며, 금액이나 순위를 모델 재학습에 사용하지 않았다.', '',
  '| 고정 모델 | 게임 | 공개 금액(백만 달러) | 시간대별 계산 범위(백만 달러) |',
  '| --- | --- | ---: | ---: |',
  ...weekly.rows.filter(row => row.referenceMillion !== null).map(row =>
    `| ${row.model} | ${row.game} | ${f(row.referenceMillion)} | ${row.predictionRangeMillion ? row.predictionRangeMillion.map(f).join('~') : '경계 관측 부족'} |`), '',
  'MONOPOLY GO!와 Delta Force는 8월 금액 학습에 없던 게임이다. MONOPOLY GO!의 큰 과대평가가 시간대 변경 후에도 남았다. 이 범위는 신뢰구간이 아니며 8월 일평균 시장 규모를 그대로 옮긴 시나리오다.', '',
  `날짜 누락 민감도 산출물: ${calendarSummary.artifactStatus}, ${calendarSummary.completedCases ?? 0}/${calendarSummary.plannedCases ?? 0}개 완료. 이는 수집 누락에 대한 민감도이며 미래 예측 검증이나 신뢰구간이 아니다.`, '',
  ...(calendarSummary.byBlockLength?.map(row =>
    `- ${row.length}일 누락 ${row.cases}개: 역전 ${row.pairViolationRange.join('~')}쌍.`) || []),
  `- 실제 관측 간격을 반영한 선형 시간 가중 실험: ${elapsedCalendarSummary.artifactStatus}, ${elapsedCalendarSummary.completedCases ?? 0}/${elapsedCalendarSummary.plannedCases ?? 0}개 완료. 역전 범위 ${elapsedCalendarSummary.pairViolationRange?.join('~') ?? '미산정'}쌍.`,
  ...(pairedSampling ? [
    `- 같은 누락 날짜끼리 비교하면 시간 가중은 ${pairedSampling.fewerInversions}개에서 개선, ${pairedSampling.unchanged}개에서 동일, ${pairedSampling.moreInversions}개에서 악화였다. 수집 간격 반영만으로 안정성이 개선됐다고 주장하지 않는다.`
  ] : []),
  ...(expandedBoundary ? [
    `- 8월 3~5일 누락의 경계 접촉을 지수 0~4로 확대 재탐색했다. 최소 역전은 ${expandedBoundary.minimumPairViolations}쌍이며 Google Play 지수 범위는 ${expandedBoundary.coOptimalSet.googlePlayExponentRange.map(f).join('~')}였다. 범위 확대만으로 누락 민감도가 사라지지 않았다.`
  ] : []), '',
  '## 5. 남은 한계', '',
  '- 글로벌 금액 13개와 5개국·30일 순위만으로 국가·스토어별 실제 매출 배분은 식별되지 않는다.',
  '- 임의 곡선을 없애고 단조성·예산 제약만 두면 가능한 매출 범위가 매우 넓다. 데이터를 완벽히 맞출 수 있다는 사실도 예측 가능성을 보장하지 않는다.',
  '- Roblox iOS 관측 범위, 지역판 상품군 합산, 공급업체 차이와 세금 기준이 남아 있다.',
  '- 다음 달 월간 금액과 같은 범위의 순위로 검증하기 전까지 운영 모델과 구분한다.', '',
  '## 자료와 실행', '',
  '- [실행·관리 안내](../../scripts/revenue-research/README.md)',
  '- [평가 프로토콜](../../docs/research/revenue-model-polishing-protocol-2026-09-10.md)',
  '- [시장·지역 대조](market-evidence-comparison-2026-09-10.md)',
  '- [기간·스토어 시장 근거](../../docs/research/same-month-market-evidence-2026-09-10.json)',
  '- [선형계획 식별 범위](partial-identification-bounds-2026-09-10.json)', ''
];
const destination = path.join(root, 'reports/rank-models/revenue-model-polish-2026-09-10');
fs.writeFileSync(`${destination}.json`, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(`${destination}.md`, lines.join('\n'));
console.log(JSON.stringify({ report: `${destination}.md`, productionEnabled: false, calendar: calendarSummary }));
