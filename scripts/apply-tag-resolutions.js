'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
function applyResolutions(decisions, resolutions, targets, survey) {
  const next = JSON.parse(JSON.stringify(decisions));
  const rows = [], seen = new Set(), expected = new Set(targets.map(t => `${t.tag}:${t.slug}`));
  const allowedTags = new Set(['lineage-like', 'subculture', 'idle', 'hypercasual']);
  const statuses = ['confirmed', 'excluded', 'unverified'];
  for (const group of resolutions.groups) {
    if (!allowedTags.has(group.tag) || !statuses.includes(group.status) || !group.reason) throw new Error('Invalid review group');
    for (const slug of group.slugs) {
      const key = `${group.tag}:${slug}`, game = survey.games[slug];
      if (!game || !expected.has(key) || seen.has(key)) throw new Error(`Invalid or duplicate resolution: ${key}`);
      seen.add(key);
      for (const status of ['confirmed', 'excluded', 'pending', 'unverified']) {
        if (next[status]?.[group.tag]) delete next[status][group.tag][slug];
      }
      next[group.status] ||= {};
      next[group.status][group.tag] ||= {};
      const sources = [...new Set([...(group.sources || []), ...(resolutions.references?.[slug] || [])])];
      next[group.status][group.tag][slug] = [group.reason, ...sources];
      const storeEvidence = Object.entries(game.stores).filter(([,s]) => s.status === 'found').map(([store, s]) => ({
        store, id: s.id, title: s.title, url: s.url, checkedAt: s.checkedAt,
        surveyReference: `game-genre-survey.json#/games/${slug}/stores/${store}`
      }));
      rows.push({ slug, name: game.name, tag: group.tag, status: group.status, reason: group.reason, sources, storeEvidence });
    }
  }
  const missing = [...expected].filter(key => !seen.has(key));
  if (missing.length) throw new Error(`Unreviewed candidates: ${missing.join(', ')}`);
  next.reviewedAt = resolutions.reviewedAt;
  const summary = {};
  for (const row of rows) {
    summary[row.tag] ||= { confirmed: 0, excluded: 0, unverified: 0 };
    summary[row.tag][row.status]++;
  }
  return { decisions: next, report: { version: 1, reviewedAt: resolutions.reviewedAt, total: rows.length, summary, rows } };
}
if (require.main === module) {
  const manifestPath = path.join(root, 'data/game-tag-resolution-manifest.json');
  const targets = fs.existsSync(manifestPath) ? read('game-tag-resolution-manifest.json').targets :
    Object.entries(read('game-tag-audit.json').games).flatMap(([slug, g]) => Object.entries(g.tags).filter(([,v]) => v.status === 'pending').map(([tag]) => ({ slug, tag })));
  const result = applyResolutions(read('game-tag-decisions.json'), read('game-tag-resolutions-20260909.json'), targets, read('game-genre-survey.json'));
  if (!fs.existsSync(manifestPath)) fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, targets }, null, 2) + '\n', { flag: 'wx' });
  for (const [file, value] of [['game-tag-decisions.json', result.decisions], ['game-tag-resolution-report.json', result.report]]) {
    fs.writeFileSync(path.join(root, 'data', file), JSON.stringify(value, null, 2) + '\n');
  }
  console.log(JSON.stringify(result.report.summary, null, 2));
}
module.exports = { applyResolutions };
