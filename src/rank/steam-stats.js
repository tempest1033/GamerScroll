'use strict';
/**
 * 스팀 일별 이력 통계 — history/YYYY-MM-DD.json 의 steam.mostPlayed(동접자 TOP 100) · steam.topSellers(한국 스토어 판매 TOP 100)
 * 초기 이력(2025-12)은 appid·rank·ccu 만 있어 이름·이미지·개발사는 가장 최근에 본 행에서 가져온다.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let cached = null;
function loadSteamStats(options = {}) {
  if (cached && !options.force) return cached;
  const dir = options.historyDir || path.join(ROOT, 'history');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  const days = [];
  for (const f of files) {
    try {
      const h = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const mp = h.steam && h.steam.mostPlayed;
      if (!mp || !mp.length) continue;
      const ts = (h.steam.topSellers || []).filter(Boolean);
      days.push({ date: f.slice(0, 10), ts: h.timestamp, mp, sellers: ts, mpIdx: new Map(mp.map((r) => [String(r.appid), r])), tsIdx: new Map(ts.map((r) => [String(r.appid), r])) });
    } catch {}
  }
  if (days.length < 2) throw new Error('스팀 이력이 2일 미만이라 통계를 만들 수 없습니다');
  const today = days[days.length - 1];
  const yday = days[days.length - 2];

  const meta = new Map();
  for (const d of days) for (const r of [...d.mp, ...d.sellers]) {
    if (!r || !r.name) continue;
    const prev = meta.get(String(r.appid)) || {};
    meta.set(String(r.appid), { appid: String(r.appid), name: r.name, img: r.img || prev.img || '', developer: r.developer || prev.developer || '' });
  }
  const info = (id) => meta.get(String(id)) || { appid: String(id), name: `App ${id}`, img: '', developer: '' };

  const ccuOf = (d, id) => { const r = d && d.mpIdx.get(String(id)); return r ? r.ccu : null; };
  const rankOf = (d, id) => { const r = d && d.mpIdx.get(String(id)); return r ? r.rank : null; };
  const sellOf = (d, id) => { const r = d && d.tsIdx.get(String(id)); return r ? r.rank : null; };
  const series = (id) => days.map((d) => ccuOf(d, id));
  const rankSeries = (id) => days.map((d) => rankOf(d, id));
  const sellSeries = (id) => days.map((d) => sellOf(d, id));
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))];
  const daysIn = (mo) => days.filter((d) => d.date.startsWith(mo));
  const fullMonths = months.filter((mo) => daysIn(mo).length >= 15);
  const latestMonth = fullMonths[fullMonths.length - 1] || months[months.length - 1];
  const firstSeen = (id) => { for (const d of days) if (ccuOf(d, id) != null || sellOf(d, id) != null) return d.date; return null; };
  const daysOnChart = (id) => days.filter((d) => ccuOf(d, id) != null).length;
  const peak = (id) => { let b = null, bd = null; for (const d of days) { const v = ccuOf(d, id); if (v != null && (b == null || v > b)) { b = v; bd = d.date; } } return { ccu: b, date: bd }; };
  // 월간: 일 평균 동접 상위
  const monthlyTop = (mo, n = 100) => {
    const acc = new Map();
    for (const d of daysIn(mo)) for (const r of d.mp) { const k = String(r.appid); const a = acc.get(k) || { appid: k, sum: 0, n: 0, max: 0 }; a.sum += r.ccu || 0; a.n++; a.max = Math.max(a.max, r.ccu || 0); acc.set(k, a); }
    const list = [...acc.values()].map((a) => ({ ...a, avg: a.sum / a.n })).sort((x, y) => y.avg - x.avg).slice(0, n);
    list.forEach((a, i) => (a.rank = i + 1));
    return list;
  };
  // 역대 최고 동접 (앱별 최대값)
  const allTimePeaks = (n = 100) => {
    const m = new Map();
    for (const d of days) for (const r of d.mp) { const k = String(r.appid); const e = m.get(k); if (!e || r.ccu > e.ccu) m.set(k, { appid: k, ccu: r.ccu, date: d.date }); }
    return [...m.values()].sort((x, y) => y.ccu - x.ccu).slice(0, n);
  };
  // 상세 페이지를 만들 앱: 동접 TOP 100 에 minDays 일 이상 있었거나 오늘 두 차트 중 하나에 있는 앱
  const pageApps = (minDays = 14) => {
    const ids = new Set();
    for (const r of [...today.mp, ...today.sellers]) ids.add(String(r.appid));
    const cnt = new Map();
    for (const d of days) for (const r of d.mp) cnt.set(String(r.appid), (cnt.get(String(r.appid)) || 0) + 1);
    for (const [k, n] of cnt) if (n >= minDays) ids.add(k);
    return [...ids].filter((id) => meta.has(id));
  };
  const sumToday = (d) => d.mp.reduce((a, r) => a + (r.ccu || 0), 0);

  cached = { days, today, yday, months, latestMonth, daysIn, info, ccuOf, rankOf, sellOf, series, rankSeries, sellSeries, firstSeen, daysOnChart, peak, monthlyTop, allTimePeaks, pageApps, sumToday };
  return cached;
}

module.exports = { loadSteamStats };
