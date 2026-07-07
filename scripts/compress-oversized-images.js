/**
 * 배포된 이미지 in-place 재압축 스크립트
 * - 참조/파일명/포맷 변경 없음 (PNG는 PNG로, WebP는 WebP로 유지)
 * - PNG: compressionLevel 9 + palette + 최대 1200px 리사이즈
 * - WebP: 300KB 이상만 quality 80 + 최대 1200px 재인코딩
 * - 결과가 원본보다 작을 때만 교체
 *
 * 대상 루트: docs/assets/images, ai-docs/assets/images
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

const ROOTS = [
  path.join(__dirname, '..', 'docs', 'assets', 'images'),
  path.join(__dirname, '..', 'ai-docs', 'assets', 'images'),
];

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 80;
const PNG_THRESHOLD = 200 * 1024; // PNG는 200KB 이상 처리
const WEBP_THRESHOLD = 300 * 1024; // WebP는 기존 스크립트와 동일하게 300KB 이상

function findImages(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      findImages(full, files);
    } else if (/\.(png|webp)$/i.test(item)) {
      files.push({ path: full, size: stat.size });
    }
  }
  return files;
}

async function recompress(filePath) {
  const isPng = /\.png$/i.test(filePath);
  const tmp = filePath + '.tmp';
  let pipeline = sharp(filePath).resize({ width: MAX_WIDTH, withoutEnlargement: true });
  if (isPng) {
    pipeline = pipeline.png({ compressionLevel: 9, palette: true });
  } else {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  }
  try {
    await pipeline.toFile(tmp);
    const newSize = fs.statSync(tmp).size;
    const oldSize = fs.statSync(filePath).size;
    if (newSize < oldSize) {
      fs.unlinkSync(filePath);
      fs.renameSync(tmp, filePath);
      return { replaced: true, oldSize, newSize };
    }
    fs.unlinkSync(tmp);
    return { replaced: false, oldSize, newSize };
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw err;
  }
}

async function processRoot(root) {
  const all = findImages(root);
  const targets = all
    .filter(f => (/\.png$/i.test(f.path) ? f.size >= PNG_THRESHOLD : f.size >= WEBP_THRESHOLD))
    .sort((a, b) => b.size - a.size);

  let before = 0;
  for (const f of all) before += f.size;

  console.log(`\n📁 ${path.relative(path.join(__dirname, '..'), root)}`);
  console.log(`   전체 ${all.length}개 / 대상 ${targets.length}개 / 총 ${(before / 1024 / 1024).toFixed(2)}MB`);

  let replaced = 0;
  let saved = 0;
  let errors = 0;
  for (const f of targets) {
    const rel = path.relative(root, f.path);
    try {
      const r = await recompress(f.path);
      if (r.replaced) {
        replaced++;
        saved += r.oldSize - r.newSize;
        console.log(`   📄 ${rel}: ${(r.oldSize / 1024).toFixed(0)}KB → ${(r.newSize / 1024).toFixed(0)}KB`);
      }
    } catch (err) {
      errors++;
      console.log(`   ❌ ${rel}: ${err.message}`);
    }
  }

  const after = before - saved;
  console.log(`   ✅ 교체 ${replaced}개 / 절약 ${(saved / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   📊 ${(before / 1024 / 1024).toFixed(2)}MB → ${(after / 1024 / 1024).toFixed(2)}MB`);
  return { before, after, replaced, errors };
}

async function main() {
  console.log('🗜️  이미지 in-place 재압축 (PNG/WebP, 포맷·파일명 유지)');
  let gBefore = 0;
  let gAfter = 0;
  for (const root of ROOTS) {
    const r = await processRoot(root);
    gBefore += r.before;
    gAfter += r.after;
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`💾 총 ${(gBefore / 1024 / 1024).toFixed(2)}MB → ${(gAfter / 1024 / 1024).toFixed(2)}MB (-${((gBefore - gAfter) / 1024 / 1024).toFixed(2)}MB)`);
}

main().catch(console.error);
