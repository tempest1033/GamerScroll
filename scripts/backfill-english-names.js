/**
 * 영어판 이름 일괄 보강 (다시 실행해도 됨): 매일 동기화(sync-and-enrich.js)가 1회 상한만큼 하는 공식 영어 스토어 이름 조회를
 * 상한 없이 한 번에 하고, 동기화와 같은 뒤처리(Latin 이름 슬러그 변경, 중복 통합)를 한다.
 *   node scripts/backfill-english-names.js [YYYY-MM-DD]
 */
const S = require('./sync-and-enrich');
const { migrate: reslugLatinNamed } = require('./migrate-game-slugs');

// 조회 실패(스토어의 요청 제한)로 남은 게임은 기다렸다가 PASS_SIZE 개씩 다시 묻는다 (Steam 은 5분에 200건 남짓만 답한다) —
// 연속 STALLS 번 줄지 않으면 멈춘다
const PASS_WAIT_MS = 5 * 60 * 1000;
const PASS_SIZE = 150;
const STALLS = 3;

async function main() {
  const today = process.argv[2] || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  const gamesData = S.loadGames();
  const checks = S.loadEnglishNameChecks();
  for (const g of Object.values(gamesData.games)) if (/[™®]/.test((g.names && g.names.en) || '')) g.names = S.mergeNames(g.names, {});
  for (let left = Infinity, limit = Infinity, stalls = 0; ;) {
    const english = await S.fillEnglishNames(gamesData, checks, [], today, limit);
    const due = S.englishNameDue(gamesData.games, checks, today).length;
    console.log('영어 이름:', english.asked, '개 게임 조회,', english.named, '개 공식 영어 이름, 남은 게임', due);
    stalls = due < left ? 0 : stalls + 1;
    if (!due || stalls >= STALLS) break;
    left = due;
    limit = PASS_SIZE;
    await new Promise((r) => setTimeout(r, PASS_WAIT_MS));
  }
  for (const m of S.mergeSameTitle(gamesData)) console.log(`  중복 통합: ${m.kept} ← ${m.merged.join(', ')}`);
  for (const r of reslugLatinNamed(gamesData)) console.log(`  슬러그 변경: ${r.from} → ${r.to}`);
  gamesData.totalGames = Object.keys(gamesData.games).length;
  S.saveGames(gamesData);
  S.saveEnglishNameChecks(checks);
}

main().catch((e) => { console.error(e); process.exit(1); });
