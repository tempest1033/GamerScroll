/**
 * history/*.json 컴팩션 (repo 비대화 방지)
 * - 컷오프(기본 7일) 이전 파일에서 게임 페이지 순위 차트가 읽는 필드만 남기고 축소:
 *   bestRanks / rankings[cat][region][platform][].appId(순서 유지) / steam.mostPlayed·topSellers
 *   (generate-game-pages.js buildRankIndex와 1:1 대응)
 * - 최신 파일들은 전체 필드가 필요하므로(콘텐츠 인덱스 등) 건드리지 않음
 * - idempotent: compact 마커가 있으면 스킵 (CI 30분 주기 실행 안전)
 */
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, '..', 'history');
const KEEP_FULL_DAYS = 7;

function kstDateString(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000).toISOString().slice(0, 10);
}

function compactRankings(rankings) {
  const out = {};
  for (const cat of ['grossing', 'free']) {
    if (!rankings || !rankings[cat]) continue;
    out[cat] = {};
    for (const [region, platforms] of Object.entries(rankings[cat])) {
      out[cat][region] = {};
      for (const [platform, items] of Object.entries(platforms || {})) {
        if (!Array.isArray(items)) continue;
        // buildRankIndex 폴백은 배열 순서(i+1)를 순위로 사용.
        // title은 ranking-blocks.js lookupHistoryRank()의 이름 기반 폴백(appId 미등록 게임 차트)에 필요 → 유지.
        out[cat][region][platform] = items.map(it => ({
          appId: (it && it.appId) || '',
          title: (it && it.title) || ''
        }));
      }
    }
  }
  return out;
}

function compactSteam(steam) {
  if (!steam) return undefined;
  const out = {};
  if (Array.isArray(steam.mostPlayed)) {
    out.mostPlayed = steam.mostPlayed.map(i => ({ appid: i.appid, rank: i.rank, ccu: i.ccu }));
  }
  if (Array.isArray(steam.topSellers)) {
    out.topSellers = steam.topSellers.map(i => ({ appid: i.appid, rank: i.rank }));
  }
  return out;
}

function main() {
  if (!fs.existsSync(HISTORY_DIR)) return;
  const cutoff = kstDateString(KEEP_FULL_DAYS);
  let compacted = 0;
  let savedBytes = 0;

  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  for (const file of files) {
    const date = file.slice(0, 10);
    if (date >= cutoff) continue;

    const filePath = path.join(HISTORY_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      continue;
    }
    if (!data || data.compact === 1) continue;

    const slim = { compact: 1 };
    if (data.timestamp) slim.timestamp = data.timestamp;
    if (data.bestRanks) slim.bestRanks = data.bestRanks;
    slim.rankings = compactRankings(data.rankings);
    const steam = compactSteam(data.steam);
    if (steam) slim.steam = steam;

    const before = fs.statSync(filePath).size;
    const json = JSON.stringify(slim);
    fs.writeFileSync(filePath, json, 'utf8');
    savedBytes += before - Buffer.byteLength(json);
    compacted++;
  }

  if (compacted > 0) {
    console.log(`🗜️ history 컴팩션: ${compacted}개 파일, ${(savedBytes / 1048576).toFixed(1)}MB 절감`);
  } else {
    console.log('🗜️ history 컴팩션: 대상 없음');
  }
}

main();
