const fs = require('node:fs');
const assert = require('node:assert/strict');
const dir = 'snapshots/rankings';
const ids = { honor: '989673964', valorant: '6535673811', peace: '1321803705', delta: '1642894547', spatula: '1478101301' };
const month = '2026-08';
const sources = {
  gross: 'https://www.pocketgamer.biz/august-2026-mobile-game-charts/',
  chinaScope: 'https://mobilegamer.biz/augusts-top-grossing-mobile-games-honor-of-kings-gossip-harbor-pubg-royal-match-roblox-more/',
  annual: 'https://sensortower.com/zh-CN/blog/state-of-ip-games-2026-CN'
};
// Gross values are taken directly from the gross publication, never divided by 0.7.
// Honor's WORLDWIDE value is an upper ceiling, not a China revenue measurement.
const anchors = { valorantChinaGrossUsdMillion: 53.7, honorWorldwideGrossUsdMillion: 218.1 };
const snapshots = new Map();
const fileNames = fs.readdirSync(dir).filter(n => /^2026-(08-\d\d|09-01)_ios_cn_grossing\.csv$/.test(n)).sort();
for (const file of fileNames) {
  const text = fs.readFileSync(`${dir}/${file}`, 'utf8');
  assert.equal(text.split(/\r?\n/)[0].replace(/^\uFEFF/, ''), 'time,rank,id,title');
  for (const line of text.split(/\r?\n/).slice(1).filter(Boolean)) {
    // Only the first three non-quoted fields are needed; titles may contain commas.
    const match = line.match(/^(\d\d:\d\d),(\d+),([^,]+),/);
    assert(match, `Malformed record: ${file}`);
    const [, time, rankText, id] = match;
    const rank = Number(rankText);
    assert(Number.isInteger(rank) && rank >= 1 && rank <= 200);
    const timestamp = Date.parse(`${file.slice(0, 10)}T${time}:00+09:00`);
    const chinaDate = new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
    if (!chinaDate.startsWith(month)) continue;
    if (!snapshots.has(timestamp)) snapshots.set(timestamp, { timestamp, chinaDate, ranks: new Map() });
    const ranks = snapshots.get(timestamp).ranks;
    assert(!ranks.has(id), `Duplicate app at timestamp: ${file} ${time} ${id}`);
    ranks.set(id, rank);
  }
}
const days = new Map();
for (const snapshot of snapshots.values()) {
  if (!days.has(snapshot.chinaDate)) days.set(snapshot.chinaDate, []);
  days.get(snapshot.chinaDate).push(snapshot);
}
assert(days.size > 0);
for (const snapshot of snapshots.values()) {
  for (const id of Object.values(ids)) assert(snapshot.ranks.has(id), `Target absent: ${snapshot.chinaDate} ${id}`);
}
const missingChinaDates = Array.from({ length: 31 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter(d => !days.has(d));
const rankStats = {};
for (const [game, id] of Object.entries(ids)) {
  const ranks = [...snapshots.values()].map(s => s.ranks.get(id));
  rankStats[game] = { min: Math.min(...ranks), max: Math.max(...ranks), rankOneObservations: ranks.filter(r => r === 1).length, observations: ranks.length };
}
function score(alpha) {
  const out = {};
  for (const [game, id] of Object.entries(ids)) {
    // Each observed day receives equal weight; intraday observations are averaged.
    // This is a sampling assumption, not a reconstruction of unobserved revenue.
    out[game] = [...days.values()].reduce((sum, rows) =>
      sum + rows.reduce((v, row) => v + row.ranks.get(id) ** -alpha, 0) / rows.length, 0) / days.size;
  }
  return out;
}
function scenario(alpha) {
  const q = score(alpha);
  const scale = anchors.valorantChinaGrossUsdMillion / q.valorant;
  return {
    alpha,
    scaleUsdMillion: scale,
    meanRankWeights: q,
    predictedChinaUsdMillion: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, scale * v])),
    honorToValorantRatio: q.honor / q.valorant,
    honorAboveWorldwideCeiling: scale * q.honor > anchors.honorWorldwideGrossUsdMillion,
    ceilingExcessPct: (scale * q.honor / anchors.honorWorldwideGrossUsdMillion - 1) * 100
  };
}
const scenarios = [0.5, 0.8, 1, 1.2].map(scenario);
const grid = Array.from({ length: 401 }, (_, i) => scenario(i / 200));
const compatible = grid.filter(s => !s.honorAboveWorldwideCeiling);
const first = Math.min(...snapshots.keys());
const last = Math.max(...snapshots.keys());
const bestRankSummary = {};
for (const [game, id] of Object.entries(ids)) {
  const ranks = [];
  for (let day = 1; day <= 31; day++) {
    const p = `history/${month}-${String(day).padStart(2, '0')}.json`;
    const history = JSON.parse(fs.readFileSync(p, 'utf8'));
    const rank = history.bestRanks?.ios_cn_grossing?.[id];
    if (rank !== undefined) ranks.push(rank);
  }
  bestRankSummary[game] = { days: ranks.length, daysWithBestRankOne: ranks.filter(r => r === 1).length };
}
const output = {
  period: month,
  status: 'conditional_diagnostic_not_a_validated_revenue_model',
  productionEnabled: false,
  sources,
  anchors,
  coverage: {
    fileCount: fileNames.length,
    snapshotCount: snapshots.size,
    observedChinaDays: days.size,
    missingChinaDates,
    firstObservationUtc: new Date(first).toISOString(),
    lastObservationUtc: new Date(last).toISOString(),
    observationsPerChinaDay: Object.fromEntries([...days.entries()].sort().map(([d, rows]) => [d, rows.length])),
    chineseCalendarTimezone: 'UTC+08:00',
    sourceTimestampTimezone: 'UTC+09:00',
    fullContinuousMonthObserved: false
  },
  rankStats,
  dailyBestRanksNotUsedForFitting: bestRankSummary,
  assumptions: [
    'Observed intraday rank weights represent their day; observed days represent the entire month.',
    'Country market intensity is constant across the month; no unsupported seasonal multipliers are fitted.',
    'All games use a common amplitude and a common power-law rank curve.',
    'The gross monthly Valorant value and China-only iOS scope reported by two publications refer to the same game.',
    'The worldwide Honor total contains the China edition, so it is only an upper bound on China spending.',
    'Public estimates are rounded, same-provider and not independently verified developer revenue.'
  ],
  limitations: [
    'No true matching-period, fully observed Chinese-month rank history was reconstructed.',
    'Fitting one anchor sets amplitude but does not identify alpha.',
    'Honor global ceiling is a diagnostic constraint, not an independent China validation sample.',
    'The alpha scan does not estimate a confidence interval or justify a country-specific production coefficient.',
    'Other game predictions have no matched independent validation and are not publication-ready estimates.',
    'A ceiling violation challenges the joint sampling, market-intensity and curve assumptions; it does not prove alpha alone is wrong.',
    'Existing daily history stores best rank and cannot replace full intraday history.'
  ],
  scenarios,
  alphaGrid: { min: 0, max: 2, step: 0.005, largestCompatibleAlpha: compatible.length ? compatible.at(-1).alpha : null },
  conclusion: scenarios.find(s => s.alpha === 1).honorAboveWorldwideCeiling
    ? 'Under the stated sampling assumptions, alpha=1 anchored to Valorant predicts China Honor revenue above its worldwide total.'
    : 'Alpha=1 does not exceed the worldwide ceiling, but this is not independent validation.'
};
const lines = [
  '# 중국 iOS 순위·매출 곡선 조건부 비교',
  '',
  '**2026년 8월 비교 실험이다. 실매출 검증이나 운영용 보정계수 확정이 아니다.**',
  '',
  '## 실제로 연결한 자료',
  '- 발로란트 모바일: 8월 총결제액 5,370만 달러. 총결제액 기사와 중국 iOS 전용 범위 설명을 연결했다.',
  '- 왕자영요: 8월 글로벌 총결제액 2억 1,810만 달러. 중국 금액으로 단정하지 않고 중국 매출의 상한으로만 사용했다.',
  '- 최근 12개월 중국 iOS 20억 달러 초과 자료는 정확한 기간과 원본 순위가 맞지 않아 학습에서 제외했다.',
  '',
  '## 순위 이력 품질',
  `- 중국 날짜 기준 관측 ${days.size}/31일, ${snapshots.size}개 시간대.`,
  `- 관측 없는 날짜: ${missingChinaDates.join(', ') || '없음'}. 날짜가 있어도 하루 전체를 관측한 것은 아니다.`,
  `- 첫 관측 UTC: ${new Date(first).toISOString()}, 마지막: ${new Date(last).toISOString()}.`,
  '- CSV 시각은 KST로 기록되어 중국 시각으로 변환했다.',
  '- 오래된 history의 bestRanks는 하루 최고 순위이고, rankings 배열도 최고 순위 정렬 결과일 수 있다. 이를 실제 시점 순위로 사용하지 않았다.',
  '',
  '## 계산 방법',
  '`Q(game, alpha) = 관측일별 평균(시간대별 rank^(-alpha))의 평균`',
  '',
  '`게임 예측액 = 53.7M USD × Q(game, alpha) / Q(Valorant, alpha)`',
  '',
  '**관측된 시간대가 하루를, 관측일들이 월 전체를 대표한다는 가정**이 들어간다. 날짜별 시장 매출 강도는 동일하다고 두었다. 이 가정들은 검증되지 않았다.',
  '',
  '## 조건부 계산 결과',
  '',
  '| α | 왕자영요 중국 예측액, 백만 달러 | 글로벌 총액 218.1 초과 여부 | 발로란트 대비 비율 |',
  '|---:|---:|---|---:|'
];
for (const s of scenarios) lines.push(`| ${s.alpha} | ${s.predictedChinaUsdMillion.honor.toFixed(2)} | ${s.honorAboveWorldwideCeiling ? '초과' : '초과하지 않음'} | ${s.honorToValorantRatio.toFixed(3)} |`);
lines.push('', `스캔한 α=0~2(간격 0.005)에서 이 조건부 상한을 넘지 않는 최대 α는 ${output.alphaGrid.largestCompatibleAlpha}이다. **추천 계수나 신뢰구간이 아니다.**`,
  '', '## 결론',
  output.conclusion,
  '',
  '발로란트 한 게임으로 금액 배율을 맞춘 뒤 왕자영요 글로벌 상한을 점검했다. 동일 국가·스토어·기간의 여러 독립 매출 표본으로 검증한 것은 아니다.',
  '상한을 넘으면 공통 곡선, 날짜별 시장 강도, 표본의 시간 대표성 중 적어도 일부 가정에 문제가 있을 수 있다. 곡선 계수만 바꾸면 해결된다고 단정하지 않는다.',
  '운영 산식과 기존 글로벌 순위를 변경하지 않았다.',
  '', '## 출처', ...Object.entries(sources).map(([k, v]) => `- ${k}: ${v}`), '');
const out = 'reports/rank-models/china-ios-august-2026-curve-diagnostic';
fs.writeFileSync(`${out}.json`, JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(`${out}.md`, lines.join('\n'));
assert.equal(scenarios.find(s => s.alpha === 1).predictedChinaUsdMillion.valorant, 53.7);
console.log(JSON.stringify({ report: `${out}.md`, coverage: output.coverage, rankStats, scenarios, alphaGrid: output.alphaGrid, conclusion: output.conclusion }, null, 2));
