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
  const feat = list[0];
  const rows = list.map((a, i) => `<a class="rk-rep ${i === 0 ? 'rk-news-lead' : 'rk-news-card'}" data-report-category="${a.cat}" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" width="240" height="135" ${i < 3 ? 'loading="eager"' : 'loading="lazy"'} decoding="async"><div class="rk-report-copy"><div class="k">${a.catName}<time datetime="${a.date}">${a.date}</time></div><h2 class="t">${esc(a.title)}</h2><p class="s">${esc(a.summary)}</p></div></a>`).join('');
  const nRank = list.filter((a) => a.cat === 'ranking').length, nIns = list.length - nRank;
  const body = `<div class="rk-head"><h1>게임 분석 리포트</h1></div>
<nav class="rk-subnav" aria-label="리포트 종류"><a class="active" aria-current="true" data-report-filter="all" href="#all">전체 ${list.length}</a><a data-report-filter="ranking" href="#ranking">순위 분석 ${nRank}</a><a data-report-filter="insight" href="#insight">인사이트 ${nIns}</a></nav>
<div class="rk-report-count" role="status" aria-live="polite">전체 ${list.length}편 · 최신순</div>
<div class="rk-replist rk-report-list rk-news-layout">${rows}</div>`;
  const content = `
    <section class="section active" id="reports">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}</div>
    </section>`;
  const canonical = `${siteBaseUrl}/reports/`;
  return wrapWithLayout(content, {
    currentPage: 'reports',
    pageScripts: `<script>(function(){
      var root=document.getElementById('reports');if(!root)return;
      var tabs=Array.from(root.querySelectorAll('[data-report-filter]'));
      var rows=Array.from(root.querySelectorAll('[data-report-category]'));
      function update(){
        var key=location.hash.slice(1);if(!['ranking','insight'].includes(key))key='all';
        var count=0;
        rows.forEach(function(row){
          row.hidden=key!=='all'&&row.dataset.reportCategory!==key;
          row.classList.remove('rk-news-lead','rk-news-card');
          if(row.hidden)return;
          var position=count++;
          if(position===0)row.classList.add('rk-news-lead');
          else row.classList.add('rk-news-card');
        });
        tabs.forEach(function(tab){var selected=tab.dataset.reportFilter===key;tab.classList.toggle('active',selected);if(selected)tab.setAttribute('aria-current','true');else tab.removeAttribute('aria-current');});
        root.querySelector('.rk-report-count').textContent=({all:'전체',ranking:'순위 분석',insight:'인사이트'}[key])+' '+count+'편 · 최신순';
      }
      tabs.forEach(function(tab){tab.addEventListener('click',function(e){e.preventDefault();history.pushState(null,'',tab.getAttribute('href'));update();});});
      window.addEventListener('popstate',update);window.addEventListener('hashchange',update);update();
    })();</script>`,
    title: '리포트 — 모바일 게임 순위 분석 · 시장 인사이트 | 게이머스크롤',
    description: `게임 순위 및 시장 분석 리포트 ${list.length}편. 월간 매출 순위, 서브컬처 및 신규 게임 분석. 최신 리포트: ${feat.title}`,
    keywords: '모바일 게임 순위 분석, 게임 매출 순위 리포트, 서브컬처 게임 순위 분석, 게임 시장 인사이트',
    canonical,
    breadcrumbs: [{ name: '홈', url: `${siteBaseUrl}/` }, { name: '리포트', url: canonical }],
  });
}

module.exports = { renderReportsHub };
