'use strict';
// Source context in JSON-LD (edition home, about page, game pages, ranking Datasets) and the game page's developer/genre links.
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');

const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const ofType = (html, type) => ldOf(html).filter((node) => node['@type'] === type);
const inEdition = (code, fn) => { i18n.setEdition(code); try { return fn(); } finally { i18n.setEdition('en'); } };

test('edition home: WebSite and its publisher use the edition URL; the root edition keeps the bare host', () => {
  const { generateHead } = require('../src/templates/components/head');
  for (const [code, home] of [['ko', 'https://gamerscroll.com/ko/'], ['ja', 'https://gamerscroll.com/ja/'], ['en', 'https://gamerscroll.com/']]) {
    inEdition(code, () => {
      const [site] = ofType(generateHead({ canonical: 'https://gamerscroll.com/', description: 'Home.' }), 'WebSite');
      assert.equal(site.url, home, code);
      assert.equal(site['@id'], `${home}#website`);
      assert.deepEqual([site.publisher['@id'], site.publisher.url], [`${home}#organization`, home]);
      assert.equal(site.potentialAction.target.urlTemplate, `${home}games/?q={search_term_string}`);
    });
  }
  inEdition('ko', () => assert.equal(ofType(generateHead({ canonical: 'https://gamerscroll.com/rankings/' }), 'WebSite').length, 0, 'home only'));
});

test('neither the AdSense preload nor its loader raises the fetch priority', () => {
  const html = require('../src/templates/components/head').generateHead({ canonical: 'https://gamerscroll.com/' });
  const preload = html.match(/<link rel="preload" as="script"[^>]*adsbygoogle\.js">/)[0];
  assert.doesNotMatch(preload, /fetchpriority/i);
  const loader = html.match(/<script>[^<]*document\.createElement\('script'\)[^<]*adsbygoogle\.js[^<]*<\/script>/)[0];
  assert.doesNotMatch(loader, /fetchpriority/i);
});

test('about page: Organization (logo, X account) and its operator, referenced by the site WebSite', () => {
  const { renderAboutPage } = require('../src/templates/pages/about');
  inEdition('ko', () => {
    const html = renderAboutPage();
    const [org] = ofType(html, 'Organization');
    const [person] = ofType(html, 'Person');
    const [page] = ofType(html, 'AboutPage');
    assert.equal(org['@id'], 'https://gamerscroll.com/ko/#organization');
    assert.equal(org.url, 'https://gamerscroll.com/ko/');
    assert.equal(org.logo.url, 'https://gamerscroll.com/icon-192.png');
    assert.deepEqual(org.sameAs, ['https://x.com/gamerscroll']);
    assert.deepEqual(org.founder, { '@id': person['@id'] });
    assert.equal(person.name, '플랑크톤');
    assert.ok(html.includes(`<b>${person.name}</b>`), 'the name the page shows');
    assert.deepEqual(person.worksFor, { '@id': org['@id'] });
    assert.deepEqual(page.mainEntity, { '@id': org['@id'] });
  });
  inEdition('en', () => assert.equal(ofType(renderAboutPage(), 'Person')[0].name, 'Plankton'));
});

const game = {
  name: 'Coin Master', slug: 'coin-master', platforms: ['ios', 'android'], developer: 'Moon Active', icon: 'https://example.com/i.png',
  genres: ['casual-puzzle', 'rpg'], links: { ko: { p: 'moon-active', g: ['casual-puzzle'] } },
  storeUrls: ['https://apps.apple.com/app/id406889139', 'https://play.google.com/store/apps/details?id=com.moonactive.coinmaster'],
  steam: { rank: 3 }, steamHistory: [], rank: null,
};
const meta = { days: ['2026-11-24', '2026-11-25'], hourlyDate: '' };

test('game page links the developer and genres only to pages built in the edition; the hero icon loads eagerly', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  inEdition('ko', () => {
    const html = generateGamePage(game, meta);
    const hero = html.slice(html.indexOf('class="game-hero-info"'), html.indexOf('<!-- rank-content-start -->'));
    assert.match(hero, /<div class="game-hero-developer"><a href="\/ko\/rankings\/publishers\/moon-active\/" data-name[^>]*>Moon Active<\/a><\/div>/);
    assert.match(hero, /<a class="game-platform-badge game-genre-badge" href="\/ko\/rankings\/genres\/casual-puzzle\/">캐주얼·퍼즐<\/a>/);
    assert.match(hero, /<span class="game-platform-badge game-genre-badge">RPG<\/span>/, 'a genre page the edition does not build is plain text');
    const icon = html.match(/<img class="game-hero-icon"[^>]*>/)[0];
    assert.doesNotMatch(icon, /loading=/);
    assert.match(icon, /fetchpriority="high"/);
    assert.match(icon, /width="72" height="72"/);
  });
  inEdition('ja', () => {
    const html = generateGamePage(game, meta);
    assert.match(html, /<div class="game-hero-developer"><span data-name[^>]*>Moon Active<\/span><\/div>/);
    assert.doesNotMatch(html, /href="\/ja\/rankings\/genres\/(casual-puzzle|rpg)\/"/, 'no plan entry for the edition: no genre links');
  });
});

test('game SoftwareApplication carries its URL, the shown genres and the official store pages', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  inEdition('ko', () => {
    const [app] = ofType(generateGamePage(game, meta), 'SoftwareApplication');
    assert.equal(app.url, 'https://gamerscroll.com/ko/games/coin-master/');
    assert.deepEqual(app.genre, ['캐주얼·퍼즐', 'RPG']);
    assert.deepEqual(app.sameAs, game.storeUrls);
  });
});

test('ranking pages describe their data as a Dataset by the Organization, collected and updated daily, in five markets, with no start date', () => {
  const S = require('../src/rank/stats').loadRankStats();
  const rankHub = require('../src/templates/pages/rank-hub');
  inEdition('ko', () => {
    for (const [html, url] of [
      [rankHub.renderRankingsHub('kr'), 'https://gamerscroll.com/ko/rankings/'],
      [rankHub.renderRecords('kr'), 'https://gamerscroll.com/ko/rankings/records/'],
      [rankHub.renderGenre('all', 'kr'), 'https://gamerscroll.com/ko/rankings/genres/'],
      [rankHub.renderMonthly(S.builtMonths.at(-1), 'kr'), `https://gamerscroll.com/ko/rankings/monthly/${S.builtMonths.at(-1)}/`],
    ]) {
      const [dataset] = ofType(html, 'Dataset');
      assert.equal(dataset.url, url);
      assert.doesNotMatch(dataset.name, /\| 게이머스크롤/, 'the page title without the site suffix');
      assert.equal(dataset.creator['@id'], 'https://gamerscroll.com/ko/#organization');
      assert.equal('temporalCoverage' in dataset, false, 'no start date');
      assert.ok(!JSON.stringify(dataset).includes(S.days[0].date), 'the first history day appears nowhere');
      assert.equal(dataset.description, '게이머스크롤이 매일 수집하고 매일 갱신하는 게임 순위 데이터입니다.');
      assert.equal(dataset.measurementTechnique, '매일 수집하고 매일 갱신합니다.');
      assert.deepEqual(dataset.spatialCoverage.map((p) => p.name), ['한국', '일본', '미국', '중국', '대만']);
      assert.equal('license' in dataset, false);
    }
    assert.equal(ofType(rankHub.renderRankingsHub('jp'), 'Dataset').length, 0, 'country pages other than the hub carry none');
  });
});

test('edition home links the genres hub and the newest monthly page only where the edition builds them', () => {
  const { renderHome } = require('../src/templates/pages/home');
  const S = require('../src/rank/stats').loadRankStats();
  const latest = S.builtMonths.at(-1);
  const shortcuts = (html) => { const nav = html.match(/<nav class="rk-links rk-links-row rk-home-shortcuts"[^>]*>([\s\S]*?)<\/nav>/); return nav ? [...nav[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]) : []; };
  try {
    inEdition('ko', () => assert.deepEqual(shortcuts(renderHome()), ['/ko/rankings/genres/', `/ko/rankings/monthly/${latest}/`]));
    i18n.setPageAvailability((code, p) => p !== '/rankings/genres/' && p !== `/rankings/monthly/${latest}/`);
    inEdition('ko', () => {
      const html = renderHome();
      const older = S.builtMonths.at(-2);
      assert.deepEqual(shortcuts(html), older ? [`/ko/rankings/monthly/${older}/`] : []);
      assert.doesNotMatch(html, new RegExp(`href="/ko/rankings/monthly/${latest}/"`));
    });
  } finally { i18n.setPageAvailability(null); }
});
