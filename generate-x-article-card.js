/**
 * X(Twitter) 개별 기사 카드 이미지 생성 스크립트
 * CLI: node generate-x-article-card.js <slug> [--lang en]
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { generateXArticleCardHtml } = require('./src/templates/x-article-card-template');
const { generateXArticleCardHtmlEn } = require('./src/templates/x-article-card-template-en');

const OUTPUT_DIR = './docs/images';
const TEMP_HTML = './temp-x-article-card.html';

// CLI args 파싱
const args = process.argv.slice(2);
const langIdx = args.indexOf('--lang');
const lang = langIdx !== -1 ? args[langIdx + 1] : 'ko';
const slug = args.find(a => !a.startsWith('--') && a !== lang);

const generateHtml = lang === 'en' ? generateXArticleCardHtmlEn : generateXArticleCardHtml;
const outputFilename = lang === 'en' ? 'x-card-article-en.png' : 'x-card-article.png';

// 기사 JSON 탐색 경로 (우선순위 순)
const SEARCH_DIRS = [
  { dir: './reports/issue', type: 'issue' },
  { dir: './reports/ranking', type: 'ranking' },
  { dir: './data/wiki', type: 'wiki', nested: true },
  { dir: './data/tech', type: 'tech', nested: true }
];

function findArticleBySlug(slug) {
  for (const { dir, type, nested } of SEARCH_DIRS) {
    if (!fs.existsSync(dir)) continue;

    if (nested) {
      const subDirs = fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const sub of subDirs) {
        const filePath = path.join(dir, sub, `${slug}.json`);
        if (fs.existsSync(filePath)) {
          return { path: filePath, type, category: sub };
        }
      }
    } else {
      const filePath = path.join(dir, `${slug}.json`);
      if (fs.existsSync(filePath)) {
        return { path: filePath, type };
      }
    }
  }
  return null;
}

function extractIntro(article, lang) {
  const contentKey = lang === 'en' ? 'contentEn' : 'content';
  const content = article[contentKey] || article.content || [];
  const textBlock = content.find(b => b.type === 'text');
  if (textBlock && textBlock.value) return textBlock.value;
  return lang === 'en' ? (article.summaryEn || article.summary || '') : (article.summary || '');
}

async function generateXArticleCard(slug) {
  if (!slug) {
    console.error('사용법: node generate-x-article-card.js <slug> [--lang en]');
    process.exit(1);
  }

  console.log(`기사 카드 이미지 생성 시작: ${slug} (lang: ${lang})`);

  const found = findArticleBySlug(slug);
  if (!found) {
    console.error(`기사를 찾을 수 없습니다: ${slug}`);
    console.error('탐색 경로: reports/issue/, reports/ranking/, data/wiki/*/, data/tech/*/');
    process.exit(1);
  }

  console.log(`기사 파일: ${found.path}`);
  const article = JSON.parse(fs.readFileSync(found.path, 'utf8'));

  const title = lang === 'en' ? (article.titleEn || article.title) : article.title;
  const intro = extractIntro(article, lang);

  const cardData = {
    title,
    intro,
    summary: lang === 'en' ? (article.summaryEn || article.summary) : article.summary,
    thumbnail: article.thumbnail || '',
    date: article.date,
    slug: article.slug
  };

  const html = generateHtml(cardData);

  fs.writeFileSync(TEMP_HTML, html, 'utf8');
  console.log('임시 HTML 생성 완료');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1200, height: 628 });
  await page.goto(`file://${path.resolve(TEMP_HTML)}`);

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.screenshot({
    path: outputPath,
    type: 'png'
  });

  await browser.close();

  fs.unlinkSync(TEMP_HTML);

  console.log(`기사 카드 이미지 생성 완료: ${outputPath}`);
  return outputPath;
}

if (require.main === module) {
  generateXArticleCard(slug).catch(err => {
    console.error('이미지 생성 실패:', err);
    process.exit(1);
  });
}

module.exports = { generateXArticleCard };
