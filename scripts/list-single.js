const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/review-queue.json');
let content = fs.readFileSync(dataPath, 'utf8');
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const data = JSON.parse(content);

const single = data.pending.filter(g => g.status === 'single');

console.log('=== single 게임 목록 (' + single.length + '개) ===\n');

single.forEach((g, i) => {
  const platform = g.appIds.ios ? 'iOS' : 'Android';
  const appId = g.appIds.ios || g.appIds.android;
  console.log(`[${i + 1}] ${g.title}`);
  console.log(`    플랫폼: ${platform} only`);
  console.log(`    appId: ${appId}`);
  console.log('');
});
