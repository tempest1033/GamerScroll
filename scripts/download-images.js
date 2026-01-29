/**
 * 전체 이미지 다운로드 + WebP 변환 스크립트
 * - 위키: data/wiki/{category}/*.json
 * - 테크: data/tech/{category}/*.json
 * - 매거진: reports/{issue,insight,hotpick}/*.json
 * - WebP로 변환하여 docs/assets/images/{type}/{slug}/ 에 저장
 * - 이미 다운로드된 이미지는 스킵
 *
 * 사용법:
 *   node scripts/download-images.js              # 전체
 *   node scripts/download-images.js wiki tech    # 위키+테크만
 *   node scripts/download-images.js issue        # 이슈만
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// sharp는 선택적 의존성 (없으면 원본 포맷 유지)
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('⚠️ sharp 미설치 - WebP 변환 없이 원본 저장\n');
}

// 경로 설정
const DATA_DIRS = {
  wiki: path.join(__dirname, '..', 'data', 'wiki'),
  tech: path.join(__dirname, '..', 'data', 'tech'),
  issue: path.join(__dirname, '..', 'reports', 'issue'),
  insight: path.join(__dirname, '..', 'reports', 'insight'),
  hotpick: path.join(__dirname, '..', 'reports', 'hotpick'),
  ranking: path.join(__dirname, '..', 'reports', 'ranking')
};
const IMAGES_BASE = path.join(__dirname, '..', 'docs', 'assets', 'images');
const PENDING_FILE = path.join(__dirname, '..', 'data', 'pending-images.json');

// 기존 이미지 파일 캐시 (fs.existsSync 반복 호출 방지)
let existingImagesCache = null;

// 펜딩 URL 캐시
let pendingData = { pending: [] };
let pendingUrls = new Set();

function loadPendingData() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const content = fs.readFileSync(PENDING_FILE, 'utf-8').replace(/^\uFEFF/, '');
      pendingData = JSON.parse(content);
      pendingUrls = new Set(pendingData.pending.map(p => p.url));
    }
  } catch (e) {
    console.log('⚠️ pending-images.json 로드 실패');
    pendingData = { pending: [] };
    pendingUrls = new Set();
  }
}

function savePendingData() {
  const json = JSON.stringify(pendingData, null, 2);
  fs.writeFileSync(PENDING_FILE, json, 'utf-8');
}

function isPending(url) {
  return pendingUrls.has(url);
}

function addToPending(url, slug, type, error) {
  if (pendingUrls.has(url)) return;
  pendingData.pending.push({
    url,
    slug,
    type,
    failedAt: new Date().toISOString(),
    error: error || 'unknown'
  });
  pendingUrls.add(url);
}

function buildExistingImagesCache(baseDir) {
  const cache = new Set();
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else {
        cache.add(fullPath);
      }
    }
  }
  scanDir(baseDir);
  return cache;
}

function imageExists(localPath) {
  return existingImagesCache.has(localPath);
}

// CLI 인자 파싱
const args = process.argv.slice(2);
const allTypes = Object.keys(DATA_DIRS);
const targetTypes = args.length > 0 ? args.filter(a => DATA_DIRS[a]) : allTypes;

if (args.length > 0 && targetTypes.length === 0) {
  console.error('❌ 알 수 없는 타입:', args.join(', '));
  console.log('사용 가능한 타입:', allTypes.join(', '));
  process.exit(1);
}

/**
 * URL에서 이미지 버퍼로 다운로드
 */
function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      // 리다이렉트 처리
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadToBuffer(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

// 이미지 최적화 설정
const IMAGE_CONFIG = {
  maxWidth: 1200,       // 최대 가로 1200px (상세 페이지용)
  thumbWidth: 480,      // 썸네일 가로 480px (PC 리스트용)
  xsWidth: 200,         // 모바일 썸네일 200px (모바일 리스트용)
  quality: 80,          // WebP 품질 80
};

/**
 * 이미지를 WebP로 변환하여 저장 (sharp 없으면 원본 저장)
 */
async function saveAsWebP(buffer, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (sharp) {
    await sharp(buffer)
      .resize({
        width: IMAGE_CONFIG.maxWidth,
        withoutEnlargement: true
      })
      .webp({ quality: IMAGE_CONFIG.quality })
      .toFile(destPath);
  } else {
    fs.writeFileSync(destPath, buffer);
  }
}

/**
 * PC 리스트용 썸네일 (480px)
 */
async function saveAsWebPSmall(buffer, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (sharp) {
    await sharp(buffer)
      .resize({
        width: IMAGE_CONFIG.thumbWidth,
        withoutEnlargement: true
      })
      .webp({ quality: IMAGE_CONFIG.quality })
      .toFile(destPath);
  } else {
    fs.writeFileSync(destPath, buffer);
  }
}

/**
 * 모바일용 썸네일 (200px)
 */
async function saveAsWebPXSmall(buffer, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (sharp) {
    await sharp(buffer)
      .resize({
        width: IMAGE_CONFIG.xsWidth,
        withoutEnlargement: true
      })
      .webp({ quality: IMAGE_CONFIG.quality })
      .toFile(destPath);
  } else {
    fs.writeFileSync(destPath, buffer);
  }
}

/**
 * 외부 URL인지 확인
 */
function isExternalUrl(url) {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * 문서의 이미지 다운로드
 */
async function processArticle(jsonPath, category, imagesDir) {
  const content = fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, '');
  const article = JSON.parse(content);

  // draft 상태는 스킵
  if (article.status === 'draft') {
    return { downloaded: 0, skipped: 0, errors: 0, isDraft: true };
  }

  if (!article.slug) {
    console.log(`  ⚠️ slug 없음: ${jsonPath}`);
    return { downloaded: 0, skipped: 0, errors: 0 };
  }

  const slug = article.slug;
  const imageDir = path.join(imagesDir, category, slug);
  const ext = '.webp';

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  let pendingSkipped = 0;

  // 공통 다운로드 함수
  async function tryDownload(url, localPath, saveFn, label) {
    // 이미 다운로드됨
    if (imageExists(localPath)) {
      skipped++;
      return 'skipped';
    }
    // 펜딩에 있으면 스킵
    if (isPending(url)) {
      pendingSkipped++;
      return 'pending';
    }
    // 다운로드 시도
    try {
      const buffer = await downloadToBuffer(url);
      await saveFn(buffer, localPath);
      console.log(`    ✅ ${label}`);
      downloaded++;
      return 'downloaded';
    } catch (err) {
      console.log(`    ❌ ${label}: ${err.message}`);
      addToPending(url, slug, label, err.message);
      errors++;
      return 'error';
    }
  }

  // 1. 썸네일 처리 (세 가지 크기)
  if (article.thumbnail && isExternalUrl(article.thumbnail)) {
    const localPath = path.join(imageDir, `thumbnail${ext}`);
    const localPathSm = path.join(imageDir, `thumbnail-sm${ext}`);
    const localPathXs = path.join(imageDir, `thumbnail-xs${ext}`);

    await tryDownload(article.thumbnail, localPath, saveAsWebP, `thumbnail${ext}`);
    await tryDownload(article.thumbnail, localPathSm, saveAsWebPSmall, `thumbnail-sm${ext}`);
    await tryDownload(article.thumbnail, localPathXs, saveAsWebPXSmall, `thumbnail-xs${ext}`);
  }

  // 2. content 이미지 처리
  if (article.content && Array.isArray(article.content)) {
    let imageIndex = 1;

    for (const block of article.content) {
      if (block.type === 'image' && block.src && isExternalUrl(block.src)) {
        const filename = String(imageIndex).padStart(2, '0') + ext;
        const localPath = path.join(imageDir, filename);

        await tryDownload(block.src, localPath, saveAsWebP, filename);

        imageIndex++;
      }
    }
  }

  return { downloaded, skipped, errors, pendingSkipped };
}

/**
 * 특정 타입 처리
 * - wiki/tech: 하위 카테고리 폴더 있음
 * - issue/insight/hotpick: 카테고리 없이 바로 JSON 파일
 */
async function processType(type) {
  const dataDir = DATA_DIRS[type];
  const imagesDir = path.join(IMAGES_BASE, type);
  const hasCategories = ['wiki', 'tech'].includes(type);

  if (!fs.existsSync(dataDir)) {
    console.log(`⚠️ ${type} 폴더 없음`);
    return { downloaded: 0, skipped: 0, errors: 0, drafts: 0 };
  }

  // 이미지 폴더 생성
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalDrafts = 0;

  if (hasCategories) {
    // wiki/tech: 카테고리별 처리
    const categories = fs.readdirSync(dataDir).filter(f =>
      fs.statSync(path.join(dataDir, f)).isDirectory()
    );

    if (categories.length === 0) {
      console.log(`⚠️ ${type} 카테고리 없음`);
      return { downloaded: 0, skipped: 0, errors: 0, drafts: 0 };
    }

    for (const category of categories) {
      const categoryPath = path.join(dataDir, category);
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));

      if (files.length === 0) continue;

      console.log(`📁 ${category}/`);

      for (const file of files) {
        const jsonPath = path.join(categoryPath, file);
        const slug = file.replace('.json', '');
        console.log(`  📄 ${slug}`);

        try {
          const result = await processArticle(jsonPath, category, imagesDir);

          if (result.isDraft) {
            console.log(`    ⏭️  draft 상태 - 스킵`);
            totalDrafts++;
            continue;
          }

          totalDownloaded += result.downloaded;
          totalSkipped += result.skipped;
          totalErrors += result.errors;

          if (result.downloaded === 0 && result.skipped > 0) {
            console.log(`    ⏭️  모든 이미지 이미 존재 (${result.skipped}개)`);
          }
        } catch (err) {
          console.log(`    ❌ 처리 실패: ${err.message}`);
          totalErrors++;
        }
      }

      console.log('');
    }
  } else {
    // issue/insight/hotpick: 카테고리 없이 바로 JSON 파일
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      console.log(`⚠️ ${type} JSON 파일 없음`);
      return { downloaded: 0, skipped: 0, errors: 0, drafts: 0 };
    }

    for (const file of files) {
      const jsonPath = path.join(dataDir, file);
      const slug = file.replace('.json', '');
      console.log(`  📄 ${slug}`);

      try {
        // 카테고리 없이 slug만으로 이미지 폴더 생성
        const result = await processArticle(jsonPath, '', imagesDir);

        if (result.isDraft) {
          console.log(`    ⏭️  draft 상태 - 스킵`);
          totalDrafts++;
          continue;
        }

        totalDownloaded += result.downloaded;
        totalSkipped += result.skipped;
        totalErrors += result.errors;

        if (result.downloaded === 0 && result.skipped > 0) {
          console.log(`    ⏭️  모든 이미지 이미 존재 (${result.skipped}개)`);
        }
      } catch (err) {
        console.log(`    ❌ 처리 실패: ${err.message}`);
        totalErrors++;
      }
    }

    console.log('');
  }

  return { downloaded: totalDownloaded, skipped: totalSkipped, errors: totalErrors, drafts: totalDrafts };
}

/**
 * 메인 실행
 */
async function main() {
  console.log('🖼️  이미지 다운로드' + (sharp ? ' + WebP 변환' : ''));
  console.log(`   대상: ${targetTypes.join(', ')}\n`);

  // 펜딩 데이터 로드
  loadPendingData();
  console.log(`⏸️  펜딩 URL: ${pendingUrls.size}개`);

  // 기존 이미지 캐시 빌드 (한 번만 실행)
  existingImagesCache = buildExistingImagesCache(IMAGES_BASE);
  console.log(`💾 캐시된 이미지: ${existingImagesCache.size}개\n`);

  let grandDownloaded = 0;
  let grandSkipped = 0;
  let grandErrors = 0;
  let grandDrafts = 0;
  let grandPendingSkipped = 0;

  for (const type of targetTypes) {
    const emojis = { wiki: '📚', tech: '🔧', issue: '📰', insight: '💡', hotpick: '🔥', ranking: '🏆' };
    const emoji = emojis[type] || '📄';
    console.log(`${emoji} === ${type.toUpperCase()} ===\n`);

    const result = await processType(type);
    grandDownloaded += result.downloaded;
    grandSkipped += result.skipped;
    grandErrors += result.errors;
    grandDrafts += result.drafts;
    grandPendingSkipped += result.pendingSkipped || 0;
  }

  // 펜딩 데이터 저장
  savePendingData();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 다운로드: ${grandDownloaded}개`);
  console.log(`⏭️  스킵: ${grandSkipped}개`);
  console.log(`⏸️  펜딩: ${pendingUrls.size}개`);
  if (grandDrafts > 0) {
    console.log(`📝 Draft: ${grandDrafts}개`);
  }
  if (grandErrors > 0) {
    console.log(`❌ 오류: ${grandErrors}개`);
  }
}

main().catch(console.error);
