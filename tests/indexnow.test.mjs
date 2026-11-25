import test from 'node:test';
import assert from 'node:assert/strict';
import { sitemapEntries, changedUrls, urlsForArticle } from '../scripts/submit-indexing.mjs';

const xml = `<urlset>
  <url><loc>https://gamerscroll.com/ko/</loc><lastmod>2026-11-25</lastmod></url>
  <url><loc>https://gamerscroll.com/ko/games/a/</loc><lastmod>2026-11-20</lastmod><priority>0.6</priority></url>
  <url><loc>https://gamerscroll.com/ko/rankings/?x=1&amp;y=2</loc></url>
</urlset>`;

test('sitemap mode submits only URLs whose lastmod changed since the last submission, or that are new', () => {
  const current = sitemapEntries(xml);
  assert.deepEqual(current, { 'https://gamerscroll.com/ko/': '2026-11-25', 'https://gamerscroll.com/ko/games/a/': '2026-11-20', 'https://gamerscroll.com/ko/rankings/?x=1&y=2': '' });
  const previous = { 'https://gamerscroll.com/ko/': '2026-11-24', 'https://gamerscroll.com/ko/games/a/': '2026-11-20', 'https://gamerscroll.com/ko/rankings/?x=1&y=2': '', 'https://gamerscroll.com/gone/': '2026-01-01' };
  assert.deepEqual(changedUrls(current, previous), ['https://gamerscroll.com/ko/']);
  assert.deepEqual(changedUrls(current, {}), Object.keys(current), 'without a previous submission every URL counts once');
});

test('retired wiki articles are not pinged (the section answers 410)', () => {
  assert.deepEqual(urlsForArticle('data/wiki/business/x.json', { status: 'approved', slug: 'x' }), []);
});
