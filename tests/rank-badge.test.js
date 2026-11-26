'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../src/i18n');
const rankBadge = require('../src/templates/helpers/rank-badge');
const { renderGameRankSummary } = require('../src/templates/helpers/game-rank-summary');
const { generateGamePage } = require('../src/templates/pages/game');

const inEdition = (code, fn) => {
  const before = i18n.currentEdition().code;
  i18n.setEdition(code);
  try { return fn(); } finally { i18n.setEdition(before); }
};

const bodyOf = (html) => html.slice(html.indexOf('<body'));

const decodeAttr = (value) => value
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const META = {
  version: 'v123456789',
  days: Array.from({ length: 40 }, (_, i) => `2026-10-${String((i % 28) + 1).padStart(2, '0')}`),
  hourlyDate: '2026-11-26',
  cssVersion: 'abc12345',
  editions: {},
};

const FGO_JP = {
  name: 'Fate/Grand Order',
  names: { en: 'Fate/Grand Order', ja: 'Fate/Grand Order', ko: '페이트/그랜드 오더', 'zh-cn': '命运-冠位指定', 'zh-tw': 'Fate/Grand Order' },
  regional: { en: { q: { m: 'jp' }, o: [] } },
  slug: 'fategrand-order',
  platforms: ['ios', 'android'],
  developer: 'Aniplex Inc.',
  genres: ['rpg'],
  icon: null,
  ranked: true,
  steam: null,
  steamHistory: [],
  rank: {
    s: {
      jp: {
        // Equal history length -> renderGameRankSummary leads with App Store (ios #7), even though Android is #1.
        ios: { o: 0, v: [...Array(39).fill(5), 7] },
        android: { o: 0, v: [...Array(39).fill(4), 1] },
      },
    },
    h: {},
  },
};

const CS2 = {
  name: 'Counter-Strike 2',
  names: { en: 'Counter-Strike 2', ja: 'Counter-Strike 2', ko: '카운터-스트라이크 2', 'zh-cn': '反恐精英2', 'zh-tw': 'Counter-Strike 2' },
  slug: 'counter-strike-2',
  platforms: ['pc', 'steam'],
  developer: 'Valve',
  genres: ['action'],
  icon: null,
  ranked: false,
  steam: { currentPlayers: 569705, rank: 1, salesRank: 27 },
  steamHistory: [{ date: '2026-11-26', ccuRank: 1, ccu: 569705, salesRank: 27 }],
  rank: null,
};

const BASE_OFF_OTHER_ON = {
  name: 'Store Split Game',
  names: { en: 'Store Split Game' },
  slug: 'store-split-game',
  platforms: ['ios', 'android'],
  developer: 'Split Dev',
  genres: ['rpg'],
  icon: null,
  ranked: true,
  steam: null,
  steamHistory: [],
  rank: {
    s: {
      us: {
        // Android has 35 days (baseStore) but is off chart today; iOS has 34 days and is #68 today.
        android: { o: 0, v: Array(35).fill(20) },
        ios: { o: 6, v: [...Array(33).fill(50), 68] },
      },
    },
    h: {},
  },
};

const UNRANKED_INDEXABLE = {
  name: 'Old Classic',
  names: { en: 'Old Classic', ja: 'Old Classic', ko: '올드 클래식', 'zh-cn': '经典老游', 'zh-tw': '經典老遊' },
  slug: 'old-classic',
  platforms: ['ios', 'android'],
  developer: 'Retro Studio',
  genres: ['puzzle'],
  icon: null,
  ranked: false,
  steam: null,
  steamHistory: [],
  rank: {
    // 32 days in US, off chart today -> indexable in en, currently unranked.
    s: { us: { ios: { o: 0, v: Array(32).fill(50) } } },
    h: {},
  },
};

const NON_INDEXABLE = {
  name: 'Brief Blip',
  names: { en: 'Brief Blip' },
  slug: 'brief-blip',
  platforms: ['ios'],
  developer: 'Tiny Dev',
  genres: [],
  icon: null,
  ranked: false,
  steam: null,
  steamHistory: [],
  rank: {
    s: { us: { ios: { o: 0, v: [120, 130, 140] } } },
    h: {},
  },
};

test('static badge uses the page headline market and store rank, matching renderGameRankSummary', () => {
  for (const code of ['en', 'ja']) {
    const edition = i18n.getEdition(code);
    const summary = inEdition(code, () => renderGameRankSummary(FGO_JP.rank, META, FGO_JP.name, edition.country));
    const badge = rankBadge.renderGameBadge(FGO_JP, META, code);
    assert.equal(badge.resolved.status, 'ranked');
    assert.equal(badge.resolved.country, 'jp');
    assert.equal(badge.resolved.store, summary.baseStore, `${code}: matches page hero baseStore`);
    assert.equal(badge.resolved.rank, summary.cur, `${code}: matches page hero cur`);
  }

  assert.equal(rankBadge.renderGameBadge(FGO_JP, META, 'en').label.text, '#7 Top Grossing · Japan App Store');
  assert.equal(rankBadge.renderGameBadge(FGO_JP, META, 'ja').label.text, '売上7位 · 日本 App Store');

  // When headline baseStore is off-chart today, falls back to the other store in the same headline market.
  const split = rankBadge.renderGameBadge(BASE_OFF_OTHER_ON, META, 'en');
  assert.equal(split.resolved.status, 'ranked');
  assert.equal(split.resolved.country, 'us');
  assert.equal(split.resolved.store, 'ios');
  assert.equal(split.resolved.rank, 68);

  // Unranked indexable game still gets a sensible static SVG badge if embedded previously.
  const unranked = rankBadge.renderGameBadge(UNRANKED_INDEXABLE, META, 'en');
  assert.equal(unranked.resolved.status, 'unranked');
  assert.equal(unranked.label.text, 'Unranked · United States');
  assert.ok(unranked.svg.includes('Unranked · United States'));
});

test('Steam badge wording reads "#1 Most Played · Steam" and edition equivalents, with safe self-contained SVG', () => {
  const expected = {
    en: '#1 Most Played · Steam',
    ja: '同時接続1位 · Steam',
    ko: '최다 플레이 1위 · 스팀',
    'zh-cn': '同时在线第1名 · Steam',
    'zh-tw': '同時在線第1名 · Steam',
  };
  for (const [code, text] of Object.entries(expected)) {
    const badge = rankBadge.renderGameBadge(CS2, META, code);
    assert.equal(badge.label.text, text, code);
    assert.match(badge.svg, new RegExp(`^<svg xmlns="http://www\\.w3\\.org/2000/svg" width="${badge.width}" height="${badge.height}" viewBox="0 0 ${badge.width} ${badge.height}" role="img"`));
    assert.equal(badge.height, 28);
    assert.ok(badge.svg.includes('>GamerScroll</text>'), `${code}: brand`);
    assert.ok(badge.svg.includes(`>${text}</text>`), `${code}: label`);
    assert.doesNotMatch(badge.svg, /<script|<image|javascript:|href="https?:|url\(["']?https?:/i, `${code}: self-contained SVG`);
  }

  const specialName = { ...CS2, name: 'A & B <"Test">', names: { en: 'A & B <"Test">' } };
  const escaped = rankBadge.renderGameBadge(specialName, META, 'en').svg;
  assert.ok(escaped.includes('A &amp; B &lt;&quot;Test&quot;&gt;'));
});

test('badge URLs use edition paths with no query parameters and no /badge Pages Function exists', () => {
  assert.equal(rankBadge.badgeUrl('fategrand-order', 'en'), 'https://gamerscroll.com/badge/fategrand-order.svg');
  assert.equal(rankBadge.badgeUrl('fategrand-order', 'ja'), 'https://gamerscroll.com/ja/badge/fategrand-order.svg');
  assert.equal(rankBadge.badgeUrl('counter-strike-2', 'ko'), 'https://gamerscroll.com/ko/badge/counter-strike-2.svg');
  assert.equal(rankBadge.badgeUrl('counter-strike-2', 'zh-cn'), 'https://gamerscroll.com/zh-cn/badge/counter-strike-2.svg');
  assert.equal(rankBadge.badgeUrl('counter-strike-2', 'zh-tw'), 'https://gamerscroll.com/zh-tw/badge/counter-strike-2.svg');
  for (const code of ['en', 'ja', 'ko', 'zh-cn', 'zh-tw']) {
    assert.ok(!rankBadge.badgeUrl('fategrand-order', code).includes('?'), `${code}: no query params`);
  }
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'functions', 'badge')), false, 'no /badge Pages Function');
});

test('embed section appears only on currently ranked indexable pages, uses edition badge paths, and sets preview width and height', () => {
  // 1. Ranked mobile game on en and ja
  const enBadge = rankBadge.renderGameBadge(FGO_JP, META, 'en');
  const enBody = bodyOf(inEdition('en', () => generateGamePage(FGO_JP, META)));
  assert.ok(enBody.includes('game-embed-badge'), 'en ranked page includes embed section');
  assert.ok(enBody.includes('Embed this badge'), 'en heading');
  const chartIdx = enBody.indexOf('rk-game-trend');
  const embedIdx = enBody.indexOf('game-embed-badge');
  assert.ok(chartIdx > 0 && embedIdx > chartIdx, 'embed section sits after main chart content');

  const previewTag = (enBody.match(/<img class="game-embed-preview-img"[^>]+>/) || [])[0];
  assert.ok(previewTag, 'preview img present');
  assert.ok(previewTag.includes('="/badge/fategrand-order.svg"'), 'en preview uses static edition path');
  assert.ok(previewTag.includes(`width="${enBadge.width}"`), 'preview img has exact width');
  assert.ok(previewTag.includes(`height="${enBadge.height}"`), 'preview img has exact height');

  const [enHtmlSnippet, enMdSnippet] = [...enBody.matchAll(/<input type="text" class="game-embed-code" readonly value="([^"]+)"/g)].map((m) => decodeAttr(m[1]));
  assert.equal(
    enHtmlSnippet,
    '<a href="https://gamerscroll.com/games/fategrand-order/"><img src="https://gamerscroll.com/badge/fategrand-order.svg" alt="Fate/Grand Order (Japan) rank on GamerScroll" height="28"></a>'
  );
  assert.doesNotMatch(enHtmlSnippet, /nofollow|ugc|sponsored|\?/i, 'followed link and no query params');
  assert.equal(
    enMdSnippet,
    '[![Fate/Grand Order (Japan) rank on GamerScroll](https://gamerscroll.com/badge/fategrand-order.svg)](https://gamerscroll.com/games/fategrand-order/)'
  );

  // Japanese edition of FGO Japan
  const jaBadge = rankBadge.renderGameBadge(FGO_JP, META, 'ja');
  const jaBody = bodyOf(inEdition('ja', () => generateGamePage(FGO_JP, META)));
  assert.ok(jaBody.includes('このバッジを埋め込む'), 'ja heading');
  const jaPreview = (jaBody.match(/<img class="game-embed-preview-img"[^>]+>/) || [])[0];
  assert.ok(jaPreview.includes('="/ja/badge/fategrand-order.svg"'), 'ja preview uses /ja/badge/ path');
  assert.ok(jaPreview.includes(`width="${jaBadge.width}"`) && jaPreview.includes('height="28"'), 'ja preview width/height');
  const [jaHtmlSnippet, jaMdSnippet] = [...jaBody.matchAll(/<input type="text" class="game-embed-code" readonly value="([^"]+)"/g)].map((m) => decodeAttr(m[1]));
  assert.ok(jaHtmlSnippet.includes('href="https://gamerscroll.com/ja/games/fategrand-order/"'));
  assert.ok(jaHtmlSnippet.includes('src="https://gamerscroll.com/ja/badge/fategrand-order.svg"'));
  assert.ok(jaMdSnippet.includes('(https://gamerscroll.com/ja/badge/fategrand-order.svg)'));

  // 2. Ranked Steam game on ko, zh-cn, zh-tw
  const koSteamBody = bodyOf(inEdition('ko', () => generateGamePage(CS2, META)));
  const koSteamBadge = rankBadge.renderGameBadge(CS2, META, 'ko');
  assert.ok(koSteamBody.includes('이 배지 삽입하기'), 'ko heading');
  assert.ok(koSteamBody.indexOf('game-embed-badge') > koSteamBody.indexOf('game-steam-chart'), 'below Steam charts');
  const koPreview = (koSteamBody.match(/<img class="game-embed-preview-img"[^>]+>/) || [])[0];
  assert.ok(koPreview.includes('="/ko/badge/counter-strike-2.svg"'));
  assert.ok(koPreview.includes(`width="${koSteamBadge.width}"`) && koPreview.includes('height="28"'));
  const [koHtmlSnippet] = [...koSteamBody.matchAll(/<input type="text" class="game-embed-code" readonly value="([^"]+)"/g)].map((m) => decodeAttr(m[1]));
  assert.ok(koHtmlSnippet.includes('src="https://gamerscroll.com/ko/badge/counter-strike-2.svg"'));
  assert.ok(bodyOf(inEdition('zh-cn', () => generateGamePage(CS2, META))).includes('嵌入此徽章'));
  assert.ok(bodyOf(inEdition('zh-tw', () => generateGamePage(CS2, META))).includes('嵌入此徽章'));

  // 3. Indexable but currently unranked game OMITS embed section (no "Unranked" snippets)
  const unrankedHtml = inEdition('en', () => generateGamePage(UNRANKED_INDEXABLE, META));
  assert.ok(!unrankedHtml.includes('name="robots" content="noindex'), 'confirm unranked fixture is indexable');
  assert.ok(!bodyOf(unrankedHtml).includes('game-embed-badge'), 'unranked indexable page omits embed section');

  // 4. Non-indexable pages omit embed section
  const noindexHtml = inEdition('en', () => generateGamePage(NON_INDEXABLE, META));
  assert.ok(noindexHtml.includes('name="robots" content="noindex'));
  assert.ok(!bodyOf(noindexHtml).includes('game-embed-badge'));

  const fgoKoHtml = inEdition('ko', () => generateGamePage(FGO_JP, META));
  assert.ok(fgoKoHtml.includes('name="robots" content="noindex'));
  assert.ok(!bodyOf(fgoKoHtml).includes('game-embed-badge'));
});
