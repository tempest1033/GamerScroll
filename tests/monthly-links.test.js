'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { loadRankStats } = require('../src/rank/stats');
const { summaryMeta } = require('../src/build/game-data');
const hub = require('../src/templates/pages/rank-hub');

const linked = (html) => [...html.matchAll(/href="\/rankings\/monthly\/(\d{4}-\d{2})\/"/g)].map((m) => m[1]);

test('pages link only monthly pages that are built', () => {
  i18n.setEdition('ko');
  const S = loadRankStats();
  const unbuilt = S.months.filter((mo) => !S.builtMonths.includes(mo));
  assert.ok(unbuilt.length, 'fixture history has a month too short for a monthly page');
  const meta = summaryMeta(S);
  const rank = { s: { kr: { ios: { o: 0, v: meta.days.map(() => 5) } } }, h: {} };
  const pages = {
    game: require('../src/templates/helpers/game-rank-summary').renderGameRankSummary(rank, meta, 'x', 'kr').html,
    records: hub.renderRecords('kr'),
    monthly: hub.renderMonthly(S.latestMonth, 'kr'),
    rankings: hub.renderRankingsHub('kr'),
  };
  for (const [name, html] of Object.entries(pages)) {
    for (const mo of linked(html)) assert.ok(S.builtMonths.includes(mo), `${name} links unbuilt month ${mo}`);
  }
  assert.ok(linked(pages.game).includes(S.builtMonths[0]), 'built months stay linked');
  i18n.setEdition('en');
});

