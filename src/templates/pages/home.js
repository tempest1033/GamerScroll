'use strict';
const { t: tt } = require('../../i18n');
/**
 * 홈 (/) — 오늘의 게임 시장 요약.
 * 플랫폼별 1위 4칸 → 일간 순위(스토어·국가 탭 + 선택 게임 추이) → 오늘의 변동 → 주간 상승세 → 월간 분석.
 * 순위가 먼저 보이도록 긴 설명 문장은 두지 않는다 (2026-09-28).
 * 순위 표 전체는 /rankings/ 와 /steam/ 이 소유하고, 여기서는 TOP 10 · TOP 5 조각과 이동 링크만 둔다.
 * 스타일은 60-rank-chart.css(.rk-*), 62~67 홈 규칙, 74-home-renewal.css(리뉴얼 구성 요소).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { listLink } = require('../components/list-actions');
const { loadRankStats, STORES, COUNTRIES, util } = require('../../rank/stats');
const { clientTranslator, currentEdition, formatDay, formatYearMonth } = require('../../i18n');
const { loadSteamStats } = require('../../rank/steam-stats');
const { makeCtx, storeList, countryHref, homeCountry, orderedCountries, chg, sparkline } = require('./rank-hub');

const siteBaseUrl = 'https://gamerscroll.com';
const { esc, tsText, tsTime, avg, fmt1 } = util;
const fmt = (n) => Math.round(n || 0).toLocaleString(currentEdition().intl);
const rankCell = (rank) => `<td class="rk-rank ${rank <= 3 ? 'top' : ''}">${rank}</td>`;
const EMPTY = tt('home.no_data');

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
  if (present.length < 2) return mobile ? '' : tt('home.not_enough_records_to_show');
  const lo = ranked ? 1 : 0; const hi = Math.max(ranked ? 10 : 1, ...present);
  const padL = mobile ? 40 : 36; const padR = 14; const padT = 14; const padB = 28;
  const fs = mobile ? 12 : 10; const fsX = mobile ? 12 : 11; const xTicks = mobile ? 4 : 6;
  const x = (i) => padL + (i / Math.max(1, vals.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (ranked ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const ticks = [lo, Math.round(lo + (hi - lo) / 3), Math.round(lo + (2 * (hi - lo)) / 3), hi].filter((t, i, a) => a.indexOf(t) === i);
  const grid = ticks.map((t) => `<line x1="${padL}" x2="${w - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--rk-line)" /><text x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" font-size="${fs}" fill="var(--rk-dim)" text-anchor="end">${ranked ? `${tt('home.axis_rank', { t })}` : t >= 10000 ? `${tt('home.0k', { p0: (t / 10000).toFixed(0) })}` : fmt(t)}</text>`).join('');
  const step = Math.max(1, Math.ceil(vals.length / xTicks));
  const labels = dates.map((d, i) => (i % step === 0 || i === dates.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="${fsX}" fill="var(--rk-dim)" text-anchor="middle">${new Intl.DateTimeFormat(currentEdition().intl, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${d}T00:00:00Z`))}</text>` : '')).join('');
  let d = ''; let open = false;
  vals.forEach((v, i) => { if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`; open = true; });
  const li = vals.length - 1; const lv = vals[li];
  return `<svg class="rk-chartsvg${mobile ? ' rk-chartsvg-m' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${tt('home.last_days_trend', { length: series.length, p1: ranked ? tt('layout.rankings') : tt('home.concurrent_players') })}">${grid}${labels}<path d="${d}" fill="none" stroke="var(--rk-accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${lv != null ? `<circle cx="${x(li).toFixed(1)}" cy="${y(lv).toFixed(1)}" r="4" fill="var(--rk-accent)"/>` : ''}</svg>`;
}

// 선택한 게임 분석 패널. 첫 화면(서버)과 선택 변경(브라우저)이 같은 함수를 쓴다.
// 브라우저에는 소스를 그대로 넣으므로 esc · fmt · fmt1 · rankChart 외의 바깥 이름을 참조하지 않는다.
function previewHtml(e) {
  const unit = e.ranked ? tt('chart.rank_unit') : tt('home.players');
  return `<div class="rk-preview-label"><span>${tt('home.trend_by_game')}</span><span>${esc(e.label)}</span></div>
<div class="rk-preview-title"><img src="${esc(e.icon)}" alt=""><div><h2 data-name>${esc(e.name)}</h2><p data-name>${esc(e.developer)}</p></div></div>
<div class="rk-preview-value"><strong>${e.value == null ? tt('chart.no_record') : `${fmt(e.value)}<small>${unit}</small>`}</strong>${e.change}</div>
<div class="rk-preview-chart">${rankChart(e.series, e.dates, { ranked: e.ranked })}${rankChart(e.series, e.dates, { ranked: e.ranked, w: 330, h: 200, mobile: true })}</div>
<div class="rk-preview-kpis"><div><span>${tt('home.30_day', { p0: e.ranked ? tt('home.best_rank') : tt('home.peak_concurrent_players') })}</span><b>${e.best == null ? tt('chart.no_record') : `${fmt(e.best)}${unit}`}</b></div><div><span>${tt('home.30_day_average_days_recorded', { count: e.count })}</span><b>${e.mean == null ? tt('chart.no_record') : `${e.ranked ? fmt1(e.mean) : fmt(e.mean)}${unit}`}</b></div></div>
<a class="rk-preview-link" href="${esc(e.href)}">${tt('home.view_detailed_records')}</a>`;
}

function renderHome() {
  const S = loadRankStats();
  const C = makeCtx(S);
  const { today, yday, days, rankOf } = S;
  const country = homeCountry();
  // Country tabs: the edition's home country first. China has no Google Play chart, so its home panel defaults to the App Store.
  const HOME_COUNTRIES = Object.fromEntries(orderedCountries().map((c) => [c, COUNTRIES[c]]));
  const tabStores = (today.rows[country].android || []).length ? ['android', 'ios'] : ['ios', 'android'];
  const stores = (today.rows[country].android || []).length ? ['android', 'ios'] : ['ios'];
  const storeLabel = (s) => (stores.length > 1 ? `${STORES[s]} ` : '');
  let ST = null;
  try { ST = loadSteamStats(); } catch {}

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
  const kpi = (label, href, icon, name, sub) => `<a class="rk-kpi" href="${href}"><span class="k">${label}</span><span class="g"><img src="${esc(icon)}" alt="" loading="lazy" decoding="async"><b data-name>${esc(name)}</b></span><span class="s">${sub}</span></a>`;
  const storeKpi = (s) => {
    const r = today.rows[country][s][0];
    if (!r) return '';
    const g = S.gameOf(s, r);
    const streak = S.streakAtOne(country, s, r.appId);
    return kpi(`${tt('home.revenue_1', { p0: STORES[s] })}`, C.hrefOf(g) || countryHref(country), C.iconOf(r, g), S.nameOf(s, r), streak > 1 ? `${tt('home.1_for_days_in_a', { streak })}` : tt('home.1_today'));
  };
  const steamKpi = (label, r, sub) => { if (!r) return ''; const m = ST.info(r.appid); return kpi(label, `/steam/${m.appid}/`, m.img, m.name, sub); };
  const ccu1 = ST && ST.today.mp[0];
  const sell1 = ST && ST.today.sellers[0];
  const kpis = `<div class="rk-kpis">${stores.map(storeKpi).join('')}${ccu1 ? steamKpi(tt('home.steam_concurrent_players_1_2'), ccu1, `${tt('home.players_collected', { p0: fmt(ccu1.ccu), p1: tsTime(ST.today.ts) })}`) : ''}${sell1 ? steamKpi(tt('home.steam_sales_1'), sell1, esc([sell1.price, sell1.discount].filter(Boolean).join(' · ') || tt('home.korea_store'))) : ''}</div>`;

  // ---------- 3. 일간 순위: 스토어 탭 × 국가 탭 + 선택 게임 분석 ----------
  // 미리보기는 숫자 데이터만 JSON으로 보내고 HTML은 previewHtml 로 그린다 (첫 화면만 서버에서).
  const previews = {};
  const summary = (series, ranked) => { const v = series.filter((x) => x != null); return { best: v.length ? (ranked ? Math.min(...v) : Math.max(...v)) : null, mean: avg(v), count: v.length }; };
  const rankPreview = (c, s) => (r, rank, g) => {
    const key = `${c}-${s}-${r.appId}`;
    const series = S.seriesOf(c, s, r.appId).slice(-30);
    previews[key] = { name: S.nameOf(s, r), icon: C.iconOf(r, g), developer: r.developer || (g && g.developer) || '', label: `${tt('home.revenue', { p0: HOME_COUNTRIES[c], p1: STORES[s] })}`, value: rank, change: chg(rank, rankOf(yday, c, s, r.appId)), series, d: 'm', ranked: true, href: C.hrefOf(g) || countryHref(c), ...summary(series, true) };
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
    if (!(today.rows[c][s] || []).length) return `<p class="rk-empty rk-cn rk-c-${c}">${tt('home.no_chart_for_store')}</p>`;
    defaults[`${c}-${s}`] = widest(c, s);
    return storeList(S, C, c, s, 'grossing', { limit: 10, preview: rankPreview(c, s), defaultKey: defaults[`${c}-${s}`], listClass: `rk-cn rk-c-${c}` })
      + listLink(countryHref(c), `${tt('home.view_full_revenue_top_200', { p0: HOME_COUNTRIES[c], p1: STORES[s] })}`, `rk-hmore rk-cn rk-c-${c}`);
  };
  const panels = tabStores.map((s) => ({ id: s === 'android' ? 'and' : 'ios', label: STORES[s], body: Object.keys(HOME_COUNTRIES).map((c) => countryBlock(c, s)).join('') }));
  if (ST) {
    const T = ST.today; const Y = ST.yday;
    const li = (r, m, rt, spark) => {
      const key = `steam-${m.appid}`;
      const series = ST.series(m.appid).slice(-30);
      const ccu = ST.ccuOf(T, m.appid);
      previews[key] = { name: m.name, icon: m.img, developer: m.developer || '', label: tt('home.steam_concurrent_players_2'), value: ccu, change: ccu == null ? tt('home.outside_concurrent_top_100') : '', series, d: 's', ranked: false, href: `/steam/${m.appid}/`, ...summary(series, false) };
      return `<li><span class="rk-rk ${r.rank <= 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><button type="button" data-name data-rk-preview="${key}" aria-controls="rk-home-preview" aria-pressed="false">${esc(m.name)}</button><span class="dv"><span data-name>${esc(m.developer)}</span> · <a href="/steam/${m.appid}/">${tt('home.details')}</a></span></div><div class="rt">${rt}</div>${spark}</li>`;
    };
    const ccu = T.mp.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.rankOf(Y, r.appid))}<span class="sub">${tt('home.concurrent', { p0: fmt(r.ccu) })}</span>`, sparkUp(ST.series(r.appid).slice(-30), { w: 72, h: 22, color: 'var(--rk-text2)' }))).join('');
    const sell = T.sellers.slice(0, 10).map((r) => li(r, ST.info(r.appid), `${chg(r.rank, ST.sellOf(Y, r.appid))}<span class="sub">${esc(r.price || '')}${r.discount ? ` · ${esc(r.discount)}` : ''}</span>`, '<span></span>')).join('');
    panels.push({ id: 'ccu', label: tt('home.steam_concurrent_players'), body: `<ol class="rk-list">${ccu}</ol>${listLink('/steam/', tt('home.view_full_steam_concurrent_players'), 'rk-hmore')}` });
    panels.push({ id: 'sell', label: tt('home.steam_sales'), body: `<ol class="rk-list">${sell}</ol>${listLink('/steam/#sell', tt('home.view_full_steam_sales_top'), 'rk-hmore')}` });
  }
  const tabs = `
${panels.map((p, i) => `<input type="radio" name="rk-ht" id="ht-${p.id}" class="rk-control"${i === 0 ? ' checked' : ''}>`).join('')}
${Object.keys(HOME_COUNTRIES).map((c, i) => `<input type="radio" name="rk-hc" id="hc-${c}" class="rk-control"${i === 0 ? ' checked' : ''}>`).join('')}
<div class="rk-htabs">${panels.map((p) => `<label for="ht-${p.id}">${p.label}</label>`).join('')}<span class="upd">${tt('home.updated', { p0: tsText(today.ts) })}</span></div>
<div class="rk-hcountry">${Object.entries(HOME_COUNTRIES).map(([c, n]) => `<label for="hc-${c}">${n}</label>`).join('')}</div>
<div class="rk-hpanels">${panels.map((p) => `<div class="rk-hpanel ${p.id}">${p.body}</div>`).join('')}</div>`;

  const dates = { m: days.slice(-30).map((d) => d.date), s: ST ? ST.days.slice(-30).map((d) => d.date) : [] };
  const initialKey = defaults[`${country}-${stores[0]}`] || '';
  const initial = previews[initialKey];
  const firstPreview = initial ? previewHtml({ ...initial, dates: dates[initial.d] }) : tt('home.no_ranking_records_to_display');
  const workspace = `<div class="rk-workspace">${tabs}<aside class="rk-preview" id="rk-home-preview" aria-label="${tt('home.selected_game_analysis')}" aria-live="polite" data-key="${esc(initialKey)}">${firstPreview}</aside></div>`;
  // 미리보기 데이터는 홈 HTML의 약 20%라 첫 다운로드에서 뺀다: id가 *DeferredData이고 배열이면
  // 빌드(externalizeDeferredJsonFromHtml)가 /assets/feed/ 파일로 옮기고 data-src를 남긴다.
  // 페이지 load 뒤 미리 받아 두고, 그 전에 누르면 그때 받는다.
  const pageScripts = `<script type="application/json" id="rkHomeDeferredData">${JSON.stringify([{ dates, items: previews }]).replace(/</g, '\\u003c')}</script>
<script>
(function() {
  const LOCALE = ${JSON.stringify(currentEdition().intl)};
  ${clientTranslator([rankChart, previewHtml], 'tt')}
  const currentEdition = () => ({ intl: LOCALE });
  const esc = ${esc};
  const fmt = ${fmt};
  const fmt1 = ${fmt1};
  ${rankChart}
  ${previewHtml}
  const source = document.getElementById('rkHomeDeferredData');
  const preview = document.getElementById('rk-home-preview');
  const workspace = document.querySelector('.rk-workspace');
  let loading = null;
  function loadData() {
    if (!loading) {
      const url = source.getAttribute('data-src');
      loading = (url
        ? fetch(url).then(function(response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
        : Promise.resolve(JSON.parse(source.textContent)))
        .then(function(list) { return list[0]; })
        .catch(function() { loading = null; return null; });
    }
    return loading;
  }
  window.addEventListener('load', function() { loadData(); });
  let selected = null;
  function select(button, announce) {
    if (!button || !button.dataset.rkPreview) return;
    selected = button;
    workspace.querySelectorAll('[data-rk-preview]').forEach(function(b) { b.setAttribute('aria-pressed', String(b === button)); });
    loadData().then(function(data) {
      const item = data && data.items[button.dataset.rkPreview];
      if (!item || selected !== button) return;
      preview.innerHTML = previewHtml(Object.assign({ dates: data.dates[item.d] }, item));
      if (announce && window.matchMedia('(max-width: 768px)').matches) {
        preview.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      }
    });
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
  const miniRow = (x, val, i) => `<a class="mrow" href="${rowHref(x)}"><span class="i">${i + 1}</span><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy"><span class="n" data-name>${esc(rowName(x))}</span><span class="r">${tt('home.mini_row_rank', { p0: stores.length > 1 ? `<em>${x.s === 'android' ? tt('home.google') : tt('home.app')}</em>` : '', rank: x.rank })}</span>${val}</a>`;
  const moverCard = (title, list, val) => `<div class="rk-hcard"><h3>${title}</h3>${list.slice(0, 5).map((x, i) => miniRow(x, val(x), i)).join('') || tt('home.no_matching_games')}</div>`;
  const isFirstEver = (x) => S.gameFirstSeen(country, x.s, x.r) === today.date;
  const moversSec = `<section class="rk-section"><h2>${tt('home.today_s_movers')} <small>${tt('home.korea_revenue_moved_ranks_vs', { MOVE, country: COUNTRIES[country] })}</small></h2><div class="rk-hmovers three">${moverCard(tt('home.biggest_gains'), up, (x) => `<span class="rk-chg up">▲${x.prev - x.rank}</span>`)}${moverCard(tt('home.biggest_drops'), down, (x) => `<span class="rk-chg down">▼${x.rank - x.prev}</span>`)}${moverCard(tt('home.new_re_entry'), fresh, (x) => `<span class="rk-chg new">${isFirstEver(x) ? 'NEW' : tt('home.re_entry')}</span>`)}</div></section>`;

  // ---------- 5. 주간 상승세 TOP 10 ----------
  const flowRow = (x, i) => `<li><span class="rk-rk">${i + 1}</span><img src="${esc(C.iconOf(x.r, x.g))}" alt="" loading="lazy" decoding="async"><div class="nm"><a data-name href="${rowHref(x)}">${esc(rowName(x))}</a><span class="dv">${tt('home.today', { p0: storeLabel(x.s), rank: x.rank })}</span></div><div class="rt"><b>${tt('home.rank_change', { p0: Math.round(x.from), p1: Math.round(x.to) })}</b></div>${sparkline(x.series, { color: 'var(--rk-up)', cap: 201 })}</li>`;
  const flowSec = flow.length ? `<section class="rk-section"><h2>${tt('home.weekly_risers_top', { length: flow.length })} <small>${tt('home.korea_revenue_vs_1_week', { country: COUNTRIES[country] })}</small></h2><ol class="rk-list rk-flow">${flow.map(flowRow).join('')}</ol></section>` : '';

  // ---------- 6. 월간 순위 분석: 월간 TOP 3 포디움 · 스팀 월간 5 · 최근 진입 5 ----------
  const ms = S.monthStats(S.latestMonth, country);
  const podium = ms ? `<div class="rk-podium">${ms.list.slice(0, 3).map((a, i) => `<a class="p${i + 1}" href="${C.hrefOf(a.game) || `/rankings/monthly/${S.latestMonth}/`}"><img src="${esc(C.iconOf(a.row, a.game))}" alt="" loading="lazy"><b>${i + 1}</b><span class="n" data-name>${esc(S.nameOf(a.store, a.row))}</span><span class="s">${tt('home.avg_rank', { p0: a.score.toFixed(1) })}</span></a>`).join('')}</div>` : '';
  // 스팀 월간 동접 TOP 5: 이 줄에서만 볼 수 있는 스팀 월간 데이터 (2026-09-09, 이전엔 '이달의 상승 게임' — 주요 순위 변동과 성격이 겹쳐 교체)
  const steamMonthRows = ST ? ST.monthlyTop(ST.latestMonth, 5).map((a) => { const m = ST.info(a.appid); return `<tr>${rankCell(a.rank)}<td><div class="rk-app cap"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div><div class="t"><a data-name href="/steam/${m.appid}/">${esc(m.name)}</a></div><div class="d" data-name>${esc(m.developer)}</div></div></div></td><td class="v">${fmt(a.avg)}<small>${tt('home.monthly_avg_concurrent_players')}</small></td></tr>`; }).join('') : '';
  const steamMonthSub = tt('home.daily_average');
  const debuts = S.debutRows(country, 'ios').slice(0, 5).map((x) => `<tr>${rankCell(x.cur)}<td>${C.appCell(x.r, 'ios')}</td><td class="v">${tt('home.day', { age: x.age })}<small>${tt('home.best', { best: x.best })}</small></td></tr>`).join('');
  const mini = (title, sub, rows, href, label) => `<div class="rk-card"><h2>${title} <small>${sub}</small></h2><table class="rk-table"><tbody>${rows || EMPTY}</tbody></table><div class="rk-note">${listLink(href, label)}</div></div>`;
  // 모바일에서 옆으로 넘기는 카드 묶음의 이전·다음 버튼 (PC에서는 숨김)
  const carouselNav = (id, label) => `<div class="rk-carousel-nav" role="group" aria-label="${tt('home.skip', { label })}"><button type="button" data-rk-scroll="${id}" data-dir="-1" aria-controls="${id}" aria-label="${tt('home.previous', { label })}" disabled>‹</button><span class="c" aria-live="polite"></span><button type="button" data-rk-scroll="${id}" data-dir="1" aria-controls="${id}" aria-label="${tt('home.next', { label })}">›</button></div>`;
  const monthSec = `<section class="rk-section rk-home-sec rk-month-section"><h2>${tt('home.monthly_ranking_analysis')} <small>${formatYearMonth(S.latestMonth)}</small></h2>${carouselNav('rk-hmonth', tt('home.monthly_analysis'))}
<div class="rk-hmonth rk-carousel" id="rk-hmonth">${ms ? `<div class="rk-card"><h2>${tt('home.monthly_combined_top_3')} <small>${tt('home.average_of_two_stores')}</small></h2>${podium}<div class="rk-note">${listLink(`/rankings/monthly/${S.latestMonth}/`, tt('home.view_all_monthly_rankings'))}</div></div>` : ''}${mini(tt('home.steam_monthly_concurrent_players_top'), steamMonthSub, steamMonthRows, '/steam/#monthly', tt('home.view_steam_monthly_rankings'))}${mini(tt('home.recent_entrants'), tt('home.last_45_days'), debuts, '/games/', tt('home.view_game_db'))}</div></section>`;

  const nameOf = (s) => (today.rows[country][s][0] ? S.nameOf(s, today.rows[country][s][0]) : '-');
  const steamLead = ST && ST.today.mp[0] ? tt('home.steam_concurrent_players_1', { name: ST.info(ST.today.mp[0].appid).name }) : '';
  const lead = stores.includes('android')
    ? tt('home.korea_google_play_revenue_1', { date: formatDay(today.date), country: COUNTRIES[country], p1: nameOf('android'), p2: nameOf('ios'), p3: steamLead })
    : tt('home.lead_ios_only', { date: formatDay(today.date), country: COUNTRIES[country], p2: nameOf('ios'), p3: steamLead });
  const content = `
    <section class="section active" id="home">
      <div class="page-container rk rk-home">
<div class="rk-home-ad">${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}</div>
<div class="rk-home-heading"><div class="rk-home-hero-copy"><h1>${tt('home.game_rankings_market_analysis')}</h1><p><time datetime="${today.date}">${formatDay(today.date)}</time> ${tt('home.as_of_mobile_revenue_rankings')}</p></div></div>
${kpis}
<div class="rk-market-heading"><h2>${tt('home.daily_game_rankings')}</h2></div>
${workspace}
${moversSec}
${flowSec}
${monthSec}
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'home',
    pageScripts,
    title: tt('home.game_ranking_data_analysis_mobile'),
    description: lead,
    keywords: tt('home.mobile_game_rankings_game_revenue'),
    canonical: `${siteBaseUrl}/`,
    breadcrumbs: null,
  });
}

module.exports = { renderHome };
