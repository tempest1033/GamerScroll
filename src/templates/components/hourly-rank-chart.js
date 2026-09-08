'use strict';

// 시각 간격을 보존하고 미수집 구간은 선으로 연결하지 않는다.
function hourlyRankChart(samples, androidSamples) {
  const normalize = items => (items || []).map(h => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(h.time);
    return { ...h, minute: match ? Number(match[1]) * 60 + Number(match[2]) : null };
  }).filter(h => h.minute != null && h.minute >= 0 && h.minute < 1440).sort((a, b) => a.minute - b.minute);
  const series = [
    { name: androidSamples === undefined ? '매출 순위' : '앱스토어', color: '#0071e3', points: normalize(samples) },
    ...(androidSamples === undefined ? [] : [{ name: '구글플레이', color: '#00a067', points: normalize(androidSamples) }])
  ];
  const points = [...new Map(series.flatMap(s => s.points).map(p => [p.minute, p])).values()].sort((a, b) => a.minute - b.minute);
  const ranks = series.flatMap(s => s.points.map(h => h.rank)).filter(r => Number.isFinite(r) && r > 0);
  if (!ranks.length) return '<div class="game-empty">수집된 순위가 없습니다.</div>';
  const W = 800, H = 220, L = 40, R = 30, T = 24, B = 36;
  const low = Math.max(1, Math.min(...ranks) - 1), high = Math.max(low + 4, ...ranks) + 1;
  const start = points[0].minute, span = Math.max(1, points.at(-1).minute - start);
  const x = p => points.length === 1 ? W / 2 : L + (p.minute - start) / span * (W - L - R);
  const y = rank => T + (rank - low) / (high - low) * (H - T - B);
  const lines = series.map((s, index) => {
    let d = '', connected = false;
    for (const p of s.points) {
      if (!Number.isFinite(p.rank) || p.rank <= 0) { connected = false; continue; }
      d += `${connected ? 'L' : 'M'}${x(p).toFixed(1)} ${y(p.rank).toFixed(1)} `;
      connected = true;
    }
    const marks = s.points.filter(p => Number.isFinite(p.rank) && p.rank > 0).map(p =>
      `<circle data-rank-series="${index}" cx="${x(p)}" cy="${y(p.rank)}" r="4" fill="${s.color}"/>`
    ).join('');
    return `<path data-rank-series="${index}" d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>${marks}`;
  }).join('');
  const grid = Array.from({ length: 5 }, (_, i) => {
    const rank = Math.round(low + (high - low) * i / 4);
    return `<line x1="${L}" x2="${W - R}" y1="${y(rank)}" y2="${y(rank)}" stroke="#e5e5e9"/><text x="${L - 8}" y="${y(rank) + 4}" text-anchor="end" font-size="11">${rank}</text>`;
  }).join('');
  const labels = points.filter((p, i) => i === 0 || i === points.length - 1 || (x(p) - x(points[0]) >= 65 && i % Math.max(1, Math.ceil(points.length / 8)) === 0 && x(points.at(-1)) - x(p) >= 65)).map(p => `<text x="${x(p)}" y="${H - 10}" text-anchor="middle" font-size="11">${p.time}</text>`).join('');
  const chartSeries = series.map(s => {
    const byMinute = new Map(s.points.map(p => [p.minute, p.rank]));
    return { name: s.name, color: s.color, values: points.map(p => {
      const rank = byMinute.get(p.minute);
      return Number.isFinite(rank) && rank > 0 ? rank : null;
    }) };
  });
  return `<div class="rk-hour-scroll">${require('./interactive-rank-chart').interactiveRankChart(`<svg class="rk-hour-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="수집 시각별 매출 순위, 숫자가 작을수록 상위">${grid}${lines}${labels}</svg>`, points.map(p => p.time), chartSeries, points.map(x))}</div>`;
}

module.exports = { hourlyRankChart };
