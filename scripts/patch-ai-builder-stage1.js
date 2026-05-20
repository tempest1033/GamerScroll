/**
 * Re-apply Stage 1 patches to generate-ai-blog.js:
 *   - Remove EXTRA_ARTICLES whitelist (replaced by site:"aiscroll" invariant)
 *   - Simplify loadArticles to filter purely by site === "aiscroll"
 *   - Simplify wiki image copy to walk data/wiki and filter by site
 *
 * Idempotent, CRLF-preserving.
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.resolve(__dirname, '..', 'generate-ai-blog.js');
let src = fs.readFileSync(TARGET, 'utf8');
const original = src;
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const lf = t => t.replace(/\r?\n/g, EOL);

// ---- 1. Remove EXTRA_ARTICLES + leading comment ----
{
  const re = /\/\/ 추가로 가져올 기사 목록\r?\nconst EXTRA_ARTICLES = \{[\s\S]*?\};\r?\n\r?\n/;
  if (re.test(src)) {
    src = src.replace(re, '');
    console.log('patched: removed EXTRA_ARTICLES');
  } else {
    console.log('skipped: EXTRA_ARTICLES already removed');
  }
}

// ---- 2. Replace loadArticles function ----
{
  const startMarker = '// 글 데이터 로드';
  const newBody = lf(`// 글 데이터 로드: site === "aiscroll" 기사만 통과
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
        const content = fs.readFileSync(fullPath, 'utf8').replace(/^\\uFEFF/, '');
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
        console.error(\`로드 실패: \${file}\`, e.message);
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
          const content = fs.readFileSync(fullPath, 'utf8').replace(/^\\uFEFF/, '');
          const data = JSON.parse(content);
          if (data.site !== 'aiscroll') continue;
          const isValid = data.status === 'approved' || data.status === 'published' || (includeDrafts && data.status === 'draft');
          if (!isValid) continue;
          if (loadedSlugs.has(data.slug)) continue;
          articles.push({ ...data, source: \`wiki/\${cat}\`, sourceFile: file, _jsonFilePath: fullPath });
          loadedSlugs.add(data.slug);
        } catch (e) {
          console.error(\`로드 실패: \${file}\`, e.message);
        }
      }
    }
  }

  articles.sort((a, b) => (b.date || '9999-99-99').localeCompare(a.date || '9999-99-99'));

  return articles;
}`);

  const endMarker = '// 스타일 번들 생성';
  const lStart = src.indexOf(startMarker);
  const lEnd = src.indexOf(endMarker, lStart >= 0 ? lStart : 0);
  if (lStart < 0 || lEnd < 0 || lEnd <= lStart) {
    console.log('skipped: loadArticles markers not found');
  } else {
    const between = src.slice(lStart, lEnd);
    if (between.includes('EXTRA_ARTICLES')) {
      src = src.slice(0, lStart) + newBody + EOL + EOL + src.slice(lEnd);
      console.log('patched: loadArticles replaced');
    } else if (between.includes("data.site !== 'aiscroll'")) {
      console.log('skipped: loadArticles already simplified');
    } else {
      console.log('warning: loadArticles neither old nor new signature');
    }
  }
}

// ---- 3. Replace wiki image copy block ----
{
  const startMarker = '  // wiki 이미지 복사 (추가 목록용)';
  const endMarker = '  // tech/ai 기사 폴더 내 이미지 복사';
  const newBlock = lf(`  // wiki 이미지 복사 (site === "aiscroll" 기사용)
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
          const data = JSON.parse(fs.readFileSync(path.join(catDir, file), 'utf8').replace(/^\\uFEFF/, ''));
          if (data.site !== 'aiscroll') continue;
          const slug = file.replace(/\\.json$/, '');
          const wikiImageSrc = path.join(__dirname, 'docs', 'assets', 'images', 'wiki', cat, slug);
          const wikiImageDest = path.join(DOCS_DIR, 'assets', 'images', 'wiki', cat, slug);
          if (fs.existsSync(wikiImageSrc)) {
            copyDirRecursive(wikiImageSrc, wikiImageDest);
            wikiCopied++;
          }
        } catch (e) {}
      }
    }
    if (wikiCopied > 0) console.log(\`wiki 이미지 복사 완료 (\${wikiCopied}개)\`);
  }`);

  const wStart = src.indexOf(startMarker);
  const wEnd = src.indexOf(endMarker, wStart >= 0 ? wStart : 0);
  if (wStart < 0 || wEnd < 0 || wEnd <= wStart) {
    if (src.includes(`// wiki 이미지 복사 (site === "aiscroll" 기사용)`)) {
      console.log('skipped: wiki image copy already simplified');
    } else {
      console.log('skipped: wiki image copy markers not found');
    }
  } else {
    src = src.slice(0, wStart) + newBlock + EOL + EOL + src.slice(wEnd);
    console.log('patched: wiki image copy replaced');
  }
}

if (src !== original) {
  fs.writeFileSync(TARGET, src, 'utf8');
  console.log('saved');
} else {
  console.log('no changes');
}
