/**
 * AIScroll 증분 빌드 캐시 모듈
 * - GamerScroll build-cache.js 패턴 적용
 * - 파일 해시 비교로 변경된 기사만 빌드
 * - CSS/템플릿/Favicon 변경 시 전체 재빌드
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const CACHE_FILE = '.ai-build-cache.json';

/**
 * 문자열/객체의 MD5 해시 계산
 */
function computeHash(data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

/**
 * 파일 내용의 해시 계산
 */
function computeFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return computeHash(content);
  } catch (e) {
    return null;
  }
}

/**
 * 캐시 파일 로드
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('  ⚠️  캐시 파일 로드 실패, 전체 빌드 진행');
  }
  return createEmptyCache();
}

/**
 * 빈 캐시 생성
 */
function createEmptyCache() {
  return {
    meta: {
      cssHash: null,
      templateJsHash: null,
      faviconSvgHash: null,
      lastBuild: null
    },
    articles: {}  // slug -> hash
  };
}

/**
 * 캐시 파일 저장
 */
function saveCache(cache) {
  cache.meta.lastBuild = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

/**
 * src/styles 폴더의 CSS 파일들 해시 계산
 */
function computeSourceCssHash() {
  const stylesDir = './src/styles';
  if (!fs.existsSync(stylesDir)) return null;

  const files = fs.readdirSync(stylesDir).filter(f => f.endsWith('.css')).sort();
  const hashes = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(stylesDir, file), 'utf8');
    hashes.push(`${file}:${computeHash(content)}`);
  }
  return computeHash(hashes.join('|'));
}

/**
 * src/templates 폴더의 JS 파일들 해시 계산 (재귀)
 * AIScroll도 공통 광고/레이아웃 템플릿을 공유하므로 전체 템플릿 변경을 감지한다.
 */
function computeTemplateJsHash() {
  const templatesDir = './src/templates';
  if (!fs.existsSync(templatesDir)) return null;

  const hashes = [];

  function scanDir(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (item.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        hashes.push(`${fullPath}:${computeHash(content)}`);
      }
    }
  }

  scanDir(templatesDir);
  return computeHash(hashes.sort().join('|'));
}

/**
 * Favicon SVG 해시 계산
 */
function computeFaviconHash() {
  const faviconPath = './ai-docs/favicon.svg';
  return computeFileHash(faviconPath);
}

/**
 * CSS 변경 여부 확인
 */
function checkCssChanged(cache) {
  const currentHash = computeSourceCssHash();
  if (cache.meta.cssHash !== currentHash) {
    console.log(`  🎨 CSS 변경 감지`);
    cache.meta.cssHash = currentHash;
    return true;
  }
  return false;
}

/**
 * 템플릿 JS 변경 여부 확인
 */
function checkTemplateJsChanged(cache) {
  const currentHash = computeTemplateJsHash();
  if (cache.meta.templateJsHash !== currentHash) {
    console.log(`  📝 템플릿 JS 변경 감지`);
    cache.meta.templateJsHash = currentHash;
    return true;
  }
  return false;
}

/**
 * Favicon SVG 변경 여부 확인
 */
function checkFaviconChanged(cache) {
  const currentHash = computeFaviconHash();
  if (cache.meta.faviconSvgHash !== currentHash) {
    console.log(`  🎨 Favicon SVG 변경 감지`);
    cache.meta.faviconSvgHash = currentHash;
    return true;
  }
  return false;
}

/**
 * 기사 변경 확인
 * @returns {Object} { changed: [slugs], unchanged: [slugs], all: [slugs] }
 */
function checkArticlesChanged(cache, articles) {
  const result = { changed: [], unchanged: [], all: [] };

  for (const article of articles) {
    const slug = article.slug;
    if (!slug) continue;

    result.all.push(slug);
    const currentHash = computeHash(article);
    const cachedHash = cache.articles[slug];

    if (!cachedHash || cachedHash !== currentHash) {
      result.changed.push(slug);
      cache.articles[slug] = currentHash;
    } else {
      result.unchanged.push(slug);
    }
  }

  return result;
}

/**
 * 기사 캐시 업데이트
 */
function updateArticleCache(cache, slug, article) {
  cache.articles[slug] = computeHash(article);
}

/**
 * 빌드 통계 출력
 */
function printBuildStats(stats) {
  const { total, built, skipped, type } = stats;
  if (skipped > 0) {
    console.log(`  ✅ ${type} ${built}개 빌드, ${skipped}개 스킵 (총 ${total}개)`);
  } else {
    console.log(`  ✅ ${type} ${built}개 빌드`);
  }
}

module.exports = {
  computeHash,
  computeFileHash,
  loadCache,
  saveCache,
  createEmptyCache,
  checkCssChanged,
  checkTemplateJsChanged,
  checkFaviconChanged,
  checkArticlesChanged,
  updateArticleCache,
  printBuildStats
};
