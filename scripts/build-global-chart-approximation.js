'use strict';

const fs = require('fs');
const path = require('path');
const { COUNTRY_CODES, NO_ANDROID } = require('../src/crawlers/storefronts');
const ROOT = path.resolve(__dirname, '..');
const CONFIG = 'data/rank-models/global-chart-2025-v0.2-assumptions.json';
const INDICATORS = {
  population: 'SP.POP.TOTL',
  gdpPerCapitaUsd: 'NY.GDP.PCAP.CD',
  internetPercent: 'IT.NET.USER.ZS'
};

// 반올림 잔액을 가장 큰 소수부부터 배분하여 지역 예산과 국가 합계가 일치하게 한다.
function allocateBudget(budget, rows, unit = 1000) {
  if (!Number.isFinite(budget) || budget < 0 || !Number.isSafeInteger(unit) || unit <= 0) {
    throw new Error('Invalid allocation budget or unit');
  }
  const units = Math.round(budget / unit);
  if (Math.abs(units * unit - budget) > 0.01) throw new Error('Budget is not divisible by allocation unit');
  if (!rows.length || rows.some((r) => !Number.isFinite(r.weight) || r.weight <= 0)) {
    throw new Error('Positive allocation weights are required');
  }
  if (new Set(rows.map((r) => r.country)).size !== rows.length) throw new Error('Duplicate allocation country');
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  const portions = rows.map((row) => {
    const raw = units * row.weight / total;
    return { country: row.country, units: Math.floor(raw), remainder: raw - Math.floor(raw) };
  }).sort((a, b) => b.remainder - a.remainder || a.country.localeCompare(b.country));
  const leftover = units - portions.reduce((sum, row) => sum + row.units, 0);
  for (let i = 0; i < leftover; i++) portions[i].units++;
  return Object.fromEntries(portions.map((row) => [row.country, row.units * unit]));
}

function latestObservation(macro, country, indicatorId) {
  const indicator = macro.indicators.find((item) => item.id === indicatorId);
  const observation = indicator?.rows
    .filter((row) => row.country === country && row.value != null && row.year >= 2020 && row.year <= 2024)
    .sort((a, b) => b.year - a.year)[0];
  return observation ? {
    value: observation.value, year: observation.year, basis: 'world_bank',
    indicatorId, sourceUrl: indicator.url, sourceUpdated: indicator.sourceUpdated
  } : null;
}

function proxyInputs(country, config, macro) {
  const inputs = {};
  for (const [name, indicatorId] of Object.entries(INDICATORS)) {
    const observed = latestObservation(macro, country, indicatorId);
    const assumed = config.missingIndicatorAssumptions[country]?.[name];
    if (!observed && assumed == null) throw new Error(`No observation or explicit assumption: ${country}/${name}`);
    inputs[name] = observed || { value: assumed, year: null, basis: 'explicit_assumption', indicatorId };
  }
  const { population, gdpPerCapitaUsd, internetPercent } = inputs;
  if (!(population.value > 0) || !(gdpPerCapitaUsd.value > 0) ||
      !(internetPercent.value > 0 && internetPercent.value <= 100)) {
    throw new Error(`Invalid proxy inputs: ${country}`);
  }
  const p = config.proxy;
  const income = Math.max(p.incomeFloorUsd, Math.min(p.incomeCapUsd, gdpPerCapitaUsd.value));
  const weight = population.value * internetPercent.value / 100 * (income / p.referenceIncomeUsd) ** p.incomeExponent;
  return { inputs, weight };
}

function assumedStoreShare(country, region, inputs, config) {
  const rule = config.newCountryStoreShares;
  let ios = rule.overrides[country];
  if (ios == null) {
    const income = inputs.gdpPerCapitaUsd.value;
    ios = income >= rule.highIncomeThresholdUsd ? rule.highIncomeIosShare
      : income < rule.lowerIncomeThresholdUsd ? rule.lowerIncomeIosShare
        : config.residualRegions[region].iosDefault;
  }
  return { ios, android: 1 - ios, basis: 'scenario_assumption', confidence: 'very_low' };
}

function buildModel(base, config, macro, countryCodes = COUNTRY_CODES) {
  const baseCountries = new Map(base.countries.map((row) => [row.country, row]));
  if (baseCountries.size !== base.countries.length) throw new Error('Duplicate base country');
  if (base.countries.some((row) => !countryCodes.includes(row.country))) throw new Error('Base country outside scope');
  const totalBudget = config.budget.hypotheticalTotalUsd;
  const reserve = Math.round(totalBudget * config.budget.uncollectedMarketReserveShare);
  const observedBudget = totalBudget - reserve;
  const baseBudget = base.countries.reduce((sum, row) => sum + Math.round(row.marketProxyUsdB * 1e9), 0);
  const residualBudget = observedBudget - baseBudget;
  if (!(residualBudget > 0)) throw new Error('Scenario budget cannot accommodate base markets and reserve');
  const regionEntries = Object.entries(config.residualRegions);
  if (Math.abs(regionEntries.reduce((sum, [, row]) => sum + row.share, 0) - 1) > 1e-9) {
    throw new Error('Residual regional shares must sum to one');
  }
  const pending = countryCodes.filter((country) => !baseCountries.has(country)).map((country) => {
    const metadata = macro.countryMetadata.rows.find((row) => row.country === country);
    const region = config.regionOverrides[country] || config.worldBankRegionMap[metadata?.region.id];
    if (!config.residualRegions[region]) throw new Error(`Unknown model region: ${country}`);
    return { country, region, ...proxyInputs(country, config, macro) };
  });
  const regionBudgets = allocateBudget(residualBudget,
    regionEntries.map(([country, row]) => ({ country, weight: row.share })), config.budget.allocationUnitUsd);
  const allocated = {};
  for (const [region] of regionEntries) {
    Object.assign(allocated, allocateBudget(regionBudgets[region],
      pending.filter((row) => row.region === region), config.budget.allocationUnitUsd));
  }
  const names = new Intl.DisplayNames(['ko'], { type: 'region' });
  const countries = countryCodes.map((country) => {
    const previous = baseCountries.get(country);
    let row;
    if (previous) {
      const shares = base.storeShareMethods[previous.storeShareMethod];
      row = {
        country, name: names.of(country),
        marketProxyUsd: Math.round(previous.marketProxyUsdB * 1e9),
        method: 'inherited_v0.1', confidence: previous.confidence,
        inheritedReference: previous,
        storeShares: { ios: shares.ios, android: shares.android, basis: previous.storeShareMethod, confidence: shares.confidence }
      };
    } else {
      const proxy = pending.find((item) => item.country === country);
      row = {
        country, name: names.of(country), marketProxyUsd: allocated[country],
        method: 'regional_macro_allocation', confidence: 'very_low',
        region: proxy.region, macroInputs: proxy.inputs, allocationProxy: proxy.weight,
        storeShares: assumedStoreShare(country, proxy.region, proxy.inputs, config)
      };
    }
    const { ios, android } = row.storeShares;
    if (Math.abs(ios + android - 1) > 1e-9 || ios < 0 || android < 0) throw new Error(`Invalid shares: ${country}`);
    if (NO_ANDROID.has(country) && android !== 0) throw new Error(`Unsupported Google Play scope: ${country}`);
    row.marketWeight = row.marketProxyUsd / observedBudget;
    row.storeWeights = { ios: row.marketWeight * ios, android: row.marketWeight * android };
    return row;
  }).sort((a, b) => b.marketProxyUsd - a.marketProxyUsd || a.country.localeCompare(b.country));
  if (countries.some((row) => row.marketProxyUsd <= 0)) throw new Error('Allocation produced a zero-size market');
  if (countries.reduce((sum, row) => sum + row.marketProxyUsd, 0) !== observedBudget) throw new Error('Budget mismatch');
  return {
    schemaVersion: 1, modelId: config.modelId, baseYear: config.baseYear,
    status: 'experimental', productionEnabled: false,
    label: '2025 기준 128개 국가·지역 보정 차트 지수 — 전체 근사표',
    target: base.target, rankCurve: base.rankCurve,
    formula: {
      ...base.formula,
      countryWeight: 'marketProxyUsd / observedScopeBudgetUsd',
      unmodeledCountry: 'outside the 128-country collection scope; covered by a separate scenario reserve'
    },
    sources: { baseModel: config.baseModel, assumptions: CONFIG, macroData: config.macroData, macroDownloadedAt: macro.downloadedAt },
    budgets: {
      hypotheticalWorldBudgetUsd: totalBudget,
      uncollectedReserveUsd: reserve,
      observedScopeBudgetUsd: observedBudget,
      inheritedMarketsUsd: baseBudget,
      newlyAllocatedMarketsUsd: residualBudget,
      residualRegionBudgetsUsd: regionBudgets,
      basis: config.budget.basis
    },
    countries,
    limitations: [
      '시장 규모는 실제 매출 통계가 아니라 기존 참고값과 대리 지표로 만든 비교용 모형 값',
      '세계 예산·미수집 유보율·지역별 잔여 예산·소득 탄력성·신규 스토어 비중은 검증되지 않은 설계 가정',
      '인터넷 이용자는 게임 이용자와 같지 않으며 GDP는 게임 소비액이 아님',
      '기존 25개 시장의 혼합 기간·수수료·환율·자료 개정 한계가 그대로 남음',
      '자료가 없는 지표는 명시적 가정으로 채웠으며 해당 행의 macroInputs에 표시',
      '중국과 러시아의 iOS 100%는 관측 범위만 의미하며 국가 전체 iOS 점유율이 아님',
      '분모가 달라졌으므로 v0.1과 점수를 직접 비교할 수 없음',
      '점수 산식과 공개 사이트에는 미연결; 데이터 재사용 권한은 별도 확인 필요'
    ]
  };
}

function renderTable(model, config) {
  const money = (value) => (value / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (value) => (value * 100).toFixed(2);
  const lines = [
    '# 2025 기준 128개 국가·지역 근사표 v0.2',
    '',
    '**실제 매출 통계가 아닌 비교용 근사 모델이다. 기존 사이트 점수에는 적용하지 않았다.**',
    '',
    '[전체 JSON](../../data/rank-models/global-chart-2025-v0.2.json) · ' +
      '[가정 설정](../../data/rank-models/global-chart-2025-v0.2-assumptions.json) · ' +
      '[기존 25개 시장 설명](global-chart-2025-v0.1.md)',
    '',
    '## 배분 방식',
    '',
    '- 기존 25개 시장의 금액과 스토어 비중을 유지했다.',
    '- 나머지 103개국은 세계은행 WDI의 인구·1인당 GDP·인터넷 이용률을 이용해 지역 안에서 예산을 배분했다.',
    '- 각 지표는 2020~2024년 중 가장 최근의 비어 있지 않은 관측값을 사용했다. 지표별 연도가 다를 수 있다.',
    '- 대리 지표: `인구 × 인터넷 이용률 × (보정된 1인당 GDP / 10,000)^0.7`. GDP는 1,000~60,000달러로 제한한다.',
    '- 이 계산은 게임 이용자나 게임 매출을 실측하는 방식이 아니다.',
    '',
    `가정상 전체 예산은 **${money(model.budgets.hypotheticalWorldBudgetUsd)}백만 달러**다.`,
    `이 중 미수집 시장 유보액 **${money(model.budgets.uncollectedReserveUsd)}백만 달러**를 제외하고,`,
    `128개 관측 시장에 **${money(model.budgets.observedScopeBudgetUsd)}백만 달러**를 배분했다.`,
    `기존 시장 합계는 ${money(model.budgets.inheritedMarketsUsd)}백만 달러, 신규 103개국 배분액은 ${money(model.budgets.newlyAllocatedMarketsUsd)}백만 달러다.`,
    '**이 예산과 유보율은 설계 가정이지 검증된 세계 시장 규모와 시장 점유율이 아니다.**',
    '',
    '| 잔여 시장 묶음 | 잔여 예산 배분 비중 — 가정 | 배분액, 백만 달러 |',
    '|---|---:|---:|'
  ];
  for (const [key, region] of Object.entries(config.residualRegions)) {
    lines.push(`| ${region.label} | ${pct(region.share)}% | ${money(model.budgets.residualRegionBudgetsUsd[key])} |`);
  }
  lines.push('', '## 전체 국가표', '',
    '금액 단위는 **백만 달러**다. 국가 비중은 세계 전체가 아닌 **128개 관측 시장 안에서의 모형 비중**이다.',
    '「기존 참고」도 검증된 실제 매출이 아니라 v0.1의 근사값이다. 「대리 배분」은 정확도가 더 낮다.',
    '신규 스토어 비중은 지역·소득 구간에 따른 가정으로, 실제 OS 점유율이나 게임 결제 비중이 아니다.',
    '',
    '| 국가·지역 | 코드 | 근사 규모 | 모형 비중 | iOS | Google Play | 방법 |',
    '|---|---|---:|---:|---:|---:|---|');
  for (const row of model.countries) {
    const assumedInputs = row.macroInputs && Object.values(row.macroInputs).some((item) => item.basis === 'explicit_assumption');
    const method = row.method === 'inherited_v0.1' ? '기존 참고' : assumedInputs ? '대리 배분·지표 보충' : '대리 배분';
    lines.push(`| ${row.name} | ${row.country} | ${money(row.marketProxyUsd)} | ${pct(row.marketWeight)}% | ${pct(row.storeShares.ios)}% | ${pct(row.storeShares.android)}% | ${method} |`);
  }
  lines.push('', '## 해석과 한계', '',
    '- 순위 가중치는 기존과 동일한 `1/순위`다. 정규화된 국가·스토어 가중치와 곱해 합산하고 100을 곱한다.',
    '- 모든 대상 매출 차트에서 1위일 때 100점이다. 게임별 달러 매출 추정치가 아니다.',
    '- 중국·러시아는 iOS만 관측하는 범위다. 국가 전체 시장의 iOS 비중이 100%라는 뜻은 아니다.',
    '- 수집 실패를 0점이나 차트 이탈로 대체하지 않는다.',
    '- 기존 25개 시장 모델과 분모가 달라져 점수의 직접 비교는 불가능하다.',
    '- 표시는 반올림했으므로 표시된 비중의 합은 정확히 100%가 아닐 수 있다. JSON의 반올림 전 가중치가 계산 기준이다.',
    '- 가정 예산·소득 지수·지역별 배분 비중을 바꾸면 신규 국가의 근사값도 달라진다.',
    '- 가정이 많으므로 이 표를 공식 시장 통계로 인용하거나 실제 매출액으로 표시하지 않는다.',
    '',
    '세계은행 원천 URL·지표 연도·누락 지표의 가정 여부는 JSON의 `macroInputs`에 기록돼 있다.',
    '[WDI API 설명](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599-indicator-api-queries)',
    '');
  return lines.join('\n');
}

function main() {
  const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const config = read(CONFIG);
  const model = buildModel(read(config.baseModel), config, read(config.macroData));
  const jsonPath = 'data/rank-models/global-chart-2025-v0.2.json';
  const mdPath = 'docs/research/global-chart-2025-v0.2.md';
  fs.writeFileSync(path.join(ROOT, jsonPath), JSON.stringify(model, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, mdPath), renderTable(model, config));
  console.log(JSON.stringify({
    jsonPath, mdPath, countries: model.countries.length, budgets: model.budgets,
    largestNewMarkets: model.countries.filter((row) => row.method !== 'inherited_v0.1').slice(0, 12)
      .map((row) => ({ country: row.country, name: row.name, usd: row.marketProxyUsd, ios: row.storeShares.ios }))
  }));
}

if (require.main === module) main();
module.exports = { allocateBudget, proxyInputs, buildModel, renderTable };
