'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const survey = read('data/game-genre-survey.json');
const before = read('mockups/identity-repair-before/game-genre-survey.json');
const db = read('data/games.json').games;
const bySlug = new Map(Object.entries(db).map(([name, game]) => [game.slug, { name, ...game }]));
const kof = read('mockups/kofafk-official.json'), alter = read('mockups/alterego-caramel-official.json');
if (kof.appId !== 'com.netmarble.kofafk' || alter.trackId !== 1447605099) throw new Error('Unexpected official app ID');
const checkedAt = new Date().toISOString();
const normalizeIOS = a => ({
  status: 'found', id: String(a.trackId), title: a.trackName, genres: a.genres || [], genreIds: a.genreIds || [],
  description: a.description || '', developer: a.artistName, url: a.trackViewUrl, country: 'kr', checkedAt
});
const normalizeAndroid = a => ({
  status: 'found', id: a.appId, title: a.title, genres: [a.genre], genreIds: [a.genreId], categories: a.categories || [],
  description: a.description || '', developer: a.developer, url: a.url, country: 'kr', checkedAt
});
survey.games['킹-오브-파이터-afk'] = {
  name: bySlug.get('킹-오브-파이터-afk').name,
  appIds: bySlug.get('킹-오브-파이터-afk').appIds,
  stores: { ios: before.games['킹-오브-파이터-afk'].stores.ios, android: normalizeAndroid(kof) }
};
survey.games['alter-ego'] = {
  name: 'Alter Ego', appIds: bySlug.get('alter-ego').appIds,
  stores: { ios: before.games['alter-ego'].stores.ios }
};
survey.games['alter-ego-caramel-column'] = {
  name: bySlug.get('alter-ego-caramel-column').name,
  appIds: bySlug.get('alter-ego-caramel-column').appIds,
  stores: { ios: normalizeIOS(alter), android: before.games['alter-ego'].stores.android }
};
survey.summary = { total: Object.keys(survey.games).length, found: 0, unavailable: 0, ios: 0, android: 0 };
for (const game of Object.values(survey.games)) {
  survey.summary[Object.values(game.stores).some(s => s.status === 'found') ? 'found' : 'unavailable']++;
  for (const store of ['ios', 'android']) if (game.stores[store]?.status === 'found') survey.summary[store]++;
}
survey.identityRepairedAt = checkedAt;
fs.writeFileSync(path.join(root, 'data/game-genre-survey.json'), JSON.stringify(survey, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'data/app-identity-repairs.json'), JSON.stringify({
  version: 1, repairedAt: checkedAt, originalEvidence: 'mockups/identity-repair-before/',
  repairs: [
    { slug: '킹-오브-파이터-afk', androidBefore: 'com.farlightgames.igame.gp', androidAfter: 'com.netmarble.kofafk', incorrectAliasesRemoved: ['천만여신: 가장 치명적인 AFK', '천만여신 : 가장 치명적인 AFK', 'AFK: 새로운 여정', 'AFK: 새로운 여정 - 모든 영웅 증정', 'AFK: 새로운 여정 - 힐링 농장'] },
    { slug: 'alter-ego', retainedIOS: '1549657152', androidMovedTo: 'alter-ego-caramel-column', verifiedIOS: '1447605099', android: 'com.caracolu.alterego' }
  ],
  rawHistoryModified: false,
  note: '기존 URL과 앱 ID별 수집 기록은 유지하며, 표시 시 게임 연결만 재계산한다. 검증된 ID가 있는 이 세 게임은 이름 폴백을 사용하지 않는다.'
}, null, 2) + '\n');
console.log(JSON.stringify(survey.summary));
