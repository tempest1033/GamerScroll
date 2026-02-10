/**
 * 썸네일 로컬 경로 헬퍼 (공통 모듈)
 * - 이슈/핫픽/인사이트 리포트 썸네일
 * - 일간 뉴스 썸네일
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// docs 폴더 경로 (이미지 로컬 확인용)
const docsDir = path.join(__dirname, '../../../docs');

// 이슈/핫픽/인사이트 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
// size: 'xs' = 모바일용 (200px), 'sm' = PC리스트용 (480px), 'lg' = 상세 페이지용 (1200px)
function getLocalReportThumbnail(type, slug, originalUrl, size = 'sm') {
  if (!type || !slug) return originalUrl || '';

  const sizeMap = { xs: 'thumbnail-xs.webp', sm: 'thumbnail-sm.webp', lg: 'thumbnail.webp' };
  const widthMap = { xs: 200, sm: 480, lg: 1200 };
  const filename = sizeMap[size] || sizeMap.sm;
  const localPath = `/assets/images/${type}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images', type, slug, filename);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 폴백: 기존 thumbnail.webp 확인 (sm/xs가 없을 경우)
  if (size === 'sm' || size === 'xs') {
    const fallbackPath = path.join(docsDir, 'assets/images', type, slug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/${type}/${slug}/thumbnail.webp`;
    }
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  const width = widthMap[size] || 480;
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp` : '';
}

// srcset 헬퍼 - 반응형 이미지용 (xs 200w, sm 480w)
function getLocalReportThumbnailSrcset(type, slug, originalUrl) {
  const xsUrl = getLocalReportThumbnail(type, slug, originalUrl, 'xs');
  const smUrl = getLocalReportThumbnail(type, slug, originalUrl, 'sm');
  // xs와 sm이 같으면 srcset 불필요
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} 200w, ${smUrl} 480w`,
    sizes: '(max-width: 768px) 133px, 253px'
  };
}

// 일간 뉴스 썸네일 로컬 경로 헬퍼 (날짜 + URL 해시 기반)
function getLocalDailyThumbnail(date, originalUrl, width = 480) {
  if (!originalUrl) return '';
  let url = originalUrl;
  if (url.startsWith('//')) url = 'https:' + url;

  if (!date || !url.startsWith('http')) {
    return url.startsWith('http') ? `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp` : url;
  }

  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  const localPath = `/assets/images/daily/${date}/${hash}.webp`;
  const fullPath = path.join(docsDir, 'assets/images/daily', date, `${hash}.webp`);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp`;
}

function getLocalDailyThumbnailSrcset(date, originalUrl) {
  const xsUrl = getLocalDailyThumbnail(date, originalUrl, 200);
  const smUrl = getLocalDailyThumbnail(date, originalUrl, 480);
  if (!smUrl) return { src: '', srcset: '' };
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} 200w, ${smUrl} 480w`,
    sizes: '(max-width: 768px) 133px, 253px'
  };
}

module.exports = {
  getLocalReportThumbnail,
  getLocalReportThumbnailSrcset,
  getLocalDailyThumbnail,
  getLocalDailyThumbnailSrcset,
};
