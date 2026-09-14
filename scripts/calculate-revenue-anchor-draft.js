const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Research only: fit two China anchors, preserve market weight, and transfer
// the fitted shape to the frozen September cohort as an explicit scenario.
const anchorPath = 'docs/research/major-market-revenue-anchors-2026-09-10.json';
const inputPath = 'reports/rank-models/global-chart-2026-growth-preview.json';
const modelPath = 'data/rank-models/global-chart-2026-v0.3.json';
const anchors = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const countries = new Map(model.countries.map(c => [c.country.toLowerCase(), c]));
const budget = model.countries.reduce((s, c) => s + c.marketProxyUsd, 0);
const config = { month: '2026-08', daysInMonth: 31, daysInYear: 365, maxRank: 200,
  topKnot: 10, alphaMin: 0, alphaMax: 3, gridStep: 0.005, bootstrapSamples: 200 };
const cnIds = { honor: '989673964', valorant: '6535673811', peace: '1321803705',
  delta: '1642894547', spatula: '1478101301' };
const jpIds = { ios: '1015521325', aos: 'com.aniplex.fategrandorder' };
const cnGroup = anchors.amount_groups.find(g => g.id === 'china_august_gross');
const cnRows = new Map(cnGroup.rows.map(r => [r[0], r[1]]));
const target = { valorant: cnRows.get('Valorant Mobile'), spatula: cnRows.get('Golden Spatula') };
const jpTarget = anchors.amount_groups.find(g => g.id === 'japan_august_retained').rows[0][1];
const prior = JSON.parse(fs.readFileSync('reports/rank-models/china-ios-august-2026-curve-diagnostic.json', 'utf8'));
const honorCeiling = prior.anchors.honorWorldwideGrossUsdMillion;
assert.equal(model.productionEnabled, false);
assert.equal(anchors.automatic_model_use, false);
assert.equal(countries.get('cn').storeShares.android, 0);
assert.equal(cnGroup.fee_basis, 'gross');
assert.equal(cnGroup.period.start, '2026-08-01');
assert.equal(cnGroup.period.end, '2026-08-31');
assert(target.valorant > 0 && target.spatula > 0 && jpTarget > 0);

function loadDays(store, country, ids, utcOffset) {
  const snapshots = new Map();
  const directory = 'snapshots/rankings';
  const suffix = `_${store}_${country}_grossing.csv`;
  const files = fs.readdirSync(directory).filter(n =>
    n.endsWith(suffix) && (n.startsWith('2026-08-') || n.startsWith('2026-09-01'))).sort();
  for (const file of files) {
    const lines = fs.readFileSync(path.join(directory, file), 'utf8').split(/\r?\n/);
    assert.equal(lines.shift().replace(/^\uFEFF/, ''), 'time,rank,id,title');
    for (const line of lines.filter(Boolean)) {
      const match = line.match(/^(\d\d:\d\d),(\d+),([^,]+),/);
      assert(match, `Malformed row: ${file}`);
      const [, time, rankText, id] = match;
      const rank = Number(rankText);
      assert(rank >= 1 && rank <= config.maxRank);
      const timestamp = Date.parse(`${file.slice(0, 10)}T${time}:00+09:00`);
      const day = new Date(timestamp + utcOffset * 3600000).toISOString().slice(0, 10);
      if (!day.startsWith(config.month)) continue;
      if (!snapshots.has(timestamp)) snapshots.set(timestamp, { day, ranks: new Map() });
      const ranks = snapshots.get(timestamp).ranks;
      assert(!ranks.has(id), `Duplicate app ${file} ${time} ${id}`);
      ranks.set(id, rank);
    }
  }
  const grouped = new Map();
  for (const row of snapshots.values()) {
    if (!grouped.has(row.day)) grouped.set(row.day, []);
    grouped.get(row.day).push(row);
  }
  const days = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
    date, snapshots: rows.length,
    ranks: Object.fromEntries(Object.entries(ids).map(([game, id]) => [
      game, rows.map(row => row.ranks.get(id) ?? null)
    ]))
  }));
  for (const day of days) for (const [game, ranks] of Object.entries(day.ranks))
    assert(ranks.every(Number.isFinite), `Missing target: ${country} ${store} ${day.date} ${game}`);
  assert(days.length > 0, `No data: ${country} ${store}`);
  const missingDates = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
    .filter(date => !grouped.has(date));
  return { days, coverage: { files: files.length, snapshots: snapshots.size,
    observedDays: days.length, missingDates, localUtcOffset: utcOffset,
    observationsPerDay: Object.fromEntries(days.map(d => [d.date, d.snapshots])) } };
}

// Below the top-ten knot, retain the original reciprocal-rank tail shape.
function curve(rank, alpha) {
  return rank <= config.topKnot ? rank ** -alpha
    : config.topKnot ** (1 - alpha) / rank;
}
function mass(alpha) {
  return Array.from({ length: config.maxRank }, (_, i) => curve(i + 1, alpha)).reduce((a, b) => a + b, 0);
}
function meanWeight(days, game, alpha) {
  return days.reduce((sum, day) => sum + day.ranks[game].reduce(
    (s, rank) => s + curve(rank, alpha), 0) / day.ranks[game].length, 0) / days.length;
}
function fit(days, targets = target) {
  let best;
  const evaluated = [];
  const count = Math.round((config.alphaMax - config.alphaMin) / config.gridStep);
  for (let i = 0; i <= count; i++) {
    const alpha = config.alphaMin + i * config.gridStep;
    const weights = Object.fromEntries(Object.keys(targets).map(g => [g, meanWeight(days, g, alpha)]));
    const scale = Math.exp(Object.keys(targets).reduce(
      (s, g) => s + Math.log(targets[g] / weights[g]), 0) / Object.keys(targets).length);
    const loss = Object.keys(targets).reduce(
      (s, g) => s + Math.log(scale * weights[g] / targets[g]) ** 2, 0);
    const point = { alpha, scaleUsdMillion: scale, logSquaredLoss: loss, weights };
    evaluated.push(point);
    if (!best || loss < best.logSquaredLoss) best = point;
  }
  return { ...best, atSearchBoundary: best.alpha === config.alphaMin || best.alpha === config.alphaMax,
    ratioRangeInSearch: {
      min: Math.min(...evaluated.map(p => p.weights.valorant / p.weights.spatula)),
      max: Math.max(...evaluated.map(p => p.weights.valorant / p.weights.spatula))
    } };
}

function main() {
  const cn = loadDays('ios', 'cn', cnIds, 8);
  const jp = Object.fromEntries(Object.entries(jpIds).map(([store, id]) =>
    [store, loadDays(store, 'jp', { fgo: id }, 9)]));
  const fitted = fit(cn.days);
  const baseMass = mass(1);
  const fittedMass = mass(fitted.alpha);
  const normalize = baseMass / fittedMass;
  const gameEstimates = Object.fromEntries(Object.keys(cnIds).map(game => [game,
    fitted.scaleUsdMillion * meanWeight(cn.days, game, fitted.alpha)]));
  const trainingResiduals = Object.fromEntries(Object.keys(target).map(game => [game, {
    targetUsdMillion: target[game], fittedUsdMillion: gameEstimates[game],
    percentDifference: (gameEstimates[game] / target[game] - 1) * 100
  }]));
  const singleAnchorBaseline = Object.fromEntries(['valorant', 'spatula'].map(anchor => {
    const scale = target[anchor] / meanWeight(cn.days, anchor, 1);
    return [anchor, { scaleUsdMillion: scale,
      predictions: Object.fromEntries(Object.keys(cnIds).map(g => [g, scale * meanWeight(cn.days, g, 1)])) }];
  }));

  // Resample paired days to expose sampling sensitivity; this is NOT a
  // confidence interval for actual revenue or vendor measurement error.
  let seed = 20260910;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const boot = [];
  for (let b = 0; b < config.bootstrapSamples; b++) {
    const sample = cn.days.map(() => cn.days[Math.floor(random() * cn.days.length)]);
    boot.push(fit(sample).alpha);
  }
  boot.sort((a, b) => a - b);
  const samplingSensitivity = { method: 'paired observed-day resampling, deterministic seed 20260910',
    samples: boot.length, alphaP05: boot[Math.floor(boot.length * 0.05)],
    alphaP95: boot[Math.floor(boot.length * 0.95)],
    meaning: 'descriptive sampling sensitivity only, not revenue confidence interval' };
  const candidates = [...new Set([samplingSensitivity.alphaP05, fitted.alpha, samplingSensitivity.alphaP95])];
  function rerank(alpha) {
    const normalization = baseMass / mass(alpha);
    return input.results.map(game => {
      let oldScore = 0, score = 0, chinaBefore = 0, chinaAfter = 0;
      for (const row of game.charts) {
        const c = countries.get(row.country);
        assert(c && Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= config.maxRank);
        const weight = 100 * c.marketProxyUsd / budget * c.storeShares[row.store];
        const before = weight / row.rank;
        const after = row.country === 'cn' ? weight * curve(row.rank, alpha) * normalization : before;
        oldScore += before; score += after;
        if (row.country === 'cn') { chinaBefore += before; chinaAfter += after; }
      }
      assert(Math.abs(oldScore - game.score) < 1e-8, `Old score mismatch ${game.key}`);
      return { key: game.key, title: game.title, identityMapped: game.identityMapped,
        oldRank: game.rank, oldScore, score, chinaBefore, chinaAfter };
    }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .map((g, i) => ({ rank: i + 1, ...g, rankChange: g.oldRank - i - 1 }));
  }
  const results = rerank(fitted.alpha);
  const scenarios = candidates.map(alpha => ({ alpha, top20: rerank(alpha).slice(0, 20) }));
  const japan = countries.get('jp');
  const jpWeight = japan.storeShares.ios * meanWeight(jp.ios.days, 'fgo', 1)
    + japan.storeShares.android * meanWeight(jp.aos.days, 'fgo', 1);
  const japanDiagnostic = {
    targetUsdMillion: jpTarget, storeShares: japan.storeShares,
    weightedMeanReciprocalRank: jpWeight,
    impliedTop200MonthlyBudgetUsdMillion: jpTarget * baseMass / jpWeight,
    neutralAugustMarketProxyUsdMillion: japan.marketProxyUsd / 1e6 * config.daysInMonth / config.daysInYear,
    assumptions: [
      'Normalize the existing reciprocal-rank curve across ranks 1..200; implied budget covers that modeled allocation only.',
      'Existing market-level store shares approximate this game distribution; not verified for FGO.',
      'Observed days represent the month; calendar-neutral annual allocation is only a comparator, not August market evidence.',
      'A single game cannot identify country amplitude, store split and curve simultaneously. No Japan coefficient transferred.'
    ],
    productionOrScenarioCorrectionApplied: false,
    coverage: { ios: jp.ios.coverage, android: jp.aos.coverage }
  };
  const report = {
    status: 'experimental_draft_not_validated_revenue_ranking',
    calculatedAt: new Date().toISOString(), productionEnabled: false,
    paths: { anchorPath, inputPath, modelPath },
    snapshot: input.snapshot, coverage: input.coverage, config,
    formula: 'Outside CN: original 100*w/r. CN: 100*w*f(r,alpha)*H200/sum(f(1..200,alpha)); f=r^-alpha for r<=10, otherwise 10^(1-alpha)/r.',
    chinaFit: { sources: [anchors.sources.C3.url], target, fitted, trainingResiduals,
      predictionsChinaUsdMillion: gameEstimates, singleAnchorBaseline,
      honorGlobalCeilingUsdMillion: honorCeiling,
      honorCeilingExcessPercent: (gameEstimates.honor / honorCeiling - 1) * 100,
      impliedTop200MonthlyBudgetUsdMillion: fitted.scaleUsdMillion * fittedMass,
      curveMassNormalization: normalize, coverage: cn.coverage, samplingSensitivity },
    japanDiagnostic,
    applied: ['China curve SHAPE only from two August anchors; country budget and all other countries unchanged.',
      'Rank-11..200 reciprocal tail joined at rank 10; finite top-200 curve sum preserved against baseline.'],
    notApplied: ['Absolute fitted China amplitude is diagnostic only: no matching August total-market constraint.',
      'China June-report top8 amounts: period unresolved.',
      'Korea: One Store included and fee/refund basis unresolved.',
      'Japan/Korea Udonis tables: fee basis and/or YTD cutoff unresolved.',
      'Endfield geographic shares: different game and period, chart/text conflict.',
      'US/GB/DE lifetime shares: not current-period rank coefficients.',
      'Seasonality and event multipliers: no calibrated coefficients.'],
    limitations: [
      'Two fitted parameters from two amounts leave no independent training degrees of freedom. Small fit residual is not measured accuracy.',
      'Golden Spatula China-only app-family interpretation is provisional; both anchors reuse AppMagic.',
      'Top-ten knot and search range are declared modeling choices, not empirical truths.',
      'Source files miss days and observe uneven intervals; equal-day, equal-intraday weighting is an assumption.',
      'August fit transferred to September 8 snapshot; not contemporaneous validation.',
      'Existing dictionary gaps and frozen input cohort remain; absent games cannot enter.',
      'Mass preservation applies to a complete rank-1..200 chart, not necessarily an incomplete input cohort.',
      'Index points remain index points, not dollar amounts; fitted monthly game amounts are separate conditional diagnostics.'
    ],
    top20Overlap: results.slice(0, 20).filter(g => g.oldRank <= 20).length,
    sensitivityScenarios: scenarios, results
  };
  assert.equal(results.length, input.results.length);
  assert.equal(new Set(results.map(g => g.key)).size, results.length);
  assert(results.every(g => Number.isFinite(g.score) && g.score >= 0));
  assert(Math.abs(fittedMass * normalize - baseMass) < 1e-10);
  const prefix = 'reports/rank-models/revenue-anchor-draft-2026-09-10';
  fs.mkdirSync(path.dirname(prefix), { recursive: true });
  fs.writeFileSync(`${prefix}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const fmt = n => n.toFixed(2);
  const table = results.slice(0, 20).map(g =>
    `| ${g.rank} | ${g.oldRank} | ${g.title.replace(/\|/g, '\\|')} | ${fmt(g.oldScore)} | ${fmt(g.score)} | ${g.rankChange > 0 ? '+' : ''}${g.rankChange} |`);
  const lines = [
    '# 매출 기준값 적용 초안', '',
    '> 실험용 시장 보정 차트 지수. 실제 글로벌 매출 순위가 아니며 운영 사이트 미적용.', '',
    `기준 스냅샷: ${input.snapshot.date} ${input.snapshot.time} KST / ${results.length}개 게임.`,
    '8월 중국 매출로 맞춘 곡선을 9월 스냅샷에 옮긴 시나리오다. 다른 국가 가중치는 유지했다.', '',
    '## 중국: 두 표본으로 실제 곡선 적합', '',
    `- 발로란트 모바일: ${target.valorant}백만 달러, 금삽삽지전: ${target.spatula}백만 달러.`,
    `- 중국 ${cn.coverage.observedDays}일·${cn.coverage.snapshots}개 관측. 빠진 날짜: ${cn.coverage.missingDates.join(', ') || '없음'}.`,
    `- TOP 10 곡선: α=${fitted.alpha.toFixed(3)} (기존 1). 11~200위는 1/순위 형태를 유지하고 10위에서 연결.`,
    `- 두 매출값의 로그 오차가 최소가 되도록 α와 금액 배율을 함께 적합. 검색 범위 ${config.alphaMin}~${config.alphaMax}, 간격 ${config.gridStep}.`,
    `- 검색 경계 도달: ${fitted.atSearchBoundary ? '예 — 곡선 식별 불충분 가능성' : '아니오'}.`,
    `- 관측일 재표집 α 5~95백분위: ${samplingSensitivity.alphaP05.toFixed(3)}~${samplingSensitivity.alphaP95.toFixed(3)}. 실제 매출의 신뢰구간이 아니다.`,
    '- 국가 시장 가중치까지 올리지 않고, 중국 1~200위 곡선 합이 기존과 같도록 정규화했다.',
    '- 두 금액으로 두 계수를 맞췄으므로 표본 적합도가 좋아도 정확도 검증은 아니다.', '',
    '| 게임 | 기준 매출, 백만 달러 | 적합 결과 | 기준 대비 차이 |',
    '|---|---:|---:|---:|',
    ...Object.entries(trainingResiduals).map(([g, r]) => `| ${g} | ${fmt(r.targetUsdMillion)} | ${fmt(r.fittedUsdMillion)} | ${fmt(r.percentDifference)}% |`), '',
    `왕자영요의 조건부 중국 월매출 진단은 ${fmt(gameEstimates.honor)}백만 달러. 비교 대상은 중국 실측치가 아니라 글로벌 합계 ${honorCeiling}백만 달러이며, 그 합계 대비 ${fmt(report.chinaFit.honorCeilingExcessPercent)}%다.`,
    `적합 배율이 암시하는 중국 TOP 200 월간 배분 총액은 ${fmt(report.chinaFit.impliedTop200MonthlyBudgetUsdMillion)}백만 달러. 같은 8월 중국 시장 총액이 없어 이 배율은 글로벌 지수에 적용하지 않았다.`, '',
    '## 보정 전후 TOP 20', '',
    '| 보정 순위 | 기존 순위 | 게임 | 기존 지수 | 보정 지수 | 순위 상승 |',
    '|---:|---:|---|---:|---:|---:|', ...table, '',
    `기존 TOP 20과 겹치는 게임: ${report.top20Overlap}개. 게임 사전 미연결 문제는 그대로 남아 있다.`, '',
    '## 일본 FGO 비교 진단 — 일본 계수는 유지', '',
    `8월 일본 기준 매출 ${jpTarget}백만 달러. iOS ${jp.ios.coverage.observedDays}일, Google Play ${jp.aos.coverage.observedDays}일 관측.`,
    `기존 스토어 비중과 정규화한 1/순위를 가정하면 FGO 금액을 설명하는 일본 TOP 200 배분 총액은 ${fmt(japanDiagnostic.impliedTop200MonthlyBudgetUsdMillion)}백만 달러다.`,
    `기존 연간 시장 대리값을 31/365로 나눈 중립적 8월 비교값은 ${fmt(japanDiagnostic.neutralAugustMarketProxyUsdMillion)}백만 달러다.`,
    '두 값의 차이는 확정 오차가 아니다. 단일 게임의 이벤트, 스토어별 비중, TOP 200 밖 매출과 날짜별 변동을 분리할 수 없으므로 일본 전체를 FGO에 맞춰 조정하지 않았다.', '',
    '## 적용하지 않은 자료', '',
    '한국 원스토어 포함 월매출, 수수료 기준 미확정 연간 표, 기간 불명확 중국 TOP 8, 누적 국가 비중은 참고로만 유지했다. 시간·명절 배수를 추가하지 않았다.', '',
    '## 재현과 한계', '',
    '`node scripts/calculate-revenue-anchor-draft.js`', '',
    '금액 원자료: [주요 시장 기준표](../../docs/research/major-market-revenue-anchors-2026-09-10.md).',
    '관측 누락·게임 연결·출처의 지역판 범위 가정이 남아 있다. 새로운 게임·기간으로 검증하기 전에는 운영 산식으로 채택하지 않는다.',
    '전체 결과·국가별 적용 범위·민감도는 같은 이름의 JSON에 기록했다.', ''
  ];
  fs.writeFileSync(`${prefix}.md`, lines.join('\n'));
  console.log(JSON.stringify({ report: prefix, alpha: fitted.alpha, trainingResiduals,
    honorMonthlyDiagnostic: gameEstimates.honor, japanDiagnostic,
    chinaCoverage: cn.coverage, samplingSensitivity, top20: results.slice(0, 20),
    verification: 'baseline reproduction, full cohort uniqueness, finite scores and China curve-mass conservation passed' }, null, 2));
}

if (require.main === module) main();
module.exports = { curve, mass, meanWeight, fit, loadDays, config };
