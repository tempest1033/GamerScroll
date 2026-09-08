'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const db = read('data/games.json').games;
const old = read('mockups/identity-repair-before/games.json').games;
const survey = read('data/game-genre-survey.json');
const S = require('../src/rank/stats').loadRankStats();
const kof = db['킹 오브 파이터 AFK'], profile = db['Alter Ego'], caramel = db['ALTER EGO - 얼터 에고'];
assert.deepEqual(kof.appIds, { android: 'com.netmarble.kofafk', ios: '6499177365' });
assert.deepEqual(profile.appIds, { ios: 1549657152 });
assert.deepEqual(caramel.appIds, { ios: '1447605099', android: 'com.caracolu.alterego' });
assert.equal(S.byApp.get('android:com.farlightgames.igame.gp').slug, 'afk-새로운-여정-힐링-농장');
assert.equal(S.byApp.get('android:com.netmarble.kofafk').slug, kof.slug);
assert.equal(S.byTitle.get('AFK: 새로운 여정').slug, 'afk-새로운-여정-힐링-농장');
assert.equal(S.byTitle.get('천만여신: 가장 치명적인 AFK').slug, '천만여신-가장-치명적인-afk');
for (const key of Object.keys(old)) {
  if (['킹 오브 파이터 AFK', 'Alter Ego', 'AFK: 새로운 여정 - 힐링 농장'].includes(key)) continue;
  assert.deepEqual(db[key], old[key], `무관한 DB 항목 보존: ${key}`);
}
for (const game of [kof, profile, caramel]) {
  const entry = survey.games[game.slug];
  assert.deepEqual(entry.appIds, game.appIds);
  for (const [store, source] of Object.entries(entry.stores)) assert.equal(String(source.id), String(game.appIds[store]));
  const $ = cheerio.load(fs.readFileSync(path.join(root, 'docs/games', game.slug, 'index.html'), 'utf8'));
  assert.ok($('.game-hero-title').length);
  for (const store of ['ios', 'android']) {
    const expected = S.days.map(d => {
      if (!game.appIds[store]) return null;
      const index = d.rows.kr[store].findIndex(r => String(r.appId) === String(game.appIds[store]));
      return index < 0 ? null : index + 1;
    });
    assert.deepEqual(S.seriesOf('kr', store, game.appIds[store]), expected);
  }
}
assert.deepEqual(S.seriesOf('kr', 'android', profile.appIds.android), Array(S.days.length).fill(null));
const report = read('data/game-tag-followup-report.json');
assert.equal(report.total, 40);
const audit = read('data/game-tag-audit.json');
for (const row of report.rows) assert.equal(audit.games[row.slug].tags[row.tag].status, row.status);
assert.equal(audit.games['alter-ego'].tags.subculture.status, 'excluded');
assert.equal(audit.games['신의-탑-새로운-세계'].tags.idle.status, 'confirmed');
console.log('PASS 앱 ID 분리·별칭 정정·기존 DB 보존·원시 순위와 재집계 일치·40건 재판정');
