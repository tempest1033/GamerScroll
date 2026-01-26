/**
 * 이슈/핫픽/인사이트 리포트 이미지 다운로드 + WebP 변환 스크립트
 * - reports/{issue,hotpick,insight}/*.json의 외부 이미지 URL을 다운로드
 * - WebP로 변환하여 docs/assets/images/{type}/{slug}/ 에 저장
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

// 처리할 리포트 타입들
const REPORT_TYPES = ['issue', 'hotpick', 'insight', 'weekly'];

const REPORTS_BASE = path.join(__dirname, '..', 'reports');
const IMAGES_BASE = path.join(__dirname, '..', 'docs', 'assets', 'images');

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
 * 리포트의 이미지 다운로드
 * @param {string} jsonPath - JSON 파일 경로
 * @param {string} reportType - 리포트 타입 (issue, hotpick, insight)
 */
async function processReport(jsonPath, reportType) {
  const content = fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, ''); // BOM 제거
  const report = JSON.parse(content);

  // slug 결정: weekly는 weekInfo에서 자동 생성, 나머지는 report.slug 사용
  let slug = report.slug;
  if (!slug && reportType === 'weekly' && report.weekInfo) {
    const year = report.weekInfo.year || (report.weekInfo.startDate ? report.weekInfo.startDate.slice(0, 4) : new Date().getFullYear());
    const weekNum = report.weekInfo.weekNumber || report.ai?.weekNumber;
    if (weekNum) {
      slug = `${year}-W${String(weekNum).padStart(2, '0')}`;
    }
  }

  if (!slug) {
    console.log(`  ⚠️ slug 없음: ${jsonPath}`);
    return { downloaded: 0, skipped: 0, errors: 0 };
  }
  const imagesDir = path.join(IMAGES_BASE, reportType);
  const imageDir = path.join(imagesDir, slug);
  const ext = sharp ? '.webp' : '.jpg'; // sharp 있으면 WebP, 없으면 원본

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  // 1. 썸네일 처리 (두 가지 크기: 원본용 + 리스트용)
  // weekly는 ai.thumbnail 사용
  const thumbnailUrl = report.thumbnail || (report.ai && report.ai.thumbnail);
  if (thumbnailUrl && isExternalUrl(thumbnailUrl)) {
    const localPath = path.join(imageDir, `thumbnail${ext}`);
    const localPathSm = path.join(imageDir, `thumbnail-sm${ext}`);

    // 큰 썸네일 (상세 페이지용)
    if (fs.existsSync(localPath)) {
      skipped++;
    } else {
      try {
        const buffer = await downloadToBuffer(thumbnailUrl);
        await saveAsWebP(buffer, localPath);
        console.log(`  ✅ thumbnail${ext}`);
        downloaded++;
      } catch (err) {
        console.log(`  ❌ thumbnail: ${err.message}`);
        errors++;
      }
    }

    // 작은 썸네일 (리스트용)
    if (fs.existsSync(localPathSm)) {
      skipped++;
    } else {
      try {
        const buffer = await downloadToBuffer(thumbnailUrl);
        await saveAsWebPSmall(buffer, localPathSm);
        console.log(`  ✅ thumbnail-sm${ext}`);
        downloaded++;
      } catch (err) {
        console.log(`  ❌ thumbnail-sm: ${err.message}`);
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

  // 3. weekly 타입의 AI 인사이트 썸네일 처리 (issues, metrics, industryIssues, global, rankings)
  if (reportType === 'weekly' && report.ai) {
    const aiSections = ['issues', 'metrics', 'industryIssues', 'global', 'rankings'];
    for (const section of aiSections) {
      const items = report.ai[section] || [];
      if (Array.isArray(items)) {
        for (const item of items) {
          let thumb = item.thumbnail;
          if (thumb) {
            if (thumb.startsWith('//')) thumb = 'https:' + thumb;
            if (isExternalUrl(thumb)) {
              // MD5 해시 기반 파일명 (daily 폴더와 동일 형식)
              const hash = require('crypto').createHash('md5').update(thumb).digest('hex').substring(0, 8);
              const filename = hash + ext;
              const localPath = path.join(imageDir, filename);

              if (fs.existsSync(localPath)) {
                skipped++;
              } else {
                try {
                  const buffer = await downloadToBuffer(thumb);
                  await saveAsWebPSmall(buffer, localPath);
                  downloaded++;
                } catch (err) {
                  errors++;
                }
              }
            }
          }
        }
      }
    }
  }

  return { downloaded, skipped, errors };
}

/**
 * 메인 실행
 */
async function main() {
  console.log('🖼️  리포트 이미지 다운로드' + (sharp ? ' + WebP 변환' : ''));
  console.log(`📂 대상: ${REPORT_TYPES.join(', ')}\n`);

  let totalDownloaded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const reportType of REPORT_TYPES) {
    const reportDir = path.join(REPORTS_BASE, reportType);
    const imagesDir = path.join(IMAGES_BASE, reportType);

    // 이미지 폴더 생성
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // 리포트 폴더 확인
    if (!fs.existsSync(reportDir)) {
      console.log(`⚠️ reports/${reportType} 폴더 없음\n`);
      continue;
    }

    const files = fs.readdirSync(reportDir).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      console.log(`⚠️ ${reportType} 리포트 없음\n`);
      continue;
    }

    console.log(`\n📁 ${reportType.toUpperCase()} (${files.length}개)`);
    console.log('─'.repeat(30));

    for (const file of files) {
      const jsonPath = path.join(reportDir, file);
      console.log(`📄 ${file}`);

      try {
        const result = await processReport(jsonPath, reportType);
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
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 다운로드: ${totalDownloaded}개`);
  console.log(`⏭️  스킵: ${totalSkipped}개`);
  if (totalErrors > 0) {
    console.log(`❌ 오류: ${totalErrors}개`);
  }
}

main().catch(console.error);
