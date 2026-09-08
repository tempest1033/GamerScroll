'use strict';

// 연도 경계와 수집 누락일을 넘어 연속 기록을 연결하지 않는다.
function annualRecords(sourceDays, country, store, year) {
  const days = sourceDays.filter(d => d.date.startsWith(`${year}-`)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const stats = new Map();
  const months = new Map();
  let previous = null;
  for (const day of days) {
    const contiguous = previous && Date.parse(day.date) - Date.parse(previous.date) === 86400000;
    if (!contiguous) for (const a of stats.values()) { a.streak = 0; a.top10Streak = 0; }
    const seen = new Set();
    const rows = day.rows[country]?.[store] || [];
    const month = day.date.slice(0, 7);
    if (!months.has(month)) months.set(month, new Map());
    rows.slice(0, 200).forEach((row, i) => {
      if (!row?.appId) return;
      const id = String(row.appId), rank = i + 1;
      seen.add(id);
      if (!stats.has(id)) stats.set(id, { row, ones: 0, days: 0, pts: 0, ranks: [], streak: 0, bestStreak: 0, bestStreakEnd: null, top10Streak: 0, bestTop10: 0, top10Start: null, bestTop10Start: null, bestTop10End: null, debut: rank, debutDay: day.date });
      const a = stats.get(id);
      a.row = row; a.days++; a.pts += 201 - rank; a.ranks.push(rank);
      a.streak = rank === 1 ? a.streak + 1 : 0;
      if (rank === 1) a.ones++;
      if (a.streak > a.bestStreak) { a.bestStreak = a.streak; a.bestStreakEnd = day.date; }
      if (rank <= 10) {
        if (!a.top10Streak) a.top10Start = day.date;
        a.top10Streak++;
        if (a.top10Streak > a.bestTop10) {
          a.bestTop10 = a.top10Streak; a.bestTop10Start = a.top10Start; a.bestTop10End = day.date;
        }
      } else a.top10Streak = 0;
      const entries = months.get(month);
      const entry = entries.get(id) || { row, pts: 0, days: 0 };
      entry.row = row; entry.pts += 201 - rank; entry.days++;
      entries.set(id, entry);
    });
    for (const [id, a] of stats) if (!seen.has(id)) { a.streak = 0; a.top10Streak = 0; }
    previous = day;
  }
  return {
    days,
    all: [...stats.values()],
    crown: [...months].map(([mo, entries]) => ({ mo, top: [...entries.values()].sort((a, b) => b.pts - a.pts || String(a.row.appId).localeCompare(String(b.row.appId))).slice(0, 3) })),
  };
}

module.exports = { annualRecords };
