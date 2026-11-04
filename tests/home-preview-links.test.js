'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/i18n');
const { hasAnalysisPage } = require('../src/build/analysis-pages');
const { renderHome, previewHtml } = require('../src/templates/pages/home');

const base = { name: 'Game', icon: '', developer: 'Dev', label: 'Label', value: 3, change: '', series: [3, 2], dates: ['2026-11-01', '2026-11-02'], ranked: true, best: 2, mean: 2.5, count: 2 };
const links = (html) => [...html.matchAll(/<a class="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);

test('home panel links the title and the rank history / metrics actions, with fallbacks', () => {
  i18n.setEdition('ko');
  try {
    const full = previewHtml({ ...base, href: '/games/g/', metrics: '/analysis/g/' });
    assert.deepEqual(links(full), ['rk-preview-title /games/g/', 'rk-btn primary /games/g/', 'rk-btn /analysis/g/']);
    assert.match(full, /지표 분석 <span class="rk-btn-new">NEW<\/span>/);
    assert.doesNotMatch(full, /rk-preview-link/);

    const noMetrics = previewHtml({ ...base, href: '/games/g/', metrics: null });
    assert.deepEqual(links(noMetrics), ['rk-preview-title /games/g/', 'rk-btn primary /games/g/']);
    assert.match(noMetrics, /<span class="rk-btn rk-btn-off">지표 분석 없음<\/span>/);

    const steam = previewHtml({ ...base, ranked: false, href: '/steam/730/', steam: true });
    assert.deepEqual(links(steam), ['rk-preview-title /steam/730/', 'rk-btn primary /steam/730/']);
    assert.match(steam, /<span class="rk-btn rk-btn-off" title="모바일 게임만 지표 분석을 제공합니다">지표 분석 미제공<\/span>/);

    const noPage = previewHtml({ ...base, href: null, list: '/rankings/jp/', country: '일본' });
    assert.deepEqual(links(noPage), ['rk-btn /rankings/jp/']);
    assert.match(noPage, /<div class="rk-preview-title">/);
    assert.match(noPage, /일본 매출 TOP 200.*<span class="rk-btn rk-btn-off">상세 기록 없음<\/span>/);
  } finally { i18n.setEdition('en'); }
});

test('home rows only select; every metrics action targets a page of the current edition', () => {
  i18n.setEdition('ko');
  try {
    const html = renderHome();
    const rows = html.split('<div class="rk-hpanels">')[1].split('<aside class="rk-preview"')[0].match(/<li[\s>][\s\S]*?<\/li>/g);
    assert.ok(rows.length >= 10);
    assert.deepEqual(rows.filter((row) => row.includes('<a ')), [], 'rows carry no links of their own');
    const { items } = JSON.parse(html.match(/id="rkHomeDeferredData">([\s\S]*?)<\/script>/)[1])[0];
    const mobile = Object.values(items).filter((e) => !e.steam && e.href);
    assert.ok(mobile.length > 0);
    for (const e of mobile) {
      const slug = decodeURIComponent(e.href.match(/^\/ko\/games\/([^/]+)\/$/)[1]);
      assert.equal(e.metrics || null, hasAnalysisPage(slug, 'ko') ? `/ko/analysis/${encodeURIComponent(slug)}/` : null, e.href);
    }
    for (const e of Object.values(items).filter((x) => !x.href)) assert.match(e.list, /^\/ko\/rankings\//);
  } finally { i18n.setEdition('en'); }
});
