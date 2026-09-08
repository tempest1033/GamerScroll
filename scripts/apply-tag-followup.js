'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { applyResolutions } = require('./apply-tag-resolutions');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const targets = read('data/game-tag-resolution-report.json').rows.filter(r => r.status === 'unverified').map(r => ({ slug: r.slug, tag: r.tag }));
const result = applyResolutions(read('data/game-tag-decisions.json'), read('data/game-tag-resolutions-followup.json'), targets, read('data/game-genre-survey.json'));
const screenshots = read('mockups/store-review/sources.json');
for (const row of result.report.rows) {
  const evidence = screenshots.find(s => s.slug === row.slug);
  if (evidence) row.screenshotEvidence = evidence.assets.map(a => ({ url: a.url, file: `mockups/store-review/${a.file}` }));
}
// 새로 분리한 Caramel Column 작품은 원본 앱과 동일한 성향으로 가정하지 않는다.
result.decisions.excluded.subculture['alter-ego-caramel-column'] = ['공식 자기 탐구·문학/심리 중심 분기형 어드벤처. 동명 아바타 앱과 분리하며 캐릭터 그림체만으로 서브컬처 태그를 부여하지 않음.', 'https://apps.apple.com/us/app/alter-ego/id1447605099'];
result.decisions.confirmed.idle ||= {};
result.decisions.confirmed.idle['킹-오브-파이터-afk'] = ['정정한 넷마블 양대 스토어의 AFK 성장형 파이터 수집 RPG.', 'https://play.google.com/store/apps/details?id=com.netmarble.kofafk'];
for (const [file, value] of [['game-tag-decisions.json', result.decisions], ['game-tag-followup-report.json', result.report]]) {
  fs.writeFileSync(path.join(root, 'data', file), JSON.stringify(value, null, 2) + '\n');
}
console.log(JSON.stringify(result.report.summary, null, 2));
