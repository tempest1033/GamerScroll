'use strict';

const fs = require('fs');
const path = require('path');
const archive = require('./lib/global-rankings');
const {
  chartDefinitions, selectCompleteRun, evaluateSnapshot, installPreviewIdentities
} = require('./preview-global-chart-model');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = 'data/rank-models/global-chart-2026-growth-assumptions.json';

function selectGrowth(country, config) {
  if (config.countryRates[country]) return config.countryRates[country];
  const group = config.regionalRates.find((row) => row.countries.includes(country));
  return group || config.defaultRate;
}

function projectModel(base, config, multiplier = 1) {
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error('Invalid growth multiplier');
  const countries = base.countries.map((original) => {
    const selected = selectGrowth(original.country, config);
    const rate = selected.rate * multiplier;
    if (!config.sources[selected.sourceId] || !Number.isFinite(rate) || rate <= -1) {
      throw new Error(`Invalid growth assumption: ${original.country}`);
    }
    return {
      ...original,
      baseMarketProxyUsd: original.marketProxyUsd,
      marketProxyUsd: Math.round(original.marketProxyUsd * (1 + rate)),
      growth: {
        observedTrendRate: selected.rate, projectedRate: rate, multiplier,
        sourceId: selected.sourceId, basis: selected.basis,
        sourceTier: config.sources[selected.sourceId].tier,
        sourcePeriod: config.sources[selected.sourceId].period,
        annualForecastValidated: false
      }
    };
  });
  const observedScopeBudgetUsd = countries.reduce((sum, row) => sum + row.marketProxyUsd, 0);
  const uncollectedReserveUsd = Math.round(base.budgets.uncollectedReserveUsd * (1 + config.defaultRate.rate * multiplier));
  for (const row of countries) {
    row.marketWeight = row.marketProxyUsd / observedScopeBudgetUsd;
    row.storeWeights = {
      ios: row.marketWeight * row.storeShares.ios,
      android: row.marketWeight * row.storeShares.android
    };
  }
  countries.sort((a, b) => b.marketProxyUsd - a.marketProxyUsd || a.country.localeCompare(b.country));
  return {
    schemaVersion: 1, modelId: config.modelId, baseYear: config.forecastYear,
    status: 'experimental_growth_scenario', productionEnabled: false,
    label: '2026 전망 보정 시장 차트 지수 — 최근 추세 연장 시나리오',
    target: {
      ...base.target,
      periodPolicy: '2026 full-year scenario extrapolated from H1 and rolling-year trends, not a completed calendar year'
    },
    rankCurve: base.rankCurve, formula: base.formula,
    sources: { baseModel: config.baseModel, growthAssumptions: CONFIG, growthSources: config.sources },
    budgets: {
      hypotheticalWorldBudgetUsd: observedScopeBudgetUsd + uncollectedReserveUsd,
      observedScopeBudgetUsd, uncollectedReserveUsd,
      baseObservedScopeBudgetUsd: base.budgets.observedScopeBudgetUsd,
      impliedObservedScopeGrowth: observedScopeBudgetUsd / base.budgets.observedScopeBudgetUsd - 1,
      basis: 'bottom_up_scenario_not_forced_to_global_growth'
    },
    countries,
    limitations: [...base.limitations, ...config.limitations]
  };
}

function compareReports(baseReport, projectedReport) {
  if (JSON.stringify(baseReport.snapshot) !== JSON.stringify(projectedReport.snapshot)) {
    throw new Error('Growth comparison requires the same snapshot');
  }
  const before = new Map(baseReport.results.map((row) => [row.key, row]));
  if (before.size !== projectedReport.results.length) throw new Error('Comparison game universe changed');
  return projectedReport.results.map((row) => {
    const old = before.get(row.key);
    if (!old) throw new Error(`Missing baseline game: ${row.key}`);
    return {
      ...row,
      baseline2025Rank: old.rank,
      baseline2025Score: old.score,
      growthRankChange: old.rank - row.rank,
      scoreChangePercent: old.score ? (row.score / old.score - 1) * 100 : null
    };
  });
}

function markdown(model, config, report) {
  const pct = (value) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  const clean = (text) => String(text).replace(/[|\r\n]/g, ' ');
  const lines = [
    '# 2026년 시장 성장 전망 보정 비교', '',
    '**최근 실적 추세를 연간으로 연장한 시나리오다. 공식 2026년 연간 전망이나 실제 게임별 매출이 아니다.**',
    '',
    `동일 순위 스냅샷: **${report.snapshot.date} ${report.snapshot.time} KST**`,
    `국가·지역 ${report.coverage.countryCount}개, 매출 차트 ${report.coverage.chartCount}개. 게임 연결·스토어 비중·순위 곡선은 고정했다.`,
    '',
    '## 보정 방식', '',
    '`2026 근사 규모 = 2025 근사 규모 × (1 + 최근 매출 증감률)`',
    '그 뒤 전체 국가·스토어 가중치를 다시 정규화했다. 순위 가중치는 그대로 `1/순위`다.',
    '- 아시아 10개국: 2026년 7월 말 기준 12개월의 공식 IAP 증감률',
    '- 미국·독일·영국·프랑스: Sensor Tower H1 보고서를 정리한 보조 출처의 증감률',
    '- 다른 유럽 28개국: 지역 추세 +10%를 적용한 가정',
    '- 나머지 국가: 세계 H1 추세 -2%를 적용한 가정',
    '- 실제 2026년 달력연도 전망으로 검증된 증감률은 아니다.',
    '',
    '## 주요 국가의 변화', '',
    '| 국가 | 적용 추세 | 2025 모형 규모, 십억 달러 | 2026 모형 규모, 십억 달러 | 2026 관측범위 내 비중 |',
    '|---|---:|---:|---:|---:|'
  ];
  for (const row of model.countries.filter((row) => config.countryRates[row.country])) {
    lines.push(`| ${row.name} | ${pct(row.growth.projectedRate)} | ${(row.baseMarketProxyUsd / 1e9).toFixed(3)} | ${(row.marketProxyUsd / 1e9).toFixed(3)} | ${(row.marketWeight * 100).toFixed(2)}% |`);
  }
  lines.push('', `128개국 모형 합계는 ${(model.budgets.baseObservedScopeBudgetUsd / 1e9).toFixed(3)}B → ${(model.budgets.observedScopeBudgetUsd / 1e9).toFixed(3)}B USD, **${pct(model.budgets.impliedObservedScopeGrowth)}**다.`,
    '세계 -2%는 미측정 국가의 대리값이지 전체 합계를 강제로 맞춘 목표가 아니다.',
    '수치가 감소한 국가도 다른 국가보다 덜 감소하면 정규화된 비중은 커질 수 있다.',
    '',
    '## TOP 30 비교', '',
    '「기존」은 5개국 옛 산식이 아니라 **128개국 2025 가중치 v0.2**다. 날짜와 게임 연결을 동일하게 유지했다.',
    '| 2026 보정 순위 | 게임 | 2025 가중치 순위 | 순위 변화 | 2025 지수 | 2026 지수 | 지수 증감 |',
    '|---:|---|---:|---:|---:|---:|---:|');
  for (const row of report.results.slice(0, 30)) {
    lines.push(`| ${row.rank} | ${clean(row.title)} | ${row.baseline2025Rank} | ${row.growthRankChange > 0 ? '+' : ''}${row.growthRankChange} | ${row.baseline2025Score.toFixed(3)} | ${row.score.toFixed(3)} | ${row.scoreChangePercent == null ? '—' : `${row.scoreChangePercent.toFixed(2)}%`} |`);
  }
  lines.push('', '## 추세 강도 민감도', '',
    '| 적용 강도 | 기준 TOP 20과 공통 게임 | 기준 TOP 20 최대 순위 이동 |',
    '|---:|---:|---:|');
  for (const scenario of report.sensitivity) {
    lines.push(`| ${scenario.multiplier}배 | ${scenario.top20Overlap} | ${scenario.maxTop20Movement} |`);
  }
  lines.push('', '## 한계', ...config.limitations.map((note) => `- ${note}`),
    '- 성장 보정은 국가 비중의 변경이다. 개별 게임의 성장률을 추가 곱하지 않아 차트 순위와 성장 효과를 중복 반영하지 않는다.',
    '- 원천 업체의 과거 통계 개정 때문에 최신 보고서의 절대액과 이 모형의 성장 적용 후 절대액은 다를 수 있다.',
    '- 실매출 감소가 아니라 웹결제로의 이동 때문에 스토어 IAP만 줄어든 경우도 있다.',
    '- 국가별 게임 식별 미완료, 짧은 원본 차트 등 기존 비교의 한계가 그대로 남는다.',
    '- 생성된 모형과 비교표는 운영 페이지에 연결하지 않았다.',
    '',
    '## 출처',
    ...Object.values(config.sources).map((source) => `- [${source.publisher}](${source.url}) — ${source.period}`),
    '');
  return lines.join('\n');
}

function* snapshotDays() {
  for (const date of archive.listDays().reverse()) yield archive.readDay(date);
}

function main() {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const config = read(CONFIG);
  const base = read(config.baseModel);
  const model = projectModel(base, config);
  const selected = selectCompleteRun(snapshotDays(), chartDefinitions(base));
  const stats = require('../src/rank/stats').loadRankStats();
  const identities = read('data/rank-models/preview-game-identities.json');
  installPreviewIdentities(stats, identities);
  const apps = archive.loadApps();
  const evaluate = (candidate) => evaluateSnapshot(selected.day, selected.time, candidate, apps, stats);
  const baseReport = evaluate(base);
  const report = evaluate(model);
  report.results = compareReports(baseReport, report);
  report.previewIdentityOverrides = identities;
  report.skippedRuns = selected.skipped;
  const oldTop20 = baseReport.results.slice(0, 20);
  const oldTop20Keys = new Set(oldTop20.map((row) => row.key));
  report.sensitivity = config.sensitivityMultipliers.map((multiplier) => {
    const result = multiplier === 1 ? report : evaluate(projectModel(base, config, multiplier));
    const ranks = new Map(result.results.map((row) => [row.key, row.rank]));
    return {
      multiplier,
      top20Overlap: result.results.slice(0, 20).filter((row) => oldTop20Keys.has(row.key)).length,
      maxTop20Movement: Math.max(...oldTop20.map((row) => Math.abs(row.rank - ranks.get(row.key))))
    };
  });
  const modelPath = `data/rank-models/${config.modelId}.json`;
  const reportPath = 'reports/rank-models/global-chart-2026-growth-preview';
  fs.mkdirSync(path.join(ROOT, 'reports/rank-models'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, modelPath), JSON.stringify(model, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, reportPath + '.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, reportPath + '.md'), markdown(model, config, report));
  console.log(JSON.stringify({
    modelPath, reportPath: reportPath + '.md', snapshot: report.snapshot, budgets: model.budgets,
    countryRateCoverage: model.countries.reduce((acc, row) => { acc[row.growth.basis] = (acc[row.growth.basis] || 0) + 1; return acc; }, {}),
    sensitivity: report.sensitivity,
    top20: report.results.slice(0, 20).map((row) => ({
      rank: row.rank, title: row.title, beforeRank: row.baseline2025Rank,
      beforeScore: Number(row.baseline2025Score.toFixed(3)), score: Number(row.score.toFixed(3)),
      changePct: Number(row.scoreChangePercent.toFixed(2))
    }))
  }));
}

if (require.main === module) main();
module.exports = { selectGrowth, projectModel, compareReports };
