'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
function reviewTags(survey, config, decisions, legacy) {
  const next = JSON.parse(JSON.stringify(config));
  const audit = { version: 1, reviewedAt: decisions.reviewedAt, games: {}, summary: {} };
  const legacySlugs = new Set(legacy.games.map(g => g.slug));
  for (const [slug, game] of Object.entries(survey.games)) {
    const stores = Object.values(game.stores).filter(s => s.status === 'found');
    const categories = stores.flatMap(s => (s.categories || []).map(c => c.name));
    const text = stores.map(s => s.description || '').join('\n');
    const item = next.games[slug] || {};
    const tags = new Set(item.tags ?? (legacySlugs.has(slug) ? ['subculture'] : []));
    const signals = {
      'lineage-like': /MMORPG|공성전|혈맹|필드.{0,15}PK/i.test(text) || categories.includes('MMORPG'),
      subculture: categories.includes('애니메이션') || /서브컬[처쳐]|미소녀|미소년/.test(text) || legacySlugs.has(slug),
      idle: categories.some(c => ['방치형 RPG', '방치형'].includes(c)) || /방치형/.test(text),
      hypercasual: categories.includes('하이퍼캐주얼')
    };
    const reviews = {};
    for (const tag of ['lineage-like', 'subculture', 'idle', 'hypercasual']) {
      const confirmed = decisions.confirmed[tag]?.[slug];
      const excluded = decisions.excluded[tag]?.[slug];
      const pending = decisions.pending[tag]?.[slug];
      const unverified = decisions.unverified?.[tag]?.[slug];
      // 방치형은 카테고리와 설명이 모두 일치할 때만 추가한다. URL/제목의 idle은 근거가 아니다.
      const idleEvidence = tag === 'idle' && categories.some(c => ['방치형 RPG', '방치형'].includes(c))
        ? text.split('\n').find(line => /방치형/.test(line) && !/https?:\/\//.test(line)) : null;
      let status = 'not-flagged', reason = '해당 태그 후보 근거 없음', sources = [];
      if (excluded) { status = 'excluded'; reason = excluded[0]; sources = excluded.slice(1); tags.delete(tag); }
      else if (unverified) { status = 'unverified'; reason = unverified[0]; sources = unverified.slice(1); tags.delete(tag); }
      else if (pending) { status = 'pending'; reason = pending[0]; sources = pending.slice(1); tags.delete(tag); }
      else if (confirmed) { status = 'confirmed'; reason = confirmed[0]; sources = confirmed.slice(1); tags.add(tag); }
      else if (idleEvidence) { status = 'confirmed'; reason = idleEvidence.trim().slice(0, 240); tags.add(tag); }
      else if (tags.has(tag)) { status = 'retained'; reason = '기존 수동 분류 유지. 공식 정보 조회 상태와 함께 기록.'; }
      else if (signals[tag]) { status = 'pending'; reason = '후보 신호만으로 태그를 확정하지 않음'; }
      reviews[tag] = { status, reason, sources };
    }
    if (tags.size || Object.prototype.hasOwnProperty.call(item, 'tags')) {
      next.games[slug] = { ...item, tags: [...tags] };
    }
    audit.games[slug] = { name: game.name, storeSources: stores.map(s => ({ url: s.url, checkedAt: s.checkedAt })), tags: reviews };
  }
  for (const [tag, entries] of Object.entries(decisions.confirmed)) {
    for (const slug of Object.keys(entries)) if (!survey.games[slug]) throw new Error(`Unknown reviewed slug: ${tag}/${slug}`);
  }
  for (const tag of ['lineage-like', 'subculture', 'idle', 'hypercasual']) {
    audit.summary[tag] = {};
    for (const g of Object.values(audit.games)) {
      const status = g.tags[tag].status;
      audit.summary[tag][status] = (audit.summary[tag][status] || 0) + 1;
    }
  }
  return { config: next, audit };
}
if (require.main === module) {
  const result = reviewTags(read('game-genre-survey.json'), read('game-classifications.json'), read('game-tag-decisions.json'), read('subculture-games.json'));
  for (const [file, value] of [['game-classifications.json', result.config], ['game-tag-audit.json', result.audit]]) {
    fs.writeFileSync(path.join(root, 'data', file), JSON.stringify(value, null, 2) + '\n');
  }
  console.log(JSON.stringify(result.audit.summary, null, 2));
}
module.exports = { reviewTags };
