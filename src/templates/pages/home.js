'use strict';
/**
 * 홈 (/) — 네 허브(모바일 · 스팀 · 리포트 · 게임 DB)의 오늘 요약만 모은 얼굴 페이지.
 * 순위 표 전체는 /rankings/ 와 /steam/ 이 소유하고, 여기서는 TOP 10 · TOP 5 조각과 이동 링크만 둔다.
 * 스타일은 60-rank-chart.css(.rk-*) 와 62-rank-home.css(.rk-home-*).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { loadRankStats, STORES, util } = require('../../rank/stats');
const { loadSteamStats } = require('../../rank/steam-stats');
const { loadReports, reportsFor } = require('../../rank/reports');
const { makeCtx, storeList, countryHref, chg } = require('./rank-hub');

const siteBaseUrl = 'https://gamerscroll.com';
const { esc, tsText, avg, min, fmt1 } = util;
const fmt = (n) => Math.round(n || 0).toLocaleString('ko-KR');
const rankCell = (rank) => `<td class="rk-rank ${rank <= 3 ? 'top' : ''}">${rank}</td>`;
const EMPTY = '<tr><td class="rk-dim" style="height:40px">오늘은 없음</td></tr>';
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
function rankChart(series, dates, { w = 760, h = 230 } = {}) {
  const vals = series.map((v) => (v == null ? null : Math.min(v, 200)));
  const present = vals.filter((v) => v != null);
  if (!present.length) return '';
  const lo = 1; const hi = Math.max(10, ...present);
  const padL = 36; const padR = 14; const padT = 14; const padB = 28;
  const x = (i) => padL + (i / Math.max(1, vals.length - 1)) * (w - padL - padR);
  const y = (v) => padT + ((v - lo) / (hi - lo)) * (h - padT - padB);
  const ticks = [lo, Math.round(lo + (hi - lo) / 3), Math.round(lo + (2 * (hi - lo)) / 3), hi].filter((t, i, a) => a.indexOf(t) === i);
  const grid = ticks.map((t) => `<line x1="${padL}" x2="${w - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--rk-line)" /><text x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" font-size="11" fill="var(--rk-dim)" text-anchor="end">${t}위</text>`).join('');
  const step = Math.max(1, Math.ceil(vals.length / 6));
  const labels = dates.map((d, i) => (i % step === 0 || i === dates.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="11" fill="var(--rk-dim)" text-anchor="middle">${d.slice(5)}</text>` : '')).join('');
  let d = ''; let open = false;
  vals.forEach((v, i) => { if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`; open = true; });
  const li = vals.length - 1; const lv = vals[li];
  return `<svg class="rk-chartsvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="30일 순위 추이">${grid}${labels}<path d="${d}" fill="none" stroke="var(--rk-accent)" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>${lv != null ? `<circle cx="${x(li).toFixed(1)}" cy="${y(lv).toFixed(1)}" r="4" fill="var(--rk-accent)"/>` : ''}</svg>`;
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
  const cardTop1 = `<div class="rk-hcard"><h3>오늘의 1위</h3><div class="ones">${hasAnd ? top1('android') : ''}${top1('ios')}${steam1}</div></div>`;
  // ② 급등 TOP 5 · ③ 신규 진입 TOP 5 (앱스토어)
  const risers = iosRows.filter((x) => x.prev != null && x.prev - x.rank >= 3 && x.rank <= 200).sort((a, b) => (b.prev - b.rank) - (a.prev - a.rank)).slice(0, 5);
  const fresh = iosRows.filter((x) => x.prev == null && x.rank <= 200).slice(0, 5);
  const miniRow = (x, val) => `<a class="mrow" href="${C.hrefOf(x.g) || countryHref(country)}"><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy"><span class="n">${esc(S.nameOf('ios', x.r))}</span><span class="r">${x.rank}위</span>${val}</a>`;
  const cardUp = `<div class="rk-hcard"><h3>급등 <small>앱스토어 · 전일 대비</small></h3>${risers.map((x) => miniRow(x, `<span class="rk-chg up">▲${x.prev - x.rank}</span>`)).join('') || '<p class="none">오늘은 없음</p>'}</div>`;
  const cardNew = `<div class="rk-hcard"><h3>신규 진입 <small>앱스토어 TOP 200</small></h3>${fresh.map((x) => miniRow(x, '<span class="rk-chg new">NEW</span>')).join('') || '<p class="none">오늘은 없음</p>'}</div>`;
  // ④ 스팀 동접 합계: 큰 숫자 + 30일 스파크라인
  let cardSteam = '';
  if (ST) {
    const total = ST.sumToday(ST.today);
    const total7 = avg(ST.days.slice(-8, -1).map(ST.sumToday));
    const p = pct(total, total7);
    cardSteam = `<div class="rk-hcard steam"><h3>스팀 동접 합계 <small>TOP 100</small></h3><div class="big">${fmt(total)}</div><div class="sub">${p != null ? `<span class="rk-chg ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(1)}%</span> 7일 평균 대비` : ''}</div>${sparkUp(ST.days.slice(-30).map(ST.sumToday), { w: 240, h: 56 })}<a class="foot" href="/steam/">스팀 순위 ›</a></div>`;
  }
  const hcards = `<div class="rk-hcards">${cardTop1}${cardUp}${cardNew}${cardSteam}</div>`;

  // ---------- 2. 표 하나 + 탭 4개 ----------
  const panels = [];
  if (hasAnd) panels.push({ id: 'and', label: '구글플레이 매출', body: storeList(S, C, country, 'android', 'grossing', { limit: 10 }), href: countryHref(country), more: '구글플레이 매출 TOP 200' });
  panels.push({ id: 'ios', label: '앱스토어 매출', body: storeList(S, C, country, 'ios', 'grossing', { limit: 10 }), href: countryHref(country), more: '앱스토어 매출 TOP 200' });
  if (ST) {
    const T = ST.today; const Y = ST.yday;
    const li = (r, m, rt, spark) => `<li><span class="rk-rk ${r.rank <= 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><a href="/steam/${m.appid}/">${esc(m.name)}</a><span class="dv">${esc(m.developer)}</span></div><div class="rt">${rt}</div>${spark}</li>`;
    const ccu = T.mp.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.rankOf(Y, r.appid))}<span class="sub">${fmt(r.ccu)} 동접</span>`, sparkUp(ST.series(r.appid).slice(-30), { w: 72, h: 22, color: 'var(--rk-text2)' }))).join('');
    const sell = T.sellers.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.sellOf(Y, r.appid))}<span class="sub">${esc(r.price || '')}${r.discount ? ` · ${esc(r.discount)}` : ''}</span>`, '<span></span>')).join('');
    panels.push({ id: 'ccu', label: '스팀 동접', body: `<ol class="rk-list">${ccu}</ol>`, href: '/steam/', more: '스팀 동접 TOP 100' });
    panels.push({ id: 'sell', label: '스팀 판매', body: `<ol class="rk-list">${sell}</ol>`, href: '/steam/#sell', more: '스팀 판매 TOP 100' });
  }
  const tabs = `<section class="rk-section rk-home-sec rk-htabs-sec">
${panels.map((p, i) => `<input type="radio" name="rk-ht" id="ht-${p.id}" hidden${i === 0 ? ' checked' : ''}>`).join('')}
<div class="rk-htabs">${panels.map((p) => `<label for="ht-${p.id}">${p.label}</label>`).join('')}<span class="upd">${tsText(today.ts)} 갱신</span></div>
<div class="rk-hpanels">${panels.map((p) => `<div class="rk-hpanel ${p.id}">${p.body}<a class="rk-hmore" href="${p.href}">${p.more} 전체 보기 ›</a></div>`).join('')}</div>
</section>`;

  // ---------- 3. 오늘의 급등 30일 차트 ----------
  let chartSec = '';
  const hero = (mv.up[0] && iosRows[mv.up[0].rank - 1]) || iosRows[0];
  if (hero) {
    const series = S.seriesOf(country, 'ios', hero.r.appId).slice(-30);
    const dates = days.slice(-30).map((d) => d.date);
    const best = min(series); const mean = avg(series);
    const rel = reportsFor(reports, { name: S.nameOf('ios', hero.r), slug: hero.g && hero.g.slug }, 2);
    const href = C.hrefOf(hero.g) || countryHref(country);
    chartSec = `<section class="rk-section rk-home-sec"><h2>${hero.prev != null && hero.prev > hero.rank ? '오늘의 급등' : '오늘의 1위'} <small>앱스토어 매출 · 30일 순위 추이</small><a class="more" href="${href}">게임 페이지 ›</a></h2>
<div class="rk-hchart"><div class="main"><div class="hd"><img src="${esc(C.iconOf(hero.r, hero.g))}" alt="" loading="lazy"><div><a class="n" href="${href}">${esc(S.nameOf('ios', hero.r))}</a><span class="d">${esc(hero.r.developer || (hero.g && hero.g.developer) || '')}</span></div><div class="now">${hero.rank}<small>위</small> ${chg(hero.rank, hero.prev)}${hero.prev != null ? `<span class="sub">어제 ${hero.prev}위</span>` : ''}</div></div>${rankChart(series, dates)}</div>
<div class="side"><div class="kv"><span>30일 최고</span><b>${best ?? '-'}위</b></div><div class="kv"><span>30일 평균</span><b>${mean != null ? fmt1(mean) : '-'}위</b></div><div class="kv"><span>차트 체류</span><b>${series.filter((v) => v != null).length}일</b></div>${rel.length ? `<div class="rel"><span>관련 리포트</span>${rel.map((a) => `<a href="${a.href}">${esc(a.title)}</a>`).join('')}</div>` : ''}</div></div></section>`;
  }

  // ---------- 4. 이달의 데이터: 월간 TOP 3 포디움 · 서브컬처 5 · 신작 5 ----------
  const ms = S.monthStats(S.latestMonth, country);
  const podium = ms ? `<div class="rk-podium">${ms.list.slice(0, 3).map((a, i) => `<a class="p${i + 1}" href="${C.hrefOf(a.game) || `/rankings/monthly/${S.latestMonth}/`}"><img src="${esc(C.iconOf(a.row, a.game))}" alt="" loading="lazy"><b>${i + 1}</b><span class="n">${esc(a.game ? a.game.key : a.row.title)}</span><span class="s">평균 ${a.score.toFixed(1)}위</span></a>`).join('')}</div>` : '';
  const subs = iosRows.filter((x) => S.isSub(x.g)).slice(0, 5).map((x) => `<tr>${rankCell(x.rank)}<td>${C.appCell(x.r, 'ios')}</td><td class="c">${chg(x.rank, x.prev)}</td></tr>`).join('');
  const debuts = S.debutRows(country, 'ios').slice(0, 5).map((x) => `<tr>${rankCell(x.cur)}<td>${C.appCell(x.r, 'ios')}</td><td class="v">${x.age}일째<small>최고 ${x.best}위</small></td></tr>`).join('');
  const mini = (title, sub, rows, href, label) => `<div class="rk-card"><h2>${title} <small>${sub}</small></h2><table class="rk-table"><tbody>${rows || EMPTY}</tbody></table><div class="rk-note"><a href="${href}">${label} ›</a></div></div>`;
  const monthSec = `<section class="rk-section rk-home-sec"><h2>이달의 데이터 <small>${S.latestMonth}</small></h2>
<div class="rk-hmonth">${ms ? `<div class="rk-card"><h2>월간 통합 TOP 3 <small>두 스토어 일 평균 순위</small></h2>${podium}<div class="rk-note"><a href="/rankings/monthly/${S.latestMonth}/">월간 순위 전체 ›</a></div></div>` : ''}${mini('서브컬처', '오늘 앱스토어 매출', subs, '/rankings/subculture/', '서브컬처 순위')}${mini('신작 성적', '최근 45일 첫 진입', debuts, '/games/', '게임 DB')}</div></section>`;

  // ---------- 5. 리포트 4편 ----------
  const cards = reports.slice(0, 4).map((a) => `<a class="rk-cardl" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" loading="lazy" decoding="async"><div class="b"><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div><div class="s">${esc(a.summary)}</div></div></a>`).join('');
  const reportsSec = cards ? `<section class="rk-section rk-home-sec"><h2>리포트 <small>순위 데이터에서 출발한 분석</small><a class="more" href="/reports/">전체 ${reports.length}편 ›</a></h2><div class="rk-cards four">${cards}</div></section>` : '';

  const nameOf = (s) => (today.rows[country][s][0] ? S.nameOf(s, today.rows[country][s][0]) : '-');
  const lead = `${today.date} 한국 구글플레이 매출 1위 ${nameOf('android')}, 앱스토어 1위 ${nameOf('ios')}${ST && ST.today.mp[0] ? `, 스팀 동접 1위 ${ST.info(ST.today.mp[0].appid).name}` : ''}. 모바일·스팀 게임 순위를 매일 기록하고 분석합니다.`;
  const content = `
    <section class="section active" id="home">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk rk-home">
<div class="rk-head"><h1>오늘의 게임 순위</h1></div>
${hcards}
${tabs}
${chartSec}
${monthSec}
${reportsSec}
      <p class="rk-foot">모바일은 애플 앱스토어·구글플레이 공개 매출 차트, 스팀은 Steam Charts 동접자와 한국 스토어 판매 순위를 매일 수집합니다. 이력 ${S.days[0].date} ~ ${today.date} (${S.days.length}일). <a href="/rankings/about/">산출 방법 ›</a></p>
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'home',
    title: '게이머스크롤 — 모바일·스팀 게임 순위 데이터, 매일 갱신',
    description: lead,
    keywords: '모바일 게임 순위, 게임 매출 순위, 앱스토어 매출 순위, 구글플레이 매출 순위, 스팀 순위, 스팀 동접자 순위, 게임 순위 분석',
    canonical: `${siteBaseUrl}/`,
    breadcrumbs: null,
  });
}

module.exports = { renderHome };
