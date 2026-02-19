const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/review-queue.json');
let content = fs.readFileSync(dataPath, 'utf8');
// Remove BOM if present
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const data = JSON.parse(content);

const matched = data.pending.filter(g => g.status === 'matched');

// 오매칭 가능성 체크
const suspicious = [];
const correct = [];

matched.forEach(g => {
  if (!g.searchResults || g.searchResults.length === 0) {
    correct.push(g);
    return;
  }

  const first = g.searchResults[0];
  const isSuspicious = first.title !== g.title;

  if (isSuspicious) {
    suspicious.push(g);
  } else {
    correct.push(g);
  }
});

const noSearchResults = matched.filter(g => !g.searchResults || g.searchResults.length === 0);

console.log('=== 매칭 분석 결과 ===');
console.log('총 matched:', matched.length + '개');
console.log('검색결과 없음:', noSearchResults.length + '개');
console.log('정상 매칭:', correct.length + '개');
console.log('오매칭 의심:', suspicious.length + '개');
console.log('');

console.log('=== 오매칭 의심 목록 ===');
suspicious.forEach((g, i) => {
  console.log(`\n[${i + 1}] ${g.title}`);
  console.log('  appIds:', JSON.stringify(g.appIds));
  const first = g.searchResults[0];
  console.log('  검색결과[0]:', first.title, '/', first.appId);
});

console.log('\n=== 정상 매칭 목록 (처음 10개) ===');
correct.slice(0, 10).forEach((g, i) => {
  console.log(`[${i + 1}] ${g.title}`);
});
