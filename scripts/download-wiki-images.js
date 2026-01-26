/**
 * 위키 이미지 다운로드 + WebP 변환 스크립트
 * - data/wiki/{category}/*.json의 외부 이미지 URL을 다운로드
 * - WebP로 변환하여 docs/assets/images/wiki/{category}/{slug}/ 에 저장
 * - 이미 다운로드된 이미지는 스킵
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

const WIKI_DIR = path.join(__dirname, '..', 'data', 'wiki');
const IMAGES_DIR = path.join(__dirname, '..', 'docs', 'assets', 'images', 'wiki');

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
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

// 이미지 최적화 설정
const IMAGE_CONFIG = {
  maxWidth: 1200,       // 최대 가로 1200px (상세 페이지용)
  thumbWidth: 480,      // 썸네일 가로 480px (리스트용)
  quality: 80,          // WebP 품질 80
};

/**
 * 이미지를 WebP로 변환하여 저장 (sharp 없으면 원본 저장)
 * - 최대 1200px로 리사이징 (원본이 작으면 확대 안 함)
 */
async function saveAsWebP(buffer, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (sharp) {
    // 리사이징 + WebP 변환
    await sharp(buffer)
      .resize({
        width: IMAGE_CONFIG.maxWidth,
        withoutEnlargement: true  // 원본이 작으면 확대 안 함
      })
      .webp({ quality: IMAGE_CONFIG.quality })
      .toFile(destPath);
  } else {
    // sharp 없으면 원본 그대로 저장
    fs.writeFileSync(destPath, buffer);
  }
}

/**
 * 작은 썸네일용 WebP 변환 (리스트 카드용)
 * - 480px로 리사이징
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
 * 외부 URL인지 확인
 */
function isExternalUrl(url) {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * 위키 문서의 이미지 다운로드
 */
async function processWikiArticle(jsonPath, category) {
  const content = fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, ''); // BOM 제거
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
  const imageDir = path.join(IMAGES_DIR, category, slug);
  const ext = '.webp'; // 항상 .webp 확장자 (sharp 없어도 브라우저가 포맷 자동 감지)

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  // 1. 썸네일 처리 (두 가지 크기: 원본용 + 리스트용)
  if (article.thumbnail && isExternalUrl(article.thumbnail)) {
    const localPath = path.join(imageDir, `thumbnail${ext}`);
    const localPathSm = path.join(imageDir, `thumbnail-sm${ext}`);

    // 큰 썸네일 (상세 페이지용)
    if (fs.existsSync(localPath)) {
      skipped++;
    } else {
      try {
        const buffer = await downloadToBuffer(article.thumbnail);
        await saveAsWebP(buffer, localPath);
        console.log(`    ✅ thumbnail${ext}`);
        downloaded++;
      } catch (err) {
        console.log(`    ❌ thumbnail: ${err.message}`);
        errors++;
      }
    }

    // 작은 썸네일 (리스트용)
    if (fs.existsSync(localPathSm)) {
      skipped++;
    } else {
      try {
        const buffer = await downloadToBuffer(article.thumbnail);
        await saveAsWebPSmall(buffer, localPathSm);
        console.log(`    ✅ thumbnail-sm${ext}`);
        downloaded++;
      } catch (err) {
        console.log(`    ❌ thumbnail-sm: ${err.message}`);
        errors++;
      }
    }
  }

  // 2. content 이미지 처리
  if (article.content && Array.isArray(article.content)) {
    let imageIndex = 1;

    for (const block of article.content) {
      if (block.type === 'image' && block.src && isExternalUrl(block.src)) {
        const filename = String(imageIndex).padStart(2, '0') + ext;
        const localPath = path.join(imageDir, filename);

        if (fs.existsSync(localPath)) {
          skipped++;
        } else {
          try {
            const buffer = await downloadToBuffer(block.src);
            await saveAsWebP(buffer, localPath);
            console.log(`  ✅ ${filename}`);
            downloaded++;
          } catch (err) {
            console.log(`  ❌ ${filename}: ${err.message}`);
            errors++;
          }
        }

        imageIndex++;
      }
    }
  }

  return { downloaded, skipped, errors };
}

/**
 * 메인 실행
 */
async function main() {
  console.log('🖼️  위키 이미지 다운로드' + (sharp ? ' + WebP 변환' : '') + '\n');

  // docs/assets/images/wiki 폴더 생성
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  // data/wiki 폴더 확인
  if (!fs.existsSync(WIKI_DIR)) {
    console.log('⚠️ data/wiki 폴더 없음');
    return;
  }

  // 카테고리 디렉토리 목록
  const categories = fs.readdirSync(WIKI_DIR).filter(f =>
    fs.statSync(path.join(WIKI_DIR, f)).isDirectory()
  );

  if (categories.length === 0) {
    console.log('⚠️ 위키 카테고리 없음');
    return;
  }

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalDrafts = 0;

  for (const category of categories) {
    const categoryPath = path.join(WIKI_DIR, category);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));

    if (files.length === 0) continue;

    console.log(`📁 ${category}/`);

    for (const file of files) {
      const jsonPath = path.join(categoryPath, file);
      const slug = file.replace('.json', '');
      console.log(`  📄 ${slug}`);

      try {
        const result = await processWikiArticle(jsonPath, category);

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

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 다운로드: ${totalDownloaded}개`);
  console.log(`⏭️  스킵: ${totalSkipped}개`);
  if (totalDrafts > 0) {
    console.log(`📝 Draft: ${totalDrafts}개`);
  }
  if (totalErrors > 0) {
    console.log(`❌ 오류: ${totalErrors}개`);
  }
}

main().catch(console.error);
