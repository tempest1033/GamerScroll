'use strict';
// Titles and H1s carry the searched wording ("top-grossing mobile games", "Steam charts", "player count"), no date on
// pages whose URL always shows the latest data, and stay within a SERP-length budget in every edition.
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { width } = require('../src/templates/helpers/fit-description');
const { loadRankStats } = require('../src/rank/stats');

const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
const titleOf = (html) => dec(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
const h1Of = (html) => dec(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
const inEdition = (code, fn) => { const before = i18n.currentEdition().code; i18n.setEdition(code); try { return fn(); } finally { i18n.setEdition(before); } };
const hub = () => require('../src/templates/pages/rank-hub');
const otherCountry = (home) => (home === 'kr' ? 'us' : 'kr');

function pages(edition) {
  const S = loadRankStats();
  const { renderSteamHub } = require('../src/templates/pages/steam-hub');
  const { renderGenre } = require('../src/templates/pages/genres');
  const { renderHome } = require('../src/templates/pages/home');
  return {
    home: renderHome(),
    rankings: hub().renderRankingsHub(edition.country),
    country: hub().renderRankingsHub(otherCountry(edition.country)),
    monthly: hub().renderMonthly(S.latestMonth, edition.country),
    steam: renderSteamHub(),
    genres: renderGenre('all', edition.country),
    genre: renderGenre('rpg', edition.country),
  };
}

test('English titles and H1s use the searched wording', () => inEdition('en', () => {
  const S = loadRankStats();
  const p = pages(i18n.EDITIONS.find((e) => e.code === 'en'));
  assert.equal(titleOf(p.home), 'Mobile Game Revenue Rankings & Steam Player Counts, Daily | GamerScroll');
  assert.equal(h1Of(p.home), 'Top-Grossing Mobile Games & Most-Played Steam Games Today');
  assert.match(titleOf(p.rankings), /^Top-Grossing Mobile Games Today — (iOS & Google Play|iOS) TOP 200 \| GamerScroll$/);
  assert.equal(h1Of(p.rankings), 'Top-Grossing Mobile Games Today');
  assert.match(titleOf(p.country), /^Top-Grossing Mobile Games in Korea Today: (iOS & Google Play|iOS) \| GamerScroll$/);
  assert.equal(h1Of(p.country), 'Top-Grossing Mobile Games in Korea Today');
  assert.equal(titleOf(p.monthly), `Top-Grossing Mobile Games of ${i18n.formatYearMonth(S.latestMonth)}: Monthly Ranking | GamerScroll`);
  assert.equal(titleOf(p.steam), 'Steam Charts: Most-Played Games & Daily Concurrent Players | GamerScroll');
  assert.equal(h1Of(p.steam), 'Most-Played Steam Games Today');
  assert.equal(titleOf(p.genres), 'Top-Grossing Mobile Games by Genre Today | GamerScroll');
  assert.equal(titleOf(p.genre), 'Top-Grossing RPG Mobile Games Today | GamerScroll');
  assert.equal(h1Of(p.genre), 'Top-Grossing RPG Mobile Games Today');
}));

test('the English subculture genre reads "Anime Gacha Games" without doubling "games" in its title', () => inEdition('en', () => {
  const { loadGenres } = require('../src/rank/genres');
  assert.equal(loadGenres().categories.find((c) => c.id === 'subculture').label, 'Anime Gacha Games');
  const { renderGenre, genreIdsWithData } = require('../src/templates/pages/genres');
  if (!genreIdsWithData('us').includes('subculture')) return;
  assert.equal(titleOf(renderGenre('subculture', 'us')), 'Top-Grossing Anime Gacha Mobile Games Today | GamerScroll');
}));

test('game page titles name revenue rank history or the Steam player count', () => inEdition('en', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const ctx = { days: ['2026-11-25'], hourlyDate: '' };
  const steam = { name: 'G', slug: 'g', platforms: ['steam'], developer: 'D', steam: { rank: 3 }, steamHistory: [], rank: null };
  assert.equal(titleOf(generateGamePage(steam, ctx)), 'G Steam Player Count — Current & Peak Players | GamerScroll');
  assert.equal(i18n.t('game.seo_title_mobile', { name: 'G' }), 'G Revenue & Grossing Rank History');
}));

test('every edition: live pages carry no date in the title, the home market is not named, titles fit a SERP', () => {
  const S = loadRankStats();
  for (const edition of i18n.EDITIONS) {
    inEdition(edition.code, () => {
      const p = pages(edition);
      const today = i18n.formatDay(S.today.date);
      for (const [kind, html] of Object.entries(p)) {
        const title = titleOf(html);
        assert.ok(!title.includes(today), `${edition.code} ${kind}: ${title}`);
        assert.ok(width(title) <= 80, `${edition.code} ${kind} (${width(title)}): ${title}`);
      }
      assert.ok(!titleOf(p.rankings).includes(S.COUNTRIES[edition.country]), `${edition.code}: ${titleOf(p.rankings)}`);
      assert.ok(titleOf(p.country).includes(i18n.t(`rank.where_${otherCountry(edition.country)}`)), `${edition.code}: ${titleOf(p.country)}`);
      assert.ok(titleOf(p.monthly).includes(i18n.formatYearMonth(S.latestMonth)), `${edition.code}: ${titleOf(p.monthly)}`);
    });
  }
});
