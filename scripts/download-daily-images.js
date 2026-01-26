/**
 * 데일리 리포트 이미지 다운로드 스크립트
 * - reports/*.json (날짜 형식)의 뉴스 썸네일 다운로드
 * - WebP로 변환하여 docs/assets/images/daily/{date}/ 에 저장
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('⚠️ sharp 미설치 - WebP 변환 없이 원본 저장\n');
}

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const IMAGES_DIR = path.join(__dirname, '..', 'docs', 'assets', 'images', 'daily');

const IMAGE_CONFIG = {
  maxWidth: 480,  // 썸네일은 작게
  quality: 80,
};

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadToBuffer(response.headers.location).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function saveAsWebP(buffer, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (sharp) {
    await sharp(buffer)
      .resize({ width: IMAGE_CONFIG.maxWidth, withoutEnlargement: true })
      .webp({ quality: IMAGE_CONFIG.quality })
      .toFile(destPath);
  } else {
    fs.writeFileSync(destPath, buffer);
  }
}

function isExternalUrl(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}

// URL을 해시해서 파일명으로 사용
function urlToFilename(url) {
  const hash = require('crypto').createHash('md5').update(url).digest('hex').substring(0, 8);
  return hash + '.webp';
}

async function processDaily(jsonPath) {
  const content = fs.readFileSync(jsonPath, 'utf-8').replace(/^\uFEFF/, '');
  const data = JSON.parse(content);

  if (!data.date) return { downloaded: 0, skipped: 0, errors: 0 };

  const date = data.date;
  const imageDir = path.join(IMAGES_DIR, date);

  let downloaded = 0, skipped = 0, errors = 0;

  // news 섹션의 썸네일 처리 (배열)
  if (Array.isArray(data.news)) {
    for (const item of data.news) {
      let thumb = item.thumbnail;
      if (thumb) {
        // // 로 시작하면 https: 붙이기
        if (thumb.startsWith('//')) thumb = 'https:' + thumb;
        if (isExternalUrl(thumb)) {
          const filename = urlToFilename(thumb);
          const localPath = path.join(imageDir, filename);

          if (fs.existsSync(localPath)) {
            skipped++;
          } else {
            try {
              const buffer = await downloadToBuffer(thumb);
              await saveAsWebP(buffer, localPath);
              downloaded++;
            } catch (err) {
              errors++;
            }
          }
        }
      }
    }
  }

  // community 섹션의 썸네일 처리 (배열)
  if (Array.isArray(data.community)) {
    for (const item of data.community) {
      let thumb = item.thumbnail;
      if (thumb) {
        if (thumb.startsWith('//')) thumb = 'https:' + thumb;
        if (isExternalUrl(thumb)) {
          const filename = urlToFilename(thumb);
          const localPath = path.join(imageDir, filename);

          if (fs.existsSync(localPath)) {
            skipped++;
          } else {
            try {
              const buffer = await downloadToBuffer(thumb);
              await saveAsWebP(buffer, localPath);
              downloaded++;
            } catch (err) {
              errors++;
            }
          }
        }
      }
    }
  }

  // AI 인사이트 썸네일 처리 (일간)
  if (data.ai && data.ai.thumbnail) {
    let thumb = data.ai.thumbnail;
    if (thumb.startsWith('//')) thumb = 'https:' + thumb;
    if (isExternalUrl(thumb)) {
      const filename = urlToFilename(thumb);
      const localPath = path.join(imageDir, filename);

      if (fs.existsSync(localPath)) {
        skipped++;
      } else {
        try {
          const buffer = await downloadToBuffer(thumb);
          await saveAsWebP(buffer, localPath);
          downloaded++;
          console.log(`    ✅ AI 썸네일: ${filename}`);
        } catch (err) {
          console.log(`    ❌ AI 썸네일 실패`);
          errors++;
        }
      }
    }
  }

  // AI 인사이트의 issues, metrics, industryIssues 등 썸네일 처리
  const aiSections = ['issues', 'metrics', 'industryIssues', 'global', 'rankings'];
  for (const section of aiSections) {
    const items = data.ai?.[section] || [];
    if (Array.isArray(items)) {
      for (const item of items) {
        let thumb = item.thumbnail;
        if (thumb) {
          if (thumb.startsWith('//')) thumb = 'https:' + thumb;
          if (isExternalUrl(thumb)) {
            const filename = urlToFilename(thumb);
            const localPath = path.join(imageDir, filename);

            if (fs.existsSync(localPath)) {
              skipped++;
            } else {
              try {
                const buffer = await downloadToBuffer(thumb);
                await saveAsWebP(buffer, localPath);
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

  return { downloaded, skipped, errors };
}

async function main() {
  console.log('🖼️  데일리 이미지 다운로드' + (sharp ? ' + WebP 변환' : '') + '\n');

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  // 날짜 형식 JSON만 처리 (2026-01-27.json)
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));

  console.log(`📁 데일리 리포트: ${files.length}개\n`);

  let totalDownloaded = 0, totalSkipped = 0, totalErrors = 0;

  for (const file of files) {
    const jsonPath = path.join(REPORTS_DIR, file);
    const date = file.replace('.json', '');

    const result = await processDaily(jsonPath);
    totalDownloaded += result.downloaded;
    totalSkipped += result.skipped;
    totalErrors += result.errors;

    if (result.downloaded > 0) {
      console.log(`  ✅ ${date}: ${result.downloaded}개 다운로드`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 다운로드: ${totalDownloaded}개`);
  console.log(`⏭️  스킵: ${totalSkipped}개`);
  if (totalErrors > 0) {
    console.log(`❌ 오류: ${totalErrors}개`);
  }
}

main().catch(console.error);
