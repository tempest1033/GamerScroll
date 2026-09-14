'use strict';

// Five bounded exploratory rounds; all candidate families are defined before fitting.
const fs = require('node:fs');
const assert = require('node:assert/strict');

function run({ data, previous, all, fit, metrics, alphas, secondCycle = false, thirdCycle = false, fourthCycle = false }) {
  const y = data.targetsMillion;
  const priorRound = fourthCycle
    ? require('../../reports/rank-models/august-five-rounds-v3-2026-09-10.json').rounds.find(r => r.round === 13)
    : thirdCycle
    ? require('../../reports/rank-models/august-five-rounds-v2-2026-09-10.json').rounds.find(r => r.round === 7)
    : secondCycle
    ? require('../../reports/rank-models/august-five-rounds-2026-09-10.json').rounds.find(r => r.round === 3)
    : null;
  const control = priorRound ? priorRound.selected : { id: 'five-control', groups: ['cn'], lambda: 0 };
  const groups = ['cn', 'jp'];
  const winningShape = { chinaExponentRatio: 0.8, androidExponentRatio: 0.45 };
  const localCandidates = fourthCycle ? [
    control,
    ...[0.015, 0.03, 0.06].flatMap(lambda => [0.15, 0.25, 0.35].map(delta => ({
      id: `r16-${lambda}-${delta}`, groups, lambda, huber: delta, regional: true, shape: winningShape
    }))).filter(c => c.id !== 'r16-0.03-0.25')
  ] : [];
  const rounds = fourthCycle ? [
    { id: 16, name: '근접 억제 계수·오차 처리 탐색', candidates: localCandidates },
    { id: 17, name: '중국·스토어 곡선 근방 탐색', candidates: [
      control,
      ...[0.75, 0.8, 0.85].flatMap(cn => [0.4, 0.45, 0.5].map(aos => ({
        id: `r17-${cn}-${aos}`, groups, lambda: 0.03, huber: 0.25, regional: true,
        shape: { chinaExponentRatio: cn, androidExponentRatio: aos }
      }))).filter(c => c.id !== 'r17-0.8-0.45')
    ] },
    { id: 18, name: '비슷한 성능이면 강한 계수 억제', rule: 'one-se', candidates: [
      ...localCandidates.filter(c => c.huber === 0.25),
      { id: 'r18-0.15', groups, lambda: 0.15, huber: 0.25, regional: true, shape: winningShape }
    ] },
    { id: 19, name: '일본 지역 매출 반영 강도', candidates: [
      control,
      ...[0, 0.25, 0.75].map(weight => ({
        id: `r19-${weight}`, groups, lambda: 0.03, huber: 0.25,
        regional: weight > 0, regionWeight: weight, shape: winningShape
      }))
    ] }
  ] : thirdCycle ? [
    { id: 11, name: 'Google Play 곡선 미세 조정', candidates: [
      control,
      ...[0.35, 0.4, 0.5, 0.55].map(ratio => ({
        id: `r11-${ratio}`, groups, lambda: 0.15,
        shape: { chinaExponentRatio: 0.8, androidExponentRatio: ratio }
      }))
    ] },
    { id: 12, name: '중국 곡선·스토어 가중치 분리', candidates: [
      control,
      ...[0.7, 0.8, 0.9].flatMap(cn => [0.15, 0.5].map(lambda => ({
        id: `r12-${cn}-${lambda}`, groups: ['cn', 'jp', 'ios'], lambda,
        shape: { chinaExponentRatio: cn, androidExponentRatio: 0.45 }
      })))
    ] },
    { id: 13, name: '일본 지역 매출·계수 억제 결합', candidates: [
      control,
      ...[0.03, 0.15, 0.5].flatMap(lambda => [0, 0.25].map(delta => ({
        id: `r13-${lambda}-${delta}`, groups, lambda, regional: true,
        ...(delta ? { huber: delta } : {}), shape: winningShape
      })))
    ] },
    { id: 14, name: '큰 금액 오차에 추가 벌점', candidates: [
      control,
      ...[0.5, 2, 5].flatMap(fourthPenalty => [0.03, 0.15].map(lambda => ({
        id: `r14-${fourthPenalty}-${lambda}`, groups, lambda, fourthPenalty, shape: winningShape
      })))
    ] }
  ] : secondCycle ? [
    { id: 6, name: 'Google Play 곡선 하한 확장', candidates: [
      control,
      ...[0.2, 0.3, 0.4, 0.5, 0.7].map(ratio => ({
        id: `r6-aos-${ratio}`, groups, lambda: 0.15, shape: { androidExponentRatio: ratio }
      }))
    ] },
    { id: 7, name: '중국·Google Play 곡선 동시 조정', candidates: [
      control,
      ...[0.8, 1, 1.2].flatMap(cn => [0.3, 0.45, 0.6].map(aos => ({
        id: `r7-${cn}-${aos}`, groups, lambda: 0.15,
        shape: { chinaExponentRatio: cn, androidExponentRatio: aos }
      }))).filter(c => c.id !== 'r7-1-0.6')
    ] },
    { id: 8, name: '일본 Google Play 곡선 분리', candidates: [
      control,
      ...[0.3, 0.45, 0.75, 0.9].map(ratio => ({
        id: `r8-jp-aos-${ratio}`, groups, lambda: 0.15,
        shape: { androidExponentRatio: 0.6, japanAndroidRatio: ratio }
      }))
    ] },
    { id: 9, name: '스토어 곡선 유지·과보정 억제', candidates: [
      control,
      ...[0, 0.03, 0.15, 0.5].flatMap(lambda => [0, 0.25].map(delta => ({
        id: `r9-${lambda}-${delta}`, groups, lambda, ...(delta ? { huber: delta } : {}),
        shape: { androidExponentRatio: 0.6 }
      }))).filter(c => c.id !== 'r9-0.15-0')
    ] }
  ] : [
    { id: 1, name: '오차 영향·계수 억제', candidates: [
      control,
      ...[0.03, 0.15, 0.5].flatMap(lambda => [0, 0.15, 0.4].map(delta => ({
        id: `r1-${lambda}-${delta}`, groups, lambda, ...(delta ? { huber: delta } : {})
      })))
    ] },
    { id: 2, name: '중국 별도 순위 곡선', candidates: [
      control,
      ...[0.6, 0.8, 1, 1.2, 1.4].map(ratio => ({
        id: `r2-cn-${ratio}`, groups, lambda: 0.15, shape: { chinaExponentRatio: ratio }
      }))
    ] },
    { id: 3, name: '스토어별 순위 곡선', candidates: [
      control,
      ...[0.6, 0.8, 1, 1.2, 1.4].map(ratio => ({
        id: `r3-aos-${ratio}`, groups, lambda: 0.15, shape: { androidExponentRatio: ratio }
      }))
    ] },
    { id: 4, name: '상위권·나머지 구간 분리', candidates: [
      control,
      ...[3, 5, 10, 20].flatMap(knot => [0.75, 1, 1.25].map(tail => ({
        id: `r4-${knot}-${tail}`, groups, lambda: 0.15, shape: { knot, tail }
      })))
    ] }
  ];
  const configsById = new Map();
  for (const round of rounds) for (const config of round.candidates) {
    if (configsById.has(config.id)) assert.deepEqual(configsById.get(config.id), config);
    configsById.set(config.id, config);
  }
  // Selection uses only the supplied training game's labels; outer game's labels
  // are used exclusively after prediction, for reporting.
  const selectCache = new Map();
  function choose(indices, round) {
    const key = `${round.id}:${indices.join(',')}`;
    if (selectCache.has(key)) return selectCache.get(key);
    assert(indices.length >= 11);
    const scores = round.candidates.map(config => {
      const errors = indices.map(i => {
        const train = indices.filter(j => j !== i);
        assert(!train.includes(i));
        const p = fit(train, config).predictions[i];
        return Math.log(p / y[i]) ** 2;
      });
      const error = errors.reduce((sum, v) => sum + v, 0) / indices.length;
      const heuristicSE = Math.sqrt(errors.reduce((s, v) => s + (v - error) ** 2, 0)
        / (indices.length - 1) / indices.length);
      return { config, innerRmsLogError: Math.sqrt(error), meanLogSquaredError: error, heuristicSE };
    }).sort((a, b) => a.innerRmsLogError - b.innerRmsLogError || a.config.id.localeCompare(b.config.id));
    if (round.rule === 'one-se') {
      // LOO errors are correlated: this is a simplicity heuristic, not a CI.
      const cutoff = scores[0].meanLogSquaredError + scores[0].heuristicSE;
      const eligible = scores.filter(s => s.meanLogSquaredError <= cutoff)
        .sort((a, b) => b.config.lambda - a.config.lambda || a.innerRmsLogError - b.innerRmsLogError);
      const winner = eligible[0];
      scores.splice(scores.indexOf(winner), 1);
      scores.unshift({ ...winner, heuristicCutoff: cutoff });
    }
    selectCache.set(key, scores);
    return scores;
  }
  const controlPredictions = thirdCycle || fourthCycle ? all.map(i =>
    priorRound.outer[i].selected === control.id ? priorRound.outer[i].prediction
      : fit(all.filter(j => j !== i), control).predictions[i])
    : priorRound ? priorRound.outer.map(r => r.prediction)
    : all.map(i => fit(all.filter(j => j !== i), control).predictions[i]);
  const controlMetrics = priorRound && !thirdCycle && !fourthCycle ? priorRound.nestedMetrics : metrics(controlPredictions);
  const reportRounds = [];
  for (const round of rounds) {
    const choices = choose(all, round);
    const fitted = priorRound && choices[0].config.id === control.id ? priorRound.fitted : fit(all, choices[0].config);
    const outer = all.map(i => {
      const train = all.filter(j => j !== i);
      const chosen = choose(train, round)[0];
      if (priorRound && chosen.config.id === control.id) return {
        game: data.names[i], prediction: controlPredictions[i],
        selected: control.id, alpha: priorRound.outer[i].alpha
      };
      const fittedWithoutGame = fit(train, chosen.config);
      return { game: data.names[i], prediction: fittedWithoutGame.predictions[i],
        selected: chosen.config.id, alpha: fittedWithoutGame.alpha };
    });
    reportRounds.push({
      round: round.id, name: round.name, candidateCount: round.candidates.length,
      selected: choices[0].config, fitted,
      selection: choices.map(c => ({ id: c.config.id, innerRmsLogError: c.innerRmsLogError })),
      outer, trainingMetrics: metrics(fitted.predictions),
      nestedMetrics: metrics(outer.map(r => r.prediction))
    });
    console.log(JSON.stringify({ round: round.id, name: round.name,
      selected: choices[0].config.id, nestedMetrics: reportRounds.at(-1).nestedMetrics }));
  }

  // Round 5 is a fixed geometric ensemble of the four independently selected
  // families, shrunk halfway to the simple control. No ensemble weight search.
  function combine(predictions, base) {
    assert.equal(predictions.length, 4);
    return Math.exp(0.5 * Math.log(base) + 0.5 * predictions.reduce((s, p) => s + Math.log(p), 0) / 4);
  }
  const ensemblePredictions = all.map(i => combine(
    reportRounds.map(r => r.outer[i].prediction), controlPredictions[i]));
  const fittedControl = priorRound ? priorRound.fitted : fit(all, control);
  const ensembleFitted = all.map(i => combine(
    reportRounds.map(r => r.fitted.predictions[i]), fittedControl.predictions[i]));
  reportRounds.push({
    round: fourthCycle ? 20 : thirdCycle ? 15 : secondCycle ? 10 : 5, name: '4개 방식 결합·대조군으로 절반 완화', candidateCount: 1,
    selected: { id: 'fixed-geometric-ensemble', controlWeight: 0.5, eachRoundWeight: 0.125 },
    fitted: { predictions: ensembleFitted },
    outer: all.map(i => ({ game: data.names[i], prediction: ensemblePredictions[i] })),
    trainingMetrics: metrics(ensembleFitted), nestedMetrics: metrics(ensemblePredictions)
  });
  console.log(JSON.stringify({ round: reportRounds.at(-1).round, nestedMetrics: reportRounds.at(-1).nestedMetrics }));

  // A research candidate must improve magnitude AND ordering to be preferred.
  // This guard is not a claim of statistical significance or untouched validation.
  for (const round of reportRounds) {
    const m = round.nestedMetrics;
    round.improvesControl = m.mapePercent < controlMetrics.mapePercent
      && m.rmsLogError < controlMetrics.rmsLogError
      && m.rankInversions <= controlMetrics.rankInversions;
    round.rows = all.map(i => ({
      game: data.names[i], referenceMillion: y[i],
      fittedMillion: round.fitted.predictions[i],
      fittedRankWithin13: 1 + round.fitted.predictions.filter(p => p > round.fitted.predictions[i]).length,
      heldoutMillion: round.outer[i].prediction,
      heldoutErrorPercent: (round.outer[i].prediction / y[i] - 1) * 100,
      controlHeldoutMillion: controlPredictions[i]
    })).sort((a, b) => b.referenceMillion - a.referenceMillion);
    const individualErrors = round.rows.map(g => ({
      before: Math.abs(g.controlHeldoutMillion / g.referenceMillion - 1),
      after: Math.abs(g.heldoutMillion / g.referenceMillion - 1)
    }));
    round.gameTradeoffs = {
      improved: individualErrors.filter(e => e.after < e.before - 1e-10).length,
      worsened: individualErrors.filter(e => e.after > e.before + 1e-10).length,
      unchanged: individualErrors.filter(e => Math.abs(e.after - e.before) <= 1e-10).length,
      worstErrorPercent: 100 * Math.max(...individualErrors.map(e => e.after))
    };
    if (thirdCycle || fourthCycle) {
      round.gameTradeoffs.controlWorstErrorPercent = 100 * Math.max(...individualErrors.map(e => e.before));
      round.improvesControl = round.improvesControl && round.gameTradeoffs.improved >= 7
        && round.gameTradeoffs.worstErrorPercent <= round.gameTradeoffs.controlWorstErrorPercent;
    }
    round.stability = {
      selectedCounts: round.outer.reduce((counts, row) => {
        const id = row.selected || 'fixed-ensemble';
        counts[id] = (counts[id] || 0) + 1;
        return counts;
      }, {}),
      fittedAlphaRange: round.outer.every(r => Number.isFinite(r.alpha))
        ? [Math.min(...round.outer.map(r => r.alpha)), Math.max(...round.outer.map(r => r.alpha))] : null,
      meanImprovementPercentagePoints: controlMetrics.mapePercent - round.nestedMetrics.mapePercent
    };
    if (fourthCycle) {
      round.improvesControl = round.improvesControl && round.stability.meanImprovementPercentagePoints >= 0.5;
    }
  }
  const acceptable = reportRounds.filter(r => r.improvesControl)
    .sort((a, b) => a.nestedMetrics.rmsLogError - b.nestedMetrics.rmsLogError);
  const recommendation = acceptable.length
    ? { status: 'research_candidate_only', round: acceptable[0].round,
      reason: 'Improves all declared control criteria on reused same-month sample; not external validation.' }
    : { status: 'retain_previous_research_model', round: null,
      reason: 'No round meets every declared control criterion.' };
  const report = {
    status: 'five_round_exploratory_comparison', secondCycle, thirdCycle, fourthCycle, productionEnabled: false, period: '2026-08',
    source: data.source, coverage: data.coverage, identities: data.identities,
    candidates: [...configsById.values()], alphaSearch: alphas,
    control: { config: control, metrics: controlMetrics, predictions: controlPredictions },
    previousReportedLeaveOneOut: previous.metrics.fittedLeaveOneGameOut,
    priorSearchMetrics: priorRound?.nestedMetrics || null,
    researchUpdate: fourthCycle ? {
      source: 'https://lmc2179.github.io/posts/cvci.html',
      finding: 'Prefer stronger regularization among models with similar cross-validation error; one-SE selection is heuristic.',
      caveat: 'LOO fold errors are dependent. Heuristic SE is not a confidence interval or significance test.',
      unavailableSource: 'https://www.mdpi.com/2571-905x/4/4/51 returned HTTP 403; not used as body evidence.',
      newRevenueData: 'No compatible August Roblox country/store revenue split found. No new money observations added.',
      convergencePolicy: 'Require at least 0.5 percentage-point mean improvement plus prior criteria to replace the research control; otherwise freeze rather than chase numerical noise.'
    } : null,
    adoptionCriteria: fourthCycle
      ? 'At least 0.5 pp lower mean percentage error; lower log error; no more inversions; at least 7 improved games; no worse maximum error. Research only.'
      : thirdCycle
      ? 'Lower mean absolute percentage and RMS log error; no more rank inversions; improve at least 7/13 games; no worse maximum error. Research only.'
      : 'Lower mean absolute percentage and RMS log error; no more rank inversions. Research only.',
    rounds: reportRounds, recommendation,
    limitations: [
      'Only five countries and 30 observed August KST days; no complete global monthly reconstruction.',
      'All 13 games remain in every evaluation. No per-game multipliers, missing-rank fabrication or error-based game removal.',
      'Each outer test game is excluded from coefficient fitting and candidate selection; fixed ensemble never uses its amount.',
      'Candidate families were defined before this five-round execution but after earlier exploration of the same August data.',
      'Best-of-five reporting itself reuses evaluation data. Any winner needs new-game/new-month validation.',
      'A single observation per game-month, provisional vendor regional-family joins and abnormal Roblox iOS coverage remain.',
      'Prior-month chart histories are absent; no temporal generalization claim.',
      'A common alpha and market/store coefficients are confounded by missing markets; no inferred actual market totals.',
      'Rounds compare alternative families, not cumulative unvalidated coefficient stacking.',
      'Deterministic bounded optimization is not proof of a global optimum. Boundary solutions are recorded in fit output.'
      ,...(thirdCycle ? [
        'Control is the previously selected fixed configuration, not the prior per-fold candidate-search procedure. Predictions are reused only where prior fold configuration matches.',
        'Japan FGO regional amount is excluded with its global amount whenever FGO is held out; both observations share one game weight.',
        'The fourth-power residual penalty is an experimental global objective, not a game-specific multiplier.',
        'Third-cycle acceptance additionally requires majority-game improvement and non-worsening maximum error.'
      ] : [])
    ]
  };
  assert.equal(reportRounds.length, 5);
  assert(reportRounds.every(r => r.rows.length === 13 && r.rows.every(g =>
    Number.isFinite(g.fittedMillion) && Number.isFinite(g.heldoutMillion))));
  const prefix = fourthCycle ? 'reports/rank-models/august-five-rounds-v4-2026-09-10'
    : thirdCycle ? 'reports/rank-models/august-five-rounds-v3-2026-09-10'
    : secondCycle ? 'reports/rank-models/august-five-rounds-v2-2026-09-10'
    : 'reports/rank-models/august-five-rounds-2026-09-10';
  fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
  const f = x => x.toFixed(2);
  const lines = [
    fourthCycle ? '# 8월 보정식 추가 5라운드 — 16~20라운드: 안정성·수렴 점검'
      : thirdCycle ? '# 8월 보정식 추가 5라운드 — 11~15라운드'
      : secondCycle ? '# 8월 보정식 추가 5라운드 — 6~10라운드' : '# 8월 보정식 5라운드 비교', '',
    '> 연구용. 같은 8월 표본을 반복 사용한 탐색이다. 운영 미적용. 순위는 비교한 13개 게임 안에서만 유효하다.', '',
    '## 결과 요약', '',
    '| 방식 | 제외 검증 평균 금액 오차 | 로그 오차 | 순서 역전 | 대조군 동시 개선 |',
    '|---|---:|---:|---:|---|',
    `| ${thirdCycle || fourthCycle ? '직전 최선 구성 고정 대조군' : secondCycle ? '직전 최선안: 스토어별 곡선' : '동일 엔진 단순 대조군'} | ${f(controlMetrics.mapePercent)}% | ${f(controlMetrics.rmsLogError)} | ${controlMetrics.rankInversions}/78 | — |`,
    ...reportRounds.map(r => `| ${r.round}. ${r.name} | ${f(r.nestedMetrics.mapePercent)}% | ${f(r.nestedMetrics.rmsLogError)} | ${r.nestedMetrics.rankInversions}/78 | ${r.improvesControl ? '예' : '아니오'} |`),
    '', acceptable.length
      ? `연구 후보: ${acceptable[0].round}라운드. 사전 기준을 통과했지만, 같은 표본에서 5개 결과를 비교한 선택이므로 새로운 달에서 확인하기 전에는 채택하지 않는다.`
      : '판정: 사전 기준을 모두 통과한 안이 없어 이전 연구안을 유지한다.',
    '', thirdCycle || fourthCycle
      ? `직전 보고의 ${f(priorRound.nestedMetrics.mapePercent)}%는 폴드마다 후보를 고른 절차의 결과다. 이번 대조군은 최선 구성을 고정한 ${f(controlMetrics.mapePercent)}%이며 계수는 검사 게임을 제외하고 맞췄다. 과거 폴드의 구성이 같은 예측만 재사용했다. 평균·로그 오차와 순서 외에 최소 7개 게임 개선 및 최대 오차 비악화도 요구한다.`
      : secondCycle
      ? '직전 3라운드의 관측된 제외 예측·평가값을 그대로 대조군으로 사용했다. 새 데이터를 추가하지 않았으며, 이번에도 같은 표본에 대한 탐색이다.'
      : `이전 보고서의 평균 제외 오차는 ${f(previous.metrics.fittedLeaveOneGameOut.mapePercent)}%다. 이번 대조군은 동일 계산 엔진·탐색 범위에서 다시 맞춘 비교 기준으로, 이전 세밀한 격자 탐색과 소폭 차이가 있다.`,
    '', '## 검증 방식', '',
    '- 앞선 네 라운드는 검사할 게임을 하나 빼고, 나머지 12개 안에서 후보를 고른 뒤 계수를 맞춘다. 13개 모두 검사한다.',
    '- 마지막 라운드는 각 방식의 제외 예측을 기하평균한 뒤 대조군과 반반 결합한다. 결합 가중치는 미리 고정했고 금액을 보며 조정하지 않았다.',
    '- 5라운드 결과 중 좋은 것을 고르는 것 자체는 다시 탐색이다. 새 달 검증을 대신하지 못한다.',
    '- 후보는 누적해서 덧붙이지 않고 각 방식의 효과를 나눠 비교한다. 게임별 강제 배수는 없다.',
    '', '## 게임별 결과', ''
  ];
  for (const r of reportRounds) {
    lines.push(`### ${r.round}. ${r.name}`, '', `선택: ${r.selected.id}.`, '',
      `대조군 대비 게임별 금액 오차: 개선 ${r.gameTradeoffs.improved}개 / 악화 ${r.gameTradeoffs.worsened}개 / 동일 ${r.gameTradeoffs.unchanged}개. 최대 오차 ${f(r.gameTradeoffs.worstErrorPercent)}%.`, '',
      `제외 게임별 후보 선택: ${JSON.stringify(r.stability.selectedCounts)}. α 범위: ${r.stability.fittedAlphaRange ? r.stability.fittedAlphaRange.map(f).join('~') : '고정 결합식'}.`, '',
      '단위: 백만 달러. 전체 적합은 해당 게임 금액을 사용했고, 제외 검증은 사용하지 않았다.', '',
      '| 게임 | 공개 기준 | 전체 적합 | 표본 순위 | 제외 검증 | 검증 오차 |',
      '|---|---:|---:|---:|---:|---:|',
      ...r.rows.map(g => `| ${g.game} | ${f(g.referenceMillion)} | ${f(g.fittedMillion)} | ${g.fittedRankWithin13} | ${f(g.heldoutMillion)} | ${f(g.heldoutErrorPercent)}% |`), '');
  }
  lines.push('## 남은 한계', '',
    '- 5개국·30일 자료뿐이며 8월 1일과 나머지 국가 이력이 없다. 공개 글로벌 매출과 지역 순위 범위가 일치하지 않는다.',
    '- Roblox의 비정상적으로 적은 iOS 관측과 지역판 상품군 미확정 문제는 해결되지 않았다.',
    '- 전체 앱 자료나 과거 순위를 확보한 척하지 않았다. 지역·스토어 계수는 실제 시장 규모로 해석할 수 없다.',
    '- 이전 달 이력이 없어 다른 달 예측 정확도는 검증하지 못했다.',
    ...(fourthCycle ? [
      '- 추가로 조사했지만 호환되는 8월 Roblox 국가·스토어별 매출 금액은 확보하지 못했다.',
      '- 18라운드는 오차가 비슷한 후보 중 강한 억제를 선택하는 1-SE 휴리스틱이다. 폴드가 서로 독립이 아니므로 신뢰구간이나 통계적 유의성으로 해석하지 않는다.',
      '- 이번 교체 기준은 평균 오차 0.5%p 이상 개선·로그 오차 개선·역전 비악화·7개 이상 게임 개선·최대 오차 비악화다. 미세한 수치 차이만으로 계속 교체하지 않는다.',
      '- 여기서 안정화는 동일 표본에서의 실험 계수 고정을 뜻한다. 실제 매출로 수렴했다는 의미가 아니다.',
      '- 방법론 출처: https://lmc2179.github.io/posts/cvci.html'
    ] : []),
    '', `[매출 출처](${data.source.url})`, '',
    '재현: `node scripts/refine-august-monthly-calibration.js ' + (fourthCycle ? '--five-rounds-v4' : thirdCycle ? '--five-rounds-v3' : secondCycle ? '--five-rounds-v2' : '--five-rounds') + '`', '');
  fs.writeFileSync(`${prefix}.md`, lines.join('\n'));
  console.log(JSON.stringify({ recommendation, controlMetrics,
    rounds: reportRounds.map(r => ({ round: r.round, selected: r.selected,
      metrics: r.nestedMetrics, improvesControl: r.improvesControl, gameTradeoffs: r.gameTradeoffs, stability: r.stability,
      honor: r.rows.find(g => g.game === 'Honor of Kings') })) }, null, 2));
}

module.exports = { run };
