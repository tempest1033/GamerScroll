'use strict';
/**
 * 리포트 허브 (/reports/) — 순위 분석 · 인사이트 만 모은 목록. 기사 본문 URL 은 기존 /magazine/{cat}/{slug}/ 그대로.
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { loadReports } = require('../../rank/reports');

const siteBaseUrl = 'https://gamerscroll.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderReportsHub() {
  const list = loadReports();
  if (!list.length) return null;
  const [feat, ...rest] = list;
  const card = (a, big = false) => `<a class="rk-cardl" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" ${big ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}><div class="b"><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div><div class="s">${esc(a.summary)}</div></div></a>`;
  const side = rest.slice(0, 4).map((a) => `<a href="${a.href}"><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div></a>`).join('');
  const rows = rest.slice(4).map((a) => `<a class="rk-rep" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" loading="lazy" decoding="async"><div><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div><div class="s">${esc(a.summary)}</div></div></a>`).join('');
  const nRank = list.filter((a) => a.cat === 'ranking').length, nIns = list.length - nRank;
  const body = `<div class="rk-head"><h1>리포트</h1></div>
<nav class="rk-subnav" aria-label="리포트 종류"><a class="active" href="/reports/">전체 ${list.length}</a><a href="/magazine/ranking/">순위 분석 ${nRank}</a><a href="/magazine/insight/">인사이트 ${nIns}</a></nav>
<div class="rk-feat">${card(feat, true)}<div class="side">${side}</div></div>
${rows ? `<section class="rk-section"><h2>전체 <small>최신순</small></h2><div class="rk-replist">${rows}</div></section>` : ''}`;
  const content = `
    <section class="section active" id="reports">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}</div>
    </section>`;
  const canonical = `${siteBaseUrl}/reports/`;
  return wrapWithLayout(content, {
    currentPage: 'reports',
    title: '리포트 — 모바일 게임 순위 분석 · 시장 인사이트 | 게이머스크롤',
    description: `게이머스크롤 순위 데이터에서 출발한 분석 ${list.length}편. 월간 매출 순위 · 서브컬처 순위 · 신작 성적표 · 시장 인사이트. 최신: ${feat.title}`,
    keywords: '모바일 게임 순위 분석, 게임 매출 순위 리포트, 서브컬처 게임 순위 분석, 게임 시장 인사이트',
    canonical,
    breadcrumbs: [{ name: '홈', url: `${siteBaseUrl}/` }, { name: '리포트', url: canonical }],
  });
}

module.exports = { renderReportsHub };
