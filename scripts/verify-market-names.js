/**
 * 시장별 게임 이름 정리 (다시 실행해도 됨)
 *   node scripts/verify-market-names.js [--dry-run] [--cache file]
 * names[언어]에는 그 시장의 실제 이름만 둔다: 현재 스토어 이름(그 시장에 출시된 앱만) 또는 그 시장 차트에 실린 제목.
 * 둘 다 없으면(그 시장 미출시) 지운다 — 화면은 다른 시장 이름으로 표시되고, 나중에 출시되면 매 빌드 동기화가 다시 채운다.
 * 조회가 실패한 시장은 건드리지 않는다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./sync-and-enrich');

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const dryRun = process.argv.includes('--dry-run');
const cachePath = arg('--cache') || path.join(os.tmpdir(), 'gs-market-names-cache.json');

async function main() {
  const gamesData = S.loadGames();
  const games = gamesData.games;
  const latest = S.loadLatestChartRows();
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
  const titles = await S.lookupMarketTitles(games, Object.keys(games), cache);
  fs.writeFileSync(cachePath, JSON.stringify(cache));

  const report = { kept: 0, filled: 0, replaced: 0, removed: 0, unknown: 0 };
  const samples = { filled: [], replaced: [], removed: [] };
  const note = (kind, row) => { report[kind]++; if (samples[kind] && samples[kind].length < 15) samples[kind].push(row); };
  for (const [key, t] of titles) {
    const g = games[key];
    const ids = Object.entries(g.appIds || {}).map(([slot, id]) => [slot.split('_')[0], String(id)]);
    const next = {};
    for (const [cc, m] of Object.entries(S.MARKETS)) {
      // 그 시장 차트 제목: 최근 날짜 우선, 같은 날짜면 iOS 우선 (backfillNames 와 같은 순서)
      const chart = ['ios', 'android'].flatMap(store => ids.filter(([s]) => s === store).map(([, id]) => latest.get(`${store}|${id}|${cc}`)))
        .filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)).map(r => r.title);
      const cur = (g.names && g.names[m.name]) || null;
      const v = S.resolveMarketName(cur, t[m.name], chart);
      if (v) next[m.name] = v;
      if (!(m.name in t)) report.unknown++;
      else if (cur === v) { if (v) report.kept++; }
      else if (!v) note('removed', [key, m.name, cur]);
      else if (!cur) note('filled', [key, m.name, v]);
      else note('replaced', [key, m.name, cur, v]);
    }
    g.names = S.mergeNames(next, {});
  }
  if (!dryRun) S.saveGames(gamesData);
  console.log(JSON.stringify({ dryRun, report, samples }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
