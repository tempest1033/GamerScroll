'use strict';
/**
 * 스팀 허브 · 스팀 게임 상세 (정적 HTML)
 *   /steam/            동접자 TOP 100 · 한국 스토어 판매 TOP 100 · 월간 평균 동접 · 역대 최고 동접
 *   /steam/{appid}/    게임별 동접 추이 · 월별 기록 · 판매 순위
 * 데이터는 src/rank/steam-stats.js (history/ 일별 이력). 스타일은 60-rank-chart.css + 63-steam-hub.css (.rk-*).
 */
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { loadSteamStats } = require('../../rank/steam-stats');
const { loadReports, reportsFor } = require('../../rank/reports');

const siteBaseUrl = 'https://gamerscroll.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
const pctChg = (p) => (p == null ? '<span class="rk-chg new">NEW</span>' : `<span class="rk-chg ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'}${Math.abs(p).toFixed(0)}%</span>`);
const rankChg = (cur, prev) => (prev == null ? '<span class="rk-chg new">NEW</span>' : cur < prev ? `<span class="rk-chg up">▲${prev - cur}</span>` : cur > prev ? `<span class="rk-chg down">▼${cur - prev}</span>` : '<span class="rk-chg same">=</span>');
const gameHref = (id) => `/steam/${id}/`;

// 동접자 스파크라인 (값이 클수록 위)
function spark(vals, { w = 72, h = 22, color } = {}) {
  const nums = vals.filter((x) => x != null);
  if (nums.length < 2) return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const y = (v) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4));
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + ((i / (vals.length - 1)) * w).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; pen = true; });
  const c = color || (nums[nums.length - 1] > nums[0] ? 'var(--rk-up)' : nums[nums.length - 1] < nums[0] ? 'var(--rk-down)' : 'var(--rk-dim)');
  return `<svg class="rk-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}
// 큰 선 그래프 (동접자)
function lineChart(vals, dates, { w = 1040, h = 260 } = {}) {
  const nums = vals.filter((v) => v != null);
  if (!nums.length) return '';
  const hi = Math.max(...nums) * 1.05, L = 60, R = 12, T = 12, B = 26, n = vals.length;
  const x = (i) => L + (i / Math.max(n - 1, 1)) * (w - L - R);
  const y = (v) => T + (1 - v / hi) * (h - T - B);
  let grid = '';
  for (let k = 0; k <= 4; k++) { const v = (hi * k) / 4; grid += `<line x1="${L}" x2="${w - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--rk-line)"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--rk-dim)">${fmt(v)}</text>`; }
  let lab = '';
  for (let i = 0; i < n; i += Math.max(1, Math.ceil(n / 8))) lab += `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="11" fill="var(--rk-dim)" text-anchor="middle">${dates[i].slice(5)}</text>`;
  let d = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  return `<svg class="rk-chartsvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="일별 동접자 추이">${grid}${lab}<path d="${d}" fill="none" stroke="var(--rk-accent)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
const subnav = (active) => { const item = (id, href, label, cls = '') => `<a class="${[active === id ? 'active' : '', cls].filter(Boolean).join(' ')}" href="${href}">${label}</a>`; return `<nav class="rk-subnav" aria-label="스팀 순위 종류">${item('ccu', '/steam/', '동접')}${item('sell', '/steam/#sell', '판매')}${item('monthly', '/steam/#monthly', '월간')}${item('records', '/steam/#records', '역대 기록')}${item('about', '/rankings/about/', '산출 방법 ›', 'right')}</nav>`; };
const appCell = (m, href) => `<div class="rk-app cap"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div><div class="t"><a href="${href}">${esc(m.name)}</a></div><div class="d">${esc(m.developer)}</div></div></div>`;

function shell(ST, { body, title, description, canonical, crumbs, keywords }) {
  const content = `
    <section class="section active" id="steam">
      ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
      <div class="page-container rk">${body}
      </div>
    </section>`;
  return wrapWithLayout(content, {
    currentPage: 'steam',
    pageScripts: `<script>(function(){function sync(){if(location.hash==='#sell'){const tab=document.getElementById('rk-st-ios');if(tab)tab.checked=true;}else if(location.hash==='#rk-list'){const tab=document.getElementById('rk-st-and');if(tab)tab.checked=true;}}window.addEventListener('hashchange',sync);sync();})();</script>`,
    title, description, keywords, canonical,
    breadcrumbs: [{ name: '홈', url: `${siteBaseUrl}/` }, { name: '스팀', url: `${siteBaseUrl}/steam/` }, ...(crumbs || [])].filter((c, i, a) => a.findIndex((d) => d.url === c.url) === i),
  });
}

// ---------- 1. 스팀 허브 ----------
function renderSteamHub() {
  const { expandLabel } = require('../components/list-actions');
  const ST = loadSteamStats();
  const { today: T, yday: Y, days } = ST;
  const wk = days[Math.max(0, days.length - 8)];
  const total = ST.sumToday(T);
  const total7 = avg(days.slice(-8, -1).map(ST.sumToday));
  const movers = T.mp.map((r) => ({ r, p: pct(r.ccu, ST.ccuOf(wk, r.appid)) })).filter((x) => x.p != null);
  const up = movers.sort((a, b) => b.p - a.p)[0];
  const fresh = T.mp.find((r) => { const s = ST.firstSeen(r.appid); return s && s >= days[Math.max(0, days.length - 15)].date; });
  const top = T.mp[0];
  const gameSummary = (label, row, value, detail) => {
    const info = row ? ST.info(row.appid) : null;
    return `<div class="rk-stat rk-steam-game-card"><div class="l">${label}</div>${info ? `<a class="rk-steam-card-game" href="${gameHref(row.appid)}"><img src="${esc(info.img)}" alt="" width="68" height="44"><span>${esc(info.name)}</span></a>` : '<div class="rk-steam-card-game">기록 없음</div>'}<div class="s"><strong>${value}</strong>${detail ? `<br>${detail}` : ''}</div></div>`;
  };
  const kpi = `<div class="rk-stats four rk-steam-summary">
<div class="rk-stat"><div class="l">TOP 100 동시접속자</div><div class="v"><span>${fmt(total)}</span><small>명</small></div><div class="s">7일 평균 대비 ${total7 ? `<span class="rk-chg ${total >= total7 ? 'up' : 'down'}">${total >= total7 ? '▲' : '▼'}${Math.abs(pct(total, total7)).toFixed(1)}%</span>` : '-'}</div></div>
${gameSummary('동시접속자 1위', top, `${fmt(top.ccu)}명`, '현재 동시접속자')}
${gameSummary('7일 최대 증가율', up && up.r, up ? `▲${up.p.toFixed(0)}%` : '-', up ? `현재 ${fmt(up.r.ccu)}명` : '비교 기록 없음')}
${gameSummary('최근 신규 진입', fresh, fresh ? `${fmt(fresh.ccu)}명` : '-', fresh ? `현재 ${fresh.rank}위` : '최근 2주 신규 없음')}</div>`;

  const VISIBLE = 20;
  const mpRows = T.mp.map((r, i) => { const m = ST.info(r.appid); const p = pct(r.ccu, ST.ccuOf(wk, r.appid)); const pr = ST.rankOf(Y, r.appid); return `<li${i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${i < 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><a href="${gameHref(r.appid)}">${esc(m.name)}</a><span class="dv">${esc(m.developer)}</span></div><div class="num"><b>${fmt(r.ccu)}</b><i>${pr == null ? 'NEW' : pr === r.rank ? '=' : pr > r.rank ? `▲${pr - r.rank}` : `▼${r.rank - pr}`} · 순위</i></div><div class="pct">${pctChg(p)}</div>${spark(ST.series(r.appid).slice(-30))}</li>`; }).join('');
  const sellRows = T.sellers.map((r, i) => { const m = ST.info(r.appid); const pr = ST.sellOf(Y, r.appid); return `<li${i >= VISIBLE ? ' class="ext"' : ''}><span class="rk-rk ${i < 3 ? 'top' : ''}">${r.rank}</span><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async"><div class="nm"><a href="${gameHref(r.appid)}">${esc(m.name)}</a><span class="dv">${esc(m.developer)}</span></div><div class="rk-price">${r.discount ? `<span class="rk-disc">${esc(r.discount)}</span>` : ''}<span>${esc(r.price || '')}</span></div><div class="rt">${rankChg(r.rank, pr)}</div></li>`; }).join('');
  const col = (id, s, title, sub, rows, n) => `<div class="rk-col ${s}"${s === 'ios' ? ' id="sell"' : ''}><div class="rk-colh"><h2>${title}</h2><small>${sub}</small></div><input type="checkbox" id="${id}" class="rk-more-toggle rk-control" checked aria-label="${title} 전체 순위 표시"><ol class="rk-list steam${s === 'ios' ? ' sell' : ''}">${rows}</ol>${n > VISIBLE ? expandLabel(id, n, VISIBLE) : ''}</div>`;
  const cols = `<input type="radio" name="rk-store" id="rk-st-and" class="rk-control" checked><input type="radio" name="rk-store" id="rk-st-ios" class="rk-control"><div class="rk-storeseg"><label for="rk-st-and">동접</label><label for="rk-st-ios">판매</label></div>
<div class="rk-cols" id="rk-list">${col('rk-more-ccu', 'and', '동시접속자 순위', '수집 시점 접속자 수 · 7일 대비 · 30일 추이', mpRows, T.mp.length)}${col('rk-more-sell', 'ios', '판매 순위', '한국 스토어 · 가격 · 할인율', sellRows, T.sellers.length)}</div>`;

  const mo = ST.latestMonth;
  const monthly = ST.monthlyTop(mo, 10).map((a) => `<tr><td class="rk-rank ${a.rank <= 3 ? 'top' : ''}">${a.rank}</td><td>${appCell(ST.info(a.appid), gameHref(a.appid))}</td><td class="v">${fmt(a.avg)}<small>월 평균 동접</small></td></tr>`).join('');
  const peaks = ST.allTimePeaks(10).map((a, i) => `<tr><td class="rk-rank ${i < 3 ? 'top' : ''}">${i + 1}</td><td>${appCell(ST.info(a.appid), gameHref(a.appid))}</td><td class="v">${fmt(a.ccu)}<small>${a.date}</small></td></tr>`).join('');
  const lead = `스팀 동접자 1위 ${ST.info(top.appid).name}(${fmt(top.ccu)}명), 2위 ${T.mp[1] ? ST.info(T.mp[1].appid).name : '-'}, 3위 ${T.mp[2] ? ST.info(T.mp[2].appid).name : '-'}. 한국 스토어 최고 판매 1위 ${T.sellers[0] ? ST.info(T.sellers[0].appid).name : '-'}. ${T.date} 기준, 매일 갱신.`;
  const body = `<div class="rk-head"><h1>스팀 게임 순위</h1></div>
${kpi}
${cols}
<div class="rk-grid2 home" id="monthly"><div class="rk-card"><h2>월간 동시접속자 순위 <small>${mo} · 일별 기록 평균 TOP 10</small></h2><table class="rk-table"><tbody>${monthly}</tbody></table></div><div class="rk-card" id="records"><h2>최고 동시접속자 기록 <small>${days[0].date} 이후 TOP 10</small></h2><table class="rk-table"><tbody>${peaks}</tbody></table></div></div>`;
  const canonical = `${siteBaseUrl}/steam/`;
  return shell(ST, {
    body,
    title: `스팀 게임 순위 — 동접자·판매 TOP 100 (${T.date}) | 게이머스크롤`,
    description: lead,
    keywords: '스팀 순위, 스팀 동접자 순위, 스팀 동시접속자, 스팀 판매 순위, 스팀 인기 게임, 스팀 매출 순위, 스팀 차트',
    canonical,
    crumbs: [],
  });
}

// ---------- 2. 스팀 게임 상세 ----------
function renderSteamGame(appid) {
  const { listLink } = require('../components/list-actions');
  const ST = loadSteamStats();
  const id = String(appid);
  const m = ST.info(id);
  const { today: T, yday: Y, days } = ST;
  const ser = ST.series(id); const dates = days.map((d) => d.date);
  const cur = ST.ccuOf(T, id), prev = ST.ccuOf(Y, id);
  const last30 = ser.slice(-30).filter((v) => v != null);
  const pk = ST.peak(id);
  const rank = ST.rankOf(T, id), sell = ST.sellOf(T, id);
  const sellRow = T.tsIdx.get(id);
  const first = ST.firstSeen(id);
  const onChart = ST.daysOnChart(id);
  const monthly = ST.months.filter((mo) => ST.daysIn(mo).some((d) => ST.ccuOf(d, id) != null || ST.sellOf(d, id) != null)).map((mo) => {
    const dd = ST.daysIn(mo);
    const v = dd.map((d) => ST.ccuOf(d, id)).filter((x) => x != null);
    const rk = dd.map((d) => ST.rankOf(d, id)).filter((x) => x != null);
    const sl = dd.map((d) => ST.sellOf(d, id)).filter((x) => x != null);
    return { mo, avg: avg(v), max: v.length ? Math.max(...v) : null, rank: avg(rk), bestRank: rk.length ? Math.min(...rk) : null, sell: sl.length ? Math.min(...sl) : null, n: v.length };
  }).reverse();
  const related = reportsFor(loadReports(), { name: m.name }, 3);
  const text = `${m.name}의 ${T.date} 스팀 동접자 ${cur != null ? `${fmt(cur)}명(동접 ${rank}위)` : '동접 TOP 100 밖'}${sell ? `, 한국 스토어 판매 ${sell}위` : ''}. 30일 평균 ${fmt(avg(last30))}명, 역대 최고 ${fmt(pk.ccu)}명(${pk.date || '-'}), 동접 TOP 100 체류 ${onChart}일.`;
  const body = `<div class="rk-crumb"><a href="/steam/">스팀</a><span>›</span><span>${esc(m.name)}</span></div>
<div class="rk-hero"><img src="${esc(m.img)}" alt="" fetchpriority="high"><div><h1>${esc(m.name)}</h1><div class="meta"><b>${esc(m.developer)}</b><span>·</span><span>Steam</span>${first ? `<span>·</span><span>${first} 첫 기록</span>` : ''}</div><div class="rk-pills">${rank ? `<span class="${rank === 1 ? 'one' : ''}">동접 ${rank}위</span>` : ''}${sell ? `<span class="${sell === 1 ? 'one' : ''}">판매 ${sell}위</span>` : ''}${sellRow && sellRow.discount ? `<span>${esc(sellRow.discount)} 할인 · ${esc(sellRow.price || '')}</span>` : sellRow && sellRow.price ? `<span>${esc(sellRow.price)}</span>` : ''}</div></div><div class="actions"><a class="rk-btn primary" href="https://store.steampowered.com/app/${id}/" target="_blank" rel="noopener">Steam 스토어</a></div></div>
<p class="rk-lead">${esc(text)}</p>
<div class="rk-stats four">
<div class="rk-stat"><div class="l">현재 동접자</div><div class="v">${cur == null ? '기록 없음' : fmt(cur)}${cur != null && prev ? `<span class="rk-chg ${cur >= prev ? 'up' : 'down'}">${cur >= prev ? '▲' : '▼'}${Math.abs(pct(cur, prev)).toFixed(1)}%</span>` : ''}</div><div class="s">${cur == null ? '현재 수집 범위 밖' : '전일 대비'}</div></div>
<div class="rk-stat"><div class="l">30일 평균 동접</div><div class="v">${last30.length ? fmt(avg(last30)) : '기록 없음'}</div><div class="s">최근 ${last30.length}일 기록</div></div>
<div class="rk-stat"><div class="l">역대 최고 동접</div><div class="v">${fmt(pk.ccu)}</div><div class="s">${pk.date || '-'}</div></div>
<div class="rk-stat"><div class="l">동접 TOP 100 체류</div><div class="v">${onChart}<small>일</small></div><div class="s">${days.length}일 중</div></div></div>
${ser.filter((v) => v != null).length >= 2 ? `<div class="rk-card"><h2>동접자 추이 <small>일별 · ${days[0].date} ~ ${T.date}</small></h2><div class="rk-chart">${lineChart(ser, dates)}</div></div>` : ''}
<div class="rk-card"><h2>월별 기록</h2><table class="rk-table"><thead><tr><th>월</th><th class="r">평균 동접</th><th class="r">최고 동접</th><th class="c">평균 순위</th><th class="c">최고 순위</th><th class="c">판매 최고</th><th class="c">기록일</th></tr></thead><tbody>${monthly.map((r) => `<tr><td><b>${r.mo}</b></td><td class="r">${fmt(r.avg)}</td><td class="r">${fmt(r.max)}</td><td class="c">${r.rank != null ? r.rank.toFixed(1) : '-'}</td><td class="c">${r.bestRank != null ? r.bestRank + '위' : '-'}</td><td class="c">${r.sell != null ? r.sell + '위' : '-'}</td><td class="c">${r.n}</td></tr>`).join('')}</tbody></table></div>
${related.length ? `<section class="rk-section"><h2>관련 리포트</h2><div class="rk-cards">${related.map((a) => `<a class="rk-cardl" href="${a.href}"><img src="${esc(a.thumbnail)}" alt="" loading="lazy"><div class="b"><div class="k">${a.catName}<span>${a.date}</span></div><div class="t">${esc(a.title)}</div></div></a>`).join('')}</div>${listLink('/reports/', '리포트 전체 보기')}</section>` : ''}`;
  const canonical = `${siteBaseUrl}/steam/${id}/`;
  return shell(ST, {
    body,
    title: `${m.name} 스팀 동접자·판매 순위 추이 (${T.date}) | 게이머스크롤`,
    description: text,
    keywords: `${m.name} 동접자, ${m.name} 스팀 순위, ${m.name} 동시접속자, ${m.name} 판매 순위`,
    canonical,
    crumbs: [{ name: m.name, url: canonical }],
  });
}

// 상세 페이지를 만들 앱 ID 목록
function steamGameIds() { return loadSteamStats().pageApps(14); }

module.exports = { renderSteamHub, renderSteamGame, steamGameIds };
