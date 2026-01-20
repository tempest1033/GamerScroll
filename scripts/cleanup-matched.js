const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/review-queue.json');
let content = fs.readFileSync(dataPath, 'utf8');
// Remove BOM if present
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const data = JSON.parse(content);

console.log('=== 펜딩큐 정리 시작 ===\n');

// 1. 오매칭 수정: 컴투스프로야구2025
const comtusPro = data.pending.find(g => g.title === '컴투스프로야구2025');
if (comtusPro) {
  console.log('[수정] 컴투스프로야구2025');
  console.log('  Before:', JSON.stringify(comtusPro.appIds));
  comtusPro.appIds.android = 'com.com2us.probaseball3d.normal.freefull.google.global.android.common';
  console.log('  After:', JSON.stringify(comtusPro.appIds));
}

// 2. matched 상태 게임 분류
const matched = data.pending.filter(g => g.status === 'matched');
console.log('\n총 matched 게임:', matched.length + '개');

// 정상 매칭된 게임들 (pending에서 제거할 대상)
const toApprove = matched.map(g => g.title);

// pending에서 matched 상태 게임들 제거
const pendingBefore = data.pending.length;
data.pending = data.pending.filter(g => g.status !== 'matched');

// approved 배열이 없으면 생성
if (!data.approved) {
  data.approved = [];
}

// approved로 이동 (title만 저장)
matched.forEach(g => {
  data.approved.push({
    title: g.title,
    appIds: g.appIds,
    approvedAt: new Date().toISOString()
  });
});

console.log('\n=== 결과 ===');
console.log('pending 변경:', pendingBefore, '→', data.pending.length);
console.log('approved 추가:', matched.length + '개');

// 저장
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\n✅ review-queue.json 저장 완료');

// 승인된 게임 목록 출력
console.log('\n=== approved로 이동된 게임 (' + matched.length + '개) ===');
toApprove.forEach((title, i) => {
  console.log(`${i + 1}. ${title}`);
});
