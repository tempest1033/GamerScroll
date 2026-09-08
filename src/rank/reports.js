'use strict';
/**
 * 리포트 목록 — reports/ranking · reports/insight 의 승인된 JSON 을 최신순으로 (홈 카드 · /reports/ 허브 · 게임 페이지 관련 리포트)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CATS = { ranking: '순위 분석', insight: '인사이트' };

let cached = null;
function loadReports(options = {}) {
  if (cached && !options.force) return cached;
  const out = [];
  for (const cat of Object.keys(CATS)) {
    const dir = path.join(ROOT, 'reports', cat);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, ''));
        if (!a || a.status !== 'approved' || !a.slug || !a.title) continue;
        const date = String(a.date || '').slice(0, 10);
        out.push({ cat, catName: CATS[cat], slug: a.slug, title: a.title, summary: a.summary || '', thumbnail: a.thumbnail || '', date, href: `/magazine/${cat}/${a.slug}/`, relatedGames: a.relatedGames || [], keywords: a.keywords || [] });
      } catch {}
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  cached = out;
  return out;
}
// 게임 이름·슬러그로 관련 리포트 찾기
function reportsFor(list, { name = '', slug = '' } = {}, n = 3) {
  const needle = String(name || '').toLowerCase();
  return list.filter((a) => (slug && (a.relatedGames || []).some((g) => String(g).toLowerCase() === String(slug).toLowerCase())) || (needle && (a.title + ' ' + a.summary).toLowerCase().includes(needle))).slice(0, n);
}

module.exports = { loadReports, reportsFor, CATS };
