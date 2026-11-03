'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { loadRankStats } = require('../src/rank/stats');
const hub = require('../src/templates/pages/rank-hub');

const HOME = { en: 'us', ja: 'jp', 'zh-cn': 'cn', ko: 'kr', 'zh-tw': 'tw' };

function withPlans(fn) {
  const S = loadRankStats();
  const plans = {};
  for (const e of i18n.EDITIONS) { i18n.setEdition(e.code); plans[e.code] = hub.marketPages(S, e.country); }
  i18n.setPageAvailability(hub.marketAvailability(plans));
  try { return fn(S, plans); } finally { i18n.setPageAvailability(null); i18n.setEdition('en'); }
}

test('each edition builds its market pages from its home market', () => {
  for (const e of i18n.EDITIONS) assert.equal(e.country, HOME[e.code]);
  withPlans((S) => {
    for (const e of i18n.EDITIONS) {
      i18n.setEdition(e.code);
      const month = S.latestMonth;
      assert.ok(hub.renderMonthly(month, e.country).includes(S.COUNTRIES[e.country]), `${e.code} monthly names ${e.country}`);
      assert.ok(hub.renderPublishers(e.country).includes(S.COUNTRIES[e.country]), `${e.code} publishers names ${e.country}`);
      assert.ok(hub.renderRecords(e.country).includes(S.COUNTRIES[e.country]), `${e.code} records names ${e.country}`);
      assert.ok(hub.renderGenre('all', e.country).includes(S.COUNTRIES[e.country]), `${e.code} genres names ${e.country}`);
    }
  });
});

test('availability only names pages the market has; hreflang and links follow it', () => {
  withPlans((S, plans) => {
    const missing = [];
    for (const id of plans.ja.genres) if (!plans['zh-cn'].genres.has(id)) missing.push(id);
    assert.ok(missing.length, 'fixture: a genre that jp has and cn lacks');
    const path = `/rankings/genres/${missing[0]}/`;
    assert.equal(i18n.editionHasPage('zh-cn', path), false);
    assert.equal(i18n.editionHasPage('ja', path), true);
    i18n.setEdition('ja');
    const html = hub.renderGenre(missing[0], 'jp');
    assert.ok(!html.includes('<link rel="alternate" hreflang="zh-CN"'), 'no hreflang to the edition without the page');
    assert.ok(html.includes('<link rel="alternate" hreflang="ja"'));
    // genre tabs of a market link only genres that market built
    i18n.setEdition('zh-cn');
    const tabs = [...hub.renderGenre('all', 'cn').matchAll(/href="\/zh-cn\/rankings\/genres\/([^/"]+)\/"/g)].map((m) => m[1]);
    for (const id of tabs) assert.ok(plans['zh-cn'].genres.has(id), `cn genre tab ${id}`);
    // publisher hub links only built publisher pages
    const pubs = [...hub.renderPublishers('cn').matchAll(/href="\/zh-cn\/rankings\/publishers\/([^/"]+)\/"/g)].map((m) => decodeURIComponent(m[1]));
    for (const slug of pubs) assert.ok(plans['zh-cn'].publishers.has(slug), `cn publisher link ${slug}`);
  });
});

test('a genre page without market rows is not built', () => {
  withPlans((S, plans) => {
    const missing = [...plans.ja.genres].find((id) => !plans['zh-cn'].genres.has(id));
    i18n.setEdition('zh-cn');
    assert.equal(hub.renderGenre(missing, 'cn'), null);
  });
});

