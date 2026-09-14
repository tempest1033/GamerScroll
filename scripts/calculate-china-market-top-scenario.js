const fs = require('node:fs');
const assert = require('node:assert/strict');
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const anchors = load('docs/research/major-market-revenue-anchors-2026-09-10.json');
const model = load('data/rank-models/global-chart-2026-v0.3.json');
const input = load('reports/rank-models/global-chart-2026-growth-preview.json');
const countries = new Map(model.countries.map(c => [c.country.toLowerCase(), c]));
const budget = model.countries.reduce((s, c) => s + c.marketProxyUsd, 0);
const cn = countries.get('cn');
const us = countries.get('us');
const top = anchors.amount_groups.find(g => g.id === 'china_top8_period_unresolved');
const amounts = top.rows.map(r => r[2]);
const sum = xs => xs.reduce((a, b) => a + b, 0);
const harmonic = sum(Array.from({ length: 200 }, (_, i) => 1 / (i + 1)));
const tailMass = sum(Array.from({ length: 192 }, (_, i) => 1 / (i + 9)));
assert.equal(model.productionEnabled, false);
assert.equal(cn.storeShares.android, 0);

// Conditional transfer of an unresolved-period monthly top-eight distribution.
// No game-specific monthly amount is presented as measured September revenue.
const scenarios = [];
for (const id of ['h1_2026_market_totals', 'july2026_market_totals']) {
  const market = anchors.market_groups.find(g => g.id === id);
  const totals = new Map(market.rows.map(r => [r[0], r[1]]));
  const monthTotal = totals.get('CN') / (id.startsWith('h1') ? 6 : 1);
  const multiplier = (totals.get('CN') / totals.get('US')) / (cn.marketProxyUsd / us.marketProxyUsd);
  const residual = monthTotal - sum(amounts);
  assert(residual > 0);
  const shares = Array.from({ length: 200 }, (_, i) => (
    i < 8 ? amounts[i] : residual / tailMass / (i + 1)
  ) / monthTotal);
  assert(Math.abs(sum(shares) - 1) < 1e-12);
  assert(shares.every((x, i) => x > 0 && (!i || x <= shares[i - 1])));
  for (const applyTop of [false, true]) {
    const results = input.results.map(game => {
      let baseline = 0, score = 0, nonChinaBefore = 0, nonChinaAfter = 0;
      for (const chart of game.charts) {
        const country = countries.get(chart.country);
        const weight = 100 * country.marketProxyUsd / budget * country.storeShares[chart.store];
        const before = weight / chart.rank;
        const after = chart.country === 'cn'
          ? weight * multiplier * (applyTop ? harmonic * shares[chart.rank - 1] : 1 / chart.rank)
          : before;
        baseline += before;
        score += after;
        if (chart.country !== 'cn') { nonChinaBefore += before; nonChinaAfter += after; }
      }
      assert(Math.abs(baseline - game.score) < 1e-8);
      assert.equal(nonChinaBefore, nonChinaAfter);
      assert(Number.isFinite(score) && score >= 0);
      return { title: game.title, key: game.key, oldRank: game.rank, oldScore: game.score, score };
    }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .map((g, i) => ({ rank: i + 1, ...g }));
    assert.equal(results.length, input.results.length);
    scenarios.push({ market: id, applyTop, multiplier, monthTotalUsdMillion: monthTotal,
      top8Share: sum(amounts) / monthTotal, firstRankShare: shares[0],
      chinaRank1Multiplier: multiplier * (applyTop ? harmonic * shares[0] : 1),
      top20: results.slice(0, 20),
      chinaLeaders: results.filter(g => /王者荣耀|三角洲行动|和平精英/.test(g.title)) });
  }
}
const report = {
  status: 'conditional_cross_period_scenario_not_validated', productionEnabled: false,
  snapshot: input.snapshot, cohort: input.results.length,
  sources: { top8: anchors.sources[top.source], markets: [anchors.sources.M4, anchors.sources.M5] },
  assumptions: [
    'Top-eight amounts have an unresolved period before June 25; they are NOT August measurements.',
    'Transfer published monthly revenue-rank amounts to September instantaneous chart-rank positions, not game identities.',
    'H1 monthly market comparator is H1 total divided by six; July is a separate comparator.',
    'China/US market ratio resets China only; all non-China contributions and original index denominator stay fixed.',
    'Allocate all remaining China spending to ranks 9..200 with reciprocal-rank weights; no beyond-200 reserve.',
    'Multiply revenue shares by H200 to retain baseline index units; index scores are not dollar estimates.',
    'Mixed periods and providers, uncertain app mapping and incomplete input cohort prevent accuracy claims.'
  ],
  scenarios
};
const prefix = 'reports/rank-models/china-market-top-scenario-2026-09-10';
fs.writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ snapshot: report.snapshot, cohort: report.cohort, assumptions: report.assumptions, scenarios }, null, 2));
