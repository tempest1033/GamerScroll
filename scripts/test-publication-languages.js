'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const cheerio = require('cheerio');
const { publicationLanguages, articlePublicationUrls } = require('../src/templates/ai-blog/taxonomy');
const root = path.resolve(__dirname, '..');

(async () => {
  assert.deepEqual(publicationLanguages({}), ['en', 'ko']);
  assert.deepEqual(publicationLanguages({ publishLanguages: ['ko'] }), ['ko']);
  for (const invalid of [[], ['en'], ['ja'], ['ko', 'ko'], 'ko', null]) {
    assert.throws(() => publicationLanguages({ publishLanguages: invalid }));
  }
  const { urlsForArticle } = await import(pathToFileURL(path.join(root, 'scripts/submit-indexing.mjs')));
  const ko = {
    site: 'aiscroll', status: 'approved', slug: 'publication-ko-fixture',
    category: 'reviews', topics: ['meta'], author: 'Editor J',
    date: '2026-09-01T00:00Z', title: '한국어 발행 검사',
    titleEn: 'Korean publication fixture', summary: '한국어 발행 옵션을 검사합니다.',
    summaryEn: 'Tests publication languages.', keywords: '한국어, 발행, 언어',
    keywordsEn: 'publication language, Korean article, language option',
    needTranslate: false, thumbnail: '/icon-192.png',
    content: [{ type: 'text', value: '한국어 본문입니다.' }],
    contentEn: [{ type: 'text', value: 'English body.' }],
    legacyPaths: ['/article/hot/publication-ko-fixture/']
  };
  const dual = { ...ko, slug: 'publication-dual-fixture', category: 'news', topics: ['coding-agents'],
    title: '기본 한영 발행 검사', titleEn: 'Default bilingual fixture', legacyPaths: [] };
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aiscroll-publication-test-'));
  for (const relative of [
    'generate-ai-blog.js', 'ai-build-cache.js', 'package.json',
    'src/aiscroll-ui', 'src/aiscroll-styles', 'src/aiscroll-build',
    'src/templates/ai-blog', 'src/ai-blog', 'data/games.json', 'data/ai-popular-articles.json'
  ]) {
    fs.cpSync(path.join(root, relative), path.join(sandbox, relative), { recursive: true });
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction');
  const input = path.join(sandbox, 'data/tech/ai');
  fs.mkdirSync(input, { recursive: true });
  const koFile = path.join(input, ko.slug + '.json');
  fs.writeFileSync(koFile, JSON.stringify(ko));
  fs.writeFileSync(path.join(input, dual.slug + '.json'), JSON.stringify(dual));
  const output = path.join(sandbox, 'ai-docs');
  const runBuild = label => {
    const result = spawnSync(process.execPath, ['generate-ai-blog.js'], {
      cwd: sandbox, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, CI: 'true', GA4_SERVICE_ACCOUNT: '', AISCROLL_GA4_SERVICE_ACCOUNT: '' }
    });
    fs.writeFileSync(path.join(sandbox, label + '.log'), result.stdout + result.stderr);
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  };
  runBuild('default');
  for (const article of [ko, dual]) for (const url of Object.values(articlePublicationUrls(article))) {
    assert(fs.existsSync(path.join(output, new URL(url).pathname, 'index.html')));
  }
  console.log('PASS default articles publish both languages');

  ko.publishLanguages = ['ko'];
  for (const field of ['titleEn', 'summaryEn', 'keywordsEn', 'contentEn', 'needTranslate']) delete ko[field];
  fs.writeFileSync(koFile, JSON.stringify(ko));
  runBuild('korean-only');
  const koPath = '/ko/article/reviews/' + ko.slug + '/';
  const enPath = '/article/reviews/' + ko.slug + '/';
  assert(!fs.existsSync(path.join(output, enPath, 'index.html')), '이전 영문 출력 제거');
  assert(fs.existsSync(path.join(output, koPath, 'index.html')));
  for (const url of Object.values(articlePublicationUrls(dual))) {
    assert(fs.existsSync(path.join(output, new URL(url).pathname, 'index.html')));
  }
  const read = relative => fs.readFileSync(path.join(output, relative), 'utf8');
  const $ = cheerio.load(read(koPath + 'index.html'));
  assert.equal($('html').attr('lang'), 'ko');
  assert.equal($('link[rel=canonical]').attr('href'), 'https://aiscroll.io' + koPath);
  assert.equal($('[hreflang=en]').length, 0);
  assert.equal($('[hreflang=x-default]').attr('href'), 'https://aiscroll.io' + koPath);
  for (const name of ['articles.json', 'articles-search.json']) {
    assert(!JSON.parse(read(name)).some(a => a.slug === ko.slug));
    assert(JSON.parse(read('ko/' + name)).some(a => a.slug === ko.slug));
  }
  for (const page of ['index.html', 'article/reviews/index.html']) {
    assert(!read(page).includes(ko.slug), `영문 목록에서 제외: ${page}`);
  }
  assert(!fs.existsSync(path.join(output, 'topic/meta/index.html')), '한국어 전용 주제의 영문 출력 제거');
  const topic = cheerio.load(read('ko/topic/meta/index.html'));
  assert.equal(topic('[hreflang=en]').length, 0);
  assert(read('ko/article/reviews/index.html').includes(ko.slug));
  assert(!read('rss.xml').includes(ko.slug));
  assert(read('ko/rss.xml').includes(ko.slug));
  const xml = cheerio.load(read('sitemap.xml'), { xmlMode: true });
  const urls = xml('url > loc').toArray().map(e => xml(e).text());
  assert(!urls.includes('https://aiscroll.io' + enPath));
  assert(urls.includes('https://aiscroll.io' + koPath));
  assert(!urls.includes('https://aiscroll.io/article/reviews/'));
  assert(urls.includes('https://aiscroll.io/ko/article/reviews/'));
  const entry = xml('url').filter((_, e) => xml(e).find('loc').text() === 'https://aiscroll.io' + koPath);
  assert.equal(entry.find('[hreflang=en]').length, 0);
  const redirects = read('_redirects').split(/\r?\n/);
  assert(redirects.includes(`/ko/article/hot/${ko.slug}/ ${koPath} 301`));
  assert(!redirects.some(line => line.startsWith(`/article/hot/${ko.slug}/ `)));
  assert.deepEqual(urlsForArticle(`data/tech/ai/${ko.slug}.json`, ko), ['https://aiscroll.io' + koPath]);
  assert.equal(urlsForArticle(`data/tech/ai/${dual.slug}.json`, dual).length, 2);
  assert.deepEqual(urlsForArticle(`data/tech/ai/${ko.slug}.json`, { ...ko, status: 'draft' }), []);
  console.log('PASS Korean-only page, catalog, topics, RSS, sitemap, alternates, redirects, IndexNow');

  const audit = fixture => {
    const file = path.join(sandbox, 'audit-fixture.json');
    fs.writeFileSync(file, JSON.stringify(fixture));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/audit-content.js'), file, '--show-pass'], {
      cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024
    });
    assert(!result.error, result.error?.message);
    assert(result.stdout.includes('meta/site'), result.stderr);
    return result.stdout;
  };
  assert(!audit(ko).includes('meta/dual-language'), '한국어 전용에는 영문 필수 조건을 적용하지 않음');
  const missingEnglish = { ...ko };
  delete missingEnglish.publishLanguages;
  assert(audit(missingEnglish).includes('meta/dual-language'), '기본 발행의 영문 검사는 유지');
  console.log('PASS language-specific linter gates; fixture editorial checks are outside this test');
  console.log('ARTIFACTS=' + sandbox);
})().catch(error => { console.error(error); process.exitCode = 1; });
