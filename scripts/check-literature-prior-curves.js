'use strict';

// Research only. Apply published rank-curve exponents as FIXED priors (no search)
// to the August 2026 feature histograms, fitting only an intercept and optional
// cn/jp market multipliers. Purpose: separate "curve shape chosen by data" from
// "curve shape taken from literature" so the flat Google Play exponent can be
// interpreted. Never touches production weights.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const data = require('../reports/rank-models/august-monthly-features-2026-09-10.json');
const keys = [...new Set(data.histograms.flatMap(h => Object.keys(h)))].sort();
const y = data.targetsMillion;
const n = y.length;
const all = y.map((_, i) => i);
assert.equal(n, 13);

const priors = {
  gargTelang2013: { iosGrossing: 0.860, source: 'https://aisel.aisnet.org/misq/vol37/iss4/14',
    note: 'Legacy 0.86 coefficient claim; primary coefficient table could not be retrieved in the current audit. Paid-app rank-demand methodology is verified, but this numeric prior remains unverified.' },
  gianola2025: { apple: 0.7803, android: 1.0847, source: 'https://awards.concurrences.com/docrestreint.api/pdf/gianola_jeclp_1_.pdf',
    note: 'Published 2025 (received 2024). Italy 2021 free-app downloads, not revenue. Page 7 footnote 22: ln(Quantity)=b1-b2*ln(Rank), b2=0.7803/1.0847.' }
};
const research = require('../reports/rank-models/august-five-rounds-v3-2026-09-10.json').rounds.find(r => r.round === 13).selected;
const currentShape = { ios: 1.25, aos: 1.25 * research.shape.androidExponentRatio, cn: 1.25 * research.shape.chinaExponentRatio };

const cases = [
  { id: 'lit-fixed', label: '문헌 고정: iOS 0.86 / GP 1.08 / CN iOS 0.86, 계수 없음', exps: { ios: 0.86, aos: 1.08, cn: 0.86 }, groups: [] },
  { id: 'lit-cnjp', label: '문헌 고정 + cn·jp 계수', exps: { ios: 0.86, aos: 1.08, cn: 0.86 }, groups: ['cn', 'jp'] },
  { id: 'lit-ios-flat-gp', label: '문헌 iOS 0.86, GP 평평 0.56, CN 0.86 + cn·jp', exps: { ios: 0.86, aos: 0.56, cn: 0.86 }, groups: ['cn', 'jp'] },
  { id: 'reciprocal-cn', label: '1/rank 공통, cn 계수만 (기존 대조군)', exps: { ios: 1, aos: 1, cn: 1 }, groups: ['cn'] },
  { id: 'common-1.25-cnjp', label: '공통 α=1.25 + cn·jp', exps: { ios: 1.25, aos: 1.25, cn: 1.25 }, groups: ['cn', 'jp'] },
  { id: 'research-shape-plain', label: '연구안 형태(1.25 / 0.5625 / 1.0) + cn·jp, Huber·지역가중·λ 없음', exps: currentShape, groups: ['cn', 'jp'] }
];

function features(exps) {
  return data.histograms.map(h => keys.map(k => {
    const e = k.endsWith('_cn') ? exps.cn : k.startsWith('aos_') ? exps.aos : exps.ios;
    return (h[k] || []).reduce((s, w, r) => r ? s + w * r ** -e : s, 0);
  }));
}
function fit(X, train, groups) {
  let b = groups.map(() => 0);
  const logX = bs => X.map(row => Math.log(row.reduce((s, v, k) => {
    let m = 0; groups.forEach((g, j) => { if (keys[k].endsWith(`_${g}`)) m += bs[j]; });
    return s + v * Math.exp(m);
  }, 0)));
  const loss = bs => {
    const lx = logX(bs);
    const c = train.reduce((s, i) => s + Math.log(y[i]) - lx[i], 0) / train.length;
    return { v: train.reduce((s, i) => s + (Math.log(y[i]) - lx[i] - c) ** 2, 0) / train.length, c, lx };
  };
  let cur = loss(b);
  for (const step of [0.4, 0.2, 0.1, 0.05, 0.02]) for (let it = 0; it < 50; it++) {
    let changed = false;
    for (let j = 0; j < b.length; j++) for (const s of [-1, 1]) {
      const t = [...b]; t[j] += s * step;
      if (Math.abs(t[j]) > Math.log(4)) continue;
      const r = loss(t);
      if (r.v < cur.v - 1e-12) { b = t; cur = r; changed = true; }
    }
    if (!changed) break;
  }
  return { predictions: cur.lx.map(x => Math.exp(x + cur.c)),
    multipliers: Object.fromEntries(groups.map((g, j) => [g, Math.exp(b[j])])) };
}
function metrics(p) {
  return require('./lib/revenue-model-metrics').revenueMetrics(y, p);
}

const results = cases.map(c => {
  const X = features(c.exps);
  const full = fit(X, all, c.groups);
  const loo = all.map(i => fit(X, all.filter(j => j !== i), c.groups).predictions[i]);
  assert(loo.every(v => Number.isFinite(v) && v > 0));
  return { ...c, fittedParameterCount: 1 + c.groups.length, multipliers: full.multipliers,
    training: metrics(full.predictions), leaveOneOut: metrics(loo),
    rows: all.map(i => ({ game: data.names[i], referenceMillion: y[i], fittedMillion: full.predictions[i],
      leaveOneOutMillion: loo[i], leaveOneOutErrorPercent: 100 * (loo[i] / y[i] - 1) })) };
});

const report = {
  status: 'research_fixed_prior_diagnostic_not_model_selection', productionEnabled: false, period: '2026-08',
  purpose: 'Fixed-configuration LOO diagnostics. Comparing and choosing model families remains same-sample search; historical coefficient verification limits apply.',
  priors, currentResearchShape: currentShape, source: data.source, cases: results,
  findings: [
    'Literature exponents alone (zero searched shape parameters) reach the same held-out error as the earlier simple 1/rank control.',
    'Steepening Google Play to the literature 1.08 worsens eFootball and Royal Match sharply; the flat GP exponent is the single largest source of the research model gain.',
    'Published Android curves are steeper than iOS for downloads; our fitted GP exponent is flatter than iOS. The flat GP curve is therefore better read as a proxy for unobserved markets and chart smoothing than as a measured revenue curve.',
    'The research shape with only intercept + cn/jp multipliers performs as well as or better than the version with Huber, regional weighting and lambda; those additions are not identified on 13 games.'
  ],
  limitations: [
    'Literature values come from different years, countries, and charts (2011 US grossing; 2021 Italy downloads). They are priors, not measured 2026 game-revenue curves.',
    'Thirteen same-month games; plain LOO on fixed exponents is honest for those cases, but the research shape itself was chosen on this sample earlier.',
    'Google Play chart window behaviour is not documented by Google; smoothing hypothesis is unverified.'
  ]
};
const prefix = 'reports/rank-models/literature-prior-curves-2026-09-10';
fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
const f = v => v.toFixed(2);
const lines = [
  '# 문헌 순위 곡선 선행값 고정 진단 — 2026년 8월 표본', '',
  '> 연구용. 곡선 지수를 탐색하지 않고 문헌값으로 고정한 뒤 절편과 cn·jp 계수만 맞췄다. 운영 미적용.', '',
  '## 선행값', '',
  `- Garg & Telang (MISQ 2013): 기존 ${priors.gargTelang2013.iosGrossing} 계수 주장은 원문 표를 확보하지 못해 미확인 상태다. 유료 앱 순위·다운로드 추론 방법론만 확인했다.`,
  `- Gianola (JECLP 2025, 투고 2024): 이탈리아 2021년 일일 다운로드 대 무료 순위. Apple ${priors.gianola2025.apple}, Android ${priors.gianola2025.android}. 원문 7쪽 각주 22 확인. 매출 곡선이 아니다.`,
  `- 현재 연구안 실효 지수: iOS ${f(currentShape.ios)}, Google Play ${f(currentShape.aos)}, 중국 iOS ${f(currentShape.cn)}.`, '',
  '## 결과', '',
  '| 구성 | 맞춘 계수 수 | 학습 평균 오차 | 제외 검증 평균 오차 | 로그 오차 | 순서 역전 | 계수 |',
  '|---|---:|---:|---:|---:|---:|---|',
  ...results.map(r => `| ${r.label} | ${r.fittedParameterCount} | ${f(r.training.mapePercent)}% | ${f(r.leaveOneOut.mapePercent)}% | ${f(r.leaveOneOut.rmsLogError)} | ${r.leaveOneOut.rankInversions}/78 | ${Object.entries(r.multipliers).map(([k, v]) => `${k}=${f(v)}`).join(', ') || '—'} |`),
  '', '## 게임별 제외 검증 오차 (%)', '',
  `| 게임 | ${results.map(r => r.id).join(' | ')} |`, `|---|${results.map(() => '---:').join('|')}|`,
  ...all.map(i => `| ${data.names[i]} | ${results.map(r => f(r.rows[i].leaveOneOutErrorPercent)).join(' | ')} |`),
  '', '## 해석', '', ...report.findings.map(s => `- ${s}`),
  '', '## 한계', '', ...report.limitations.map(s => `- ${s}`),
  '', `[매출 출처](${data.source.url})`, '', '재현: `node scripts/check-literature-prior-curves.js`', ''
];
fs.writeFileSync(`${prefix}.md`, lines.join('\n'));
console.log(JSON.stringify(results.map(r => ({ id: r.id, loo: r.leaveOneOut, mult: r.multipliers })), null, 1));
