const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const historyDir = path.join(__dirname, '../history');
const files = fs.readdirSync(historyDir)
  .filter(f => f.endsWith('.json') && !f.includes('mentions'))
  .sort();

console.log('히스토리 파일:', files.length, '개\n');

for (const file of files) {
  const date = file.replace('.json', '');
  console.log('=== ' + date + ' ===');
  try {
    const output = execSync('node scripts/sync-games.js ' + date, { encoding: 'utf8' });
    const lines = output.split('\n').filter(l => l.includes('게임') || l.includes('추가'));
    lines.forEach(l => console.log(l));
  } catch (e) {
    console.log('에러:', e.message);
  }
  console.log('');
}

// 최종 결과
const games = require('../data/games.json');
const queue = require('../data/review-queue.json');
console.log('=== 최종 결과 ===');
console.log('games.json:', Object.keys(games.games).length, '개');
console.log('review-queue:', queue.pending.length, '개');
