'use strict';
// A query in a language lands on that language's edition: every structured-data URL of a localized page is that edition's own.
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');

const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const crumbsOf = (html) => ldOf(html).filter((n) => n['@type'] === 'BreadcrumbList').flatMap((n) => n.itemListElement.map((item) => item.item));
const inEdition = (code, fn) => { const before = i18n.currentEdition().code; i18n.setEdition(code); try { return fn(); } finally { i18n.setEdition(before); } };

test('breadcrumbs of a localized page name that edition\'s pages, never the English root URLs', () => {
  const rankHub = require('../src/templates/pages/rank-hub');
  const { renderAboutPage } = require('../src/templates/pages/about');
  for (const edition of i18n.EDITIONS) {
    inEdition(edition.code, () => {
      const home = i18n.absoluteUrl(edition.code, '/');
      for (const [html, own] of [
        [rankHub.renderRankingsHub(edition.country), i18n.absoluteUrl(edition.code, '/rankings/')],
        [rankHub.renderRecords(edition.country), i18n.absoluteUrl(edition.code, '/rankings/records/')],
        [renderAboutPage(), i18n.absoluteUrl(edition.code, '/about/')],
      ]) {
        const crumbs = crumbsOf(html);
        assert.equal(crumbs[0], home, `${edition.code}: the trail starts at the edition home`);
        assert.equal(crumbs.at(-1), own, `${edition.code}: the last item is the page itself`);
        for (const url of crumbs) assert.ok(url.startsWith(home), `${edition.code}: ${url}`);
      }
    });
  }
});

test('a game charting only in Japan: its English page is indexable and is the x-default of the Japanese one', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const days = Array.from({ length: 40 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const game = { name: 'G', slug: 'g', platforms: ['ios'], developer: 'D', steamHistory: [], rank: { s: { jp: { ios: { o: 39, v: [5] } } }, h: {} } };
  const meta = { days, hourlyDate: '' };
  const alternates = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
  const ja = inEdition('ja', () => generateGamePage(game, meta));
  assert.deepEqual(alternates(ja), [['en', 'https://gamerscroll.com/games/g/'], ['ja', 'https://gamerscroll.com/ja/games/g/'], ['x-default', 'https://gamerscroll.com/games/g/']]);
  const en = inEdition('en', () => generateGamePage(game, meta));
  assert.doesNotMatch(en, /name="robots" content="[^"]*noindex/);
  assert.match(inEdition('ko', () => generateGamePage(game, meta)), /name="robots" content="[^"]*noindex/);
});

test('a localized game page keeps its own edition URLs in the breadcrumb', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const game = { name: 'G', slug: 'g', platforms: ['steam'], developer: 'D', steam: { rank: 3 }, steamHistory: [], rank: null };
  inEdition('ja', () => assert.deepEqual(crumbsOf(generateGamePage(game, { days: ['2026-11-25'], hourlyDate: '' })),
    ['https://gamerscroll.com/ja/', 'https://gamerscroll.com/ja/games/', 'https://gamerscroll.com/ja/games/g/']));
});
