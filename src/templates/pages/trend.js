/**
 * 트렌드 페이지 템플릿
 * NOTE: 복잡한 기능은 추후 추가 예정
 */

const fs = require('fs');
const path = require('path');
const { wrapWithLayout, AD_SLOTS, generateAdSlot, generateAdPairSlot, generateMidAdPairSlot, generateNativeAdSlot, generateMultiplexAdSlot } = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// docs 폴더 경로 (이미지 로컬 확인용)
const docsDir = path.join(__dirname, '../../../docs');

// history 폴더 경로 (순위 분석 차트용)
const historyDir = path.join(__dirname, '../../../history');

// games.json 경로
const gamesJsonPath = path.join(__dirname, '../../../data/games.json');

// 광고 활성화 여부
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';

// 이슈/핫픽/인사이트 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
// size: 'sm' = 리스트용 작은 썸네일 (480px), 'lg' = 상세 페이지용 큰 썸네일 (1200px)
function getLocalReportThumbnail(type, slug, originalUrl, size = 'lg') {
  if (!type || !slug) return originalUrl || '';

  const filename = size === 'sm' ? 'thumbnail-sm.webp' : 'thumbnail.webp';
  const localPath = `/assets/images/${type}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images', type, slug, filename);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 폴백: 기존 thumbnail.webp 확인 (sm이 없을 경우)
  if (size === 'sm') {
    const fallbackPath = path.join(docsDir, 'assets/images', type, slug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/${type}/${slug}/thumbnail.webp`;
    }
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  const width = size === 'sm' ? 480 : 1200;
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp` : '';
}

// 일간 뉴스 썸네일 로컬 경로 헬퍼 (MD5 해시 기반 + 모든 날짜 검색)
function getLocalDailyThumbnail(date, originalUrl) {
  if (!originalUrl) return '';
  let url = originalUrl;
  if (url.startsWith('//')) url = 'https:' + url;

  if (!url.startsWith('http')) {
    return url;
  }

  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);

  // 1. 우선 해당 날짜에서 검색
  if (date) {
    const fullPath = path.join(docsDir, 'assets/images/daily', date, `${hash}.webp`);
    if (fs.existsSync(fullPath)) {
      return `/assets/images/daily/${date}/${hash}.webp`;
    }
  }

  // 2. 해당 날짜에 없으면 모든 daily 폴더에서 검색 (최근 날짜 우선)
  const dailyDir = path.join(docsDir, 'assets/images/daily');
  if (fs.existsSync(dailyDir)) {
    const dateDirs = fs.readdirSync(dailyDir)
      .filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/))
      .sort((a, b) => b.localeCompare(a)); // 최근 날짜 우선
    for (const d of dateDirs) {
      const fullPath = path.join(dailyDir, d, `${hash}.webp`);
      if (fs.existsSync(fullPath)) {
        return `/assets/images/daily/${d}/${hash}.webp`;
      }
    }
  }

  // 로컬 없으면 프록시
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=480&output=webp`;
}

// 주간 뉴스 썸네일 로컬 경로 헬퍼 (여러 날짜 + weekly 폴더에서 검색)
function getLocalDailyThumbnailFromWeek(dates, originalUrl, weeklySlug = '') {
  if (!originalUrl) return '';
  let url = originalUrl;
  if (url.startsWith('//')) url = 'https:' + url;

  if (!url.startsWith('http')) {
    return url;
  }

  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);

  // 1. weekly 폴더에서 먼저 검색 (주간 리포트용 이미지)
  if (weeklySlug) {
    const weeklyPath = path.join(docsDir, 'assets/images/weekly', weeklySlug, `${hash}.webp`);
    if (fs.existsSync(weeklyPath)) {
      return `/assets/images/weekly/${weeklySlug}/${hash}.webp`;
    }
  }

  // 2. daily 폴더에서 검색
  if (dates && dates.length) {
    for (const date of dates) {
      const fullPath = path.join(docsDir, 'assets/images/daily', date, `${hash}.webp`);
      if (fs.existsSync(fullPath)) {
        return `/assets/images/daily/${date}/${hash}.webp`;
      }
    }
  }

  // 3. 모든 daily 폴더에서 검색 (최근 날짜 우선)
  const dailyDir = path.join(docsDir, 'assets/images/daily');
  if (fs.existsSync(dailyDir)) {
    const dateDirs = fs.readdirSync(dailyDir)
      .filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/))
      .sort((a, b) => b.localeCompare(a));
    for (const d of dateDirs) {
      const fullPath = path.join(dailyDir, d, `${hash}.webp`);
      if (fs.existsSync(fullPath)) {
        return `/assets/images/daily/${d}/${hash}.webp`;
      }
    }
  }

  // 로컬 없으면 프록시
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=480&output=webp`;
}

// games.json 로드 (게임 아이콘용)
let gamesMap = {};
try {
  const gamesPath = path.join(__dirname, '../../../data/games.json');
  if (fs.existsSync(gamesPath)) {
    const data = JSON.parse(fs.readFileSync(gamesPath, 'utf8').replace(/^\uFEFF/, ''));
    gamesMap = data.games || {};
  }
} catch (e) {
  // 로드 실패 시 빈 객체
}

// ========== 순위 분석 차트 헬퍼 ==========

// 히스토리 파일에서 특정 기간의 게임 순위 데이터 로드
function loadGameRankHistory(gameSlug, startDate, endDate, category = 'grossing', market = 'ios') {
  if (!fs.existsSync(historyDir)) return [];

  // 게임 정보 찾기
  let gameInfo = null;
  let gameName = null;
  for (const [name, info] of Object.entries(gamesMap)) {
    if (info.slug === gameSlug) {
      gameInfo = info;
      gameName = name;
      break;
    }
  }
  if (!gameInfo) return [];

  const allNames = [gameName, ...(gameInfo.aliases || [])].map(n => n.toLowerCase().trim());
  const appIds = gameInfo.appIds || {};
  const platform = market === 'ios' ? 'ios' : 'android';

  // 히스토리 파일 목록
  const files = fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.json') && !f.includes('mentions'))
    .filter(f => {
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) return false;
      const fileDate = dateMatch[1];
      return fileDate >= startDate && fileDate <= endDate;
    })
    .sort();

  const result = [];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dayData = { date: dateMatch[1] };
      const keyPrefix = platform === 'ios' ? 'ios' : 'aos';

      for (const region of regions) {
        const expectedAppId = appIds[platform] || appIds[`${platform}:${region}`];
        const bestRankKey = `${keyPrefix}_${region}_${category}`;

        // 1. bestRanks 우선 사용 (일 최고순위) - 게임 페이지와 동일
        if (data.bestRanks?.[bestRankKey] && expectedAppId) {
          const bestRank = data.bestRanks[bestRankKey][String(expectedAppId)];
          if (bestRank) {
            dayData[region] = bestRank;
            continue;
          }
        }

        // 2. bestRanks에 없으면 rankings에서 검색 (폴백)
        const items = data.rankings?.[category]?.[region]?.[platform] || [];

        // appId 매칭 우선
        let matchedIndex = -1;
        if (expectedAppId) {
          for (let i = 0; i < items.length; i++) {
            if (String(items[i].appId) === String(expectedAppId)) {
              matchedIndex = i;
              break;
            }
          }
        }
        // 이름 매칭 폴백
        if (matchedIndex < 0) {
          for (let i = 0; i < items.length; i++) {
            if (allNames.includes((items[i].title || '').toLowerCase().trim())) {
              matchedIndex = i;
              break;
            }
          }
        }

        if (matchedIndex >= 0) {
          dayData[region] = matchedIndex + 1;
        }
      }

      // 최소 하나 이상의 지역 데이터가 있으면 추가
      if (Object.keys(dayData).length > 1) {
        result.push(dayData);
      }
    } catch (e) {
      // 파싱 실패 무시
    }
  }

  return result;
}

// 비교 차트 SVG 생성 - 게임 페이지 차트와 동일한 스타일
function generateComparisonChart(chartBlock) {
  const { games = [], category = 'grossing', market = 'ios', startDate, endDate, title } = chartBlock;

  if (!games.length || !startDate || !endDate) {
    return '<div class="chart-error">차트 데이터가 부족합니다</div>';
  }

  // 각 게임의 순위 데이터 로드
  const gameDataList = games.map(slug => {
    const history = loadGameRankHistory(slug, startDate, endDate, category, market);
    const gameInfo = Object.entries(gamesMap).find(([name, info]) => info.slug === slug);
    return {
      slug,
      name: gameInfo ? gameInfo[0] : slug,
      icon: gameInfo ? gameInfo[1].icon : null,
      history
    };
  }).filter(g => g.history.length > 0);

  if (gameDataList.length === 0) {
    return '<div class="chart-error">순위 데이터가 없습니다</div>';
  }

  // 차트 설정 - 게임 페이지와 동일
  const width = 400;
  const height = 200;
  const padding = { top: 6, right: 4, bottom: 18, left: 18 };
  const xLabelPadding = 16;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const xLabelWidth = chartWidth - xLabelPadding * 2;

  // startDate~endDate 전체 날짜 생성
  const allDates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }

  // Y축 범위: iOS=100, Android=200 고정
  const yMin = 1;
  const yMax = market === 'ios' ? 100 : 200;

  // 좌표 계산 헬퍼 - 게임 페이지와 동일한 방식
  const getX = (i) => padding.left + xLabelPadding + (i / Math.max(1, allDates.length - 1)) * xLabelWidth;
  const getY = (rank) => padding.top + ((rank - yMin) / (yMax - yMin)) * chartHeight;

  // 게임별 색상
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

  // SVG 시작 - 게임 페이지와 동일한 클래스
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" preserveAspectRatio="xMidYMid meet">`;

  // Y축 그리드
  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const val = Math.round(yMin + (i / tickCount) * (yMax - yMin));
    if (!yTicks.includes(val)) yTicks.push(val);
  }

  yTicks.forEach(tick => {
    const y = getY(tick);
    const yLabelX = padding.left / 2 - 3;
    svg += `<line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"/>`;
    svg += `<text class="chart-ylabel" x="${yLabelX}" y="${y}" text-anchor="middle" dominant-baseline="middle">${tick}</text>`;
  });

  // X축 라벨 (날짜)
  allDates.forEach((date, i) => {
    const x = getX(i);
    const month = parseInt(date.slice(5, 7), 10);
    const day = parseInt(date.slice(8, 10), 10);
    const label = `${month}월${day}일`;
    svg += `<text class="chart-xlabel" x="${x}" y="${height - 2}" text-anchor="middle">${label}</text>`;
  });

  // 게임별 라인 그리기
  gameDataList.forEach((game, gameIdx) => {
    const color = colors[gameIdx % colors.length];
    const allPoints = []; // 모든 포인트 (null 포함)

    allDates.forEach((date, i) => {
      const dayData = game.history.find(h => h.date === date);
      if (dayData && dayData.kr) {
        allPoints.push({ x: getX(i), y: getY(dayData.kr), rank: dayData.kr });
      } else {
        allPoints.push(null); // 데이터 없는 날짜
      }
    });

    // 연속된 구간만 선으로 연결 (데이터 없는 구간에서 끊기)
    let segment = [];
    allPoints.forEach((p, i) => {
      if (p) {
        segment.push(p);
      } else {
        // 데이터 없으면 현재 구간 그리고 새 구간 시작
        if (segment.length > 1) {
          const linePoints = segment.map(pt => `${pt.x},${pt.y}`).join(' ');
          svg += `<polyline class="chart-line" stroke="${color}" points="${linePoints}"/>`;
        }
        segment = [];
      }
    });
    // 마지막 구간 처리
    if (segment.length > 1) {
      const linePoints = segment.map(pt => `${pt.x},${pt.y}`).join(' ');
      svg += `<polyline class="chart-line" stroke="${color}" points="${linePoints}"/>`;
    }

    // 점 먼저 그리기
    allPoints.filter(Boolean).forEach(p => {
      svg += `<circle class="chart-dot" fill="${color}" cx="${p.x}" cy="${p.y}" r="2.5"/>`;
    });

    // 라벨은 나중에 그려서 항상 앞에 표시
    allPoints.filter(Boolean).forEach(p => {
      const labelY = p.y < 20 ? p.y + 14 : p.y - 6;
      svg += `<text class="chart-rank-label" fill="${color}" x="${p.x}" y="${labelY}" text-anchor="middle">${p.rank}</text>`;
    });
  });

  svg += '</svg>';

  // 범례
  const legendHtml = gameDataList.map((game, i) => {
    const color = colors[i % colors.length];
    const iconHtml = game.icon ? `<img src="${game.icon}" alt="" class="chart-legend-icon">` : '';
    return `<span class="chart-legend-item" style="--color: ${color}">${iconHtml}${game.name}</span>`;
  }).join('');

  // 차트 제목
  const categoryLabel = category === 'grossing' ? '매출' : '인기';
  const marketLabel = market === 'ios' ? 'iOS' : 'Android';
  const chartTitle = title || `${marketLabel} ${categoryLabel} 순위 비교 (한국)`;

  return `
    <div class="blog-chart-wrapper">
      <div class="chart-header">
        <h4 class="chart-title">${chartTitle}</h4>
        <div class="chart-legend">${legendHtml}</div>
      </div>
      <div class="chart-container">${svg}</div>
      <div class="chart-period">${startDate} ~ ${endDate}</div>
    </div>
  `;
}

// ========== 순위 분석 차트 헬퍼 끝 ==========

// 게임명으로 아이콘 찾기
const findGameIcon = (text) => {
  if (!text || !Object.keys(gamesMap).length) return null;
  // 게임명 또는 별칭으로 찾기
  for (const [name, game] of Object.entries(gamesMap)) {
    if (text.includes(name) || (game.aliases && game.aliases.some(a => text.includes(a)))) {
      return game.icon || null;
    }
  }
  return null;
};

// PC + 모바일 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);

// URL 수정 헬퍼 (이미지 프록시, width: 용도별 크기)
const fixUrl = (url, width = 480) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;

  // CORS 허용된 도메인은 직접 로드 (화이트리스트)
  const corsAllowed = [
    'steamstatic.com',
    'steamcdn-a.akamaihd.net',
    'googleusercontent.com',
    'gamerscroll.com'
  ];
  if (corsAllowed.some(d => url.includes(d))) return url;

  // 나머지 외부 이미지는 프록시
  if (url.startsWith('http')) {
    const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=' + width + '&output=webp';
    return proxyUrl;
  }
  return url;
};

// 날짜 형식화 함수 (2026-01-01 → 2026년 1월 1일)
function formatDateKorean(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const year = parseInt(match[1]);
  const month = parseInt(match[2]);
  const day = parseInt(match[3]);
  return `${year}년 ${month}월 ${day}일`;
}

// 이슈 로컬 이미지 경로 헬퍼
// 다운로드된 로컬 이미지가 있으면 로컬 경로 반환, 없으면 원본 URL 반환
const DOCS_DIR = path.join(__dirname, '../../../docs');
const ISSUE_IMAGES_DIR = path.join(DOCS_DIR, 'assets/images/issue');
const WIKI_IMAGES_DIR = path.join(DOCS_DIR, 'assets/images/wiki');
const INSIGHT_IMAGES_DIR = path.join(DOCS_DIR, 'assets/images/insight');
const HOTPICK_IMAGES_DIR = path.join(DOCS_DIR, 'assets/images/hotpick');

function getLocalIssueImagePath(slug, originalUrl, imageType = 'content', imageIndex = 1) {
  if (!slug || !originalUrl) return originalUrl;

  // 이미 로컬 경로면 그대로 반환
  if (originalUrl.startsWith('/assets/')) return originalUrl;

  // 파일명 베이스 결정
  let fileBase;
  if (imageType === 'thumbnail') {
    fileBase = 'thumbnail';
  } else {
    fileBase = String(imageIndex).padStart(2, '0');
  }

  // WebP 우선 탐색, 없으면 원본 확장자
  const webpPath = path.join(ISSUE_IMAGES_DIR, slug, `${fileBase}.webp`);
  if (fs.existsSync(webpPath)) {
    return `/assets/images/issue/${slug}/${fileBase}.webp`;
  }

  // 원본 확장자로 탐색
  let ext = '.jpg';
  try {
    const urlPath = new URL(originalUrl).pathname;
    const extMatch = path.extname(urlPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extMatch)) {
      ext = extMatch;
    }
  } catch (e) {}

  const localPath = path.join(ISSUE_IMAGES_DIR, slug, `${fileBase}${ext}`);
  if (fs.existsSync(localPath)) {
    return `/assets/images/issue/${slug}/${fileBase}${ext}`;
  }

  // 로컬 파일 없으면 원본 URL 반환 (fixUrl 통해서)
  return fixUrl(originalUrl);
}

// 인사이트 로컬 이미지 경로 헬퍼
function getLocalInsightImagePath(slug, originalUrl, imageType = 'content', imageIndex = 1) {
  if (!slug || !originalUrl) return originalUrl;

  // 이미 로컬 경로면 그대로 반환
  if (originalUrl.startsWith('/assets/')) return originalUrl;

  // 파일명 베이스 결정
  let fileBase;
  if (imageType === 'thumbnail') {
    fileBase = 'thumbnail';
  } else {
    fileBase = String(imageIndex).padStart(2, '0');
  }

  // WebP 우선 탐색, 없으면 원본 확장자
  const webpPath = path.join(INSIGHT_IMAGES_DIR, slug, `${fileBase}.webp`);
  if (fs.existsSync(webpPath)) {
    return `/assets/images/insight/${slug}/${fileBase}.webp`;
  }

  // 원본 확장자로 탐색
  let ext = '.jpg';
  try {
    const urlPath = new URL(originalUrl).pathname;
    const extMatch = path.extname(urlPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extMatch)) {
      ext = extMatch;
    }
  } catch (e) {}

  const localPath = path.join(INSIGHT_IMAGES_DIR, slug, `${fileBase}${ext}`);
  if (fs.existsSync(localPath)) {
    return `/assets/images/insight/${slug}/${fileBase}${ext}`;
  }

  // 로컬 파일 없으면 원본 URL 반환 (fixUrl 통해서)
  return fixUrl(originalUrl);
}

// 핫픽 로컬 이미지 경로 헬퍼
function getLocalHotpickImagePath(slug, originalUrl, imageType = 'content', imageIndex = 1) {
  if (!slug || !originalUrl) return originalUrl;

  // 이미 로컬 경로면 그대로 반환
  if (originalUrl.startsWith('/assets/')) return originalUrl;

  // 파일명 베이스 결정
  let fileBase;
  if (imageType === 'thumbnail') {
    fileBase = 'thumbnail';
  } else {
    fileBase = String(imageIndex).padStart(2, '0');
  }

  // WebP 우선 탐색, 없으면 원본 확장자
  const webpPath = path.join(HOTPICK_IMAGES_DIR, slug, `${fileBase}.webp`);
  if (fs.existsSync(webpPath)) {
    return `/assets/images/hotpick/${slug}/${fileBase}.webp`;
  }

  // 원본 확장자로 탐색
  let ext = '.jpg';
  try {
    const urlPath = new URL(originalUrl).pathname;
    const extMatch = path.extname(urlPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extMatch)) {
      ext = extMatch;
    }
  } catch (e) {}

  const localPath = path.join(HOTPICK_IMAGES_DIR, slug, `${fileBase}${ext}`);
  if (fs.existsSync(localPath)) {
    return `/assets/images/hotpick/${slug}/${fileBase}${ext}`;
  }

  // 로컬 파일 없으면 원본 URL 반환 (fixUrl 통해서)
  return fixUrl(originalUrl);
}

// 위키 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
function getLocalWikiThumbPath(category, slug, originalUrl) {
  if (!category || !slug) return originalUrl || '/favicon.svg';

  const localPath = `/assets/images/wiki/${category}/${slug}/thumbnail.webp`;
  const fullPath = path.join(WIKI_IMAGES_DIR, category, slug, 'thumbnail.webp');

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}` : '/favicon.svg';
}

// 중간 광고 슬롯 생성 (PC + 모바일)
// 중복 슬롯ID 방지를 위해 호출부에서 PC/Mobile 슬롯을 분리해서 넘겨주세요.
const midSlotPairs = [
  { pc: AD_SLOTS.ResponsivePC002, mobile: AD_SLOTS.Mobile002 },
  { pc: AD_SLOTS.ResponsivePC003, mobile: AD_SLOTS.Mobile003 },
  { pc: AD_SLOTS.ResponsivePC004, mobile: AD_SLOTS.Mobile004 }
];
let midCursor = 0;

function generateMidAdSlot(pcSlotId, mobileSlotId) {
  const pcSlot = pcSlotId || AD_SLOTS.ResponsivePC002;
  const mobileSlot = mobileSlotId || AD_SLOTS.Mobile002;
  return generateMidAdPairSlot(pcSlot, mobileSlot);
}

// 자동 슬롯 순환 (midSlotPairs 사용)
const midAd = () => {
  const pair = midSlotPairs[midCursor % midSlotPairs.length];
  midCursor += 1;
  return generateMidAdSlot(pair.pc, pair.mobile);
};

// 태그 아이콘 매핑
const tagIcons = {
  '모바일': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
  'PC': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  '콘솔': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M16 10h.01M18 14h.01"/></svg>',
  'e스포츠': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6-3 6 3"/><path d="M6 9v8l6 3 6-3V9"/><path d="M12 6v15"/></svg>'
};

const fixedTagClasses = {
  '급상승': 'tag-up', '급하락': 'tag-down', '신규진입': 'tag-new',
  '매출': 'tag-revenue', '동접': 'tag-players'
};

// SVG 아이콘 정의 (주간용)
const icons = {
  fire: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/><path d="M12 12c0 2-1.5 3-1.5 5a1.5 1.5 0 0 0 3 0c0-2-1.5-3-1.5-5z"/></svg>`,
  chart: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>`,
  building: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></svg>`,
  metric: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`,
  community: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  stream: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  stock: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  edit: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trophy: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  calendar: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  globe: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
};

// 주간 패널 생성 함수 (원본 html.js의 generateWeeklyReport와 동일)
function generateWeeklyPanel(weeklyInsight) {
  if (!weeklyInsight?.ai) {
    return '<div class="home-empty">주간를 불러올 수 없습니다</div>';
  }

  const wai = weeklyInsight.ai;
  const wInfo = weeklyInsight.weekInfo || {};
  const weekDates = wInfo.dates || []; // 주간 날짜 배열 (이미지 검색용)
  const weekPeriod = wInfo.startDate && wInfo.endDate
    ? `${formatDateKorean(wInfo.startDate)} ~ ${formatDateKorean(wInfo.endDate)}`
    : (wai.date ? formatDateKorean(wai.date) : '');
  const weekNum = wInfo.weekNumber || wai.weekNumber || '';
  // 주간 slug 생성 (예: 2026-W04)
  const weekYear = wInfo.year || (wInfo.startDate ? wInfo.startDate.slice(0, 4) : new Date().getFullYear());
  const weeklySlug = weekNum ? `${weekYear}-W${String(weekNum).padStart(2, '0')}` : '';

  const { issues = [], industryIssues = [], metrics = [], rankings = [], community = [], streaming = [], stocks = {}, summary, mvp, releases = [], global = [] } = wai;

  // seoTitle 미리 계산
  const formatWeekTitle = (period, wNum) => {
    const match = period.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const month = parseInt(match[2]);
      const weekOfMonth = Math.ceil(parseInt(match[3]) / 7);
      return `${month}월 ${weekOfMonth}주차 게임 브리핑`;
    }
    return `${wNum}주차 게임 브리핑`;
  };
  const seoTitle = formatWeekTitle(weekPeriod, weekNum);

  // summary 객체에서 title과 desc 추출
  // summary에서 첫 문장 추출
  const extractFirst = (t) => t ? (t.split(/[.!?]/).filter(s => s.trim())[0]?.trim() || t.slice(0, 60)) : null;
  const summaryTitle = typeof summary === 'object' ? summary.title : (wai.issues?.[0]?.title || extractFirst(summary) || seoTitle);
  const summaryDesc = typeof summary === 'object' ? summary.desc : summary;
  // 모바일용 인피드 슬롯
  const mobileNativeSlots = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];
  const localMidSlotPairs = [
    { pc: AD_SLOTS.ResponsivePC002, mobile: AD_SLOTS.Mobile002 },
    { pc: AD_SLOTS.ResponsivePC003, mobile: AD_SLOTS.Mobile003 },
    { pc: AD_SLOTS.ResponsivePC004, mobile: AD_SLOTS.Mobile004 }
  ];
  let localMidCursor = 0;
  const midAd = () => {
    // 통합 반응형 빌드: PC 슬롯 사용 (CSS 미디어 쿼리로 자동 분기)
    const idx = localMidCursor % localMidSlotPairs.length;
    localMidCursor += 1;
    return generateMidAdSlot(localMidSlotPairs[idx].pc, localMidSlotPairs[idx].mobile);
  };

  // 태그별 아이콘 매핑
  const getTagIcon = (tag) => {
    if (tag === '모바일') return tagIcons['모바일'];
    if (tag === 'PC') return tagIcons['PC'];
    if (tag === '콘솔') return tagIcons['콘솔'];
    if (tag === 'e스포츠') return tagIcons['e스포츠'];
    return '';
  };

  // 금주의 핫이슈 (2x2 그리드) - 최대 4개, 이미지 포함
  const hotIssuesSection = issues.length > 0 ? `
    <div class="weekly-section weekly-section-hot">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">금주의 핫이슈</h2>
        </div>
        <p class="weekly-section-desc">지난 주 게임 업계에서 가장 주목받은 소식들을 정리했습니다.</p>
      </div>
      <div class="weekly-hot-issues weekly-hot-grid">
        ${issues.slice(0, 4).map(issue => {
          const thumbnail = issue.thumbnail ? getLocalDailyThumbnailFromWeek(weekDates, issue.thumbnail, weeklySlug) : null;
          const thumbnailHtml = thumbnail
            ? `<div class="weekly-hot-thumb"><img src="${thumbnail}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
            : '';
          return `
          <div class="weekly-hot-card ${thumbnail ? 'has-thumb' : ''}">
            ${thumbnailHtml}
            <div class="weekly-hot-content">
              <h3 class="weekly-hot-title">${issue.title}</h3>
              <p class="weekly-hot-desc">${issue.desc}</p>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  ` : '';

  // 순위 변동 분석 (비주얼 차트)
  const rankingsSection = rankings.length > 0 ? `
    <div class="weekly-section weekly-section-rankings">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">순위 변동 분석</h2>
        </div>
        <p class="weekly-section-desc">앱스토어/플레이스토어 매출 순위에서 주목할 만한 변동이 있었던 게임들입니다.</p>
      </div>
      <div class="weekly-rankings-grid">
        ${rankings.map(r => {
          const isUp = r.tag === '급상승' || r.change > 0;
          const isDown = r.tag === '급하락' || r.change < 0;
          const isNew = r.tag === '신규진입';
          const changeClass = isUp ? 'up' : isDown ? 'down' : 'new';
          const changeIcon = isUp ? '▲' : isDown ? '▼' : '★';
          const changeText = isNew ? 'NEW' : (r.change > 0 ? `+${r.change}` : r.change);

          return `
            <div class="weekly-rank-card ${changeClass}">
              <div class="weekly-rank-header">
                <span class="weekly-rank-badge ${changeClass}">${r.tag}</span>
                <span class="weekly-rank-platform">${r.platform || ''}</span>
              </div>
              <div class="weekly-rank-game">${r.title}</div>
              <div class="weekly-rank-change">
                <span class="weekly-rank-arrow ${changeClass}">${changeIcon}</span>
                <span class="weekly-rank-positions">
                  ${isNew ? `${r.rank}위 진입` : `${r.prevRank}위 → ${r.rank}위`}
                </span>
                <span class="weekly-rank-delta ${changeClass}">${changeText}</span>
              </div>
              <p class="weekly-rank-reason">${r.desc}</p>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // 업계 동향 (썸네일 포함 카드)
  const industrySection = industryIssues.length > 0 ? `
    <div class="weekly-section weekly-section-industry">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">업계 동향</h2>
        </div>
        <p class="weekly-section-desc">국내 게임사들의 주요 발표와 업계 전반의 움직임을 살펴봅니다.</p>
      </div>
      <div class="industry-grid">
        ${industryIssues.map(item => {
          const thumbUrl = item.thumbnail ? getLocalDailyThumbnailFromWeek(weekDates, item.thumbnail, weeklySlug) : null;
          const thumbHtml = thumbUrl
            ? `<div class="industry-thumb"><img src="${thumbUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
            : `<div class="industry-thumb thumb-fallback"></div>`;
          return `
          <div class="industry-card has-thumb">
            ${thumbHtml}
            <div class="industry-content">
              <h3 class="industry-title">${item.title || ''}</h3>
              <p class="industry-desc">${item.desc || ''}</p>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  ` : '';

  // 주간 지표 (썸네일 포함 카드)
  const metricsSection = metrics.length > 0 ? `
    <div class="weekly-section weekly-section-metrics">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">주간 지표</h2>
        </div>
        <p class="weekly-section-desc">지난 주 주목할 만한 수치 변화와 시장 지표입니다.</p>
      </div>
      <div class="weekly-metrics-grid">
        ${metrics.map((m, idx) => {
          const thumbUrl = m.thumbnail ? getLocalDailyThumbnailFromWeek(weekDates, m.thumbnail, weeklySlug) : null;
          const gameIcon = findGameIcon(m.title);
          const imageUrl = thumbUrl || gameIcon || '/favicon.svg';
          const thumbHtml = `<div class="metric-thumb"><img src="${imageUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`;
          return `
            <div class="weekly-metric-card has-thumb">
              ${thumbHtml}
              <div class="weekly-metric-content">
                <h3 class="weekly-metric-title">${m.title}</h3>
                <p class="weekly-metric-desc">${m.desc}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // 커뮤니티 반응 (말풍선 스타일)
  const communitySection = community.length > 0 ? `
    <div class="weekly-section weekly-section-community">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">커뮤니티 반응</h2>
        </div>
        <p class="weekly-section-desc">디시인사이드, 아카라이브, 인벤 등 주요 게임 커뮤니티에서 화제가 된 이슈들입니다.</p>
      </div>
      <div class="weekly-community-grid">
        ${community.map(c => {
          const tagPrefix = c.tag ? `[${c.tag}] ` : '';
          return `
          <div class="weekly-community-card">
            <h3 class="weekly-community-title">${tagPrefix}${c.title}</h3>
            <p class="weekly-community-desc">${c.desc}</p>
          </div>
        `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // 스트리밍 트렌드 (카드형 그리드)
  const streamingSection = streaming.length > 0 ? `
    <div class="weekly-section weekly-section-streaming">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">스트리밍 트렌드</h2>
        </div>
        <p class="weekly-section-desc">치지직, 유튜브 등 스트리밍 플랫폼에서의 게임 콘텐츠 동향입니다.</p>
      </div>
      <div class="weekly-streaming-grid">
        ${streaming.map(s => `
            <div class="weekly-streaming-card">
              <h3 class="weekly-streaming-title">${s.title}</h3>
              <p class="weekly-streaming-desc">${s.desc}</p>
            </div>
          `).join('')}
      </div>
    </div>
  ` : '';

  // 게임주 동향 (주간 전용)
  const stocksUp = stocks.up || [];
  const stocksDown = stocks.down || [];
  const hasStocks = stocksUp.length > 0 || stocksDown.length > 0;

  const renderStockRow = (stock, rank, isUp) => {
    const changeClass = isUp ? 'up' : 'down';
    const arrow = isUp ? '▲' : '▼';
    const sign = isUp ? '+' : '';
    return `
      <div class="weekly-stock-item">
        <div class="weekly-stock-row ${changeClass}">
          <div class="weekly-stock-rank">${rank}</div>
          <div class="weekly-stock-info">
            <span class="weekly-stock-name">${stock.name}</span>
            <span class="weekly-stock-price">${stock.price?.toLocaleString() || '-'}원</span>
          </div>
          <div class="weekly-stock-change ${changeClass}">
            <span class="weekly-stock-arrow">${arrow}</span>
            <span class="weekly-stock-percent">${sign}${stock.changePercent?.toFixed(2) || 0}%</span>
          </div>
        </div>
        <div class="weekly-stock-comment">${stock.comment || ''}</div>
      </div>
    `;
  };

  const stocksSection = hasStocks ? `
    <div class="weekly-section weekly-section-stocks">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">주간 게임주 분석</h2>
        </div>
        <p class="weekly-section-desc">지난주 종가 기준 게임 업종 등락률 TOP3와 주요 이슈입니다.</p>
      </div>
      <div class="weekly-stocks-tables">
        <div class="weekly-stocks-table">
          <div class="weekly-stocks-table-header up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            상승 TOP3
          </div>
          <div class="weekly-stocks-table-body">
            ${stocksUp.slice(0, 3).map((s, i) => renderStockRow(s, i + 1, true)).join('')}
          </div>
        </div>
        <div class="weekly-stocks-table">
          <div class="weekly-stocks-table-header down">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            하락 TOP3
          </div>
          <div class="weekly-stocks-table-body">
            ${stocksDown.slice(0, 3).map((s, i) => renderStockRow(s, i + 1, false)).join('')}
          </div>
        </div>
      </div>
    </div>
  ` : '';

  // 신작/업데이트 캘린더 섹션
  const releasesSection = releases && releases.length > 0 ? `
    <div class="weekly-section weekly-section-releases">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">이번 주 신작/업데이트</h2>
        </div>
        <p class="weekly-section-desc">이번 주 출시 예정이거나 업데이트된 주요 게임들입니다.</p>
      </div>
      <div class="weekly-releases-list">
        ${releases.slice(0, 6).map(r => `
          <div class="weekly-release-item">
            <div class="weekly-release-date">${r.date}</div>
            <div class="weekly-release-info">
              <span class="weekly-release-title">${r.title}</span>
              <span class="weekly-release-platform">${r.platform}</span>
            </div>
            <div class="weekly-release-type ${r.type === '신작' ? 'new' : 'update'}">${r.type}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // MVP 섹션 (썸네일 포함)
  const mvpSection = mvp ? `
    <div class="weekly-section weekly-section-mvp">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">이 주의 MVP</h2>
        </div>
        <p class="weekly-section-desc">지난 주 가장 주목받은 게임입니다.</p>
      </div>
      <div class="weekly-mvp-card ${mvp.thumbnail ? 'has-thumb' : ''}">
        ${(() => {
          const thumbUrl = mvp.thumbnail ? getLocalDailyThumbnailFromWeek(weekDates, mvp.thumbnail, weeklySlug) : null;
          const gameIcon = findGameIcon(mvp.name);
          const imageUrl = thumbUrl || gameIcon;
          return imageUrl
            ? `<div class="weekly-mvp-thumb${gameIcon && !thumbUrl ? ' is-icon' : ''}"><img src="${imageUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
            : '';
        })()}
        <div class="weekly-mvp-content">
          <div class="weekly-mvp-name">${mvp.name}</div>
          ${mvp.tag ? `<div class="weekly-mvp-tag">${mvp.tag}</div>` : ''}
          <p class="weekly-mvp-desc">${mvp.desc}</p>
          ${mvp.highlights?.length ? `<ul class="weekly-mvp-highlights">${mvp.highlights.map(h => `<li class="weekly-mvp-highlight">${h}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
    </div>
  ` : '';

  // 글로벌 트렌드 섹션 (썸네일 포함, 태그 제거)
  const globalSection = global && global.length > 0 ? `
    <div class="weekly-section weekly-section-global">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <h2 class="weekly-section-title">글로벌 트렌드</h2>
        </div>
        <p class="weekly-section-desc">해외 게임 시장의 주요 동향을 살펴봅니다.</p>
      </div>
      <div class="global-grid">
        ${global.map(g => {
          const thumbUrl = g.thumbnail ? getLocalDailyThumbnailFromWeek(weekDates, g.thumbnail, weeklySlug) : null;
          const thumbHtml = thumbUrl
            ? `<div class="global-thumb"><img src="${thumbUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
            : `<div class="global-thumb thumb-fallback"></div>`;
          return `
          <div class="global-card has-thumb">
            ${thumbHtml}
            <div class="global-content">
              <h3 class="global-title">${g.title}</h3>
              <p class="global-desc">${g.desc}</p>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  ` : '';

  // 헤드라인 이미지
  const heroThumb = wai.thumbnail || null;
  const heroThumbUrl = heroThumb ? getLocalDailyThumbnailFromWeek(weekDates, heroThumb, weeklySlug) : null;

  // 통합 반응형 빌드: PC 레이아웃 사용 (CSS로 모바일 반응형 처리)
  const weeklyBody = `
      ${hotIssuesSection}
      ${rankingsSection}
      ${midAd()}
      ${industrySection}
      ${metricsSection}
      ${globalSection}
      ${mvpSection}
      ${midAd()}
      ${stocksSection}
      ${releasesSection}
      ${communitySection}
      ${streamingSection}
    `;

  return `
    <div class="weekly-report">
      ${weeklyBody}
    </div>
  `;
}

function generateTrendPage(data) {
  const { insight, rankings, steam, weeklyInsight, historyNews = [] } = data;
  const aiInsight = insight?.ai || null;
  const insightDate = insight?.date || aiInsight?.date || ''; // 일간 인사이트 날짜 (이미지 로컬 검색용)

  if (!aiInsight) {
    const content = `
      <section class="section active" id="insight">
        <div class="home-empty">트렌드를 불러올 수 없습니다</div>
      </section>
    `;
    return wrapWithLayout(content, {
      currentPage: 'trend',
      title: '게이머스크롤 | 게임 브리핑',
      description: '게임 브리핑 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 일간·주간로 한눈에 확인하세요.',
      canonical: `${siteBaseUrl}/magazine/`
    });
  }

  const getTagIcon = (tag) => tagIcons[tag] || '';
  const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

  // 아이템 렌더링 (일반) - 태그 제거, 제목만
  const renderItem = (item) => {
    // thumbnail 없으면 게임 아이콘 찾기
    const thumbnail = item.thumbnail || null;
    const gameIcon = !thumbnail ? findGameIcon(item.title) : null;
    const imageUrl = thumbnail ? getLocalDailyThumbnail(insightDate, thumbnail) : gameIcon;
    const imageHtml = imageUrl
      ? `<div class="weekly-hot-thumb${gameIcon ? ' is-icon' : ''}"><img src="${imageUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
      : '';
    return `
      <div class="weekly-hot-card ${imageUrl ? 'has-thumb' : ''}">
        ${imageHtml}
        <div class="weekly-hot-content">
          <h3 class="weekly-hot-title">${item.title || ''}</h3>
          <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
        </div>
      </div>
    `;
  };

  // 지표 아이템 렌더링 (썸네일 우선, 없으면 게임 아이콘)
  const renderMetricItem = (item) => {
    const thumbUrl = item.thumbnail ? getLocalDailyThumbnail(insightDate, item.thumbnail) : null;
    const gameIcon = findGameIcon(item.title);
    const imageUrl = thumbUrl || gameIcon || '/favicon.svg';
    const thumbHtml = `<div class="metric-thumb"><img src="${imageUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`;
    return `
      <div class="weekly-metric-card has-thumb">
        ${thumbHtml}
        <div class="weekly-metric-content">
          <h3 class="weekly-metric-title">${item.title || ''}</h3>
          <p class="weekly-metric-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
        </div>
      </div>
    `;
  };

  // 순위 변동 아이템 렌더링 - 제목 앞 인라인 아이콘
  const renderRankingItem = (item) => {
    const hasRankInfo = item.prevRank !== undefined && item.rank !== undefined;
    const changeText = item.change > 0 ? `+${item.change}` : item.change < 0 ? `${item.change}` : '0';
    const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : '';
    const platformText = item.platform ? `${item.platform} ` : '';
    const gameIcon = findGameIcon(item.title);

    const rankBadge = hasRankInfo ? `
      <span class="weekly-ranking-badge ${changeClass}">
        ${platformText}${item.prevRank}위 → ${item.rank}위 (${changeText})
      </span>
    ` : '';

    const iconHtml = `<img class="title-icon" src="${gameIcon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">`;

    return `
      <div class="weekly-hot-card ranking-item">
        <h3 class="weekly-hot-title">${iconHtml}${item.title || ''}</h3>
        ${rankBadge}
        <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
      </div>
    `;
  };

  // 카테고리 카드 렌더링 (일반)
  const renderCategoryCard = (title, items, sectionClass, iconSvg, useRankingRenderer = false, desc = '') => {
    if (!items || items.length === 0) return '';
    const renderer = useRankingRenderer ? renderRankingItem : renderItem;
    return `
      <div class="weekly-section ${sectionClass}">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-hot-issues">
          ${items.map(item => renderer(item)).join('')}
        </div>
      </div>
    `;
  };

  // 지표 섹션 렌더링 (게임 아이콘만 사용)
  const renderMetricsSection = (title, items, desc = '') => {
    if (!items || items.length === 0) return '';
    return `
      <div class="weekly-section weekly-section-metrics">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-metrics-grid">
          ${items.map(item => renderMetricItem(item)).join('')}
        </div>
      </div>
    `;
  };

  // 오늘의 핫이슈 렌더링 (2x2 그리드, 이미지 포함)
  const renderHotIssuesSection = (items, iconSvg) => {
    if (!items || items.length === 0) return '';
    const limitedItems = items.slice(0, 4); // 최대 4개
    return `
      <div class="weekly-section weekly-section-hot">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">오늘의 핫이슈</h2>
          </div>
          <p class="weekly-section-desc">오늘 게임 업계에서 가장 주목받은 소식들을 정리했습니다.</p>
        </div>
        <div class="weekly-hot-issues weekly-hot-grid">
          ${limitedItems.map(item => {
            const thumbnail = typeof findThumbnail === 'function' ? findThumbnail(item) : item.thumbnail;
            const thumbnailHtml = thumbnail
              ? `<div class="weekly-hot-thumb"><img src="${getLocalDailyThumbnail(insightDate, thumbnail)}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
              : '';
            return `
            <div class="weekly-hot-card ${thumbnail ? 'has-thumb' : ''}">
              ${thumbnailHtml}
              <div class="weekly-hot-content">
                <h3 class="weekly-hot-title">${item.title || ''}</h3>
                <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
  };

  // 유저 반응 카드 그리드 렌더링 (주간 스타일)
  const renderCommunityCards = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => {
      const tagPrefix = item.tag ? `[${item.tag}] ` : '';
      return `
      <div class="weekly-community-card">
        <h3 class="weekly-community-title">${tagPrefix}${item.title || ''}</h3>
        <p class="weekly-community-desc">${item.desc || ''}</p>
      </div>
    `;
    }).join('');
    return `
      <div class="weekly-section weekly-section-community">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-community-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 스트리밍 트렌드 카드 그리드 렌더링 (주간 스타일)
  const renderStreamingCards = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => `
        <div class="weekly-streaming-card">
          <h3 class="weekly-streaming-title">${item.title || ''}</h3>
          <p class="weekly-streaming-desc">${item.desc || ''}</p>
        </div>
      `).join('');
    return `
      <div class="weekly-section weekly-section-streaming">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-streaming-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 업계 동향 카드 렌더링 (썸네일 포함)
  const renderIndustrySection = (title, items, iconSvg, desc, historyNews = []) => {
    if (!items || items.length === 0) return '';

    // historyNews에서 썸네일 찾기
    const findThumb = (itemTitle) => {
      if (!historyNews.length) return null;
      const keywords = (itemTitle || '')
        .replace(/[,.'":;!?()[\]{}~`@#$%^&*+=|\\/<>]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .sort((a, b) => b.length - a.length);
      for (const keyword of keywords) {
        const match = historyNews.find(n => n.title && n.title.includes(keyword));
        if (match && match.thumbnail) return match.thumbnail;
      }
      return null;
    };

    const cards = items.map(item => {
      const thumb = item.thumbnail || findThumb(item.title);
      const thumbUrl = thumb ? getLocalDailyThumbnail(insightDate, thumb) : null;
      const thumbHtml = thumbUrl
        ? `<div class="industry-thumb"><img src="${thumbUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
        : `<div class="industry-thumb thumb-fallback"></div>`;
      return `
      <div class="industry-card has-thumb">
        ${thumbHtml}
        <div class="industry-content">
          <h3 class="industry-title">${item.title || ''}</h3>
          <p class="industry-desc">${item.desc || ''}</p>
        </div>
      </div>
    `;
    }).join('');
    return `
      <div class="weekly-section weekly-section-industry">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="industry-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 게임주 현황 섹션 렌더링 (일간용)
  const stockMap = {
    '크래프톤': '259960', '넷마블': '251270', '엔씨소프트': '036570',
    '카카오게임즈': '293490', '펄어비스': '263750', '위메이드': '112040',
    '컴투스': '078340', '넥슨게임즈': '225570', '스마일게이트': '',
    'NHN': '181710', '데브시스터즈': '194480', '시프트업': '462870',
    '더블유게임즈': '192080', 'SundayToz': '123420', '그라비티': '',
    '네오위즈': '095660', '웹젠': '069080', '드래곤플라이': '030350'
  };

  const renderStocksCard = (stocksData, stockPrices) => {
    if (!stocksData || stocksData.length === 0) return '';

    const renderStockItem = (stock) => {
      const codeMatchParen = stock.name?.match(/\((\d{6})\)/);
      const codeMatchHyphen = stock.name?.match(/^(\d{6})-/);
      let displayName, code;
      if (codeMatchHyphen) {
        code = codeMatchHyphen[1];
        displayName = stock.name.replace(/^\d{6}-/, '').trim();
      } else if (codeMatchParen) {
        code = codeMatchParen[1];
        displayName = stock.name.replace(/\(\d{6}\)/, '').trim();
      } else {
        displayName = stock.name?.trim() || '';
        code = stockMap[displayName] || '';
      }
      if (!code) return '';

      const candleChartUrl = `https://ssl.pstatic.net/imgfinance/chart/item/candle/day/${code}.png`;
      const stockUrl = `https://finance.naver.com/item/main.nhn?code=${code}`;
      const priceData = stockPrices?.[code] || {};
      const price = priceData.price ? priceData.price.toLocaleString() + '원' : '-';
      const change = priceData.change || 0;
      const changePercent = priceData.changePercent || 0;
      const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : '';
      const changeSign = change > 0 ? '▲' : change < 0 ? '▼' : '';
      const changeText = change > 0 ? `+${changePercent.toFixed(2)}%` : change < 0 ? `${changePercent.toFixed(2)}%` : '0%';
      // 날짜 파싱
      let dateStr = '종가';
      if (priceData.date) {
        const parts = priceData.date.split('.');
        if (parts.length === 3) {
          dateStr = `${parseInt(parts[1])}/${parseInt(parts[2])} 종가`;
        }
      }

      return `
        <a class="stock-item" href="${stockUrl}" target="_blank" rel="noopener">
          <div class="stock-info">
            <div class="stock-name-row">
              <span class="stock-name">${displayName}</span>
              <span class="stock-date">${dateStr}</span>
            </div>
            <div class="stock-price-row">
              <span class="stock-price-value ${changeClass}">${price}</span>
              <span class="stock-change-badge ${changeClass}">${changeSign} ${changeText}</span>
            </div>
          </div>
          <img class="stock-chart" src="${candleChartUrl}" alt="${displayName} 일봉 차트" data-img-fallback-src="/favicon.svg">
          <p class="stock-comment">${stock.comment || ''}</p>
        </a>
      `;
    };

    const stockItems = stocksData.map(renderStockItem).filter(item => item).join('');
    if (!stockItems) return '';

    return `
      <div class="weekly-section weekly-section-stocks">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">게임주 현황</h2>
          </div>
          <p class="weekly-section-desc">오늘 게임 업종 주요 종목의 시세 동향입니다.</p>
        </div>
        <div class="stocks-split">
          ${stockItems}
        </div>
      </div>
    `;
  };

  const issues = aiInsight.issues || [];
  // 업계 동향 데이터
  const industryIssues = aiInsight.industryIssues?.length > 0 ? aiInsight.industryIssues : [];
  const metrics = aiInsight.metrics || [];
  const rankingsData = aiInsight.rankings || [];
  const communityData = aiInsight.community || [];
  const streaming = aiInsight.streaming || [];
  // 게임주 데이터
  const stocksData = aiInsight.stocks || [];
  const stockPrices = insight?.stockPrices || {};

  // summary 객체에서 title과 desc 추출
  const summaryTitle = typeof aiInsight.summary === 'object' ? aiInsight.summary.title : (aiInsight.issues?.[0]?.title || '게임 브리핑');
  const summaryDesc = typeof aiInsight.summary === 'object' ? aiInsight.summary.desc : aiInsight.summary;
  // 모바일용 인피드 슬롯
  const mobileNativeSlots2 = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];
  const localMidSlotPairs = [
    { pc: AD_SLOTS.ResponsivePC002, mobile: AD_SLOTS.Mobile002 },
    { pc: AD_SLOTS.ResponsivePC003, mobile: AD_SLOTS.Mobile003 },
    { pc: AD_SLOTS.ResponsivePC004, mobile: AD_SLOTS.Mobile004 }
  ];
  let localMidCursor = 0;
  const midAd = () => {
    // 통합 반응형 빌드: PC 슬롯 사용 (CSS 미디어 쿼리로 자동 분기)
    const idx = localMidCursor % localMidSlotPairs.length;
    localMidCursor += 1;
    return generateMidAdSlot(localMidSlotPairs[idx].pc, localMidSlotPairs[idx].mobile);
  };
  // 통합 빌드에서는 빈 문자열 반환 (모바일 전용 광고는 CSS로 처리)
  const midAdMobileOnly = () => '';

  const content = `
    <section class="section active" id="insight">
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">${summaryTitle}</h1>
        <div class="insight-tabs">
          <button class="insight-tab active" data-tab="daily">일간</button>
          <button class="insight-tab" data-tab="weekly">주간</button>
        </div>

        <div class="insight-panel active" id="panel-daily">
          ${midAdMobileOnly()}
          ${renderHotIssuesSection(issues, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>')}
          ${midAd()}
          ${renderIndustrySection('업계 동향', industryIssues, '', '국내 게임사들의 주요 발표와 업계 전반의 움직임을 살펴봅니다.', historyNews)}
          ${renderMetricsSection('주목할만한 지표', metrics, '오늘 주목할 만한 수치 변화와 시장 지표입니다.')}
          ${renderCategoryCard('순위 변동', rankingsData, 'weekly-section-rankings', '', true, '앱스토어/플레이스토어 매출 순위에서 주목할 만한 변동이 있었던 게임들입니다.')}
          ${midAd()}
          ${renderStocksCard(stocksData, stockPrices)}
          ${renderCommunityCards('유저 반응', communityData, '', '디시인사이드, 아카라이브, 인벤 등 주요 게임 커뮤니티에서 화제가 된 이슈들입니다.')}
          ${renderStreamingCards('스트리밍 트렌드', streaming, '', '치지직, 유튜브 등 스트리밍 플랫폼에서의 게임 콘텐츠 동향입니다.')}
        </div>

        <div class="insight-panel" id="panel-weekly">
          ${generateWeeklyPanel(weeklyInsight, getTagIcon)}
        </div>
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 인사이트 탭 전환
    document.querySelectorAll('.insight-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.insight-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = 'panel-' + tab.dataset.tab;
        document.getElementById(panelId)?.classList.add('active');
        // 숨겨진 패널 내부 광고가 폭 0 상태에서 초기화되는 것을 방지하고, 활성화 후 재초기화 트리거
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: '게이머스크롤 | 게임 브리핑',
    description: '게임 브리핑 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 일간·주간로 한눈에 확인하세요.',
    canonical: `${siteBaseUrl}/magazine/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` }
    ]
  });
}

/**
 * 일간 상세 페이지 생성 (개별 JSON → HTML)
 * @param {Object} params
 * @param {Object} params.insight - 일간 인사이트 데이터 (ai 필드 포함)
 * @param {string} params.slug - URL slug (예: 2025-12-09)
 * @param {Object} params.nav - 이전/다음 리포트 정보 (optional)
 */
function generateDailyDetailPage({ insight, slug, nav = {}, historyNews = [] }) {
  const aiInsight = insight?.ai || null;

  // 썸네일 매칭 헬퍼 (issue.thumbnail 우선, 없으면 historyNews에서 키워드 매칭)
  const findThumbnail = (item) => {
    if (item.thumbnail) return item.thumbnail;
    if (!historyNews.length) return null;

    // 제목에서 키워드 추출
    const keywords = (item.title || '')
      .replace(/[,.'":;!?()[\]{}~`@#$%^&*+=|\\/<>]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // 키워드 매칭 (긴 키워드 우선)
    for (const keyword of keywords.sort((a, b) => b.length - a.length)) {
      const match = historyNews.find(n => n.title.includes(keyword));
      if (match) return match.thumbnail;
    }
    return null;
  };

  if (!aiInsight) {
    const content = `
      <section class="section active" id="insight">
        <div class="home-empty">일간를 불러올 수 없습니다</div>
      </section>
    `;
    return wrapWithLayout(content, {
      currentPage: 'trend',
      title: '게이머스크롤 | 게임 브리핑',
      description: '게임 브리핑를 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/daily/${slug}/`,
      noindex: true
    });
  }

  const getTagIcon = (tag) => tagIcons[tag] || '';
  const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

  // 아이템 렌더링 (일반, 이미지 포함)
  const renderItem = (item) => {
    // thumbnail 우선, 없으면 historyNews에서 찾기, 그래도 없으면 게임 아이콘
    const thumbnail = findThumbnail(item);
    const gameIcon = !thumbnail ? findGameIcon(item.title) : null;
    const imageUrl = thumbnail ? getLocalDailyThumbnail(slug, thumbnail) : gameIcon;
    const imageHtml = imageUrl
      ? `<div class="weekly-hot-thumb${gameIcon ? ' is-icon' : ''}"><img src="${imageUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
      : '';
    return `
      <div class="weekly-hot-card ${imageUrl ? 'has-thumb' : ''}">
        ${imageHtml}
        <div class="weekly-hot-content">
          <h3 class="weekly-hot-title">${item.title || ''}</h3>
          <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
        </div>
      </div>
    `;
  };

  // 순위 변동 아이템 렌더링 - 제목 앞 인라인 아이콘
  const renderRankingItem = (item) => {
    const hasRankInfo = item.prevRank !== undefined && item.rank !== undefined;
    const changeText = item.change > 0 ? `+${item.change}` : item.change < 0 ? `${item.change}` : '0';
    const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : '';
    const platformText = item.platform ? `${item.platform} ` : '';
    const gameIcon = findGameIcon(item.title);

    const rankBadge = hasRankInfo ? `
      <span class="weekly-ranking-badge ${changeClass}">
        ${platformText}${item.prevRank}위 → ${item.rank}위 (${changeText})
      </span>
    ` : '';

    const iconHtml = `<img class="title-icon" src="${gameIcon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">`;

    return `
      <div class="weekly-hot-card ranking-item">
        <h3 class="weekly-hot-title">${iconHtml}${item.title || ''}</h3>
        ${rankBadge}
        <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
      </div>
    `;
  };

  // 카테고리 카드 렌더링
  const renderCategoryCard = (title, items, sectionClass, iconSvg, useRankingRenderer = false, desc = '') => {
    if (!items || items.length === 0) return '';
    const renderer = useRankingRenderer ? renderRankingItem : renderItem;
    return `
      <div class="weekly-section ${sectionClass}">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-hot-issues">
          ${items.map(item => renderer(item)).join('')}
        </div>
      </div>
    `;
  };

  // 지표 아이템 렌더링 (썸네일 우선, 없으면 게임 아이콘)
  const renderMetricItem = (item) => {
    const thumbUrl = item.thumbnail ? getLocalDailyThumbnail(slug, item.thumbnail) : null;
    const gameIcon = findGameIcon(item.title);
    const imageUrl = thumbUrl || gameIcon || '/favicon.svg';
    const thumbHtml = `<div class="metric-thumb"><img src="${imageUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`;
    return `
      <div class="weekly-metric-card has-thumb">
        ${thumbHtml}
        <div class="weekly-metric-content">
          <h3 class="weekly-metric-title">${item.title || ''}</h3>
          <p class="weekly-metric-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
        </div>
      </div>
    `;
  };

  // 지표 섹션 렌더링 (게임 아이콘만 사용)
  const renderMetricsSection = (title, items, desc = '') => {
    if (!items || items.length === 0) return '';
    return `
      <div class="weekly-section weekly-section-metrics">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-metrics-grid">
          ${items.map(item => renderMetricItem(item)).join('')}
        </div>
      </div>
    `;
  };

  // 오늘의 핫이슈 렌더링 (2x2 그리드, 이미지 포함)
  const renderHotIssuesSection = (items, iconSvg) => {
    if (!items || items.length === 0) return '';
    const limitedItems = items.slice(0, 4); // 최대 4개
    return `
      <div class="weekly-section weekly-section-hot">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">오늘의 핫이슈</h2>
          </div>
          <p class="weekly-section-desc">오늘 게임 업계에서 가장 주목받은 소식들을 정리했습니다.</p>
        </div>
        <div class="weekly-hot-issues weekly-hot-grid">
          ${limitedItems.map(item => {
            const thumbnail = typeof findThumbnail === 'function' ? findThumbnail(item) : item.thumbnail;
            const thumbnailHtml = thumbnail
              ? `<div class="weekly-hot-thumb"><img src="${getLocalDailyThumbnail(slug, thumbnail)}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
              : '';
            return `
            <div class="weekly-hot-card ${thumbnail ? 'has-thumb' : ''}">
              ${thumbnailHtml}
              <div class="weekly-hot-content">
                <h3 class="weekly-hot-title">${item.title || ''}</h3>
                <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
  };

  // 유저 반응 카드 그리드 렌더링
  const renderCommunityCards = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => {
      const tagPrefix = item.tag ? `[${item.tag}] ` : '';
      return `
      <div class="weekly-community-card">
        <h3 class="weekly-community-title">${tagPrefix}${item.title || ''}</h3>
        <p class="weekly-community-desc">${item.desc || ''}</p>
      </div>
    `;
    }).join('');
    return `
      <div class="weekly-section weekly-section-community">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-community-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 스트리밍 트렌드 카드 그리드 렌더링
  const renderStreamingCards = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => `
        <div class="weekly-streaming-card">
          <h3 class="weekly-streaming-title">${item.title || ''}</h3>
          <p class="weekly-streaming-desc">${item.desc || ''}</p>
        </div>
      `).join('');
    return `
      <div class="weekly-section weekly-section-streaming">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="weekly-streaming-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 업계 동향 카드 렌더링 (썸네일 포함)
  const renderIndustrySection = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';

    // historyNews에서 썸네일 찾기
    const findThumb = (itemTitle) => {
      if (!historyNews.length) return null;
      const keywords = (itemTitle || '')
        .replace(/[,.'":;!?()[\]{}~`@#$%^&*+=|\\/<>]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .sort((a, b) => b.length - a.length);
      for (const keyword of keywords) {
        const match = historyNews.find(n => n.title && n.title.includes(keyword));
        if (match && match.thumbnail) return match.thumbnail;
      }
      return null;
    };

    const cards = items.map(item => {
      const thumb = item.thumbnail || findThumb(item.title);
      const thumbUrl = thumb ? getLocalDailyThumbnail(slug, thumb) : null;
      const thumbHtml = thumbUrl
        ? `<div class="industry-thumb"><img src="${thumbUrl}" alt="" loading="lazy" data-img-fallback="thumb-fallback"></div>`
        : `<div class="industry-thumb thumb-fallback"></div>`;
      return `
      <div class="industry-card has-thumb">
        ${thumbHtml}
        <div class="industry-content">
          <h3 class="industry-title">${item.title || ''}</h3>
          <p class="industry-desc">${item.desc || ''}</p>
        </div>
      </div>
    `;
    }).join('');
    return `
      <div class="weekly-section weekly-section-industry">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">${title}</h2>
          </div>
          ${desc ? `<p class="weekly-section-desc">${desc}</p>` : ''}
        </div>
        <div class="industry-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 게임주 현황 섹션 렌더링
  const stockMap = {
    '크래프톤': '259960', '넷마블': '251270', '엔씨소프트': '036570',
    '카카오게임즈': '293490', '펄어비스': '263750', '위메이드': '112040',
    '컴투스': '078340', '넥슨게임즈': '225570', '스마일게이트': '',
    'NHN': '181710', '데브시스터즈': '194480', '시프트업': '462870',
    '더블유게임즈': '192080', 'SundayToz': '123420', '그라비티': '',
    '네오위즈': '095660', '웹젠': '069080', '드래곤플라이': '030350'
  };

  const renderStocksCard = (stocksData, stockPrices) => {
    if (!stocksData || stocksData.length === 0) return '';
    const renderStockItem = (stock) => {
      const codeMatchParen = stock.name?.match(/\((\d{6})\)/);
      const codeMatchHyphen = stock.name?.match(/^(\d{6})-/);
      let displayName, code;
      if (codeMatchHyphen) {
        code = codeMatchHyphen[1];
        displayName = stock.name.replace(/^\d{6}-/, '').trim();
      } else if (codeMatchParen) {
        code = codeMatchParen[1];
        displayName = stock.name.replace(/\(\d{6}\)/, '').trim();
      } else {
        displayName = stock.name?.trim() || '';
        code = stockMap[displayName] || '';
      }
      if (!code) return '';
      const candleChartUrl = `https://ssl.pstatic.net/imgfinance/chart/item/candle/day/${code}.png`;
      const stockUrl = `https://finance.naver.com/item/main.nhn?code=${code}`;
      const priceData = stockPrices?.[code] || {};
      const price = priceData.price ? priceData.price.toLocaleString() + '원' : '-';
      const change = priceData.change || 0;
      const changePercent = priceData.changePercent || 0;
      const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : '';
      const changeSign = change > 0 ? '▲' : change < 0 ? '▼' : '';
      const changeText = change > 0 ? `+${changePercent.toFixed(2)}%` : change < 0 ? `${changePercent.toFixed(2)}%` : '0%';
      let dateStr = '종가';
      if (priceData.date) {
        const parts = priceData.date.split('.');
        if (parts.length === 3) dateStr = `${parseInt(parts[1])}/${parseInt(parts[2])} 종가`;
      }
      return `
        <a class="stock-item" href="${stockUrl}" target="_blank" rel="noopener">
          <div class="stock-info">
            <div class="stock-name-row">
              <span class="stock-name">${displayName}</span>
              <span class="stock-date">${dateStr}</span>
            </div>
            <div class="stock-price-row">
              <span class="stock-price-value ${changeClass}">${price}</span>
              <span class="stock-change-badge ${changeClass}">${changeSign} ${changeText}</span>
            </div>
          </div>
          <img class="stock-chart" src="${candleChartUrl}" alt="${displayName} 일봉 차트" data-img-fallback-src="/favicon.svg">
          <p class="stock-comment">${stock.comment || ''}</p>
        </a>
      `;
    };
    const stockItems = stocksData.map(renderStockItem).filter(item => item).join('');
    if (!stockItems) return '';
    return `
      <div class="weekly-section weekly-section-stocks">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <h2 class="weekly-section-title">게임주 현황</h2>
          </div>
          <p class="weekly-section-desc">오늘 게임 업종 주요 종목의 시세 동향입니다.</p>
        </div>
        <div class="stocks-split">
          ${stockItems}
        </div>
      </div>
    `;
  };

  const issues = aiInsight.issues || [];
  const industryIssues = aiInsight.industryIssues?.length > 0 ? aiInsight.industryIssues : [];
  const metrics = aiInsight.metrics || [];
  const rankingsData = aiInsight.rankings || [];
  const communityData = aiInsight.community || [];
  const streaming = aiInsight.streaming || [];
  const stocksData = aiInsight.stocks || [];
  const stockPrices = insight?.stockPrices || {};

  // summary 객체에서 title과 desc 추출
  const summaryTitle = typeof aiInsight.summary === 'object' ? aiInsight.summary.title : (aiInsight.issues?.[0]?.title || '게임 브리핑');
  const summaryDesc = typeof aiInsight.summary === 'object' ? aiInsight.summary.desc : aiInsight.summary;
  // 모바일용 인피드 슬롯
  const mobileNativeSlots3 = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];
  const localMidSlotPairs = [
    { pc: AD_SLOTS.ResponsivePC002, mobile: AD_SLOTS.Mobile002 },
    { pc: AD_SLOTS.ResponsivePC003, mobile: AD_SLOTS.Mobile003 },
    { pc: AD_SLOTS.ResponsivePC004, mobile: AD_SLOTS.Mobile004 }
  ];
  let localMidCursor = 0;
  const midAd = () => {
    // 통합 반응형 빌드: PC 슬롯 사용 (CSS 미디어 쿼리로 자동 분기)
    const idx = localMidCursor % localMidSlotPairs.length;
    localMidCursor += 1;
    return generateMidAdSlot(localMidSlotPairs[idx].pc, localMidSlotPairs[idx].mobile);
  };
  // 통합 빌드에서는 빈 문자열 반환 (모바일 전용 광고는 CSS로 처리)
  const midAdMobileOnly = () => '';

  // 네비게이션 (이전/목록/다음 리포트) - 하단에만 표시
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/magazine/daily/${nav.prev}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/magazine/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/magazine/daily/${nav.next}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  const content = `
    <section class="section active" id="insight">
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">${summaryTitle}</h1>
        ${midAdMobileOnly()}
        ${renderHotIssuesSection(issues, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>')}
        ${midAd()}
        ${renderIndustrySection('업계 동향', industryIssues, '', '국내 게임사들의 주요 발표와 업계 전반의 움직임을 살펴봅니다.', historyNews)}
        ${midAdMobileOnly()}
        ${renderMetricsSection('주목할만한 지표', metrics, '오늘 주목할 만한 수치 변화와 시장 지표입니다.')}
        ${midAdMobileOnly()}
        ${renderCategoryCard('순위 변동', rankingsData, 'weekly-section-rankings', '', true, '앱스토어/플레이스토어 매출 순위에서 주목할 만한 변동이 있었던 게임들입니다.')}
        ${midAd()}
        ${renderStocksCard(stocksData, stockPrices)}
        ${renderCommunityCards('유저 반응', communityData, '', '디시인사이드, 아카라이브, 인벤 등 주요 게임 커뮤니티에서 화제가 된 이슈들입니다.')}
        ${renderStreamingCards('스트리밍 트렌드', streaming, '', '치지직, 유튜브 등 스트리밍 플랫폼에서의 게임 콘텐츠 동향입니다.')}
        ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
        ${navHtml}
      </div>
    </section>
  `;

  // SEO 정보
  const dateForTitle = aiInsight.date || slug;
  const summaryText = typeof aiInsight.summary === 'object' ? aiInsight.summary.title : aiInsight.summary;
  const descriptionText = summaryText || '게임 브리핑 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 한눈에 확인하세요.';
  const dynamicKeywords = issues.slice(0, 4).map(i => i.title).join(', ');
  const keywordsText = dynamicKeywords ? `게임 트렌드, ${dynamicKeywords}` : '게임 트렌드, 게임 업계 이슈, 게임 순위, 게임 뉴스';

  // Article JSON-LD 스키마
  const articleSchema = {
    headline: summaryTitle,
    description: descriptionText,
    datePublished: aiInsight.date || slug,
    dateModified: insight?.aiGeneratedAt?.split('T')[0] || aiInsight.date || slug,
    image: insight?.ai?.thumbnail || null
  };

  // 핫이슈 썸네일 프리로드 (최대 4개)
  const issueThumbUrls = issues.slice(0, 4)
    .map(item => findThumbnail(item))
    .filter(Boolean)
    .map(thumb => getLocalDailyThumbnail(slug, thumb));

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: summaryTitle,
    description: descriptionText,
    keywords: keywordsText,
    canonical: `${siteBaseUrl}/magazine/daily/${slug}/`,
    articleSchema,
    preloadImages: issueThumbUrls,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: `일간 ${slug}`, url: `${siteBaseUrl}/magazine/daily/${slug}/` }
    ]
  });
}

/**
 * 주간 상세 페이지 생성 (개별 JSON → HTML)
 * @param {Object} params
 * @param {Object} params.weeklyInsight - 주간 인사이트 데이터 (ai, weekInfo 필드 포함)
 * @param {string} params.slug - URL slug (예: 2025-W51)
 * @param {Object} params.nav - 이전/다음 리포트 정보 (optional)
 */
function generateWeeklyDetailPage({ weeklyInsight, slug, nav = {} }) {
  if (!weeklyInsight?.ai) {
    const content = `
      <section class="section active" id="insight">
        <div class="home-empty">주간를 불러올 수 없습니다</div>
      </section>
    `;
    return wrapWithLayout(content, {
      currentPage: 'trend',
      title: '게이머스크롤 | 주간 게임 브리핑',
      description: '주간 게임 브리핑를 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/weekly/${slug}/`,
      noindex: true
    });
  }

  // 네비게이션 (이전/목록/다음 리포트) - 하단에만 표시
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/magazine/weekly/${nav.prev}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/magazine/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/magazine/weekly/${nav.next}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  const weeklyPanelHtml = generateWeeklyPanel(weeklyInsight);
  const waiForH1 = weeklyInsight.ai;
  const h1Title = typeof waiForH1.summary === 'object' ? waiForH1.summary.title : (waiForH1.issues?.[0]?.title || waiForH1.summary || `${slug} 주간 게임 브리핑`);

  const content = `
    <section class="section active" id="insight">
      
      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">${h1Title}</h1>
        ${weeklyPanelHtml}
        ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
        ${navHtml}
      </div>
    </section>
  `;

  // SEO 정보
  const wai = weeklyInsight.ai;
  const wInfo = weeklyInsight.weekInfo || {};
  const weekPeriod = wInfo.startDate && wInfo.endDate
    ? `${formatDateKorean(wInfo.startDate)} ~ ${formatDateKorean(wInfo.endDate)}`
    : (wai.date ? formatDateKorean(wai.date) : '');
  const weekNum = wInfo.weekNumber || wai.weekNumber || '';
  const heroThumbUrl = wai.thumbnail ? getLocalReportThumbnail('weekly', slug, wai.thumbnail, 'lg') : '';
  const summaryTitle = typeof wai.summary === 'object' ? wai.summary.title : (wai.issues?.[0]?.title || wai.summary);
  const descriptionText = summaryTitle || '주간 게임 브리핑 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 한눈에 확인하세요.';

  // 동적 키워드 (issues에서 4개 추출)
  const weeklyIssues = wai.issues || [];
  const dynamicKeywords = weeklyIssues.slice(0, 4).map(i => i.title).join(', ');
  const keywordsText = dynamicKeywords ? `게임 트렌드, ${dynamicKeywords}` : '게임 트렌드, 게임 업계 이슈, 게임 순위, 게임 뉴스';

  // 핫이슈 썸네일 프리로드 (최대 4개)
  const weekDates = wInfo.dates || [];
  const issueThumbUrls = weeklyIssues.slice(0, 4)
    .map(issue => issue.thumbnail ? getLocalDailyThumbnailFromWeek(weekDates, issue.thumbnail, slug) : null)
    .filter(Boolean);
  const preloadUrls = heroThumbUrl ? [heroThumbUrl, ...issueThumbUrls] : issueThumbUrls;

  // Article JSON-LD 스키마
  const articleSchema = {
    headline: summaryTitle || `${weekNum}주차 주간 게임 브리핑`,
    description: descriptionText,
    datePublished: wInfo.endDate || wai.date || slug.replace('W', ''),
    dateModified: weeklyInsight.generatedAt?.split('T')[0] || wInfo.endDate || wai.date,
    image: wai.thumbnail || null
  };

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: summaryTitle,
    description: descriptionText,
    keywords: keywordsText,
    canonical: `${siteBaseUrl}/magazine/weekly/${slug}/`,
    articleSchema,
    preloadImages: preloadUrls,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: `주간 ${slug}`, url: `${siteBaseUrl}/magazine/weekly/${slug}/` }
    ]
  });
}

/**
 * 이슈 상세 페이지 생성
 * @param {Object} params
 * @param {Object} params.post - 이슈 포스트 데이터
 * @param {Object} params.nav - 이전/다음 포스트 정보
 */
function generateIssueDetailPage({ post, nav = {}, issueReports = [], insightReports = [], hotpickReports = [], rankingReports = [], wikiData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">포스트를 찾을 수 없습니다</div>', {
      currentPage: 'trend',
      title: '게이머스크롤 | 이슈',
      description: '이슈를 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/issue/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
  };
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '이슈 대표 이미지');

  // 이슈 중간 광고 (PC/모바일 분기)
  const ISSUE_REPORT_SLOTS_PC = [
    AD_SLOTS.ResponsivePC001,
    AD_SLOTS.ResponsivePC002,
    AD_SLOTS.ResponsivePC003,
    AD_SLOTS.ResponsivePC004,
    AD_SLOTS.ResponsivePC005
  ];
  const ISSUE_REPORT_SLOTS_MOBILE = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];

  const generateIssueAdSlot = (adIndex = 0) => {
    // 광고 비활성화 시 빈 문자열 반환
    if (!ADS_ENABLED) return '';

    // 통합 반응형 빌드: 네이티브 In-feed 광고 사용 (PC/모바일 자동 대응)
    const slotId = ISSUE_REPORT_SLOTS_MOBILE[adIndex % ISSUE_REPORT_SLOTS_MOBILE.length];
    return `<div class="blog-ad">
      ${generateNativeAdSlot(slotId)}
    </div>`;
  };

  // 마크다운 표를 HTML table로 변환
  const parseMarkdownTable = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    if (!lines[0].trim().startsWith('|')) return null;
    const separatorIndex = lines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line.trim()));
    if (separatorIndex < 1) return null;

    const parseCells = (line) => {
      const cells = line.split('|');
      if (cells.length > 0 && cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      return cells.map(cell => cell.trim());
    };

    const headers = parseCells(lines[0]);
    const dataLines = lines.slice(separatorIndex + 1).filter(line => line.trim().startsWith('|'));
    const rows = dataLines.map(line => parseCells(line));

    let html = '<div class="blog-table-wrapper"><table>';
    html += '<thead><tr>';
    headers.forEach(h => { html += `<th>${h}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += `<td>${cell}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  };

  // 관련 게임 찾기
  const findRelatedGames = (text, limit = 4) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      if (text.includes(name) || (game.aliases && game.aliases.some(a => text.includes(a)))) {
        found.push({ name, ...game });
        if (found.length >= limit) break;
      }
    }
    return found;
  };

  // 본문 렌더링 (섹션 2개당 광고 1개 자동 삽입)
  const renderContent = () => {
    let adIndex = 0;
    let sectionCount = 0;
    let imageIndex = 1; // 이미지 인덱스 (로컬 이미지 경로용)
    const result = [];

    // 연속 link 블록 그룹화 전처리
    const processedContent = [];
    let linkGroup = [];
    content.forEach((block, idx) => {
      if (block.type === 'link') {
        linkGroup.push(block);
      } else {
        if (linkGroup.length > 0) {
          processedContent.push({ type: 'link-group', links: linkGroup });
          linkGroup = [];
        }
        processedContent.push(block);
      }
    });
    if (linkGroup.length > 0) {
      processedContent.push({ type: 'link-group', links: linkGroup });
    }

    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text':
          const paragraphs = block.value.split('\n\n').map(p => {
            const trimmed = p.trim();
            // 마크다운 표 처리
            if (trimmed.startsWith('|') && trimmed.includes('|---')) {
              const tableHtml = parseMarkdownTable(trimmed);
              if (tableHtml) return tableHtml;
            }
            // 마크다운 볼드 변환: **텍스트** → <strong>텍스트</strong>
            // 마크다운 리스트 변환: "- " → "• "
            const formatted = trimmed
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+:)\*\*/g, '<strong class="subheading">$1</strong>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/^- /gm, '• ')
              .replace(/\n- /g, '\n• ')
              .replace(/\n/g, '<br>')
              .replace(/class="subheading">([^<]+)<\/strong><br>/g, 'class="subheading">$1</strong>');
            return trimmed ? `<p class="blog-paragraph">${formatted}</p>` : '';
          }).filter(p => p).join('');
          result.push(paragraphs);
          break;

        case 'image':
          // 로컬 이미지 우선, 없으면 외부 URL
          const imgSrc = getLocalIssueImagePath(slug, block.src, 'content', imageIndex);
          imageIndex++;
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${block.caption || ''}" loading="lazy" data-img-fallback="parent-hide">
              ${caption}
            </figure>
          `);
          break;

        case 'ad':
          // 수동 광고는 무시 (자동 삽입으로 대체)
          break;

        case 'quote':
          result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
          break;

        case 'video':
          // 유튜브 URL에서 video ID 추출
          const videoUrl = block.url || '';
          const videoMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (videoMatch) {
            const videoId = videoMatch[1];
            const videoCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
            result.push(`
              <figure class="blog-figure blog-video">
                <div class="blog-video-wrapper">
                  <iframe
                    src="https://www.youtube.com/embed/${videoId}"
                    title="${block.caption || 'YouTube video'}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    loading="lazy">
                  </iframe>
                </div>
                ${videoCaption}
              </figure>
            `);
          }
          break;

        case 'heading':
          // 섹션 2개마다 heading 앞에 광고 삽입 (첫 heading 제외)
          sectionCount++;
          if (sectionCount > 1 && (sectionCount - 1) % 2 === 0) {
            result.push(generateIssueAdSlot(adIndex++));
          }
          result.push(`<h2 class="blog-heading">${block.value}</h2>`);
          break;

        case 'table':
          if (!block.headers || !block.rows) break;
          const tblHeaders = block.headers.map(h => `<th>${escapeHtmlAttr(h)}</th>`).join('');
          const tblRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseMarkdownLinks(cell)}</td>`).join('')}</tr>`
          ).join('');
          result.push(`
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtmlAttr(block.caption)}</div>` : ''}
              <table class="wiki-table">
                <thead><tr>${tblHeaders}</tr></thead>
                <tbody>${tblRows}</tbody>
              </table>
            </figure>
          `);
          break;

        case 'game-ranking':
          if (!block.items || !Array.isArray(block.items)) break;
          const rankingItems = block.items.map(item => `
            <div class="game-ranking-item">
              <span class="game-ranking-rank">${item.rank}</span>
              <div class="game-ranking-thumb">
                <img src="${item.image}" alt="${item.name}" loading="lazy">
              </div>
              <div class="game-ranking-info">
                <div class="game-ranking-name">${item.name}${item.price ? ` <span class="game-ranking-price">(${item.price})</span>` : ''}</div>
                ${item.desc ? `<div class="game-ranking-desc">${item.desc}</div>` : ''}
              </div>
            </div>
          `).join('');
          result.push(`
            <div class="game-ranking-list">
              ${block.caption ? `<div class="game-ranking-title">${block.caption}</div>` : ''}
              ${rankingItems}
            </div>
          `);
          break;

        case 'link-group':
          const linkItems = block.links.map(link => {
            if (!link.url || !link.text) return '';
            let iconHtml = '';
            if (link.url.startsWith('/games/')) {
              const gameSlug = link.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = link.subtext ? `<span class="blog-link-subtext">${link.subtext}</span>` : '';
            return `<a href="${link.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${link.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`;
          }).filter(Boolean).join('');
          if (linkItems) {
            result.push(`<div class="blog-link-grid">${linkItems}</div>`);
          }
          break;

        case 'link':
          if (block.url && block.text) {
            let iconHtml = '';
            // 게임 페이지 링크면 아이콘 자동 추가
            if (block.url.startsWith('/games/')) {
              const gameSlug = block.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = block.subtext ? `<span class="blog-link-subtext">${block.subtext}</span>` : '';
            result.push(`<a href="${block.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${block.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
          }
          break;
      }
    });

    return result.join('');
  };

  // 관련 게임 (수동 지정 우선, 없으면 자동 매칭)
  const findGameBySlug = (slug) => {
    for (const [name, game] of Object.entries(gamesMap)) {
      if (game.slug === slug) return { name, ...game };
    }
    return null;
  };
  const manualGames = (post.relatedGames || []).map(slug => findGameBySlug(slug)).filter(Boolean);
  const fullText = content.filter(b => b.type === 'text').map(b => b.value).join(' ');
  const relatedGames = 'relatedGames' in post ? manualGames : findRelatedGames(fullText);
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <div class="blog-related-title">관련 게임</div>
      <div class="blog-related-grid">
        ${relatedGames.map(g => `
          <a href="/games/${g.slug}/" class="blog-related-card">
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (이슈 + 위키)
  const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
  const relatedIssuesList = (post.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);

  // 관련 위키 (수동 지정 또는 키워드 매칭)
  const findWikiBySlug = (category, slug) => {
    const articles = wikiData[category] || [];
    return articles.find(a => a.slug === slug);
  };
  const relatedWikiList = (post.relatedWiki || []).map(ref => {
    const [cat, slug] = ref.split('/');
    const article = findWikiBySlug(cat, slug);
    return article ? { ...article, category: cat } : null;
  }).filter(Boolean).slice(0, 4);

  // 이슈 + 위키 합쳐서 "관련 문서"
  const hasRelatedDocs = relatedIssuesList.length > 0 || relatedWikiList.length > 0;
  const relatedDocsHtml = hasRelatedDocs ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedIssuesList.map(issue => `
          <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')}" alt="" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${issue.title}</span></span>
          </a>
        `).join('')}
        ${relatedWikiList.map(wiki => `
          <a href="/wiki/${wiki.category}/${wiki.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalWikiThumbPath(wiki.category, wiki.slug, wiki.thumbnail)}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${wiki.title}</span></span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 정보 출처
  const sources = post.sources || [];
  const sourcesHtml = sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="nofollow noopener">${s.name} - ${s.title}</a></li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // 네비게이션
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/magazine/issue/${nav.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/magazine/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/magazine/issue/${nav.next.slug}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  // 사이드바: 카테고리 메뉴 (카운트 포함)
  const generateSidebarCategories = () => {
    const reportCounts = {
      issue: (issueReports || []).length,
      insight: (insightReports || []).length,
      hotpick: (hotpickReports || []).length,
      ranking: (rankingReports || []).length
    };
    return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/daily/" class="sidebar-category-item"><span class="sidebar-category-name">일간 (${magazineCounts.daily || 0})</span></a>
          <a href="/magazine/weekly/" class="sidebar-category-item"><span class="sidebar-category-name">주간 (${magazineCounts.weekly || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/issue/" class="sidebar-category-item"><span class="sidebar-category-name">이슈 (${reportCounts.issue})</span></a>
          <a href="/magazine/insight/" class="sidebar-category-item"><span class="sidebar-category-name">인사이트 (${reportCounts.insight})</span></a>
          <a href="/magazine/hotpick/" class="sidebar-category-item"><span class="sidebar-category-name">핫픽 (${reportCounts.hotpick})</span></a>
          <a href="/magazine/ranking/" class="sidebar-category-item"><span class="sidebar-category-name">순위 분석 (${reportCounts.ranking})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/wiki/history/" class="sidebar-category-item"><span class="sidebar-category-name">히스토리 (${wikiCounts.history || 0})</span></a>
          <a href="/wiki/knowledge/" class="sidebar-category-item"><span class="sidebar-category-name">지식 (${wikiCounts.knowledge || 0})</span></a>
          <a href="/wiki/business/" class="sidebar-category-item"><span class="sidebar-category-name">비즈니스 (${wikiCounts.business || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/tech/normal/" class="sidebar-category-item"><span class="sidebar-category-name">일반 (${techCounts.normal || 0})</span></a>
          <a href="/tech/ai/" class="sidebar-category-item"><span class="sidebar-category-name">AI (${techCounts.ai || 0})</span></a>
          <a href="/tech/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">바이브코딩 (${techCounts.vibecoding || 0})</span></a>
        </div>
      </div>
    </div>
  `;
  };

  // 사이드바: 인기/최신 글 (GA4 기반 매거진 데이터)
  const generateSidebarArticles = (currentSlug, currentType) => {
    const currentLink = `/magazine/${currentType}/${currentSlug}/`;

    const renderList = (items) => items.map((item, i) => {
      const isCurrent = item.link === currentLink;
      const activeClass = isCurrent ? ' active' : '';
      return `
      <a href="${item.link}" class="sidebar-article-item${activeClass}">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
        </div>
      </div>
    `;
  };

  const sidebarHTML = generateSidebarCategories() + generateSidebarArticles(slug, 'issue');

  const sidebarScript = sidebarHTML ? `
    <script>
      (function() {
        const sidebarTab = document.getElementById('sidebarArticleTab');
        if (!sidebarTab) return;
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
          document.getElementById('sidebar-' + target)?.classList.add('active');
        });
      })();
    </script>
  ` : '';

  const pageContent = `
    <section class="section active" id="issue">

      <article class="page-container issue-container">
        ${topAds}

        <div class="article-layout">
          <div class="article-main">
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <time class="blog-date">${formatDateKorean(date)}</time>
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${getLocalIssueImagePath(slug, thumbnail, 'thumbnail')}" alt="${heroAlt}" loading="eager">
                </figure>
              ` : ''}
              ${summary ? `<p class="blog-summary">${summary}</p>` : ''}
              <div class="blog-content">
                ${renderContent()}
              </div>
              ${relatedDocsHtml}
              ${relatedGamesHtml}
              ${sourcesHtml}
            </div>

            ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
            ${navHtml}
          </div>

          ${sidebarHTML ? `
          <aside class="article-sidebar">
            <div class="article-sidebar-sticky">
              ${sidebarHTML}
            </div>
          </aside>
          ` : ''}
        </div>
      </article>
    </section>
    ${sidebarScript}
  `;

  // JSON-LD용 이미지 URL (로컬 경로를 전체 URL로 변환)
  const schemaImage = thumbnail
    ? (() => {
        const localPath = getLocalIssueImagePath(slug, thumbnail, 'thumbnail');
        return localPath.startsWith('/') ? `${siteBaseUrl}${localPath}` : localPath;
      })()
    : null;

  const articleSchema = {
    headline: title,
    description: summary || title,
    datePublished: date,
    dateModified: date,
    image: schemaImage
  };

  const thumbnailPath = thumbnail ? getLocalIssueImagePath(slug, thumbnail, 'thumbnail') : null;

  return wrapWithLayout(pageContent, {
    currentPage: 'trend',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 분석, 이슈, 게임 이슈, 모바일 게임',
    canonical: `${siteBaseUrl}/magazine/issue/${slug}/`,
    articleSchema,
    preloadImages: thumbnailPath ? [thumbnailPath] : [],
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/issue/${slug}/` }
    ]
  });
}

// ========== 인사이트 상세 페이지 ==========
function generateInsightDetailPage({ post, nav = {}, insightReports = [], issueReports = [], hotpickReports = [], rankingReports = [], wikiData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">인사이트를 찾을 수 없습니다</div>', {
      currentPage: 'trend',
      title: '게이머스크롤 | 인사이트',
      description: '인사이트를 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/insight/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
  };
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '인사이트 대표 이미지');

  // 인사이트 중간 광고 (PC/모바일 분기)
  const INSIGHT_REPORT_SLOTS_MOBILE = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];

  const generateInsightAdSlot = (adIndex = 0) => {
    if (!ADS_ENABLED) return '';
    const slotId = INSIGHT_REPORT_SLOTS_MOBILE[adIndex % INSIGHT_REPORT_SLOTS_MOBILE.length];
    return `<div class="blog-ad">
      ${generateNativeAdSlot(slotId)}
    </div>`;
  };

  // 마크다운 표를 HTML table로 변환
  const parseMarkdownTable = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    if (!lines[0].trim().startsWith('|')) return null;
    const separatorIndex = lines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line.trim()));
    if (separatorIndex < 1) return null;

    const parseCells = (line) => {
      const cells = line.split('|');
      if (cells.length > 0 && cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      return cells.map(cell => cell.trim());
    };

    const headers = parseCells(lines[0]);
    const dataLines = lines.slice(separatorIndex + 1).filter(line => line.trim().startsWith('|'));
    const rows = dataLines.map(line => parseCells(line));

    let html = '<div class="blog-table-wrapper"><table>';
    html += '<thead><tr>';
    headers.forEach(h => { html += `<th>${h}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += `<td>${cell}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  };

  // 관련 게임 찾기
  const findRelatedGames = (text, limit = 4) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      if (text.includes(name) || (game.aliases && game.aliases.some(a => text.includes(a)))) {
        found.push({ name, ...game });
        if (found.length >= limit) break;
      }
    }
    return found;
  };

  // 본문 렌더링 (섹션 2개당 광고 1개 자동 삽입)
  const renderContent = () => {
    let adIndex = 0;
    let sectionCount = 0;
    let imageIndex = 1;
    const result = [];

    // 연속 link 블록 그룹화 전처리
    const processedContent = [];
    let linkGroup = [];
    content.forEach((block, idx) => {
      if (block.type === 'link') {
        linkGroup.push(block);
      } else {
        if (linkGroup.length > 0) {
          processedContent.push({ type: 'link-group', links: linkGroup });
          linkGroup = [];
        }
        processedContent.push(block);
      }
    });
    if (linkGroup.length > 0) {
      processedContent.push({ type: 'link-group', links: linkGroup });
    }

    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text':
          const paragraphs = block.value.split('\n\n').map(p => {
            const trimmed = p.trim();
            if (trimmed.startsWith('|') && trimmed.includes('|---')) {
              const tableHtml = parseMarkdownTable(trimmed);
              if (tableHtml) return tableHtml;
            }
            const formatted = trimmed
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+:)\*\*/g, '<strong class="subheading">$1</strong>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/^- /gm, '• ')
              .replace(/\n- /g, '\n• ')
              .replace(/\n/g, '<br>')
              .replace(/class="subheading">([^<]+)<\/strong><br>/g, 'class="subheading">$1</strong>');
            return trimmed ? `<p class="blog-paragraph">${formatted}</p>` : '';
          }).filter(p => p).join('');
          result.push(paragraphs);
          break;

        case 'image':
          const imgSrc = getLocalInsightImagePath(slug, block.src, 'content', imageIndex);
          imageIndex++;
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${block.caption || ''}" loading="lazy" data-img-fallback="parent-hide">
              ${caption}
            </figure>
          `);
          break;

        case 'ad':
          break;

        case 'quote':
          result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
          break;

        case 'video':
          const videoUrl = block.url || '';
          const videoMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (videoMatch) {
            const videoId = videoMatch[1];
            const videoCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
            result.push(`
              <figure class="blog-figure blog-video">
                <div class="blog-video-wrapper">
                  <iframe
                    src="https://www.youtube.com/embed/${videoId}"
                    title="${block.caption || 'YouTube video'}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    loading="lazy">
                  </iframe>
                </div>
                ${videoCaption}
              </figure>
            `);
          }
          break;

        case 'heading':
          sectionCount++;
          if (sectionCount > 1 && (sectionCount - 1) % 2 === 0) {
            result.push(generateInsightAdSlot(adIndex++));
          }
          result.push(`<h2 class="blog-heading">${block.value}</h2>`);
          break;

        case 'table':
          if (!block.headers || !block.rows) break;
          const tblHeaders = block.headers.map(h => `<th>${escapeHtmlAttr(h)}</th>`).join('');
          const tblRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseMarkdownLinks(cell)}</td>`).join('')}</tr>`
          ).join('');
          result.push(`
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtmlAttr(block.caption)}</div>` : ''}
              <table class="wiki-table">
                <thead><tr>${tblHeaders}</tr></thead>
                <tbody>${tblRows}</tbody>
              </table>
            </figure>
          `);
          break;

        case 'game-ranking':
          if (!block.items || !Array.isArray(block.items)) break;
          const rankingItems = block.items.map(item => `
            <div class="game-ranking-item">
              <span class="game-ranking-rank">${item.rank}</span>
              <div class="game-ranking-thumb">
                <img src="${item.image}" alt="${item.name}" loading="lazy">
              </div>
              <div class="game-ranking-info">
                <div class="game-ranking-name">${item.name}${item.price ? ` <span class="game-ranking-price">(${item.price})</span>` : ''}</div>
                ${item.desc ? `<div class="game-ranking-desc">${item.desc}</div>` : ''}
              </div>
            </div>
          `).join('');
          result.push(`
            <div class="game-ranking-list">
              ${block.caption ? `<div class="game-ranking-title">${block.caption}</div>` : ''}
              ${rankingItems}
            </div>
          `);
          break;

        case 'link-group':
          const linkItems = block.links.map(link => {
            if (!link.url || !link.text) return '';
            let iconHtml = '';
            if (link.url.startsWith('/games/')) {
              const gameSlug = link.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = link.subtext ? `<span class="blog-link-subtext">${link.subtext}</span>` : '';
            return `<a href="${link.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${link.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`;
          }).filter(Boolean).join('');
          if (linkItems) {
            result.push(`<div class="blog-link-grid">${linkItems}</div>`);
          }
          break;

        case 'link':
          if (block.url && block.text) {
            let iconHtml = '';
            if (block.url.startsWith('/games/')) {
              const gameSlug = block.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = block.subtext ? `<span class="blog-link-subtext">${block.subtext}</span>` : '';
            result.push(`<a href="${block.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${block.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
          }
          break;
      }
    });

    return result.join('');
  };

  // 관련 게임 (수동 지정 우선, 없으면 자동 매칭)
  const findGameBySlug = (slug) => {
    for (const [name, game] of Object.entries(gamesMap)) {
      if (game.slug === slug) return { name, ...game };
    }
    return null;
  };
  const manualGames = (post.relatedGames || []).map(slug => findGameBySlug(slug)).filter(Boolean);
  const fullText = content.filter(b => b.type === 'text').map(b => b.value).join(' ');
  const relatedGames = 'relatedGames' in post ? manualGames : findRelatedGames(fullText);
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <div class="blog-related-title">관련 게임</div>
      <div class="blog-related-grid">
        ${relatedGames.map(g => `
          <a href="/games/${g.slug}/" class="blog-related-card">
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (인사이트 + 이슈 + 위키)
  const findInsightBySlug = (slug) => insightReports.find(r => r.slug === slug);
  const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
  const relatedInsightsList = (post.relatedInsights || []).map(slug => findInsightBySlug(slug)).filter(Boolean).slice(0, 2);
  const relatedIssuesList = (post.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);

  // 관련 위키 (수동 지정 또는 키워드 매칭)
  const findWikiBySlug = (category, slug) => {
    const articles = wikiData[category] || [];
    return articles.find(a => a.slug === slug);
  };
  const relatedWikiList = (post.relatedWiki || []).map(ref => {
    const [cat, slug] = ref.split('/');
    const article = findWikiBySlug(cat, slug);
    return article ? { ...article, category: cat } : null;
  }).filter(Boolean).slice(0, 4);

  // 인사이트 + 이슈 + 위키 합쳐서 "관련 문서"
  const hasRelatedDocs = relatedInsightsList.length > 0 || relatedIssuesList.length > 0 || relatedWikiList.length > 0;
  const relatedDocsHtml = hasRelatedDocs ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedInsightsList.map(insight => `
          <a href="/magazine/insight/${insight.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalInsightImagePath(insight.slug, insight.thumbnail, 'thumbnail')}" alt="" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${insight.title}</span></span>
          </a>
        `).join('')}
        ${relatedIssuesList.map(issue => `
          <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')}" alt="" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${issue.title}</span></span>
          </a>
        `).join('')}
        ${relatedWikiList.map(wiki => `
          <a href="/wiki/${wiki.category}/${wiki.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalWikiThumbPath(wiki.category, wiki.slug, wiki.thumbnail)}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${wiki.title}</span></span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 정보 출처
  const sources = post.sources || [];
  const sourcesHtml = sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="nofollow noopener">${s.name} - ${s.title}</a></li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // 네비게이션
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/magazine/insight/${nav.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/magazine/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/magazine/insight/${nav.next.slug}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  // 사이드바: 카테고리 메뉴 (카운트 포함)
  const generateSidebarCategories = () => {
    const reportCounts = {
      issue: (issueReports || []).length,
      insight: (insightReports || []).length,
      hotpick: (hotpickReports || []).length,
      ranking: (rankingReports || []).length
    };
    return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/daily/" class="sidebar-category-item"><span class="sidebar-category-name">일간 (${magazineCounts.daily || 0})</span></a>
          <a href="/magazine/weekly/" class="sidebar-category-item"><span class="sidebar-category-name">주간 (${magazineCounts.weekly || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/issue/" class="sidebar-category-item"><span class="sidebar-category-name">이슈 (${reportCounts.issue})</span></a>
          <a href="/magazine/insight/" class="sidebar-category-item"><span class="sidebar-category-name">인사이트 (${reportCounts.insight})</span></a>
          <a href="/magazine/hotpick/" class="sidebar-category-item"><span class="sidebar-category-name">핫픽 (${reportCounts.hotpick})</span></a>
          <a href="/magazine/ranking/" class="sidebar-category-item"><span class="sidebar-category-name">순위 분석 (${reportCounts.ranking})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/wiki/history/" class="sidebar-category-item"><span class="sidebar-category-name">히스토리 (${wikiCounts.history || 0})</span></a>
          <a href="/wiki/knowledge/" class="sidebar-category-item"><span class="sidebar-category-name">지식 (${wikiCounts.knowledge || 0})</span></a>
          <a href="/wiki/business/" class="sidebar-category-item"><span class="sidebar-category-name">비즈니스 (${wikiCounts.business || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/tech/normal/" class="sidebar-category-item"><span class="sidebar-category-name">일반 (${techCounts.normal || 0})</span></a>
          <a href="/tech/ai/" class="sidebar-category-item"><span class="sidebar-category-name">AI (${techCounts.ai || 0})</span></a>
          <a href="/tech/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">바이브코딩 (${techCounts.vibecoding || 0})</span></a>
        </div>
      </div>
    </div>
  `;
  };

  // 사이드바: 인기/최신 글 (GA4 기반 매거진 데이터)
  const generateSidebarArticles = (currentSlug, currentType) => {
    const currentLink = `/magazine/${currentType}/${currentSlug}/`;

    const renderList = (items) => items.map((item, i) => {
      const isCurrent = item.link === currentLink;
      const activeClass = isCurrent ? ' active' : '';
      return `
      <a href="${item.link}" class="sidebar-article-item${activeClass}">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
        </div>
      </div>
    `;
  };

  const sidebarHTML = generateSidebarCategories() + generateSidebarArticles(slug, 'insight');

  const sidebarScript = sidebarHTML ? `
    <script>
      (function() {
        const sidebarTab = document.getElementById('sidebarArticleTab');
        if (!sidebarTab) return;
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
          document.getElementById('sidebar-' + target)?.classList.add('active');
        });
      })();
    </script>
  ` : '';

  const pageContent = `
    <section class="section active" id="insight">

      <article class="page-container issue-container">
        ${topAds}

        <div class="article-layout">
          <div class="article-main">
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <time class="blog-date">${formatDateKorean(date)}</time>
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${getLocalInsightImagePath(slug, thumbnail, 'thumbnail')}" alt="${heroAlt}" loading="eager">
                </figure>
              ` : ''}
              ${summary ? `<p class="blog-summary">${summary}</p>` : ''}
              <div class="blog-content">
                ${renderContent()}
              </div>
              ${relatedDocsHtml}
              ${relatedGamesHtml}
              ${sourcesHtml}
            </div>

            ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
            ${navHtml}
          </div>

          ${sidebarHTML ? `
          <aside class="article-sidebar">
            <div class="article-sidebar-sticky">
              ${sidebarHTML}
            </div>
          </aside>
          ` : ''}
        </div>
      </article>
    </section>
    ${sidebarScript}
  `;

  // JSON-LD용 이미지 URL (로컬 경로를 전체 URL로 변환)
  const schemaImage = thumbnail
    ? (() => {
        const localPath = getLocalInsightImagePath(slug, thumbnail, 'thumbnail');
        return localPath.startsWith('/') ? `${siteBaseUrl}${localPath}` : localPath;
      })()
    : null;

  const articleSchema = {
    headline: title,
    description: summary || title,
    datePublished: date,
    dateModified: date,
    image: schemaImage
  };

  const issueThumbUrls = relatedIssuesList.map(issue =>
    getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')
  ).filter(Boolean);

  return wrapWithLayout(pageContent, {
    currentPage: 'trend',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 트렌드, 인사이트, 게임 분석, 모바일 게임',
    canonical: `${siteBaseUrl}/magazine/insight/${slug}/`,
    articleSchema,
    preloadImages: issueThumbUrls,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/insight/${slug}/` }
    ]
  });
}

// ========== 핫픽 상세 페이지 ==========
function generateHotpickDetailPage({ post, nav = {}, hotpickReports = [], issueReports = [], insightReports = [], rankingReports = [], wikiData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">핫픽을 찾을 수 없습니다</div>', {
      currentPage: 'trend',
      title: '게이머스크롤 | 핫픽',
      description: '핫픽을 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/hotpick/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
  };
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '핫픽 대표 이미지');

  // 핫픽 중간 광고
  const HOTPICK_REPORT_SLOTS_MOBILE = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];

  const generateHotpickAdSlot = (adIndex = 0) => {
    if (!ADS_ENABLED) return '';
    const slotId = HOTPICK_REPORT_SLOTS_MOBILE[adIndex % HOTPICK_REPORT_SLOTS_MOBILE.length];
    return `<div class="blog-ad">
      ${generateNativeAdSlot(slotId)}
    </div>`;
  };

  // 마크다운 표를 HTML table로 변환
  const parseMarkdownTable = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    if (!lines[0].trim().startsWith('|')) return null;
    const separatorIndex = lines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line.trim()));
    if (separatorIndex < 1) return null;

    const parseCells = (line) => {
      const cells = line.split('|');
      if (cells.length > 0 && cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      return cells.map(cell => cell.trim());
    };

    const headers = parseCells(lines[0]);
    const dataLines = lines.slice(separatorIndex + 1).filter(line => line.trim().startsWith('|'));
    const rows = dataLines.map(line => parseCells(line));

    let html = '<div class="blog-table-wrapper"><table>';
    html += '<thead><tr>';
    headers.forEach(h => { html += `<th>${h}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += `<td>${cell}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  };

  // 관련 게임 찾기
  const findRelatedGames = (text, limit = 4) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      if (text.includes(name) || (game.aliases && game.aliases.some(a => text.includes(a)))) {
        found.push({ name, ...game });
        if (found.length >= limit) break;
      }
    }
    return found;
  };

  // 본문 렌더링
  const renderContent = () => {
    let adIndex = 0;
    let sectionCount = 0;
    let imageIndex = 1;
    const result = [];

    // 연속 link 블록 그룹화 전처리
    const processedContent = [];
    let linkGroup = [];
    content.forEach((block, idx) => {
      if (block.type === 'link') {
        linkGroup.push(block);
      } else {
        if (linkGroup.length > 0) {
          processedContent.push({ type: 'link-group', links: linkGroup });
          linkGroup = [];
        }
        processedContent.push(block);
      }
    });
    if (linkGroup.length > 0) {
      processedContent.push({ type: 'link-group', links: linkGroup });
    }

    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text':
          const paragraphs = block.value.split('\n\n').map(p => {
            const trimmed = p.trim();
            if (trimmed.startsWith('|') && trimmed.includes('|---')) {
              const tableHtml = parseMarkdownTable(trimmed);
              if (tableHtml) return tableHtml;
            }
            const formatted = trimmed
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+:)\*\*/g, '<strong class="subheading">$1</strong>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/^- /gm, '• ')
              .replace(/\n- /g, '\n• ')
              .replace(/\n/g, '<br>')
              .replace(/class="subheading">([^<]+)<\/strong><br>/g, 'class="subheading">$1</strong>');
            return trimmed ? `<p class="blog-paragraph">${formatted}</p>` : '';
          }).filter(p => p).join('');
          result.push(paragraphs);
          break;

        case 'image':
          const imgSrc = getLocalHotpickImagePath(slug, block.src, 'content', imageIndex);
          imageIndex++;
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${block.caption || ''}" loading="lazy" data-img-fallback="parent-hide">
              ${caption}
            </figure>
          `);
          break;

        case 'ad':
          break;

        case 'quote':
          result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
          break;

        case 'video':
          const videoUrl = block.url || '';
          const videoMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (videoMatch) {
            const videoId = videoMatch[1];
            const videoCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
            result.push(`
              <figure class="blog-figure blog-video">
                <div class="blog-video-wrapper">
                  <iframe
                    src="https://www.youtube.com/embed/${videoId}"
                    title="${block.caption || 'YouTube video'}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    loading="lazy">
                  </iframe>
                </div>
                ${videoCaption}
              </figure>
            `);
          }
          break;

        case 'heading':
          sectionCount++;
          if (sectionCount > 1 && (sectionCount - 1) % 2 === 0) {
            result.push(generateHotpickAdSlot(adIndex++));
          }
          result.push(`<h2 class="blog-heading">${block.value}</h2>`);
          break;

        case 'table':
          if (!block.headers || !block.rows) break;
          const tblHeaders = block.headers.map(h => `<th>${escapeHtmlAttr(h)}</th>`).join('');
          const tblRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseMarkdownLinks(cell)}</td>`).join('')}</tr>`
          ).join('');
          result.push(`
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtmlAttr(block.caption)}</div>` : ''}
              <table class="wiki-table">
                <thead><tr>${tblHeaders}</tr></thead>
                <tbody>${tblRows}</tbody>
              </table>
            </figure>
          `);
          break;

        case 'game-ranking':
          if (!block.items || !Array.isArray(block.items)) break;
          const rankingItems = block.items.map(item => `
            <div class="game-ranking-item">
              <span class="game-ranking-rank">${item.rank}</span>
              <div class="game-ranking-thumb">
                <img src="${item.image}" alt="${item.name}" loading="lazy">
              </div>
              <div class="game-ranking-info">
                <div class="game-ranking-name">${item.name}${item.price ? ` <span class="game-ranking-price">(${item.price})</span>` : ''}</div>
                ${item.desc ? `<div class="game-ranking-desc">${item.desc}</div>` : ''}
              </div>
            </div>
          `).join('');
          result.push(`
            <div class="game-ranking-list">
              ${block.caption ? `<div class="game-ranking-title">${block.caption}</div>` : ''}
              ${rankingItems}
            </div>
          `);
          break;

        case 'link-group':
          const linkItems = block.links.map(link => {
            if (!link.url || !link.text) return '';
            let iconHtml = '';
            if (link.url.startsWith('/games/')) {
              const gameSlug = link.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = link.subtext ? `<span class="blog-link-subtext">${link.subtext}</span>` : '';
            return `<a href="${link.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${link.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`;
          }).filter(Boolean).join('');
          if (linkItems) {
            result.push(`<div class="blog-link-grid">${linkItems}</div>`);
          }
          break;

        case 'link':
          if (block.url && block.text) {
            let iconHtml = '';
            if (block.url.startsWith('/games/')) {
              const gameSlug = block.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = block.subtext ? `<span class="blog-link-subtext">${block.subtext}</span>` : '';
            result.push(`<a href="${block.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${block.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
          }
          break;
      }
    });

    return result.join('');
  };

  // 관련 게임
  const findGameBySlug = (slug) => {
    for (const [name, game] of Object.entries(gamesMap)) {
      if (game.slug === slug) return { name, ...game };
    }
    return null;
  };
  const manualGames = (post.relatedGames || []).map(slug => findGameBySlug(slug)).filter(Boolean);
  const fullText = content.filter(b => b.type === 'text').map(b => b.value).join(' ');
  const relatedGames = 'relatedGames' in post ? manualGames : findRelatedGames(fullText);
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <div class="blog-related-title">관련 게임</div>
      <div class="blog-related-grid">
        ${relatedGames.map(g => `
          <a href="/games/${g.slug}/" class="blog-related-card">
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (핫픽 + 인사이트 + 이슈 + 위키)
  const findHotpickBySlug = (slug) => hotpickReports.find(r => r.slug === slug);
  const findInsightBySlug = (slug) => insightReports.find(r => r.slug === slug);
  const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
  const relatedHotpicksList = (post.relatedHotpicks || []).map(slug => findHotpickBySlug(slug)).filter(Boolean).slice(0, 2);
  const relatedInsightsList = (post.relatedInsights || []).map(slug => findInsightBySlug(slug)).filter(Boolean).slice(0, 2);
  const relatedIssuesList = (post.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);

  // 관련 위키
  const findWikiBySlug = (category, slug) => {
    const articles = wikiData[category] || [];
    return articles.find(a => a.slug === slug);
  };
  const relatedWikiList = (post.relatedWiki || []).map(ref => {
    const [cat, slug] = ref.split('/');
    const article = findWikiBySlug(cat, slug);
    return article ? { ...article, category: cat } : null;
  }).filter(Boolean).slice(0, 4);

  const hasRelatedDocs = relatedHotpicksList.length > 0 || relatedInsightsList.length > 0 || relatedIssuesList.length > 0 || relatedWikiList.length > 0;
  const relatedDocsHtml = hasRelatedDocs ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedHotpicksList.map(hotpick => `
          <a href="/magazine/hotpick/${hotpick.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalHotpickImagePath(hotpick.slug, hotpick.thumbnail, 'thumbnail')}" alt="" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${hotpick.title}</span></span>
          </a>
        `).join('')}
        ${relatedInsightsList.map(insight => `
          <a href="/magazine/insight/${insight.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalInsightImagePath(insight.slug, insight.thumbnail, 'thumbnail')}" alt="" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${insight.title}</span></span>
          </a>
        `).join('')}
        ${relatedIssuesList.map(issue => `
          <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')}" alt="" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${issue.title}</span></span>
          </a>
        `).join('')}
        ${relatedWikiList.map(wiki => `
          <a href="/wiki/${wiki.category}/${wiki.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalWikiThumbPath(wiki.category, wiki.slug, wiki.thumbnail)}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${wiki.title}</span></span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 정보 출처
  const sources = post.sources || [];
  const sourcesHtml = sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="nofollow noopener">${s.name} - ${s.title}</a></li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // 네비게이션
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/magazine/hotpick/${nav.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/magazine/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/magazine/hotpick/${nav.next.slug}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  // 사이드바: 카테고리 메뉴 (카운트 포함)
  const generateSidebarCategories = () => {
    const reportCounts = {
      issue: (issueReports || []).length,
      insight: (insightReports || []).length,
      hotpick: (hotpickReports || []).length,
      ranking: (rankingReports || []).length
    };
    return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/daily/" class="sidebar-category-item"><span class="sidebar-category-name">일간 (${magazineCounts.daily || 0})</span></a>
          <a href="/magazine/weekly/" class="sidebar-category-item"><span class="sidebar-category-name">주간 (${magazineCounts.weekly || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/issue/" class="sidebar-category-item"><span class="sidebar-category-name">이슈 (${reportCounts.issue})</span></a>
          <a href="/magazine/insight/" class="sidebar-category-item"><span class="sidebar-category-name">인사이트 (${reportCounts.insight})</span></a>
          <a href="/magazine/hotpick/" class="sidebar-category-item"><span class="sidebar-category-name">핫픽 (${reportCounts.hotpick})</span></a>
          <a href="/magazine/ranking/" class="sidebar-category-item"><span class="sidebar-category-name">순위 분석 (${reportCounts.ranking})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/wiki/history/" class="sidebar-category-item"><span class="sidebar-category-name">히스토리 (${wikiCounts.history || 0})</span></a>
          <a href="/wiki/knowledge/" class="sidebar-category-item"><span class="sidebar-category-name">지식 (${wikiCounts.knowledge || 0})</span></a>
          <a href="/wiki/business/" class="sidebar-category-item"><span class="sidebar-category-name">비즈니스 (${wikiCounts.business || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/tech/normal/" class="sidebar-category-item"><span class="sidebar-category-name">일반 (${techCounts.normal || 0})</span></a>
          <a href="/tech/ai/" class="sidebar-category-item"><span class="sidebar-category-name">AI (${techCounts.ai || 0})</span></a>
          <a href="/tech/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">바이브코딩 (${techCounts.vibecoding || 0})</span></a>
        </div>
      </div>
    </div>
  `;
  };

  // 사이드바: 인기/최신 글 (GA4 기반 매거진 데이터)
  const generateSidebarArticles = (currentSlug, currentType) => {
    const currentLink = `/magazine/${currentType}/${currentSlug}/`;

    const renderList = (items) => items.map((item, i) => {
      const isCurrent = item.link === currentLink;
      const activeClass = isCurrent ? ' active' : '';
      return `
      <a href="${item.link}" class="sidebar-article-item${activeClass}">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
        </div>
      </div>
    `;
  };

  const sidebarHTML = generateSidebarCategories() + generateSidebarArticles(slug, 'hotpick');

  const sidebarScript = sidebarHTML ? `
    <script>
      (function() {
        const sidebarTab = document.getElementById('sidebarArticleTab');
        if (!sidebarTab) return;
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
          document.getElementById('sidebar-' + target)?.classList.add('active');
        });
      })();
    </script>
  ` : '';

  const pageContent = `
    <section class="section active" id="hotpick">

      <article class="page-container issue-container">
        ${topAds}

        <div class="article-layout">
          <div class="article-main">
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <time class="blog-date">${formatDateKorean(date)}</time>
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${getLocalHotpickImagePath(slug, thumbnail, 'thumbnail')}" alt="${heroAlt}" loading="eager">
                </figure>
              ` : ''}
              ${summary ? `<p class="blog-summary">${summary}</p>` : ''}
              <div class="blog-content">
                ${renderContent()}
              </div>
              ${relatedDocsHtml}
              ${relatedGamesHtml}
              ${sourcesHtml}
            </div>

            ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
            ${navHtml}
          </div>

          ${sidebarHTML ? `
          <aside class="article-sidebar">
            <div class="article-sidebar-sticky">
              ${sidebarHTML}
            </div>
          </aside>
          ` : ''}
        </div>
      </article>
    </section>
    ${sidebarScript}
  `;

  // JSON-LD용 이미지 URL
  const schemaImage = thumbnail
    ? (() => {
        const localPath = getLocalHotpickImagePath(slug, thumbnail, 'thumbnail');
        return localPath.startsWith('/') ? `${siteBaseUrl}${localPath}` : localPath;
      })()
    : null;

  const articleSchema = {
    headline: title,
    description: summary || title,
    datePublished: date,
    dateModified: date,
    image: schemaImage
  };

  const thumbnailPath = thumbnail ? getLocalHotpickImagePath(slug, thumbnail, 'thumbnail') : null;

  return wrapWithLayout(pageContent, {
    currentPage: 'trend',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 추천, 핫픽, 구매 가이드, 세일 추천',
    canonical: `${siteBaseUrl}/magazine/hotpick/${slug}/`,
    articleSchema,
    preloadImages: thumbnailPath ? [thumbnailPath] : [],
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/hotpick/${slug}/` }
    ]
  });
}

/**
 * 순위 분석 상세 페이지 생성
 */
function generateRankingDetailPage({ post, nav = {}, rankingReports = [], issueReports = [], insightReports = [], hotpickReports = [], wikiData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">순위 분석을 찾을 수 없습니다</div>', {
      currentPage: 'trend',
      title: '게이머스크롤 | 순위 분석',
      description: '순위 분석을 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/ranking/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
  };
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '순위 분석 대표 이미지');

  // 순위 분석 중간 광고
  const RANKING_REPORT_SLOTS_MOBILE = [
    AD_SLOTS.Article001,
    AD_SLOTS.Article002,
    AD_SLOTS.Article003,
    AD_SLOTS.Article004,
    AD_SLOTS.Article005
  ];

  const generateRankingAdSlot = (adIndex = 0) => {
    if (!ADS_ENABLED) return '';
    const slotId = RANKING_REPORT_SLOTS_MOBILE[adIndex % RANKING_REPORT_SLOTS_MOBILE.length];
    return `<div class="blog-ad">
      ${generateNativeAdSlot(slotId)}
    </div>`;
  };

  // 마크다운 표를 HTML table로 변환
  const parseMarkdownTable = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    if (!lines[0].trim().startsWith('|')) return null;
    const separatorIndex = lines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line.trim()));
    if (separatorIndex < 1) return null;

    const parseCells = (line) => {
      const cells = line.split('|');
      if (cells.length > 0 && cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      return cells.map(cell => cell.trim());
    };

    const headers = parseCells(lines[0]);
    const dataLines = lines.slice(separatorIndex + 1).filter(line => line.trim().startsWith('|'));
    const rows = dataLines.map(line => parseCells(line));

    let html = '<div class="blog-table-wrapper"><table>';
    html += '<thead><tr>';
    headers.forEach(h => { html += `<th>${h}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += `<td>${cell}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  };

  // 관련 게임 찾기
  const findRelatedGames = (text, limit = 4) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      if (text.includes(name) || (game.aliases && game.aliases.some(a => text.includes(a)))) {
        found.push({ name, ...game });
        if (found.length >= limit) break;
      }
    }
    return found;
  };

  // 본문 렌더링
  const renderContent = () => {
    let adIndex = 0;
    let sectionCount = 0;
    let imageIndex = 1;
    const result = [];

    // 연속 link 및 chart 블록 그룹화 전처리
    const processedContent = [];
    let linkGroup = [];
    let chartGroup = [];
    content.forEach((block, idx) => {
      if (block.type === 'link') {
        // chart 그룹이 있으면 먼저 푸시
        if (chartGroup.length > 0) {
          processedContent.push({ type: 'chart-group', charts: chartGroup });
          chartGroup = [];
        }
        linkGroup.push(block);
      } else if (block.type === 'chart') {
        // link 그룹이 있으면 먼저 푸시
        if (linkGroup.length > 0) {
          processedContent.push({ type: 'link-group', links: linkGroup });
          linkGroup = [];
        }
        chartGroup.push(block);
      } else {
        if (linkGroup.length > 0) {
          processedContent.push({ type: 'link-group', links: linkGroup });
          linkGroup = [];
        }
        if (chartGroup.length > 0) {
          processedContent.push({ type: 'chart-group', charts: chartGroup });
          chartGroup = [];
        }
        processedContent.push(block);
      }
    });
    if (linkGroup.length > 0) {
      processedContent.push({ type: 'link-group', links: linkGroup });
    }
    if (chartGroup.length > 0) {
      processedContent.push({ type: 'chart-group', charts: chartGroup });
    }

    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text':
          const paragraphs = block.value.split('\n\n').map(p => {
            const trimmed = p.trim();
            if (trimmed.startsWith('|') && trimmed.includes('|---')) {
              const tableHtml = parseMarkdownTable(trimmed);
              if (tableHtml) return tableHtml;
            }
            // 마크다운 볼드 변환: **텍스트** → <strong>텍스트</strong>
            // 마크다운 리스트 변환: "- " → "• "
            const formatted = trimmed
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+:)\*\*/g, '<strong class="subheading">$1</strong>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/^- /gm, '• ')
              .replace(/\n- /g, '\n• ')
              .replace(/\n/g, '<br>')
              .replace(/class="subheading">([^<]+)<\/strong><br>/g, 'class="subheading">$1</strong>');
            return trimmed ? `<p class="blog-paragraph">${formatted}</p>` : '';
          }).filter(p => p).join('');
          result.push(paragraphs);
          break;
        case 'heading':
          sectionCount++;
          if (sectionCount > 1 && (sectionCount - 1) % 2 === 0) {
            result.push(generateRankingAdSlot(adIndex++));
          }
          result.push(`<h2 class="blog-heading">${escapeHtmlAttr(block.value)}</h2>`);
          break;
        case 'image':
          const imgUrl = block.src?.startsWith('http')
            ? `https://wsrv.nl/?url=${encodeURIComponent(block.src)}&w=800&output=webp`
            : block.src;
          const imgCaption = block.caption ? `<figcaption class="blog-caption">${parseMarkdownLinks(block.caption)}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgUrl}" alt="${escapeHtmlAttr(block.alt || block.caption || title)}" loading="lazy" data-img-fallback="parent-hide">
              ${imgCaption}
            </figure>
          `);
          imageIndex++;
          break;
        case 'quote':
          result.push(`<blockquote class="blog-quote">${parseMarkdownLinks(block.value)}</blockquote>`);
          break;
        case 'list':
          if (Array.isArray(block.items)) {
            const listItems = block.items.map(item => `<li>${parseMarkdownLinks(item)}</li>`).join('');
            result.push(`<ul>${listItems}</ul>`);
          }
          break;
        case 'table':
          if (block.headers && block.rows) {
            let tableHtml = '<div class="blog-table-wrapper"><table>';
            if (block.caption) {
              tableHtml += `<caption>${escapeHtmlAttr(block.caption)}</caption>`;
            }
            tableHtml += '<thead><tr>';
            block.headers.forEach(h => { tableHtml += `<th>${escapeHtmlAttr(h)}</th>`; });
            tableHtml += '</tr></thead><tbody>';
            block.rows.forEach(row => {
              tableHtml += '<tr>';
              row.forEach(cell => { tableHtml += `<td>${parseMarkdownLinks(cell).replace(/\n/g, '<br>')}</td>`; });
              tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>';
            result.push(tableHtml);
          }
          break;
        case 'chart':
          // 단일 차트 블록 (그룹화되지 않은 경우)
          result.push(generateComparisonChart(block));
          break;
        case 'chart-group':
          // 연속 차트 블록 그룹 - 2열 그리드로 배치
          const chartItems = block.charts.map(chart => generateComparisonChart(chart)).join('');
          result.push(`<div class="blog-charts-grid">${chartItems}</div>`);
          break;
        case 'link-group':
          const linkItems = block.links.map(link => {
            if (!link.url || !link.text) return '';
            let iconHtml = '';
            if (link.url.startsWith('/games/')) {
              const gameSlug = link.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = link.subtext ? `<span class="blog-link-subtext">${link.subtext}</span>` : '';
            return `<a href="${link.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${link.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`;
          }).filter(Boolean).join('');
          if (linkItems) {
            result.push(`<div class="blog-link-grid">${linkItems}</div>`);
          }
          break;
        case 'link':
          if (block.url && block.text) {
            let iconHtml = '';
            if (block.url.startsWith('/games/')) {
              const gameSlug = block.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = block.subtext ? `<span class="blog-link-subtext">${block.subtext}</span>` : '';
            result.push(`<a href="${block.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${block.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
          }
          break;
        case 'ad':
          result.push(generateRankingAdSlot(adIndex++));
          break;
        default:
          break;
      }
    });

    return result.join('');
  };

  // 출처 렌더링
  const sourcesHtml = post.sources && post.sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${post.sources.map(src => `
          <li><a href="${src.url}" target="_blank" rel="nofollow noopener">${src.title || src.name}</a></li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // 관련 문서 (이슈, 인사이트, 핫픽)
  const relatedDocs = [];
  if (post.relatedIssues && post.relatedIssues.length > 0) {
    post.relatedIssues.forEach(issueSlug => {
      const issue = issueReports.find(i => i.slug === issueSlug);
      if (issue) {
        relatedDocs.push({ type: 'issue', title: issue.title, link: `/magazine/issue/${issue.slug}/`, thumbnail: issue.thumbnail, slug: issue.slug });
      }
    });
  }
  const relatedDocsHtml = relatedDocs.length > 0 ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedDocs.map(doc => {
          const thumbUrl = doc.thumbnail
            ? getLocalIssueImagePath(doc.slug, doc.thumbnail, 'thumbnail')
            : '';
          return `
            <a href="${doc.link}" class="blog-related-issue-card">
              <img class="blog-related-issue-thumb" src="${thumbUrl}" alt="" loading="lazy">
              <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${doc.title}</span></span>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // 관련 게임 (수동 지정 우선, 없으면 자동 매칭)
  const findGameBySlug = (slug) => {
    for (const [name, game] of Object.entries(gamesMap)) {
      if (game.slug === slug) return { name, ...game };
    }
    return null;
  };
  const manualGames = (post.relatedGames || []).map(slug => findGameBySlug(slug)).filter(Boolean);
  const fullText = content.map(b => b.value || '').join(' ');
  const relatedGames = 'relatedGames' in post ? manualGames : findRelatedGames(fullText, 4);
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <div class="blog-related-title">관련 게임</div>
      <div class="blog-related-grid">
        ${relatedGames.map(game => `
          <a href="/games/${game.slug}/" class="blog-related-card">
            <img class="blog-related-icon" src="${game.icon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${game.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 네비게이션 (이전/다음)
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/magazine/ranking/${nav.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/magazine/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/magazine/ranking/${nav.next.slug}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  // 사이드바: 카테고리 메뉴 (카운트 포함)
  const generateSidebarCategories = () => {
    const reportCounts = {
      issue: (issueReports || []).length,
      insight: (insightReports || []).length,
      hotpick: (hotpickReports || []).length,
      ranking: (rankingReports || []).length
    };
    return `
    <div class="home-card" id="sidebar-categories">
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/daily/" class="sidebar-category-item"><span class="sidebar-category-name">일간 (${magazineCounts.daily || 0})</span></a>
          <a href="/magazine/weekly/" class="sidebar-category-item"><span class="sidebar-category-name">주간 (${magazineCounts.weekly || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/magazine/issue/" class="sidebar-category-item"><span class="sidebar-category-name">이슈 (${reportCounts.issue})</span></a>
          <a href="/magazine/insight/" class="sidebar-category-item"><span class="sidebar-category-name">인사이트 (${reportCounts.insight})</span></a>
          <a href="/magazine/hotpick/" class="sidebar-category-item"><span class="sidebar-category-name">핫픽 (${reportCounts.hotpick})</span></a>
          <a href="/magazine/ranking/" class="sidebar-category-item"><span class="sidebar-category-name">순위 분석 (${reportCounts.ranking})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/wiki/history/" class="sidebar-category-item"><span class="sidebar-category-name">히스토리 (${wikiCounts.history || 0})</span></a>
          <a href="/wiki/knowledge/" class="sidebar-category-item"><span class="sidebar-category-name">지식 (${wikiCounts.knowledge || 0})</span></a>
          <a href="/wiki/business/" class="sidebar-category-item"><span class="sidebar-category-name">비즈니스 (${wikiCounts.business || 0})</span></a>
        </div>
      </div>
      <div class="sidebar-category-group">
        <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
        <div class="sidebar-category-list">
          <a href="/tech/normal/" class="sidebar-category-item"><span class="sidebar-category-name">일반 (${techCounts.normal || 0})</span></a>
          <a href="/tech/ai/" class="sidebar-category-item"><span class="sidebar-category-name">AI (${techCounts.ai || 0})</span></a>
          <a href="/tech/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">바이브코딩 (${techCounts.vibecoding || 0})</span></a>
        </div>
      </div>
    </div>
  `;
  };

  // 사이드바: 인기/최신 글 (GA4 기반 매거진 데이터)
  const generateSidebarArticles = (currentSlug, currentType) => {
    const currentLink = `/magazine/${currentType}/${currentSlug}/`;

    const renderList = (items) => items.map((item, i) => {
      const isCurrent = item.link === currentLink;
      const activeClass = isCurrent ? ' active' : '';
      return `
      <a href="${item.link}" class="sidebar-article-item${activeClass}">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
        </div>
      </div>
    `;
  };

  const sidebarHTML = generateSidebarCategories() + generateSidebarArticles(slug, 'ranking');

  const sidebarScript = sidebarHTML ? `
    <script>
      (function() {
        const sidebarTab = document.getElementById('sidebarArticleTab');
        if (!sidebarTab) return;
        sidebarTab.addEventListener('click', (e) => {
          const btn = e.target.closest('.tab-btn');
          if (!btn) return;
          sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.sidebarTab;
          document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
          document.getElementById('sidebar-' + target)?.classList.add('active');
        });
      })();
    </script>
  ` : '';

  // 로컬 이미지 경로 헬퍼 (ranking 타입)
  const getLocalRankingImagePath = (slug, originalUrl, size = 'thumbnail') => {
    if (!slug || !originalUrl) return originalUrl || '';
    const sizeMap = { 'thumbnail-xs': 'thumbnail-xs.webp', 'thumbnail-sm': 'thumbnail-sm.webp', 'thumbnail': 'thumbnail.webp' };
    const filename = sizeMap[size] || 'thumbnail.webp';
    const localPath = `/assets/images/ranking/${slug}/${filename}`;
    const fullPath = path.join(docsDir, 'assets/images/ranking', slug, filename);
    if (fs.existsSync(fullPath)) return localPath;
    // 폴백: wsrv.nl 프록시
    const width = size === 'thumbnail-xs' ? 200 : size === 'thumbnail-sm' ? 480 : 1200;
    return originalUrl.startsWith('http')
      ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp`
      : originalUrl;
  };

  const heroImg = thumbnail ? getLocalRankingImagePath(slug, thumbnail, 'thumbnail') : '';

  // 상단 광고
  const topAds = ADS_ENABLED ? `<div class="ad-card">${generateAdPairSlot(AD_SLOTS.PCArticle001, AD_SLOTS.Article001)}</div>` : '';

  const pageContent = `
    <section class="section active" id="ranking">
      <article class="page-container issue-container">
        ${topAds}

        <div class="article-layout">
          <div class="article-main">
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <time class="blog-date">${formatDateKorean(date)}</time>
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${heroImg}" alt="${heroAlt}" loading="eager" fetchpriority="high">
                </figure>
              ` : ''}
              ${summary ? `<p class="blog-summary">${summary}</p>` : ''}
              <div class="blog-content">
                ${renderContent()}
              </div>
              ${relatedDocsHtml}
              ${relatedGamesHtml}
              ${sourcesHtml}
            </div>

            ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
            ${navHtml}
          </div>

          ${sidebarHTML ? `
          <aside class="article-sidebar">
            <div class="article-sidebar-sticky">
              ${sidebarHTML}
            </div>
          </aside>
          ` : ''}
        </div>
      </article>
    </section>
    ${sidebarScript}
  `;

  // JSON-LD용 이미지 URL
  const schemaImage = thumbnail
    ? (() => {
        const localPath = getLocalRankingImagePath(slug, thumbnail, 'thumbnail');
        return localPath.startsWith('/') ? `${siteBaseUrl}${localPath}` : localPath;
      })()
    : null;

  const articleSchema = {
    headline: title,
    description: summary || title,
    datePublished: date,
    dateModified: date,
    image: schemaImage
  };

  return wrapWithLayout(pageContent, {
    currentPage: 'trend',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 순위, 순위 분석, 차트 분석, 게임 비교',
    canonical: `${siteBaseUrl}/magazine/ranking/${slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/ranking/${slug}/` }
    ]
  });
}

module.exports = { generateTrendPage, generateDailyDetailPage, generateWeeklyDetailPage, generateIssueDetailPage, generateInsightDetailPage, generateHotpickDetailPage, generateRankingDetailPage };
