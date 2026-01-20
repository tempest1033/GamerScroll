const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/review-queue.json');
let content = fs.readFileSync(dataPath, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const data = JSON.parse(content);

console.log('=== Single 게임 정리 시작 ===\n');

// 찾은 매칭 정보
const foundMatches = {
  "Friday Night Funkin' Mobile": { android: "me.funkin.fnf" },
  "War Robots. 6대6 택티컬 멀티플레이어 전투": { ios: "806077016" },
  "고잉 볼즈 (Going Balls)": { ios: "1499081620" },
  "Tomb of the Mask: 픽셀 미로": { ios: "1057889290" },
  "파이널삼국지2": { android: "com.gamepub.ft2.g" },
  "발할라 서바이벌 : 생존 RPG 1주년 업데이트": { ios: "6478528497" },
  "스네이크 아이오 - 재밌는 스네이크.io 게임들": { ios: "1104692136" },
  "타일 킹 - 트리플 매치": { ios: "1533219152" },
  "유휴 은행 타이쿤 (Idle Bank Tycoon)": { ios: "1645281275" },
  "Basketball Master: Dunk Hero": { android: "com.udogames.dunkmasters" },
  "Antistress Relaxing Mini Games": { ios: "1207565651" },
  "Happy Screw Trip 3D: ASMR": { ios: "6744547461" }
};

let matchedCount = 0;
let singleOnlyCount = 0;

// pending에서 single 게임 처리
data.pending.forEach(game => {
  if (game.status !== 'single') return;

  const match = foundMatches[game.title];
  if (match) {
    // 매칭 적용
    if (match.ios) {
      game.appIds.ios = match.ios;
    }
    if (match.android) {
      game.appIds.android = match.android;
    }
    game.status = 'matched';
    console.log(`[매칭] ${game.title}`);
    console.log(`  appIds: ${JSON.stringify(game.appIds)}`);
    matchedCount++;
  } else {
    // 단일 플랫폼 유지
    singleOnlyCount++;
    console.log(`[단일] ${game.title}`);
  }
});

console.log('\n=== 처리 결과 ===');
console.log('매칭 적용:', matchedCount + '개');
console.log('단일 플랫폼:', singleOnlyCount + '개');

// 모든 single/matched 게임을 approved로 이동
const singleGames = data.pending.filter(g => g.status === 'single' || g.status === 'matched');
const pendingBefore = data.pending.length;

data.pending = data.pending.filter(g => g.status !== 'single' && g.status !== 'matched');

if (!data.approved) {
  data.approved = [];
}

singleGames.forEach(g => {
  data.approved.push({
    title: g.title,
    appIds: g.appIds,
    status: g.status,
    approvedAt: new Date().toISOString()
  });
});

console.log('\npending 변경:', pendingBefore, '→', data.pending.length);
console.log('approved 추가:', singleGames.length + '개');

// 저장
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\n✅ review-queue.json 저장 완료');

// 최종 상태
console.log('\n=== 최종 pending 상태 ===');
console.log('남은 pending:', data.pending.length + '개');
if (data.pending.length > 0) {
  data.pending.forEach((g, i) => {
    console.log(`${i + 1}. [${g.status}] ${g.title}`);
  });
}
