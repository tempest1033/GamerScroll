'use strict';

/**
 * Static reference cards from the revenue estimate bundle (src/build/service-exports.js), built with the other static pages:
 *   renderBandTable(country)  rank hub (/rankings/, /rankings/<cc>/): daily revenue by fine rank band × market (bands.json)
 *   renderGenreCurves(id)     genre pages (/rankings/genres/[<id>/]): decay and launch curves by market × store (genres.json)
 * Both return '' when there is no verified bundle. Same controls and styles as the game page section (.rv, 81-game-revenue.css).
 */
const { t, formatDay, formatNumber, currentEdition } = require('../../i18n');
const C = require('./revenue-charts');
const { loadServiceExports, MARKETS } = require('../../build/service-exports');

const MARKET_KEYS = { kr: 'stats.korea', jp: 'stats.japan', us: 'stats.united_states', tw: 'stats.taiwan', cn: 'stats.china' };
const STORE_KEYS = { ios: 'stats.app_store', android: 'stats.google_play' };
const MARKET_ID = { kr: 'rv-m-kr', jp: 'rv-m-jp', us: 'rv-m-us', tw: 'rv-m-tw', cn: 'rv-m-cn' };
const MARKET_PANEL = { kr: 'rv-mp-kr', jp: 'rv-mp-jp', us: 'rv-mp-us', tw: 'rv-mp-tw', cn: 'rv-mp-cn' };
const MARKET_TAB = { kr: 'rv-tab-kr', jp: 'rv-tab-jp', us: 'rv-tab-us', tw: 'rv-tab-tw', cn: 'rv-tab-cn' };
const VIEW = { ios: { id: 'rv-s-ios', cls: 'rv-x-ios', tab: 'rv-st-ios' }, android: { id: 'rv-s-and', cls: 'rv-x-and', tab: 'rv-st-and' } };
const CURVE_CLASS = { ios: 'rv-c-ios', android: 'rv-c-and' };
// bands.json cells carry the currency; fallback per market.
const MARKET_CURRENCY = { kr: 'KRW', jp: 'JPY', us: 'USD', tw: 'TWD', cn: 'CNY' };
const marketName = (m) => t(MARKET_KEYS[m]);
const ordered = (home, present) => [home, ...MARKETS.filter((m) => m !== home)].filter((m) => present.has(m));
const card = (cls, title, asof, body) => `<section class="rk-card rv-ref-card ${cls}"><h2>${title} <span class="rv-beta">${t('rev.beta')}</span></h2><p class="rv-asof">${t('rev.asof', { date: formatDay(asof) })}</p>${body}</section>`;

function renderBandTable(home) {
  const svc = loadServiceExports();
  if (!svc || !svc.bands.length) return '';
  const markets = ordered(home, new Set(svc.bands.map((b) => b.market)));
  const stores = ['ios', 'android'].filter((s) => svc.bands.some((b) => b.store === s));
  const key = (b) => `${b.lo}-${b.hi}`;
  const cell = new Map(svc.bands.map((b) => [`${b.market}|${b.store}|${key(b)}`, b]));
  const ranges = [...new Map(svc.bands.map((b) => [key(b), b])).values()].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  // USD per local unit from the band's own USD median (bands.json day_usd_q50).
  const curOf = (m) => { const b = svc.bands.find((x) => x.market === m && x.usd); return { c: (svc.bands.find((x) => x.market === m && x.currency) || {}).currency || MARKET_CURRENCY[m], fx: b ? b.usd : null }; };
  const usd = markets.some((m) => C.hasUsd(curOf(m)));
  const bandLabel = (b) => (b.lo === b.hi ? C.rankText(b.lo) : `${C.rankText(b.lo)}–${C.rankText(b.hi)}`);
  const table = (store) => {
    const rows = ranges.filter((r) => markets.some((m) => cell.has(`${m}|${store}|${key(r)}`))).map((r) => `<tr><th scope="row">${bandLabel(r)}</th>${markets.map((m) => {
      const b = cell.get(`${m}|${store}|${key(r)}`);
      if (!b) return '<td class="r">-</td>';
      if (!b.day) return `<td class="r"><small>${t('rev.bands_hidden')}</small></td>`;
      const cur = curOf(m);
      return `<td class="r"${C.hasUsd(cur) ? ` data-fx="${cur.fx}"` : ''}><b>${C.moneyHtml(b.day[1], cur)}</b><small>${C.rangeHtml(b.day[0], b.day[2], cur)}</small>${Number.isFinite(b.coverage) ? `<small>${t('rev.coverage', { pct: C.percent(b.coverage) })}</small>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    const classes = `rv-x ${VIEW[store].cls}${stores.length === 1 ? ' rv-x-all' : ''}`;
    return `<div class="${classes}"><div class="rv-scroll"><table class="rk-table rv-table rv-ref-table"><thead><tr><th>${t('rev.col_band')}</th>${markets.map((m) => `<th class="r">${marketName(m)} <small>${curOf(m).c}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  const inputs = stores.map((s, i) => `<input type="radio" name="rv-s" id="${VIEW[s].id}" class="rv-ctl"${i === 0 ? ' checked' : ''} aria-label="${C.esc(t(STORE_KEYS[s]))}">`).join('') + (usd ? '<input type="checkbox" id="rv-usd" class="rv-ctl">' : '');
  const seg = stores.length > 1 ? `<div class="rv-seg rv-stores" role="group" aria-label="${t('rev.store_aria')}">${stores.map((s) => `<label for="${VIEW[s].id}" class="${VIEW[s].tab}">${t(STORE_KEYS[s])}</label>`).join('')}</div>` : '';
  const usdSwitch = usd ? `<label for="rv-usd" class="rv-usd-switch"><i></i>${t('rev.usd')}</label>` : '';
  const body = `<p class="rk-lead">${t('rev.bands_lead')}</p><div class="rv"${usd ? ` data-intl="${currentEdition().intl}"` : ''}>${inputs}${usd ? C.USD_SCRIPT : ''}<div class="rv-body"><div class="rv-bar"><div></div><div class="rv-bar-r">${seg}${usdSwitch}</div></div>${stores.map(table).join('')}<p class="rv-small">${t('rev.bands_note')}</p></div></div>`;
  return card('rv-bands', t('rev.bands_title'), svc.asof, body);
}

// Site genre ids (data/game-classifications.json) → store subgenres of the bundle (the store genre is 'Games' for nearly
// all games, so curves are keyed by subgenre). Tags (idle, subculture, lineage-like) have no store counterpart.
const SITE_SUBGENRES = { rpg: ['Role Playing'], 'casual-puzzle': ['Casual', 'Puzzle'], 'strategy-defense': ['Strategy'], 'sports-racing': ['Sports', 'Racing'], 'action-shooting': ['Action'], 'card-board': ['Card', 'Board'], simulation: ['Simulation'] };
// Per market and store; decay curves of the whole history (cohort 'all', the one game pages reference).
const isListed = (c) => MARKETS.includes(c.market) && STORE_KEYS[c.store] && (c.kind === 'launch' || c.cohort === 'all');
const curvesOf = (svc, id) => [...svc.curves.values()].filter((c) => isListed(c) && (SITE_SUBGENRES[id] || []).includes(c.genre));

function decaySentences(curves, svc) {
  const lines = curves.filter((c) => c.kind === 'decay' && c.md > 0).map((c) => `<p class="rv-mid"><span class="rv-eyebrow">${t(STORE_KEYS[c.store])}</span>${t('rev.decay_sentence', { genre: C.esc(C.subgenreName(c.genre)), pct: Math.round(c.md * 100), n: formatNumber(c.n) })}</p>`);
  const b = svc.basis;
  return lines.length ? lines.join('') + (b.y && b.m && b.f ? `<p class="rv-small">${t('rev.decay_note', { year: b.y, months: b.m, floor: b.f })}</p>` : '') : '';
}

function curveFigure(curves, kind, genre, market) {
  const list = curves.filter((c) => c.kind === kind);
  if (!list.length) return '';
  const title = t(kind === 'decay' ? 'rev.decay_chart' : 'rev.launch_chart');
  const unit = kind === 'decay' ? (n) => t('rev.x_months', { n }) : (n) => t('rev.x_days', { n });
  const legend = C.legend(list.map((c) => [`rv-sw-curve ${CURVE_CLASS[c.store]}`, `${t(STORE_KEYS[c.store])} · ${t('rev.n_small', { n: formatNumber(c.n) })}`]));
  return `<figure class="rv-fig"><figcaption><b>${title}</b><span>${C.esc(genre)} · ${marketName(market)}</span></figcaption>${C.curveChart({ series: list.map((c) => ({ cls: CURVE_CLASS[c.store], points: c.points })), unit: list[0].unit, xLabel: unit, aria: t('rev.curve_aria', { genre, n: Math.max(...list.map((c) => c.n)) }) })}${legend}</figure>`;
}

// Genre page: per market, each store subgenre of the site genre (e.g. Card and Board) with its sentence(s) and charts.
function genreCurvesCard(svc, id, home) {
  const curves = curvesOf(svc, id);
  if (!curves.length) return '';
  const markets = ordered(home, new Set(curves.map((c) => c.market)));
  const panels = markets.map((m) => `<div class="rv-mp ${MARKET_PANEL[m]}">${SITE_SUBGENRES[id].map((sg) => {
    const list = curves.filter((c) => c.market === m && c.genre === sg);
    if (!list.length) return '';
    const genre = C.subgenreName(sg);
    const figs = [curveFigure(list, 'decay', genre, m), curveFigure(list, 'launch', genre, m)].filter(Boolean);
    return `<div class="rv-sub">${decaySentences(list, svc)}<div class="rv-figs${figs.length > 1 ? ' rv-figs2' : ''}">${figs.join('')}</div></div>`;
  }).join('')}</div>`).join('');
  const inputs = markets.map((m, i) => `<input type="radio" name="rv-m" id="${MARKET_ID[m]}" class="rv-ctl"${i === 0 ? ' checked' : ''} aria-label="${C.esc(marketName(m))}">`).join('');
  const tabs = `<div class="rv-tabs" role="group" aria-label="${t('rev.market_aria')}">${markets.map((m) => `<label for="${MARKET_ID[m]}" class="${MARKET_TAB[m]}">${marketName(m)}</label>`).join('')}</div>`;
  return card('rv-curves', t('rev.curves_title'), svc.asof, `<div class="rv">${inputs}<div class="rv-body"><div class="rv-bar">${tabs}</div>${panels}</div></div>`);
}

// All-genres page: monthly decline of every store subgenre by market and store (links to the matching site genre page).
function genreDecayTable(svc, home) {
  const decay = [...svc.curves.values()].filter((c) => c.kind === 'decay' && c.md != null && isListed(c));
  if (!decay.length) return '';
  const markets = ordered(home, new Set(decay.map((c) => c.market)));
  const siteOf = new Map(Object.entries(SITE_SUBGENRES).flatMap(([id, list]) => list.map((sg) => [sg, id])));
  const mapped = Object.values(SITE_SUBGENRES).flat();
  const rank = (k) => (k === 'all' ? -1 : mapped.includes(k) ? mapped.indexOf(k) : 999);
  const keys = [...new Set(decay.map((c) => c.genre))].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
  const rows = keys.flatMap((k) => ['ios', 'android'].filter((s) => decay.some((c) => c.genre === k && c.store === s)).map((s, i) => {
    const name = siteOf.has(k) ? `<a href="/rankings/genres/${siteOf.get(k)}/">${C.esc(C.subgenreName(k))}</a>` : C.esc(C.subgenreName(k));
    return `<tr><th scope="row">${i === 0 ? name : ''}</th><td>${t(STORE_KEYS[s])}</td>${markets.map((m) => {
      const c = decay.find((x) => x.genre === k && x.store === s && x.market === m);
      return c ? `<td class="r"><b>${C.percent(c.md)}</b><small>${t('rev.n_small', { n: formatNumber(c.n) })}</small></td>` : '<td class="r">-</td>';
    }).join('')}</tr>`;
  })).join('');
  const b = svc.basis;
  return card('rv-curves', t('rev.curves_title'), svc.asof, `<div class="rv"><div class="rv-scroll"><table class="rk-table rv-table rv-ref-table"><thead><tr><th>${t('rev.col_genre')}</th><th>${t('rev.store_aria')}</th>${markets.map((m) => `<th class="r">${marketName(m)} <small>${t('rev.col_decay')}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${b.y && b.m && b.f ? `<p class="rv-small">${t('rev.decay_note', { year: b.y, months: b.m, floor: b.f })}</p>` : ''}</div>`);
}

function renderGenreCurves(id, home) {
  const svc = loadServiceExports();
  if (!svc) return '';
  return id === 'all' ? genreDecayTable(svc, home) : genreCurvesCard(svc, id, home);
}

module.exports = { renderBandTable, renderGenreCurves };
