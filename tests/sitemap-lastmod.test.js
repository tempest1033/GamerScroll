'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// The metrics sitemap's as-of date, as stored by scripts/fetch-analysis-pages.js.
const lastmodFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-al-')), 'analysis-lastmod.json');
fs.writeFileSync(lastmodFile, JSON.stringify({ lastmod: '2026-11-02' }));
process.env.ANALYSIS_LASTMOD_FILE = lastmodFile;
const { newestLastmod, readAnalysisLastmod } = require('../src/build/analysis-pages');
const { gameLastmod } = require('../src/build/game-data');
const { writeGameSitemaps, writeSitemapIndex } = require('../src/build/editions');

test('game lastmod is the newest data date, or the latest chart day for a charting game without dated series', () => {
  assert.equal(gameLastmod(['2026-10-01', undefined, '2026-11-02'], false, '2026-11-03'), '2026-11-02');
  assert.equal(gameLastmod([], true, '2026-11-03'), '2026-11-03');
  assert.equal(gameLastmod([], false, '2026-11-03'), null, 'no data and not charting: nothing truthful to claim');
});

test('every game sitemap URL and every sitemap index entry carries a lastmod', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-sm-'));
  const slugs = { en: ['a', 'b'], ko: ['a'] };
  writeGameSitemaps(dir, slugs, { a: '2026-11-01', b: '2026-11-03' });
  writeSitemapIndex(dir);
  for (const f of fs.readdirSync(dir).filter((n) => /^sitemap-games-/.test(n))) {
    const xml = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.equal((xml.match(/<url>/g) || []).length, (xml.match(/<lastmod>/g) || []).length, f);
  }
  const index = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8');
  const entries = index.split('<sitemap>').slice(1).slice(0);
  assert.ok(entries.some((e) => e.includes('/analysis/sitemap.xml')), 'metrics sitemap is listed');
  assert.ok(entries.length >= 2);
  for (const e of entries) assert.match(e, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.match(entries.find((e) => e.includes('/analysis/sitemap.xml')), /<lastmod>2026-11-02<\/lastmod>/);
});

test('analysis lastmod comes from the sitemap\'s own dates and is never invented', () => {
  assert.equal(newestLastmod('<urlset><url><loc>a</loc><lastmod>2026-10-30</lastmod></url><url><loc>b</loc><lastmod>2026-11-02T01:00:00Z</lastmod></url></urlset>'), '2026-11-02');
  assert.equal(newestLastmod('<urlset><url><loc>a</loc></url></urlset>'), null);
  assert.equal(readAnalysisLastmod(path.join(os.tmpdir(), 'does-not-exist.json')), null);
});
