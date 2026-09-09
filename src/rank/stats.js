'use strict';
/**
 * 순위 통계 데이터 계층
 * history/*.json(일별 매출 순위) + data/games.json 을 한 번 읽어 순위 허브·월간·글로벌·역대·게임 요약에
 * 필요한 집계 함수를 제공한다. mockups/build.js 의 데이터 부분을 사이트용으로 옮긴 것.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const COUNTRIES = { kr: '한국', jp: '일본', us: '미국', cn: '중국', tw: '대만' };
const STORES = { ios: '앱스토어', android: '구글플레이' };

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const nums = (arr) => arr.filter((x) => x != null);
const min = (arr) => (nums(arr).length ? Math.min(...nums(arr)) : null);
const avg = (arr) => (nums(arr).length ? nums(arr).reduce((x, y) => x + y, 0) / nums(arr).length : null);
const std = (arr) => { const v = nums(arr); if (v.length < 2) return null; const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length); };
const fmt1 = (n) => (n == null || Number.isNaN(n) ? '-' : Number(n).toFixed(1));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 수집 시각은 KST 로 고정 표기 (CI 는 UTC)
const tsText = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};

let cached = null;

function loadRankStats(options = {}) {
  if (cached && !options.force) return cached;
  const historyDir = options.historyDir || path.join(ROOT, 'history');
  const gamesPath = options.gamesPath || path.join(ROOT, 'data', 'games.json');

  // ---------- 게임 사전 ----------
  const gamesObj = readJson(gamesPath).games || {};
  const games = Object.entries(gamesObj).map(([key, g]) => ({ key, ...g }));
  const byApp = new Map();
  const bySlug = new Map();
  const byTitle = new Map(); // 초기 포맷(앱 ID 없음) 행을 제목으로 게임에 연결
  for (const g of games) {
    if (g.slug) bySlug.set(g.slug, g);
    for (const t of [g.key, ...(g.aliases || [])]) if (!g.disableTitleFallback && t && !byTitle.has(t)) byTitle.set(t, g);
    if (!g.appIds) continue;
    if (g.appIds.ios) byApp.set('ios:' + g.appIds.ios, g);
    if (g.appIds.android) byApp.set('android:' + g.appIds.android, g);
    for (const c of Object.keys(COUNTRIES)) {
      if (g.appIds[`ios_${c}`]) byApp.set('ios:' + g.appIds[`ios_${c}`], g);
      if (g.appIds[`android_${c}`]) byApp.set('android:' + g.appIds[`android_${c}`], g);
    }
  }
  const taxonomy = require('./genres').loadGenres();
  const isSub = g => taxonomy.matches(g, 'subculture');

  // ---------- 일별 이력 ----------
  const files = fs.existsSync(historyDir) ? fs.readdirSync(historyDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  const days = [];
  for (const f of files) {
    try {
      const h = readJson(path.join(historyDir, f));
      const g = h.rankings && h.rankings.grossing;
      if (!g) continue;
      const parse = (chart) => {
        const idx = {}; const rows = {};
        for (const c of Object.keys(COUNTRIES)) {
          idx[c] = {}; rows[c] = {};
          for (const s of Object.keys(STORES)) {
            const arr = ((chart && chart[c] && chart[c][s]) || []).map((r) => {
              // 2025-12 초기 포맷: appId 가 비어 있고 제목만 있음 → games.json 으로 ID·아이콘·개발사 보강
              if (!r || r.appId || !r.title) return r;
              const gm = byTitle.get(r.title);
              return gm && gm.appIds && gm.appIds[s] ? { ...r, appId: String(gm.appIds[s]), icon: r.icon || gm.icon, developer: r.developer || gm.developer } : r;
            });
            const m = new Map();
            arr.forEach((r, i) => { if (r && r.appId) m.set(String(r.appId), i + 1); });
            idx[c][s] = m; rows[c][s] = arr;
          }
        }
        return { idx, rows };
      };
      const gr = parse(g);
      const fr = parse(h.rankings.free);
      // idx/rows = 매출(grossing), idxFree/rowsFree = 인기(무료)
      days.push({ date: f.slice(0, 10), ts: h.timestamp, idx: gr.idx, rows: gr.rows, idxFree: fr.idx, rowsFree: fr.rows });
    } catch {}
  }
  if (days.length < 2) throw new Error('순위 이력이 2일 미만이라 순위 통계를 만들 수 없습니다');
  const today = days[days.length - 1];
  const yday = days[days.length - 2];
  const rankOf = (d, c, s, appId) => (d && appId ? d.idx[c][s].get(String(appId)) : undefined) ?? null;
  const seriesOf = (c, s, appId) => days.map((d) => rankOf(d, c, s, appId));
  // 인기(무료) 차트
  const freeRankOf = (d, c, s, appId) => (d && appId ? d.idxFree[c][s].get(String(appId)) : undefined) ?? null;
  const freeSeriesOf = (c, s, appId) => days.map((d) => freeRankOf(d, c, s, appId));
  const gameOf = (s, r) => (r ? byApp.get(s + ':' + r.appId) : undefined);
  const keyOf = (s, r) => { const g = gameOf(s, r); return g ? g.slug || g.key : s + ':' + r.appId; };
  const nameOf = (s, r) => { const g = gameOf(s, r); return g ? g.key : r.title; };
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))];
  const daysIn = (mo) => days.filter((d) => d.date.startsWith(mo));
  // 최신 "완성" 월: 15일 이상 집계된 마지막 달 (월초에는 전월)
  const fullMonths = months.filter((mo) => daysIn(mo).length >= 15);
  const latestMonth = fullMonths[fullMonths.length - 1] || months[months.length - 1];

  // ---------- 시간별 아카이브 (가장 최근 날) ----------
  let hourly = null;
  try {
    const arch = require(path.join(ROOT, 'scripts', 'lib', 'snapshot-archive.js'));
    const archDir = path.join(ROOT, 'snapshots', 'archive');
    const archived = fs.readdirSync(archDir).filter((f) => f.endsWith('.json.br')).sort();
    if (archived.length) { const date = archived[archived.length - 1].slice(0, 10); hourly = { date, data: arch.readDay(date) }; }
  } catch {}
  function hourlyRanks(store, country, appId) {
    if (!hourly || !appId) return null;
    const archiveStore = store === 'android' ? 'aos' : store;
    const list = hourly.data.lists[`${archiveStore}_${country}_grossing`];
    if (!list) return null;
    const idxs = new Set(); hourly.data.ids.forEach((id, i) => { if (String(id) === String(appId)) idxs.add(i); });
    if (!idxs.size) return null;
    return list.times.map((time, t) => { const arr = list.ranks[t] || []; const r = arr.findIndex((x) => idxs.has(x)); return { time, rank: r >= 0 ? r + 1 : null }; });
  }

  // ---------- 공용 집계 ----------
  function allTimeBest(c, s, appId, until = days.length - 1) {
    let b = null;
    for (let i = 0; i <= until; i++) { const r = rankOf(days[i], c, s, appId); if (r != null && (b == null || r < b)) b = r; }
    return b;
  }
  function daysOnChart(c, s, appId) { let n = 0; for (const d of days) if (rankOf(d, c, s, appId) != null) n++; return n; }
  function streakAtOne(c, s, appId) { let n = 0; for (let i = days.length - 1; i >= 0; i--) { if (rankOf(days[i], c, s, appId) === 1) n++; else break; } return n; }
  function firstSeen(c, s, appId) { for (const d of days) if (rankOf(d, c, s, appId) != null) return d.date; return null; }

  // 급등·급락·신규·역대 최고 경신 (전일 대비). chart='free' 면 인기 차트 기준 (역대 최고 경신은 매출만)
  function movers(country, s, chart = 'grossing') {
    const rows = chart === 'free' ? today.rowsFree : today.rows;
    const rk = chart === 'free' ? freeRankOf : rankOf;
    const list = rows[country][s].slice(0, 200).map((r, i) => ({ r, rank: i + 1, prev: rk(yday, country, s, r.appId) }));
    const up = list.filter((x) => x.prev != null && x.prev - x.rank >= 5 && x.rank <= 100).sort((a, b) => (b.prev - b.rank) - (a.prev - a.rank)).slice(0, 3);
    const down = list.filter((x) => x.prev != null && x.rank - x.prev >= 5 && x.prev <= 100).sort((a, b) => (b.rank - b.prev) - (a.rank - a.prev)).slice(0, 3);
    const fresh = list.filter((x) => x.prev == null && x.rank <= 100).slice(0, 3);
    const record = chart === 'free' ? [] : list.filter((x) => { const b = allTimeBest(country, s, x.r.appId, days.length - 2); return x.rank <= 100 && b != null && x.rank < b && daysOnChart(country, s, x.r.appId) > 7; }).slice(0, 3);
    return { up, down, fresh, record };
  }

  // 신작 성적표: 최근 45일 내 첫 진입
  function debutRows(country, s = 'ios') {
    if (days.length < 8) return [];
    const cutoff = new Date(days[7].date);
    return today.rows[country][s].slice(0, 200).map((r) => {
      const seen = firstSeen(country, s, r.appId);
      if (!seen || new Date(seen) < cutoff) return null;
      const age = Math.round((new Date(today.date) - new Date(seen)) / 864e5);
      if (age > 45) return null;
      const debut = rankOf(days.find((d) => d.date === seen), country, s, r.appId);
      const series = seriesOf(country, s, r.appId);
      const best = min(series);
      return { r, seen, age, debut, best, cur: rankOf(today, country, s, r.appId), peakDay: days[series.indexOf(best)].date };
    }).filter(Boolean).sort((a, b) => a.cur - b.cur).slice(0, 8);
  }

  // 월간 통합: 두 스토어 일 평균 순위 합산 (차트 밖은 201위)
  function monthStats(month, country) {
    const md = daysIn(month);
    if (!md.length) return null;
    const acc = new Map();
    for (const d of md) for (const s of Object.keys(STORES)) d.rows[country][s].forEach((r, i) => {
      if (!r || !r.appId) return;
      const key = keyOf(s, r);
      let a = acc.get(key);
      if (!a) { a = { key, ios: [], android: [], row: r, store: s, game: gameOf(s, r), best: 999, ones: 0 }; acc.set(key, a); }
      a[s].push(i + 1); a.best = Math.min(a.best, i + 1); if (i === 0) a.ones++;
    });
    const n = md.length;
    const list = [...acc.values()];
    for (const a of list) {
      const pad = (arr) => (arr.reduce((x, y) => x + y, 0) + (n - arr.length) * 201) / n;
      a.score = (pad(a.ios) + pad(a.android)) / 2;
      a.days = Math.max(a.ios.length, a.android.length);
      a.vol = std(a.ios.length >= a.android.length ? a.ios : a.android);
    }
    list.sort((x, y) => x.score - y.score);
    list.forEach((a, i) => (a.rank = i + 1));
    return { list, n, month };
  }
  const monthlyAvg = (country, appId, s) => months.map((mo) => avg(daysIn(mo).map((d) => rankOf(d, country, s, appId))));

  // 글로벌 차트 지수: 중국 Android를 제외한 9개 차트의 TOP 200.
  function aggregateGlobal(d) {
    const m = new Map();
    for (const c of Object.keys(COUNTRIES)) for (const s of Object.keys(STORES)) {
      if (c === 'cn' && s === 'android') continue;
      d.rows[c][s].slice(0, 200).forEach((r, i) => {
      if (!r || !r.appId) return;
      const k = keyOf(s, r);
      let a = m.get(k);
      if (!a) { a = { key: k, row: r, store: s, game: gameOf(s, r), pts: 0, ranks: {}, countries: new Set() }; m.set(k, a); }
      if (a.ranks[`${c}_${s}`] != null) return;
      a.pts += 200 - i; a.ranks[`${c}_${s}`] = i + 1; a.countries.add(c);
    });
    }
    const list = [...m.values()].sort((x, y) => y.pts - x.pts);
    list.forEach((a, i) => (a.rank = i + 1));
    return { map: m, list };
  }

  // 역대 기록 (한 나라 · 앱스토어)
  function allTimeStats(country, s = 'ios') {
    const stat = new Map();
    const get = (r) => { let a = stat.get(String(r.appId)); if (!a) { a = { row: r, ones: 0, days: 0, pts: 0, streak: 0, bestStreak: 0, bestStreakEnd: null, debut: null, debutDay: null, bestJump: 0, bestJumpDay: null, ranks: [] }; stat.set(String(r.appId), a); } return a; };
    days.forEach((d, di) => {
      const seenToday = new Set();
      d.rows[country][s].forEach((r, i) => {
        if (!r || !r.appId) return;
        const a = get(r); const rank = i + 1; seenToday.add(String(r.appId));
        if (r.icon && !a.row.icon) a.row = r;
        a.days++; a.pts += 201 - rank; a.ranks.push(rank);
        if (di > 0 && a.debut == null && rankOf(days[di - 1], country, s, r.appId) == null && di >= 7) { a.debut = rank; a.debutDay = d.date; }
        if (rank === 1) { a.streak++; if (a.streak > a.bestStreak) { a.bestStreak = a.streak; a.bestStreakEnd = d.date; } a.ones++; }
        const p = di > 0 ? rankOf(days[di - 1], country, s, r.appId) : null;
        if (p != null && p - rank > a.bestJump) { a.bestJump = p - rank; a.bestJumpDay = d.date; a.bestJumpFrom = p; a.bestJumpTo = rank; }
      });
      for (const a of stat.values()) if (!seenToday.has(String(a.row.appId))) a.streak = 0;
    });
    const all = [...stat.values()];
    const crown = months.map((mo) => {
      const cnt = new Map();
      for (const d of daysIn(mo)) { const r = d.rows[country][s][0]; if (!r || !r.appId) continue; const k = String(r.appId); const e = cnt.get(k) || { row: r, n: 0 }; e.n++; if (r.icon && !e.row.icon) e.row = r; cnt.set(k, e); }
      const top = [...cnt.values()].sort((x, y) => y.n - x.n);
      return { mo, top: top[0], second: top[1], n: daysIn(mo).length };
    });
    return { all, crown };
  }

  cached = {
    COUNTRIES, STORES, games, byApp, bySlug, byTitle, isSub,
    days, today, yday, months, latestMonth, daysIn, hourly, hourlyRanks,
    rankOf, seriesOf, freeRankOf, freeSeriesOf, gameOf, keyOf, nameOf,
    allTimeBest, daysOnChart, streakAtOne, firstSeen,
    movers, debutRows, monthStats, monthlyAvg, aggregateGlobal, allTimeStats,
    util: { nums, min, avg, std, fmt1, esc, tsText },
  };
  return cached;
}

module.exports = { loadRankStats, COUNTRIES, STORES, util: { nums, min, avg, std, fmt1, esc, tsText } };
