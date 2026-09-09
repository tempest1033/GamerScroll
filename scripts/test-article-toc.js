// 실행: node --test scripts/test-article-toc.js
// 설치된 Chrome을 사용한다. CI에서는 PLAYWRIGHT_CHANNEL로 브라우저 채널을 지정할 수 있다.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const { PurgeCSS } = require('purgecss');
const {
  generateIssueDetailPage, generateInsightDetailPage,
  generateHotpickDetailPage, generateRankingDetailPage
} = require('../src/templates/pages/trend');
const { generateTechArticlePage } = require('../src/templates/pages/tech-article');
const { generateAIBlogArticle } = require('../src/templates/ai-blog/article');

const renderers = [
  ['이슈', article => generateIssueDetailPage({ post: article })],
  ['인사이트', article => generateInsightDetailPage({ post: article })],
  ['핫픽', article => generateHotpickDetailPage({ post: article })],
  ['순위 분석', article => generateRankingDetailPage({ post: article })],
  ['테크', article => generateTechArticlePage({ article, category: 'ai' })],
  ['AI 한국어', article => generateAIBlogArticle(article, { lang: 'ko' })],
  ['AI 영어', article => generateAIBlogArticle(article, { lang: 'en' })]
];
const titles = ['같은 제목', '같은 제목', '같은 제목-2', '!!!', '日本語', 'sidebar-toc', '1. 기존 앵커', 'A & B'];
function fixture(headings = titles) {
  return {
    slug: 'article-toc-test',
    category: 'general',
    title: '기사 목차 동작 검증',
    date: '2026-09-06',
    summary: '기사 내용은 유지하면서 화면 크기에 맞는 목차를 제공합니다.',
    toc: false, // 레거시 플래그와 무관하게 소제목 수로 자동 표시한다.
    content: [
      { type: 'text', value: '서문입니다. '.repeat(30) },
      ...headings.flatMap(value => [
        { type: 'heading', value },
        { type: 'text', value: '각 절의 본문을 읽고 원하는 소제목으로 이동할 수 있습니다. '.repeat(35) }
      ])
    ]
  };
}

test('모든 기사 유형에서 목차와 본문 앵커가 일치하고 중복 제목도 구별된다', async t => {
  for (const [name, render] of renderers) {
    await t.test(name, () => {
      const $ = cheerio.load(render(fixture([...titles, '', '   '])));
      const headings = $('.blog-content h2');
      const ids = headings.map((_, el) => $(el).attr('id')).get();
      assert.equal(headings.length, titles.length);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.every(Boolean));
      assert.equal(ids[0], '같은-제목');
      assert.equal(ids[2], '같은-제목-2');
      assert.equal(ids[6], '1-기존-앵커');
      for (const selector of ['#sidebar-toc', '.article-toc-mobile']) {
        const links = $(`${selector} a`);
        assert.equal(links.length, titles.length);
        links.each((i, link) => {
          assert.equal($(link).attr('href'), `#${ids[i]}`);
          assert.equal($(link).find('.article-toc-text').text(), titles[i]);
          assert.equal($('[id]').filter((_, el) => $(el).attr('id') === ids[i]).length, 1);
        });
      }
      const label = name === 'AI 영어' ? 'Table of Contents' : '목차';
      assert.equal($('.article-toc-mobile summary').text(), label);
      assert.equal($('#sidebar-toc nav').attr('aria-label'), label);
    });
  }
});

test('소제목 3개부터 자동 표시하고 짧거나 빈 기사에서는 생략한다', async t => {
  for (const [name, render] of renderers) {
    await t.test(name, () => {
      for (const count of [0, 1, 2, 3]) {
        const $ = cheerio.load(render(fixture(titles.slice(0, count))));
        assert.equal($('.article-toc').length, count >= 3 ? 2 : 0);
      }
    });
  }
});

let browser;
let css;
before(async () => {
  const bundles = await esbuild.build({
    absWorkingDir: path.resolve(__dirname, '..'),
    entryPoints: ['src/styles/bundle-core.css', 'src/styles/bundle-article.css'],
    bundle: true,
    write: false,
    outdir: 'toc-test-unused',
    minify: true,
    logLevel: 'silent',
    plugins: [{
      name: 'external-css-assets',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args =>
          args.kind === 'url-token' ? { path: args.path, external: true } : undefined);
      }
    }]
  });
  // 배포 빌드와 동일하게 HTML에 없는 동적 is-* 상태를 보존한 CSS도 실제 렌더링한다.
  const purged = await new PurgeCSS().purge({
    content: renderers.map(([, render]) => ({ raw: render(fixture()), extension: 'html' })),
    css: bundles.outputFiles.map(file => ({ raw: file.text })),
    safelist: { standard: ['active', 'open'], deep: [/^is-/, /^has-/] }
  });
  css = purged.map(result => result.css).join('\n');
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
});
after(async () => {
  if (browser) await browser.close();
});

async function openPage(render, options = {}, article = fixture()) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    ...options
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const $ = cheerio.load(render(article));
  $('link[rel="stylesheet"], script[src]').remove();
  $('head').prepend(`<style>${css}</style>`);
  await context.route('**/*', route =>
    route.request().isNavigationRequest()
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: $.html() })
      : route.abort());
  await page.goto('https://article-toc.test/', { waitUntil: 'load' });
  return { context, page, errors };
}

async function expectJump(page, selector, index, checkCurrent = true) {
  const link = page.locator(selector).nth(index);
  const id = (await link.getAttribute('href')).slice(1);
  await link.click();
  await page.waitForFunction(({ id, checkCurrent }) => {
    const heading = document.getElementById(id);
    const top = heading.getBoundingClientRect().top;
    const margin = parseFloat(getComputedStyle(heading).scrollMarginTop);
    const current = [...document.querySelectorAll('.article-toc [aria-current="location"]')];
    return decodeURIComponent(location.hash.slice(1)) === id
      && Math.abs(top - margin) < 3
      && (!checkCurrent || (current.length === 2 && current.every(a => a.getAttribute('href') === `#${id}`)));
  }, { id, checkCurrent });
}

test('PC 고정 목차와 모바일 접이식 목차가 모든 기사 유형에서 동작한다', async t => {
  for (const [name, render] of renderers) {
    await t.test(name, async () => {
      const { context, page, errors } = await openPage(render);
      try {
        assert.equal(await page.locator('#sidebar-toc').isVisible(), true);
        assert.equal(await page.locator('.article-toc-mobile').isVisible(), false);
        for (const index of [0, 1, titles.length - 1]) {
          await expectJump(page, '#sidebar-toc a', index);
        }
        const top = await page.locator('.article-sidebar-sticky').evaluate(el => el.getBoundingClientRect().top);
        assert.ok(Math.abs(top - 70) < 2);
        // 현재 절 강조색은 color transition 이 끝난 뒤에 읽는다 — 직후에 읽으면 시작색과 같아 첫 케이스가 흔들린다.
        await page.waitForFunction(() => {
          const toc = document.querySelector('#sidebar-toc');
          const active = toc && toc.querySelector('[aria-current]');
          const other = toc && toc.querySelector('a:not([aria-current])');
          return !!(active && other) && getComputedStyle(active).color !== getComputedStyle(other).color;
        });
        for (const width of [769, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          assert.equal(await page.locator('#sidebar-toc').isVisible(), width > 768);
          assert.equal(await page.locator('.article-toc-mobile').isVisible(), width <= 768);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
        const summary = page.locator('.article-toc-mobile summary');
        await summary.focus();
        await summary.press('Enter');
        assert.equal(await page.locator('.article-toc-mobile').getAttribute('open'), '');
        await expectJump(page, '.article-toc-mobile a', 1);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForFunction(() => {
          const items = document.querySelectorAll('.article-toc-mobile a');
          return items[items.length - 1].getAttribute('aria-current') === 'location';
        });
        await summary.click();
        assert.equal(await page.locator('.article-toc-mobile').getAttribute('open'), null);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    });
  }
});

test('긴 PC 목차의 마지막 항목도 화면 안에서 접근할 수 있다', async () => {
  const { context, page } = await openPage(renderers[0][1], {}, fixture(
    Array.from({ length: 30 }, (_, i) => `소제목 ${i + 1} 길이가 긴 목차 항목입니다`)
  ));
  try {
    await expectJump(page, '#sidebar-toc a', 29);
    const lastItem = await page.locator('#sidebar-toc a').last().evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    });
    assert.ok(lastItem.top >= 70 && lastItem.bottom <= 900);
  } finally {
    await context.close();
  }
});

test('JavaScript 없이도 모바일 목차를 펼치고 제목으로 이동할 수 있다', async () => {
  const { context, page } = await openPage(renderers[6][1], {
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 }
  });
  try {
    await page.locator('.article-toc-mobile summary').click();
    assert.equal(await page.locator('.article-toc-mobile a').nth(1).isVisible(), true);
    await expectJump(page, '.article-toc-mobile a', 1, false);
  } finally {
    await context.close();
  }
});
