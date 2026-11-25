'use strict';
// Titles and H1s carry the searched wording ("top-grossing mobile games", "Steam charts", "player count"), no date on
// pages whose URL always shows the latest data, and stay within a SERP-length budget in every edition.
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { width, MAX_TITLE_WIDTH } = require('../src/templates/helpers/fit-description');
const { loadRankStats } = require('../src/rank/stats');

const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
const titleOf = (html) => dec(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
const h1Of = (html) => dec(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);
const inEdition = (code, fn) => { const before = i18n.currentEdition().code; i18n.setEdition(code); try { return fn(); } finally { i18n.setEdition(before); } };
const hub = () => require('../src/templates/pages/rank-hub');
const otherCountry = (home) => (home === 'kr' ? 'us' : 'kr');
// The brand suffix follows a title only where both fit the budget.
const branded = (title) => (width(`${title} | GamerScroll`) <= MAX_TITLE_WIDTH ? `${title} | GamerScroll` : title);

// Every page type the build renders for an edition, every market and every built variant (src/build/editions.js).
function allPages(edition) {
  const S = loadRankStats();
  const m = require('../src/build/editions').loadTemplates();
  const hub = m.rankHub;
  const { genreIdsWithData } = require('../src/templates/pages/genres');
  const { generateGamePage } = require('../src/templates/pages/game');
  const home = edition.country;
  const out = [
    ['home', m.index.generateIndexPage()],
    ['steam', m.steamHub.renderSteamHub()],
    ['games hub', m.gamesHub.generateGamesHubPage({ games: [], popularGames: [] })],
    ['about', m.about.renderAboutPage()],
    ['privacy', m.privacy.renderPrivacyPage()],
    ['404', m.notFound.generate404Page()],
    ['rankings/global', hub.renderGlobal()],
    ['rankings/about', hub.renderAbout()],
    ['rankings/publishers', hub.renderPublishers(home)],
    ['rankings/records', hub.renderRecords(home)],
    ['trending', hub.renderTrending(home)],
    ['trending/global', hub.renderTrending('global')],
  ];
  for (const c of Object.keys(S.COUNTRIES)) {
    out.push([`rankings/${c}`, hub.renderRankingsHub(c)], [`rankings/free/${c}`, hub.renderRankingsHub(c, 'free')], [`trending/${c}`, hub.renderTrending(c)]);
  }
  for (const id of ['all', ...genreIdsWithData(home)]) out.push([`genres/${id}`, hub.renderGenre(id, home)]);
  for (const p of hub.publisherPages(hub.publisherIndex(S, home))) out.push([`publishers/${p.slug}`, hub.renderPublisher(p, home), p.name]);
  for (const mo of S.builtMonths) out.push([`monthly/${mo}`, hub.renderMonthly(mo, home)]);
  for (const id of m.steamHub.steamGameIds()) out.push([`steam/${id}`, m.steamHub.renderSteamGame(id), require('../src/rank/steam-stats').loadSteamStats().info(id).name]);
  const LONG = 'Borderlands®4 - Story Pack 1: Mad Ellie and the Vault of the Damned 7Rスマスロ痛いのは嫌なので防御力に極振り';
  const UNSPLIT = 'A Game About Feeding A Black Hole And Other Very Long Stories Told Twice';
  for (const platforms of [['ios'], ['steam']]) {
    for (const name of ['G', LONG, UNSPLIT]) out.push([`game ${platforms} ${name.length}`, generateGamePage({ name, slug: 'g', platforms, developer: 'D', steam: { rank: 3 }, steamHistory: [], rank: null }, { days: ['2026-11-25'], hourlyDate: '' }), name]);
  }
  return out.filter(([, html]) => html);
}

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
  assert.equal(titleOf(p.home), 'Top-Grossing Mobile Games & Steam Charts, Updated Daily | GamerScroll');
  assert.equal(h1Of(p.home), 'Top-Grossing Mobile Games & Most-Played Steam Games Today');
  assert.equal(titleOf(p.rankings), branded('Top-Grossing Mobile Games Today — iOS & Google Play TOP 200'));
  assert.equal(h1Of(p.rankings), 'Top-Grossing Mobile Games Today');
  assert.equal(titleOf(p.country), branded('Top-Grossing Mobile Games in Korea Today: iOS & Google Play'));
  assert.equal(h1Of(p.country), 'Top-Grossing Mobile Games in Korea Today');
  assert.equal(titleOf(p.monthly), branded(`Top-Grossing Mobile Games of ${i18n.formatYearMonth(S.latestMonth)}: Monthly Ranking`));
  assert.equal(titleOf(p.steam), branded('Steam Charts: Most-Played Games & Daily Concurrent Players'));
  assert.equal(h1Of(p.steam), 'Most-Played Steam Games Today');
  assert.equal(titleOf(p.genres), branded('Top-Grossing Mobile Games by Genre Today'));
  assert.equal(titleOf(p.genre), branded('Top-Grossing RPG Mobile Games Today'));
  assert.equal(h1Of(p.genre), 'Top-Grossing RPG Mobile Games Today');
}));

test('the English subculture genre reads "Anime Gacha Games" without doubling "games" in its title', () => inEdition('en', () => {
  const { loadGenres } = require('../src/rank/genres');
  assert.equal(loadGenres().categories.find((c) => c.id === 'subculture').label, 'Anime Gacha Games');
  const { renderGenre, genreIdsWithData } = require('../src/templates/pages/genres');
  if (!genreIdsWithData('us').includes('subculture')) return;
  assert.equal(titleOf(renderGenre('subculture', 'us')), branded('Top-Grossing Anime Gacha Mobile Games Today'));
}));

test('game page titles name the grossing rank history or the Steam player count', () => inEdition('en', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const ctx = { days: ['2026-11-25'], hourlyDate: '' };
  const steam = { name: 'G', slug: 'g', platforms: ['steam'], developer: 'D', steam: { rank: 3 }, steamHistory: [], rank: null };
  assert.equal(titleOf(generateGamePage(steam, ctx)), branded('G Steam Player Count — Current & Peak Players'));
  assert.equal(titleOf(generateGamePage({ ...steam, platforms: ['ios'] }, ctx)), branded('G Grossing Rank History'));
  assert.equal(titleOf(generateGamePage({ ...steam, name: 'Borderlands®4 - Story Pack 1: Mad Ellie and the Vault of the Damned' }, ctx)), 'Borderlands®4 Steam Player Count — Current & Peak Players');
  const unsplit = 'A Game About Feeding A Black Hole And Other Very Long Stories Told Twice';
  assert.equal(titleOf(generateGamePage({ ...steam, platforms: ['ios'], name: unsplit }, ctx)), unsplit, 'a name is never cut and its title carries no brand');
  const fits = 'A Game About Feeding A Black Hole And More Stories';
  assert.equal(titleOf(generateGamePage({ ...steam, platforms: ['ios'], name: fits }, ctx)), fits, 'name-only even where the brand would fit');
  const names = { ja: 'Gの売上ランキング推移', ko: 'G 매출 순위 추이', 'zh-cn': 'G 畅销榜排名走势', 'zh-tw': 'G 暢銷榜排名走勢' };
  for (const [code, title] of Object.entries(names)) inEdition(code, () => assert.equal(i18n.t('game.seo_title_mobile', { name: 'G' }), title));
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
      }
      assert.ok(!titleOf(p.rankings).includes(S.COUNTRIES[edition.country]), `${edition.code}: ${titleOf(p.rankings)}`);
      assert.ok(titleOf(p.country).includes(i18n.t(`rank.where_${otherCountry(edition.country)}`)), `${edition.code}: ${titleOf(p.country)}`);
      assert.ok(titleOf(p.monthly).includes(i18n.formatYearMonth(S.latestMonth)), `${edition.code}: ${titleOf(p.monthly)}`);
    });
  }
});

test('every page type of every market in every edition: a title within 70 columns (or the name alone) and its own description', () => {
  const bad = [];
  for (const edition of i18n.EDITIONS) {
    inEdition(edition.code, () => {
      const generic = i18n.t('head.daily_records_and_analysis_of');
      for (const [kind, html, name] of allPages(edition)) {
        const title = titleOf(html);
        const description = dec((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
        // Only a name-only title (a name no title template fits, never cut) may exceed the budget.
        if (width(title) > MAX_TITLE_WIDTH && title !== name) bad.push(`${edition.code} ${kind} title (${width(title)}): ${title}`);
        if (!description || width(description) > 155) bad.push(`${edition.code} ${kind} description: "${description}"`);
        else if (description === generic && kind !== '404') bad.push(`${edition.code} ${kind}: generic description`);
      }
    });
  }
  assert.deepEqual(bad, []);
});
