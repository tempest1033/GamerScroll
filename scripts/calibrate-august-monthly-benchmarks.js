'use strict';

// Research only: five-market monthly chart features versus global vendor estimates.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const load = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const benchmark = load('docs/research/game-revenue-benchmarks-2026-09-10.json');
const model = load('data/rank-models/global-chart-2026-v0.3.json');
const dictionary = load('data/games.json').games;
const targets = benchmark.monthly_global.observations.filter(r => r.month === '2026-08');
const definitions = [
  ['Honor of Kings', null, ['989673964'], []],
  ['Gossip Harbor', '가십하버: 합성 & 스토리 게임'],
  ['PUBG Mobile', '배틀그라운드', ['1321803705', '1453363650', '1330123889'], ['com.rekoo.pubgm', 'com.tencent.ig']],
  ['Royal Match', '로얄 매치 Royal Match'],
  ['Roblox', 'Roblox'],
  ['eFootball', 'eFootball™'],
  ['Pokemon GO', 'Pokémon GO'],
  ['Fate/Grand Order', '페이트/그랜드 오더',
    ['1108397779', '1015521325', '1225867328', '1183802626'],
    ['com.aniplex.fategrandorder', 'com.xiaomeng.fategrandorder', 'com.aniplex.fategrandorder.en']],
  ['Valorant Mobile', null, ['6535673811'], []],
  ['Golden Spatula', null, ['1478101301'], []],
  ['Pokemon TCG Pocket', '포켓몬 카드 게임 Pocket'],
  ['Brawl Stars', '브롤스타즈', ['1504236603'], []],
  ['Eggy Party', null, ['1544884479', '1673675970'], ['com.netease.eggypartyhmt']]
];
const names = definitions.map(d => d[0]);
const lookup = new Map();
const identities = definitions.map(([name, entry, extraIos = [], extraAos = []], index) => {
  const base = entry ? dictionary[entry].appIds : {};
  const ids = {
    ios: [...new Set([base.ios, ...extraIos].filter(Boolean).map(String))],
    aos: [...new Set([base.android, ...extraAos].filter(Boolean).map(String))]
  };
  for (const [store, list] of Object.entries(ids)) for (const id of list) {
    assert(!lookup.has(`${store}:${id}`));
    lookup.set(`${store}:${id}`, index);
  }
  return { name, ids, status: 'store titles verified; vendor regional-family aggregation provisional' };
});
const y = names.map(name => targets.find(t => t.game === name).amount);
const countries = new Map(model.countries.map(c => [c.country.toLowerCase(), c]));
const markets = ['cn', 'us', 'jp', 'kr', 'tw'];
const charts = new Map();
let sourceRows = 0;
const files = fs.readdirSync('snapshots/rankings').filter(n => /^2026-08-\d{2}_(ios|aos)_[a-z]{2}_grossing\.csv$/.test(n)).sort();
for (const file of files) {
  const [, date, store, country] = file.match(/^(2026-08-\d{2})_(ios|aos)_([a-z]{2})_grossing\.csv$/);
  assert(markets.includes(country));
  const key = `${store}_${country}`;
  if (!charts.has(key)) charts.set(key, { store, country, days: new Map() });
  const rows = fs.readFileSync(`snapshots/rankings/${file}`, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  assert.equal(rows.shift(), 'time,rank,id,title');
  const snapshots = new Map();
  for (const line of rows.filter(Boolean)) {
    const match = line.match(/^(\d\d:\d\d),(\d+),([^,]+),/);
    assert(match, file);
    const [, time, text, id] = match;
    const rank = Number(text);
    assert(rank >= 1 && rank <= 200);
    if (!snapshots.has(time)) snapshots.set(time, { ranks: new Set(), apps: new Set(), hits: [] });
    const snapshot = snapshots.get(time);
    assert(!snapshot.ranks.has(rank) && !snapshot.apps.has(id), `${file} ${time}`);
    snapshot.ranks.add(rank);
    snapshot.apps.add(id);
    const game = lookup.get(`${store}:${id}`);
    if (game !== undefined) snapshot.hits.push({ game, rank });
    sourceRows++;
  }
  assert(snapshots.size > 0);
  charts.get(key).days.set(date, snapshots);
}
assert.equal(charts.size, 9);
const hist = Array.from({ length: names.length }, () => ({ cn: new Float64Array(201), other: new Float64Array(201) }));
const marketHist = Array.from({ length: names.length }, () => ({}));
const coverage = [];
const gameCoverage = names.map(name => ({ name, hits: 0, observedRankMin: 201, observedRankMax: 0 }));
for (const [key, chart] of charts) {
  const c = countries.get(chart.country);
  const weight = c.marketProxyUsd / 1e9 * c.storeShares[chart.store === 'aos' ? 'android' : 'ios'];
  const counts = [];
  for (const snapshots of chart.days.values()) {
    for (const snapshot of snapshots.values()) {
      counts.push(snapshot.ranks.size);
      for (const { game, rank } of snapshot.hits) {
        hist[game][chart.country === 'cn' ? 'cn' : 'other'][rank] += weight / chart.days.size / snapshots.size;
        marketHist[game][key] ||= new Float64Array(201);
        marketHist[game][key][rank] += weight / chart.days.size / snapshots.size;
        const g = gameCoverage[game];
        g.hits++;
        g.observedRankMin = Math.min(g.observedRankMin, rank);
        g.observedRankMax = Math.max(g.observedRankMax, rank);
      }
    }
  }
  coverage.push({ key, days: chart.days.size, snapshots: counts.length,
    missingDates: Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`).filter(d => !chart.days.has(d)),
    minRows: Math.min(...counts), maxRows: Math.max(...counts),
    shortSnapshots: counts.filter(n => n < 200).length });
}
assert(gameCoverage.every(g => g.hits > 0));
if (process.argv.includes('--features')) {
  const output = 'reports/rank-models/august-monthly-features-2026-09-10.json';
  fs.writeFileSync(output, JSON.stringify({
    names, targetsMillion: y, identities, coverage, gameCoverage,
    source: benchmark.sources.S01,
    histograms: marketHist.map(h => Object.fromEntries(Object.entries(h).map(([key, values]) => [key, Array.from(values)])))
  }) + '\n');
  console.log(JSON.stringify({ output, games: names.length, charts: charts.size, files: files.length }));
  process.exit(0);
}
// Three fitted parameters only: common curve exponent, relative China coefficient,
// and a global scale. The China coefficient is NOT an identified market-size estimate.
const alphas = Array.from({ length: 91 }, (_, i) => 0.25 + i * 0.025);
const gains = Array.from({ length: 151 }, (_, i) => 0.25 + i * 0.025);
function features(alpha) {
  return hist.map(h => Object.fromEntries(['cn', 'other'].map(part => [
    part, h[part].reduce((s, weight, rank) => rank ? s + weight * rank ** -alpha : s, 0)
  ])));
}
const featureGrid = alphas.map(features);
const all = names.map((_, i) => i);
function fit(indices, baseline = false) {
  let best;
  const ais = baseline ? [alphas.indexOf(1)] : alphas.map((_, i) => i);
  assert(indices.length > 3);
  for (const ai of ais) for (const gain of baseline ? [1] : gains) {
    const f = featureGrid[ai];
    const xs = f.map(x => gain * x.cn + x.other);
    assert(xs.every(x => x > 0));
    const logScale = indices.reduce((s, i) => s + Math.log(y[i] / xs[i]), 0) / indices.length;
    const loss = indices.reduce((s, i) => s + (logScale + Math.log(xs[i] / y[i])) ** 2, 0) / indices.length;
    if (!best || loss < best.loss) best = { alpha: alphas[ai], chinaGain: gain,
      scale: Math.exp(logScale), loss, predictions: xs.map(x => x * Math.exp(logScale)) };
  }
  return best;
}
function metrics(predictions) {
  return require('./lib/revenue-model-metrics').revenueMetrics(y, predictions);
}
function ranks(values) {
  const order = all.slice().sort((a, b) => values[b] - values[a]);
  return all.map(i => order.indexOf(i) + 1);
}
const baseline = fit(all, true);
const fitted = fit(all);
const heldout = all.map(i => {
  const train = all.filter(j => j !== i);
  assert(!train.includes(i));
  const before = fit(train, true);
  const after = fit(train);
  return { game: names[i], before: before.predictions[i], after: after.predictions[i],
    alpha: after.alpha, chinaGain: after.chinaGain };
});
const benchmarkRanks = ranks(y);
const beforeRanks = ranks(baseline.predictions);
const afterRanks = ranks(fitted.predictions);
const rows = all.map(i => ({
  game: names[i], referenceMillion: y[i], referenceRankWithinSample: benchmarkRanks[i],
  baselineMillion: baseline.predictions[i], baselineRankWithinSample: beforeRanks[i],
  fittedMillion: fitted.predictions[i], fittedRankWithinSample: afterRanks[i],
  fittedErrorPercent: (fitted.predictions[i] / y[i] - 1) * 100,
  heldoutMillion: heldout[i].after, heldoutErrorPercent: (heldout[i].after / y[i] - 1) * 100
})).sort((a, b) => a.referenceRankWithinSample - b.referenceRankWithinSample);
const report = {
  status: 'experimental_five_market_proxy_calibration_not_global_revenue_validation',
  productionEnabled: false, period: '2026-08', timezone: 'Asia/Seoul',
  source: benchmark.sources.S01, files: files.length, sourceRows, coverage, gameCoverage, identities,
  formula: 'USD million proxy = scale * (chinaGain * CN monthly mean weighted r^-alpha + other four markets monthly mean weighted r^-alpha).',
  averaging: 'Equal weight for observed KST days; equal snapshots within each chart-day. Average rank weights, not ranks.',
  search: { alpha: [0.25, 2.5], chinaGain: [0.25, 4], step: 0.025 },
  baseline, fitted, heldout, rows,
  metrics: { baselineTraining: metrics(baseline.predictions), fittedTraining: metrics(fitted.predictions),
    baselineLeaveOneGameOut: metrics(heldout.map(g => g.before)), fittedLeaveOneGameOut: metrics(heldout.map(g => g.after)) },
  limitations: [
    'Only CN, US, JP, KR and TW history exists for August; no 128-market monthly reconstruction.',
    'August 1 is missing. Observed days proxy the full month; vendor reporting timezone is not established.',
    'Global vendor amounts are fitted to five-market features. Missing countries can bias every fitted coefficient.',
    'Country annual proxies and store shares retain prior assumptions; China coefficient absorbs missing regions, identity gaps and curve error.',
    'Regional app-family aggregation is provisional, especially PUBG/Peacekeeper, FGO, China Brawl Stars and Honor of Kings overseas editions.',
    'Unobserved apps contribute zero chart feature, not zero actual revenue; short charts may censor targets.',
    'All-sample fit is descriptive; leave-one-game-out estimates exclude the tested amount but are same-month, same-provider tests.',
    'No later-month validation and no independent developer revenue verification.',
    'Ranks are within the 13 benchmark games only, never claimed as full global ranks.',
    'Previous September scenarios and alpha=0.62 draft are not used. No production weights or game dictionary are modified.'
  ]
};
assert.equal(rows.length, 13);
assert(rows.every(r => Number.isFinite(r.fittedMillion) && Number.isFinite(r.heldoutMillion)));
assert.equal(model.productionEnabled, false);
const prefix = 'reports/rank-models/august-monthly-calibration-2026-09-10';
fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
const f = n => n.toFixed(2);
const lines = [
  '# 8월 월간 매출표·순위 이력 보정 실험', '',
  '> 주요 5개국 이력으로 글로벌 업체 추정치를 설명하는 제한적 실험. 운영 미적용. 모든 순위는 비교 게임 13개 안의 순위다.', '',
  `- 기간: 2026년 8월, KST. 원본 ${files.length}개 파일·${sourceRows.toLocaleString('en-US')}행.`,
  '- 중국·미국·일본·한국·대만 9개 차트. 8월 1일 누락; 나머지 관측일과 하루 안의 시점은 각각 동일 가중치.',
  '- 매출액은 AppMagic 수수료 전 App Store+Google Play 글로벌 추정치. 중국 Android 제외.',
  '- 기존 방식은 α=1·중국 계수=1에서 금액 배율만 적합. 보정은 공통 α·중국 상대 계수·금액 배율을 함께 적합.',
  `- 전체 표본 적합: α=${f(fitted.alpha)}, 중국 상대 계수=${f(fitted.chinaGain)}. 이 계수는 중국 시장 규모의 확정 보정률이 아니다.`, '',
  '## 같은 달 금액 비교', '',
  '단위: 백만 달러. 전체 적합은 해당 게임 금액을 학습에 사용했다. 제외 검증은 해당 게임 금액을 빼고 나머지 12개로 계수를 맞춘 예측이다.', '',
  '| 게임 | 기준액 | 기존 방식 | 전체 적합 | 기준/기존/보정 표본 순위 | 제외 검증 | 제외 검증 오차 |',
  '|---|---:|---:|---:|---|---:|---:|',
  ...rows.map(r => `| ${r.game} | ${f(r.referenceMillion)} | ${f(r.baselineMillion)} | ${f(r.fittedMillion)} | ${r.referenceRankWithinSample}/${r.baselineRankWithinSample}/${r.fittedRankWithinSample} | ${f(r.heldoutMillion)} | ${f(r.heldoutErrorPercent)}% |`),
  '', '## 평가', '',
  '| 구분 | 평균 절대 백분율 오차 | 순서 역전 쌍 |',
  '|---|---:|---:|',
  ...Object.entries(report.metrics).map(([k, m]) => `| ${k} | ${f(m.mapePercent)}% | ${m.rankInversions}/${m.comparedPairs} |`),
  '', '제외 검증은 같은 달의 다른 게임에 대한 테스트이며, 다음 달 예측 정확도나 실제 결제액 정확도가 아니다.',
  '', '## 한계', '',
  '- 128개국 8월 이력이 없어 주요 5개국만 사용했다. 나머지 국가 매출을 금액 배율이 흡수하므로 국가별 원인을 식별할 수 없다.',
  '- 지역판은 확인된 스토어 ID로 묶었지만 AppMagic의 상품군 범위와 일치하는지는 미확정이다. 특히 PUBG/화평정영, FGO, 중국 브롤스타즈 및 왕자영요 해외판이 영향을 줄 수 있다.',
  '- 미진입 게임은 차트 지수 기여가 0일 뿐, 매출이 0이라는 의미가 아니다. 짧은 차트·8월 1일 누락·시차 차이가 남는다.',
  '- 순위 곡선과 시장 계수는 서로 오차를 흡수한다. 개선되어도 운영 계수로 바로 채택하지 않는다.',
  '', '[매출 출처](' + report.source.url + ')',
  '', '재현: `node scripts/calibrate-august-monthly-benchmarks.js`', ''
];
fs.writeFileSync(`${prefix}.md`, lines.join('\n'));
console.log(JSON.stringify({ coverage, rows, parameters: { alpha: fitted.alpha, chinaGain: fitted.chinaGain },
  metrics: report.metrics, heldoutParameters: heldout.map(({ game, alpha, chinaGain }) => ({ game, alpha, chinaGain })) }, null, 2));
