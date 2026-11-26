'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const i18n = require('../src/i18n');
const { loadRankStats } = require('../src/rank/stats');
const { loadSteamStats } = require('../src/rank/steam-stats');
const { width, MAX_TITLE_WIDTH } = require('../src/templates/helpers/fit-description');
const { loadTemplates, writeSitemaps } = require('../src/build/editions');
const { routesJson } = require('../src/build/routing');

const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '');
const titleOf = (html) => dec((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
const h1Of = (html) => dec((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
const descOf = (html) => dec((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
const canonicalOf = (html) => (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
const alternatesOf = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

const inEdition = (code, fn) => {
  const before = i18n.currentEdition().code;
  i18n.setEdition(code);
  try { return fn(); } finally { i18n.setEdition(before); }
};

test('storeChartSpecs covers every country x store x chart with data (18 pages; China App Store only)', () => {
  const S = loadRankStats();
  const { storeChartSpecs } = require('../src/templates/pages/rank-hub');
  const specs = storeChartSpecs(S);
  assert.equal(specs.length, 18);
  const hrefs = new Set(specs.map((x) => x.href));
  assert.ok(hrefs.has('/rankings/us/app-store/top-grossing/'));
  assert.ok(hrefs.has('/rankings/us/google-play/top-grossing/'));
  assert.ok(hrefs.has('/rankings/jp/google-play/top-grossing/'));
  assert.ok(hrefs.has('/rankings/us/app-store/top-free/'));
  assert.ok(hrefs.has('/rankings/cn/app-store/top-grossing/'));
  assert.ok(hrefs.has('/rankings/cn/app-store/top-free/'));
  assert.equal(hrefs.has('/rankings/cn/google-play/top-grossing/'), false);
  assert.equal(hrefs.has('/rankings/cn/google-play/top-free/'), false);
});

test('every edition renders all 18 store-chart pages and /steam/most-played/ with unique <=70 col titles, summaries, dates, game links and sibling links', () => {
  const S = loadRankStats();
  const ST = loadSteamStats();

  for (const edition of i18n.EDITIONS) {
    inEdition(edition.code, () => {
      const m = loadTemplates();
      const hub = m.rankHub;
      const generic = i18n.t('head.daily_records_and_analysis_of');
      const todayFormatted = i18n.formatDay(S.today.date);
      const titles = new Map();
      const recordTitle = (key, html) => {
        const t = titleOf(html);
        assert.ok(t, `${edition.code} ${key}: missing title`);
        assert.ok(width(t) <= MAX_TITLE_WIDTH, `${edition.code} ${key}: title exceeds 70 cols (${width(t)}): ${t}`);
        assert.equal(titles.has(t), false, `${edition.code}: duplicate title between ${titles.get(t)} and ${key}: ${t}`);
        titles.set(t, key);
      };

      // Existing canonical hub pages in the same edition must not collide with new titles.
      recordTitle('/rankings/', hub.renderRankingsHub(edition.country));
      recordTitle('/rankings/free/', hub.renderRankingsHub(edition.country, 'free'));
      for (const c of Object.keys(S.COUNTRIES)) {
        if (c === edition.country || (c === 'cn' && edition.code !== 'zh-cn')) continue;
        recordTitle(`/rankings/${c}/`, hub.renderRankingsHub(c));
        recordTitle(`/rankings/free/${c}/`, hub.renderRankingsHub(c, 'free'));
      }
      recordTitle('/steam/', m.steamHub.renderSteamHub());

      // All 18 country x store x chart pages (zh-cn cn/app-store/* canonicalize to /zh-cn/rankings/ and /zh-cn/rankings/free/).
      for (const spec of hub.storeChartSpecs(S)) {
        const html = hub.renderStoreChart(spec.country, spec.store, spec.chart);
        assert.ok(html, `${edition.code} ${spec.href}: null render`);
        const isZhCnHome = edition.code === 'zh-cn' && spec.country === 'cn';
        const expectedCanonPath = isZhCnHome ? (spec.chart === 'free' ? '/rankings/free/' : '/rankings/') : spec.href;
        if (!isZhCnHome) recordTitle(spec.href, html);
        const title = titleOf(html);
        const h1 = h1Of(html);
        const desc = descOf(html);
        assert.ok(!title.includes(todayFormatted), `${edition.code} ${spec.href}: live title carries date`);
        assert.ok(h1.length > 5, `${edition.code} ${spec.href}: missing H1`);
        assert.ok(desc && desc !== generic && width(desc) <= 155, `${edition.code} ${spec.href}: bad description (${width(desc)}): ${desc}`);
        assert.equal(canonicalOf(html), i18n.absoluteUrl(edition.code, expectedCanonPath));
        const subMatch = html.match(/<span class="rk-sub">([\s\S]*?)<\/span>/);
        assert.ok(subMatch, `${edition.code} ${spec.href}: missing update line`);
        assert.equal((subMatch[1].match(/<time datetime="[^"]+">/g) || []).length, 1, `${edition.code} ${spec.href}: update line has one date`);
        assert.ok(subMatch[1].includes(`<time datetime="${S.today.date}">`), `${edition.code} ${spec.href}: missing update date`);
        assert.equal(subMatch[1].includes('('), false, `${edition.code} ${spec.href}: update line does not repeat a second timestamp`);
        assert.match(html, /<p class="rk-lead">[\s\S]+?<\/p>/, `${edition.code} ${spec.href}: missing data summary`);
        assert.match(html, /href="[^"]*\/games\/[^"]+"/, `${edition.code} ${spec.href}: missing game links`);
        const otherChart = spec.chart === 'free' ? 'grossing' : 'free';
        const otherChartHref = isZhCnHome ? (otherChart === 'free' ? '/rankings/free/' : '/rankings/') : hub.storeChartHref(spec.country, spec.store, otherChart);
        assert.ok(html.includes(otherChartHref), `${edition.code} ${spec.href}: missing sibling chart link`);
        assert.ok(html.includes('/steam/most-played/'), `${edition.code} ${spec.href}: missing steam most-played sibling link`);

        // Grossing store charts carry single-store Dataset JSON-LD.
        const datasets = ldOf(html).filter((n) => n['@type'] === 'Dataset');
        if (spec.chart === 'grossing') {
          assert.equal(datasets.length, 1, `${edition.code} ${spec.href}: expected 1 Dataset`);
          assert.equal(datasets[0].url, i18n.absoluteUrl(edition.code, expectedCanonPath));
          assert.equal(datasets[0].dateModified, S.today.date);
          assert.equal('license' in datasets[0], false);
          assert.deepEqual(datasets[0].spatialCoverage, [{ '@type': 'Country', name: S.COUNTRIES[spec.country] }]);
        } else {
          assert.equal(datasets.length, 0);
        }

        // Reciprocal hreflang across all 5 editions + x-default -> en.
        const alts = new Map(alternatesOf(html));
        assert.equal(alts.size, i18n.EDITIONS.length + 1, `${edition.code} ${spec.href}: hreflang count`);
        assert.equal(alts.get('x-default'), i18n.absoluteUrl('en', spec.href));
        for (const ed of i18n.EDITIONS) {
          const targetPath = spec.country === 'cn' && ed.code === 'zh-cn'
            ? (spec.chart === 'free' ? '/rankings/free/' : '/rankings/')
            : spec.href;
          assert.equal(alts.get(ed.hreflang), i18n.absoluteUrl(ed.code, targetPath));
        }
      }

      // /steam/most-played/
      const mpHtml = m.steamHub.renderSteamMostPlayed();
      recordTitle('/steam/most-played/', mpHtml);
      const mpDesc = descOf(mpHtml);
      assert.ok(mpDesc && mpDesc !== generic && width(mpDesc) <= 155, `${edition.code} /steam/most-played/: bad description`);
      assert.equal(canonicalOf(mpHtml), i18n.absoluteUrl(edition.code, '/steam/most-played/'));
      const mpSub = mpHtml.match(/<span class="rk-sub">([\s\S]*?)<\/span>/);
      assert.ok(mpSub && mpSub[1].includes(`<time datetime="${ST.today.date}">`) && !mpSub[1].includes('('), `${edition.code} /steam/most-played/: single-date update line`);
      assert.match(mpHtml, /<p class="rk-lead">[\s\S]+?<\/p>/, `${edition.code} /steam/most-played/: missing summary`);
      assert.equal((mpHtml.match(/class="ext"/g) || []).length, 0, `${edition.code} /steam/most-played/: rows should not be collapsed`);
      const listHtml = mpHtml.slice(mpHtml.indexOf('<ol class="rk-list steam'), mpHtml.indexOf('</ol>'));
      assert.equal((listHtml.match(/<li[\s>]/g) || []).length, ST.today.mp.length);
      assert.match(mpHtml, /href="[^"]*\/(?:games|steam\/\d+)\//, `${edition.code} /steam/most-played/: missing game links`);
      const mpAlts = new Map(alternatesOf(mpHtml));
      assert.equal(mpAlts.size, i18n.EDITIONS.length + 1);
      assert.equal(mpAlts.get('x-default'), i18n.absoluteUrl('en', '/steam/most-played/'));
    });
  }
});

test('localized SEO keywords appear in edition titles', () => {
  const checks = [
    ['en', 'us', 'ios', 'grossing', /US App Store Top Grossing Games/],
    ['en', 'jp', 'android', 'grossing', /Japan Google Play Top Grossing Games/],
    ['ja', 'jp', 'ios', 'grossing', /セルラン|売上ランキング/],
    ['ko', 'kr', 'android', 'grossing', /매출 순위/],
    ['zh-tw', 'tw', 'ios', 'grossing', /手遊營收排行.*暢銷榜/],
    ['zh-cn', 'cn', 'ios', 'grossing', /手游畅销榜/],
  ];
  for (const [code, country, store, chart, pattern] of checks) {
    inEdition(code, () => {
      const m = loadTemplates();
      assert.match(titleOf(m.rankHub.renderStoreChart(country, store, chart)), pattern);
    });
  }
  inEdition('en', () => {
    const m = loadTemplates();
    assert.match(titleOf(m.steamHub.renderSteamMostPlayed()), /Most Played Steam Games Today/);
  });
});

test('existing /rankings/<cc>/ and /steam/ stay rendered, link to canonical targets, and prevent duplicate-content pairs including zh-cn', () => {
  const singleStore = new Set(['cn']);
  i18n.setPageAvailability((code, p) => {
    const ed = i18n.EDITIONS.find((e) => e.code === code);
    const m = /^\/rankings\/(?:free\/)?(kr|jp|us|cn|tw)\/$/.exec(p);
    if (m && ed && (m[1] === ed.country || singleStore.has(m[1]))) return false;
    const sp = /^\/rankings\/(kr|jp|us|cn|tw)\/(?:app-store|google-play)(?:\/(?:top-grossing|top-free))?\/$/.exec(p);
    if (sp && ed && sp[1] === ed.country && singleStore.has(sp[1])) return false;
    return true;
  });
  try {
    inEdition('en', () => {
      const m = loadTemplates();
      const usHub = m.rankHub.renderRankingsHub('us');
      assert.equal(canonicalOf(usHub), 'https://gamerscroll.com/rankings/');
      assert.ok(usHub.includes('/rankings/us/app-store/top-grossing/'));
      assert.ok(usHub.includes('/rankings/us/google-play/top-grossing/'));
      assert.ok(usHub.includes('/rankings/us/app-store/top-free/'));
      assert.ok(usHub.includes('/rankings/us/google-play/top-free/'));
      // Fix 4: Country tabs and Global table link China to its canonical store-chart target, not /rankings/cn/.
      const tabsHtml = usHub.match(/<div class="rk-tabs rk-country-tabs"[\s\S]*?<\/div>/)[0];
      assert.ok(tabsHtml.includes('href="/rankings/cn/app-store/top-grossing/"'));
      assert.equal(tabsHtml.includes('href="/rankings/cn/"'), false);
      const usFree = m.rankHub.renderRankingsHub('us', 'free');
      const freeTabsHtml = usFree.match(/<div class="rk-tabs rk-country-tabs"[\s\S]*?<\/div>/)[0];
      assert.ok(freeTabsHtml.includes('href="/rankings/cn/app-store/top-free/"'));
      assert.equal(freeTabsHtml.includes('href="/rankings/free/cn/"'), false);
      const globalHtml = m.rankHub.renderGlobal();
      assert.ok(globalHtml.includes('href="/rankings/cn/app-store/top-grossing/"'));
      assert.equal(globalHtml.includes('href="/rankings/cn/"'), false);

      const cnHub = m.rankHub.renderRankingsHub('cn');
      assert.equal(canonicalOf(cnHub), 'https://gamerscroll.com/rankings/cn/app-store/top-grossing/');
      const cnFree = m.rankHub.renderRankingsHub('cn', 'free');
      assert.equal(canonicalOf(cnFree), 'https://gamerscroll.com/rankings/cn/app-store/top-free/');

      // Fix 3: /steam/ stays overview and does not target "most played" in its title.
      const steamHub = m.steamHub.renderSteamHub();
      assert.equal(canonicalOf(steamHub), 'https://gamerscroll.com/steam/');
      assert.ok(steamHub.includes('/steam/most-played/'));
      assert.doesNotMatch(titleOf(steamHub), /most[\s-]played/i);
    });

    // Fix 1: zh-cn /rankings/ & /rankings/free/ are canonical China App Store charts with full 5-edition hreflang + x-default.
    inEdition('zh-cn', () => {
      const m = loadTemplates();
      const cnHome = m.rankHub.renderRankingsHub('cn');
      assert.equal(canonicalOf(cnHome), 'https://gamerscroll.com/zh-cn/rankings/');
      assert.equal(cnHome.includes('/zh-cn/rankings/cn/app-store/'), false, 'zh-cn hub must not reference its non-canonical store duplicate');
      assert.equal(cnHome.slice(cnHome.indexOf('<body')).includes('/rankings/cn/app-store/'), false, 'zh-cn hub body must not link to cn/app-store duplicates');
      const alts = new Map(alternatesOf(cnHome));
      assert.equal(alts.size, i18n.EDITIONS.length + 1);
      assert.equal(alts.get('en'), 'https://gamerscroll.com/rankings/cn/app-store/top-grossing/');
      assert.equal(alts.get('x-default'), 'https://gamerscroll.com/rankings/cn/app-store/top-grossing/');
      assert.equal(alts.get('ja'), 'https://gamerscroll.com/ja/rankings/cn/app-store/top-grossing/');
      assert.equal(alts.get('ko'), 'https://gamerscroll.com/ko/rankings/cn/app-store/top-grossing/');
      assert.equal(alts.get('zh-TW'), 'https://gamerscroll.com/zh-tw/rankings/cn/app-store/top-grossing/');
      assert.equal(alts.get('zh-CN'), 'https://gamerscroll.com/zh-cn/rankings/');

      const cnFreeHome = m.rankHub.renderRankingsHub('cn', 'free');
      assert.equal(canonicalOf(cnFreeHome), 'https://gamerscroll.com/zh-cn/rankings/free/');
      const freeAlts = new Map(alternatesOf(cnFreeHome));
      assert.equal(freeAlts.get('x-default'), 'https://gamerscroll.com/rankings/cn/app-store/top-free/');
      assert.equal(freeAlts.get('zh-CN'), 'https://gamerscroll.com/zh-cn/rankings/free/');

      // Store-chart duplicates in zh-cn canonicalize back to /zh-cn/rankings/ and /zh-cn/rankings/free/.
      assert.equal(canonicalOf(m.rankHub.renderStoreChart('cn', 'ios', 'grossing')), 'https://gamerscroll.com/zh-cn/rankings/');
      assert.equal(canonicalOf(m.rankHub.renderStoreChart('cn', 'ios', 'free')), 'https://gamerscroll.com/zh-cn/rankings/free/');

      // Global table in zh-cn links China to /zh-cn/rankings/ (canonical).
      const globalZhCn = m.rankHub.renderGlobal();
      assert.ok(globalZhCn.includes('href="/zh-cn/rankings/"'));
      assert.equal(globalZhCn.includes('/zh-cn/rankings/cn/'), false);
    });
  } finally {
    i18n.setPageAvailability(null);
  }
});

test('new-entry counts reflect all TOP 200 entries not in yesterday top 200 (including rows ranked 201+ yesterday) with singular/plural wording', () => {
  const S = loadRankStats();
  for (const chart of ['grossing', 'free']) {
    for (const country of Object.keys(S.COUNTRIES)) {
      for (const store of ['ios', 'android']) {
        const todayRows = (chart === 'free' ? S.today.rowsFree : S.today.rows)[country][store] || [];
        if (!todayRows.length) continue;
        const ydayRows = (chart === 'free' ? S.yday.rowsFree : S.yday.rows)[country][store] || [];
        const ydayTop200 = new Set(ydayRows.slice(0, 200).filter((r) => r && r.appId).map((r) => String(r.appId)));
        const actual = todayRows.slice(0, 200).filter((r) => !ydayTop200.has(String(r.appId))).length;
        const mv = S.movers(country, store, chart);
        assert.equal(mv.freshCount, actual, `${country} ${store} ${chart} freshCount matches TOP 200 vs yday TOP 200`);
      }
    }
  }
  for (const country of ['us', 'jp', 'kr']) {
    const mv = S.movers(country, 'ios', 'grossing');
    assert.ok(mv.freshCount > 3, `${country} ios grossing has >3 new entries in TOP 200 (${mv.freshCount})`);
    inEdition('en', () => {
      const m = loadTemplates();
      const html = m.rankHub.renderStoreChart(country, 'ios', 'grossing');
      const lead = dec((html.match(/<p class="rk-lead">([\s\S]*?)<\/p>/) || [])[1] || '');
      assert.ok(lead.includes(`${mv.freshCount} new entries joined the TOP 200`), `${country} lead: ${lead}`);
    });
  }
  // Synthetic 205-row history: a game ranked 201 yesterday entering today's TOP 200 counts as new, while rank 200 does not.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-top200-'));
  try {
    const mkRows = (ids) => ids.map((id, i) => ({ rank: i + 1, appId: id, title: `Game ${id}`, developer: 'Dev' }));
    const ydayIds = Array.from({ length: 205 }, (_, i) => `app-${i + 1}`);
    const todayIds = [...ydayIds.slice(0, 198), 'app-200', 'app-201', 'app-new', 'app-202'];
    const mkDay = (date, ios) => ({
      timestamp: `${date}T11:00:00Z`,
      rankings: { grossing: { kr: { ios, android: [] }, jp: { ios: [], android: [] }, us: { ios: [], android: [] }, cn: { ios: [], android: [] }, tw: { ios: [], android: [] } }, free: { kr: { ios: [], android: [] }, jp: { ios: [], android: [] }, us: { ios: [], android: [] }, cn: { ios: [], android: [] }, tw: { ios: [], android: [] } } },
    });
    fs.writeFileSync(path.join(dir, '2026-11-25.json'), JSON.stringify(mkDay('2026-11-25', mkRows(ydayIds))));
    fs.writeFileSync(path.join(dir, '2026-11-26.json'), JSON.stringify(mkDay('2026-11-26', mkRows(todayIds))));
    const syn = loadRankStats({ force: true, historyDir: dir });
    const mv = syn.movers('kr', 'ios', 'grossing');
    assert.equal(mv.freshCount, 1, 'app-201 entering rank 200 counts as new; app-200 staying in TOP 200 does not; app-new at rank 201 is outside TOP 200');
    assert.equal(mv.freshTop.r.appId, 'app-201');
    assert.equal(mv.freshTop.rank, 200);
  } finally {
    loadRankStats({ force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Singular vs plural phrasing in every edition.
  for (const edition of i18n.EDITIONS) {
    inEdition(edition.code, () => {
      const one = i18n.t('rank.summary_new_entries_one', { name: 'Alpha', rank: 42 });
      const many = i18n.t('rank.summary_new_entries', { count: 13, name: 'Alpha', rank: 42 });
      assert.notEqual(one, many, `${edition.code}: singular differs from plural`);
      assert.ok(one.includes('1') && one.includes('Alpha') && one.includes('42'), `${edition.code}: ${one}`);
      if (edition.code === 'en') {
        assert.match(one, /\b1 new entry\b/);
        assert.doesNotMatch(one, /\b1 new entries\b/);
      }
    });
  }
});

test('Korean summary sentences avoid subject particles after game titles', () => {
  inEdition('ko', () => {
    for (const title of ['Kingshot', 'Pocket', 'Tower of God', '꿈의 정원 (Gardenscapes)', 'Counter-Strike 2', '원신']) {
      const rankLine = i18n.t('rank.summary_leader_streak', { name: title, days: 5 });
      const steamLine = i18n.t('steam.summary_leader_streak', { name: title, ccu: '1,234', days: 5, total: '9,876' });
      assert.ok(rankLine.includes(title), rankLine);
      assert.ok(steamLine.includes(title), steamLine);
      assert.equal(rankLine.includes(`${title}이`) || rankLine.includes(`${title}가`), false, `rank particle attached: ${rankLine}`);
      assert.equal(steamLine.includes(`${title}이`) || steamLine.includes(`${title}가`), false, `steam particle attached: ${steamLine}`);
    }
    const m = loadTemplates();
    const mpHtml = m.steamHub.renderSteamMostPlayed();
    const mpLead = dec((mpHtml.match(/<p class="rk-lead">([\s\S]*?)<\/p>/) || [])[1] || '');
    assert.ok(mpLead.includes('Counter-Strike 2('), `ko steam lead: ${mpLead}`);
    assert.equal(mpLead.includes('Counter-Strike 2가') || mpLead.includes('Counter-Strike 2이'), false, `ko steam lead: ${mpLead}`);

    const usIosHtml = m.rankHub.renderStoreChart('us', 'ios', 'grossing');
    const usIosLead = dec((usIosHtml.match(/<p class="rk-lead">([\s\S]*?)<\/p>/) || [])[1] || '');
    assert.match(usIosLead, /1위는 .+입니다\./, `ko store lead: ${usIosLead}`);
  });
});

test('game rank summary country links follow data-driven singleStoreCountries', () => {
  const { summaryMeta } = require('../src/build/game-data');
  const { renderGameRankSummary } = require('../src/templates/helpers/game-rank-summary');
  const S = loadRankStats();
  const meta = summaryMeta(S);
  assert.deepEqual(meta.singleStoreCountries, S.singleStoreCountries);
  assert.deepEqual(meta.singleStoreCountries, ['cn']);

  const rank = { s: { us: { ios: { o: meta.days.length - 5, v: [1, 2, 3, 4, 5] } } }, h: {} };
  inEdition('en', () => {
    const withCn = renderGameRankSummary(rank, { ...meta, singleStoreCountries: ['cn'] }, 'Sample', 'us').html;
    assert.ok(withCn.includes('href="/rankings/"'));
    assert.ok(withCn.includes('href="/rankings/cn/app-store/top-grossing/"'));
    assert.equal(withCn.includes('href="/rankings/cn/"'), false);
    assert.ok(withCn.includes('href="/rankings/tw/"'));

    const withTw = renderGameRankSummary(rank, { ...meta, singleStoreCountries: ['tw'] }, 'Sample', 'us').html;
    assert.ok(withTw.includes('href="/rankings/tw/app-store/top-grossing/"'));
    assert.equal(withTw.includes('href="/rankings/tw/"'), false);
    assert.ok(withTw.includes('href="/rankings/cn/"'));
    assert.equal(withTw.includes('href="/rankings/cn/app-store/top-grossing/"'), false);

    const withNone = renderGameRankSummary(rank, { ...meta, singleStoreCountries: [] }, 'Sample', 'us').html;
    assert.ok(withNone.includes('href="/rankings/cn/"'));
    assert.equal(withNone.includes('href="/rankings/cn/app-store/top-grossing/"'), false);
  });
  inEdition('zh-cn', () => {
    const cnHome = renderGameRankSummary(rank, { ...meta, singleStoreCountries: ['cn'] }, 'Sample', 'cn').html;
    assert.ok(cnHome.includes('href="/rankings/"'));
    assert.equal(cnHome.includes('href="/rankings/cn/app-store/top-grossing/"'), false);
  });
});

test('English edition replaces user-visible "subculture" text with Anime Gacha wording', () => {
  inEdition('en', () => {
    const m = loadTemplates();
    const { genreIdsWithData } = require('../src/templates/pages/genres');
    const pages = [
      m.rankHub.renderRankingsHub('us', 'free'),
      m.rankHub.renderAbout(),
      m.rankHub.renderGenre('all', 'us'),
      ...(genreIdsWithData('us').includes('subculture') ? [m.rankHub.renderGenre('subculture', 'us')] : []),
    ];
    for (const html of pages) {
      // Strip URL attributes (href, content URLs) and inline scripts before checking visible copy/metadata.
      const textOnly = html
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/https?:\/\/[^\s"'<>]+/g, ' ')
        .replace(/href="[^"]*"/g, ' ')
        .replace(/\/rankings\/genres\/subculture\//g, ' ');
      assert.doesNotMatch(textOnly, /\bsubculture\b/i);
    }
    assert.match(m.rankHub.renderAbout(), /anime gacha/i);
  });
});

test('writeSitemaps emits reciprocal hreflang + x-default for new pages including the zh-cn /rankings/ <-> /rankings/cn/app-store/top-grossing/ cluster', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-sitemap-'));
  i18n.setPageAvailability((code, p) => {
    const ed = i18n.EDITIONS.find((e) => e.code === code);
    const m = /^\/rankings\/(?:free\/)?(kr|jp|us|cn|tw)\/$/.exec(p);
    if (m && ed && (m[1] === ed.country || m[1] === 'cn')) return false;
    const sp = /^\/rankings\/(kr|jp|us|cn|tw)\/(?:app-store|google-play)(?:\/(?:top-grossing|top-free))?\/$/.exec(p);
    if (sp && ed && sp[1] === ed.country && sp[1] === 'cn') return false;
    return true;
  });
  try {
    const results = i18n.EDITIONS.map((e) => ({
      code: e.code,
      sitemap: [
        { loc: i18n.absoluteUrl(e.code, '/rankings/'), path: '/rankings/', priority: '0.8', lastmod: '2026-11-26' },
        ...(e.code !== 'zh-cn' ? [{ loc: i18n.absoluteUrl(e.code, '/rankings/cn/app-store/top-grossing/'), path: '/rankings/cn/app-store/top-grossing/', priority: '0.7', lastmod: '2026-11-26' }] : []),
        { loc: i18n.absoluteUrl(e.code, '/rankings/us/app-store/top-grossing/'), path: '/rankings/us/app-store/top-grossing/', priority: '0.7', lastmod: '2026-11-26' },
        { loc: i18n.absoluteUrl(e.code, '/steam/most-played/'), path: '/steam/most-played/', priority: '0.8', lastmod: '2026-11-26' },
      ],
    }));
    writeSitemaps(dir, results);
    const enXml = fs.readFileSync(path.join(dir, 'sitemap-en.xml'), 'utf8');
    const enCnBlock = enXml.match(/<url>[\s\S]*?<loc>https:\/\/gamerscroll\.com\/rankings\/cn\/app-store\/top-grossing\/<\/loc>[\s\S]*?<\/url>/)[0];
    assert.ok(enCnBlock.includes('hreflang="zh-CN" href="https://gamerscroll.com/zh-cn/rankings/"'));
    assert.ok(enCnBlock.includes('hreflang="x-default" href="https://gamerscroll.com/rankings/cn/app-store/top-grossing/"'));
    const cnXml = fs.readFileSync(path.join(dir, 'sitemap-zh-cn.xml'), 'utf8');
    const cnRankBlock = cnXml.match(/<url>[\s\S]*?<loc>https:\/\/gamerscroll\.com\/zh-cn\/rankings\/<\/loc>[\s\S]*?<\/url>/)[0];
    assert.ok(cnRankBlock.includes('hreflang="en" href="https://gamerscroll.com/rankings/cn/app-store/top-grossing/"'));
    assert.ok(cnRankBlock.includes('hreflang="x-default" href="https://gamerscroll.com/rankings/cn/app-store/top-grossing/"'));
    assert.doesNotMatch(cnRankBlock, /\/rankings\/cn\/"/);
  } finally {
    i18n.setPageAvailability(null);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('_routes.json excludes localized /steam/most-played/* while keeping /steam/<appid> on Functions', () => {
  const routes = routesJson();
  assert.ok(routes.exclude.length <= 100);
  for (const locale of ['ko', 'ja', 'zh-cn', 'zh-tw']) {
    assert.ok(routes.exclude.includes(`/${locale}/steam/most-played/*`));
    assert.equal(routes.exclude.includes(`/${locale}/steam/*`), false);
  }
});
