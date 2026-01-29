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
const PENDING_FILE = path.join(__dirname, '..', 'data', 'pending-images.json');

const IMAGE_CONFIG = {
  maxWidth: 480,  // 썸네일은 작게
  quality: 80,
};

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
    console.log('⚠️ pending-images.json 로드 실패, 새로 생성');
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

function addToPending(url, date, type, error) {
  if (pendingUrls.has(url)) return;
  pendingData.pending.push({
    url,
    date,
    type,
    failedAt: new Date().toISOString(),
    error: error || 'unknown'
  });
  pendingUrls.add(url);
}

function buildExistingImagesCache() {
  const cache = new Set();
  if (!fs.existsSync(IMAGES_DIR)) return cache;
  const dateFolders = fs.readdirSync(IMAGES_DIR).filter(f => {
    const fullPath = path.join(IMAGES_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });
  for (const dateFolder of dateFolders) {
    const folderPath = path.join(IMAGES_DIR, dateFolder);
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      cache.add(path.join(folderPath, file));
    }
  }
  return cache;
}

function imageExists(localPath) {
  return existingImagesCache.has(localPath);
}

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
    request.setTimeout(1000, () => {
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

  let downloaded = 0, skipped = 0, errors = 0, pendingSkipped = 0;

  // 공통 다운로드 함수
  async function tryDownload(thumb, type) {
    if (thumb.startsWith('//')) thumb = 'https:' + thumb;
    if (!isExternalUrl(thumb)) return null;

    const filename = urlToFilename(thumb);
    const localPath = path.join(imageDir, filename);

    // 이미 다운로드됨
    if (imageExists(localPath)) {
      skipped++;
      return 'skipped';
    }

    // 펜딩에 있으면 스킵
    if (isPending(thumb)) {
      pendingSkipped++;
      return 'pending';
    }

    // 다운로드 시도
    try {
      const buffer = await downloadToBuffer(thumb);
      await saveAsWebP(buffer, localPath);
      downloaded++;
      return 'downloaded';
    } catch (err) {
      // 실패 시 펜딩에 추가
      addToPending(thumb, date, type, err.message);
      errors++;
      return 'error';
    }
  }

  // news 섹션의 썸네일 처리
  if (Array.isArray(data.news)) {
    for (const item of data.news) {
      if (item.thumbnail) await tryDownload(item.thumbnail, 'news');
    }
  }

  // community 섹션의 썸네일 처리
  if (Array.isArray(data.community)) {
    for (const item of data.community) {
      if (item.thumbnail) await tryDownload(item.thumbnail, 'community');
    }
  }

  // AI 인사이트 썸네일 처리
  if (data.ai && data.ai.thumbnail) {
    await tryDownload(data.ai.thumbnail, 'ai.thumbnail');
  }

  // AI 인사이트의 issues, metrics, industryIssues 등 썸네일 처리
  const aiSections = ['issues', 'metrics', 'industryIssues', 'global', 'rankings'];
  for (const section of aiSections) {
    const items = data.ai?.[section] || [];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.thumbnail) await tryDownload(item.thumbnail, `ai.${section}`);
      }
    }
  }

  return { downloaded, skipped, errors, pendingSkipped };
}

async function main() {
  console.log('🖼️  데일리 이미지 다운로드' + (sharp ? ' + WebP 변환' : '') + '\n');

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  // 펜딩 데이터 로드
  loadPendingData();
  console.log(`⏸️  펜딩 URL: ${pendingUrls.size}개`);

  // 기존 이미지 캐시 빌드 (한 번만 실행)
  existingImagesCache = buildExistingImagesCache();
  console.log(`💾 캐시된 이미지: ${existingImagesCache.size}개`);

  // 날짜 형식 JSON만 처리 (2026-01-27.json)
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));

  console.log(`📁 데일리 리포트: ${files.length}개\n`);

  let totalDownloaded = 0, totalSkipped = 0, totalErrors = 0, totalPendingSkipped = 0;

  for (const file of files) {
    const jsonPath = path.join(REPORTS_DIR, file);
    const date = file.replace('.json', '');

    const result = await processDaily(jsonPath);
    totalDownloaded += result.downloaded;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
    totalPendingSkipped += result.pendingSkipped || 0;

    if (result.downloaded > 0) {
      console.log(`  ✅ ${date}: ${result.downloaded}개 다운로드`);
    }
  }

  // 펜딩 데이터 저장
  savePendingData();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 다운로드: ${totalDownloaded}개`);
  console.log(`⏭️  스킵: ${totalSkipped}개`);
  console.log(`⏸️  펜딩: ${pendingUrls.size}개`);
  if (totalErrors > 0) {
    console.log(`❌ 오류: ${totalErrors}개`);
  }
}

main().catch(console.error);
