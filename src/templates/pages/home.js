'use strict';
/**
 * 홈 (/) — 네 허브(모바일 · 스팀 · 리포트 · 게임 DB)의 오늘 요약만 모은 얼굴 페이지.
 * 순위 표 전체는 /rankings/ 와 /steam/ 이 소유하고, 여기서는 TOP 10 · TOP 5 조각과 이동 링크만 둔다.
 * 스타일은 60-rank-chart.css(.rk-*) 와 62-rank-home.css(.rk-home-*).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { listLink } = require('../components/list-actions');
const { loadRankStats, STORES, util } = require('../../rank/stats');
const { loadSteamStats } = require('../../rank/steam-stats');
const { loadReports, reportsFor } = require('../../rank/reports');
const { makeCtx, storeList, countryHref, chg } = require('./rank-hub');

const siteBaseUrl = 'https://gamerscroll.com';
const { esc, tsText, avg, min, fmt1 } = util;
const fmt = (n) => Math.round(n || 0).toLocaleString('ko-KR');
const rankCell = (rank) => `<td class="rk-rank ${rank <= 3 ? 'top' : ''}">${rank}</td>`;
const EMPTY = '<tr><td class="rk-dim" style="height:40px">해당 데이터가 없습니다.</td></tr>';
const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

// 값이 클수록 위로 가는 스파크라인 (동접자용). 순위용은 rank-hub.sparkline.
function sparkUp(arr, { w = 120, h = 36, color = 'var(--rk-accent)' } = {}) {
  const v = arr.map((x) => (x == null ? null : Number(x)));
  const present = v.filter((x) => x != null);
  if (present.length < 2) return '';
  const lo = Math.min(...present); const hi = Math.max(...present);
  const x = (i) => (i / Math.max(1, v.length - 1)) * (w - 2) + 1;
  const y = (val) => h - 2 - ((val - lo) / Math.max(1, hi - lo)) * (h - 4);
  let d = ''; let open = false;
  v.forEach((val, i) => { if (val == null) { open = false; return; } d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1) + ' '; open = true; });
  const last = v[v.length - 1];
  return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>${last != null ? `<circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2.5" fill="${color}"/>` : ''}</svg>`;
}

// 30일 순위 추이 큰 차트 (1위가 위). 차트 밖(null)은 선을 끊는다.
// mobile: 좁은 viewBox(330px) 변형 — 두 벌을 렌더하고 CSS(.rk-chartsvg-m)로 화면 폭에 따라 하나만 보인다 (2026-09-09).
function rankChart(series, dates, { w = 560, h = 230, ranked = true, mobile = false } = {}) {
  const vals = series.map((v) => (v == null || (ranked && v > 200) ? null : v));
  const present = vals.filter((v) => v != null);
  if (present.length < 2) return mobile ? '' : '<p class="rk-empty">추이 표시에 필요한 기록이 부족합니다.</p>';
  const lo = ranked ? 1 : 0; const hi = Math.max(ranked ? 10 : 1, ...present);
  const padL = mobile ? 40 : 36; const padR = 14; const padT = 14; const padB = 28;
  const fs = mobile ? 12 : 10; const fsX = mobile ? 12 : 11; const xTicks = mobile ? 4 : 6;
  const x = (i) => padL + (i / Math.max(1, vals.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (ranked ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const ticks = [lo, Math.round(lo + (hi - lo) / 3), Math.round(lo + (2 * (hi - lo)) / 3), hi].filter((t, i, a) => a.indexOf(t) === i);
  const grid = ticks.map((t) => `<line x1="${padL}" x2="${w - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--rk-line)" /><text x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" font-size="${fs}" fill="var(--rk-dim)" text-anchor="end">${ranked ? `${t}위` : t >= 10000 ? `${(t / 10000).toFixed(0)}만` : fmt(t)}</text>`).join('');
  const step = Math.max(1, Math.ceil(vals.length / xTicks));
  const labels = dates.map((d, i) => (i % step === 0 || i === dates.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="${fsX}" fill="var(--rk-dim)" text-anchor="middle">${d.slice(5)}</text>` : '')).join('');
  let d = ''; let open = false;
  vals.forEach((v, i) => { if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`; open = true; });
  const li = vals.length - 1; const lv = vals[li];
  return `<svg class="rk-chartsvg${mobile ? ' rk-chartsvg-m' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="최근 ${series.length}일 ${ranked ? '순위' : '동접자'} 추이">${grid}${labels}<path d="${d}" fill="none" stroke="var(--rk-accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${lv != null ? `<circle cx="${x(li).toFixed(1)}" cy="${y(lv).toFixed(1)}" r="4" fill="var(--rk-accent)"/>` : ''}</svg>`;
}

function renderHome() {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today, yday, days, rankOf } = S;
  const country = 'kr';
  const hasAnd = (today.rows[country].android || []).length > 0;
  const mv = S.movers(country, 'ios');
  let ST = null;
  try { ST = loadSteamStats(); } catch {}
  let reports = [];
  try { reports = loadReports(); } catch {}
  const iosRows = today.rows[country].ios.map((r, i) => ({ r, rank: i + 1, prev: rankOf(yday, country, 'ios', r.appId), g: S.gameOf('ios', r) }));

  // ---------- 1. 요약 카드 4장 (형태를 서로 다르게) ----------
  // ① 오늘의 1위: 구글플레이 · 앱스토어 · 스팀 — 큰 아이콘 3개
  const oneRow = (label, r, s, href, icon, name, val) => `<a class="one" href="${href}"><img src="${esc(icon)}" alt="" loading="lazy"><div><span class="l">${label}</span><span class="n">${esc(name)}</span></div>${val}</a>`;
  const top1 = (s) => { const r = today.rows[country][s][0]; if (!r) return ''; const g = S.gameOf(s, r); return oneRow(`${STORES[s]} 1위`, r, s, C.hrefOf(g) || countryHref(country), C.iconOf(r, g), S.nameOf(s, r), `<span class="rk-chg same">${S.streakAtOne(country, s, r.appId)}일째</span>`); };
  const steam1 = ST && ST.today.mp[0] ? (() => { const r = ST.today.mp[0]; const m = ST.info(r.appid); return oneRow('스팀 동접 1위', r, null, `/steam/${m.appid}/`, m.img, m.name, `<span class="rk-chg same">${fmt(r.ccu)}</span>`); })() : '';
  const cardTop1 = `<div class="rk-hcard"><h3>플랫폼별 1위</h3><div class="ones">${hasAnd ? top1('android') : ''}${top1('ios')}${steam1}</div></div>`;
  // ② 급등 TOP 5 · ③ 신규 진입 TOP 5 (앱스토어)
  const risers = iosRows.filter((x) => x.prev != null && x.prev - x.rank >= 3 && x.rank <= 200).sort((a, b) => (b.prev - b.rank) - (a.prev - a.rank)).slice(0, 5);
  const fresh = iosRows.filter((x) => x.prev == null && x.rank <= 200).slice(0, 5);
  const miniRow = (x, val) => `<a class="mrow" href="${C.hrefOf(x.g) || countryHref(country)}"><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy"><span class="n">${esc(S.nameOf('ios', x.r))}</span><span class="r">${x.rank}위</span>${val}</a>`;
  const cardUp = `<div class="rk-hcard"><h3>순위 상승</h3>${risers.map((x) => miniRow(x, `<span class="rk-chg up">▲${x.prev - x.rank}</span>`)).join('') || '<p class="none">해당 게임이 없습니다.</p>'}</div>`;
  const cardNew = `<div class="rk-hcard"><h3>신규 진입</h3>${fresh.map((x) => miniRow(x, '<span class="rk-chg new">NEW</span>')).join('') || '<p class="none">신규 진입 게임이 없습니다.</p>'}</div>`;
  // ④ 스팀 동접 합계: 큰 숫자 + 30일 스파크라인
  let cardSteam = '';
  if (ST) {
    const total = ST.sumToday(ST.today);
    const total7 = avg(ST.days.slice(-8, -1).map(ST.sumToday));
    const p = pct(total, total7);
    cardSteam = `<div class="rk-hcard steam"><h3>스팀 동접 합계 <small>TOP 100</small></h3><div class="big">${fmt(total)}</div><div class="sub">${p != null ? `<span class="rk-chg ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(1)}%</span> 7일 평균 대비` : ''}</div>${sparkUp(ST.days.slice(-30).map(ST.sumToday), { w: 240, h: 56 })}<a class="foot" href="/steam/">스팀 순위 ›</a></div>`;
  }
  const hcards = `<div class="rk-hcards">${cardTop1}${cardSteam}</div>`;
  const moversSec = `<section class="rk-section"><h2>주요 순위 변동 <small>앱스토어 매출 · 전일 대비</small></h2><div class="rk-hmovers">${cardUp}${cardNew}</div></section>`;

  // 순위 행을 선택하면 옆의 차트와 기록이 함께 바뀐다. 최초 내용은 정적 HTML로 제공한다.
  const previews = {};
  const addPreview = (key, entry) => {
    const values = entry.series.filter((v) => v != null);
    const mean = avg(values);
    const best = values.length ? (entry.ranked ? Math.min(...values) : Math.max(...values)) : null;
    const unit = entry.ranked ? '위' : '명';
    const rel = reportsFor(reports, { name: entry.name, slug: entry.slug }, 1);
    previews[key] = `<div class="rk-preview-label"><span>게임별 추이</span><span>${esc(entry.label)}</span></div>
<div class="rk-preview-title"><img src="${esc(entry.icon)}" alt=""><div><h2>${esc(entry.name)}</h2><p>${esc(entry.developer || '')}</p></div></div>
<div class="rk-preview-value"><strong>${entry.value == null ? '기록 없음' : `${fmt(entry.value)}<small>${unit}</small>`}</strong>${entry.change}</div>
<div class="rk-preview-chart">${rankChart(entry.series, entry.dates, { ranked: entry.ranked })}${rankChart(entry.series, entry.dates, { ranked: entry.ranked, w: 330, h: 200, mobile: true })}</div>
<div class="rk-preview-kpis"><div><span>30일 ${entry.ranked ? '최고 순위' : '최고 동접'}</span><b>${best == null ? '기록 없음' : `${fmt(best)}${unit}`}</b></div><div><span>30일 평균 · ${values.length}일 기록</span><b>${mean == null ? '기록 없음' : `${entry.ranked ? fmt1(mean) : fmt(mean)}${unit}`}</b></div></div>
${rel.length ? `<p class="rk-preview-help">관련 리포트<br><a href="${rel[0].href}">${esc(rel[0].title)}</a></p>` : ''}
<a class="rk-preview-link" href="${entry.href}">상세 기록 보기 →</a>`;
    return key;
  };
  const mobilePreview = (s) => (r, rank, g) => addPreview(`${s}-${r.appId}`, {
    name: S.nameOf(s, r), slug: g && g.slug, icon: C.iconOf(r, g), developer: r.developer || (g && g.developer),
    label: `${STORES[s]} 매출`, value: rank, change: chg(rank, rankOf(yday, country, s, r.appId)),
    series: S.seriesOf(country, s, r.appId).slice(-30), dates: days.slice(-30).map((d) => d.date), ranked: true,
    href: C.hrefOf(g) || countryHref(country),
  });

  // ---------- 2. 표 하나 + 탭 4개 ----------
  const panels = [];
  if (hasAnd) panels.push({ id: 'and', label: '구글플레이', body: storeList(S, C, country, 'android', 'grossing', { limit: 10, preview: mobilePreview('android') }), href: countryHref(country), more: '구글플레이 매출 TOP 200' });
  panels.push({ id: 'ios', label: '앱스토어', body: storeList(S, C, country, 'ios', 'grossing', { limit: 10, preview: mobilePreview('ios') }), href: countryHref(country), more: '앱스토어 매출 TOP 200' });
  if (ST) {
    const T = ST.today; const Y = ST.yday;
    const li = (r, m, rt, spark) => {
      const key = addPreview(`steam-${m.appid}`, {
        name: m.name, icon: m.img, developer: m.developer, label: '스팀 동접자',
        value: ST.ccuOf(T, m.appid), change: ST.ccuOf(T, m.appid) == null ? '<span class="rk-chg same">동접 TOP 100 밖</span>' : '',
        series: ST.series(m.appid).slice(-30), dates: ST.days.slice(-30).map((d) => d.date), ranked: false,
        href: `/steam/${m.appid}/`,
      });
      return `<li><span class="rk-rk ${r.rank <= 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><button type="button" data-rk-preview="${key}" aria-controls="rk-home-preview" aria-pressed="false">${esc(m.name)}</button><span class="dv">${esc(m.developer)} · <a href="/steam/${m.appid}/">상세 ›</a></span></div><div class="rt">${rt}</div>${spark}</li>`;
    };
    const ccu = T.mp.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.rankOf(Y, r.appid))}<span class="sub">${fmt(r.ccu)} 동접</span>`, sparkUp(ST.series(r.appid).slice(-30), { w: 72, h: 22, color: 'var(--rk-text2)' }))).join('');
    const sell = T.sellers.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.sellOf(Y, r.appid))}<span class="sub">${esc(r.price || '')}${r.discount ? ` · ${esc(r.discount)}` : ''}</span>`, '<span></span>')).join('');
    panels.push({ id: 'ccu', label: '스팀 동접', body: `<ol class="rk-list">${ccu}</ol>`, href: '/steam/', more: '스팀 동접 TOP 100' });
    panels.push({ id: 'sell', label: '스팀 판매', body: `<ol class="rk-list">${sell}</ol>`, href: '/steam/#sell', more: '스팀 판매 TOP 100' });
  }
  const tabs = `
${panels.map((p, i) => `<input type="radio" name="rk-ht" id="ht-${p.id}" class="rk-control"${i === 0 ? ' checked' : ''}>`).join('')}
<div class="rk-htabs">${panels.map((p) => `<label for="ht-${p.id}">${p.label}</label>`).join('')}<span class="upd">${tsText(today.ts)} 갱신</span></div>
<div class="rk-hpanels">${panels.map((p) => `<div class="rk-hpanel ${p.id}">${p.body}${listLink(p.href, `${p.more} 전체 보기`, 'rk-hmore')}</div>`).join('')}</div>`;

  const firstPreview = Object.values(previews)[0] || '<p class="rk-empty">표시할 순위 기록이 없습니다.</p>';
  const workspace = `<div class="rk-workspace">${tabs}<aside class="rk-preview" id="rk-home-preview" aria-label="선택한 게임 분석" aria-live="polite">${firstPreview}</aside></div>`;
  const pageScripts = `<script type="application/json" id="rk-home-data">${JSON.stringify(previews).replace(/</g, '\\u003c')}</script>
<script>
(function() {
  const data = JSON.parse(document.getElementById('rk-home-data').textContent);
  const preview = document.getElementById('rk-home-preview');
  const workspace = document.querySelector('.rk-workspace');
  function select(button, announce) {
    if (!button || !data[button.dataset.rkPreview]) return;
    workspace.querySelectorAll('[data-rk-preview]').forEach(function(item) { item.setAttribute('aria-pressed', String(item === button)); });
    preview.innerHTML = data[button.dataset.rkPreview];
    if (announce && window.matchMedia('(max-width: 768px)').matches) {
      preview.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }
  workspace.addEventListener('click', function(event) {
    if (event.target.closest('a')) return;
    const row = event.target.closest('.rk-hpanel .rk-list li');
    const button = event.target.closest('[data-rk-preview]') || (row && row.querySelector('[data-rk-preview]'));
    if (button) select(button, true);
  });
  workspace.addEventListener('change', function(event) {
    if (event.target.name !== 'rk-ht') return;
    const panel = workspace.querySelector('.rk-hpanel.' + event.target.id.slice(3));
    select(panel && panel.querySelector('[data-rk-preview]'), false);
  });
  const first = workspace.querySelector('[data-rk-preview]');
  if (first) first.setAttribute('aria-pressed', 'true');
})();
</script>`;

  // ---------- 4. 이달의 데이터: 월간 TOP 3 포디움 · 서브컬처 5 · 신작 5 ----------
  const ms = S.monthStats(S.latestMonth, country);
  const podium = ms ? `<div class="rk-podium">${ms.list.slice(0, 3).map((a, i) => `<a class="p${i + 1}" href="${C.hrefOf(a.game) || `/rankings/monthly/${S.latestMonth}/`}"><img src="${esc(C.iconOf(a.row, a.game))}" alt="" loading="lazy"><b>${i + 1}</b><span class="n">${esc(a.game ? a.game.key : a.row.title)}</span><span class="s">평균 ${a.score.toFixed(1)}위</span></a>`).join('')}</div>` : '';
  // 스팀 월간 동접 TOP 5: 이 줄에서만 볼 수 있는 스팀 월간 데이터 (2026-09-09, 이전엔 '이달의 상승 게임' — 주요 순위 변동과 성격이 겹쳐 교체)
  const steamMonthRows = ST ? ST.monthlyTop(ST.latestMonth, 5).map((a) => { const m = ST.info(a.appid); return `<tr>${rankCell(a.rank)}<td><div class="rk-app cap"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div><div class="t"><a href="/steam/${m.appid}/">${esc(m.name)}</a></div><div class="d">${esc(m.developer)}</div></div></div></td><td class="v">${fmt(a.avg)}<small>월 평균 동접</small></td></tr>`; }).join('') : '';
  const steamMonthSub = ST ? `${ST.latestMonth} · 일별 기록 평균` : '일별 기록 평균';
  const debuts = S.debutRows(country, 'ios').slice(0, 5).map((x) => `<tr>${rankCell(x.cur)}<td>${C.appCell(x.r, 'ios')}</td><td class="v">${x.age}일째<small>최고 ${x.best}위</small></td></tr>`).join('');
  const mini = (title, sub, rows, href, label) => `<div class="rk-card"><h2>${title} <small>${sub}</small></h2><table class="rk-table"><tbody>${rows || EMPTY}</tbody></table><div class="rk-note">${listLink(href, label)}</div></div>`;
  const monthSec = `<section class="rk-section rk-home-sec rk-month-section"><h2>월간 순위 분석 <small>${S.latestMonth}</small></h2>
<div class="rk-hmonth">${ms ? `<div class="rk-card"><h2>월간 통합 TOP 3 <small>두 스토어 일 평균 순위</small></h2>${podium}<div class="rk-note">${listLink(`/rankings/monthly/${S.latestMonth}/`, '월간 순위 전체 보기')}</div></div>` : ''}${mini('스팀 월간 동접 TOP 5', steamMonthSub, steamMonthRows, '/steam/#monthly', '스팀 월간 순위 보기')}${mini('최근 진입 게임', '최근 45일 첫 진입', debuts, '/games/', '게임 DB 보기')}</div></section>`;

  // ---------- 5. 리포트 4편 ----------
  // 리포트 허브와 같은 3열 카드 규격 (2026-09-09: 4열 → 3열)
  const cards = reports.slice(0, 3).map((a) => `<a class="rk-cardl" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" loading="lazy" decoding="async"><div class="b"><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div><div class="s">${esc(a.summary)}</div></div></a>`).join('');
  const reportsSec = cards ? `<section class="rk-section rk-home-sec"><h2>분석 리포트</h2><div class="rk-cards four">${cards}</div><div class="rk-section-footer">${listLink('/reports/', `전체 ${reports.length}편 보기`)}</div></section>` : '';

  const nameOf = (s) => (today.rows[country][s][0] ? S.nameOf(s, today.rows[country][s][0]) : '-');
  const lead = `${today.date} 한국 구글플레이 매출 1위 ${nameOf('android')}, 앱스토어 1위 ${nameOf('ios')}${ST && ST.today.mp[0] ? `, 스팀 동접 1위 ${ST.info(ST.today.mp[0].appid).name}` : ''}. 모바일·스팀 게임 순위를 매일 기록하고 분석합니다.`;
  const content = `
    <section class="section active" id="home">
      <div class="page-container rk rk-home">
<div class="rk-home-ad">${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}</div>
<div class="rk-home-heading"><div class="rk-home-hero-copy"><h1>게임 순위 및 시장 분석</h1><p><time datetime="${today.date}">${today.date}</time> 기준 · 모바일 매출 순위 · 스팀 동접·판매 순위</p></div></div>
${hcards}
<div class="rk-market-heading"><h2>일간 게임 순위</h2></div>
${workspace}
${moversSec}
${monthSec}
${reportsSec}
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'home',
    pageScripts,
    title: '게임 순위 데이터·분석 — 모바일 매출·스팀 동접, 매일 갱신 | 게이머스크롤',
    description: lead,
    keywords: '모바일 게임 순위, 게임 매출 순위, 앱스토어 매출 순위, 구글플레이 매출 순위, 스팀 순위, 스팀 동접자 순위, 게임 순위 분석',
    canonical: `${siteBaseUrl}/`,
    breadcrumbs: null,
  });
}

module.exports = { renderHome };
