'use strict';
// Crawl budget: sitemaps carry only each edition's priority pages, and in-page links name only indexable, built pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const i18n = require('../src/i18n');
const { writeGameSitemaps, writeSitemapIndex } = require('../src/build/editions');
const { redirectsText } = require('../src/build/routing');
const marketPlan = require('../functions/_lib/market-plan');
const { steamPageSlugs } = require('../src/build/game-data');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-crawl-'));
const urlset = (lastmod) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset><url><loc>x</loc><lastmod>${lastmod}</lastmod></url></urlset>\n`;

test('the sitemap index lists the Korean edition first, each edition\'s pages before its games, and no metrics sitemap', () => {
  const dir = tmp();
  for (const name of ['sitemap-en.xml', 'sitemap-games-en-1.xml', 'sitemap-ja.xml', 'sitemap-ko.xml', 'sitemap-games-ko-1.xml', 'sitemap-games-ko-2.xml', 'sitemap-zh-tw.xml']) fs.writeFileSync(path.join(dir, name), urlset('2026-11-24'));
  writeSitemapIndex(dir);
  const locs = [...fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>https:\/\/gamerscroll\.com\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ['sitemap-ko.xml', 'sitemap-games-ko-1.xml', 'sitemap-games-ko-2.xml', 'sitemap-en.xml', 'sitemap-games-en-1.xml', 'sitemap-ja.xml', 'sitemap-zh-tw.xml']);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8'), /analysis/);
});

test('game sitemaps list an edition\'s priority games with the hreflang set of every edition where the page is indexable', () => {
  const dir = tmp();
  // 'a' charts in Korea; 'b' is indexable in ko (a Steam record) but no priority game; 'a' is also indexable in en.
  writeGameSitemaps(dir, { ko: ['a'], en: [] }, { a: '2026-11-24', b: '2026-11-24' }, { ko: ['a', 'b'], en: ['a', 'b'] });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['sitemap-games-ko-1.xml']);
  const xml = fs.readFileSync(path.join(dir, 'sitemap-games-ko-1.xml'), 'utf8');
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://gamerscroll.com/ko/games/a/']);
  assert.deepEqual([...xml.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`), ['en https://gamerscroll.com/games/a/', 'ko https://gamerscroll.com/ko/games/a/', 'x-default https://gamerscroll.com/games/a/']);
});

test('/rankings/subculture/ moved to /rankings/genres/subculture/ (or the edition\'s nearest built parent)', () => {
  const plan = (genres) => ({ genres: ['all', ...genres], publisherHub: true, publishers: [], monthly: ['2026-10'], records: true });
  const plans = { en: plan(['subculture']), ja: plan(['subculture']), 'zh-cn': plan([]), ko: plan(['subculture']), 'zh-tw': plan(['rpg']) };
  assert.equal(marketPlan.available(plans.ko, '/rankings/subculture/'), false);
  assert.equal(marketPlan.builtSomewhere(plans, '/rankings/subculture/'), true);
  assert.equal(marketPlan.nearestBuilt(plans.ko, '/rankings/subculture/'), '/rankings/genres/subculture/');
  assert.equal(marketPlan.nearestBuilt(plans['zh-cn'], '/rankings/subculture/'), '/rankings/genres/');
  const rules = redirectsText(plans, { en: '', ja: '/ja', 'zh-cn': '/zh-cn', ko: '/ko', 'zh-tw': '/zh-tw' }).split('\n');
  assert.ok(rules.includes('/ko/rankings/subculture/ /ko/rankings/genres/subculture/ 301'));
  assert.ok(rules.includes('/zh-cn/rankings/subculture/ /zh-cn/rankings/genres/ 301'));
});

test('Steam record pages of every edition reach the middleware, which redirects them; no static Steam rules', () => {
  const { routesJson } = require('../src/build/routing');
  const routes = routesJson();
  const matches = (rule, p) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(p) || (rule.endsWith('/*') && p === rule.slice(0, -2));
  const reachesFunctions = (p) => routes.include.some((r) => matches(r, p)) && !routes.exclude.some((r) => matches(r, p));
  for (const prefix of ['', '/ko', '/ja', '/zh-cn', '/zh-tw']) {
    assert.equal(reachesFunctions(`${prefix}/steam/730/`), true, `${prefix}/steam/730/`);
    assert.equal(reachesFunctions(`${prefix}/steam/730`), true, `${prefix}/steam/730`);
  }
  assert.equal(reachesFunctions('/ko/steam/'), false, 'the localized Steam hub stays static');
  const plans = { en: { genres: ['all'], publisherHub: true, publishers: [], monthly: [], records: true } };
  assert.ok(!redirectsText(plans, { en: '', ko: '/ko', ja: '/ja' }).includes('/steam/'));
});

test('a Steam app moves to the first game page that names it', () => {
  const games = [
    { key: 'A', slug: 'a', appIds: { steam: '730' } },
    { key: 'A dup', slug: 'a', appIds: { steam: '999' } }, // slug taken by A: no page of its own
    { key: 'B', slug: 'b', appIds: { 'steam:global': 570 } },
    { key: 'C', slug: 'c', appIds: { steam: '730' } },
    { key: 'D', slug: 'd', appIds: { steam: '12345' } }, // no record page
  ];
  assert.deepEqual([...steamPageSlugs(games, new Set(['730', '570', '999']))], [['730', 'a'], ['570', 'b']]);
});

test('ranking rows link only game pages indexable in the edition; the rest are plain text', () => {
  const hub = require('../src/templates/pages/rank-hub');
  const { loadRankStats } = require('../src/rank/stats');
  const S = loadRankStats();
  const allowed = new Set(S.today.rows.kr.ios.slice(0, 5).map((r) => S.gameOf('ios', r)).filter((g) => g && g.slug).map((g) => g.slug));
  i18n.setEdition('ko');
  i18n.setPageAvailability((code, p) => { const m = /^\/games\/([^/]+)\/$/.exec(p); return !m || (code === 'ko' && allowed.has(decodeURIComponent(m[1]))); });
  try {
    const html = hub.renderRankingsHub('kr');
    const linked = [...html.matchAll(/href="\/ko\/games\/([^/"]+)\/"/g)].map((m) => decodeURIComponent(m[1]));
    assert.ok(linked.length > 0);
    for (const slug of linked) assert.ok(allowed.has(slug), slug);
    assert.ok((html.match(/<span class="" data-name[ >]/g) || []).length > 100, 'the other rows keep their names as text');
    const lists = html.match(/<ol class="rk-list[\s\S]*?<\/ol>/g);
    assert.equal(lists.length, 2);
    for (const list of lists) assert.doesNotMatch(list, /href="\/ko\/analysis\//, 'ranking rows do not link the noindex metrics pages');
    const free = hub.renderRankingsHub('kr', 'free');
    assert.doesNotMatch(free, /href="\/ko\/rankings\/subculture\/"/);
  } finally { i18n.setPageAvailability(null); i18n.setEdition('en'); }
});

test('the Steam hub links only built Steam pages or the game pages that replaced them', () => {
  const steamHub = require('../src/templates/pages/steam-hub');
  const { merged, built } = steamHub.steamTargets();
  i18n.setEdition('ko');
  try {
    const html = steamHub.renderSteamHub();
    const steamLinks = [...html.matchAll(/href="\/ko\/steam\/(\d+)\/"/g)].map((m) => m[1]);
    for (const id of steamLinks) assert.ok(built.includes(id), `/steam/${id}/ is built`);
    const gameLinks = [...html.matchAll(/href="\/ko\/games\/([^/"]+)\/"/g)].map((m) => decodeURIComponent(m[1]));
    assert.ok(gameLinks.length > 0);
    const slugs = new Set(merged.values());
    for (const slug of gameLinks) assert.ok(slugs.has(slug), slug);
    for (const id of ['3764200', '3041230', '3357650', '2000950']) if (!built.includes(id) && !merged.has(id)) assert.doesNotMatch(html, new RegExp(`/steam/${id}/`));
  } finally { i18n.setEdition('en'); }
});

test('the game page carries the Steam record and stays indexable with it; related games link only where indexable', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const days = ['2026-11-23', '2026-11-24'];
  const steamRecord = { id: '730', name: 'Counter-Strike 2', img: '', developer: 'Valve', date: days[1], firstDay: days[0], totalDays: 2, cur: 1500000, prev: 1400000, rank: 1, sell: 3, price: '', discount: '', first: days[0], onChart: 2, peak: { ccu: 1500000, date: days[1] }, avg30: 1450000, n30: 2, series: [1400000, 1500000], dates: days, monthly: [{ mo: '2026-11', avg: 1450000, max: 1500000, rank: 1, bestRank: 1, sell: 3, n: 2 }] };
  const related = { g: [{ s: 'kr-only', k: 'KR only', x: ['ko'] }], e: { ko: { k: 'rank', n: [[0, 'ios', 3]], d: [] }, en: { k: 'rank', n: [[0, 'ios', 3]], d: [] } } };
  const game = { name: 'Counter-Strike 2', slug: 'counter-strike-2', platforms: ['steam'], names: {}, steamRecord, related };
  const meta = { days, hourlyDate: '' };
  i18n.setEdition('ko');
  try {
    const ko = generateGamePage(game, meta);
    assert.match(ko, /class="home-card grid-full game-steam-record"/);
    assert.match(ko, /href="https:\/\/store\.steampowered\.com\/app\/730\/"/);
    assert.doesNotMatch(ko, /<meta name="robots" content="noindex/);
    assert.match(ko, /<a class="rk-rel-item" href="\/ko\/games\/kr-only\/"/);
    i18n.setEdition('en');
    const en = generateGamePage(game, meta);
    assert.match(en, /<span class="rk-rel-item">/);
    assert.doesNotMatch(en, /href="\/games\/kr-only\/"/);
  } finally { i18n.setEdition('en'); }
});

test('the edition selector of a game page sends crawlers only to editions where that game page is indexable', () => {
  const { generateGamePage } = require('../src/templates/pages/game');
  const meta = { days: ['2026-11-23', '2026-11-24'], hourlyDate: '' };
  const game = { name: 'KR game', slug: 'kr-game', platforms: ['ios'], names: {}, rank: { s: { kr: { ios: { o: 0, v: [40, 30] } } }, h: {} } };
  i18n.setEdition('ko');
  try {
    const html = generateGamePage(game, meta);
    const links = [...html.matchAll(/<a href="([^"]+)" data-edition-link data-edition="([^"]+)"([^>]*)>/g)];
    assert.ok(links.length >= 5);
    for (const [, href, code, rest] of links) {
      // Korea's edition and the English one (the global default) index this Korea-only game; the others do not.
      assert.equal(href, ['ko', 'en'].includes(code) ? i18n.editionPath(code, '/games/kr-game/') : i18n.editionPath(code, '/games/'), code);
      assert.doesNotMatch(rest, /data-path/, 'a visitor\'s click still opens the same game in that edition');
    }
    assert.match(html, /<link rel="alternate" hreflang="ko" href="https:\/\/gamerscroll\.com\/ko\/games\/kr-game\/"/);
    assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/gamerscroll\.com\/games\/kr-game\/"/);
    assert.doesNotMatch(html, /<link rel="alternate" hreflang="ja"/);
  } finally { i18n.setEdition('en'); }
});
