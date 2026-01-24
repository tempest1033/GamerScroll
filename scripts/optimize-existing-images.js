/**
 * 기존 WebP 이미지 재최적화 스크립트
 * - 300KB 이상인 이미지를 찾아서 리사이징 + 재압축
 * - 최대 1200px, 품질 80
 */

const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('❌ sharp 패키지가 필요합니다: npm install sharp');
  process.exit(1);
}

const IMAGES_DIR = path.join(__dirname, '..', 'docs', 'assets', 'images');
const SIZE_THRESHOLD = 300 * 1024; // 300KB 이상만 처리

const IMAGE_CONFIG = {
  maxWidth: 1200,
  quality: 80,
};

/**
 * 재귀적으로 WebP 파일 찾기
 */
function findWebPFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findWebPFiles(fullPath, files);
    } else if (item.endsWith('.webp')) {
      files.push({
        path: fullPath,
        size: stat.size
      });
    }
  }

  return files;
}

/**
 * 이미지 최적화
 */
async function optimizeImage(filePath) {
  const tempPath = filePath + '.tmp';

  try {
    await sharp(filePath)
      .resize({
        width: IMAGE_CONFIG.maxWidth,
        withoutEnlargement: true
      })
      .webp({ quality: IMAGE_CONFIG.quality })
      .toFile(tempPath);

    // 임시 파일로 교체
    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);

    return true;
  } catch (err) {
    // 실패 시 임시 파일 정리
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw err;
  }
}

async function main() {
  console.log('🔧 기존 이미지 최적화 (300KB 이상)\n');
  console.log(`   설정: 최대 ${IMAGE_CONFIG.maxWidth}px, 품질 ${IMAGE_CONFIG.quality}\n`);

  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('⚠️ 이미지 폴더 없음');
    return;
  }

  // 모든 WebP 파일 찾기
  const allFiles = findWebPFiles(IMAGES_DIR);

  // 300KB 이상 파일만 필터링
  const largeFiles = allFiles
    .filter(f => f.size >= SIZE_THRESHOLD)
    .sort((a, b) => b.size - a.size);

  console.log(`📊 전체 WebP: ${allFiles.length}개`);
  console.log(`📊 300KB 이상: ${largeFiles.length}개\n`);

  if (largeFiles.length === 0) {
    console.log('✅ 최적화 필요한 파일 없음');
    return;
  }

  let optimized = 0;
  let errors = 0;
  let totalSaved = 0;

  for (const file of largeFiles) {
    const relativePath = path.relative(IMAGES_DIR, file.path);
    const originalSize = file.size;
    const originalSizeKB = (originalSize / 1024).toFixed(0);

    process.stdout.write(`📄 ${relativePath} (${originalSizeKB}KB) → `);

    try {
      await optimizeImage(file.path);

      const newSize = fs.statSync(file.path).size;
      const newSizeKB = (newSize / 1024).toFixed(0);
      const savedKB = ((originalSize - newSize) / 1024).toFixed(0);
      const reduction = ((1 - newSize / originalSize) * 100).toFixed(0);

      console.log(`${newSizeKB}KB (-${savedKB}KB, -${reduction}%)`);

      totalSaved += (originalSize - newSize);
      optimized++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      errors++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 최적화: ${optimized}개`);
  console.log(`💾 절약: ${(totalSaved / 1024 / 1024).toFixed(1)}MB`);
  if (errors > 0) {
    console.log(`❌ 오류: ${errors}개`);
  }
}

main().catch(console.error);
