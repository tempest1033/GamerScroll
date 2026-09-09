'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { loadGenres } = require('../src/rank/genres');
const { loadRankStats } = require('../src/rank/stats');
const root = path.resolve(__dirname, '..');
const games = JSON.parse(fs.readFileSync(path.join(root, 'data/games.json'), 'utf8').replace(/^\uFEFF/, '')).games;
const slugs = new Set(Object.values(games).map(g => g.slug));
const taxonomy = loadGenres(), S = loadRankStats();
for (const slug of taxonomy.assignments.keys()) assert.ok(slugs.has(slug), `Unknown slug ${slug}`);
assert.ok(taxonomy.matches(games['메이플 키우기'], 'rpg'));
assert.ok(taxonomy.matches(games['메이플 키우기'], 'idle'));
assert.ok(!taxonomy.matches(games['메이플 키우기'], 'subculture'));
assert.ok(taxonomy.matches(games['승리의 여신: 니케'], 'subculture'));
assert.equal(taxonomy.matches({ slug: 'unknown' }, 'rpg'), false);
assert.equal(taxonomy.matches(null, 'all'), true);
const current = new Map();
for (const store of ['android', 'ios']) for (const row of S.today.rows.kr[store].slice(0, 200)) {
  const game = S.gameOf(store, row);
  const key = game?.slug || `${store}:${row.appId}`;
  current.set(key, { slug: game?.slug, name: game?.key || row.title, categories: taxonomy.tagsFor(game) });
}
const coverage = { date: S.today.date, total: current.size, classified: [...current.values()].filter(g => g.categories.length).length, unclassified: [...current.values()].filter(g => !g.categories.length) };
fs.writeFileSync(path.join(root, 'mockups/genre-classification-audit.json'), JSON.stringify(coverage, null, 2));
console.log(`Classification: ${coverage.classified}/${coverage.total}; pending ${coverage.unclassified.length}`);
for (const category of [{ id: 'all' }, ...taxonomy.categories]) {
  const route = `/rankings/genres/${category.id === 'all' ? '' : category.id + '/'}`;
  const $ = cheerio.load(fs.readFileSync(path.join(root, 'docs', route, 'index.html'), 'utf8'));
  for (const [store, css] of [['android', 'and'], ['ios', 'ios']]) {
    const expected = S.today.rows.kr[store].slice(0, 200).map((r, i) => ({ r, rank: i + 1 })).filter(x => taxonomy.matches(S.gameOf(store, x.r), category.id));
    const rows = $(`.rk-col.${css} .rk-list li`).filter((_, e) => !$(e).hasClass('rk-empty'));
    assert.equal(rows.length, expected.length, category.id);
    rows.each((i, e) => {
      assert.equal($(e).find('.rk-rk').text(), String(i + 1));
      assert.equal($(e).find('.rk-genre-overall').text(), `전체 ${expected[i].rank}위`);
    });
  }
  assert.ok(!$('.rk-subnav a').toArray().some(e => $(e).text() === '서브컬처'));
  assert.equal($('.rk-ticker').length, 0);
}
console.log('PASS 장르·태그·중복 분류·미분류·현재 전체 순위 보존');
(async () => {
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4175';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const failures = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const category of ['rpg', 'subculture', 'idle']) {
        try {
          await page.goto(`${base}/rankings/genres/${category}/`, { waitUntil: 'networkidle' });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.equal(await page.locator('.rk-genre-filters a.active').count(), 1);
          if (width === 390) {
            await page.locator('label[for="rk-st-ios"]').click();
            assert.ok(await page.locator('.rk-col.ios').isVisible());
            assert.ok(!(await page.locator('.rk-col.and').isVisible()));
          }
          console.log(`PASS ${width}px ${category}`);
        } catch (e) { failures.push(`${width} ${category}: ${e.message}`); }
      }
      await page.goto(`${base}/rankings/genres/`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(root, `mockups/genres-${width}.png`) });
      await page.close();
    }
  } finally { await browser.close(); }
  if (failures.length) throw new Error(failures.join('\n'));
})().catch(e => { console.error(e); process.exitCode = 1; });
