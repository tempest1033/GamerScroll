'use strict';

const fs = require('fs');
const path = require('path');
const archive = require('./lib/global-rankings');
const ROOT = path.resolve(__dirname, '..');

function chartDefinitions(model) {
  return model.countries.flatMap((country) => ['ios', 'android']
    .filter((store) => country.storeWeights[store] > 0)
    .map((store) => ({
      key: `${store === 'android' ? 'aos' : 'ios'}_${country.country.toLowerCase()}_grossing`,
      country: country.country.toLowerCase(), store,
      weight: country.storeWeights[store]
    })));
}

function missingCharts(day, time, definitions) {
  return definitions.filter(({ key }) => {
    const list = day.lists[key];
    const at = list?.times.indexOf(time) ?? -1;
    const status = day.runs?.[time]?.charts[key]?.status;
    return at < 0 || !list.ranks[at]?.length || (status != null && status !== 'ok');
  }).map((chart) => chart.key);
}

function selectCompleteRun(daysNewestFirst, definitions) {
  const skipped = [];
  for (const day of daysNewestFirst) {
    const times = [...new Set([
      ...Object.keys(day.runs || {}),
      ...definitions.flatMap(({ key }) => day.lists[key]?.times || [])
    ])].sort().reverse();
    for (const time of times) {
      const missing = missingCharts(day, time, definitions);
      if (!missing.length) return { day, time, skipped };
      skipped.push({ date: day.date, time, missingCount: missing.length, missingCharts: missing });
    }
  }
  throw new Error('No complete grossing snapshot for this model');
}

function evaluateSnapshot(day, time, model, apps, stats) {
  const definitions = chartDefinitions(model);
  const missing = missingCharts(day, time, definitions);
  if (missing.length) throw new Error(`Incomplete snapshot: ${missing.join(', ')}`);
  const acc = new Map();
  const oldRows = {};
  for (const country of Object.keys(stats.COUNTRIES)) oldRows[country] = { ios: [], android: [] };
  let sourceRows = 0;
  let shortCharts = 0;
  let aliasesCollapsed = 0;
  for (const chart of definitions) {
    const list = day.lists[chart.key];
    const indices = list.ranks[list.times.indexOf(time)].slice(0, 200);
    if (indices.length < 200) shortCharts++;
    const seen = new Set();
    const rawRows = indices.map((index) => {
      const appId = day.ids[index];
      if (appId == null) throw new Error(`Invalid app index in ${chart.key}: ${index}`);
      const metadata = apps[`${chart.store === 'android' ? 'aos' : 'ios'}:${appId}`] || {};
      return { appId: String(appId), title: metadata.t || String(appId), developer: metadata.d || '', icon: metadata.i || '' };
    });
    if (oldRows[chart.country]) oldRows[chart.country][chart.store] = rawRows;
    rawRows.forEach((row, i) => {
      sourceRows++;
      const key = stats.keyOf(chart.store, row);
      if (seen.has(key)) { aliasesCollapsed++; return; }
      seen.add(key);
      let game = acc.get(key);
      if (!game) {
        game = {
          key, title: stats.nameOf(chart.store, row),
          identityMapped: !!stats.gameOf(chart.store, row),
          score: 0, marketLinearScore: 0, expandedLinearPoints: 0,
          countries: new Set(), charts: []
        };
        acc.set(key, game);
      }
      const rank = i + 1;
      const contribution = 100 * chart.weight * rank ** (-model.rankCurve.alpha);
      game.score += contribution;
      game.marketLinearScore += 100 * chart.weight * (201 - rank) / 200;
      game.expandedLinearPoints += 201 - rank;
      game.countries.add(chart.country);
      game.charts.push({ country: chart.country, store: chart.store, rank, contribution });
    });
  }
  // 동일 스냅샷을 기존 집계기에 넣어 날짜 차이가 아닌 산식 차이만 비교한다.
  const legacy = stats.aggregateGlobal({ rows: oldRows });
  const legacyByKey = new Map(legacy.list.map((row) => [row.key, row]));
  const rows = [...acc.values()];
  const rankings = (field) => new Map([...rows].sort((a, b) => b[field] - a[field] || a.key.localeCompare(b.key))
    .map((row, i) => [row.key, i + 1]));
  const newRanks = rankings('score');
  const expandedRanks = rankings('expandedLinearPoints');
  const marketLinearRanks = rankings('marketLinearScore');
  const results = rows.map((row) => {
    const previous = legacyByKey.get(row.key);
    const contributions = {};
    for (const chart of row.charts) contributions[chart.country] = (contributions[chart.country] || 0) + chart.contribution;
    const drivers = Object.entries(contributions).sort((a, b) => b[1] - a[1])
      .slice(0, 3).map(([country, contribution]) => ({ country, contribution, shareOfGameScore: contribution / row.score }));
    return {
      ...row, countries: [...row.countries].sort(),
      rank: newRanks.get(row.key),
      legacyRank: previous?.rank ?? null, legacyPoints: previous?.pts ?? null,
      rankChange: previous ? previous.rank - newRanks.get(row.key) : null,
      expandedLinearRank: expandedRanks.get(row.key),
      marketLinearRank: marketLinearRanks.get(row.key),
      drivers
    };
  }).sort((a, b) => a.rank - b.rank);
  const newTop20 = new Set(results.slice(0, 20).map((row) => row.key));
  const oldTop20 = legacy.list.slice(0, 20);
  const totalScore = results.reduce((sum, row) => sum + row.score, 0);
  const mappedScore = results.filter((row) => row.identityMapped).reduce((sum, row) => sum + row.score, 0);
  return {
    modelId: model.modelId,
    baselineYear: model.baseYear,
    snapshot: { date: day.date, time, timezone: 'Asia/Seoul', legacyRunTimestampOnly: !day.runs?.[time] },
    coverage: {
      countryCount: model.countries.length, chartCount: definitions.length,
      sourceRows, shortCharts, aliasesCollapsed, gameKeys: results.length,
      top20Mapped: results.slice(0, 20).filter((row) => row.identityMapped).length,
      mappedShareOfTotalScore: totalScore ? mappedScore / totalScore : 0
    },
    comparison: {
      matchedSnapshot: true, oldCountryCount: Object.keys(stats.COUNTRIES).length,
      top20Overlap: oldTop20.filter((row) => newTop20.has(row.key)).length,
      formerTop20: oldTop20.map((row) => ({
        key: row.key, title: stats.nameOf(row.store, row.row), oldRank: row.rank,
        newRank: newRanks.get(row.key) ?? null
      }))
    },
    limitations: [
      '실제 게임별 매출 추정이나 최신 시점의 확정 순위가 아닌 보정 지수 비교',
      '2025 기준 가중치를 선택된 스냅샷에 적용한 결과',
      '불완전한 최신 회차는 제외하고 가장 최근의 완전한 매출 차트 회차를 사용',
      '짧지만 비어 있지 않은 원본 차트는 포함하며 차트 깊이의 차이가 남음',
      '기존 게임 사전에 연결되지 않은 앱은 스토어별 ID로 분리되어 통합 성과가 낮게 보일 수 있음',
      '현재 게임 사전·앱 메타데이터 및 검증된 미리보기 전용 연결로 과거 스냅샷을 비교',
      '미국 등 대형 시장과 단일 차트 최상위권에 유리해지는 것은 산식 설계의 결과',
      '실제 글로벌 페이지 및 운영 데이터에는 반영하지 않음'
    ],
    results
  };
}

function renderPreview(report) {
  const clean = (value) => String(value).replace(/[|\r\n]/g, ' ');
  const names = new Intl.DisplayNames(['ko'], { type: 'region' });
  const lines = [
    '# 글로벌 차트 지수 v0.2 비교 미리보기', '',
    `스냅샷: **${report.snapshot.date} ${report.snapshot.time} KST**. 가중치 기준연도: **${report.baselineYear}**.`,
    '**최신 실매출 순위가 아니라 동일 시점의 기존 산식과 근사 모델을 비교한 결과다.**', '',
    `- 대상: ${report.coverage.countryCount}개 국가·지역, 매출 차트 ${report.coverage.chartCount}개`,
    `- 게임 키 ${report.coverage.gameKeys}개; TOP 20 중 게임 사전 연결 ${report.coverage.top20Mapped}개`,
    `- 200위 미만 원본 차트 ${report.coverage.shortCharts}개`,
    `- 기존 TOP 20과 새 TOP 20의 공통 게임: ${report.comparison.top20Overlap}개`,
    `- 더 최신이지만 누락 때문에 제외한 회차: ${report.skippedRuns.length}개`, '',
    '## TOP 50', '',
    '기존 순위는 현재 페이지의 날짜가 아니라 **동일 스냅샷·동일 게임 식별 보정으로 기존 5개국·9개 차트 산식을 계산한 순위**다.',
    '「신규」는 기존 9개 차트에 없는 게임이며 신작이라는 뜻은 아니다.', '',
    '| 새 순위 | 게임 | 근사 지수 | 기존 순위 | 순위 변화 | 주요 점수 기여 시장 |',
    '|---:|---|---:|---:|---:|---|'
  ];
  for (const row of report.results.slice(0, 50)) {
    const change = row.rankChange == null ? '신규' : row.rankChange > 0 ? `+${row.rankChange}` : String(row.rankChange);
    const drivers = row.drivers.map((d) => `${names.of(d.country.toUpperCase())} ${(100 * d.shareOfGameScore).toFixed(0)}%`).join(', ');
    lines.push(`| ${row.rank} | ${clean(row.title)}${row.identityMapped ? '' : ' [미연결]'} | ${row.score.toFixed(3)} | ${row.legacyRank ?? '—'} | ${change} | ${drivers} |`);
  }
  lines.push('', '## 기존 TOP 20의 이동', '', '| 게임 | 기존 순위 | 새 순위 |', '|---|---:|---:|');
  for (const row of report.comparison.formerTop20) lines.push(`| ${clean(row.title)} | ${row.oldRank} | ${row.newRank ?? '—'} |`);
  lines.push('', '## 산식 효과 분리', '',
    '전체 JSON에는 아래 중간 결과도 포함한다.',
    '- `expandedLinearRank`: 128개국에 기존 선형 포인트를 적용한 순위 — 범위 확대 효과',
    '- `marketLinearRank`: 여기에 시장 가중치를 적용한 순위 — 시장 규모 보정 효과',
    '- `rank`: 공통 `1/순위` 곡선까지 적용한 순위 — 상위권 강조 효과', '',
    '## 해석상 제한', ...report.limitations.map((text) => `- ${text}`), '',
    '## 페이지 개편 시 표시안', '',
    '- 제목: 「글로벌 시장 보정 차트 지수」',
    '- 부제: 「128개 국가·지역 · 근사 가중치 · 실제 매출액 아님」',
    '- 전체 128개국을 열로 늘리지 않고, 게임별 주요 기여 시장과 국가별 상세 보기를 분리',
    '- 스냅샷 시각과 가중치 기준연도, 모형 버전을 별도로 표시',
    '- 전일 변동도 같은 모델·같은 시장 범위로 재계산한 값만 비교',
    '- 최신 완전 회차가 오래됐으면 최신 순위처럼 표시하지 않고 데이터 지연을 안내', ''
  );
  return lines.join('\n');
}

function* daysNewestFirst() {
  for (const date of archive.listDays().reverse()) yield archive.readDay(date);
}

function installPreviewIdentities(stats, identities) {
  const additions = [];
  for (const game of identities.games) {
    for (const [store, id] of Object.entries(game.appIds)) {
      const key = `${store}:${id}`;
      if (stats.byApp.has(key)) throw new Error(`Preview identity conflicts with existing dictionary: ${key}`);
      additions.push([key, game]);
    }
  }
  if (new Set(additions.map(([key]) => key)).size !== additions.length) throw new Error('Duplicate preview identity');
  for (const [key, game] of additions) stats.byApp.set(key, game);
}

function main() {
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rank-models/global-chart-2025-v0.2.json'), 'utf8'));
  const selected = selectCompleteRun(daysNewestFirst(), chartDefinitions(model));
  const stats = require('../src/rank/stats').loadRankStats();
  const identities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rank-models/preview-game-identities.json'), 'utf8'));
  installPreviewIdentities(stats, identities);
  const report = evaluateSnapshot(selected.day, selected.time, model, archive.loadApps(), stats);
  report.previewIdentityOverrides = identities;
  report.skippedRuns = selected.skipped;
  const out = path.join(ROOT, 'reports', 'rank-models');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'global-chart-v0.2-preview.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'global-chart-v0.2-preview.md'), renderPreview(report));
  console.log(JSON.stringify({
    snapshot: report.snapshot, coverage: report.coverage,
    top20Overlap: report.comparison.top20Overlap, skippedRuns: selected.skipped.length,
    top20: report.results.slice(0, 20).map((row) => ({
      rank: row.rank, title: row.title, score: Number(row.score.toFixed(3)),
      oldRank: row.legacyRank, expandedRank: row.expandedLinearRank,
      marketLinearRank: row.marketLinearRank, mapped: row.identityMapped,
      drivers: row.drivers.map((d) => [d.country, Number((d.shareOfGameScore * 100).toFixed(1))])
    }))
  }));
}

if (require.main === module) main();
module.exports = { chartDefinitions, missingCharts, selectCompleteRun, evaluateSnapshot, installPreviewIdentities };
