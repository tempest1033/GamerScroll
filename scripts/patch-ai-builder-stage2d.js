/**
 * Stage 2d: generate-ai-blog.js — main build flow lang loop + ko privacy/search/category.
 *
 * Patches:
 *   1. Extend index.js require import with I18N + langPrefixOf.
 *   2. Insert helpers (SITE_URL_CONST, langDir, getAlternates, mapArticles) above generateHTML.
 *   3. Replace generateHTML body with lang loop.
 *   4. Replace generatePrivacyPage with lang-aware version + Korean body.
 *   5. Replace generateSearchPageFile with lang-aware version.
 *   6. Replace generateCategoryPages with lang-aware version using I18N labels.
 *
 * CRLF preserved. Idempotent.
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(__dirname, '..', 'generate-ai-blog.js');
let src = fs.readFileSync(TARGET, 'utf8');
const original = src;
const NL = src.includes('\r\n') ? '\r\n' : '\n';

let failures = 0;
const log = (m) => console.log(m);
const fail = (m) => { console.error(m); failures++; };

function tryReplace(label, before, after) {
  if (src.includes(after) && !src.includes(before)) { log(`skipped: ${label} (already)`); return; }
  if (src.includes(before)) { src = src.replace(before, after); log(`patched: ${label}`); }
  else { fail(`FAIL: ${label} anchor not found`); }
}

function replaceBlock(label, startMarker, endMarker, newBody, alreadyMarker) {
  if (alreadyMarker && src.includes(alreadyMarker)) { log(`skipped: ${label} (already, found marker)`); return; }
  const s = src.indexOf(startMarker);
  if (s < 0) { fail(`FAIL: ${label} start marker not found`); return; }
  const e = src.indexOf(endMarker, s + startMarker.length);
  if (e < 0) { fail(`FAIL: ${label} end marker not found after start`); return; }
  src = src.slice(0, s) + newBody + src.slice(e);
  log(`patched: ${label} (block replace, ${e - s} bytes → ${newBody.length} bytes)`);
}

// ---- 1. Extend require import ----
tryReplace('require import',
  "const { generateAIBlogIndex, generateSearchPage, generateCategoryPage, setGlobalSidebarCounts, setGlobalSidebarArticles } = require('./src/templates/ai-blog/index');",
  "const { generateAIBlogIndex, generateSearchPage, generateCategoryPage, setGlobalSidebarCounts, setGlobalSidebarArticles, I18N, langPrefixOf } = require('./src/templates/ai-blog/index');"
);

// ---- 2. Insert helpers before generateHTML ----
// anchor: lines just before "// HTML 생성"
const helpersMarker = '// HTML 생성';
const helpersBody = [
  '// === lang-aware helpers (Stage 2d) ===',
  "const SITE_URL_CONST = 'https://aiscroll.io';",
  '',
  'function langDir(lang) {',
  "  return lang === 'ko' ? path.join(DOCS_DIR, 'ko') : DOCS_DIR;",
  '}',
  '',
  'function getAlternates(pagePath) {',
  '  return {',
  '    en: `${SITE_URL_CONST}${pagePath}`,',
  '    ko: `${SITE_URL_CONST}/ko${pagePath}`',
  '  };',
  '}',
  '',
  'function mapArticles(articles, lang) {',
  "  const isKo = lang === 'ko';",
  '  return articles.map(a => ({',
  '    slug: a.slug,',
  "    category: a.category || 'general',",
  '    title: isKo ? (a.title || a.titleEn) : (a.titleEn || a.title),',
  '    summary: isKo ? (a.summary || a.summaryEn) : (a.summaryEn || a.summary),',
  '    content: isKo ? (a.content || a.contentEn) : (a.contentEn || a.content),',
  '    keywords: isKo ? (a.keywords || a.keywordsEn) : (a.keywordsEn || a.keywords),',
  '    thumbnail: resolveArticleThumbnail(a),',
  '    date: a.date,',
  '    sources: a.sources,',
  '    relatedArticles: a.relatedArticles,',
  '    relatedDocs: a.relatedDocs,',
  '    toc: a.toc,',
  '    _jsonFilePath: a._jsonFilePath',
  '  }));',
  '}',
  '',
  '// HTML 생성'
].join(NL);

if (src.includes('// === lang-aware helpers (Stage 2d) ===')) {
  log('skipped: helpers (already)');
} else if (src.includes(helpersMarker)) {
  src = src.replace(helpersMarker, helpersBody);
  log('patched: helpers (mapArticles/langDir/getAlternates/SITE_URL_CONST)');
} else {
  fail('FAIL: helpers anchor "// HTML 생성" not found');
}

// ---- 3. Replace generateHTML body ----
const genHtmlStart = 'function generateHTML(articles, popularArticlesData = { articles: [] }) {';
const genHtmlEnd = NL + '// Privacy Policy 페이지 생성';

const newGenHtml = [
  'function generateHTML(articles, popularArticlesData = { articles: [] }) {',
  '  if (!fs.existsSync(DOCS_DIR)) {',
  '    fs.mkdirSync(DOCS_DIR, { recursive: true });',
  '  }',
  '',
  "  for (const lang of ['en', 'ko']) {",
  '    const baseDir = langDir(lang);',
  '    fs.mkdirSync(baseDir, { recursive: true });',
  "    const articleDir = path.join(baseDir, 'article');",
  '    fs.mkdirSync(articleDir, { recursive: true });',
  '',
  '    for (const cat of CATEGORIES) {',
  '      const catDir = path.join(articleDir, cat);',
  '      if (!fs.existsSync(catDir)) {',
  '        fs.mkdirSync(catDir, { recursive: true });',
  '      }',
  '    }',
  '',
  '    const langArticles = mapArticles(articles, lang);',
  '',
  '    let popularArticles = [];',
  '    if (popularArticlesData.articles && popularArticlesData.articles.length > 0) {',
  '      popularArticles = popularArticlesData.articles',
  '        .map(pa => {',
  '          const article = langArticles.find(a => a.slug === pa.slug && a.category === pa.category);',
  '          if (article) return { ...article, views: pa.views };',
  '          return null;',
  '        })',
  '        .filter(Boolean)',
  '        .slice(0, 10);',
  '    }',
  '    if (popularArticles.length === 0) {',
  '      popularArticles = [...langArticles].slice(0, 10);',
  '    }',
  '',
  '    const latestArticles = [...langArticles]',
  '      .sort((a, b) => new Date(b.date) - new Date(a.date))',
  '      .slice(0, 10);',
  '',
  '    setGlobalSidebarArticles(popularArticles, latestArticles);',
  '',
  '    const indexHtml = generateAIBlogIndex({',
  '      articles: langArticles,',
  '      popularArticles,',
  '      latestArticles,',
  '      lang,',
  "      alternates: getAlternates('/')",
  '    });',
  "    fs.writeFileSync(path.join(baseDir, 'index.html'), indexHtml, 'utf8');",
  '    console.log(`홈페이지 생성 완료 (${lang})`);',
  '',
  '    for (const article of langArticles) {',
  '      const articleHtml = generateAIBlogArticle(article, {',
  '        popularArticles,',
  '        latestArticles,',
  '        allArticles: langArticles,',
  '        lang,',
  '        alternates: getAlternates(`/article/${article.category}/${article.slug}/`)',
  '      });',
  '      const articlePath = path.join(articleDir, article.category, article.slug);',
  '      if (!fs.existsSync(articlePath)) {',
  '        fs.mkdirSync(articlePath, { recursive: true });',
  '      }',
  "      fs.writeFileSync(path.join(articlePath, 'index.html'), articleHtml, 'utf8');",
  '    }',
  '    console.log(`글 ${langArticles.length}개 생성 완료 (${lang})`);',
  '',
  '    const searchData = langArticles.map(a => ({',
  '      slug: a.slug,',
  '      title: a.title,',
  "      thumbnail: a.thumbnail || '',",
  '      category: a.category,',
  "      date: a.date || '',",
  "      summary: a.summary || ''",
  '    }));',
  "    fs.writeFileSync(path.join(baseDir, 'articles.json'), JSON.stringify(searchData), 'utf8');",
  '    const searchIndexData = langArticles.map(a => ({',
  '      slug: a.slug,',
  '      title: a.title,',
  "      titleLower: String(a.title || '').toLowerCase(),",
  '      category: a.category',
  '    }));',
  "    fs.writeFileSync(path.join(baseDir, 'articles-search.json'), JSON.stringify(searchIndexData), 'utf8');",
  '    console.log(`검색용 JSON 생성 완료 (${lang})`);',
  '',
  '    generatePrivacyPage(lang);',
  '    generateSearchPageFile(lang);',
  '    generateCategoryPages(langArticles, popularArticles, latestArticles, lang);',
  '  }',
  '}',
  ''
].join(NL);

replaceBlock('generateHTML body',
  genHtmlStart,
  genHtmlEnd,
  newGenHtml,
  "for (const lang of ['en', 'ko'])"
);

// ---- 4. Replace generatePrivacyPage ----
const privStart = 'function generatePrivacyPage() {';
const privStartNew = "function generatePrivacyPage(lang = 'en') {";
const privEnd = NL + '// Search 페이지 생성';

const newPriv = [
  "function generatePrivacyPage(lang = 'en') {",
  "  const { wrapWithLayout } = require('./src/templates/ai-blog/index');",
  '  const baseDir = langDir(lang);',
  "  const isKo = lang === 'ko';",
  '',
  '  const privacyContentEn = `',
  '    <section class="home-section active" id="privacy">',
  '      <article class="page-container issue-container">',
  '        <div class="blog-card">',
  '          <header class="blog-header">',
  '            <h1 class="blog-title">Privacy Policy</h1>',
  '            <div class="blog-meta">',
  '              <time class="blog-date">Last updated: January 2026</time>',
  '            </div>',
  '          </header>',
  '          <div class="blog-content">',
  '            <h2 class="blog-heading">1. Information We Collect</h2>',
  '            <p class="blog-paragraph">AI Scroll collects minimal information to provide and improve our services:</p>',
  '            <p class="blog-paragraph">• <strong>Usage Data:</strong> We collect anonymous usage statistics such as pages visited, time spent on pages, and general traffic patterns.<br>• <strong>Cookies:</strong> We use essential cookies to ensure the website functions properly.</p>',
  '            <h2 class="blog-heading">2. How We Use Information</h2>',
  '            <p class="blog-paragraph">The information we collect is used to:</p>',
  '            <p class="blog-paragraph">• Provide and maintain our service<br>• Improve user experience<br>• Analyze usage patterns to enhance content<br>• Ensure security and prevent abuse</p>',
  '            <h2 class="blog-heading">3. Third-Party Services</h2>',
  '            <p class="blog-paragraph">We may use third-party services that collect information:</p>',
  '            <p class="blog-paragraph">• <strong>Analytics:</strong> To understand how visitors use our site<br>• <strong>Content Delivery Networks:</strong> To serve content efficiently<br>• <strong>Image Proxies:</strong> To optimize image loading</p>',
  '            <h2 class="blog-heading">4. Data Retention</h2>',
  '            <p class="blog-paragraph">We retain collected data only for as long as necessary to provide our services and comply with legal obligations.</p>',
  '            <h2 class="blog-heading">5. Your Rights</h2>',
  '            <p class="blog-paragraph">You have the right to:</p>',
  '            <p class="blog-paragraph">• Access your personal data<br>• Request deletion of your data<br>• Opt-out of analytics tracking<br>• Contact us with privacy concerns</p>',
  '            <h2 class="blog-heading">6. Contact</h2>',
  '            <p class="blog-paragraph">For any privacy-related questions, please contact us through our website.</p>',
  '            <h2 class="blog-heading">7. Changes to This Policy</h2>',
  '            <p class="blog-paragraph">We may update this Privacy Policy from time to time. We will notify users of any material changes by posting the new policy on this page.</p>',
  '          </div>',
  '        </div>',
  '      </article>',
  '    </section>',
  '  `;',
  '',
  '  const privacyContentKo = `',
  '    <section class="home-section active" id="privacy">',
  '      <article class="page-container issue-container">',
  '        <div class="blog-card">',
  '          <header class="blog-header">',
  '            <h1 class="blog-title">개인정보처리방침</h1>',
  '            <div class="blog-meta">',
  '              <time class="blog-date">최종 업데이트: 2026년 1월</time>',
  '            </div>',
  '          </header>',
  '          <div class="blog-content">',
  '            <h2 class="blog-heading">1. 수집하는 정보</h2>',
  '            <p class="blog-paragraph">AIScroll은 서비스 제공과 개선을 위해 최소한의 정보만 수집합니다:</p>',
  '            <p class="blog-paragraph">• <strong>이용 데이터:</strong> 방문 페이지, 체류 시간, 트래픽 패턴 같은 익명 통계.<br>• <strong>쿠키:</strong> 웹사이트의 정상 동작을 위한 필수 쿠키.</p>',
  '            <h2 class="blog-heading">2. 정보 사용 목적</h2>',
  '            <p class="blog-paragraph">수집한 정보는 다음 용도로 사용됩니다:</p>',
  '            <p class="blog-paragraph">• 서비스 제공 및 유지<br>• 사용자 경험 개선<br>• 콘텐츠 향상을 위한 이용 패턴 분석<br>• 보안 확보 및 악용 방지</p>',
  '            <h2 class="blog-heading">3. 제3자 서비스</h2>',
  '            <p class="blog-paragraph">정보를 수집할 수 있는 제3자 서비스를 사용할 수 있습니다:</p>',
  '            <p class="blog-paragraph">• <strong>분석:</strong> 사이트 이용 방식 이해<br>• <strong>콘텐츠 전달 네트워크:</strong> 효율적 콘텐츠 전달<br>• <strong>이미지 프록시:</strong> 이미지 로딩 최적화</p>',
  '            <h2 class="blog-heading">4. 데이터 보관</h2>',
  '            <p class="blog-paragraph">서비스 제공과 법적 의무 준수에 필요한 기간 동안만 수집된 데이터를 보관합니다.</p>',
  '            <h2 class="blog-heading">5. 사용자 권리</h2>',
  '            <p class="blog-paragraph">사용자는 다음 권리를 가집니다:</p>',
  '            <p class="blog-paragraph">• 개인 데이터 접근<br>• 데이터 삭제 요청<br>• 분석 추적 옵트아웃<br>• 개인정보 관련 문의</p>',
  '            <h2 class="blog-heading">6. 문의</h2>',
  '            <p class="blog-paragraph">개인정보 관련 문의는 웹사이트를 통해 연락해 주세요.</p>',
  '            <h2 class="blog-heading">7. 정책 변경</h2>',
  '            <p class="blog-paragraph">본 개인정보처리방침은 수시로 업데이트될 수 있습니다. 중대한 변경 사항은 이 페이지에 새 정책을 게시하여 사용자에게 알립니다.</p>',
  '          </div>',
  '        </div>',
  '      </article>',
  '    </section>',
  '  `;',
  '',
  '  const privacyHtml = wrapWithLayout(isKo ? privacyContentKo : privacyContentEn, {',
  "    title: isKo ? '개인정보처리방침 - AIScroll' : 'Privacy Policy - AI Scroll',",
  "    description: isKo ? 'AIScroll 개인정보처리방침 - 데이터 수집, 사용, 사용자 권리에 관한 안내.' : 'AI Scroll Privacy Policy - Information about data collection, usage, and your rights.',",
  "    keywords: isKo ? '개인정보처리방침, 데이터 보호, AIScroll' : 'privacy policy, data protection, AI Scroll',",
  "    canonical: isKo ? 'https://aiscroll.io/ko/privacy/' : 'https://aiscroll.io/privacy/',",
  '    lang,',
  "    alternates: getAlternates('/privacy/')",
  '  });',
  '',
  "  const privacyDir = path.join(baseDir, 'privacy');",
  '  if (!fs.existsSync(privacyDir)) {',
  '    fs.mkdirSync(privacyDir, { recursive: true });',
  '  }',
  "  fs.writeFileSync(path.join(privacyDir, 'index.html'), privacyHtml, 'utf8');",
  '  console.log(`Privacy Policy 페이지 생성 완료 (${lang})`);',
  '}',
  ''
].join(NL);

replaceBlock('generatePrivacyPage',
  privStart,
  privEnd,
  newPriv,
  privStartNew
);

// ---- 5. Replace generateSearchPageFile ----
const searchStart = 'function generateSearchPageFile() {';
const searchStartNew = "function generateSearchPageFile(lang = 'en') {";
const searchEnd = NL + '// 카테고리 페이지 생성';

const newSearch = [
  "function generateSearchPageFile(lang = 'en') {",
  '  const searchHtml = generateSearchPage(lang);',
  '  const baseDir = langDir(lang);',
  "  const searchDir = path.join(baseDir, 'search');",
  '  if (!fs.existsSync(searchDir)) {',
  '    fs.mkdirSync(searchDir, { recursive: true });',
  '  }',
  "  fs.writeFileSync(path.join(searchDir, 'index.html'), searchHtml, 'utf8');",
  '  console.log(`Search 페이지 생성 완료 (${lang})`);',
  '}',
  ''
].join(NL);

replaceBlock('generateSearchPageFile',
  searchStart,
  searchEnd,
  newSearch,
  searchStartNew
);

// ---- 6. Replace generateCategoryPages ----
const catStart = 'function generateCategoryPages(articles, popularArticles, latestArticles) {';
const catStartNew = "function generateCategoryPages(articles, popularArticles, latestArticles, lang = 'en') {";
const catEnd = NL + '// 이미지 검증 (누락 경고)';

const newCat = [
  "function generateCategoryPages(articles, popularArticles, latestArticles, lang = 'en') {",
  '  const baseDir = langDir(lang);',
  '  const labels = (I18N[lang] && I18N[lang].categoryLabels) ? I18N[lang].categoryLabels : I18N.en.categoryLabels;',
  '  for (const [catId, catLabel] of Object.entries(labels)) {',
  '    const catHtml = generateCategoryPage(catId, catLabel, articles, popularArticles, latestArticles, lang);',
  "    const catDir = path.join(baseDir, 'article', catId);",
  '    if (!fs.existsSync(catDir)) {',
  '      fs.mkdirSync(catDir, { recursive: true });',
  '    }',
  "    fs.writeFileSync(path.join(catDir, 'index.html'), catHtml, 'utf8');",
  '  }',
  '  console.log(`카테고리 페이지 ${Object.keys(labels).length}개 생성 완료 (${lang})`);',
  '}',
  ''
].join(NL);

replaceBlock('generateCategoryPages',
  catStart,
  catEnd,
  newCat,
  catStartNew
);

if (failures > 0) {
  console.error(`${failures} patch(es) failed — not saving`);
  process.exit(1);
}

if (src !== original) {
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log('saved');
} else {
  console.log('no changes');
}
