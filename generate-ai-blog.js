#!/usr/bin/env node
/**
 * AIScroll 빌드 스크립트
 *
 * 1. data/tech/ai/*.json 로드
 * 2. reports/issue/*.json에서 isGlobal: true 로드
 * 3. 영문 HTML 생성
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { PurgeCSS } = require('purgecss');

// 로컬 빌드 시 draft 포함 (CI 환경이 아니거나 --draft/-d 플래그)
const includeDrafts = !process.env.CI || process.argv.includes('--draft') || process.argv.includes('-d');

// 증분 빌드 캐시
const buildCache = require('./ai-build-cache');

// 템플릿
const { generateAIBlogIndex, generateSearchPage, generateCategoryPage, setGlobalSidebarCounts, setGlobalSidebarArticles, I18N, langPrefixOf } = require('./src/templates/ai-blog/index');
const { generateAIBlogArticle } = require('./src/templates/ai-blog/article');
const { buildLayoutCoreBundle, LAYOUT_CORE_ASSET } = require('./src/templates/layout');

// GA4 Analytics
const {
  savePopularArticles,
  loadPopularArticles,
  shouldFetchPopularArticles
} = require('./src/ai-blog/analytics');

// 경로 설정
const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_DIR = path.join(__dirname, 'reports');
// GamerScroll 내 ai-docs/ 폴더에 빌드
const DOCS_DIR = path.join(__dirname, 'ai-docs');
const STYLES_SRC = path.join(__dirname, 'src', 'styles');
const FEED_ASSETS_DIR = path.join(DOCS_DIR, 'assets', 'feed');
const { ensureDir, collectHtmlFilesUnderDir, externalizeDeferredJsonFromHtml } = require('./src/build/utils');

/**
 * 발행시간 자동 기록: date가 비어있고 status === 'approved'인 기사에 현재 시각 기록
 * @param {object} article - 기사 데이터
 * @param {string} jsonFilePath - JSON 파일 경로 (write back용)
 * @param {'KST'|'UTC'} timezone - 시간대
 */
function ensurePublishDate(article, jsonFilePath, timezone) {
  if (article.date || article.status !== 'approved') return;
  const now = new Date();
  if (timezone === 'KST') {
    now.setTime(now.getTime() + 9 * 60 * 60 * 1000);
  }
  // 30분 단위 반올림
  const minutes = now.getUTCMinutes();
  const roundedMinutes = minutes < 15 ? 0 : minutes < 45 ? 30 : 60;
  if (roundedMinutes === 60) {
    now.setUTCHours(now.getUTCHours() + 1);
    now.setUTCMinutes(0);
  } else {
    now.setUTCMinutes(roundedMinutes);
  }
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  article.date = `${yyyy}-${mm}-${dd}T${hh}:${min}Z`;
  // JSON 파일에 write back
  try {
    const raw = fs.readFileSync(jsonFilePath, 'utf8').replace(/^\uFEFF/, '');
    const fileData = JSON.parse(raw);
    fileData.date = article.date;
    fs.writeFileSync(jsonFilePath, JSON.stringify(fileData, null, 2), 'utf8');
    console.log(`  📅 발행시간 자동 기록: ${jsonFilePath} → ${article.date}`);
  } catch (e) {
    console.warn(`  ⚠️ 발행시간 write back 실패: ${jsonFilePath}`, e.message);
  }
}

const AI_CSS_BUNDLES = [
  { entry: path.join(STYLES_SRC, 'bundle-core.css'), output: 'styles-core.css', required: true },
  { entry: path.join(STYLES_SRC, 'bundle-article.css'), output: 'styles-article.css', required: true }
];

function removeStaleDocsFiles() {
  const staleFiles = [
    'styles.css'
  ];
  staleFiles.forEach((file) => {
    const filePath = path.join(DOCS_DIR, file);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      console.log(`  stale 파일 제거: ${file}`);
    }
  });
}

function externalizeDeferredJsonPayloads() {
  ensureDir(path.join(DOCS_DIR, 'assets'));
  if (fs.existsSync(FEED_ASSETS_DIR)) {
    fs.rmSync(FEED_ASSETS_DIR, { recursive: true, force: true });
  }
  ensureDir(FEED_ASSETS_DIR);

  const htmlFiles = [];
  collectHtmlFilesUnderDir(DOCS_DIR, htmlFiles);

  htmlFiles.forEach((filePath) => {
    try {
      const originalHtml = fs.readFileSync(filePath, 'utf8');
      const relPath = path.relative(DOCS_DIR, filePath);
      const transformedHtml = externalizeDeferredJsonFromHtml(originalHtml, relPath, FEED_ASSETS_DIR);
      if (transformedHtml !== originalHtml) {
        fs.writeFileSync(filePath, transformedHtml, 'utf8');
      }
    } catch (e) {
      console.warn(`  ⚠️ deferred JSON 외부화 실패 (${filePath}): ${e.message}`);
    }
  });
}

function syncLayoutCoreAsset() {
  try {
    const assetsDir = path.join(DOCS_DIR, 'assets');
    ensureDir(assetsDir);
    const bundle = buildLayoutCoreBundle();
    if (typeof bundle !== 'string' || bundle.trim() === '') {
      throw new Error('layout core bundle is empty');
    }
    fs.writeFileSync(path.join(assetsDir, LAYOUT_CORE_ASSET), bundle, 'utf8');
  } catch (e) {
    console.warn(`  ⚠️ layout-core 동기화 실패: ${e.message}`);
  }
}

function stripBom(text) {
  if (!text) return '';
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function normalizeLineEndingsToLf(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function toCrlf(text) {
  return String(text).replace(/\n/g, '\r\n');
}

function bundleCssFile(entryPath) {
  const entryAbsPath = path.resolve(entryPath);

  function bundleRecursive(filePath, stack) {
    const absPath = path.resolve(filePath);
    if (stack.has(absPath)) {
      const cycle = [...stack, absPath].map((p) => path.relative(process.cwd(), p)).join(' -> ');
      throw new Error(`CSS @import cycle detected: ${cycle}`);
    }

    stack.add(absPath);

    const dir = path.dirname(absPath);
    const raw = fs.readFileSync(absPath, 'utf8');
    const css = normalizeLineEndingsToLf(stripBom(raw));
    const lines = css.split('\n');
    const out = [];

    for (const line of lines) {
      const match = line.match(/^\s*@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;\s*$/);
      if (!match) {
        out.push(line);
        continue;
      }

      const importTarget = match[1];
      const isRemote = /^https?:\/\//.test(importTarget) || /^\/\//.test(importTarget);
      const isSpecial = importTarget.startsWith('/') || importTarget.startsWith('data:');
      if (isRemote || isSpecial) {
        out.push(line);
        continue;
      }

      const importedPath = path.resolve(dir, importTarget);
      out.push(bundleRecursive(importedPath, stack));
    }

    stack.delete(absPath);
    return out.join('\n').trimEnd() + '\n';
  }

  const bundled = bundleRecursive(entryAbsPath, new Set());
  return toCrlf('\ufeff' + bundled);
}

/**
 * CSS 압축 (minify) - GamerScroll과 동일
 */
function minifyCss(css) {
  return css
    // 주석 제거 (/* ... */)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 연속 공백을 하나로
    .replace(/\s+/g, ' ')
    // 셀렉터/속성 주변 공백 제거
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    // 세미콜론 뒤 공백 제거 (속성 간)
    .replace(/;\s*/g, ';')
    // 중괄호 뒤 공백 제거
    .replace(/}\s*/g, '}')
    // 시작 공백 제거
    .trim();
}

// 카테고리 목록 (폴더 분리용)
const CATEGORIES = ['general', 'openai', 'google', 'anthropic', 'vibecoding'];

const SOURCE_IMAGES_ROOT = path.join(__dirname, 'docs', 'assets', 'images');

function getLocalThumbnailUrl(article) {
  if (!article || !article.slug) return '';
  const source = String(article.source || '');
  let relDir = '';

  if (source === 'tech/ai') {
    relDir = `tech/ai/${article.slug}`;
  } else if (source === 'tech/vibecoding') {
    relDir = `tech/vibecoding/${article.slug}`;
  } else if (source === 'issue') {
    relDir = `issue/${article.slug}`;
  } else if (source === 'hotpick') {
    relDir = `hotpick/${article.slug}`;
  } else if (source.startsWith('wiki/')) {
    const wikiCategory = source.split('/')[1] || article.category || '';
    if (!wikiCategory) return '';
    relDir = `wiki/${wikiCategory}/${article.slug}`;
  } else {
    return '';
  }

  const normalizedRelDir = relDir.replace(/\\/g, '/');
  const relParts = normalizedRelDir.split('/').filter(Boolean);
  const candidates = ['thumbnail-sm.webp', 'thumbnail.webp', 'thumbnail-xs.webp'];

  for (const fileName of candidates) {
    const absPath = path.join(SOURCE_IMAGES_ROOT, ...relParts, fileName);
    if (fs.existsSync(absPath)) {
      return `/assets/images/${normalizedRelDir}/${fileName}`;
    }
  }

  return '';
}

function resolveArticleThumbnail(article) {
  const thumb = String(article?.thumbnail || '');
  if (thumb.startsWith('/assets/') || thumb.startsWith('/favicon')) return thumb;
  const localThumb = getLocalThumbnailUrl(article);
  if (localThumb) return localThumb;
  return thumb;
}

// 글 데이터 로드: site === "aiscroll" 기사만 통과
function loadArticles() {
  const articles = [];
  const loadedSlugs = new Set();

  const sources = [
    { dir: path.join(DATA_DIR, 'tech', 'ai'), tag: 'tech/ai' },
    { dir: path.join(DATA_DIR, 'tech', 'vibecoding'), tag: 'tech/vibecoding', categoryOverride: 'vibecoding' },
    { dir: path.join(REPORTS_DIR, 'issue'), tag: 'issue' },
    { dir: path.join(REPORTS_DIR, 'hotpick'), tag: 'hotpick' }
  ];

  for (const src of sources) {
    if (!fs.existsSync(src.dir)) continue;
    const files = fs.readdirSync(src.dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const fullPath = path.join(src.dir, file);
        const content = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
        const data = JSON.parse(content);
        if (data.site !== 'aiscroll') continue;
        ensurePublishDate(data, fullPath, 'UTC');
        const isValid = data.status === 'approved' || data.status === 'published' || (includeDrafts && data.status === 'draft');
        if (!isValid) continue;
        if (loadedSlugs.has(data.slug)) continue;
        const articleData = { ...data, source: src.tag, sourceFile: file, _jsonFilePath: fullPath };
        if (src.categoryOverride) articleData.category = src.categoryOverride;
        articles.push(articleData);
        loadedSlugs.add(data.slug);
      } catch (e) {
        console.error(`로드 실패: ${file}`, e.message);
      }
    }
  }

  // data/wiki/<category>/<slug>.json: site === "aiscroll" only
  const wikiDir = path.join(DATA_DIR, 'wiki');
  if (fs.existsSync(wikiDir)) {
    for (const cat of fs.readdirSync(wikiDir)) {
      const catDir = path.join(wikiDir, cat);
      let stat;
      try { stat = fs.statSync(catDir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      for (const file of fs.readdirSync(catDir).filter(f => f.endsWith('.json'))) {
        try {
          const fullPath = path.join(catDir, file);
          const content = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
          const data = JSON.parse(content);
          if (data.site !== 'aiscroll') continue;
          const isValid = data.status === 'approved' || data.status === 'published' || (includeDrafts && data.status === 'draft');
          if (!isValid) continue;
          if (loadedSlugs.has(data.slug)) continue;
          articles.push({ ...data, source: `wiki/${cat}`, sourceFile: file, _jsonFilePath: fullPath });
          loadedSlugs.add(data.slug);
        } catch (e) {
          console.error(`로드 실패: ${file}`, e.message);
        }
      }
    }
  }

  articles.sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));

  return articles;
}

// 스타일 번들 생성 (AIScroll: core + article)
function copyStyles() {
  let builtCount = 0;
  for (const bundle of AI_CSS_BUNDLES) {
    try {
      const bundledCss = bundleCssFile(bundle.entry);
      const minifiedCss = minifyCss(bundledCss);
      fs.writeFileSync(path.join(DOCS_DIR, bundle.output), minifiedCss, 'utf8');
      builtCount++;
    } catch (e) {
      if (bundle.required) {
        console.warn(`  ⚠️ CSS 번들 생성 실패 (${bundle.output}): ${e.message}`);
      }
      fs.writeFileSync(path.join(DOCS_DIR, bundle.output), '', 'utf8');
    }
  }
  console.log(`스타일 번들 생성 완료 (${builtCount}/${AI_CSS_BUNDLES.length})`);
}

// 디렉토리 재귀 복사
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Favicon PNG 생성 (sharp 사용, 병렬 처리)
async function generateFaviconPNGs(forceRebuild = false) {
  const faviconSvg = path.join(__dirname, 'ai-docs', 'favicon.svg');
  if (!fs.existsSync(faviconSvg)) {
    console.log('favicon.svg 없음, PNG 생성 스킵');
    return;
  }

  // 캐시 체크 - favicon.svg 변경 없고 모든 PNG 존재하면 스킵
  if (!forceRebuild) {
    const requiredFiles = ['favicon-16x16.png', 'favicon-32x32.png', 'icon-192.png', 'icon-512.png', 'og-image.png'];
    const allExist = requiredFiles.every(f => fs.existsSync(path.join(DOCS_DIR, f)));
    if (allExist) {
      console.log('Favicon PNG 캐시됨, 스킵');
      return;
    }
  }

  const svgBuffer = fs.readFileSync(faviconSvg);

  try {
    // 병렬로 6개 PNG 동시 생성
    const pngTasks = [
      sharp(svgBuffer).resize(16, 16).png().toFile(path.join(DOCS_DIR, 'favicon-16x16.png')),
      sharp(svgBuffer).resize(32, 32).png().toFile(path.join(DOCS_DIR, 'favicon-32x32.png')),
      sharp(svgBuffer).resize(32, 32).png().toFile(path.join(DOCS_DIR, 'favicon.ico')),
      sharp(svgBuffer).resize(180, 180).png().toFile(path.join(DOCS_DIR, 'apple-touch-icon.png')),
      sharp(svgBuffer).resize(192, 192).png().toFile(path.join(DOCS_DIR, 'icon-192.png')),
      sharp(svgBuffer).resize(512, 512).png().toFile(path.join(DOCS_DIR, 'icon-512.png'))
    ];

    await Promise.all(pngTasks);

    // og-image는 composite 필요해서 별도 처리
    const centerIcon = await sharp(svgBuffer).resize(300, 300).png().toBuffer();
    await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: 15, g: 15, b: 30, alpha: 1 }
      }
    })
      .composite([{ input: centerIcon, gravity: 'center' }])
      .png()
      .toFile(path.join(DOCS_DIR, 'og-image.png'));

    console.log('Favicon PNG 생성 완료 (병렬 처리)');
  } catch (err) {
    console.error('Favicon PNG 생성 실패:', err.message);
  }
}

// 에셋 복사 (favicon + 이미지)
async function copyAssets(faviconChanged = false) {
  // AIScroll 전용 favicon.svg 복사
  const aiFaviconSrc = path.join(__dirname, 'ai-docs', 'favicon.svg');
  if (fs.existsSync(aiFaviconSrc)) {
    fs.copyFileSync(aiFaviconSrc, path.join(DOCS_DIR, 'favicon.svg'));
  }

  // manifest.json 복사
  const manifestSrc = path.join(__dirname, 'ai-docs', 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(DOCS_DIR, 'manifest.json'));
  }

  // ads.txt 복사
  const adsTxtSrc = path.join(__dirname, 'ai-docs', 'ads.txt');
  if (fs.existsSync(adsTxtSrc)) {
    fs.copyFileSync(adsTxtSrc, path.join(DOCS_DIR, 'ads.txt'));
  }

  // PNG 아이콘 생성 (sharp 사용, favicon 변경 시에만)
  await generateFaviconPNGs(faviconChanged);

  // tech/ai 이미지 복사
  const techAiImagesSrc = path.join(__dirname, 'docs', 'assets', 'images', 'tech', 'ai');
  const techAiImagesDest = path.join(DOCS_DIR, 'assets', 'images', 'tech', 'ai');
  if (fs.existsSync(techAiImagesSrc)) {
    copyDirRecursive(techAiImagesSrc, techAiImagesDest);
    console.log('tech/ai 이미지 복사 완료');
  }

  // tech/vibecoding 이미지 복사
  const techVibeCodingImagesSrc = path.join(__dirname, 'docs', 'assets', 'images', 'tech', 'vibecoding');
  const techVibeCodingImagesDest = path.join(DOCS_DIR, 'assets', 'images', 'tech', 'vibecoding');
  if (fs.existsSync(techVibeCodingImagesSrc)) {
    copyDirRecursive(techVibeCodingImagesSrc, techVibeCodingImagesDest);
    console.log('tech/vibecoding 이미지 복사 완료');
  }

  // issue 이미지 복사 (isGlobal 기사용)
  const issueImagesSrc = path.join(__dirname, 'docs', 'assets', 'images', 'issue');
  const issueImagesDest = path.join(DOCS_DIR, 'assets', 'images', 'issue');
  if (fs.existsSync(issueImagesSrc)) {
    copyDirRecursive(issueImagesSrc, issueImagesDest);
    console.log('issue 이미지 복사 완료');
  }

  // hotpick 이미지 복사 (AIScroll 포함 hotpick 기사용)
  const hotpickImagesSrc = path.join(__dirname, 'docs', 'assets', 'images', 'hotpick');
  const hotpickImagesDest = path.join(DOCS_DIR, 'assets', 'images', 'hotpick');
  if (fs.existsSync(hotpickImagesSrc)) {
    copyDirRecursive(hotpickImagesSrc, hotpickImagesDest);
    console.log('hotpick 이미지 복사 완료');
  }

  // wiki 이미지 복사 (site === "aiscroll" 기사용)
  const wikiDataDir = path.join(__dirname, 'data', 'wiki');
  if (fs.existsSync(wikiDataDir)) {
    let wikiCopied = 0;
    for (const cat of fs.readdirSync(wikiDataDir)) {
      const catDir = path.join(wikiDataDir, cat);
      let stat;
      try { stat = fs.statSync(catDir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      for (const file of fs.readdirSync(catDir).filter(f => f.endsWith('.json'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(catDir, file), 'utf8').replace(/^\uFEFF/, ''));
          if (data.site !== 'aiscroll') continue;
          const slug = file.replace(/\.json$/, '');
          const wikiImageSrc = path.join(__dirname, 'docs', 'assets', 'images', 'wiki', cat, slug);
          const wikiImageDest = path.join(DOCS_DIR, 'assets', 'images', 'wiki', cat, slug);
          if (fs.existsSync(wikiImageSrc)) {
            copyDirRecursive(wikiImageSrc, wikiImageDest);
            wikiCopied++;
          }
        } catch (e) {}
      }
    }
    if (wikiCopied > 0) console.log(`wiki 이미지 복사 완료 (${wikiCopied}개)`);
  }

  // tech/ai 기사 폴더 내 이미지 복사 (상대경로 이미지 지원)
  const techAiSrcDir = path.join(__dirname, 'docs', 'tech', 'ai');
  if (fs.existsSync(techAiSrcDir)) {
    const slugDirs = fs.readdirSync(techAiSrcDir).filter(f =>
      fs.statSync(path.join(techAiSrcDir, f)).isDirectory()
    );
    for (const slug of slugDirs) {
      const srcDir = path.join(techAiSrcDir, slug);
      // 이미지 확장자만 복사 (html 제외)
      const files = fs.readdirSync(srcDir).filter(f =>
        /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f)
      );
      if (files.length > 0) {
        // category 찾기 (기본 general)
        const jsonPath = path.join(__dirname, 'data', 'tech', 'ai', `${slug}.json`);
        let category = 'general';
        if (fs.existsSync(jsonPath)) {
          try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            category = data.category || 'general';
          } catch (e) {}
        }
        const destDir = path.join(DOCS_DIR, 'article', category, slug);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        for (const file of files) {
          fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        }
      }
    }
    console.log('기사 폴더 이미지 복사 완료');
  }

  console.log('에셋 복사 완료');
}

// === lang-aware helpers (Stage 2d) ===
const SITE_URL_CONST = 'https://aiscroll.io';

function langDir(lang) {
  return lang === 'ko' ? path.join(DOCS_DIR, 'ko') : DOCS_DIR;
}

function getAlternates(pagePath) {
  return {
    en: `${SITE_URL_CONST}${pagePath}`,
    ko: `${SITE_URL_CONST}/ko${pagePath}`
  };
}

function mapArticles(articles, lang) {
  const isKo = lang === 'ko';
  return articles.map(a => ({
    slug: a.slug,
    category: a.category || 'general',
    title: isKo ? (a.title || a.titleEn) : (a.titleEn || a.title),
    summary: isKo ? (a.summary || a.summaryEn) : (a.summaryEn || a.summary),
    content: isKo ? (a.content || a.contentEn) : (a.contentEn || a.content),
    keywords: isKo ? (a.keywords || a.keywordsEn) : (a.keywordsEn || a.keywords),
    thumbnail: resolveArticleThumbnail(a),
    date: a.date,
    sources: a.sources,
    relatedArticles: a.relatedArticles,
    relatedDocs: a.relatedDocs,
    toc: a.toc,
    _jsonFilePath: a._jsonFilePath
  }));
}

// HTML 생성
function generateHTML(articles, popularArticlesData = { articles: [] }) {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  for (const lang of ['en', 'ko']) {
    const baseDir = langDir(lang);
    fs.mkdirSync(baseDir, { recursive: true });
    const articleDir = path.join(baseDir, 'article');
    fs.mkdirSync(articleDir, { recursive: true });

    for (const cat of CATEGORIES) {
      const catDir = path.join(articleDir, cat);
      if (!fs.existsSync(catDir)) {
        fs.mkdirSync(catDir, { recursive: true });
      }
    }

    const langArticles = mapArticles(articles, lang);

    let popularArticles = [];
    if (popularArticlesData.articles && popularArticlesData.articles.length > 0) {
      popularArticles = popularArticlesData.articles
        .map(pa => {
          const article = langArticles.find(a => a.slug === pa.slug && a.category === pa.category);
          if (article) return { ...article, views: pa.views };
          return null;
        })
        .filter(Boolean)
        .slice(0, 10);
    }
    if (popularArticles.length === 0) {
      popularArticles = [...langArticles].slice(0, 10);
    }

    const latestArticles = [...langArticles]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    setGlobalSidebarArticles(popularArticles, latestArticles);

    const indexHtml = generateAIBlogIndex({
      articles: langArticles,
      popularArticles,
      latestArticles,
      lang,
      alternates: getAlternates('/')
    });
    fs.writeFileSync(path.join(baseDir, 'index.html'), indexHtml, 'utf8');
    console.log(`홈페이지 생성 완료 (${lang})`);

    for (const article of langArticles) {
      const articleHtml = generateAIBlogArticle(article, {
        popularArticles,
        latestArticles,
        allArticles: langArticles,
        lang,
        alternates: getAlternates(`/article/${article.category}/${article.slug}/`)
      });
      const articlePath = path.join(articleDir, article.category, article.slug);
      if (!fs.existsSync(articlePath)) {
        fs.mkdirSync(articlePath, { recursive: true });
      }
      fs.writeFileSync(path.join(articlePath, 'index.html'), articleHtml, 'utf8');
    }
    console.log(`글 ${langArticles.length}개 생성 완료 (${lang})`);

    const searchData = langArticles.map(a => ({
      slug: a.slug,
      title: a.title,
      thumbnail: a.thumbnail || '',
      category: a.category,
      date: a.date || '',
      summary: a.summary || ''
    }));
    fs.writeFileSync(path.join(baseDir, 'articles.json'), JSON.stringify(searchData), 'utf8');
    const searchIndexData = langArticles.map(a => ({
      slug: a.slug,
      title: a.title,
      titleLower: String(a.title || '').toLowerCase(),
      category: a.category
    }));
    fs.writeFileSync(path.join(baseDir, 'articles-search.json'), JSON.stringify(searchIndexData), 'utf8');
    console.log(`검색용 JSON 생성 완료 (${lang})`);

    generatePrivacyPage(lang);
    generateSearchPageFile(lang);
    generateCategoryPages(langArticles, popularArticles, latestArticles, lang);
  }
}

// Privacy Policy 페이지 생성
function generatePrivacyPage(lang = 'en') {
  const { wrapWithLayout } = require('./src/templates/ai-blog/index');
  const baseDir = langDir(lang);
  const isKo = lang === 'ko';

  const privacyContentEn = `
    <section class="home-section active" id="privacy">
      <article class="page-container issue-container">
        <div class="blog-card">
          <header class="blog-header">
            <h1 class="blog-title">Privacy Policy</h1>
            <div class="blog-meta">
              <time class="blog-date">Last updated: January 2026</time>
            </div>
          </header>
          <div class="blog-content">
            <h2 class="blog-heading">1. Information We Collect</h2>
            <p class="blog-paragraph">AI Scroll collects minimal information to provide and improve our services:</p>
            <p class="blog-paragraph">• <strong>Usage Data:</strong> We collect anonymous usage statistics such as pages visited, time spent on pages, and general traffic patterns.<br>• <strong>Cookies:</strong> We use essential cookies to ensure the website functions properly.</p>
            <h2 class="blog-heading">2. How We Use Information</h2>
            <p class="blog-paragraph">The information we collect is used to:</p>
            <p class="blog-paragraph">• Provide and maintain our service<br>• Improve user experience<br>• Analyze usage patterns to enhance content<br>• Ensure security and prevent abuse</p>
            <h2 class="blog-heading">3. Third-Party Services</h2>
            <p class="blog-paragraph">We may use third-party services that collect information:</p>
            <p class="blog-paragraph">• <strong>Analytics:</strong> To understand how visitors use our site<br>• <strong>Content Delivery Networks:</strong> To serve content efficiently<br>• <strong>Image Proxies:</strong> To optimize image loading</p>
            <h2 class="blog-heading">4. Data Retention</h2>
            <p class="blog-paragraph">We retain collected data only for as long as necessary to provide our services and comply with legal obligations.</p>
            <h2 class="blog-heading">5. Your Rights</h2>
            <p class="blog-paragraph">You have the right to:</p>
            <p class="blog-paragraph">• Access your personal data<br>• Request deletion of your data<br>• Opt-out of analytics tracking<br>• Contact us with privacy concerns</p>
            <h2 class="blog-heading">6. Contact</h2>
            <p class="blog-paragraph">For any privacy-related questions, please contact us through our website.</p>
            <h2 class="blog-heading">7. Changes to This Policy</h2>
            <p class="blog-paragraph">We may update this Privacy Policy from time to time. We will notify users of any material changes by posting the new policy on this page.</p>
          </div>
        </div>
      </article>
    </section>
  `;

  const privacyContentKo = `
    <section class="home-section active" id="privacy">
      <article class="page-container issue-container">
        <div class="blog-card">
          <header class="blog-header">
            <h1 class="blog-title">개인정보처리방침</h1>
            <div class="blog-meta">
              <time class="blog-date">최종 업데이트: 2026년 1월</time>
            </div>
          </header>
          <div class="blog-content">
            <h2 class="blog-heading">1. 수집하는 정보</h2>
            <p class="blog-paragraph">AIScroll은 서비스 제공과 개선을 위해 최소한의 정보만 수집합니다:</p>
            <p class="blog-paragraph">• <strong>이용 데이터:</strong> 방문 페이지, 체류 시간, 트래픽 패턴 같은 익명 통계.<br>• <strong>쿠키:</strong> 웹사이트의 정상 동작을 위한 필수 쿠키.</p>
            <h2 class="blog-heading">2. 정보 사용 목적</h2>
            <p class="blog-paragraph">수집한 정보는 다음 용도로 사용됩니다:</p>
            <p class="blog-paragraph">• 서비스 제공 및 유지<br>• 사용자 경험 개선<br>• 콘텐츠 향상을 위한 이용 패턴 분석<br>• 보안 확보 및 악용 방지</p>
            <h2 class="blog-heading">3. 제3자 서비스</h2>
            <p class="blog-paragraph">정보를 수집할 수 있는 제3자 서비스를 사용할 수 있습니다:</p>
            <p class="blog-paragraph">• <strong>분석:</strong> 사이트 이용 방식 이해<br>• <strong>콘텐츠 전달 네트워크:</strong> 효율적 콘텐츠 전달<br>• <strong>이미지 프록시:</strong> 이미지 로딩 최적화</p>
            <h2 class="blog-heading">4. 데이터 보관</h2>
            <p class="blog-paragraph">서비스 제공과 법적 의무 준수에 필요한 기간 동안만 수집된 데이터를 보관합니다.</p>
            <h2 class="blog-heading">5. 사용자 권리</h2>
            <p class="blog-paragraph">사용자는 다음 권리를 가집니다:</p>
            <p class="blog-paragraph">• 개인 데이터 접근<br>• 데이터 삭제 요청<br>• 분석 추적 옵트아웃<br>• 개인정보 관련 문의</p>
            <h2 class="blog-heading">6. 문의</h2>
            <p class="blog-paragraph">개인정보 관련 문의는 웹사이트를 통해 연락해 주세요.</p>
            <h2 class="blog-heading">7. 정책 변경</h2>
            <p class="blog-paragraph">본 개인정보처리방침은 수시로 업데이트될 수 있습니다. 중대한 변경 사항은 이 페이지에 새 정책을 게시하여 사용자에게 알립니다.</p>
          </div>
        </div>
      </article>
    </section>
  `;

  const privacyHtml = wrapWithLayout(isKo ? privacyContentKo : privacyContentEn, {
    title: isKo ? '개인정보처리방침 - AIScroll' : 'Privacy Policy - AI Scroll',
    description: isKo ? 'AIScroll 개인정보처리방침 - 데이터 수집, 사용, 사용자 권리에 관한 안내.' : 'AI Scroll Privacy Policy - Information about data collection, usage, and your rights.',
    keywords: isKo ? '개인정보처리방침, 데이터 보호, AIScroll' : 'privacy policy, data protection, AI Scroll',
    canonical: isKo ? 'https://aiscroll.io/ko/privacy/' : 'https://aiscroll.io/privacy/',
    lang,
    alternates: getAlternates('/privacy/')
  });

  const privacyDir = path.join(baseDir, 'privacy');
  if (!fs.existsSync(privacyDir)) {
    fs.mkdirSync(privacyDir, { recursive: true });
  }
  fs.writeFileSync(path.join(privacyDir, 'index.html'), privacyHtml, 'utf8');
  console.log(`Privacy Policy 페이지 생성 완료 (${lang})`);
}

// Search 페이지 생성
function generateSearchPageFile(lang = 'en') {
  const searchHtml = generateSearchPage(lang);
  const baseDir = langDir(lang);
  const searchDir = path.join(baseDir, 'search');
  if (!fs.existsSync(searchDir)) {
    fs.mkdirSync(searchDir, { recursive: true });
  }
  fs.writeFileSync(path.join(searchDir, 'index.html'), searchHtml, 'utf8');
  console.log(`Search 페이지 생성 완료 (${lang})`);
}

// 카테고리 페이지 생성
function generateCategoryPages(articles, popularArticles, latestArticles, lang = 'en') {
  const baseDir = langDir(lang);
  const labels = (I18N[lang] && I18N[lang].categoryLabels) ? I18N[lang].categoryLabels : I18N.en.categoryLabels;
  for (const [catId, catLabel] of Object.entries(labels)) {
    const catHtml = generateCategoryPage(catId, catLabel, articles, popularArticles, latestArticles, lang);
    const catDir = path.join(baseDir, 'article', catId);
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }
    fs.writeFileSync(path.join(catDir, 'index.html'), catHtml, 'utf8');
  }
  console.log(`카테고리 페이지 ${Object.keys(labels).length}개 생성 완료 (${lang})`);
}

// 이미지 검증 (누락 경고)
function validateImages(articles) {
  const warnings = [];
  const techAiDir = path.join(__dirname, 'docs', 'tech', 'ai');

  for (const article of articles) {
    const slug = article.slug;
    // 영문 콘텐츠 기준으로 체크 (실제 렌더링되는 것)
    const content = article.contentEn || article.content || [];

    for (const block of content) {
      if (block.type === 'image' && block.src) {
        const src = block.src;
        const isHttpUrl = src.startsWith('http');

        // 상대경로면 docs/tech/ai/{slug}/ 폴더에 파일 있는지 확인
        if (!isHttpUrl && src.startsWith('./')) {
          const filename = src.replace('./', '');
          const filePath = path.join(techAiDir, slug, filename);
          if (!fs.existsSync(filePath)) {
            warnings.push(`[${slug}] 이미지 파일 없음: ${filename}`);
          }
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  이미지 경고:');
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }
}

// PurgeCSS 동적 클래스 safelist (런타임 JS에서 classList.add/toggle/className으로 추가되는 클래스)
const PURGECSS_SAFELIST = {
  standard: [
    'active', 'loaded', 'open', 'hidden', 'expanded', 'collapsed',
    'fonts-loaded', 'nav-ready', 'thumb-fallback',
    'feed-top-spacer', 'ad-card', 'ad-card-scroll', 'adsbygoogle',
    'ads-disabled', 'deferred-css-pending', 'realtime',
    'search-hidden', 'is-open', 'is-hidden',
  ],
  deep: [/^search-/, /^is-/, /^has-/, /^ad-/],
  greedy: [],
};

// PurgeCSS: ai-docs/ 내 CSS 번들에서 미사용 CSS 제거
function toPurgeGlobPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function purgeCssInDocs(docsDir) {
  const bundles = [
    {
      css: path.join(docsDir, 'styles-core.css'),
      purgeCss: toPurgeGlobPath(path.join(docsDir, 'styles-core.css')),
      content: [toPurgeGlobPath(path.join(docsDir, '**', '*.html'))],
      label: 'styles-core.css',
    },
    {
      css: path.join(docsDir, 'styles-article.css'),
      purgeCss: toPurgeGlobPath(path.join(docsDir, 'styles-article.css')),
      content: [toPurgeGlobPath(path.join(docsDir, 'article', '**', '*.html'))],
      label: 'styles-article.css',
    },
  ];

  console.log('\n🧹 PurgeCSS 실행 중...');
  for (const bundle of bundles) {
    if (!fs.existsSync(bundle.css)) continue;
    const originalSize = Buffer.byteLength(fs.readFileSync(bundle.css), 'utf8');
    if (originalSize === 0) continue;

    try {
      const result = await new PurgeCSS().purge({
        content: bundle.content,
        css: [bundle.purgeCss],
        safelist: PURGECSS_SAFELIST,
        fontFace: true,
        keyframes: true,
        variables: true,
      });

      if (result.length > 0 && result[0].css) {
        fs.writeFileSync(bundle.css, result[0].css, 'utf8');
        const purgedSize = Buffer.byteLength(result[0].css, 'utf8');
        const reduction = ((1 - purgedSize / originalSize) * 100).toFixed(1);
        console.log(`  ✅ ${bundle.label}: ${(originalSize / 1024).toFixed(0)}KB → ${(purgedSize / 1024).toFixed(0)}KB (${reduction}% 감소)`);
      }
    } catch (e) {
      console.warn(`  ⚠️ PurgeCSS 실패 (${bundle.label}): ${e.message}`);
    }
  }
}

// 빌드 완료 메시지
function showBuildSummary() {
  console.log('\n빌드 완료! ai-docs/ 폴더에 생성됨');
  console.log('CloudFront에서 ai-docs/를 aiscroll.io로 연결하세요');
}

// 메인
async function main() {
  console.log('=== AIScroll 빌드 시작 ===\n');

  // 캐시 로드
  const cache = buildCache.loadCache();
  let needFullRebuild = false;

  // CSS/템플릿 변경 확인
  console.log('0. 변경 사항 확인 중...');
  const cssChanged = buildCache.checkCssChanged(cache);
  const templateChanged = buildCache.checkTemplateJsChanged(cache);
  const faviconChanged = buildCache.checkFaviconChanged(cache);

  if (cssChanged || templateChanged) {
    needFullRebuild = true;
    console.log('   → 전체 재빌드 필요');
  }

  // GA4 인기 기사 수집 (24시간 쿨타임)
  if (shouldFetchPopularArticles()) {
    console.log('   GA4 인기 기사 수집 중...');
    try {
      await savePopularArticles();
    } catch (err) {
      console.log(`   GA4 수집 실패: ${err.message}`);
    }
  }

  // 인기 기사 데이터 로드
  const popularArticlesData = loadPopularArticles();
  console.log(`   인기 기사 ${popularArticlesData.articles?.length || 0}개 로드됨\n`);

  // 1. 글 로드
  console.log('1. 글 로드 중...');
  const articles = loadArticles();
  console.log(`   ${articles.length}개 글 로드됨`);

  if (articles.length === 0) {
    console.log('빌드할 글이 없습니다.');
    return;
  }

  // 카테고리별 카운트 계산 및 글로벌 설정 (category 없는 기사는 general로 분류)
  const countByCategory = {
    general: articles.filter(a => a.category === 'general' || !a.category).length,
    openai: articles.filter(a => a.category === 'openai').length,
    google: articles.filter(a => a.category === 'google').length,
    anthropic: articles.filter(a => a.category === 'anthropic').length,
    vibecoding: articles.filter(a => a.category === 'vibecoding').length
  };
  setGlobalSidebarCounts(countByCategory);
  console.log(`   카테고리별: General(${countByCategory.general}), OpenAI(${countByCategory.openai}), Google(${countByCategory.google}), Anthropic(${countByCategory.anthropic}), VibeCoding(${countByCategory.vibecoding})`);

  // 기사 변경 확인
  const articleChanges = buildCache.checkArticlesChanged(cache, articles);
  const hasArticleChanges = articleChanges.changed.length > 0;

  if (!needFullRebuild && !hasArticleChanges && !faviconChanged) {
    console.log(`\n⚡ 변경 없음 - 빌드 스킵 (${articleChanges.unchanged.length}개 기사 캐시됨)`);
    buildCache.saveCache(cache);
    return;
  }

  if (hasArticleChanges && !needFullRebuild) {
    console.log(`   → ${articleChanges.changed.length}개 기사 변경됨`);
  }

  // 이미지 검증
  validateImages(articles);

  // 2. HTML 생성
  console.log('\n2. HTML 생성 중...');
  generateHTML(articles, popularArticlesData);

  // 2-1. GamerScroll 공통 코어 유틸 동기화
  console.log('\n2-1. Layout Core 동기화 중...');
  syncLayoutCoreAsset();

  // 2-2. 카드 deferred JSON 외부화 (초기 HTML 경량화)
  console.log('\n2-2. Deferred JSON 외부화 중...');
  externalizeDeferredJsonPayloads();

  // 3. 스타일 복사
  console.log('\n3. 스타일 복사 중...');
  copyStyles();
  removeStaleDocsFiles();

  // 4. 에셋 복사
  console.log('\n4. 에셋 복사 중...');
  await copyAssets(faviconChanged);

  // 5. SEO 파일 생성
  console.log('\n5. SEO 파일 생성 중...');
  generateSEOFiles(articles);

  // 6. PurgeCSS: 미사용 CSS 제거
  await purgeCssInDocs(DOCS_DIR);

  // 캐시 저장
  buildCache.saveCache(cache);

  // 7. 완료 메시지
  showBuildSummary();

  console.log('\n=== AIScroll 빌드 완료 ===');
}

// SEO 파일 생성 (sitemap, robots.txt, RSS)
function generateSEOFiles(articles) {
  const SITE_URL = 'https://aiscroll.io';
  const today = new Date().toISOString().split('T')[0];

  // === Stage 2e: dual-lang sitemap + ko rss ===
  const enArticles = mapArticles(articles, 'en').map(a => ({
    slug: a.slug, category: a.category || 'general', title: a.title, summary: a.summary, date: a.date, thumbnail: a.thumbnail
  }));
  const koArticles = mapArticles(articles, 'ko').map(a => ({
    slug: a.slug, category: a.category || 'general', title: a.title, summary: a.summary, date: a.date, thumbnail: a.thumbnail
  }));

  // 1. sitemap.xml — en/ko URL + hreflang alternates
  // 카테고리 인덱스는 실제 article category set에서 동적으로 생성 (ai-tools 같은 신규 카테고리 누락 방지).
  // 빈 articles 시에도 최소 인덱스(/, /privacy/)는 보장 — sitemap 미생성 방지.
  const activeCategories = new Set(enArticles.map(a => a.category || 'general'));
  if (activeCategories.size === 0) {
    console.warn('  ⚠ no articles found — sitemap will contain only home + privacy entries');
  }
  const baseSitemapPaths = [
    { path: '/', priority: '1.0' },
    { path: '/privacy/', priority: '0.3' },
    ...[...activeCategories].sort().map(cat => ({ path: `/article/${cat}/`, priority: '0.8' }))
  ];

  function makeAlternates(p) {
    return [
      `<xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}${p}"/>`,
      `<xhtml:link rel="alternate" hreflang="ko" href="${SITE_URL}/ko${p}"/>`,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${p}"/>`
    ].join('\n    ');
  }

  const sitemapEntries = [];
  for (const b of baseSitemapPaths) {
    const alts = makeAlternates(b.path);
    sitemapEntries.push({ loc: `${SITE_URL}${b.path}`, lastmod: today, priority: b.priority, alternates: alts });
    sitemapEntries.push({ loc: `${SITE_URL}/ko${b.path}`, lastmod: today, priority: b.priority, alternates: alts });
  }
  for (const article of enArticles) {
    const articleDate = article.date ? article.date.split('T')[0] : today;
    const p = `/article/${article.category}/${article.slug}/`;
    const alts = makeAlternates(p);
    sitemapEntries.push({ loc: `${SITE_URL}${p}`, lastmod: articleDate, priority: '0.7', alternates: alts });
    sitemapEntries.push({ loc: `${SITE_URL}/ko${p}`, lastmod: articleDate, priority: '0.7', alternates: alts });
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapEntries.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <priority>${p.priority}</priority>
    ${p.alternates}
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(DOCS_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
  console.log('sitemap.xml 생성 완료 (en+ko + hreflang)');

  // 2. robots.txt
  const robotsTxt = `# AIScroll robots.txt
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(DOCS_DIR, 'robots.txt'), robotsTxt, 'utf8');
  console.log('robots.txt 생성 완료');

  // 3a. RSS (en) — cap 200으로 상향 (현 131개, 성장 여지)
  const enRssItems = enArticles
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 200)
    .map(article => {
      const pubDate = new Date(article.date).toUTCString();
      const link = `${SITE_URL}/article/${article.category}/${article.slug}/`;
      return `    <item>
      <title><![CDATA[${article.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${article.summary}]]></description>
      <category><![CDATA[${article.category}]]></category>
    </item>`;
    });
  const enRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AIScroll - AI News & Insights</title>
    <link>${SITE_URL}</link>
    <description>Latest AI news, trends, and insights. Stay updated with the AI industry.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${enRssItems.join('\n')}
  </channel>
</rss>`;
  fs.writeFileSync(path.join(DOCS_DIR, 'rss.xml'), enRssXml, 'utf8');
  console.log(`RSS 피드 생성 완료 EN (${enRssItems.length}개)`);

  // 3b. RSS (ko) — cap 200으로 상향 (현 131개, 성장 여지)
  const koRssItems = koArticles
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 200)
    .map(article => {
      const pubDate = new Date(article.date).toUTCString();
      const link = `${SITE_URL}/ko/article/${article.category}/${article.slug}/`;
      return `    <item>
      <title><![CDATA[${article.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${article.summary}]]></description>
      <category><![CDATA[${article.category}]]></category>
    </item>`;
    });
  const koRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AIScroll - 최신 AI 뉴스와 인사이트</title>
    <link>${SITE_URL}/ko</link>
    <description>최신 AI 뉴스와 인사이트. AI 업계 동향을 빠르게 확인하세요.</description>
    <language>ko-kr</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/ko/rss.xml" rel="self" type="application/rss+xml"/>
${koRssItems.join('\n')}
  </channel>
</rss>`;
  const koDir = path.join(DOCS_DIR, 'ko');
  if (!fs.existsSync(koDir)) fs.mkdirSync(koDir, { recursive: true });
  fs.writeFileSync(path.join(koDir, 'rss.xml'), koRssXml, 'utf8');
  console.log(`RSS 피드 생성 완료 KO (${koRssItems.length}개)`);

  // 4. Service Worker 생성 (콘텐츠 해시 기반 버전)
  const swVersionHash = (() => {
    try {
      const parts = [];
      parts.push(buildLayoutCoreBundle());
      const styleFiles = ['styles-core.css', 'styles-article.css'];
      for (const file of styleFiles) {
        const stylesPath = path.join(DOCS_DIR, file);
        if (fs.existsSync(stylesPath)) {
          parts.push(fs.readFileSync(stylesPath, 'utf8'));
        }
      }
      const searchIndexPath = path.join(DOCS_DIR, 'articles-search.json');
      if (fs.existsSync(searchIndexPath)) {
        parts.push(fs.readFileSync(searchIndexPath, 'utf8'));
      }
      return crypto.createHash('md5').update(parts.join('\n')).digest('hex').slice(0, 12);
    } catch (_) {
      return 'v1';
    }
  })();

  const swContent = `const CACHE_NAME = 'aiscroll-${swVersionHash}';
const STATIC_CACHE = CACHE_NAME + '-static';
const RUNTIME_CACHE = CACHE_NAME + '-runtime';
const PRECACHE_URLS = [
  '/',
  '/styles-core.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/assets/layout-core.js'
];
const STATIC_EXT_RE = /\\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|json)$/i;

async function cachePut(cacheName, request, response) {
  if (!response || response.status !== 200) return response;
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl = '') {
  try {
    const response = await fetch(request);
    return cachePut(cacheName, request, response);
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isHtml = request.mode === 'navigate' || accept.includes('text/html');
  const isStatic = url.pathname.startsWith('/assets/') ||
    url.pathname === '/articles-search.json' ||
    STATIC_EXT_RE.test(url.pathname);

  if (isHtml) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, '/'));
    return;
  }

  if (isStatic) {
    // ?v= 쿼리 또는 hash-named 경로(/x.abcd1234.css)는 immutable → SWR 안전.
    // 그 외 unversioned 경로는 network-first로 신선도 우선 (build 직후 stale CSS/JS 방지).
    const isImmutable = url.searchParams.has('v') || /\\.[a-f0-9]{8,}\\./i.test(url.pathname);
    if (!isImmutable) {
      event.respondWith(networkFirst(request, STATIC_CACHE));
      return;
    }
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      const revalidate = fetch(request)
        .then((response) => cachePut(STATIC_CACHE, request, response))
        .catch(() => null);

      if (cached) {
        event.waitUntil(revalidate);
        return cached;
      }

      const fresh = await revalidate;
      if (fresh) return fresh;
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});
`;
  fs.writeFileSync(path.join(DOCS_DIR, 'service-worker.js'), swContent, 'utf8');
  console.log('Service Worker 생성 완료');
}

main().catch(console.error);
