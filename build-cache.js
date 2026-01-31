/**
 * GamerScroll 증분 빌드 캐시 모듈
 * - 파일 해시 비교로 변경된 파일만 빌드
 * - CSS/템플릿 변경 시 전체 재빌드
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const CACHE_FILE = '.build-cache.json';
const TEMPLATE_VERSION = '1.0'; // 템플릿 구조 변경 시 버전업

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
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      return data;
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
      templateVersion: TEMPLATE_VERSION,
      lastBuild: null
    },
    games: {},      // slug -> hash
    wiki: {},       // category/slug -> hash
    tech: {},       // category/slug -> hash
    issues: {},     // slug -> hash
    insights: {},   // slug -> hash
    hotpicks: {},   // slug -> hash
    rankings: {},   // slug -> hash
    daily: {},      // date -> hash
    weekly: {}      // weekId -> hash
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
 * 템플릿 JS 파일 변경 여부 확인
 * @returns {boolean} true면 전체 재빌드 필요
 */
function checkTemplateJsChanged(cache) {
  const currentHash = computeTemplateJsHash();
  if (cache.meta.templateJsHash !== currentHash) {
    console.log(`  📝 템플릿 JS 변경 감지 (${cache.meta.templateJsHash?.slice(0,6) || 'null'} → ${currentHash?.slice(0,6)})`);
    cache.meta.templateJsHash = currentHash;
    return true;
  }
  return false;
}

/**
 * CSS 해시 변경 여부 확인
 * @returns {boolean} true면 전체 재빌드 필요
 */
function checkCssChanged(cache, currentCssHash) {
  // src/styles 원본 파일 기준 해시 비교 (번들 해시와 별도)
  const sourceCssHash = computeSourceCssHash();
  if (cache.meta.sourceCssHash !== sourceCssHash) {
    console.log(`  🎨 CSS 소스 변경 감지 (${cache.meta.sourceCssHash?.slice(0,6) || 'null'} → ${sourceCssHash?.slice(0,6)})`);
    cache.meta.sourceCssHash = sourceCssHash;
    return true;
  }
  // 번들 해시도 체크 (호환성)
  if (cache.meta.cssHash !== currentCssHash) {
    console.log(`  🎨 CSS 번들 변경 감지 (${cache.meta.cssHash?.slice(0,6) || 'null'} → ${currentCssHash.slice(0,6)})`);
    return true;
  }
  return false;
}

/**
 * 템플릿 버전 변경 여부 확인
 * @returns {boolean} true면 전체 재빌드 필요
 */
function checkTemplateChanged(cache) {
  if (cache.meta.templateVersion !== TEMPLATE_VERSION) {
    console.log(`  📝 템플릿 버전 변경 감지 (${cache.meta.templateVersion} → ${TEMPLATE_VERSION})`);
    return true;
  }
  return false;
}

/**
 * 게임 데이터 변경 확인
 * @param {Object} cache - 캐시 객체
 * @param {Array} games - 게임 배열
 * @returns {Object} { changed: [slugs], added: [slugs], removed: [slugs], unchanged: [slugs] }
 */
function checkGamesChanged(cache, games) {
  const result = { changed: [], added: [], removed: [], unchanged: [] };
  const currentSlugs = new Set();

  for (const game of games) {
    const slug = game.slug || game.appId || game.name;
    if (!slug) continue;

    currentSlugs.add(slug);
    const currentHash = computeHash(game);
    const cachedHash = cache.games[slug];

    if (!cachedHash) {
      result.added.push(slug);
    } else if (cachedHash !== currentHash) {
      result.changed.push(slug);
    } else {
      result.unchanged.push(slug);
    }
  }

  // 삭제된 게임 확인
  for (const slug of Object.keys(cache.games)) {
    if (!currentSlugs.has(slug)) {
      result.removed.push(slug);
    }
  }

  return result;
}

/**
 * 단일 항목 변경 확인 (위키, 테크, 이슈 등)
 * @param {Object} cacheSection - 캐시의 해당 섹션 (cache.wiki, cache.tech 등)
 * @param {string} key - 항목 키 (예: "business/game-revenue")
 * @param {Object} data - 현재 데이터
 * @returns {boolean} true면 변경됨
 */
function checkItemChanged(cacheSection, key, data) {
  const currentHash = computeHash(data);
  const cachedHash = cacheSection[key];
  return cachedHash !== currentHash;
}

/**
 * 캐시 섹션 업데이트
 */
function updateCacheSection(cacheSection, key, data) {
  cacheSection[key] = computeHash(data);
}

/**
 * 게임 캐시 일괄 업데이트
 */
function updateGamesCache(cache, games) {
  cache.games = {};
  for (const game of games) {
    const slug = game.slug || game.appId || game.name;
    if (slug) {
      cache.games[slug] = computeHash(game);
    }
  }
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

/**
 * 입력 파일들의 시그니처(mtime 조합) 계산
 * @param {string[]} paths - 파일 또는 디렉토리 경로 배열
 * @returns {string} 시그니처 해시
 */
function getInputFilesSignature(paths) {
  const mtimes = [];

  for (const p of paths) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        // 디렉토리면 내부 파일들의 mtime 수집
        const files = fs.readdirSync(p).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const fileStat = fs.statSync(path.join(p, file));
            mtimes.push(`${file}:${fileStat.mtimeMs}`);
          } catch (e) { /* ignore */ }
        }
      } else {
        mtimes.push(`${path.basename(p)}:${stat.mtimeMs}`);
      }
    } catch (e) { /* ignore */ }
  }

  return computeHash(mtimes.sort().join('|'));
}

/**
 * 입력 파일 시그니처 변경 확인
 * @param {Object} cache - 캐시 객체
 * @param {string} key - 캐시 키 (예: 'gamePages')
 * @param {string} currentSignature - 현재 시그니처
 * @returns {boolean} true면 변경됨
 */
function checkInputFilesChanged(cache, key, currentSignature) {
  if (!cache.inputFiles) cache.inputFiles = {};
  const cachedSignature = cache.inputFiles[key];
  return cachedSignature !== currentSignature;
}

/**
 * 입력 파일 시그니처 업데이트
 */
function updateInputFilesSignature(cache, key, signature) {
  if (!cache.inputFiles) cache.inputFiles = {};
  cache.inputFiles[key] = signature;
}

module.exports = {
  TEMPLATE_VERSION,
  computeHash,
  computeFileHash,
  loadCache,
  saveCache,
  createEmptyCache,
  checkCssChanged,
  checkTemplateChanged,
  checkTemplateJsChanged,
  checkGamesChanged,
  checkItemChanged,
  updateCacheSection,
  updateGamesCache,
  printBuildStats,
  getInputFilesSignature,
  checkInputFilesChanged,
  updateInputFilesSignature
};
