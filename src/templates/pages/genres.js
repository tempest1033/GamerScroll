'use strict';
const { t, formatDay, formatYearMonth } = require('../../i18n');
const { loadRankStats } = require('../../rank/stats');
const { loadGenres } = require('../../rank/genres');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const href = id => id === 'all' ? '/rankings/genres/' : `/rankings/genres/${id}/`;
function renderGenre(id = 'all') {
  const S = loadRankStats(), taxonomy = loadGenres();
  const selected = taxonomy.categories.find(c => c.id === id);
  if (id !== 'all' && !selected) throw new Error(`Unknown genre: ${id}`);
  const { makeCtx, storeList, subnav, HSCROLL_SCRIPT } = require('./rank-hub');
  const C = makeCtx(S), label = selected?.label || t('genres.all');
  const filter = (row, game) => taxonomy.matches(game, id);
  const rows = store => S.today.rows.kr[store].slice(0, 200).filter(row => filter(row, S.gameOf(store, row)));
  const ios = rows('ios'), android = rows('android');
  const tabs = kind => taxonomy.categories.filter(c => c.kind === kind).map(c => `<a href="${href(c.id)}"${id === c.id ? ' class="active" aria-current="page"' : ''}>${c.label}</a>`).join('');
  const classification = `<div class="rk-genre-filters"><div class="rk-genre-filter-row"><span>${t('genres.genre')}</span><nav class="rk-tabs rk-hscroll" aria-label="${t('genres.main_genres')}"><a href="${href('all')}"${id === 'all' ? ' class="active" aria-current="page"' : ''}>${t('genres.all')}</a>${tabs('genre')}</nav>${HSCROLL_SCRIPT}</div><div class="rk-genre-filter-row"><span>${t('genres.theme_style')}</span><nav class="rk-tabs rk-hscroll" aria-label="${t('genres.manually_classified_tags')}">${tabs('tag')}</nav>${HSCROLL_SCRIPT}</div></div>`;
  const column = (store, title, css, count) => `<div class="rk-col ${css}"><div class="rk-colh"><h2>${title}</h2><small>${t('genres.in_the_revenue_top_200', { count })}</small></div>${storeList(S, C, 'kr', store, 'grossing', { filter, withinCategory: true, podium: true })}</div>`;
  const monthly = S.monthStats(S.latestMonth, 'kr');
  const monthlyRows = (monthly?.list || []).filter(a => taxonomy.matches(a.game, id)).slice(0, 10);
  const mean = values => { const valid = values.filter(Number.isFinite); return valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '-'; };
  const monthlyCard = `<div class="rk-card"><h2>${t('genres.monthly_top_10', { latestMonth: formatYearMonth(S.latestMonth), label })} <small>${t('genres.monthly_combined_basis')}</small></h2><div class="rk-scroll"><table class="rk-table rk-mh-4 rk-mh-5"><thead><tr><th class="rank">${t('genres.in_category')}</th><th>${t('est.game')}</th><th class="c">${t('genres.combined')}</th><th class="c">${t('genres.app_store_average')}</th><th class="c">${t('genres.google_play_average')}</th></tr></thead><tbody>${monthlyRows.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, a.store)}</td><td class="c">${t('genres.rank_number', { rank: a.rank })}</td><td class="c">${mean(a.ios)}</td><td class="c">${mean(a.android)}</td></tr>`).join('') || t('genres.there_are_no_monthly_ranking')}</tbody></table></div></div>`;
  const body = `<section class="section active" id="rankings">${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}<div class="page-container rk rk-genres"><div class="rk-head"><h1>${id === 'all' ? t('genres.game_revenue_rankings_by_genre') : `${t('genres.game_revenue_rankings', { label })}`}</h1></div>${subnav(S, 'genres')}${classification}<input type="radio" name="rk-store" id="rk-st-and" class="rk-control" checked><input type="radio" name="rk-store" id="rk-st-ios" class="rk-control"><div class="rk-storeseg"><label for="rk-st-and">${t('stats.google_play')}</label><label for="rk-st-ios">${t('stats.app_store')}</label></div><div class="rk-cols">${column('android', t('stats.google_play'), 'and', android.length)}${column('ios', t('stats.app_store'), 'ios', ios.length)}</div>${monthlyCard}</div></section>`;
  return wrapWithLayout(body, {
    currentPage: 'rankings', title: `${t('genres.mobile_game_revenue_rankings_top', { p0: id === 'all' ? t('genres.by_genre') : label, p1: Math.max(ios.length, android.length), date: formatDay(S.today.date) })}`,
    description: `${t('genres.rankings_of_games_in_the', { date: formatDay(S.today.date), label, p2: Math.max(ios.length, android.length), p3: android[0] ? `${t('genres.google_play_1', { p0: S.nameOf('android', android[0]) })}` : '', p4: ios[0] ? `${t('genres.app_store_1', { p0: S.nameOf('ios', ios[0]) })}` : '', latestMonth: formatYearMonth(S.latestMonth) })}`,
    canonical: `https://gamerscroll.com${href(id)}`,
    noindex: !ios.length && !android.length && !monthlyRows.length,
    breadcrumbs: [{ name: t('about.home'), url: 'https://gamerscroll.com/' }, { name: t('layout.rankings_by_genre'), url: 'https://gamerscroll.com/rankings/genres/' }, ...(selected ? [{ name: label, url: `https://gamerscroll.com${href(id)}` }] : [])],
  });
}
module.exports = { renderGenre };
