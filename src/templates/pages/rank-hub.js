'use strict';
const { t: tt, formatDay, formatMonthDay, formatYearMonth } = require('../../i18n');
/**
 * 순위 허브 페이지 템플릿 (정적 HTML)
 *   /rankings/                 실시간 매출 순위 (한국) · /rankings/{jp,us,cn,tw}/ 국가별
 *   /rankings/monthly/YYYY-MM/ 월간 통합 순위
 *   /rankings/global/          5개국 합산 글로벌 종합
 *   /rankings/records/         역대 기록
 *   게임 페이지용 순위 요약 카드 (renderGameRankSummary)
 * 순위 표·요약문을 빌드 시 HTML 에 넣어 검색엔진이 그대로 읽게 한다. 스타일은 src/styles/60-rank-chart.css (.rk-*).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { resizeIcon } = require('../../utils/resize-icon');
const { loadRankStats, COUNTRIES, STORES, util } = require('../../rank/stats');
const { publisherMark } = require('../components/publisher-mark');

const siteBaseUrl = 'https://gamerscroll.com';
const { nums, min, avg, std, fmt1, esc, tsText } = util;

// ---------- 공용 렌더 조각 ----------
const trendColor = (arr) => { const v = nums(arr); if (v.length < 2) return 'var(--rk-dim)'; const d = v[0] - v[v.length - 1]; return d > 0 ? 'var(--rk-up)' : d < 0 ? 'var(--rk-down)' : 'var(--rk-dim)'; };
function sparkline(arr, { w = 72, h = 22, color = 'var(--rk-text)', cap = 100 } = {}) {
  const v = arr.map((x) => (x == null || x > cap ? null : x));
  const present = nums(v);
  if (present.length < 2) return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><text x="0" y="15" font-size="10" fill="var(--rk-dim)">-</text></svg>`;
  const lo = Math.min(...present), hi = Math.max(...present);
  const y = (r) => (hi === lo ? h / 2 : 2 + ((r - lo) / (hi - lo)) * (h - 4));
  const x = (i) => (i / (v.length - 1)) * (w - 2) + 1;
  let d = ''; let open = false;
  v.forEach((r, i) => { if (r == null) { open = false; return; } d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r).toFixed(1) + ' '; open = true; });
  const last = v[v.length - 1];
  return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.25" stroke-linejoin="round" opacity=".8"/>${last != null ? `<circle cx="${x(v.length - 1)}" cy="${y(last)}" r="2" fill="${color}"/>` : ''}</svg>`;
}
function chg(rank, prev) {
  if (prev == null) return '<span class="rk-chg new">NEW</span>';
  const d = prev - rank;
  if (d > 0) return `<span class="rk-chg up">▲${d}</span>`;
  if (d < 0) return `<span class="rk-chg down">▼${-d}</span>`;
  return '<span class="rk-chg same">=</span>';
}
const dirText = (rank, prev) => (prev == null || rank == null ? '' : prev - rank > 0 ? `▲${prev - rank}` : prev - rank < 0 ? `▼${rank - prev}` : '=');

function makeCtx(S) {
  const iconOf = (r, g) => { const src = (r && r.icon) || (g && g.icon) || ''; return src ? resizeIcon(src) : ''; };
  const hrefOf = (g) => (g && g.slug ? `/games/${g.slug}/` : null);
  const nameLink = (s, r, cls = '') => { const g = S.gameOf(s, r); const name = esc(S.nameOf(s, r)); const href = hrefOf(g); return href ? `<a class="${cls}" data-name href="${href}">${name}</a>` : `<span class="${cls}" data-name>${name}</span>`; };
  const appCell = (r, s, extra = '') => { const g = S.gameOf(s, r); return `<div class="rk-app"><img src="${esc(iconOf(r, g))}" alt="" loading="lazy" decoding="async"><div><div class="t">${nameLink(s, r)}${extra}</div><div class="d" data-name>${esc(r.developer || (g && g.developer) || '')}</div></div></div>`; };
  const tick = (label, r, s, val, g) => (r ? `<a href="${hrefOf(g || S.gameOf(s, r)) || '#rk-list'}"><span class="tl">${label}</span><img src="${esc(iconOf(r, g || S.gameOf(s, r)))}" alt="" loading="lazy"><span class="tn" data-name>${esc(S.nameOf(s, r))}</span>${val}</a>` : `<a><span class="tl">${label}</span><span class="tn dim">-</span></a>`);
  return { iconOf, hrefOf, nameLink, appCell, tick };
}

// 한국 매출 순위는 /rankings/, 다른 국가는 /rankings/{cc}/. 홈(/)은 별도 요약 페이지(home.js).
// Each edition's home country (en→us, ja→jp, zh-cn→cn, ko→kr, zh-tw→tw) owns /rankings/; the others stay on /rankings/{cc}/ (kr included).
const homeCountry = () => require('../../i18n').currentEdition().country;
const countryHref = (c, chart = 'grossing') => (chart === 'free' ? (c === homeCountry() ? '/rankings/free/' : `/rankings/free/${c}/`) : (c === homeCountry() ? '/rankings/' : `/rankings/${c}/`));
// Home country first, then the rest in the fixed order.
const orderedCountries = () => Object.keys(COUNTRIES).sort((a, b) => (b === homeCountry()) - (a === homeCountry()));
// 한 줄 가로 스크롤 메뉴(.rk-hscroll) 바로 뒤에 붙이는 스크립트: 선택한 항목이 가려져 있을 때만 필요한 만큼 스크롤하고,
// 양 끝 도달 여부(rk-scroll-start / rk-scroll-end)로 가장자리 흐림을 켜고 끈다.
const HSCROLL_SCRIPT = `<script>(function(){var n=document.currentScript.previousElementSibling,a=n.querySelector('.active');function e(){n.classList.toggle('rk-scroll-start',n.scrollLeft<=2);n.classList.toggle('rk-scroll-end',n.scrollLeft+n.clientWidth>=n.scrollWidth-2);}var r=a?a.offsetLeft+a.offsetWidth-n.clientWidth+40:0;if(r>0)n.scrollLeft=r;e();n.addEventListener('scroll',e,{passive:true});window.addEventListener('resize',e);})();</script>`;
// 순위 종류: 한 줄 칩 메뉴.
// '산출 방법'은 순위 종류가 아니라 설명 페이지라 메뉴에서 뺐다 (2026-09-28). 푸터·사이트 소개에서 연결된다.
function subnav(S, active) {
  const item = (id, href, label) => `<a class="${active === id ? 'active' : ''}"${active === id ? ' aria-current="page"' : ''} href="${href}">${label}</a>`;
  return `<nav class="rk-subnav rk-kinds rk-hscroll" aria-label="${tt('rank.ranking_types')}">${item('rank', '/rankings/', tt('est.revenue'))}${item('free', '/rankings/free/', tt('layout.popular_free'))}${item('genres', '/rankings/genres/', tt('layout.rankings_by_genre'))}${item('monthly', `/rankings/monthly/${S.latestMonth}/`, tt('rank.monthly'))}${item('global', '/rankings/global/', tt('layout.global'))}${item('records', '/rankings/records/', tt('layout.annual_records'))}${item('pub', '/rankings/publishers/', tt('layout.publishers'))}</nav>
${HSCROLL_SCRIPT}`;
}
// 개발사 이름 정규화 (스토어·games.json 표기 차이 흡수): 법인 접미어 제거, 기호 제거, 소문자
const pubKey = (name) => String(name || '').toLowerCase().replace(/\b(corp|corporation|co|ltd|inc|pte|limited|company|llc|gmbh|sa|ag)\b\.?/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const pubSlug = (name) => String(name || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase();
// 오늘 한국 두 스토어 TOP 200 을 개발사별로 묶는다
function publisherIndex(S, country = 'kr') {
  const { today, yday, rankOf } = S;
  const map = new Map();
  for (const s of Object.keys(STORES)) (today.rows[country][s] || []).forEach((r, i) => {
    if (!r || !r.appId) return;
    const g = S.gameOf(s, r);
    const raw = (g && g.developer) || r.developer || '';
    const key = pubKey(raw);
    if (!key) return;
    let p = map.get(key);
    if (!p) { p = { key, names: new Map(), games: new Map(), pts: 0, best: 999, top10: 0 }; map.set(key, p); }
    p.names.set(raw, (p.names.get(raw) || 0) + (g && g.developer === raw ? 2 : 1));
    const gk = S.keyOf(s, r);
    let e = p.games.get(gk);
    if (!e) { e = { key: gk, row: r, store: s, g, ranks: {}, prev: {} }; p.games.set(gk, e); }
    if (r.icon && !e.row.icon) e.row = r;
    e.ranks[s] = i + 1; e.prev[s] = rankOf(yday, country, s, r.appId);
    p.pts += 200 - i; p.best = Math.min(p.best, i + 1); if (i < 10) p.top10++;
  });
  const list = [...map.values()].map((p) => {
    p.name = [...p.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    p.slug = pubSlug(p.name);
    p.gameList = [...p.games.values()].sort((a, b) => Math.min(a.ranks.ios || 999, a.ranks.android || 999) - Math.min(b.ranks.ios || 999, b.ranks.android || 999));
    return p;
  }).filter((p) => p.slug).sort((a, b) => b.pts - a.pts);
  // 슬러그 충돌 시 뒤쪽에 번호
  const seen = new Map();
  for (const p of list) { const n = seen.get(p.slug) || 0; seen.set(p.slug, n + 1); if (n) p.slug = `${p.slug}-${n + 1}`; }
  list.forEach((p, i) => (p.rank = i + 1));
  return list;
}
const countryTabs = (active, chart = 'grossing') => `<div class="rk-tabs rk-country-tabs" role="navigation" aria-label="${tt('rank.country')}">${orderedCountries().map((c) => `<a class="${c === active ? 'active' : ''}" href="${countryHref(c, chart)}">${COUNTRIES[c]}</a>`).join('')}</div>`;

// 두 스토어 리스트 한 열 (매출/인기 공용). 최대 200위까지 접지 않고 표시한다.
function storeList(S, C, country, s, chart = 'grossing', { filter = null, limit = 200, preview = null, withinCategory = false, defaultKey = null, listClass = '', podium = false } = {}) {
  const { today, yday, days } = S;
  const isFree = chart === 'free';
  const rows = (isFree ? today.rowsFree : today.rows)[country][s] || [];
  const rk = isFree ? S.freeRankOf : S.rankOf;
  const items = rows.slice(0, limit).map((r, i) => ({ r, i })).filter(({ r }) => r && (!filter || filter(r, S.gameOf(s, r))));
  const li = ({ r, i }, categoryIndex) => {
    const rank = i + 1; const prev = rk(yday, country, s, r.appId);
    const week = days.slice(-7).map((d) => rk(d, country, s, r.appId));
    let extra = '';
    if (!isFree) {
      const streak = rank === 1 ? S.streakAtOne(country, s, r.appId) : 0;
      const seen = S.firstSeen(country, s, r.appId);
      const isNew30 = seen && days.length > 30 && (new Date(today.date) - new Date(seen)) / 864e5 <= 30;
      extra = (streak > 1 ? `<span class="rk-streak">${tt('rank.1_for_days_2', { streak })}</span>` : '') + (isNew30 ? tt('rank.new_2') : '');
    }
    const g = S.gameOf(s, r);
    const key = preview ? preview(r, rank, g) : null;
    const name = preview ? `<button type="button" data-name data-rk-preview="${esc(key)}"${defaultKey != null && key === defaultKey ? ' data-rk-default' : ''} aria-controls="rk-home-preview" aria-pressed="false">${esc(S.nameOf(s, r))}</button>` : C.nameLink(s, r);
    const detail = preview ? ` · <a href="${C.hrefOf(g) || countryHref(country)}">${tt('home.details')}</a>` : '';
    const displayRank = withinCategory ? categoryIndex + 1 : rank;
    return `<li${podium && displayRank <= 3 ? ` class="rk-pod rk-pod${displayRank}"` : ''}><span class="rk-rk ${displayRank <= 3 ? 'top' : ''}">${displayRank}</span><img src="${esc(C.iconOf(r, g))}" alt="" loading="lazy" decoding="async"><div class="nm">${name}<span class="dv">${withinCategory ? `<span class="rk-genre-overall">${tt('rank.overall_2', { rank })}</span> · ` : ''}<span data-name>${esc(r.developer || (g && g.developer) || '')}</span>${extra}${detail}</span></div><div class="rt">${chg(rank, prev)}</div>${sparkline(week, { color: trendColor(week) })}</li>`;
  };
  return `<ol class="rk-list${podium ? ' rk-pods' : ''}${listClass ? ` ${esc(listClass)}` : ''}">${items.map(li).join('') || tt('rank.no_matching_games')}</ol>`;
}
const storeCols = (S, C, country, chart, opts, stores) => {
  const hasAnd = stores.includes('android');
  const limit = opts && opts.limit ? opts.limit : 200;
  const colH = (s, n) => `<div class="rk-colh"><h2>${STORES[s]}</h2><small>${tt('rank.top_vs_previous_day', { p0: chart === 'free' ? tt('layout.popular_free') : tt('est.revenue'), n })}</small></div>`;
  return `${hasAnd ? tt('rank.google_play_app_store') : ''}
<div class="rk-cols${hasAnd ? '' : ' single'}" id="rk-list">${stores.map((s) => `<div class="rk-col ${s === 'ios' ? 'ios' : 'and'}">${colH(s, Math.min(limit, ((chart === 'free' ? S.today.rowsFree : S.today.rows)[country][s] || []).length))}${storeList(S, C, country, s, chart, opts)}</div>`).join('')}</div>`;
};

function shell(S, { body, title, description, canonical, crumbs, keywords }) {
  const content = `
    <section class="section active" id="rankings">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'rankings',
    title, description, keywords, canonical,
    breadcrumbs: [{ name: tt('about.home'), url: `${siteBaseUrl}/` }, { name: tt('rank.mobile_rankings'), url: `${siteBaseUrl}/rankings/` }, ...(crumbs || [])].filter((c, i, a) => a.findIndex((d) => d.url === c.url) === i),
  });
}

// ---------- 1. 실시간 순위 (국가별) ----------
function renderRankingsHub(country = homeCountry(), chart = 'grossing') {
  const S = loadRankStats();
  const { today, yday, rankOf } = S;
  const C = makeCtx(S);
  const cname = COUNTRIES[country];
  const isFree = chart === 'free';
  const rows = (s) => (isFree ? today.rowsFree : today.rows)[country][s] || [];
  const hasAnd = rows('android').length > 0;
  const stores = hasAnd ? ['android', 'ios'] : ['ios'];
  const rk = isFree ? S.freeRankOf : rankOf;
  const chartName = isFree ? tt('sidebar.popular') : tt('est.revenue');

  const ios = rows('ios'); const and = rows('android');
  const mvI = S.movers(country, 'ios', chart);
  const top1 = (s) => { const r = rows(s)[0]; if (!r) return ''; const v = isFree ? chg(1, rk(yday, country, s, r.appId)) : `<span class="rk-chg same">${tt('rank.days_9', { p0: S.streakAtOne(country, s, r.appId) })}</span>`; return C.tick(`${tt('rank.1_2', { p0: STORES[s] })}`, r, s, v); };
  const ticker = `<div class="rk-ticker">${hasAnd ? top1('android') : ''}${top1('ios')}${C.tick(tt('rank.rises'), mvI.up[0] && mvI.up[0].r, 'ios', mvI.up[0] ? `<span class="rk-chg up">▲${mvI.up[0].prev - mvI.up[0].rank}</span>` : '')}${C.tick(tt('rank.falls'), mvI.down[0] && mvI.down[0].r, 'ios', mvI.down[0] ? `<span class="rk-chg down">▼${mvI.down[0].rank - mvI.down[0].prev}</span>` : '')}${C.tick(tt('rank.new_entries'), mvI.fresh[0] && mvI.fresh[0].r, 'ios', '<span class="rk-chg new">NEW</span>')}${isFree ? '' : C.tick(tt('rank.all_time_best'), mvI.record[0] && mvI.record[0].r, 'ios', mvI.record[0] ? `<span class="rk-chg gold">${tt('rank.record_rank_star', { rank: mvI.record[0].rank })}</span>` : '')}</div>`;

  const mv = stores.map((s) => ({ s, m: S.movers(country, s, chart) }));
  const pickMv = (kind, score) => mv.map(({ s, m }) => ({ s, x: m[kind][0] })).filter((o) => o.x).sort((a, b) => score(b.x) - score(a.x))[0];
  const hlCard = (label, o, val) => { if (!o) return ''; const g = S.gameOf(o.s, o.x.r); const href = C.hrefOf(g); const tag = href ? 'a' : 'div';
    return `<${tag} class="rk-hl-card"${href ? ` href="${href}"` : ''}><img src="${esc(C.iconOf(o.x.r, g))}" alt="" loading="lazy" decoding="async"><div class="tx"><span class="lb">${label} · ${STORES[o.s]}</span><span class="nm" data-name>${esc(S.nameOf(o.s, o.x.r))}</span></div><div class="vl">${val(o.x)}</div></${tag}>`; };
  const upO = pickMv('up', (x) => x.prev - x.rank), frO = pickMv('fresh', (x) => -x.rank), rcO = isFree ? null : pickMv('record', (x) => -x.rank);
  const highlights = [hlCard(tt('rank.rises'), upO, (x) => `<b>${x.prev} → ${x.rank}</b><span class="rk-chg up">▲${x.prev - x.rank}</span>`),
    hlCard(tt('rank.new_entries'), frO, (x) => `<b>${x.rank}</b><span class="rk-chg new">NEW</span>`),
    hlCard(tt('rank.all_time_best'), rcO, (x) => `<b>${x.rank}</b>${chg(x.rank, x.prev)}`)].filter(Boolean).join('');
  const hl = highlights ? `<div class="rk-hl">${highlights}</div>` : '';
  const top3 = ios.slice(0, 3).map((r) => S.nameOf('ios', r));
  const lead = `${tt('rank.app_store_1_2_3', { cname, chartName, p2: top3[0] || '-', p3: top3[1] || '-', p4: top3[2] || '-', p5: hasAnd && and[0] ? `${tt('genres.google_play_1', { p0: S.nameOf('android', and[0]) })}` : '', p6: tsText(today.ts) })}`;
  const cols = storeCols(S, C, country, chart, { podium: true }, stores);

  if (isFree) {
    const links = `<div class="rk-card"><h2>${tt('rank.related_rankings')}</h2><div class="rk-links"><a href="${countryHref(country)}">${tt('rank.revenue_rankings', { cname })} <span>${tt('rank.app_store_and_google_play')}</span></a><a href="/rankings/subculture/">${tt('rank.subculture_game_rankings')} <span>${tt('rank.collectible_anime_style_and_anime')}</span></a><a href="/rankings/monthly/${S.latestMonth}/">${tt('rank.monthly_revenue_rankings', { latestMonth: formatYearMonth(S.latestMonth) })} <span>${tt('rank.combined_ranking_based_on_the')}</span></a></div></div>`;
    // 화면 h1은 '모바일'을 뺀다 — 상단 탭이 이미 '모바일'이라 중복 (2026-09-09). <title>·메타·키워드는 검색 유입용으로 유지.
    const body = `<div class="rk-head"><h1>${tt('rank.game_popularity_rankings', { cname })}</h1></div>
${subnav(S, 'free')}
<div class="rk-toolbar">${countryTabs(country, 'free')}</div>
${hl}
${cols}
${links}`;
    const canonical = `${siteBaseUrl}${countryHref(country, 'free')}`;
    return shell(S, {
      body,
      title: `${tt('rank.mobile_game_popularity_rankings_top', { p0: country === homeCountry() ? '' : `${cname} `, date: formatDay(today.date) })}`,
      description: lead,
      keywords: `${tt('rank.mobile_game_popularity_rankings_app', { cname })}`,
      canonical,
      crumbs: [{ name: tt('layout.popular_free'), url: `${siteBaseUrl}/rankings/free/` }, ...(country === homeCountry() ? [] : [{ name: cname, url: canonical }])],
    });
  }

  const body = `<div class="rk-head"><h1>${country === homeCountry() ? tt('rank.game_revenue_rankings_4') : `${tt('rank.game_revenue_rankings_3', { cname })}`}</h1></div>
${subnav(S, 'rank')}
<div class="rk-toolbar">${countryTabs(country)}</div>
${hl}
${cols}`;
  const canonical = `${siteBaseUrl}${countryHref(country)}`;
  return shell(S, {
    body,
    // 2026-09-09 title 정책: 핵심 키워드 — 범위 (날짜) | 게이머스크롤, 60자 안팎. 한국은 국가명 생략.
    title: `${tt('rank.mobile_game_revenue_rankings_top_2', { p0: country === homeCountry() ? '' : `${cname} `, date: formatDay(today.date) })}`,
    description: lead,
    keywords: `${tt('rank.mobile_game_revenue_rankings_app', { cname })}`,
    canonical,
    crumbs: country === homeCountry() ? [] : [{ name: cname, url: canonical }],
  });
}

// ---------- 1b. 서브컬처 (한국 매출 차트에서 서브컬처 게임만) ----------
function renderSubculture(country = 'kr') {
  const S = loadRankStats();
  const { today, yday, days, rankOf } = S;
  const C = makeCtx(S);
  const cname = COUNTRIES[country];
  const filter = (r, g) => S.isSub(g);
  const rows = (s) => (today.rows[country][s] || []).map((r, i) => ({ r, rank: i + 1, g: S.gameOf(s, r) })).filter(({ g }) => S.isSub(g));
  const ios = rows('ios'); const and = rows('android');
  const hasAnd = (today.rows[country].android || []).length > 0;
  const stores = hasAnd ? ['android', 'ios'] : ['ios'];
  // 급등·급락 (서브컬처 안에서, 앱스토어)
  const withPrev = ios.map((x) => ({ ...x, prev: rankOf(yday, country, 'ios', x.r.appId) }));
  const up = withPrev.filter((x) => x.prev != null && x.prev - x.rank >= 3).sort((a, b) => (b.prev - b.rank) - (a.prev - a.rank))[0];
  const down = withPrev.filter((x) => x.prev != null && x.rank - x.prev >= 3).sort((a, b) => (b.rank - b.prev) - (a.rank - a.prev))[0];
  const fresh = withPrev.find((x) => x.prev == null);
  const t1 = (s, list) => (list[0] ? C.tick(`${tt('rank.subculture_1', { p0: STORES[s] })}`, list[0].r, s, `<span class="rk-chg same">${tt('rank.overall_2', { rank: list[0].rank })}</span>`, list[0].g) : '');
  const ticker = `<div class="rk-ticker">${hasAnd ? t1('android', and) : ''}${t1('ios', ios)}${C.tick(tt('rank.rises'), up && up.r, 'ios', up ? `<span class="rk-chg up">▲${up.prev - up.rank}</span>` : '')}${C.tick(tt('rank.falls'), down && down.r, 'ios', down ? `<span class="rk-chg down">▼${down.rank - down.prev}</span>` : '')}${C.tick(tt('rank.new_entries'), fresh && fresh.r, 'ios', '<span class="rk-chg new">NEW</span>')}</div>`;
  // TOP 100 안 서브컬처 게임 수 30일 추이
  const countSeries = days.slice(-30).map((d) => d.rows[country].ios.slice(0, 100).filter((r) => S.isSub(S.gameOf('ios', r))).length);
  const cur100 = countSeries[countSeries.length - 1] || 0;
  // 이달 서브컬처 월간 TOP 10
  const ms = S.monthStats(S.latestMonth, country);
  const mTop = ms ? ms.list.filter((a) => S.isSub(a.game)).slice(0, 10) : [];
  const [y, m] = S.latestMonth.split('-').map(Number);
  const monthCard = mTop.length ? `<div class="rk-card"><h2>${tt('rank.subculture_monthly_top_10', { y, m })} <small>${tt('rank.sum_of_daily_average_ranks')}</small></h2><table class="rk-table"><thead><tr><th class="rank">#</th><th>${tt('est.game')}</th><th class="c">${tt('rank.combined_ranking')}</th><th class="c">${tt('genres.app_store_average')}</th><th class="c">${tt('genres.google_play_average')}</th></tr></thead><tbody>${mTop.map((a, i) => `<tr><td class="rk-rank ${i < 3 ? 'top' : ''}">${i + 1}</td><td>${C.appCell(a.row, a.store)}</td><td class="c"><b>${tt('genres.rank_number', { rank: a.rank })}</b></td><td class="c">${fmt1(avg(a.ios))}</td><td class="c">${fmt1(avg(a.android))}</td></tr>`).join('')}</tbody></table><div class="rk-note"><a href="/rankings/monthly/${S.latestMonth}/">${tt('rank.view_full_monthly_ranking', { latestMonth: formatYearMonth(S.latestMonth) })}</a></div></div>` : '';
  const kpi = `<div class="rk-stats sub3">
<div class="rk-stat"><div class="l">${tt('rank.subculture_in_app_store_top')}</div><div class="v">${cur100}<small>${tt('rank.count_unit')}</small></div><div class="s">${tt('rank.30_day_trend')}</div>${sparkline(countSeries, { w: 100, h: 30, color: 'var(--rk-sub)', cap: 999 })}</div>
<div class="rk-stat"><div class="l">${tt('rank.in_app_store_top_200')}</div><div class="v">${ios.length}<small>${tt('rank.count_unit')}</small></div><div class="s">${tt('rank.best_rank', { p0: ios[0] ? ios[0].rank + tt('rank.rank_separator') + `<span data-name>${esc(S.nameOf('ios', ios[0].r))}</span>` : '-' })}</div></div>
<div class="rk-stat"><div class="l">${tt('rank.in_google_play_top_200')}</div><div class="v">${and.length}<small>${tt('rank.count_unit')}</small></div><div class="s">${tt('rank.best_rank', { p0: and[0] ? and[0].rank + tt('rank.rank_separator') + `<span data-name>${esc(S.nameOf('android', and[0].r))}</span>` : '-' })}</div></div>
</div>`;
  const lead = `${tt('rank.ranking_of_only_the_subculture', { cname, p1: ios[0] ? `${tt('rank.overall', { p0: S.nameOf('ios', ios[0].r), rank: ios[0].rank })}` : '-', cur100, p3: tsText(today.ts) })}`;
  const body = `<div class="rk-head"><h1>${tt('rank.subculture_game_revenue_rankings')}</h1></div>
${subnav(S, 'sub')}
${kpi}
${storeCols(S, C, country, 'grossing', { filter, podium: true }, stores)}
${monthCard}
<div class="rk-note">${tt('rank.the_subculture_classification_follows_the')}</div>`;
  const canonical = `${siteBaseUrl}/rankings/subculture/`;
  return shell(S, {
    body,
    title: `${tt('rank.subculture_game_revenue_rankings_korea', { date: formatDay(today.date) })}`,
    description: lead,
    keywords: tt('rank.subculture_game_rankings_subculture_game'),
    canonical,
    crumbs: [{ name: tt('rank.subculture'), url: canonical }],
  });
}

// ---------- 2. 월간 통합 ----------
function renderMonthly(month, country = 'kr') {
  const S = loadRankStats();
  const C = makeCtx(S);
  const cur = S.monthStats(month, country);
  if (!cur) return null;
  const [y, m] = month.split('-').map(Number);
  const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const prev = S.monthStats(prevMonth, country);
  const prevRank = new Map((prev ? prev.list : []).map((a) => [a.key, a.rank]));
  const nameA = (a) => esc(S.nameOf(a.store, a.row));
  const nameSpan = (a) => `<span data-name>${nameA(a)}</span>`;
  const withPrev = cur.list.filter((a) => prevRank.has(a.key));
  const riser = withPrev.filter((a) => a.rank <= 100).sort((a, b) => (prevRank.get(b.key) - b.rank) - (prevRank.get(a.key) - a.rank)).slice(0, 3);
  const faller = withPrev.filter((a) => prevRank.get(a.key) <= 100).sort((a, b) => (b.rank - prevRank.get(b.key)) - (a.rank - prevRank.get(a.key))).slice(0, 3);
  const entrants = cur.list.filter((a) => a.rank <= 100 && !prevRank.has(a.key)).slice(0, 3);
  const ones = cur.list.filter((a) => a.ones > 0).sort((a, b) => b.ones - a.ones).slice(0, 3);
  const tk = (label, a, val) => C.tick(label, a && a.row, a && a.store, a ? val(a) : '', a && a.game);
  const ticker = `<div class="rk-ticker">${tk(tt('rank.biggest_gains_this_month'), riser[0], (a) => `<span class="rk-chg up">▲${prevRank.get(a.key) - a.rank}</span>`)}${tk(tt('rank.biggest_drops_this_month'), faller[0], (a) => `<span class="rk-chg down">▼${a.rank - prevRank.get(a.key)}</span>`)}${tk(tt('rank.new_entries'), entrants[0], () => '<span class="rk-chg new">NEW</span>')}${tk(tt('rank.days_at_1'), ones[0], (a) => `<span class="rk-chg same">${tt('rank.days_8', { ones: a.ones })}</span>`)}</div>`;

  const monthList = `<ol class="rk-list wide">${cur.list.slice(0, 100).map((a) => {
    const p = prevRank.get(a.key); const trend = S.monthlyAvg(country, a.row.appId, a.store); const g = a.game;
    return `<li><span class="rk-rk ${a.rank <= 3 ? 'top' : ''}">${a.rank}</span><img src="${esc(C.iconOf(a.row, g))}" alt="" loading="lazy" decoding="async"><div class="nm">${C.nameLink(a.store, a.row)}<span class="dv"><span data-name>${esc(a.row.developer || (g && g.developer) || '')}</span>${a.ones ? `<span class="rk-streak">${tt('rank.1_for_days', { ones: a.ones })}</span>` : ''}</span></div><span class="num"><b>${fmt1(avg(a.android))}</b><i>${tt('genres.google_play_average')}</i></span><span class="num"><b>${fmt1(avg(a.ios))}</b><i>${tt('genres.app_store_average')}</i></span><div class="rt">${chg(a.rank, p)}<span class="sub">${p ? `${tt('rank.prev_month_3', { p })}` : tt('rank.new')}</span></div>${sparkline(trend, { cap: 200, color: trendColor(trend) })}</li>`;
  }).join('')}</ol>`;

  const pub = new Map();
  for (const a of cur.list.slice(0, 100)) { const d = a.row.developer || (a.game && a.game.developer) || tt('rank.other'); const p = pub.get(d) || { n: 0, best: 999 }; p.n++; p.best = Math.min(p.best, a.rank); pub.set(d, p); }
  const pubTop = [...pub.entries()].sort((a, b) => b[1].n - a[1].n || a[1].best - b[1].best).slice(0, 10);
  const pubCard = `<div class="rk-card rk-month-publishers"><h2>${tt('rank.totals_by_publisher')} <small>${tt('rank.based_on_top_100')}</small></h2><table class="rk-table"><thead><tr><th class="rank">#</th><th>${tt('layout.publishers')}</th><th class="c">${tt('rank.games')}</th><th class="c">${tt('home.best_rank')}</th></tr></thead><tbody>${pubTop.map(([d, p], i) => `<tr><td class="rk-rank">${i + 1}</td><td>${publisherMark(d)}</td><td class="c">${p.n}</td><td class="c">${tt('rank.best_rank_number', { best: p.best })}</td></tr>`).join('')}</tbody></table></div>`;

  const top = cur.list[0];
  const faq = `<aside class="rk-card rk-month-brief"><h2>${tt('rank.monthly_ranking_summary', { m })} <small>${tt('rank.days_counted', { n: cur.n })}</small></h2><dl>
<div><dt>${tt('rank.monthly_combined_1')}</dt><dd><strong data-name>${nameA(top)}</strong><span>${tt('rank.app_store_avg_google_play', { p0: fmt1(avg(top.ios)), p1: fmt1(avg(top.android)) })}</span></dd></div>
<div><dt>${tt('rank.biggest_rise_vs_previous_month')}</dt><dd>${riser[0] ? `<strong data-name>${nameA(riser[0])}</strong><span>${tt('rank.prev_month_2', { p0: prevRank.get(riser[0].key), rank: riser[0].rank })}</span>` : tt('rank.no_comparison_data')}</dd></div>
<div><dt>${tt('rank.new_top_100_entries')}</dt><dd>${entrants.length ? entrants.map((a) => `<span>${nameSpan(a)} <b>${tt('genres.rank_number', { rank: a.rank })}</b></span>`).join('') : tt('rank.none')}</dd></div>
<div><dt>${tt('rank.most_days_at_1_on')}</dt><dd>${ones[0] ? `<strong data-name>${nameA(ones[0])}</strong><span>${tt('rank.days_8', { ones: ones[0].ones })}</span>` : tt('rank.no_record_at_1')}</dd></div>
</dl></aside>`;

  const monthLinks = S.months.filter((mo) => S.daysIn(mo).length >= 7);
  const lead = `${tt('rank.monthly_combined_ranking_for_in', { y, m, p2: COUNTRIES[country], p3: nameA(top), p4: cur.list[1] ? nameA(cur.list[1]) : '-', p5: cur.list[2] ? nameA(cur.list[2]) : '-', n: cur.n, length: cur.list.filter((a) => a.rank <= 100 && !prevRank.has(a.key)).length })}`;
  const body = `<div class="rk-head"><h1>${tt('rank.game_revenue_rankings_2', { y, m })}</h1></div>
${subnav(S, 'monthly')}
<div class="rk-toolbar"><div class="rk-tabs months rk-hscroll">${monthLinks.map((mo) => `<a class="${mo === month ? 'active' : ''}" href="/rankings/monthly/${mo}/">${formatYearMonth(mo)}</a>`).join('')}</div>${HSCROLL_SCRIPT}</div>
<div class="rk-colh rk-listh"><h2>${tt('rank.monthly_combined_top_100')}</h2><small>${tt('rank.daily_average_of_two_stores')}</small></div>
${monthList}
<div class="rk-note">${tt('rank.days_outside_the_chart_beyond')}</div>
<div class="rk-grid2 rk-month-summary">${pubCard}${faq}</div>`;
  const canonical = `${siteBaseUrl}/rankings/monthly/${month}/`;
  return shell(S, {
    body,
    title: `${tt('rank.mobile_game_revenue_rankings_top', { y, m, p2: COUNTRIES[country] })}`,
    description: lead,
    keywords: `${tt('rank.mobile_game_revenue_rankings_game', { y, m, m2: m })}`,
    canonical,
    crumbs: [{ name: `${tt('rank.year_month', { y, m })}`, url: canonical }],
  });
}

// ---------- 3. 글로벌 종합 ----------
function renderGlobal() {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today, yday } = S;
  const cur = S.aggregateGlobal(today), prev = S.aggregateGlobal(yday);
  const prevRank = new Map(prev.list.map((a) => [a.key, a.rank]));
  const prevPts = new Map(prev.list.map((a) => [a.key, a.pts]));
  const cell = (a, c) => { const i = a.ranks[`${c}_ios`], g = a.ranks[`${c}_android`]; const f = (v) => (v == null ? '<span class="rk-dim">·</span>' : v <= 10 ? `<b class="rk-gold">${v}</b>` : v); return `<td class="c">${f(i)}<span class="rk-dim"> / </span>${f(g)}</td>`; };
  const rows = cur.list.slice(0, 200).map((a) => { const dp = a.pts - (prevPts.get(a.key) || 0); return `<tr><td class="rk-rank ${a.rank <= 3 ? 'top' : ''}">${a.rank}</td><td>${C.appCell(a.row, a.store)}</td><td class="c">${chg(a.rank, prevRank.get(a.key))}</td><td class="r"><b>${a.pts.toLocaleString(require('../../i18n').currentEdition().intl)}</b><br><span class="sm ${dp >= 0 ? 'rk-upc' : 'rk-downc'}">${dp >= 0 ? '+' : ''}${dp}</span></td><td class="c">${a.countries.size}</td>${Object.keys(COUNTRIES).map((c) => cell(a, c)).join('')}</tr>`; }).join('');
  const lead = `${tt('rank.global_chart_index_summing_the', { p0: tsText(today.ts) })}`;
  const body = `<div class="rk-head"><h1>${tt('rank.global_chart_index')}</h1></div>
${subnav(S, 'global')}
<section class="rk-card rk-global-index" aria-label="${tt('rank.global_chart_index_top_200')}">
<div class="rk-colh rk-listh"><h2>${tt('rank.global_chart_index_top_200')}</h2></div>
<div class="rk-scroll"><table class="rk-table rk-mh-5 rk-mh-from6"><thead><tr><th class="rank">#</th><th>${tt('est.game')}</th><th class="c">${tt('rank.change')}</th><th class="r">${tt('rank.points')}</th><th class="c">${tt('rank.countries')}</th>${Object.entries(COUNTRIES).map(([c, n]) => `<th class="c"><a href="${countryHref(c)}">${n}</a></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
</section>${require('../../rank/monthly-estimates').renderMonthlyEstimates()}`;
  const canonical = `${siteBaseUrl}/rankings/global/`;
  return shell(S, {
    body,
    title: tt('rank.global_chart_index_korea_japan'),
    description: lead,
    keywords: tt('rank.global_mobile_game_revenue_rankings'),
    canonical,
    crumbs: [{ name: tt('rank.global_chart_index'), url: canonical }],
  });
}

// ---------- 4. 역대 기록 ----------
function renderRecords(country = 'kr') {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today } = S;
  const year = today.date.slice(0, 4);
  const { annualRecords } = require('../../rank/annual-records');
  const { all, crown, days } = annualRecords(S.days, country, 'ios', year);
  const cname = COUNTRIES[country];
  // mh: 모바일에서 숨길 보조 열 (예: 'rk-mh-5') — 표가 화면 폭을 넘지 않게 한다
  const t = (title, sub, head, body, mh = '') => `<div class="rk-card"><h2>${title} <small>${sub}</small></h2><table class="rk-table ${mh}"><thead><tr><th class="rank">#</th><th>${tt('est.game')}</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  const ones = all.filter((a) => a.ones).sort((x, y) => y.ones - x.ones).slice(0, 10);
  const onesT = t(tt('rank.cumulative_days_at_1'), `${tt('rank.app_store_of_days', { cname, length: days.length })}`, tt('rank.days_at_1_longest_streak'), ones.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="c"><b>${a.ones}</b>${tt('rank.days')}</td><td class="c">${tt('rank.days_7', { bestStreak: a.bestStreak })} <span class="rk-dim sm">~${formatMonthDay(a.bestStreakEnd || '')}</span></td><td class="c">${Math.round((a.ones / days.length) * 100)}%</td></tr>`).join(''), 'rk-mh-5 rk-ones');
  const pts = all.slice().sort((x, y) => y.pts - x.pts).slice(0, 10);
  const ptsT = t(tt('rank.cumulative_rank_points'), tt('rank.sum_of_daily_201_rank'), tt('rank.points_days_on_chart_avg'), pts.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="r"><b>${a.pts.toLocaleString(require('../../i18n').currentEdition().intl)}</b></td><td class="c">${tt('rank.days_6', { days: a.days })}</td><td class="c">${tt('rank.rank_number', { p0: fmt1(avg(a.ranks)) })}</td></tr>`).join(''), 'rk-mh-4');
  const top10Tables = ['ios', 'android'].filter(s => country !== 'cn' || s === 'ios').map(s => {
    const records = (s === 'ios' ? all : annualRecords(S.days, country, s, year).all).filter(a => a.bestTop10).sort((a, b) => b.bestTop10 - a.bestTop10 || b.pts - a.pts).slice(0, 10);
    return t(tt('rank.longest_top_10_streak'), STORES[s], tt('rank.streak_period'), records.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, s)}</td><td class="c"><b>${tt('rank.days_5', { bestTop10: a.bestTop10 })}</b></td><td class="c">${formatMonthDay(a.bestTop10Start, true)}<br>~${formatMonthDay(a.bestTop10End, true)}</td></tr>`).join('') || tt('rank.no_records_were_collected_2'));
  }).join('');
  const debuts = all.filter((a) => a.debut != null).sort((x, y) => x.debut - y.debut).slice(0, 8);
  const debutsT = debuts.length ? t(tt('rank.first_recorded_rank_this_year'), tt('rank.app_store_based_on_first'), tt('rank.first_rank_first_recorded_current'), debuts.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="c"><b>${tt('rank.debut_rank_number', { debut: a.debut })}</b></td><td class="c">${formatDay(a.debutDay)}</td><td class="c">${S.rankOf(today, country, 'ios', a.row.appId) ?? tt('rank.out_of_chart')}</td></tr>`).join(''), 'rk-mh-4') : '';
  const crownT = `<div class="rk-card"><h2>${tt('rank.monthly_top_3')} <small>${tt('rank.app_store_cumulative_points')}</small></h2><div class="rk-record-scroll"><table class="rk-table rk-month-top3"><thead><tr><th>${tt('rank.month')}</th><th>${tt('rank.1')}</th><th>${tt('rank.2')}</th><th>${tt('rank.3')}</th></tr></thead><tbody>${crown.slice().reverse().map(mo => `<tr><td><a href="/rankings/monthly/${mo.mo}/">${formatYearMonth(mo.mo)}</a></td>${[0, 1, 2].map(i => `<td>${mo.top[i] ? `${C.appCell(mo.top[i].row, 'ios')}<small class="rk-dim">${tt('rank.pts', { p0: mo.top[i].pts.toLocaleString(require('../../i18n').currentEdition().intl) })}</small>` : tt('chart.no_record')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const longest = all.slice().sort((x, y) => y.bestStreak - x.bestStreak)[0];
  const rec = (label, a, val) => (a ? C.tick(label, a.row, 'ios', val) : '');
  const ticker = `<div class="rk-ticker">${rec(tt('rank.most_days_at_1'), ones[0], `<span class="rk-chg same">${tt('rank.days_4', { p0: ones[0] ? ones[0].ones : 0 })}</span>`)}${rec(tt('rank.longest_1_streak'), longest, `<span class="rk-chg same">${tt('rank.days_4', { p0: longest ? longest.bestStreak : 0 })}</span>`)}${rec(tt('rank.most_cumulative_points'), pts[0], `<span class="rk-chg same">${pts[0] ? pts[0].pts.toLocaleString(require('../../i18n').currentEdition().intl) : ''}</span>`)}</div>`;
  const lead = `${tt('rank.mobile_game_revenue_ranking_records', { year, cname, p2: formatDay(days[0]?.date || `${year}-01-01`), date: formatDay(today.date), length: days.length })}`;
  const body = `<div class="rk-head"><h1>${tt('rank.game_revenue_ranking_annual_records', { year })}</h1></div>
${subnav(S, 'records')}
<div class="rk-grid2">${onesT}${ptsT}</div>
<div class="rk-grid2">${top10Tables}</div>
${crownT}
${debutsT}`;
  const canonical = `${siteBaseUrl}/rankings/records/`;
  return shell(S, {
    body,
    title: `${tt('rank.mobile_game_annual_records_days', { year })}`,
    description: lead,
    keywords: tt('rank.mobile_game_annual_records_longest'),
    canonical,
    crumbs: [{ name: tt('layout.annual_records'), url: canonical }],
  });
}

// ---------- 4b. 개발사 순위 ----------
// 상세 페이지를 만드는 개발사: TOP 200 에 게임 2개 이상, 포인트순 최대 80개 (허브 링크와 생성이 같은 기준을 쓴다)
const PUB_PAGE_MIN_GAMES = 2;
const PUB_PAGE_MAX = 80;
function publisherPages(list) { return list.filter((p) => p.games.size >= PUB_PAGE_MIN_GAMES).slice(0, PUB_PAGE_MAX); }
function publisherPageSet(list) { return new Set(publisherPages(list).map((p) => p.slug)); }
function renderPublishers(country = 'kr') {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today } = S;
  const list = publisherIndex(S, country);
  const cname = COUNTRIES[country];
  const paged = publisherPageSet(list);
  const rows = list.slice(0, 100).map((p) => `<tr><td class="rk-rank ${p.rank <= 3 ? 'top' : ''}">${p.rank}</td><td>${paged.has(p.slug) ? `<a class="rk-pubname" data-name href="/rankings/publishers/${encodeURIComponent(p.slug)}/">${esc(p.name)}</a>` : `<span class="rk-pubname" data-name>${esc(p.name)}</span>`}<div class="rk-pubicons">${p.gameList.slice(0, 4).map((e) => `<img src="${esc(C.iconOf(e.row, e.g))}" data-name alt="${esc(S.nameOf(e.store, e.row))}" title="${esc(S.nameOf(e.store, e.row))}" loading="lazy">`).join('')}</div></td><td class="c"><b>${p.games.size}</b></td><td class="c">${tt('rank.best_rank_number', { best: p.best })}</td><td class="c">${p.top10 || '-'}</td><td class="r"><b>${p.pts.toLocaleString(require('../../i18n').currentEdition().intl)}</b></td></tr>`).join('');
  const lead = `${tt('rank.ranking_of_games_in_the', { cname, p1: list[0] ? `${tt('rank.games_2', { name: list[0].name, size: list[0].games.size })}` : '-', p2: list[1] ? list[1].name : '-', p3: list[2] ? list[2].name : '-', p4: tsText(today.ts) })}`;
  const body = `<div class="rk-head"><h1>${tt('rank.game_publisher_rankings')}</h1></div>
${subnav(S, 'pub')}
<div class="rk-card"><div class="rk-colh rk-listh"><h2>${tt('rank.publisher_top', { p0: Math.min(100, list.length) })}</h2><small>${tt('rank.based_on_revenue_top_200', { cname })}</small></div><table class="rk-table rk-pubtable rk-mh-5"><thead><tr><th class="rank">#</th><th>${tt('layout.publishers')}</th><th class="c">${tt('rank.games')}</th><th class="c">${tt('home.best_rank')}</th><th class="c">TOP 10</th><th class="r">${tt('rank.points')}</th></tr></thead><tbody>${rows}</tbody></table>
</div>`;
  const canonical = `${siteBaseUrl}/rankings/publishers/`;
  return shell(S, {
    body,
    title: `${tt('rank.mobile_game_publisher_rankings_top', { p0: Math.min(100, list.length), date: formatDay(today.date) })}`,
    description: lead,
    keywords: tt('rank.game_publisher_rankings_game_publisher'),
    canonical,
    crumbs: [{ name: tt('layout.publishers'), url: canonical }],
  });
}
function renderPublisher(pub, country = 'kr') {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today, days, rankOf, seriesOf } = S;
  const cname = COUNTRIES[country];
  const cell = (e, s) => { const v = e.ranks[s]; if (v == null) return '<td class="c"><span class="rk-dim">·</span></td><td class="c"></td>'; return `<td class="c"><b>${v}</b></td><td class="c">${chg(v, e.prev[s])}</td>`; };
  const rows = pub.gameList.map((e) => { const s = e.ranks.ios ? 'ios' : 'android'; const id = e.row.appId; const ser = seriesOf(country, s, id); return `<tr><td>${C.appCell(e.row, e.store)}</td>${cell(e, 'ios')}${cell(e, 'android')}<td class="spk">${sparkline(ser.slice(-30), { cap: 200, color: trendColor(ser.slice(-30)) })}</td><td class="c rk-m-hide">${S.util.min(ser) ?? '-'}</td><td class="c">${tt('rank.days_4', { p0: S.daysOnChart(country, s, id) })}</td></tr>`; }).join('');
  // 30일 추이: 두 스토어 TOP 200 내 게임 수 · 포인트
  const hist = days.slice(-30).map((d) => { let n = 0, pts = 0; for (const s of Object.keys(STORES)) (d.rows[country][s] || []).forEach((r, i) => { const g = S.gameOf(s, r); if (pubKey((g && g.developer) || r.developer) === pub.key) { n++; pts += 200 - i; } }); return { n, pts }; });
  const kpi = `<div class="rk-stats">
<div class="rk-stat"><div class="l">${tt('rank.games_in_the_revenue_top')}</div><div class="v">${pub.games.size}<small>${tt('rank.count_unit')}</small></div><div class="s">${tt('rank.app_store_google_play_2', { length: pub.gameList.filter((e) => e.ranks.ios).length, length2: pub.gameList.filter((e) => e.ranks.android).length })}</div>${sparkline(hist.map((h) => h.n), { w: 100, h: 30, cap: 999, color: 'var(--rk-accent)' })}</div>
<div class="rk-stat"><div class="l">${tt('home.best_rank')}</div><div class="v">${pub.best}<small>${tt('chart.rank_unit')}</small></div><div class="s" data-name>${pub.gameList[0] ? esc(S.nameOf(pub.gameList[0].store, pub.gameList[0].row)) : ''}</div></div>
<div class="rk-stat"><div class="l">${tt('rank.top_10_games')}</div><div class="v">${pub.top10}<small>${tt('rank.count_unit')}</small></div><div class="s">${tt('rank.both_stores_combined')}</div></div>
<div class="rk-stat"><div class="l">${tt('rank.points')}</div><div class="v">${pub.pts.toLocaleString(require('../../i18n').currentEdition().intl)}</div><div class="s">${tt('rank.publisher_rank_30_day_trend', { rank: pub.rank })}</div>${sparkline(hist.map((h) => h.pts), { w: 100, h: 30, cap: 1e9, color: 'var(--rk-accent)' })}</div>
</div>`;
  const lead = `${tt('rank.s_mobile_game_revenue_rankings', { name: pub.name, date: formatDay(today.date), cname, size: pub.games.size, best: pub.best, p5: pub.gameList[0] ? `(${S.nameOf(pub.gameList[0].store, pub.gameList[0].row)})` : '', rank: pub.rank })}`;
  const body = `<div class="rk-head"><h1>${tt('rank.game_revenue_rankings', { p0: `<span data-name>${esc(pub.name)}</span>` })}</h1></div>
${subnav(S, 'pub')}
${kpi}
<div class="rk-card"><h2>${tt('rank.today_s_ranking')} <small>${tt('rank.app_store_google_play')}</small></h2><div class="rk-scroll"><table class="rk-table rk-mh-spk rk-mh-last"><thead><tr><th>${tt('est.game')}</th><th class="c" colspan="2">${tt('stats.app_store')}</th><th class="c" colspan="2">${tt('stats.google_play')}</th><th class="spk">${tt('rank.30_days')}</th><th class="c rk-m-hide">${tt('rank.all_time_best')}</th><th class="c">${tt('rank.time_in_chart')}</th></tr></thead><tbody>${rows}</tbody></table></div></div>
<div class="rk-links rk-links-row"><a href="/rankings/publishers/">${tt('rank.all_publisher_rankings')}</a><a href="${countryHref(country)}">${tt('rank.revenue_rankings_top_200', { cname })}</a><a href="/rankings/monthly/${S.latestMonth}/">${tt('rank.monthly_rankings', { latestMonth: formatYearMonth(S.latestMonth) })}</a></div>`;
  const canonical = `${siteBaseUrl}/rankings/publishers/${encodeURIComponent(pub.slug)}/`;
  return shell(S, {
    body,
    // 상세 페이지는 날짜를 빼고 짧게 (개발사명이 길어 70자를 넘던 페이지 19개)
    title: `${tt('rank.game_revenue_rankings_in_the', { name: pub.name, size: pub.games.size })}`,
    description: lead,
    keywords: `${tt('rank.game_rankings_revenue_rankings_mobile', { name: pub.name, name2: pub.name, name3: pub.name, name4: pub.name })}`,
    canonical,
    crumbs: [{ name: tt('layout.publishers'), url: `${siteBaseUrl}/rankings/publishers/` }, { name: pub.name, url: canonical }],
  });
}

// ---------- 4c. 산출 방법 ----------
// ---------- 트렌딩 (/trending/) ----------
// 일주일 전과 오늘을 비교한다: 급상승 · TOP 10 변화 · 급하락 · 여러 나라 동시 상승 · 신작.
// 모든 목록을 빌드 시 HTML 로 넣는다(검색엔진이 그대로 읽는다). 자바스크립트는 쓰지 않는다.
function renderTrending(country = homeCountry()) {
  const S = loadRankStats();
  const { today, days, rankOf } = S;
  const C = makeCtx(S);
  if (days.length < 8) return null;
  const week = days[days.length - 8];
  const cname = COUNTRIES[country];
  const OUT = 201;
  const stores = Object.keys(STORES).filter((s) => ((today.rows[country] || {})[s] || []).length);
  const rowsOf = (d, c, s) => ((d.rows[c] || {})[s] || []).slice(0, 200);
  const uniq = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.key) && seen.add(x.key)); };
  const entry = (c, s, r, rank) => ({ c, s, r, rank, g: S.gameOf(s, r), key: S.keyOf(s, r) });
  const storeTag = (x) => (stores.length > 1 ? STORES[x.s] : '');
  const none = `<p class="rk-empty">${tt('trend.none')}</p>`;
  const rankText = (n) => (n == null || n >= OUT ? tt('trend.out') : String(n));

  // 급상승: 오늘 TOP 100 중 일주일 전보다 10계단 넘게 오른 게임
  const risers = uniq(stores.flatMap((s) => rowsOf(today, country, s).slice(0, 100).map((r, i) => {
    if (!r || !r.appId) return null;
    const from = rankOf(week, country, s, r.appId) ?? OUT;
    return from - (i + 1) >= 10 ? { ...entry(country, s, r, i + 1), from } : null;
  }).filter(Boolean)).sort((a, b) => (b.from - b.rank) - (a.from - a.rank))).slice(0, 10);
  // 급하락: 일주일 전 TOP 100 중 10계단 넘게 내린 게임
  const fallers = uniq(stores.flatMap((s) => rowsOf(week, country, s).slice(0, 100).map((r, i) => {
    if (!r || !r.appId) return null;
    const to = rankOf(today, country, s, r.appId) ?? OUT;
    return to - (i + 1) >= 10 ? { ...entry(country, s, r, to), from: i + 1 } : null;
  }).filter(Boolean)).sort((a, b) => (b.rank - b.from) - (a.rank - a.from))).slice(0, 10);
  const moveRow = (x, i, up) => {
    const series = S.seriesOf(x.c, x.s, x.r.appId).slice(-14);
    const href = C.hrefOf(x.g);
    const name = esc(S.nameOf(x.s, x.r));
    return `<li><span class="rk-rk ${i < 3 ? 'top' : ''}">${i + 1}</span><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy" decoding="async"><div class="nm">${href ? `<a data-name href="${href}">${name}</a>` : `<span data-name>${name}</span>`}<span class="dv">${storeTag(x) ? storeTag(x) + ' · ' : ''}<span data-name>${esc(x.r.developer || (x.g && x.g.developer) || '')}</span></span></div><div class="rt"><b>${rankText(x.from)} → ${rankText(x.rank)}</b>${up && x.from >= OUT ? '<span class="rk-chg new">NEW</span>' : `<span class="rk-chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${Math.abs(x.from - x.rank)}</span>`}</div>${sparkline(series, { cap: 200, color: up ? 'var(--rk-up)' : 'var(--rk-down)' })}</li>`;
  };
  const moveList = (list, up) => (list.length ? `<ol class="rk-list rk-trend-list">${list.map((x, i) => moveRow(x, i, up)).join('')}</ol>` : none);

  // TOP 10 변화: 바뀐 자리가 더 많은 스토어를 고른다
  const top10 = (s) => {
    const prev = rowsOf(week, country, s).slice(0, 10).filter((r) => r && r.appId), now = rowsOf(today, country, s).slice(0, 10).filter((r) => r && r.appId);
    const moved = now.filter((r) => { const p = rankOf(week, country, s, r.appId); return p == null || p > 10; }).length;
    return { s, prev, now, moved };
  };
  const board = stores.map(top10).sort((a, b) => b.moved - a.moved)[0];
  let bump = none;
  if (board && board.now.length) {
    const s = board.s, RH = 44;
    const cell = (r, rank, tail, cls) => { const g = S.gameOf(s, r); const href = C.hrefOf(g); const tag = href ? 'a' : 'div';
      return `<${tag} class="rk-bump-row${cls}"${href ? ` href="${href}"` : ''}><span class="no">${rank}</span><img src="${esc(C.iconOf(r, g))}" alt="" loading="lazy" decoding="async"><span class="t" data-name>${esc(S.nameOf(s, r))}</span>${tail}</${tag}>`; };
    const left = board.prev.map((r, i) => { const to = rankOf(today, country, s, r.appId); const out = to == null || to > 10;
      return cell(r, i + 1, out ? `<span class="rk-chg down">${rankText(to)}</span>` : '', out ? ' out' : ''); }).join('');
    const right = board.now.map((r, i) => { const from = rankOf(week, country, s, r.appId); const inn = from == null || from > 10;
      return cell(r, i + 1, chg(i + 1, from), inn ? ' in' : ''); }).join('');
    const lines = board.prev.map((r, i) => { const to = rankOf(today, country, s, r.appId); if (to == null || to > 10) return '';
      const y1 = (i + 0.5) * RH, y2 = (to - 0.5) * RH, col = y2 < y1 ? 'var(--rk-up)' : y2 > y1 ? 'var(--rk-down)' : 'var(--rk-line)';
      return `<path d="M0,${y1}C50,${y1} 50,${y2} 100,${y2}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>`; }).join('');
    bump = `<div class="rk-bump"><div class="rk-bump-col"><div class="rk-bump-h">${tt('trend.week_ago')} · ${formatMonthDay(week.date)}</div>${left}</div><svg viewBox="0 0 100 ${RH * 10}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg><div class="rk-bump-col r"><div class="rk-bump-h">${tt('trend.today')} · ${formatMonthDay(today.date)}</div>${right}</div></div>`;
  }

  // 여러 나라에서 함께 오른 게임: 나라마다 더 많이 오른 스토어 하나를 쓴다
  const cross = new Map();
  for (const c of orderedCountries()) for (const s of Object.keys(STORES)) rowsOf(today, c, s).slice(0, 100).forEach((r, i) => {
    if (!r || !r.appId) return;
    const g = S.gameOf(s, r); if (!g || !g.slug) return;
    const from = rankOf(week, c, s, r.appId) ?? OUT, gain = from - (i + 1);
    if (gain < 10) return;
    let e = cross.get(g.slug); if (!e) { e = { g, r, s, m: {} }; cross.set(g.slug, e); }
    if (!e.m[c] || gain > e.m[c].gain) e.m[c] = { rank: i + 1, from, gain };
  });
  const crossList = [...cross.values()].filter((e) => Object.keys(e.m).length >= 2)
    .sort((a, b) => Object.keys(b.m).length - Object.keys(a.m).length || Object.values(b.m).reduce((x, y) => x + y.gain, 0) - Object.values(a.m).reduce((x, y) => x + y.gain, 0)).slice(0, 8);
  const heat = (m) => (!m ? 'h0' : m.gain >= 100 ? 'h4' : m.gain >= 50 ? 'h3' : m.gain >= 20 ? 'h2' : 'h1');
  const crossTable = crossList.length ? `<div class="rk-scroll"><table class="rk-table rk-heat"><thead><tr><th></th>${orderedCountries().map((c) => `<th class="c">${COUNTRIES[c]}</th>`).join('')}</tr></thead><tbody>${crossList.map((e) => `<tr><td>${C.appCell(e.r, e.s)}</td>${orderedCountries().map((c) => { const m = e.m[c]; return `<td class="c"><span class="rk-heat-cell ${heat(m)}">${m ? `<b>${m.rank}</b><small>${rankText(m.from)} →</small>` : '-'}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : none;

  // 신작
  const debuts = uniq(stores.flatMap((s) => S.debutRows(country, s).map((x) => ({ ...x, ...entry(country, s, x.r, x.cur) })))).sort((a, b) => a.cur - b.cur).slice(0, 8);
  const debutList = debuts.length ? `<ol class="rk-list rk-trend-list">${debuts.map((x, i) => { const href = C.hrefOf(x.g); const name = esc(S.nameOf(x.s, x.r));
    return `<li><span class="rk-rk">${i + 1}</span><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy" decoding="async"><div class="nm">${href ? `<a data-name href="${href}">${name}</a>` : `<span data-name>${name}</span>`}<span class="dv">${storeTag(x) ? storeTag(x) + ' · ' : ''}<span data-name>${esc(x.r.developer || (x.g && x.g.developer) || '')}</span></span></div><div class="rt"><b>${x.cur}</b><span class="sub">${tt('home.day', { age: x.age })} · ${tt('home.best', { best: x.best })}</span></div>${sparkline(S.seriesOf(x.c, x.s, x.r.appId).slice(-14), { cap: 200 })}</li>`; }).join('')}</ol>` : none;

  const section = (title, sub, body) => `<section class="rk-section"><h2>${title} <small>${sub}</small></h2>${body}</section>`;
  const body = `<div class="rk-head"><h1>${tt('trend.title')}</h1><p class="rk-trend-sub">${tt('trend.sub', { date: formatDay(today.date), country: cname })}</p></div>
${section(tt('home.biggest_gains'), tt('trend.risers_sub'), moveList(risers, true))}
${section(tt('trend.top10'), `${tt('trend.top10_sub')} · ${cname} ${board ? STORES[board.s] : ''}`, bump)}
${section(tt('home.biggest_drops'), tt('trend.fallers_sub'), moveList(fallers, false))}
${section(tt('trend.cross'), tt('trend.cross_sub'), crossTable)}
${section(tt('trend.new'), tt('trend.new_sub'), debutList)}`;
  const content = `
    <section class="section active" id="trending">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk rk-trend">${body}
      </div>
    </section>`;
  const canonical = `${siteBaseUrl}/trending/`;
  return wrapWithLayout(content, {
    currentPage: 'trending',
    title: tt('trend.meta_title', { date: formatDay(today.date) }),
    description: tt('trend.lead', { date: formatDay(today.date), country: cname, p1: risers[0] ? ` (${S.nameOf(risers[0].s, risers[0].r)})` : '' }),
    keywords: tt('trend.keywords'),
    canonical,
    breadcrumbs: [{ name: tt('about.home'), url: `${siteBaseUrl}/` }, { name: tt('nav.trending'), url: canonical }],
  });
}

function renderAbout() {
  const S = loadRankStats();
  const { days, today } = S;
  const body = `<div class="rk-head"><h1>${tt('about.how_the_ranking_data_is')}</h1></div>
${subnav(S, '')}
<div class="rk-card"><h2>${tt('rank.data_sources_and_collection')}</h2><div class="rk-faq">
<p><b>${tt('rank.collection_scope')}</b> ${tt('rank.we_collect_the_public_game')}</p>
<p><b>${tt('rank.collection_schedule')}</b> ${tt('rank.data_is_collected_several_times')}</p>
<p><b>${tt('rank.linking_to_game_pages')}</b> ${tt('rank.app_ids_in_the_charts')}</p>
</div></div>
<div class="rk-card"><h2>${tt('rank.how_each_ranking_is_calculated')}</h2><div class="rk-faq">
<p><b>${tt('rank.daily_revenue_and_popularity_rankings')}</b> ${tt('rank.latest_ranks_from_the_store')}</p>
<p><b>${tt('rank.monthly_combined')}</b> ${tt('rank.each_day_s_rank_in')}</p>
<p><b>${tt('rank.global_chart_index')}</b> ${tt('rank.from_9_charts_china_includes')}</p>
<p><b>${tt('layout.annual_records')}</b> ${tt('rank.only_records_for_the_year')}</p>
<p><b>${tt('rank.publisher_ranking')}</b> ${tt('rank.games_in_today_s_korea')}</p>
<p><b>${tt('rank.subculture')}</b> ${tt('rank.only_games_on_the_subculture')}</p>
</div></div>
<div class="rk-card"><h2>${tt('rank.notes_on_interpretation')}</h2><div class="rk-faq">
<p><b>${tt('rank.rankings_vs_actual_revenue')}</b> ${tt('rank.mobile_rankings_and_points_are')}</p>
<p><b>${tt('rank.historical_data_adjustments')}</b> ${tt('rank.early_december_2025_history_was')}</p>
<p><b>${tt('rank.corrections')}</b> ${tt('rank.if_a_game_is_linked')}</p>
</div></div>`;
  const canonical = `${siteBaseUrl}/rankings/about/`;
  return shell(S, {
    body,
    title: tt('rank.mobile_game_ranking_methodology_data'),
    description: tt('rank.explains_the_data_sources_of'),
    keywords: tt('rank.game_ranking_methodology_app_store'),
    canonical,
    crumbs: [{ name: tt('layout.methodology'), url: canonical }],
  });
}

// ---------- 5. 게임 페이지 순위 요약 (정적 카드) ----------
// 렌더링은 Workers 에서도 도는 순수 함수(helpers/game-rank-summary.js)가 하고, 여기서는 통계에서 게임별 데이터를 뽑아 넘긴다.
function renderGameRankSummary(gameInfo, slug) {
  const { collectRankData, summaryMeta } = require('../../build/game-data');
  const S = loadRankStats();
  const rank = collectRankData(S, gameInfo.appIds);
  if (!rank) return null;
  return require('../helpers/game-rank-summary').renderGameRankSummary(rank, summaryMeta(S), gameInfo.key || gameInfo.name || slug, homeCountry());
}

module.exports = { renderTrending, renderRankingsHub, renderSubculture: () => require('./genres').renderGenre('subculture'), renderGenre: id => require('./genres').renderGenre(id), renderMonthly, renderGlobal, renderRecords, renderPublishers, renderPublisher, renderAbout, renderGameRankSummary, publisherIndex, publisherPages, countryHref, homeCountry, orderedCountries, makeCtx, storeList, subnav, HSCROLL_SCRIPT, chg, sparkline, trendColor };
