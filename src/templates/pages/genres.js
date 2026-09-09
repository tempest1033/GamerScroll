'use strict';
const { loadRankStats } = require('../../rank/stats');
const { loadGenres } = require('../../rank/genres');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const href = id => id === 'all' ? '/rankings/genres/' : `/rankings/genres/${id}/`;
function renderGenre(id = 'all') {
  const S = loadRankStats(), taxonomy = loadGenres();
  const selected = taxonomy.categories.find(c => c.id === id);
  if (id !== 'all' && !selected) throw new Error(`Unknown genre: ${id}`);
  const { makeCtx, storeList, subnav } = require('./rank-hub');
  const C = makeCtx(S), label = selected?.label || '전체';
  const filter = (row, game) => taxonomy.matches(game, id);
  const rows = store => S.today.rows.kr[store].slice(0, 200).filter(row => filter(row, S.gameOf(store, row)));
  const ios = rows('ios'), android = rows('android');
  const tabs = kind => taxonomy.categories.filter(c => c.kind === kind).map(c => `<a href="${href(c.id)}"${id === c.id ? ' class="active" aria-current="page"' : ''}>${c.label}</a>`).join('');
  const classification = `<div class="rk-genre-filters"><div class="rk-genre-filter-row"><span>장르</span><nav class="rk-tabs" aria-label="기본 장르"><a href="${href('all')}"${id === 'all' ? ' class="active" aria-current="page"' : ''}>전체</a>${tabs('genre')}</nav></div><div class="rk-genre-filter-row"><span>테마·방식</span><nav class="rk-tabs" aria-label="수동 분류 태그">${tabs('tag')}</nav></div></div>`;
  const column = (store, title, css, count) => `<div class="rk-col ${css}"><div class="rk-colh"><h2>${title}</h2><small>${count}개 · 전체 매출 TOP 200 내</small></div>${storeList(S, C, 'kr', store, 'grossing', { filter, withinCategory: true })}</div>`;
  const monthly = S.monthStats(S.latestMonth, 'kr');
  const monthlyRows = (monthly?.list || []).filter(a => taxonomy.matches(a.game, id)).slice(0, 10);
  const mean = values => { const valid = values.filter(Number.isFinite); return valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '-'; };
  const monthlyCard = `<div class="rk-card"><h2>${S.latestMonth} ${label} 월간 TOP 10 <small>기존 월간 통합 순위 기준</small></h2><div class="rk-scroll"><table class="rk-table"><thead><tr><th class="rank">분류 내</th><th>게임</th><th class="c">전체 통합</th><th class="c">앱스토어 평균</th><th class="c">구글플레이 평균</th></tr></thead><tbody>${monthlyRows.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, a.store)}</td><td class="c">${a.rank}위</td><td class="c">${mean(a.ios)}</td><td class="c">${mean(a.android)}</td></tr>`).join('') || '<tr><td colspan="5">이 분류의 월간 순위 기록이 없습니다.</td></tr>'}</tbody></table></div></div>`;
  const body = `<section class="section active" id="rankings">${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}<div class="page-container rk rk-genres"><div class="rk-head"><h1>${id === 'all' ? '장르별 게임 매출 순위' : `${label} 게임 매출 순위`}</h1></div>${subnav(S, 'genres')}${classification}<input type="radio" name="rk-store" id="rk-st-and" class="rk-control" checked><input type="radio" name="rk-store" id="rk-st-ios" class="rk-control"><div class="rk-storeseg"><label for="rk-st-and">구글플레이</label><label for="rk-st-ios">앱스토어</label></div><div class="rk-cols">${column('android', '구글플레이', 'and', android.length)}${column('ios', '앱스토어', 'ios', ios.length)}</div>${monthlyCard}</div></section>`;
  return wrapWithLayout(body, {
    currentPage: 'rankings', title: `${label} 모바일 게임 매출 순위 | 게이머스크롤`,
    description: `한국 앱스토어·구글플레이 ${label} 게임의 매출 순위와 월간 TOP 10. 분류 내 순위와 전체 매출 순위를 함께 제공합니다.`,
    canonical: `https://gamerscroll.com${href(id)}`,
    noindex: !ios.length && !android.length && !monthlyRows.length,
    breadcrumbs: [{ name: '홈', url: 'https://gamerscroll.com/' }, { name: '장르별 순위', url: 'https://gamerscroll.com/rankings/genres/' }, ...(selected ? [{ name: label, url: `https://gamerscroll.com${href(id)}` }] : [])],
  });
}
module.exports = { renderGenre };
