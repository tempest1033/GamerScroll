/**
 * 이슈 리포트 이미지 다운로드 + WebP 변환 스크립트
 * - reports/issue/*.json의 외부 이미지 URL을 다운로드
 * - WebP로 변환하여 docs/assets/images/issue/{slug}/ 에 저장
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

const ISSUE_DIR = path.join(__dirname, '..', 'reports', 'issue');
const IMAGES_DIR = path.join(__dirname, '..', 'docs', 'assets', 'images', 'issue');

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

/**
 * 이미지를 WebP로 변환하여 저장 (sharp 없으면 원본 저장)
 */
async function saveAsWebP(buffer, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (sharp) {
    // WebP 변환 (quality 85)
    await sharp(buffer)
      .webp({ quality: 85 })
      .toFile(destPath);
  } else {
    // sharp 없으면 원본 그대로 저장
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
 * 이슈 리포트의 이미지 다운로드
 */
async function processIssueReport(jsonPath) {
  const content = fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, ''); // BOM 제거
  const report = JSON.parse(content);

  if (!report.slug) {
    console.log(`  ⚠️ slug 없음: ${jsonPath}`);
    return { downloaded: 0, skipped: 0, errors: 0 };
  }

  const slug = report.slug;
  const imageDir = path.join(IMAGES_DIR, slug);
  const ext = sharp ? '.webp' : '.jpg'; // sharp 있으면 WebP, 없으면 원본

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  // 1. 썸네일 처리
  if (report.thumbnail && isExternalUrl(report.thumbnail)) {
    const localPath = path.join(imageDir, `thumbnail${ext}`);

    if (fs.existsSync(localPath)) {
      skipped++;
    } else {
      try {
        const buffer = await downloadToBuffer(report.thumbnail);
        await saveAsWebP(buffer, localPath);
        console.log(`  ✅ thumbnail${ext}`);
        downloaded++;
      } catch (err) {
        console.log(`  ❌ thumbnail: ${err.message}`);
        errors++;
      }
    }
  }

  // 2. content 이미지 처리
  if (report.content && Array.isArray(report.content)) {
    let imageIndex = 1;

    for (const block of report.content) {
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
  console.log('🖼️  이슈 리포트 이미지 다운로드' + (sharp ? ' + WebP 변환' : '') + '\n');

  // docs/assets/images/issue 폴더 생성
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  // reports/issue 폴더 확인
  if (!fs.existsSync(ISSUE_DIR)) {
    console.log('⚠️ reports/issue 폴더 없음');
    return;
  }

  const files = fs.readdirSync(ISSUE_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('⚠️ 이슈 리포트 없음');
    return;
  }

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of files) {
    const jsonPath = path.join(ISSUE_DIR, file);
    console.log(`📄 ${file}`);

    try {
      const result = await processIssueReport(jsonPath);
      totalDownloaded += result.downloaded;
      totalSkipped += result.skipped;
      totalErrors += result.errors;

      if (result.downloaded === 0 && result.skipped > 0) {
        console.log(`  ⏭️  모든 이미지 이미 존재 (${result.skipped}개)`);
      }
    } catch (err) {
      console.log(`  ❌ 처리 실패: ${err.message}`);
      totalErrors++;
    }

    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 다운로드: ${totalDownloaded}개`);
  console.log(`⏭️  스킵: ${totalSkipped}개`);
  if (totalErrors > 0) {
    console.log(`❌ 오류: ${totalErrors}개`);
  }
}

main().catch(console.error);
