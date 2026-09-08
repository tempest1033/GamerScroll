'use strict';
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
  const nameLink = (s, r, cls = '') => { const g = S.gameOf(s, r); const name = esc(g ? g.key : r.title); const href = hrefOf(g); return href ? `<a class="${cls}" href="${href}">${name}</a>` : `<span class="${cls}">${name}</span>`; };
  const appCell = (r, s, extra = '') => { const g = S.gameOf(s, r); return `<div class="rk-app"><img src="${esc(iconOf(r, g))}" alt="" loading="lazy" decoding="async"><div><div class="t">${nameLink(s, r)}${S.isSub(g) ? ' <span class="rk-badge sub">서브컬처</span>' : ''}${extra}</div><div class="d">${esc(r.developer || (g && g.developer) || '')}</div></div></div>`; };
  const tick = (label, r, s, val, g) => (r ? `<a href="${hrefOf(g || S.gameOf(s, r)) || '#rk-list'}"><span class="tl">${label}</span><img src="${esc(iconOf(r, g || S.gameOf(s, r)))}" alt="" loading="lazy"><span class="tn">${esc(S.nameOf(s, r))}</span>${val}</a>` : `<a><span class="tl">${label}</span><span class="tn dim">-</span></a>`);
  return { iconOf, hrefOf, nameLink, appCell, tick };
}

// 한국 매출 순위는 /rankings/, 다른 국가는 /rankings/{cc}/. 홈(/)은 별도 요약 페이지(home.js).
const countryHref = (c, chart = 'grossing') => (chart === 'free' ? (c === 'kr' ? '/rankings/free/' : `/rankings/free/${c}/`) : (c === 'kr' ? '/rankings/' : `/rankings/${c}/`));
function subnav(S, active) {
  const item = (id, href, label, cls = '') => `<a class="${[active === id ? 'active' : '', cls].filter(Boolean).join(' ')}" href="${href}">${label}</a>`;
  return `<nav class="rk-subnav" aria-label="순위 종류">${item('rank', '/rankings/', '매출')}${item('free', '/rankings/free/', '인기(무료)')}${item('sub', '/rankings/subculture/', '서브컬처')}${item('monthly', `/rankings/monthly/${S.latestMonth}/`, '월간')}${item('global', '/rankings/global/', '글로벌')}${item('records', '/rankings/records/', '역대 기록')}${item('pub', '/rankings/publishers/', '개발사')}${item('about', '/rankings/about/', '산출 방법 ›', 'right')}</nav>`;
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
const countryTabs = (active, chart = 'grossing') => `<div class="rk-tabs" role="navigation" aria-label="국가">${Object.entries(COUNTRIES).map(([c, n]) => `<a class="${c === active ? 'active' : ''}" href="${countryHref(c, chart)}">${n}</a>`).join('')}</div>`;

// 두 스토어 리스트 한 열 (매출/인기 공용). filter 가 있으면 그 게임만 남기고 접지 않는다.
function storeList(S, C, country, s, chart = 'grossing', { filter = null, limit = 200 } = {}) {
  const { today, yday, days } = S;
  const isFree = chart === 'free';
  const rows = (isFree ? today.rowsFree : today.rows)[country][s] || [];
  const rk = isFree ? S.freeRankOf : S.rankOf;
  const items = rows.slice(0, limit).map((r, i) => ({ r, i })).filter(({ r }) => r && (!filter || filter(r, S.gameOf(s, r))));
  const VISIBLE = 20; // 20위까지 펼쳐 두고 나머지는 접는다 (HTML 에는 전부 들어가 검색엔진은 200위까지 읽는다)
  const collapse = !filter && items.length > VISIBLE;
  const li = ({ r, i }) => {
    const rank = i + 1; const prev = rk(yday, country, s, r.appId);
    const week = days.slice(-7).map((d) => rk(d, country, s, r.appId));
    let extra = '';
    if (!isFree) {
      const streak = rank === 1 ? S.streakAtOne(country, s, r.appId) : 0;
      const seen = S.firstSeen(country, s, r.appId);
      const isNew30 = seen && days.length > 30 && (new Date(today.date) - new Date(seen)) / 864e5 <= 30;
      extra = (streak > 1 ? `<span class="rk-streak">1위 ${streak}일째</span>` : '') + (isNew30 ? '<span class="rk-tagnew">신작</span>' : '');
    }
    const g = S.gameOf(s, r);
    return `<li${collapse && i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${rank <= 3 ? 'top' : ''}">${rank}</span><img src="${esc(C.iconOf(r, g))}" alt="" loading="lazy" decoding="async"><div class="nm">${C.nameLink(s, r)}<span class="dv">${esc(r.developer || (g && g.developer) || '')}${extra}</span></div><div class="rt">${chg(rank, prev)}</div>${sparkline(week, { color: trendColor(week) })}</li>`;
  };
  const id = `rk-more-${s}`;
  return `${collapse ? `<input type="checkbox" id="${id}" class="rk-more-toggle" hidden>` : ''}<ol class="rk-list">${items.map(li).join('') || '<li class="rk-empty">해당 게임이 없습니다</li>'}</ol>${collapse ? `<label for="${id}" class="rk-more">${VISIBLE + 1}~${items.length}위 펼치기</label>` : ''}`;
}
const storeCols = (S, C, country, chart, opts, stores) => {
  const hasAnd = stores.includes('android');
  const limit = opts && opts.limit ? opts.limit : 200;
  const colH = (s, n) => `<div class="rk-colh"><h2>${STORES[s]}</h2><small>${chart === 'free' ? '인기(무료)' : '매출'} TOP ${n} · 변동은 전일 대비</small></div>`;
  return `${hasAnd ? '<input type="radio" name="rk-store" id="rk-st-and" checked hidden><input type="radio" name="rk-store" id="rk-st-ios" hidden><div class="rk-storeseg"><label for="rk-st-and">구글플레이</label><label for="rk-st-ios">앱스토어</label></div>' : ''}
<div class="rk-cols${hasAnd ? '' : ' single'}" id="rk-list">${stores.map((s) => `<div class="rk-col ${s === 'ios' ? 'ios' : 'and'}">${colH(s, Math.min(limit, ((chart === 'free' ? S.today.rowsFree : S.today.rows)[country][s] || []).length))}${storeList(S, C, country, s, chart, opts)}</div>`).join('')}</div>`;
};

function shell(S, { body, title, description, canonical, crumbs, keywords }) {
  const content = `
    <section class="section active" id="rankings">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      <p class="rk-foot">데이터는 애플 앱스토어·구글플레이 공개 매출 차트를 하루 여러 차례 수집한 것으로, 스토어 기준 시각에 따라 실제와 차이가 있을 수 있습니다. 원스토어는 포함되지 않습니다. 이력 ${S.days[0].date} ~ ${S.today.date} (${S.days.length}일). <a href="/rankings/about/">산출 방법 ›</a></p>
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'rankings',
    title, description, keywords, canonical,
    breadcrumbs: [{ name: '홈', url: `${siteBaseUrl}/` }, { name: '모바일 순위', url: `${siteBaseUrl}/rankings/` }, ...(crumbs || [])].filter((c, i, a) => a.findIndex((d) => d.url === c.url) === i),
  });
}

// ---------- 1. 실시간 순위 (국가별) ----------
function renderRankingsHub(country = 'kr', chart = 'grossing') {
  const S = loadRankStats();
  const { today, yday, rankOf } = S;
  const C = makeCtx(S);
  const cname = COUNTRIES[country];
  const isFree = chart === 'free';
  const rows = (s) => (isFree ? today.rowsFree : today.rows)[country][s] || [];
  const hasAnd = rows('android').length > 0;
  const stores = hasAnd ? ['android', 'ios'] : ['ios'];
  const rk = isFree ? S.freeRankOf : rankOf;
  const chartName = isFree ? '인기' : '매출';

  const ios = rows('ios'); const and = rows('android');
  const mvI = S.movers(country, 'ios', chart);
  const top1 = (s) => { const r = rows(s)[0]; if (!r) return ''; const v = isFree ? chg(1, rk(yday, country, s, r.appId)) : `<span class="rk-chg same">${S.streakAtOne(country, s, r.appId)}일째</span>`; return C.tick(`${STORES[s]} 1위`, r, s, v); };
  const ticker = `<div class="rk-ticker">${hasAnd ? top1('android') : ''}${top1('ios')}${C.tick('급등', mvI.up[0] && mvI.up[0].r, 'ios', mvI.up[0] ? `<span class="rk-chg up">▲${mvI.up[0].prev - mvI.up[0].rank}</span>` : '')}${C.tick('급락', mvI.down[0] && mvI.down[0].r, 'ios', mvI.down[0] ? `<span class="rk-chg down">▼${mvI.down[0].rank - mvI.down[0].prev}</span>` : '')}${C.tick('신규 진입', mvI.fresh[0] && mvI.fresh[0].r, 'ios', '<span class="rk-chg new">NEW</span>')}${isFree ? '' : C.tick('역대 최고', mvI.record[0] && mvI.record[0].r, 'ios', mvI.record[0] ? `<span class="rk-chg gold">${mvI.record[0].rank}위 ★</span>` : '')}</div>`;

  const top3 = ios.slice(0, 3).map((r) => S.nameOf('ios', r));
  const lead = `${cname} 앱스토어 ${chartName} 1위 ${top3[0] || '-'}, 2위 ${top3[1] || '-'}, 3위 ${top3[2] || '-'}${hasAnd && and[0] ? `. 구글플레이 1위 ${S.nameOf('android', and[0])}` : ''}. ${tsText(today.ts)} 기준, 매일 갱신.`;
  const cols = storeCols(S, C, country, chart, {}, stores);

  if (isFree) {
    const links = `<div class="rk-card"><h2>함께 보기</h2><div class="rk-links"><a href="${countryHref(country)}">${cname} 매출 순위 <span>앱스토어·구글플레이 매출 TOP 200</span></a><a href="/rankings/subculture/">서브컬처 게임 순위 <span>수집형·미소녀·애니 원작 게임만 모아 보기</span></a><a href="/rankings/monthly/${S.latestMonth}/">${S.latestMonth} 월간 매출 순위 <span>두 스토어 일 평균 기준 통합 순위</span></a></div></div>`;
    const body = `<div class="rk-head"><h1>${cname} 모바일 게임 인기 순위</h1></div>
${subnav(S, 'free')}
<div class="rk-toolbar">${countryTabs(country, 'free')}</div>
${ticker}
${cols}
${links}`;
    const canonical = `${siteBaseUrl}${countryHref(country, 'free')}`;
    return shell(S, {
      body,
      title: `${cname} 모바일 게임 인기 순위 TOP 200 — 앱스토어·구글플레이 무료 다운로드 (${today.date}) | 게이머스크롤`,
      description: lead,
      keywords: `${cname} 모바일 게임 인기 순위, 앱스토어 인기 게임 순위, 구글플레이 인기 게임 순위, 무료 게임 순위, 게임 다운로드 순위`,
      canonical,
      crumbs: [{ name: '인기(무료)', url: `${siteBaseUrl}/rankings/free/` }, ...(country === 'kr' ? [] : [{ name: cname, url: canonical }])],
    });
  }

  const body = `<div class="rk-head"><h1>${country === 'kr' ? '모바일 게임 매출 순위' : `${cname} 모바일 게임 매출 순위`}</h1></div>
${subnav(S, 'rank')}
<div class="rk-toolbar">${countryTabs(country)}</div>
${ticker}
${cols}`;
  const canonical = `${siteBaseUrl}${countryHref(country)}`;
  return shell(S, {
    body,
    title: `${cname} 모바일 게임 매출 순위 TOP 200 — 앱스토어·구글플레이 (${today.date}) | 게이머스크롤`,
    description: lead,
    keywords: `${cname} 모바일 게임 매출 순위, 앱스토어 매출 순위, 구글플레이 매출 순위, 플레이스토어 순위, 모바일 게임 순위, 게임 매출 순위`,
    canonical,
    crumbs: country === 'kr' ? [] : [{ name: cname, url: canonical }],
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
  const t1 = (s, list) => (list[0] ? C.tick(`${STORES[s]} 서브컬처 1위`, list[0].r, s, `<span class="rk-chg same">전체 ${list[0].rank}위</span>`, list[0].g) : '');
  const ticker = `<div class="rk-ticker">${hasAnd ? t1('android', and) : ''}${t1('ios', ios)}${C.tick('급등', up && up.r, 'ios', up ? `<span class="rk-chg up">▲${up.prev - up.rank}</span>` : '')}${C.tick('급락', down && down.r, 'ios', down ? `<span class="rk-chg down">▼${down.rank - down.prev}</span>` : '')}${C.tick('신규 진입', fresh && fresh.r, 'ios', '<span class="rk-chg new">NEW</span>')}</div>`;
  // TOP 100 안 서브컬처 게임 수 30일 추이
  const countSeries = days.slice(-30).map((d) => d.rows[country].ios.slice(0, 100).filter((r) => S.isSub(S.gameOf('ios', r))).length);
  const cur100 = countSeries[countSeries.length - 1] || 0;
  // 이달 서브컬처 월간 TOP 10
  const ms = S.monthStats(S.latestMonth, country);
  const mTop = ms ? ms.list.filter((a) => S.isSub(a.game)).slice(0, 10) : [];
  const [y, m] = S.latestMonth.split('-').map(Number);
  const monthCard = mTop.length ? `<div class="rk-card"><h2>${y}년 ${m}월 서브컬처 월간 TOP 10 <small>두 스토어 일 평균 순위 합산</small></h2><table class="rk-table"><thead><tr><th class="rank">#</th><th>게임</th><th class="c">통합 순위</th><th class="c">앱스토어 평균</th><th class="c">구글플레이 평균</th></tr></thead><tbody>${mTop.map((a, i) => `<tr><td class="rk-rank ${i < 3 ? 'top' : ''}">${i + 1}</td><td>${C.appCell(a.row, a.store)}</td><td class="c"><b>${a.rank}위</b></td><td class="c">${fmt1(avg(a.ios))}</td><td class="c">${fmt1(avg(a.android))}</td></tr>`).join('')}</tbody></table><div class="rk-note"><a href="/rankings/monthly/${S.latestMonth}/">${S.latestMonth} 전체 월간 순위 보기 ›</a></div></div>` : '';
  const kpi = `<div class="rk-stats sub3">
<div class="rk-stat"><div class="l">앱스토어 TOP 100 내 서브컬처</div><div class="v">${cur100}<small>개</small></div><div class="s">30일 추이</div>${sparkline(countSeries, { w: 100, h: 30, color: 'var(--rk-sub)', cap: 999 })}</div>
<div class="rk-stat"><div class="l">앱스토어 TOP 200 내</div><div class="v">${ios.length}<small>개</small></div><div class="s">최고 순위 ${ios[0] ? ios[0].rank + '위 · ' + esc(S.nameOf('ios', ios[0].r)) : '-'}</div></div>
<div class="rk-stat"><div class="l">구글플레이 TOP 200 내</div><div class="v">${and.length}<small>개</small></div><div class="s">최고 순위 ${and[0] ? and[0].rank + '위 · ' + esc(S.nameOf('android', and[0].r)) : '-'}</div></div>
</div>`;
  const lead = `${cname} 앱스토어·구글플레이 매출 TOP 200 가운데 서브컬처(수집형·미소녀·애니 원작) 게임만 모은 순위. 앱스토어 서브컬처 1위 ${ios[0] ? `${S.nameOf('ios', ios[0].r)}(전체 ${ios[0].rank}위)` : '-'}, TOP 100 안 ${cur100}개. ${tsText(today.ts)} 기준, 매일 갱신.`;
  const body = `<div class="rk-head"><h1>서브컬처 게임 매출 순위</h1></div>
${subnav(S, 'sub')}
${ticker}
${kpi}
${storeCols(S, C, country, 'grossing', { filter }, stores)}
${monthCard}
<div class="rk-note">서브컬처 분류는 게이머스크롤이 관리하는 목록 기준입니다. 빠진 게임이 있으면 알려 주세요.</div>`;
  const canonical = `${siteBaseUrl}/rankings/subculture/`;
  return shell(S, {
    body,
    title: `서브컬처 게임 매출 순위 — 한국 앱스토어·구글플레이 (${today.date}) | 게이머스크롤`,
    description: lead,
    keywords: '서브컬처 게임 순위, 서브컬처 게임 매출 순위, 수집형 RPG 순위, 미소녀 게임 순위, 가챠 게임 매출 순위, 니케 순위, 원신 순위, 붕괴 스타레일 순위',
    canonical,
    crumbs: [{ name: '서브컬처', url: canonical }],
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
  const nameA = (a) => esc(a.game ? a.game.key : a.row.title);
  const withPrev = cur.list.filter((a) => prevRank.has(a.key));
  const riser = withPrev.filter((a) => a.rank <= 100).sort((a, b) => (prevRank.get(b.key) - b.rank) - (prevRank.get(a.key) - a.rank)).slice(0, 3);
  const faller = withPrev.filter((a) => prevRank.get(a.key) <= 100).sort((a, b) => (b.rank - prevRank.get(b.key)) - (a.rank - prevRank.get(a.key))).slice(0, 3);
  const entrants = cur.list.filter((a) => a.rank <= 100 && !prevRank.has(a.key)).slice(0, 3);
  const ones = cur.list.filter((a) => a.ones > 0).sort((a, b) => b.ones - a.ones).slice(0, 3);
  const tk = (label, a, val) => C.tick(label, a && a.row, a && a.store, a ? val(a) : '', a && a.game);
  const ticker = `<div class="rk-ticker">${tk('이달의 상승', riser[0], (a) => `<span class="rk-chg up">▲${prevRank.get(a.key) - a.rank}</span>`)}${tk('이달의 하락', faller[0], (a) => `<span class="rk-chg down">▼${a.rank - prevRank.get(a.key)}</span>`)}${tk('신규 진입', entrants[0], () => '<span class="rk-chg new">NEW</span>')}${tk('1위 일수', ones[0], (a) => `<span class="rk-chg same">${a.ones}일</span>`)}</div>`;

  const monthList = `<ol class="rk-list wide">${cur.list.slice(0, 100).map((a) => {
    const p = prevRank.get(a.key); const trend = S.monthlyAvg(country, a.row.appId, a.store); const g = a.game;
    return `<li><span class="rk-rk ${a.rank <= 3 ? 'top' : ''}">${a.rank}</span><img src="${esc(C.iconOf(a.row, g))}" alt="" loading="lazy" decoding="async"><div class="nm">${C.nameLink(a.store, a.row)}<span class="dv">${esc(a.row.developer || (g && g.developer) || '')}${a.ones ? `<span class="rk-streak">1위 ${a.ones}일</span>` : ''}${S.isSub(g) ? ' <span class="rk-badge sub">서브컬처</span>' : ''}</span></div><span class="num"><b>${fmt1(avg(a.android))}</b><i>구글플레이 평균</i></span><span class="num"><b>${fmt1(avg(a.ios))}</b><i>앱스토어 평균</i></span><div class="rt">${chg(a.rank, p)}<span class="sub">${p ? `전월 ${p}위` : '신규'}</span></div>${sparkline(trend, { cap: 200, color: trendColor(trend) })}</li>`;
  }).join('')}</ol>`;

  const pub = new Map();
  for (const a of cur.list.slice(0, 100)) { const d = a.row.developer || (a.game && a.game.developer) || '기타'; const p = pub.get(d) || { n: 0, best: 999 }; p.n++; p.best = Math.min(p.best, a.rank); pub.set(d, p); }
  const pubTop = [...pub.entries()].sort((a, b) => b[1].n - a[1].n || a[1].best - b[1].best).slice(0, 10);
  const pubCard = `<div class="rk-card"><h2>퍼블리셔 순위 <small>TOP 100 내 게임 수 · 최고 순위</small></h2><table class="rk-table"><thead><tr><th class="rank">#</th><th>퍼블리셔</th><th class="c">게임 수</th><th class="c">최고</th></tr></thead><tbody>${pubTop.map(([d, p], i) => `<tr><td class="rk-rank">${i + 1}</td><td>${esc(d)}</td><td class="c">${p.n}</td><td class="c">${p.best}위</td></tr>`).join('')}</tbody></table></div>`;
  const subTop = cur.list.filter((a) => S.isSub(a.game)).slice(0, 5);
  const subCard = subTop.length ? `<div class="rk-card"><h2>서브컬처 TOP 5 <small>이달</small></h2><table class="rk-table"><tbody>${subTop.map((a) => `<tr><td class="rk-rank">${a.rank}</td><td>${C.appCell(a.row, a.store)}</td><td class="c">${chg(a.rank, prevRank.get(a.key))}</td></tr>`).join('')}</tbody></table></div>` : '';

  const top = cur.list[0];
  const faq = `<div class="rk-card"><h2>${m}월 순위 한눈에 <small>데이터에서 자동 생성</small></h2><div class="rk-faq">
<p><b>${m}월 1위는?</b> ${nameA(top)}(${esc(top.row.developer || (top.game && top.game.developer) || '')}) — 앱스토어 평균 ${fmt1(avg(top.ios))}위, 구글플레이 평균 ${fmt1(avg(top.android))}위, 앱스토어 1위 ${top.ones}일.</p>
<p><b>가장 많이 오른 게임은?</b> ${riser[0] ? `${nameA(riser[0])} — ${prevRank.get(riser[0].key)}위 → ${riser[0].rank}위` : '-'}.</p>
<p><b>새로 들어온 게임은?</b> ${entrants.length ? entrants.map((a) => nameA(a) + `(${a.rank}위)`).join(', ') : '없음'}.</p>
<p><b>서브컬처 1위는?</b> ${subTop[0] ? `${nameA(subTop[0])} — 통합 ${subTop[0].rank}위` : '-'}.</p></div></div>`;

  const monthLinks = S.months.filter((mo) => S.daysIn(mo).length >= 7);
  const lead = `${y}년 ${m}월 ${COUNTRIES[country]} 앱스토어·구글플레이 매출 순위를 일 평균으로 합산한 월간 통합 순위. 1위 ${nameA(top)}, 2위 ${cur.list[1] ? nameA(cur.list[1]) : '-'}, 3위 ${cur.list[2] ? nameA(cur.list[2]) : '-'}. 집계 ${cur.n}일, 신규 진입 ${cur.list.filter((a) => a.rank <= 100 && !prevRank.has(a.key)).length}개.`;
  const body = `<div class="rk-head"><h1>${y}년 ${m}월 모바일 게임 매출 순위</h1></div>
${subnav(S, 'monthly')}
<div class="rk-toolbar"><div class="rk-tabs months">${monthLinks.map((mo) => `<a class="${mo === month ? 'active' : ''}" href="/rankings/monthly/${mo}/">${mo}</a>`).join('')}</div></div>
${ticker}
<div class="rk-colh"><h2>월간 통합 TOP 100</h2><small>두 스토어 일 평균 순위 합산 · 추이는 월별 평균 ${S.months[0]}~</small></div>
${monthList}
<div class="rk-note">차트 밖(200위 밖)인 날은 201위로 계산합니다. 스토어별 평균은 해당 스토어 차트에 있던 날의 평균입니다.</div>
<div class="rk-grid2">${pubCard}${subCard}</div>
${faq}`;
  const canonical = `${siteBaseUrl}/rankings/monthly/${month}/`;
  return shell(S, {
    body,
    title: `${y}년 ${m}월 모바일 게임 매출 순위 TOP 100 (${COUNTRIES[country]}) | 게이머스크롤`,
    description: lead,
    keywords: `${y}년 ${m}월 모바일 게임 매출 순위, ${m}월 게임 매출 순위, 월간 게임 순위, 앱스토어 월간 순위, 구글플레이 월간 순위`,
    canonical,
    crumbs: [{ name: `${y}년 ${m}월`, url: canonical }],
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
  const rows = cur.list.slice(0, 100).map((a) => { const dp = a.pts - (prevPts.get(a.key) || 0); return `<tr><td class="rk-rank ${a.rank <= 3 ? 'top' : ''}">${a.rank}</td><td>${C.appCell(a.row, a.store)}</td><td class="c">${chg(a.rank, prevRank.get(a.key))}</td><td class="r"><b>${a.pts.toLocaleString()}</b><br><span class="sm ${dp >= 0 ? 'rk-upc' : 'rk-downc'}">${dp >= 0 ? '+' : ''}${dp}</span></td><td class="c">${a.countries.size}</td>${Object.keys(COUNTRIES).map((c) => cell(a, c)).join('')}</tr>`; }).join('');
  const firstTicks = Object.keys(COUNTRIES).map((c) => { const r = today.rows[c].android[0] || today.rows[c].ios[0]; if (!r) return ''; const s = today.rows[c].android[0] ? 'android' : 'ios'; return C.tick(`${COUNTRIES[c]} 1위`, r, s, `<span class="rk-chg same">${S.streakAtOne(c, s, r.appId)}일째</span>`); }).join('');
  const top = cur.list[0];
  const lead = `한국·일본·미국·중국·대만 5개국 × 앱스토어·구글플레이 매출 순위를 포인트(201 − 순위)로 합산한 글로벌 종합 순위. ${tsText(today.ts)} 기준 1위 ${top.game ? top.game.key : top.row.title} ${top.pts.toLocaleString()}점(${top.countries.size}개국 진입).`;
  const body = `<div class="rk-head"><h1>글로벌 모바일 게임 매출 종합 순위</h1></div>
${subnav(S, 'global')}
<div class="rk-ticker">${firstTicks}</div>
<div class="rk-card"><h2>종합 TOP 100 <small>국가 칸 = 앱스토어 / 구글플레이 순위 · 10위 안은 금색</small></h2><div class="rk-scroll"><table class="rk-table"><thead><tr><th class="rank">순위</th><th>게임</th><th class="c">변동</th><th class="r">포인트</th><th class="c">국가</th>${Object.entries(COUNTRIES).map(([c, n]) => `<th class="c"><a href="${countryHref(c)}">${n}</a></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<div class="rk-note">포인트 = Σ(201 − 순위), 차트 밖은 0점. 중국은 앱스토어만 수집합니다. 국가 이름을 누르면 그 나라의 TOP 200으로 이동합니다.</div></div>`;
  const canonical = `${siteBaseUrl}/rankings/global/`;
  return shell(S, {
    body,
    title: '글로벌 모바일 게임 매출 종합 순위 — 한국·일본·미국·중국·대만 합산 | 게이머스크롤',
    description: lead,
    keywords: '글로벌 모바일 게임 매출 순위, 세계 게임 매출 순위, 일본 게임 매출 순위, 미국 게임 매출 순위, 중국 게임 매출 순위, 대만 게임 매출 순위',
    canonical,
    crumbs: [{ name: '글로벌 종합', url: canonical }],
  });
}

// ---------- 4. 역대 기록 ----------
function renderRecords(country = 'kr') {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { days, today } = S;
  const { all, crown } = S.allTimeStats(country, 'ios');
  const cname = COUNTRIES[country];
  const t = (title, sub, head, body) => `<div class="rk-card"><h2>${title} <small>${sub}</small></h2><table class="rk-table"><thead><tr><th class="rank">#</th><th>게임</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  const ones = all.filter((a) => a.ones).sort((x, y) => y.ones - x.ones).slice(0, 10);
  const onesT = t('1위 누적 일수', `${cname} 앱스토어 · ${days.length}일 중`, '<th class="c">1위 일수</th><th class="c">최장 연속</th><th class="c">점유</th>', ones.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="c"><b>${a.ones}</b>일</td><td class="c">${a.bestStreak}일 <span class="rk-dim sm">~${(a.bestStreakEnd || '').slice(5)}</span></td><td class="c">${Math.round((a.ones / days.length) * 100)}%</td></tr>`).join(''));
  const pts = all.slice().sort((x, y) => y.pts - x.pts).slice(0, 10);
  const ptsT = t('누적 포인트', '매일 (201 − 순위) 합산 · 꾸준함의 지표', '<th class="r">포인트</th><th class="c">체류</th><th class="c">평균</th>', pts.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="r"><b>${a.pts.toLocaleString()}</b></td><td class="c">${a.days}일</td><td class="c">${fmt1(avg(a.ranks))}위</td></tr>`).join(''));
  const jumps = all.filter((a) => a.bestJump >= 30).sort((x, y) => y.bestJump - x.bestJump).slice(0, 8);
  const jumpsT = jumps.length ? t('하루 최대 급등', '전일 대비 · 200위 안 기준', '<th class="c">변동</th><th class="c">날짜</th>', jumps.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="c"><span class="rk-chg up">▲${a.bestJump}</span> ${a.bestJumpFrom}→${a.bestJumpTo}위</td><td class="c">${a.bestJumpDay}</td></tr>`).join('')) : '';
  const debuts = all.filter((a) => a.debut != null).sort((x, y) => x.debut - y.debut).slice(0, 8);
  const debutsT = debuts.length ? t('최고 데뷔 순위', '첫 진입일 순위 · 출시 화력', '<th class="c">데뷔</th><th class="c">날짜</th><th class="c">지금</th>', debuts.map((a, i) => `<tr><td class="rk-rank">${i + 1}</td><td>${C.appCell(a.row, 'ios')}</td><td class="c"><b>${a.debut}위</b></td><td class="c">${a.debutDay}</td><td class="c">${S.rankOf(today, country, 'ios', a.row.appId) ?? '차트 밖'}</td></tr>`).join('')) : '';
  const crownT = `<div class="rk-card"><h2>월별 1위 <small>그 달 앱스토어 1위를 가장 많이 한 게임</small></h2><table class="rk-table"><thead><tr><th>월</th><th>1위</th><th class="c">일수</th><th>2위</th><th class="c">일수</th></tr></thead><tbody>${crown.filter((mo) => mo.top).slice().reverse().map((mo) => `<tr><td><a href="/rankings/monthly/${mo.mo}/">${mo.mo}</a></td><td>${C.appCell(mo.top.row, 'ios')}</td><td class="c"><b>${mo.top.n}</b>/${mo.n}</td><td>${mo.second ? C.appCell(mo.second.row, 'ios') : '-'}</td><td class="c">${mo.second ? mo.second.n : '-'}</td></tr>`).join('')}</tbody></table></div>`;
  const longest = all.slice().sort((x, y) => y.bestStreak - x.bestStreak)[0];
  const rec = (label, a, val) => (a ? C.tick(label, a.row, 'ios', val) : '');
  const ticker = `<div class="rk-ticker">${rec('1위 최다', ones[0], `<span class="rk-chg same">${ones[0] ? ones[0].ones : 0}일</span>`)}${rec('최장 연속 1위', longest, `<span class="rk-chg same">${longest ? longest.bestStreak : 0}일</span>`)}${rec('누적 포인트 1위', pts[0], `<span class="rk-chg same">${pts[0] ? pts[0].pts.toLocaleString() : ''}</span>`)}${jumps[0] ? rec('하루 최대 급등', jumps[0], `<span class="rk-chg up">▲${jumps[0].bestJump}</span>`) : ''}${debuts[0] ? rec('최고 데뷔', debuts[0], `<span class="rk-chg new">${debuts[0].debut}위</span>`) : ''}</div>`;
  const lead = `${days[0].date}부터 ${today.date}까지 ${days.length}일 동안의 ${cname} 앱스토어 매출 순위 기록. 1위 누적 ${ones[0] ? `${S.nameOf('ios', ones[0].row)} ${ones[0].ones}일` : '-'}, 누적 포인트 1위 ${pts[0] ? S.nameOf('ios', pts[0].row) : '-'}${jumps[0] ? `, 하루 최대 급등 ${S.nameOf('ios', jumps[0].row)} ▲${jumps[0].bestJump}` : ''}. 매일 자동 갱신.`;
  const body = `<div class="rk-head"><h1>모바일 게임 매출 순위 역대 기록</h1></div>
${subnav(S, 'records')}
${ticker}
<div class="rk-grid2">${onesT}${ptsT}</div>
<div class="rk-grid2">${jumpsT}${debutsT}</div>
${crownT}`;
  const canonical = `${siteBaseUrl}/rankings/records/`;
  return shell(S, {
    body,
    title: '모바일 게임 매출 순위 역대 기록 — 1위 일수·최장 연속·최대 급등·최고 데뷔 | 게이머스크롤',
    description: lead,
    keywords: '모바일 게임 매출 순위 기록, 앱스토어 1위 최장 기록, 게임 매출 1위 일수, 모바일 게임 역대 순위',
    canonical,
    crumbs: [{ name: '역대 기록', url: canonical }],
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
  const rows = list.slice(0, 100).map((p) => `<tr><td class="rk-rank ${p.rank <= 3 ? 'top' : ''}">${p.rank}</td><td>${paged.has(p.slug) ? `<a class="rk-pubname" href="/rankings/publishers/${encodeURIComponent(p.slug)}/">${esc(p.name)}</a>` : `<span class="rk-pubname">${esc(p.name)}</span>`}<div class="rk-pubicons">${p.gameList.slice(0, 4).map((e) => `<img src="${esc(C.iconOf(e.row, e.g))}" alt="${esc(S.nameOf(e.store, e.row))}" title="${esc(S.nameOf(e.store, e.row))}" loading="lazy">`).join('')}</div></td><td class="c"><b>${p.games.size}</b></td><td class="c">${p.best}위</td><td class="c">${p.top10 || '-'}</td><td class="r"><b>${p.pts.toLocaleString()}</b></td></tr>`).join('');
  const lead = `${cname} 앱스토어·구글플레이 매출 TOP 200 에 든 게임을 개발사별로 묶은 순위. 포인트 1위 ${list[0] ? `${list[0].name}(${list[0].games.size}개 게임)` : '-'}, 2위 ${list[1] ? list[1].name : '-'}, 3위 ${list[2] ? list[2].name : '-'}. ${tsText(today.ts)} 기준, 매일 갱신.`;
  const body = `<div class="rk-head"><h1>모바일 게임 개발사 순위</h1></div>
${subnav(S, 'pub')}
<div class="rk-card"><h2>개발사 TOP ${Math.min(100, list.length)} <small>${list.length}개 개발사 · ${cname} 매출 TOP 200 기준</small></h2><table class="rk-table rk-pubtable"><thead><tr><th class="rank">#</th><th>개발사</th><th class="c">게임 수</th><th class="c">최고 순위</th><th class="c">TOP 10</th><th class="r">포인트</th></tr></thead><tbody>${rows}</tbody></table>
<div class="rk-note">개발사 이름은 스토어 등록명 기준이며 법인 접미어(Corp., Co., Ltd. 등) 차이는 같은 개발사로 묶습니다. 자회사·퍼블리셔가 다른 이름으로 등록된 경우는 따로 집계됩니다.</div></div>`;
  const canonical = `${siteBaseUrl}/rankings/publishers/`;
  return shell(S, {
    body,
    title: `모바일 게임 개발사 순위 — 매출 TOP 200 내 게임 수·포인트 (${today.date}) | 게이머스크롤`,
    description: lead,
    keywords: '게임 개발사 순위, 게임 퍼블리셔 순위, 넥슨 게임 순위, 엔씨소프트 게임 순위, 넷마블 게임 순위, 모바일 게임 회사 순위',
    canonical,
    crumbs: [{ name: '개발사', url: canonical }],
  });
}
function renderPublisher(pub, country = 'kr') {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today, days, rankOf, seriesOf } = S;
  const cname = COUNTRIES[country];
  const cell = (e, s) => { const v = e.ranks[s]; if (v == null) return '<td class="c"><span class="rk-dim">·</span></td><td class="c"></td>'; return `<td class="c"><b>${v}</b></td><td class="c">${chg(v, e.prev[s])}</td>`; };
  const rows = pub.gameList.map((e) => { const s = e.ranks.ios ? 'ios' : 'android'; const id = e.row.appId; const ser = seriesOf(country, s, id); return `<tr><td>${C.appCell(e.row, e.store)}</td>${cell(e, 'ios')}${cell(e, 'android')}<td class="spk">${sparkline(ser.slice(-30), { cap: 200, color: trendColor(ser.slice(-30)) })}</td><td class="c">${S.util.min(ser) ?? '-'}</td><td class="c">${S.daysOnChart(country, s, id)}일</td></tr>`; }).join('');
  // 30일 추이: 두 스토어 TOP 200 내 게임 수 · 포인트
  const hist = days.slice(-30).map((d) => { let n = 0, pts = 0; for (const s of Object.keys(STORES)) (d.rows[country][s] || []).forEach((r, i) => { const g = S.gameOf(s, r); if (pubKey((g && g.developer) || r.developer) === pub.key) { n++; pts += 200 - i; } }); return { n, pts }; });
  const kpi = `<div class="rk-stats">
<div class="rk-stat"><div class="l">매출 TOP 200 내 게임</div><div class="v">${pub.games.size}<small>개</small></div><div class="s">앱스토어 ${pub.gameList.filter((e) => e.ranks.ios).length} · 구글플레이 ${pub.gameList.filter((e) => e.ranks.android).length}</div>${sparkline(hist.map((h) => h.n), { w: 100, h: 30, cap: 999, color: 'var(--rk-accent)' })}</div>
<div class="rk-stat"><div class="l">최고 순위</div><div class="v">${pub.best}<small>위</small></div><div class="s">${pub.gameList[0] ? esc(S.nameOf(pub.gameList[0].store, pub.gameList[0].row)) : ''}</div></div>
<div class="rk-stat"><div class="l">TOP 10 게임</div><div class="v">${pub.top10}<small>개</small></div><div class="s">두 스토어 합산</div></div>
<div class="rk-stat"><div class="l">포인트</div><div class="v">${pub.pts.toLocaleString()}</div><div class="s">개발사 순위 ${pub.rank}위 · 30일 추이</div>${sparkline(hist.map((h) => h.pts), { w: 100, h: 30, cap: 1e9, color: 'var(--rk-accent)' })}</div>
</div>`;
  const lead = `${pub.name}의 ${today.date} ${cname} 모바일 게임 매출 순위. TOP 200 내 ${pub.games.size}개 게임, 최고 ${pub.best}위${pub.gameList[0] ? `(${S.nameOf(pub.gameList[0].store, pub.gameList[0].row)})` : ''}, 개발사 포인트 순위 ${pub.rank}위.`;
  const body = `<div class="rk-head"><h1>${esc(pub.name)} 게임 매출 순위</h1></div>
${subnav(S, 'pub')}
${kpi}
<div class="rk-card"><h2>오늘 순위 <small>앱스토어 · 구글플레이 · 30일 추이 · 역대 최고 · 체류일</small></h2><div class="rk-scroll"><table class="rk-table"><thead><tr><th>게임</th><th class="c" colspan="2">앱스토어</th><th class="c" colspan="2">구글플레이</th><th class="spk">30일</th><th class="c">역대 최고</th><th class="c">체류</th></tr></thead><tbody>${rows}</tbody></table></div></div>
<div class="rk-links rk-links-row"><a href="/rankings/publishers/">개발사 순위 전체</a><a href="${countryHref(country)}">${cname} 매출 순위 TOP 200</a><a href="/rankings/monthly/${S.latestMonth}/">${S.latestMonth} 월간 순위</a></div>`;
  const canonical = `${siteBaseUrl}/rankings/publishers/${encodeURIComponent(pub.slug)}/`;
  return shell(S, {
    body,
    title: `${pub.name} 게임 매출 순위 — 앱스토어·구글플레이 TOP 200 내 ${pub.games.size}개 (${today.date}) | 게이머스크롤`,
    description: lead,
    keywords: `${pub.name} 게임 순위, ${pub.name} 매출 순위, ${pub.name} 모바일 게임, ${pub.name} 신작`,
    canonical,
    crumbs: [{ name: '개발사', url: `${siteBaseUrl}/rankings/publishers/` }, { name: pub.name, url: canonical }],
  });
}

// ---------- 4c. 산출 방법 ----------
function renderAbout() {
  const S = loadRankStats();
  const { days, today } = S;
  const body = `<div class="rk-head"><h1>순위 데이터 산출 방법</h1></div>
${subnav(S, '')}
<div class="rk-card"><h2>데이터 출처와 수집</h2><div class="rk-faq">
<p><b>무엇을 수집하나요?</b> 애플 앱스토어와 구글플레이의 공개 게임 차트(매출 · 무료 다운로드)를 한국 · 일본 · 미국 · 중국 · 대만 5개국에서 각각 1위부터 200위까지 수집합니다. 중국은 구글플레이가 없어 앱스토어만 있습니다. 원스토어·갤럭시스토어는 포함되지 않습니다.</p>
<p><b>얼마나 자주?</b> 하루 여러 차례 수집하고, 페이지에 표시되는 "갱신" 시각이 마지막 수집 시각입니다. 일별 이력은 하루 한 번 저장되어 순위 추이·월간 순위·역대 기록의 바탕이 됩니다. 스토어 차트 자체가 몇 시간 단위로 바뀌므로 스토어 앱에서 보는 순위와 조금 다를 수 있습니다.</p>
<p><b>게임 페이지와 연결</b> 차트의 앱 ID를 게이머스크롤 게임 DB와 연결해 게임 페이지로 이어집니다. DB에 없는 게임은 이름만 표시됩니다.</p>
</div></div>
<div class="rk-card"><h2>각 순위의 계산식</h2><div class="rk-faq">
<p><b>실시간 매출 · 인기</b> 스토어 차트 순위 그대로입니다. "변동"은 전날 저장된 일별 이력과의 차이, "7일"은 최근 7일 일별 순위의 선 그래프입니다. 1위 옆 "N일째"는 일별 이력에서 연속으로 1위였던 날수입니다.</p>
<p><b>월간 통합</b> 그 달의 일별 순위를 스토어별로 평균 낸 뒤 두 스토어 평균을 다시 평균합니다. 차트(200위) 밖인 날은 201위로 계산하므로, 매일 두 스토어 모두 상위에 있는 게임이 유리합니다. 매출 추정치가 아니라 순위 기반 지표입니다.</p>
<p><b>글로벌 종합</b> 5개국 × 2스토어 각 차트에서 (201 − 순위) 포인트를 주고 합산합니다. 차트 밖은 0점입니다. 국가별 시장 규모 가중치는 없습니다.</p>
<p><b>역대 기록</b> 한국 앱스토어 매출 차트 일별 이력에서 1위 누적 일수, 최장 연속 1위, 누적 포인트(매일 201 − 순위), 하루 최대 급등, 첫 진입일 순위(데뷔)를 계산합니다. 집계 시작일(${days[0].date})에 이미 차트에 있던 게임의 "데뷔"는 집계하지 않습니다.</p>
<p><b>개발사 순위</b> 오늘 한국 두 스토어 매출 TOP 200 에 든 게임을 개발사별로 묶어 (200 − 순위 + 1) 포인트를 합산합니다. 법인 접미어(Corp., Co., Ltd. 등) 차이는 같은 개발사로 봅니다.</p>
<p><b>서브컬처</b> 게이머스크롤이 관리하는 서브컬처(수집형·미소녀·애니 원작) 게임 목록에 있는 게임만 전체 매출 차트에서 골라낸 것입니다. 순위 숫자는 전체 차트에서의 순위입니다.</p>
</div></div>
<div class="rk-card"><h2>한계와 주의</h2><div class="rk-faq">
<p><b>매출 금액이 아닙니다.</b> 모든 지표는 스토어가 공개하는 "순위"에서 파생된 것으로, 실제 매출액·다운로드 수와는 다릅니다. 순위 기반 매출 추정 모델은 준비 중이며, 도입되면 추정치임을 함께 표시합니다.</p>
<p><b>과거 데이터 보정</b> 2025년 12월 초 이력은 앱 ID 없이 제목만 저장된 초기 포맷이라, 게임 DB의 이름·별칭으로 연결해 사용합니다. 연결되지 않은 일부 게임은 그 기간 순위가 빠질 수 있습니다.</p>
<p><b>정정</b> 잘못 연결된 게임, 빠진 서브컬처 게임, 개발사 묶음 오류는 게임 DB에서 바로잡으면 다음 빌드부터 모든 순위 페이지에 함께 반영됩니다.</p>
</div></div>`;
  const canonical = `${siteBaseUrl}/rankings/about/`;
  return shell(S, {
    body,
    title: '모바일 게임 순위 산출 방법 — 데이터 출처·수집 주기·계산식 | 게이머스크롤',
    description: '게이머스크롤 모바일 게임 순위의 데이터 출처(앱스토어·구글플레이 5개국 TOP 200), 수집 주기, 월간 통합·글로벌 종합·역대 기록·개발사 순위의 계산식과 한계를 설명합니다.',
    keywords: '게임 순위 산출 방법, 앱스토어 매출 순위 기준, 구글플레이 매출 순위 기준, 게임 순위 데이터',
    canonical,
    crumbs: [{ name: '산출 방법', url: canonical }],
  });
}

// ---------- 5. 게임 페이지 순위 요약 (정적 카드) ----------
function renderGameRankSummary(gameInfo, slug) {
  const S = loadRankStats();
  const { days, today, rankOf, seriesOf } = S;
  const ids = { ios: gameInfo.appIds && gameInfo.appIds.ios, android: gameInfo.appIds && gameInfo.appIds.android };
  if (!ids.ios && !ids.android) return null;
  const name = gameInfo.key || gameInfo.name || slug;
  // 기준 스토어: 앱스토어 이력이 있으면 앱스토어, 없으면 구글플레이
  const kr = seriesOf('kr', 'ios', ids.ios), krA = seriesOf('kr', 'android', ids.android);
  const useIos = nums(kr).length >= nums(krA).length;
  const base = useIos ? kr : krA, baseStore = useIos ? 'ios' : 'android', baseId = useIos ? ids.ios : ids.android;
  const other = useIos ? krA : kr, otherStore = useIos ? 'android' : 'ios';
  const present = nums(base);
  if (present.length < 2) return null;
  const last = (a) => a[a.length - 1];
  const cur = last(base), prev = base[base.length - 2];
  const last30 = base.slice(-30);
  const allBest = min(base);
  const bestDay = days[base.indexOf(allBest)] && days[base.indexOf(allBest)].date;
  const seen = S.firstSeen('kr', baseStore, baseId);
  const top1Days = base.filter((x) => x === 1).length;
  const streak = S.streakAtOne('kr', baseStore, baseId);
  const vol30 = std(last30);
  const stayPct = Math.round((present.length / days.length) * 100);

  const text = `${name}의 ${today.date} 한국 ${STORES[baseStore]} 매출 순위 ${cur != null ? `${cur}위` : '200위 밖'}${prev != null && cur != null ? ` (전일 ${dirText(cur, prev)})` : ''}, ${STORES[otherStore]} ${last(other) != null ? `${last(other)}위` : '200위 밖'}. 30일 평균 ${fmt1(avg(last30))}위, 역대 최고 ${allBest}위(${bestDay}), 1위 ${top1Days}일, 차트 체류 ${present.length}일.`;

  // 90일 차트
  const N = Math.min(90, days.length), W = 1040, H = 240, L = 36, R = 12, T = 12, B = 28;
  const win = days.slice(-N);
  const x = (i) => L + (i / Math.max(win.length - 1, 1)) * (W - L - R);
  const winMax = Math.max(5, ...nums([...base.slice(-N), ...other.slice(-N)]).filter((r) => r <= 100));
  const yMax = winMax <= 10 ? 10 : winMax <= 25 ? 25 : winMax <= 50 ? 50 : 100;
  const yv = (r) => T + ((Math.min(r, yMax) - 1) / (yMax - 1)) * (H - T - B);
  const poly = (arr, color) => { let d = ''; let open = false; arr.slice(-N).forEach((r, i) => { if (r == null || r > yMax) { open = false; return; } d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(r).toFixed(1) + ' '; open = true; }); return d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` : ''; };
  const gridY = ({ 10: [1, 3, 5, 10], 25: [1, 5, 10, 25], 50: [1, 10, 25, 50], 100: [1, 10, 25, 50, 100] })[yMax].map((r) => `<line x1="${L}" x2="${W - R}" y1="${yv(r)}" y2="${yv(r)}" stroke="var(--rk-line)"/><text x="${L - 6}" y="${yv(r) + 4}" font-size="11" fill="var(--rk-dim)" text-anchor="end">${r}</text>`).join('');
  const ticks = [0, Math.floor(win.length / 3), Math.floor((2 * win.length) / 3), win.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" font-size="11" fill="var(--rk-dim)" text-anchor="middle">${win[i].date.slice(5)}</text>`).join('');
  const chart = `<svg class="rk-chartsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${N}일 한국 매출 순위 추이">${gridY}${ticks}${poly(kr, 'var(--rk-ios)')}${poly(krA, 'var(--rk-and)')}</svg><div class="rk-pill"><span class="ios">— 앱스토어</span><span class="and">— 구글플레이</span></div>`;

  // 시간대별
  const hrs = S.hourlyRanks(baseStore, 'kr', baseId);
  const hourCard = hrs && nums(hrs.map((h) => h.rank)).length ? (() => { const hi = Math.max(...nums(hrs.map((h) => h.rank)), 1); return `<div class="rk-card"><h2>시간대별 순위 <small>${S.hourly.date} · 한국 ${STORES[baseStore]} · ${hrs.length}회 수집</small></h2><div class="rk-hours">${hrs.map((h) => `<div style="height:${h.rank ? Math.max(6, 100 - ((h.rank - 1) / Math.max(hi - 1, 1)) * 90) : 3}%"><b>${h.rank ?? '-'}</b></div>`).join('')}</div><div class="rk-hours-x">${hrs.map((h) => `<span>${h.time}</span>`).join('')}</div><div class="rk-note">막대가 높을수록 순위가 높습니다. 하루 안의 등락은 결제 이벤트·업데이트 시각을 보여 줍니다.</div></div>`; })() : '';

  // 순위 분포 · 요일
  const bands = [['1위', (r) => r === 1, 'var(--rk-band1)'], ['2~3위', (r) => r >= 2 && r <= 3, 'var(--rk-band2)'], ['4~10위', (r) => r >= 4 && r <= 10, 'var(--rk-band3)'], ['11~30위', (r) => r >= 11 && r <= 30, 'var(--rk-band4)'], ['31~100위', (r) => r >= 31 && r <= 100, 'var(--rk-band5)'], ['101~200위', (r) => r > 100, 'var(--rk-band6)']];
  const dist = bands.map(([n, f, c]) => [n, present.filter(f).length, c]);
  const distCard = `<div class="rk-card"><h2>순위 분포 <small>차트 진입 ${present.length}일 · 한국 ${STORES[baseStore]}</small></h2><div class="rk-bar">${dist.map(([n, k, c]) => `<span style="width:${(k / present.length) * 100}%;background:${c}" title="${n} ${k}일"></span>`).join('')}</div><div class="rk-legend">${dist.filter(([, k]) => k).map(([n, k, c]) => `<span><i style="background:${c}"></i>${n} ${k}일 (${Math.round((k / present.length) * 100)}%)</span>`).join('')}</div>
<div class="rk-kpirow"><span>연속 1위 <b>${streak}일</b></span><span>30일 변동성 <b>${fmt1(vol30)}</b>${vol30 != null && vol30 < 3 ? ' (안정)' : ''}</span>${nums(other.slice(-30)).length ? `<span>스토어 격차 <b>${fmt1(avg(other.slice(-30)) - avg(last30))}</b> (${STORES[otherStore]} − ${STORES[baseStore]} 평균)</span>` : ''}</div></div>`;
  const wd = ['일', '월', '화', '수', '목', '금', '토'];
  const byWd = wd.map((_, i) => avg(days.slice(-90).filter((d) => new Date(d.date).getDay() === i).map((d) => rankOf(d, 'kr', baseStore, baseId))));
  const wdCard = `<div class="rk-card"><h2>요일별 평균 순위 <small>최근 90일 · 한국 ${STORES[baseStore]}</small></h2><div class="rk-wk">${wd.map((n, i) => `<div><b>${fmt1(byWd[i])}</b>${n}</div>`).join('')}</div><div class="rk-note">주말 결제 패턴·정기 업데이트 요일이 드러납니다.</div></div>`;

  // 국가별
  const countryRows = Object.keys(COUNTRIES).map((c) => `<tr><td><a href="${countryHref(c)}">${COUNTRIES[c]}</a></td><td class="c">${rankOf(today, c, 'ios', ids.ios) ?? '-'}</td><td class="spk">${sparkline(days.slice(-30).map((d) => rankOf(d, c, 'ios', ids.ios)), { cap: 200, color: 'var(--rk-ios)' })}</td><td class="c">${rankOf(today, c, 'android', ids.android) ?? '-'}</td><td class="spk">${sparkline(days.slice(-30).map((d) => rankOf(d, c, 'android', ids.android)), { cap: 200, color: 'var(--rk-and)' })}</td><td class="c">${min(seriesOf(c, 'ios', ids.ios)) ?? '-'}</td></tr>`).join('');
  const countryCard = `<div class="rk-card"><h2>국가별 순위 <small>5개국 · 매출 · 30일 추이</small></h2><table class="rk-table"><thead><tr><th>국가</th><th class="c">앱스토어</th><th class="spk">30일</th><th class="c">구글플레이</th><th class="spk">30일</th><th class="c">역대 최고</th></tr></thead><tbody>${countryRows}</tbody></table></div>`;

  // 월별 표
  const mrow = S.months.map((mo) => { const dd = S.daysIn(mo); return { mo, iosAvg: avg(dd.map((d) => rankOf(d, 'kr', 'ios', ids.ios))), andAvg: avg(dd.map((d) => rankOf(d, 'kr', 'android', ids.android))), best: min(dd.map((d) => rankOf(d, 'kr', baseStore, baseId))), ones: dd.filter((d) => rankOf(d, 'kr', baseStore, baseId) === 1).length, n: dd.length }; });
  const monthlyCard = `<div class="rk-card"><h2>월별 추이 <small>한국 · 평균 순위</small></h2><table class="rk-table"><thead><tr><th>월</th><th class="c">앱스토어</th><th class="c">전월</th><th class="c">구글플레이</th><th class="c">최고</th><th class="c">1위 일수</th></tr></thead><tbody>${mrow.slice().reverse().map((r, i, arr) => { const p = arr[i + 1]; const d = p && p.iosAvg != null && r.iosAvg != null ? p.iosAvg - r.iosAvg : null; return `<tr><td><a href="/rankings/monthly/${r.mo}/">${r.mo}</a></td><td class="c">${fmt1(r.iosAvg)}</td><td class="c">${d == null ? '-' : d > 0 ? `<span class="rk-chg up">▲${d.toFixed(1)}</span>` : d < 0 ? `<span class="rk-chg down">▼${(-d).toFixed(1)}</span>` : '='}</td><td class="c">${fmt1(r.andAvg)}</td><td class="c">${r.best ?? '-'}</td><td class="c">${r.ones || '-'}</td></tr>`; }).join('')}</tbody></table></div>`;

  // 기록 타임라인
  const events = [];
  if (seen) events.push([seen, `한국 ${STORES[baseStore]} 매출 200위 안 첫 진입${seen === days[0].date ? ' (집계 시작일)' : ''}`]);
  if (bestDay) events.push([bestDay, `역대 최고 ${allBest}위 달성`]);
  let run = 0, runStart = null;
  base.forEach((r, i) => { if (r === 1) { if (!run) runStart = days[i].date; run++; } else { if (run >= 7) events.push([runStart, `1위 ${run}일 연속 (~${days[i - 1].date})`]); run = 0; } });
  if (run >= 7) events.push([runStart, `1위 ${run}일 연속 진행 중`]);
  base.forEach((r, i) => { if (i > 0 && base[i - 1] != null && r != null && base[i - 1] - r >= 20) events.push([days[i].date, `하루 만에 ${base[i - 1]}위 → ${r}위 급등`]); });
  const recordCard = events.length ? `<div class="rk-card"><h2>기록 <small>데이터에서 자동 생성</small></h2><ul class="rk-timeline">${events.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([d, t]) => `<li><span class="d">${d}</span><span>${t}</span></li>`).join('')}</ul></div>` : '';

  const stats = `<div class="rk-stats">
<div class="rk-stat"><div class="l">현재 순위 · 한국 ${STORES[baseStore]}</div><div class="v">${cur ?? '-'}<small>${cur != null ? '위' : '200위 밖'}</small></div><div class="s">${prev != null && cur != null ? '전일 ' + dirText(cur, prev) + ' · ' : ''}${STORES[otherStore]} ${last(other) ?? '-'}위</div>${sparkline(last30, { w: 100, h: 30 })}</div>
<div class="rk-stat"><div class="l">30일 최고 / 평균</div><div class="v">${min(last30) ?? '-'}<small>위</small></div><div class="s">평균 ${fmt1(avg(last30))}위 · 변동성 ${fmt1(vol30)}</div></div>
<div class="rk-stat"><div class="l">역대 최고 · 1위 일수</div><div class="v">${allBest ?? '-'}<small>위</small></div><div class="s">${bestDay || ''} · 1위 ${top1Days}일${streak > 1 ? ` · 연속 ${streak}일째` : ''}</div></div>
<div class="rk-stat"><div class="l">차트 체류</div><div class="v">${present.length}<small>일</small></div><div class="s">${seen || ''}부터 · 전체 기간의 ${stayPct}%</div></div>
</div>`;

  const html = `<div class="rk rk-game">
<p class="rk-lead">${esc(text)}</p>
${stats}
<div class="rk-card"><h2>순위 추이 — 최근 ${N}일 <small>한국 · 매출</small></h2><div class="rk-chart">${chart}</div></div>
${hourCard}
<div class="rk-grid2">${distCard}${wdCard}</div>
${countryCard}
<div class="rk-grid2">${monthlyCard}${recordCard}</div>
</div>`;
  return { html, text, cur, baseStore, days: present.length };
}

module.exports = { renderRankingsHub, renderSubculture, renderMonthly, renderGlobal, renderRecords, renderPublishers, renderPublisher, renderAbout, renderGameRankSummary, publisherIndex, publisherPages, countryHref, makeCtx, storeList, chg, sparkline, trendColor };
