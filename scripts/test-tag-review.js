'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reviewTags } = require('./review-game-tags');
const fixture = { games: {
  idle: { name: 'Idle', stores: { android: { status: 'found', categories: [{ name: '방치형 RPG' }], description: '방치형 RPG로 자동 성장합니다.' } } },
  mmo: { name: 'MMO', stores: { android: { status: 'found', categories: [{ name: 'MMORPG' }, { name: '애니메이션' }], description: 'MMORPG 자동 사냥' } } },
  denied: { name: 'Denied', stores: {} },
  legacy: { name: 'Legacy', stores: {} }
} };
const config = { games: { idle: { genres: ['rpg'], tags: ['subculture'] }, denied: { genres: ['simulation'], tags: ['idle'] } } };
const decisions = { confirmed: {}, pending: {}, excluded: { idle: { denied: ['수면 기록 중심'] } } };
const legacy = { games: [{ slug: 'legacy' }] };
const before = JSON.stringify(config);
const first = reviewTags(fixture, config, decisions, legacy);
assert.equal(JSON.stringify(config), before, '입력 수동 분류 원본 보존');
assert.deepEqual(first.config.games.idle.genres, ['rpg']);
assert.deepEqual(first.config.games.idle.tags, ['subculture', 'idle']);
assert.equal(first.audit.games.mmo.tags['lineage-like'].status, 'pending');
assert.equal(first.audit.games.mmo.tags.subculture.status, 'pending');
assert.deepEqual(first.config.games.denied.tags, []);
assert.deepEqual(first.config.games.legacy.tags, ['subculture']);
assert.deepEqual(reviewTags(fixture, first.config, decisions, legacy).config, first.config, '재실행 중복 추가 없음');
const read = name => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data', name), 'utf8').replace(/^\uFEFF/, ''));
const actual = read('game-classifications.json'), audit = read('game-tag-audit.json');
const mobileCount = Object.values(read('games.json').games).filter(g => g.appIds?.ios || g.appIds?.android).length;
assert.equal(Object.keys(audit.games).length, mobileCount);
for (const entry of Object.values(audit.games)) assert.equal(Object.keys(entry.tags).length, 4);
for (const slug of ['리니지2m', '로드나인', '나이트-크로우', '레이븐2', 'hit2', '제우스-오만의-신']) {
  assert.ok(actual.games[slug].tags.includes('lineage-like'), slug);
}
assert.ok(!actual.games['마비노기-모바일'].tags.includes('lineage-like'));
assert.ok(actual.games['작혼-리치-마작'].tags.includes('subculture'));
assert.ok(actual.games['knife-hit'].tags.includes('hypercasual'));
assert.equal(audit.games['mob-control'].tags.hypercasual.status, 'excluded');
console.log('PASS 태그 전수 감사·누락 보완·오분류 방지·수동 장르 보존·중복 실행');
