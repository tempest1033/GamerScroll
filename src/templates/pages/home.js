'use strict';
/**
 * 홈 (/) — 오늘의 게임 시장 요약.
 * 플랫폼별 1위 4칸 → 일간 순위(스토어·국가 탭 + 선택 게임 추이) → 오늘의 변동 → 주간 상승세 → 월간 분석 → 리포트.
 * 순위가 먼저 보이도록 긴 설명 문장은 두지 않는다 (2026-09-28).
 * 순위 표 전체는 /rankings/ 와 /steam/ 이 소유하고, 여기서는 TOP 10 · TOP 5 조각과 이동 링크만 둔다.
 * 스타일은 60-rank-chart.css(.rk-*), 62~67 홈 규칙, 74-home-renewal.css(리뉴얼 구성 요소).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { listLink } = require('../components/list-actions');
const { loadRankStats, STORES, util } = require('../../rank/stats');
const { loadSteamStats } = require('../../rank/steam-stats');
const { loadReports, reportsFor } = require('../../rank/reports');
const { makeCtx, storeList, countryHref, chg, sparkline } = require('./rank-hub');

const siteBaseUrl = 'https://gamerscroll.com';
const { esc, tsText, avg, fmt1 } = util;
const fmt = (n) => Math.round(n || 0).toLocaleString('ko-KR');
const rankCell = (rank) => `<td class="rk-rank ${rank <= 3 ? 'top' : ''}">${rank}</td>`;
const EMPTY = '<tr><td class="rk-dim" style="height:40px">해당 데이터가 없습니다.</td></tr>';
// 홈 일간 순위의 국가 탭 (중국은 구글플레이 차트가 없어 제외)
const HOME_COUNTRIES = { kr: '한국', jp: '일본', us: '미국', tw: '대만' };

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

// 선택한 게임 분석 패널. 첫 화면(서버)과 선택 변경(브라우저)이 같은 함수를 쓴다.
// 브라우저에는 소스를 그대로 넣으므로 esc · fmt · fmt1 · rankChart 외의 바깥 이름을 참조하지 않는다.
function previewHtml(e) {
  const unit = e.ranked ? '위' : '명';
  return `<div class="rk-preview-label"><span>게임별 추이</span><span>${esc(e.label)}</span></div>
<div class="rk-preview-title"><img src="${esc(e.icon)}" alt=""><div><h2>${esc(e.name)}</h2><p>${esc(e.developer)}</p></div></div>
<div class="rk-preview-value"><strong>${e.value == null ? '기록 없음' : `${fmt(e.value)}<small>${unit}</small>`}</strong>${e.change}</div>
<div class="rk-preview-chart">${rankChart(e.series, e.dates, { ranked: e.ranked })}${rankChart(e.series, e.dates, { ranked: e.ranked, w: 330, h: 200, mobile: true })}</div>
<div class="rk-preview-kpis"><div><span>30일 ${e.ranked ? '최고 순위' : '최고 동접'}</span><b>${e.best == null ? '기록 없음' : `${fmt(e.best)}${unit}`}</b></div><div><span>30일 평균 · ${e.count}일 기록</span><b>${e.mean == null ? '기록 없음' : `${e.ranked ? fmt1(e.mean) : fmt(e.mean)}${unit}`}</b></div></div>
${e.rel ? `<p class="rk-preview-help">관련 리포트<br><a href="${esc(e.rel.href)}">${esc(e.rel.title)}</a></p>` : ''}
<a class="rk-preview-link" href="${esc(e.href)}">상세 기록 보기 →</a>`;
}

function renderHome() {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today, yday, days, rankOf } = S;
  const country = 'kr';
  const stores = (today.rows[country].android || []).length ? ['android', 'ios'] : ['ios'];
  const storeLabel = (s) => (stores.length > 1 ? `${STORES[s]} ` : '');
  let ST = null;
  try { ST = loadSteamStats(); } catch {}
  let reports = [];
  try { reports = loadReports(); } catch {}

  // ---------- 오늘의 변동 · 주간 상승세 공용: 한국 두 스토어 매출 TOP 200 ----------
  // 같은 게임이 두 스토어에 모두 있으면 정렬 기준에서 앞선 쪽 하나만 남긴다. 전일 200위 밖은 차트 밖(신규·재진입)으로 본다.
  const todayRows = stores.flatMap((s) => today.rows[country][s].slice(0, 200).map((r, i) => ({ r, s, rank: i + 1 })))
    .filter((x) => x.r && x.r.appId)
    .map((x) => { const prev = rankOf(yday, country, x.s, x.r.appId); return { ...x, prev: prev != null && prev <= 200 ? prev : null, g: S.gameOf(x.s, x.r), key: S.keyOf(x.s, x.r) }; });
  const uniq = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.key) && seen.add(x.key)); };
  const MOVE = 10; // 오늘의 변동에 넣는 최소 순위 변화
  const up = uniq(todayRows.filter((x) => x.prev != null && x.prev - x.rank >= MOVE).sort((a, b) => (b.prev - b.rank) - (a.prev - a.rank)));
  const down = uniq(todayRows.filter((x) => x.prev != null && x.rank - x.prev >= MOVE).sort((a, b) => (b.rank - b.prev) - (a.rank - a.prev)));
  const fresh = uniq(todayRows.filter((x) => x.prev == null).sort((a, b) => a.rank - b.rank));
  // 주간 상승세: 최근 3일 평균 순위와 1주 전 3일 평균 순위의 비율. 1주 전 차트 밖이었던 날은 201위로 계산한다.
  const flow = days.length < 10 ? [] : uniq(todayRows.filter((x) => x.rank <= 100).map((x) => {
    const series = S.seriesOf(country, x.s, x.r.appId).slice(-10);
    const base = series.slice(0, 3); const cur = series.slice(-3);
    if (cur.some((v) => v == null) || base.every((v) => v == null)) return null;
    const from = avg(base.map((v) => v ?? 201)); const to = avg(cur);
    return from - to >= 3 && from / to >= 1.2 ? { ...x, series, from, to } : null;
  }).filter(Boolean).sort((a, b) => b.from / b.to - a.from / a.to)).slice(0, 10);
  const rowName = (x) => S.nameOf(x.s, x.r);
  const rowHref = (x) => C.hrefOf(x.g) || countryHref(country);

  // ---------- 1. 플랫폼별 1위 4칸 ----------
  // 스팀 동접은 하루 한 번 수집한 순간 값이라 수집 시각이 다른 날끼리 증감을 비교하지 않는다.
  const kpi = (label, href, icon, name, sub) => `<a class="rk-kpi" href="${href}"><span class="k">${label}</span><span class="g"><img src="${esc(icon)}" alt="" loading="lazy" decoding="async"><b>${esc(name)}</b></span><span class="s">${sub}</span></a>`;
  const storeKpi = (s) => {
    const r = today.rows[country][s][0];
    if (!r) return '';
    const g = S.gameOf(s, r);
    const streak = S.streakAtOne(country, s, r.appId);
    return kpi(`${STORES[s]} 매출 1위`, C.hrefOf(g) || countryHref(country), C.iconOf(r, g), S.nameOf(s, r), streak > 1 ? `${streak}일 연속 1위` : '오늘 1위');
  };
  const steamKpi = (label, r, sub) => { if (!r) return ''; const m = ST.info(r.appid); return kpi(label, `/steam/${m.appid}/`, m.img, m.name, sub); };
  const ccu1 = ST && ST.today.mp[0];
  const sell1 = ST && ST.today.sellers[0];
  const kpis = `<div class="rk-kpis">${stores.map(storeKpi).join('')}${ccu1 ? steamKpi('스팀 동접 1위', ccu1, `${fmt(ccu1.ccu)}명 · ${tsText(ST.today.ts).slice(11)} 수집`) : ''}${sell1 ? steamKpi('스팀 판매 1위', sell1, esc([sell1.price, sell1.discount].filter(Boolean).join(' · ') || '한국 스토어')) : ''}</div>`;

  // ---------- 3. 일간 순위: 스토어 탭 × 국가 탭 + 선택 게임 분석 ----------
  // 미리보기는 숫자 데이터만 JSON으로 보내고 HTML은 previewHtml 로 그린다 (첫 화면만 서버에서).
  const previews = {};
  const relOf = (name, slug) => { const rel = reportsFor(reports, { name, slug }, 1)[0]; return rel ? { href: rel.href, title: rel.title } : null; };
  const summary = (series, ranked) => { const v = series.filter((x) => x != null); return { best: v.length ? (ranked ? Math.min(...v) : Math.max(...v)) : null, mean: avg(v), count: v.length }; };
  const rankPreview = (c, s) => (r, rank, g) => {
    const key = `${c}-${s}-${r.appId}`;
    const series = S.seriesOf(c, s, r.appId).slice(-30);
    previews[key] = { name: S.nameOf(s, r), icon: C.iconOf(r, g), developer: r.developer || (g && g.developer) || '', label: `${HOME_COUNTRIES[c]} ${STORES[s]} 매출`, value: rank, change: chg(rank, rankOf(yday, c, s, r.appId)), series, d: 'm', ranked: true, href: C.hrefOf(g) || countryHref(c), ...summary(series, true), rel: relOf(S.nameOf(s, r), g && g.slug) };
    return key;
  };
  // 목록별 처음 선택: TOP 10 중 30일 순위 폭이 가장 큰 게임 (늘 1위인 게임의 평평한 차트 대신 움직임이 보이게)
  const widest = (c, s) => {
    let best = null;
    today.rows[c][s].slice(0, 10).forEach((r) => {
      if (!r || !r.appId) return;
      const v = S.seriesOf(c, s, r.appId).slice(-30).filter((x) => x != null);
      const range = v.length ? Math.max(...v) - Math.min(...v) : 0;
      if (!best || range > best.range) best = { key: `${c}-${s}-${r.appId}`, range };
    });
    return best && best.key;
  };
  const defaults = {};
  const countryBlock = (c, s) => {
    if (!(today.rows[c][s] || []).length) return '';
    defaults[`${c}-${s}`] = widest(c, s);
    return storeList(S, C, c, s, 'grossing', { limit: 10, preview: rankPreview(c, s), defaultKey: defaults[`${c}-${s}`], listClass: `rk-cn rk-c-${c}` })
      + listLink(countryHref(c), `${HOME_COUNTRIES[c]} ${STORES[s]} 매출 TOP 200 전체 보기`, `rk-hmore rk-cn rk-c-${c}`);
  };
  const panels = stores.map((s) => ({ id: s === 'android' ? 'and' : 'ios', label: STORES[s], body: Object.keys(HOME_COUNTRIES).map((c) => countryBlock(c, s)).join('') }));
  if (ST) {
    const T = ST.today; const Y = ST.yday;
    const li = (r, m, rt, spark) => {
      const key = `steam-${m.appid}`;
      const series = ST.series(m.appid).slice(-30);
      const ccu = ST.ccuOf(T, m.appid);
      previews[key] = { name: m.name, icon: m.img, developer: m.developer || '', label: '스팀 동접자', value: ccu, change: ccu == null ? '<span class="rk-chg same">동접 TOP 100 밖</span>' : '', series, d: 's', ranked: false, href: `/steam/${m.appid}/`, ...summary(series, false), rel: relOf(m.name) };
      return `<li><span class="rk-rk ${r.rank <= 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><button type="button" data-rk-preview="${key}" aria-controls="rk-home-preview" aria-pressed="false">${esc(m.name)}</button><span class="dv">${esc(m.developer)} · <a href="/steam/${m.appid}/">상세 ›</a></span></div><div class="rt">${rt}</div>${spark}</li>`;
    };
    const ccu = T.mp.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.rankOf(Y, r.appid))}<span class="sub">${fmt(r.ccu)} 동접</span>`, sparkUp(ST.series(r.appid).slice(-30), { w: 72, h: 22, color: 'var(--rk-text2)' }))).join('');
    const sell = T.sellers.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.sellOf(Y, r.appid))}<span class="sub">${esc(r.price || '')}${r.discount ? ` · ${esc(r.discount)}` : ''}</span>`, '<span></span>')).join('');
    panels.push({ id: 'ccu', label: '스팀 동접', body: `<ol class="rk-list">${ccu}</ol>${listLink('/steam/', '스팀 동접 TOP 100 전체 보기', 'rk-hmore')}` });
    panels.push({ id: 'sell', label: '스팀 판매', body: `<ol class="rk-list">${sell}</ol>${listLink('/steam/#sell', '스팀 판매 TOP 100 전체 보기', 'rk-hmore')}` });
  }
  const tabs = `
${panels.map((p, i) => `<input type="radio" name="rk-ht" id="ht-${p.id}" class="rk-control"${i === 0 ? ' checked' : ''}>`).join('')}
${Object.keys(HOME_COUNTRIES).map((c, i) => `<input type="radio" name="rk-hc" id="hc-${c}" class="rk-control"${i === 0 ? ' checked' : ''}>`).join('')}
<div class="rk-htabs">${panels.map((p) => `<label for="ht-${p.id}">${p.label}</label>`).join('')}<span class="upd">${tsText(today.ts)} 갱신</span></div>
<div class="rk-hcountry">${Object.entries(HOME_COUNTRIES).map(([c, n]) => `<label for="hc-${c}">${n}</label>`).join('')}</div>
<div class="rk-hpanels">${panels.map((p) => `<div class="rk-hpanel ${p.id}">${p.body}</div>`).join('')}</div>`;

  const dates = { m: days.slice(-30).map((d) => d.date), s: ST ? ST.days.slice(-30).map((d) => d.date) : [] };
  const initialKey = defaults[`${country}-${stores[0]}`] || '';
  const initial = previews[initialKey];
  const firstPreview = initial ? previewHtml({ ...initial, dates: dates[initial.d] }) : '<p class="rk-empty">표시할 순위 기록이 없습니다.</p>';
  const workspace = `<div class="rk-workspace">${tabs}<aside class="rk-preview" id="rk-home-preview" aria-label="선택한 게임 분석" aria-live="polite" data-key="${esc(initialKey)}">${firstPreview}</aside></div>`;
  const pageScripts = `<script type="application/json" id="rk-home-data">${JSON.stringify({ dates, items: previews }).replace(/</g, '\\u003c')}</script>
<script>
(function() {
  const esc = ${esc};
  const fmt = ${fmt};
  const fmt1 = ${fmt1};
  ${rankChart}
  ${previewHtml}
  const data = JSON.parse(document.getElementById('rk-home-data').textContent);
  const preview = document.getElementById('rk-home-preview');
  const workspace = document.querySelector('.rk-workspace');
  function select(button, announce) {
    const item = button && data.items[button.dataset.rkPreview];
    if (!item) return;
    workspace.querySelectorAll('[data-rk-preview]').forEach(function(b) { b.setAttribute('aria-pressed', String(b === button)); });
    preview.innerHTML = previewHtml(Object.assign({ dates: data.dates[item.d] }, item));
    if (announce && window.matchMedia('(max-width: 768px)').matches) {
      preview.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }
  // 탭·국가를 바꾸면 지금 보이는 목록의 기본 게임을 고른다.
  function visibleDefault() {
    const list = Array.prototype.find.call(workspace.querySelectorAll('.rk-hpanel .rk-list'), function(l) { return l.offsetParent !== null; });
    return list && (list.querySelector('[data-rk-default]') || list.querySelector('[data-rk-preview]'));
  }
  workspace.addEventListener('click', function(event) {
    if (event.target.closest('a')) return;
    const row = event.target.closest('.rk-hpanel .rk-list li');
    const button = event.target.closest('[data-rk-preview]') || (row && row.querySelector('[data-rk-preview]'));
    if (button) select(button, true);
  });
  workspace.addEventListener('change', function(event) {
    if (event.target.name === 'rk-ht' || event.target.name === 'rk-hc') select(visibleDefault(), false);
  });
  const initial = preview.dataset.key && workspace.querySelector('[data-rk-preview="' + preview.dataset.key + '"]');
  if (initial) initial.setAttribute('aria-pressed', 'true');

  // 옆으로 넘기는 카드: 한 장씩 이동하고, 현재 위치(1 / 3)를 표시하며, 양 끝에서는 버튼을 비활성화한다.
  document.querySelectorAll('.rk-carousel-nav').forEach(function(nav) {
    const buttons = nav.querySelectorAll('[data-rk-scroll]');
    const counter = nav.querySelector('.c');
    const track = document.getElementById(buttons[0].dataset.rkScroll);
    if (!track) return;
    function step() {
      const card = track.firstElementChild;
      return card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : track.clientWidth;
    }
    function update() {
      const max = track.scrollWidth - track.clientWidth;
      buttons[0].disabled = track.scrollLeft <= 1;
      buttons[1].disabled = track.scrollLeft >= max - 1;
      counter.textContent = Math.min(track.children.length, Math.round(track.scrollLeft / step()) + 1) + ' / ' + track.children.length;
    }
    buttons.forEach(function(button) {
      button.addEventListener('click', function() {
        track.scrollBy({ left: step() * Number(button.dataset.dir), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });
})();
</script>`;

  // ---------- 4. 오늘의 변동: 급상승 · 급하락 · 신규·재진입 ----------
  const miniRow = (x, val, i) => `<a class="mrow" href="${rowHref(x)}"><span class="i">${i + 1}</span><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy"><span class="n">${esc(rowName(x))}</span><span class="r">${stores.length > 1 ? `<em>${x.s === 'android' ? '구글' : '앱'}</em>` : ''}${x.rank}위</span>${val}</a>`;
  const moverCard = (title, list, val) => `<div class="rk-hcard"><h3>${title}</h3>${list.slice(0, 5).map((x, i) => miniRow(x, val(x), i)).join('') || '<p class="none">해당 게임이 없습니다.</p>'}</div>`;
  const isFirstEver = (x) => S.gameFirstSeen(country, x.s, x.r) === today.date;
  const moversSec = `<section class="rk-section"><h2>오늘의 변동 <small>한국 매출 · 전일 대비 ${MOVE}위 이상</small></h2><div class="rk-hmovers three">${moverCard('급상승', up, (x) => `<span class="rk-chg up">▲${x.prev - x.rank}</span>`)}${moverCard('급하락', down, (x) => `<span class="rk-chg down">▼${x.rank - x.prev}</span>`)}${moverCard('신규·재진입', fresh, (x) => `<span class="rk-chg new">${isFirstEver(x) ? 'NEW' : '재진입'}</span>`)}</div></section>`;

  // ---------- 5. 주간 상승세 TOP 10 ----------
  const flowRow = (x, i) => `<li><span class="rk-rk">${i + 1}</span><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy" decoding="async"><div class="nm"><a href="${rowHref(x)}">${esc(rowName(x))}</a><span class="dv">${storeLabel(x.s)}오늘 ${x.rank}위</span></div><div class="rt"><b>${Math.round(x.from)}위 → ${Math.round(x.to)}위</b></div>${sparkline(x.series, { color: 'var(--rk-up)', cap: 201 })}</li>`;
  const flowSec = flow.length ? `<section class="rk-section"><h2>주간 상승세 TOP ${flow.length} <small>한국 매출 · 1주 전 대비</small></h2><ol class="rk-list rk-flow">${flow.map(flowRow).join('')}</ol></section>` : '';

  // ---------- 6. 월간 순위 분석: 월간 TOP 3 포디움 · 스팀 월간 5 · 최근 진입 5 ----------
  const ms = S.monthStats(S.latestMonth, country);
  const podium = ms ? `<div class="rk-podium">${ms.list.slice(0, 3).map((a, i) => `<a class="p${i + 1}" href="${C.hrefOf(a.game) || `/rankings/monthly/${S.latestMonth}/`}"><img src="${esc(C.iconOf(a.row, a.game))}" alt="" loading="lazy"><b>${i + 1}</b><span class="n">${esc(a.game ? a.game.key : a.row.title)}</span><span class="s">평균 ${a.score.toFixed(1)}위</span></a>`).join('')}</div>` : '';
  // 스팀 월간 동접 TOP 5: 이 줄에서만 볼 수 있는 스팀 월간 데이터 (2026-09-09, 이전엔 '이달의 상승 게임' — 주요 순위 변동과 성격이 겹쳐 교체)
  const steamMonthRows = ST ? ST.monthlyTop(ST.latestMonth, 5).map((a) => { const m = ST.info(a.appid); return `<tr>${rankCell(a.rank)}<td><div class="rk-app cap"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div><div class="t"><a href="/steam/${m.appid}/">${esc(m.name)}</a></div><div class="d">${esc(m.developer)}</div></div></div></td><td class="v">${fmt(a.avg)}<small>월 평균 동접</small></td></tr>`; }).join('') : '';
  const steamMonthSub = '일별 평균';
  const debuts = S.debutRows(country, 'ios').slice(0, 5).map((x) => `<tr>${rankCell(x.cur)}<td>${C.appCell(x.r, 'ios')}</td><td class="v">${x.age}일째<small>최고 ${x.best}위</small></td></tr>`).join('');
  const mini = (title, sub, rows, href, label) => `<div class="rk-card"><h2>${title} <small>${sub}</small></h2><table class="rk-table"><tbody>${rows || EMPTY}</tbody></table><div class="rk-note">${listLink(href, label)}</div></div>`;
  // 모바일에서 옆으로 넘기는 카드 묶음의 이전·다음 버튼 (PC에서는 숨김)
  const carouselNav = (id, label) => `<div class="rk-carousel-nav" role="group" aria-label="${label} 넘기기"><button type="button" data-rk-scroll="${id}" data-dir="-1" aria-controls="${id}" aria-label="이전 ${label}" disabled>‹</button><span class="c" aria-live="polite"></span><button type="button" data-rk-scroll="${id}" data-dir="1" aria-controls="${id}" aria-label="다음 ${label}">›</button></div>`;
  const monthSec = `<section class="rk-section rk-home-sec rk-month-section"><h2>월간 순위 분석 <small>${S.latestMonth}</small></h2>${carouselNav('rk-hmonth', '월간 분석')}
<div class="rk-hmonth rk-carousel" id="rk-hmonth">${ms ? `<div class="rk-card"><h2>월간 통합 TOP 3 <small>두 스토어 평균</small></h2>${podium}<div class="rk-note">${listLink(`/rankings/monthly/${S.latestMonth}/`, '월간 순위 전체 보기')}</div></div>` : ''}${mini('스팀 월간 동접 TOP 5', steamMonthSub, steamMonthRows, '/steam/#monthly', '스팀 월간 순위 보기')}${mini('최근 진입 게임', '최근 45일', debuts, '/games/', '게임 DB 보기')}</div></section>`;

  // ---------- 7. 리포트 3편 ----------
  // 리포트 허브와 같은 3열 카드 규격 (2026-09-09: 4열 → 3열). 모바일은 가로로 넘기는 카드.
  const cards = reports.slice(0, 3).map((a) => `<a class="rk-cardl" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" loading="lazy" decoding="async"><div class="b"><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div><div class="s">${esc(a.summary)}</div></div></a>`).join('');
  const reportsSec = cards ? `<section class="rk-section rk-home-sec"><h2>분석 리포트</h2>${carouselNav('rk-hreports', '리포트')}<div class="rk-cards four rk-hreports rk-carousel" id="rk-hreports">${cards}</div><div class="rk-section-footer">${listLink('/reports/', `전체 ${reports.length}편 보기`)}</div></section>` : '';

  const nameOf = (s) => (today.rows[country][s][0] ? S.nameOf(s, today.rows[country][s][0]) : '-');
  const lead = `${today.date} 한국 구글플레이 매출 1위 ${nameOf('android')}, 앱스토어 1위 ${nameOf('ios')}${ST && ST.today.mp[0] ? `, 스팀 동접 1위 ${ST.info(ST.today.mp[0].appid).name}` : ''}. 모바일·스팀 게임 순위를 매일 기록하고 분석합니다.`;
  const content = `
    <section class="section active" id="home">
      <div class="page-container rk rk-home">
<div class="rk-home-ad">${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}</div>
<div class="rk-home-heading"><div class="rk-home-hero-copy"><h1>게임 순위 및 시장 분석</h1><p><time datetime="${today.date}">${today.date}</time> 기준 · 모바일 매출 순위 · 스팀 동접·판매 순위</p></div></div>
${kpis}
<div class="rk-market-heading"><h2>일간 게임 순위</h2></div>
${workspace}
${moversSec}
${flowSec}
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
