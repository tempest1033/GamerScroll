'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { compile } = require('./compile-game-genres');
const { loadRankStats } = require('../src/rank/stats');
const root = path.resolve(__dirname, '..'), docs = path.join(root, 'docs');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const fixture = compile({ games: {
  mixed: { name: 'Mixed', stores: {
    ios: { status: 'found', genreIds: ['7014'] },
    android: { status: 'found', genreIds: ['GAME_STRATEGY'], categories: [{ id: 'GAME_ROLE_PLAYING', name: '롤플레잉' }, { name: '하이퍼캐주얼' }] }
  } },
  unavailable: { stores: { ios: { status: 'unavailable' } } },
  music: { stores: { ios: { status: 'found', genreIds: ['7011'] } } }
} }, { games: {} });
assert.deepEqual(fixture.games.mixed.genres.sort(), ['rpg', 'strategy-defense']);
assert.deepEqual(fixture.games.mixed.suggestedTags, []);
assert.ok(!fixture.games.mixed.genres.includes('hypercasual'));
assert.deepEqual(fixture.games.music.genres, []);
assert.deepEqual(fixture.games.unavailable.reviewReasons, ['store-unavailable']);
const survey = read('data/game-genre-survey.json'), compiled = read('data/game-store-genres.json');
assert.deepEqual(Object.keys(compiled.games).sort(), Object.keys(survey.games).sort());
assert.equal(compiled.summary.total, Object.values(read('data/games.json').games).filter(g => g.appIds?.ios || g.appIds?.android).length);
console.log('PASS 전수조사 누락 없음·스토어 교차분류·미확인 보류·수동 태그 분리');

const S = loadRankStats(), db = read('data/games.json').games;
const samples = ['메이플 키우기', '승리의 여신: 니케', 'Limbus Company'];
for (const name of samples) {
  const game = db[name], file = path.join(docs, 'games', game.slug, 'index.html');
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const days = S.days.filter(d => d.date <= S.today.date && Date.parse(d.date) >= Date.parse(S.today.date) - 29 * 86400000);
  for (const c of ['kr', 'jp', 'us', 'cn', 'tw']) {
    const expected = ['ios', 'android'].map(store => {
      const ranks = days.map(d => S.rankOf(d, c, store, game.appIds[store])).filter(Number.isFinite);
      return ranks.length ? Math.min(...ranks) : '-';
    }).join(' / ');
    assert.equal($(`[data-period-best="${c}"]`).text(), expected, `${name} ${c}`);
  }
  $('.rk-game-months tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length > 1) assert.ok(cells.eq(1).text() !== '-' || cells.eq(3).text() !== '-');
  });
}
const monthly = cheerio.load(fs.readFileSync(path.join(docs, 'rankings/monthly', S.latestMonth, 'index.html'), 'utf8'));
assert.equal(monthly('.rk-badge.sub').length, 0);
console.log('PASS 국가별 30일 최고·스토어별 값·빈 월 제외·월간 전용 배지 제거');

async function main() {
  const server = http.createServer((req, res) => {
    try {
      let file = path.resolve(docs, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(docs + path.sep) && file !== docs) throw new Error('Invalid path');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      res.setHeader('Content-Type', ({ '.css': 'text/css', '.js': 'application/javascript', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const failures = [];
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    // 기사 유형별 본문과 미디어가 있는 페이지를 실제 생성물에서 선택한다.
    const candidates = [];
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (entry.name === 'index.html') {
          const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
          if ($('.blog-content').length) candidates.push({ route: '/' + path.relative(docs, path.dirname(file)).replace(/\\/g, '/') + '/', table: $('.blog-content table').length, video: $('.blog-video-wrapper').length, chart: $('.ranking-chart').length });
        }
      }
    }
    scan(path.join(docs, 'magazine'));
    scan(path.join(docs, 'wiki'));
    const chosen = new Set();
    for (const prefix of ['/magazine/insight/', '/magazine/ranking/', '/magazine/issue/', '/wiki/']) {
      const found = candidates.find(c => c.route.startsWith(prefix));
      assert.ok(found, `Missing article type ${prefix}`);
      chosen.add(found.route);
    }
    for (const kind of ['table', 'video', 'chart']) {
      const found = candidates.find(c => c[kind]);
      if (found) chosen.add(found.route);
    }
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      for (const route of chosen) {
        try {
          assert.equal((await page.goto(base + route, { waitUntil: 'networkidle' })).status(), 200);
          const state = await page.evaluate(() => {
            const title = document.querySelector('.blog-title'), content = document.querySelector('.blog-content');
            return {
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              titleSize: parseFloat(getComputedStyle(title).fontSize),
              bodySize: parseFloat(getComputedStyle(content).fontSize),
              mediaFits: [...document.querySelectorAll('.blog-image,.blog-video-wrapper,.ranking-chart-wrapper')].filter(e => e.getBoundingClientRect().width).every(e => e.getBoundingClientRect().right <= innerWidth + 1),
              noindex: document.querySelector('meta[name="robots"]')?.content.includes('noindex')
            };
          });
          assert.equal(state.overflow, false, '페이지 가로 넘침');
          assert.ok(state.titleSize > state.bodySize && state.bodySize >= 16, '제목·본문 위계');
          assert.ok(state.mediaFits, '미디어 폭');
          if (route.startsWith('/magazine/issue/')) assert.ok(state.noindex, '레거시 noindex');
          console.log(`PASS ${width}px ${route}`);
        } catch (e) { failures.push(`${width}px ${route}: ${e.message}`); }
      }
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert.deepEqual(failures, []);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
