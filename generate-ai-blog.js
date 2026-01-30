#!/usr/bin/env node
/**
 * AIScroll 빌드 스크립트
 *
 * 1. data/tech/ai/*.json 로드
 * 2. reports/issue/*.json에서 isGlobal: true 로드
 * 3. 영문 필드 없으면 Claude API로 번역
 * 4. 영문 HTML 생성
 * 5. AIScroll 저장소 docs/에 푸시
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// 템플릿
const { generateAIBlogIndex } = require('./src/templates/ai-blog/index');
const { generateAIBlogArticle } = require('./src/templates/ai-blog/article');

// 경로 설정
const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_DIR = path.join(__dirname, 'reports');
// GamerScroll 내 ai-docs/ 폴더에 빌드
const DOCS_DIR = path.join(__dirname, 'ai-docs');
const STYLES_SRC = path.join(__dirname, 'src', 'styles');

// Claude CLI로 번역
async function translateWithClaude(text, type = 'content') {
  const prompt = type === 'title'
    ? `Translate this title to English. Keep it concise and professional. Only output the translated title, nothing else:\n\n${text}`
    : `Translate this content to English. Maintain the same tone and style. Only output the translated content, nothing else:\n\n${text}`;

  const tmpFile = path.join(os.tmpdir(), `translate-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    const result = execSync(`cat "${tmpFile}" | claude -p - --model sonnet`, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 300000 // 5분
    });
    fs.unlinkSync(tmpFile);
    return result.trim();
  } catch (error) {
    console.error('번역 실패:', error.message);
    fs.unlinkSync(tmpFile);
    return text; // 실패 시 원문 반환
  }
}

// JSON 콘텐츠 번역
async function translateContent(content) {
  if (!content || !Array.isArray(content)) return content;

  const translated = [];
  for (const block of content) {
    if (block.type === 'text' || block.type === 'heading' || block.type === 'subheading' || block.type === 'quote') {
      const translatedValue = await translateWithClaude(block.value, block.type === 'heading' ? 'title' : 'content');
      translated.push({ ...block, value: translatedValue });
    } else if (block.type === 'table') {
      // 테이블 헤더/캡션 번역
      const translatedHeaders = block.headers ? await Promise.all(block.headers.map(h => translateWithClaude(h, 'title'))) : block.headers;
      const translatedCaption = block.caption ? await translateWithClaude(block.caption, 'title') : block.caption;
      translated.push({ ...block, headers: translatedHeaders, caption: translatedCaption });
    } else {
      translated.push(block);
    }
  }
  return translated;
}

// 글 데이터 로드
function loadArticles() {
  const articles = [];

  // 1. data/tech/ai/*.json 로드
  const techAiDir = path.join(DATA_DIR, 'tech', 'ai');
  if (fs.existsSync(techAiDir)) {
    const files = fs.readdirSync(techAiDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(techAiDir, file), 'utf8').replace(/^\uFEFF/, '');
        const data = JSON.parse(content);
        if (data.status === 'approved' || data.status === 'published') {
          articles.push({ ...data, source: 'tech/ai', sourceFile: file });
        }
      } catch (e) {
        console.error(`로드 실패: ${file}`, e.message);
      }
    }
  }

  // 2. reports/issue/*.json에서 isGlobal: true 로드
  const issueDir = path.join(REPORTS_DIR, 'issue');
  if (fs.existsSync(issueDir)) {
    const files = fs.readdirSync(issueDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(issueDir, file), 'utf8').replace(/^\uFEFF/, '');
        const data = JSON.parse(content);
        if (data.isGlobal === true && (data.status === 'approved' || data.status === 'published')) {
          articles.push({ ...data, source: 'issue', sourceFile: file });
        }
      } catch (e) {
        console.error(`로드 실패: ${file}`, e.message);
      }
    }
  }

  // 날짜순 정렬 (최신순)
  articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return articles;
}

// 번역 필요 여부 확인 및 번역
async function ensureTranslation(article) {
  // 이미 영문 필드가 있으면 스킵
  if (article.titleEn && article.contentEn) {
    return article;
  }

  console.log(`번역 중: ${article.title}`);

  // 제목 번역
  if (!article.titleEn) {
    article.titleEn = await translateWithClaude(article.title, 'title');
  }

  // 요약 번역
  if (article.summary && !article.summaryEn) {
    article.summaryEn = await translateWithClaude(article.summary, 'content');
  }

  // 본문 번역
  if (article.content && !article.contentEn) {
    article.contentEn = await translateContent(article.content);
  }

  // 원본 파일에 저장 (다음 빌드 시 스킵)
  saveTranslation(article);

  return article;
}

// 번역 결과 저장
function saveTranslation(article) {
  let filePath;
  if (article.source === 'tech/ai') {
    filePath = path.join(DATA_DIR, 'tech', 'ai', article.sourceFile);
  } else if (article.source === 'issue') {
    filePath = path.join(REPORTS_DIR, 'issue', article.sourceFile);
  }

  if (filePath && fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(content);
    data.titleEn = article.titleEn;
    data.summaryEn = article.summaryEn;
    data.contentEn = article.contentEn;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`저장됨: ${article.sourceFile}`);
  }
}

// 스타일 복사
function copyStyles() {
  // GamerScroll 스타일 파일들 합치기
  const styleFiles = fs.readdirSync(STYLES_SRC)
    .filter(f => f.endsWith('.css'))
    .sort(); // 파일명 순서대로 (00-, 01-, 10- 등)

  let combinedCss = '';
  for (const file of styleFiles) {
    const content = fs.readFileSync(path.join(STYLES_SRC, file), 'utf8');
    combinedCss += `/* ${file} */\n${content}\n\n`;
  }

  // AIScroll 전용 오버라이드 추가
  combinedCss += `
/* AIScroll Overrides */
.site-header {
  text-align: center;
  padding: 24px 16px;
}

.site-logo {
  display: inline-flex;
  justify-content: center;
}

.logo-svg {
  height: 28px;
  width: auto;
}

.search-bar-wrapper {
  max-width: 600px;
  margin: 0 auto 24px;
  padding: 0 16px;
}

.search-container {
  position: relative;
}

.search-box {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 4px;
  max-height: 300px;
  overflow-y: auto;
  display: none;
  z-index: 100;
}

.search-dropdown.active {
  display: block;
}

.search-result-item {
  display: block;
  padding: 12px 16px;
  text-decoration: none;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
}

.search-result-item:hover {
  background: var(--bg-hover);
}

.search-result-item:last-child {
  border-bottom: none;
}

.site-footer {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-secondary);
  font-size: 12px;
}
`;

  fs.writeFileSync(path.join(DOCS_DIR, 'styles.css'), combinedCss, 'utf8');
  console.log('스타일 복사 완료');
}

// favicon 복사
function copyAssets() {
  // favicon
  const faviconSrc = path.join(__dirname, 'docs', 'favicon.svg');
  if (fs.existsSync(faviconSrc)) {
    fs.copyFileSync(faviconSrc, path.join(DOCS_DIR, 'favicon.svg'));
  } else {
    // 기본 favicon 생성
    const defaultFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#6366f1">
      <text x="4" y="18" font-family="system-ui" font-size="16" font-weight="bold">AI</text>
    </svg>`;
    fs.writeFileSync(path.join(DOCS_DIR, 'favicon.svg'), defaultFavicon, 'utf8');
  }
  console.log('에셋 복사 완료');
}

// HTML 생성
function generateHTML(articles) {
  // docs 폴더 초기화
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  // article 폴더 생성
  const articleDir = path.join(DOCS_DIR, 'article');
  if (!fs.existsSync(articleDir)) {
    fs.mkdirSync(articleDir, { recursive: true });
  }

  // 영문 데이터로 변환
  const enArticles = articles.map(a => ({
    slug: a.slug,
    title: a.titleEn || a.title,
    summary: a.summaryEn || a.summary,
    content: a.contentEn || a.content,
    thumbnail: a.thumbnail,
    date: a.date,
    keywords: a.keywords,
    sources: a.sources,
    relatedArticles: a.relatedArticles
  }));

  // 인기/최신 글 (임시로 같은 데이터 사용)
  const popularArticles = [...enArticles].slice(0, 10);
  const latestArticles = [...enArticles].slice(0, 10);

  // 홈페이지 생성
  const indexHtml = generateAIBlogIndex({
    articles: enArticles,
    popularArticles,
    latestArticles
  });
  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), indexHtml, 'utf8');
  console.log('홈페이지 생성 완료');

  // 개별 글 페이지 생성
  for (const article of enArticles) {
    const articleHtml = generateAIBlogArticle(article, { popularArticles, latestArticles });
    const articlePath = path.join(articleDir, article.slug);
    if (!fs.existsSync(articlePath)) {
      fs.mkdirSync(articlePath, { recursive: true });
    }
    fs.writeFileSync(path.join(articlePath, 'index.html'), articleHtml, 'utf8');
  }
  console.log(`글 ${enArticles.length}개 생성 완료`);
}

// 빌드 완료 메시지
function showBuildSummary() {
  console.log('\n빌드 완료! ai-docs/ 폴더에 생성됨');
  console.log('CloudFront에서 ai-docs/를 aiscroll.io로 연결하세요');
}

// 메인
async function main() {
  console.log('=== AIScroll 빌드 시작 ===\n');

  // 1. 글 로드
  console.log('1. 글 로드 중...');
  const articles = loadArticles();
  console.log(`   ${articles.length}개 글 로드됨\n`);

  if (articles.length === 0) {
    console.log('빌드할 글이 없습니다.');
    return;
  }

  // 2. 번역 (--skip-translate 옵션으로 스킵 가능)
  const skipTranslate = process.argv.includes('--skip-translate');
  if (!skipTranslate) {
    console.log('2. 번역 확인 중...');
    for (const article of articles) {
      await ensureTranslation(article);
    }
    console.log('   번역 완료\n');
  } else {
    console.log('2. 번역 스킵\n');
  }

  // 3. HTML 생성
  console.log('3. HTML 생성 중...');
  generateHTML(articles);
  console.log('');

  // 4. 스타일 복사
  console.log('4. 스타일 복사 중...');
  copyStyles();
  console.log('');

  // 5. 에셋 복사
  console.log('5. 에셋 복사 중...');
  copyAssets();
  console.log('');

  // 6. 완료 메시지
  showBuildSummary();

  console.log('\n=== AIScroll 빌드 완료 ===');
}

main().catch(console.error);
