'use strict';

/**
 * Game page rank summary card, rendered from the compact per-game rank data (docs/games-data/<slug>.json → `rank`).
 * Pure: no fs/path and no rank statistics, so it runs in Node and in the Cloudflare Workers runtime.
 *
 *   rank = { s: { <country>: { ios: {o, v}, android: {o, v} } }, h: { <country>: { ios: [[time, rank]], android: [...] } } }
 *     s: daily revenue-chart rank series; v = ranks (null = not on chart) starting at day index o, trailing nulls trimmed
 *     h: ranks by collection time of the latest archived day
 *   meta = { days: ['YYYY-MM-DD', ...], hourlyDate }   (shared by every game, docs/games-data/_meta.json)
 */
const { t: tt, formatDay, formatMonthDay, formatYearMonth } = require('../../i18n');
const { interactiveRankChart } = require('../components/interactive-rank-chart');
const { hourlyRankChart } = require('../components/hourly-rank-chart');

const COUNTRIES = ['kr', 'jp', 'us', 'cn', 'tw'];
const COUNTRY_KEYS = { kr: 'stats.korea', jp: 'stats.japan', us: 'stats.united_states', cn: 'stats.china', tw: 'stats.taiwan' };
const STORE_KEYS = { ios: 'stats.app_store', android: 'stats.google_play' };

const nums = (arr) => arr.filter((x) => x != null);
const min = (arr) => (nums(arr).length ? Math.min(...nums(arr)) : null);
const avg = (arr) => (nums(arr).length ? nums(arr).reduce((x, y) => x + y, 0) / nums(arr).length : null);
const std = (arr) => { const v = nums(arr); if (v.length < 2) return null; const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length); };
const fmt1 = (n) => (n == null || Number.isNaN(n) ? '-' : Number(n).toFixed(1));
const dirText = (rank, prev) => (prev == null || rank == null ? '' : prev - rank > 0 ? `▲${prev - rank}` : prev - rank < 0 ? `▼${rank - prev}` : '=');

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

// {o, v} → full-length series (null where the game was not on the chart)
function expand(entry, length) {
  const out = new Array(length).fill(null);
  if (entry) entry.v.forEach((r, i) => { out[entry.o + i] = r; });
  return out;
}

const INDEXABLE_DAYS = 30;

// Chart days of a country's base chart: App Store only for China, otherwise the store with more days.
function countryDays(rank, c, length) {
  const ios = nums(expand(rank.s[c] && rank.s[c].ios, length)).length;
  const android = nums(expand(rank.s[c] && rank.s[c].android, length)).length;
  return c === 'cn' ? ios : Math.max(ios, android);
}

// The edition's home country while it has a substantial chart history; otherwise the country with the most chart days.
// Because of the fallback, "some country has >= 30 days" holds for exactly the editions' pages being indexable, i.e. for all or none.
function pickCountry(rank, home, length) {
  if (countryDays(rank, home, length) >= INDEXABLE_DAYS) return home;
  let best = home, bestCount = countryDays(rank, home, length);
  for (const c of COUNTRIES) { const n = countryDays(rank, c, length); if (n > bestCount) { best = c; bestCount = n; } }
  return best;
}

// Chart days of the base chart (the page is indexable from 30 days on).
function summaryDays(rank, meta, home) {
  return rank ? countryDays(rank, pickCountry(rank, home, meta.days.length), meta.days.length) : 0;
}

function renderGameRankSummary(rank, meta, name, home) {
  if (!rank) return null;
  const days = meta.days;
  const L = days.length;
  const todayDate = days[L - 1];
  const country = pickCountry(rank, home, L);
  const c = tt(COUNTRY_KEYS[country]);
  const series = (cc, s) => expand(rank.s[cc] && rank.s[cc][s], L);
  const stores = { ios: tt(STORE_KEYS.ios), android: tt(STORE_KEYS.android) };

  // 기준 스토어: 앱스토어 이력이 있으면 앱스토어(중국은 항상 앱스토어), 없으면 구글플레이
  const kr = series(country, 'ios'), krA = series(country, 'android');
  const useIos = country === 'cn' || nums(kr).length >= nums(krA).length;
  const base = useIos ? kr : krA, baseStore = useIos ? 'ios' : 'android';
  const other = useIos ? krA : kr, otherStore = useIos ? 'android' : 'ios';
  const present = nums(base);
  const last = (a) => a[a.length - 1];
  const cur = last(base), prev = base[base.length - 2];
  const last30 = base.slice(-30);
  const allBest = min(base);
  const bestDay = allBest == null ? null : days[base.indexOf(allBest)];
  const seen = (() => { const i = base.findIndex((x) => x != null); return i < 0 ? null : days[i]; })();
  const top1Days = base.filter((x) => x === 1).length;
  let streak = 0;
  for (let i = L - 1; i >= 0 && base[i] === 1; i--) streak++;
  const vol30 = std(last30);
  const top10Window = days.map((d, i) => ({ date: d, rank: base[i] })).filter((d) => Date.parse(d.date) >= Date.parse(todayDate) - 29 * 86400000);
  const top10Days = top10Window.filter((d) => d.rank != null && d.rank <= 10).length;

  const text = tt('game.sum_text', { name, date: formatDay(todayDate), c, p2: stores[baseStore], p3: cur != null ? tt('rank.current_rank_number', { cur }) : tt('rank.no_current_record'), p4: prev != null && cur != null ? ` ${tt('rank.previous_day_2', { p0: dirText(cur, prev) })}` : '', p5: stores[otherStore], p6: last(other) != null ? tt('rank.rank_number', { p0: last(other) }) : tt('rank.no_current_record'), p7: present.length ? tt('rank.30_day_average_all_time', { p0: fmt1(avg(last30)), allBest, bestDay: formatDay(bestDay), top1Days }) : tt('game.sum_no_history', { c }) });

  // 90일 차트: 데스크톱(1040px)과 모바일(360px) 두 벌을 렌더하고 CSS(.rk-chart-dual)로 화면 폭에 따라 하나만 보인다.
  const N = Math.min(90, L);
  const win = days.slice(-N);
  const buildRankChart = ({ W, H, L: left, fs, mobile = false, ios = kr, android = krA, label = c }) => {
    const winMax = Math.max(5, ...nums([...ios.slice(-N), ...android.slice(-N)]));
    const yMax = winMax <= 10 ? 10 : winMax <= 25 ? 25 : winMax <= 50 ? 50 : winMax <= 100 ? 100 : Math.ceil(winMax / 50) * 50;
    const R = 12, T = 12, B = 28;
    const x = (i) => left + (i / Math.max(win.length - 1, 1)) * (W - left - R);
    const yv = (r) => T + ((Math.min(r, yMax) - 1) / (yMax - 1)) * (H - T - B);
    const poly = (arr, color, seriesIndex) => {
      let d = '', open = false;
      const values = arr.slice(-N), dots = [];
      values.forEach((r, i) => {
        if (r == null || r > yMax) { open = false; return; }
        d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(r).toFixed(1) + ' '; open = true;
        if ((i === 0 || values[i - 1] == null) && (i === values.length - 1 || values[i + 1] == null)) dots.push(`<circle data-rank-series="${seriesIndex}" cx="${x(i)}" cy="${yv(r)}" r="4" fill="${color}"/>`);
      });
      return (d ? `<path data-rank-series="${seriesIndex}" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` : '') + dots.join('');
    };
    const yTicks = ({ 10: [1, 3, 5, 10], 25: [1, 5, 10, 25], 50: [1, 10, 25, 50], 100: [1, 10, 25, 50, 100], 200: [1, 50, 100, 150, 200] })[yMax] || [1, Math.round(yMax / 4), Math.round(yMax / 2), Math.round(yMax * .75), yMax];
    const gridY = yTicks.map((r) => `<line x1="${left}" x2="${W - R}" y1="${yv(r)}" y2="${yv(r)}" stroke="var(--rk-line)"/><text x="${left - 6}" y="${yv(r) + 4}" font-size="${fs}" fill="var(--rk-dim)" text-anchor="end">${r}</text>`).join('');
    const ticks = [0, Math.floor(win.length / 3), Math.floor((2 * win.length) / 3), win.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" font-size="${fs}" fill="var(--rk-dim)" text-anchor="middle">${formatMonthDay(win[i])}</text>`).join('');
    return interactiveRankChart(
      `<svg class="rk-chartsvg${mobile ? ' rk-chartsvg-m' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tt('game.sum_chart_aria', { N, c: label })}">${gridY}${ticks}${poly(ios, '#0071e3', 0)}${poly(android, '#159668', 1)}</svg>`,
      win,
      [{ name: stores.ios, color: '#0071e3', values: ios.slice(-N) }, { name: stores.android, color: '#159668', values: android.slice(-N) }],
      win.map((_, i) => x(i)),
      win.map(formatDay)
    );
  };
  // 나라 전환: 기록이 있는 나라마다 같은 차트를 미리 그려 두고 라디오 버튼(자바스크립트 없이)으로 바꿔 본다. 기준 나라가 맨 앞.
  const chartOf = (cc) => { const o = { ios: series(cc, 'ios'), android: series(cc, 'android'), label: tt(COUNTRY_KEYS[cc]) };
    return `<div class="rk-chart-d">${buildRankChart({ W: 1040, H: 240, L: 36, fs: 11, ...o })}</div><div class="rk-chart-m">${buildRankChart({ W: 360, H: 220, L: 34, fs: 12, mobile: true, ...o })}</div>`; };
  const chartCountries = [country, ...COUNTRIES.filter((cc) => cc !== country)].filter((cc) => nums([...series(cc, 'ios').slice(-N), ...series(cc, 'android').slice(-N)]).length);
  const nowOf = (cc) => { const v = nums([last(series(cc, 'ios')), last(series(cc, 'android'))]); return v.length ? Math.min(...v) : null; };
  const chart = chartCountries.length > 1
    ? `<div class="rk-gc">${chartCountries.map((cc, i) => `<input type="radio" name="rk-gc" id="rk-gc-${cc}" class="rk-gc-input"${i === 0 ? ' checked' : ''}>`).join('')}<div class="rk-gc-tabs" role="group" aria-label="${tt('rank.country')}">${chartCountries.map((cc) => `<label for="rk-gc-${cc}"><span>${tt(COUNTRY_KEYS[cc])}</span><b>${nowOf(cc) == null ? '-' : nowOf(cc) + tt('chart.rank_unit')}</b></label>`).join('')}</div>${chartCountries.map((cc) => `<div class="rk-gc-panel rk-gc-${cc} rk-chart-dual">${chartOf(cc)}</div>`).join('')}</div>`
    : chartOf(country);

  // 시간대별
  const hourOf = (store) => ((rank.h && rank.h[country] && rank.h[country][store]) || []).map(([time, r]) => ({ time, rank: r }));
  const iosHours = hourOf('ios'), androidHours = hourOf('android');
  const hourCard = [...iosHours, ...androidHours].some((h) => Number.isFinite(h.rank) && h.rank > 0) ? `<div class="rk-card rk-hourly-card"><h2>${tt('rank.revenue_rank_by_time_of')} <small>${tt('game.sum_hourly_sub', { date: formatDay(meta.hourlyDate), c, length: iosHours.length, length2: androidHours.length })}</small></h2><div class="rk-chart">${hourlyRankChart(iosHours, androidHours)}</div><div class="rk-note">${tt('rank.times_shown_are_data_collection')}</div></div>` : '';

  // 최근 기간 비교: 차트에 기록된 날만 평균에 포함한다.
  const comparisonRows = ['ios', 'android'].flatMap((store) => [7, 30].map((period) => {
    const s = store === 'ios' ? kr : krA;
    const cutoff = Date.parse(todayDate) - (period - 1) * 86400000;
    const values = nums(days.map((d, i) => (Date.parse(d) >= cutoff ? s[i] : null)));
    return `<tr><td>${stores[store]}</td><td class="c">${tt('rank.days_3', { period })}</td><td class="c">${values.length ? fmt1(avg(values)) + tt('chart.rank_unit') : '-'}</td><td class="c">${values.length ? min(values) + tt('chart.rank_unit') : '-'}</td><td class="c">${tt('rank.days_2', { length: values.length })}</td></tr>`;
  })).join('');
  const comparisonCard = `<div class="rk-card"><h2>${tt('rank.recent_period_comparison')} <small>${tt('game.sum_as_of', { c, date: formatDay(todayDate) })}</small></h2><table class="rk-table"><thead><tr><th>${tt('rank.store')}</th><th class="c">${tt('rank.period')}</th><th class="c">${tt('rank.avg_rank')}</th><th class="c">${tt('home.best_rank')}</th><th class="c">${tt('rank.days_on_chart')}</th></tr></thead><tbody>${comparisonRows}</tbody></table><div class="rk-note">${tt('rank.only_chart_entry_records_within')}</div></div>`;

  // 국가별 (이 에디션의 홈 국가 페이지가 /rankings/ 이다)
  const countryHref = (cc) => (cc === home ? '/rankings/' : `/rankings/${cc}/`);
  const countryIdx = days.map((d, i) => i).filter((i) => Date.parse(days[i]) >= Date.parse(todayDate) - 29 * 86400000);
  const countryRows = COUNTRIES.map((cc) => {
    const fullIos = series(cc, 'ios'), fullAndroid = series(cc, 'android');
    const ios = countryIdx.map((i) => fullIos[i]);
    const android = countryIdx.map((i) => fullAndroid[i]);
    return `<tr><td><a href="${countryHref(cc)}">${tt(COUNTRY_KEYS[cc])}</a></td><td class="c">${last(fullIos) ?? '-'}</td><td class="spk">${sparkline(ios, { cap: 200, color: 'var(--rk-ios)' })}</td><td class="c">${last(fullAndroid) ?? '-'}</td><td class="spk">${sparkline(android, { cap: 200, color: 'var(--rk-and)' })}</td><td class="c" data-period-best="${cc}">${min(ios) ?? '-'} / ${min(android) ?? '-'}</td></tr>`;
  }).join('');
  const countryCard = `<div class="rk-card rk-country-period"><h2>${tt('rank.rankings_by_country')} <small>${tt('rank.5_countries_revenue_last_30')}</small></h2><table class="rk-table"><thead><tr><th>${tt('rank.country')}</th><th class="c">${stores.ios}</th><th class="spk">${tt('rank.30_day_trend')}</th><th class="c">${stores.android}</th><th class="spk">${tt('rank.30_day_trend')}</th><th class="c">${tt('rank.30_day_best')}</th></tr></thead><tbody>${countryRows}</tbody></table><p class="rk-note">${tt('rank.best_rank_app_store_google', { p0: days[countryIdx[0]] ? formatDay(days[countryIdx[0]]) : '-', date: formatDay(todayDate) })}</p></div>`;

  // 월별 표
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const mrow = months.map((mo) => {
    const idx = days.map((d, i) => i).filter((i) => days[i].startsWith(mo));
    return { mo, iosAvg: avg(idx.map((i) => kr[i])), andAvg: avg(idx.map((i) => krA[i])), best: min(idx.map((i) => base[i])), ones: idx.filter((i) => base[i] === 1).length };
  });
  const monthlyCard = `<div class="rk-card rk-game-months"><h2>${tt('rank.monthly_trend')} <small>${tt('game.sum_avg_sub', { c })}</small></h2><table class="rk-table"><thead><tr><th>${tt('rank.month')}</th><th class="c">${stores.ios}</th><th class="c">${tt('rank.prev_month')}</th><th class="c">${stores.android}</th><th class="c">${tt('rank.best')}</th><th class="c">${tt('rank.days_at_1')}</th></tr></thead><tbody>${mrow.slice().reverse().map((r, i, arr) => { if (r.iosAvg == null && r.andAvg == null) return ''; const p = arr[i + 1]; const d = p && p.iosAvg != null && r.iosAvg != null ? p.iosAvg - r.iosAvg : null; return `<tr><td><a href="/rankings/monthly/${r.mo}/">${formatYearMonth(r.mo)}</a></td><td class="c">${fmt1(r.iosAvg)}</td><td class="c">${d == null ? '-' : d > 0 ? `<span class="rk-chg up">▲${d.toFixed(1)}</span>` : d < 0 ? `<span class="rk-chg down">▼${(-d).toFixed(1)}</span>` : '='}</td><td class="c">${fmt1(r.andAvg)}</td><td class="c">${r.best ?? '-'}</td><td class="c">${r.ones || '-'}</td></tr>`; }).join('') || tt('rank.there_are_no_monthly_ranking')}</tbody></table></div>`;

  // 기록 타임라인
  const events = [];
  if (seen) events.push([seen, tt('game.sum_first_entered', { c, p0: stores[baseStore], p1: seen === days[0] ? tt('rank.start_of_tracking') : '' })]);
  if (bestDay) events.push([bestDay, tt('rank.reached_all_time_best', { allBest })]);
  let run = 0, runStart = null;
  base.forEach((r, i) => { if (r === 1) { if (!run) runStart = days[i]; run++; } else { if (run >= 7) events.push([runStart, tt('rank.1_for_days_in_a_2', { run, date: formatDay(days[i - 1]) })]); run = 0; } });
  if (run >= 7) events.push([runStart, tt('rank.1_for_days_in_a', { run })]);
  base.forEach((r, i) => { if (i > 0 && base[i - 1] != null && r != null && base[i - 1] - r >= 20) events.push([days[i], tt('rank.jumped_from_to_in_one', { p0: base[i - 1], r })]); });
  const recordCard = `<div class="rk-card"><h2>${tt('rank.key_records')} <small>${tt('game.sum_store', { c, p0: stores[baseStore] })}</small></h2><table class="rk-table rk-game-records"><thead><tr><th>${tt('rank.date')}</th><th>${tt('rank.record')}</th></tr></thead><tbody>${events.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([d, tx]) => `<tr><td>${formatDay(d)}</td><td>${tx}</td></tr>`).join('') || tt('rank.no_records_were_collected')}</tbody></table></div>`;

  const hasTop10Data = top10Window.some((d) => d.rank != null);
  const stats = `<div class="rk-stats">
<div class="rk-stat"><div class="l">${tt('rank.current_rank')}</div><div class="v">${cur ?? '-'}<small>${cur != null ? tt('chart.rank_unit') : tt('chart.no_record')}</small></div><div class="s">${tt('game.sum_store_prev', { c, p0: stores[baseStore], p1: prev != null && cur != null ? tt('rank.previous_day') + dirText(cur, prev) : '' })}<br>${stores[otherStore]} ${last(other) != null ? last(other) + tt('chart.rank_unit') : tt('chart.no_record')}</div></div>
<div class="rk-stat"><div class="l">${tt('rank.30_day_best_average')}</div><div class="v">${min(last30) ?? '-'}<small>${tt('chart.rank_unit')}</small></div><div class="s">${tt('rank.avg_volatility', { p0: fmt1(avg(last30)), p1: fmt1(vol30) })}</div></div>
<div class="rk-stat"><div class="l">${tt('rank.all_time_best_days_at')}</div><div class="v">${allBest ?? '-'}<small>${tt('chart.rank_unit')}</small></div><div class="s">${tt('rank.1_for_days_3', { p0: bestDay ? formatDay(bestDay) : '', top1Days, p2: streak > 1 ? ` ${tt('rank.days_in_a_row', { streak })}` : '' })}</div></div>
<div class="rk-stat"><div class="l">${tt('rank.top_10_streak_in_the')}</div><div class="v">${hasTop10Data ? top10Days : '-'}<small>${tt('rank.days')}</small></div><div class="s">${hasTop10Data ? tt('game.sum_cum_days', { c, p0: stores[baseStore] }) : tt('rank.no_records_for_this_period')}</div></div>
</div>`;

  const html = `<div class="rk rk-game">
<div class="rk-card rk-game-trend"><h2>${tt('rank.ranking_trend_last_days', { N })} <small>${tt('game.sum_revenue', { c })}</small></h2><div class="rk-chart rk-chart-dual">${nums([...base.slice(-N), ...other.slice(-N)]).length ? chart : tt('game.sum_none', { c })}</div></div>
${stats}
${hourCard}
${comparisonCard}
${countryCard}
<div class="rk-grid2">${monthlyCard}${recordCard}</div>
</div>`;
  // 머리말 오른쪽: 기준 차트의 현재 순위와 전일 대비
  const diff = prev != null && cur != null ? prev - cur : null;
  const hero = cur == null ? '' : `<div class="game-hero-now"><span class="l">${tt('game.sum_revenue', { c })} · ${stores[baseStore]}</span><span class="v"><b>${cur}</b><small>${tt('chart.rank_unit')}</small>${diff == null ? '' : `<span class="rk-chg ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'}">${diff > 0 ? '▲' + diff : diff < 0 ? '▼' + -diff : '='}</span>`}</span><span class="s">${tt('rank.30_day_best_average')} ${min(last30) ?? '-'} / ${fmt1(avg(last30))}</span></div>`;
  return { html, text, cur, baseStore, days: present.length, hero };
}

module.exports = { renderGameRankSummary, summaryDays, pickCountry, expand, INDEXABLE_DAYS };
