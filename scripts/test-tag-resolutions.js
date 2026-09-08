'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applyResolutions } = require('./apply-tag-resolutions');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data', file), 'utf8'));
const survey = read('game-genre-survey.json'), resolutions = read('game-tag-resolutions-20260909.json');
const targets = read('game-tag-resolution-manifest.json').targets, decisions = read('game-tag-decisions.json');
const applied = applyResolutions(decisions, resolutions, targets, survey);
assert.equal(applied.report.total, 314);
assert.deepEqual(applyResolutions(applied.decisions, resolutions, targets, survey).decisions, applied.decisions, '과거 판정 재적용은 멱등적이며 최신 판단은 별도로 유지');
assert.throws(() => applyResolutions(decisions, { ...resolutions, groups: resolutions.groups.slice(1) }, targets, survey), /Unreviewed candidates/);
assert.throws(() => applyResolutions(decisions, { ...resolutions, groups: [...resolutions.groups, resolutions.groups[0]] }, targets, survey), /duplicate resolution/);
const audit = read('game-tag-audit.json'), config = read('game-classifications.json');
for (const row of applied.report.rows) {
  const latest = ['excluded', 'unverified', 'pending', 'confirmed'].find(status => decisions[status]?.[row.tag]?.[row.slug]);
  assert.equal(audit.games[row.slug].tags[row.tag].status, latest);
  const assigned = (config.games[row.slug]?.tags || []).includes(row.tag);
  assert.equal(assigned, latest === 'confirmed', `${row.slug}/${row.tag}`);
  assert.ok(row.reason && (row.storeEvidence.length || row.sources.length), `${row.slug}: 근거 없음`);
}
assert.equal(audit.games['귀판오분전'].tags.idle.status, 'excluded', '다른 게임 홍보 문구 오분류 방지');
assert.equal(audit.games['외계인은-배고파'].tags.subculture.status, 'excluded', '콜라보만으로 본체 분류 변경 금지');
assert.equal(audit.games['추억의-잡화점'].tags['lineage-like'].status, 'excluded', '경영게임의 추억 묘사 오분류 방지');
assert.equal(audit.games['킹-오브-파이터-afk'].tags.subculture.status, 'confirmed', '앱 ID 정정 후 공식 근거로 판정');
console.log('PASS 314개 후보 처리 완전성·중복/누락 차단·근거 연결·미확인 태그 제외');
