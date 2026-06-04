/**
 * 트렌드 페이지 템플릿
 * NOTE: 복잡한 기능은 추후 추가 예정
 */

const fs = require('fs');
const path = require('path');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { renderTextBlock, parseMarkdownTable: parseMarkdownTableShared } = require('../helpers/content-text');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// docs 폴더 경로 (이미지 로컬 확인용)
const docsDir = path.join(__dirname, '../../../docs');

// history 폴더 경로 (순위 분석 차트용)
const historyDir = path.join(__dirname, '../../../history');

// games.json 경로
const gamesJsonPath = path.join(__dirname, '../../../data/games.json');

// JSON modifiedAt 값을 KST ISO 8601로 정규화. 없으면 null 반환(스키마에서 제외됨).
function resolveModifiedKST(rawModified) {
  if (!rawModified) return null;
  const s = String(rawModified).trim();
  if (!s) return null;
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00+09:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s + ':00+09:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s + '+09:00';
  return s;
}

// 광고 활성화 여부
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';

// Article body ads keep the dedicated in-article slots; handling matches feed scroll ads.
const IN_ARTICLE_SLOTS = [
  AD_SLOTS.InArticle001, AD_SLOTS.InArticle002
];
function getInArticleAdHTML(adIndex) {
  const slotId = IN_ARTICLE_SLOTS[adIndex % IN_ARTICLE_SLOTS.length];
  return `<div class="ad-card ad-card-scroll blog-in-article-ad" data-ad-index="${adIndex + 1}">
<ins class="adsbygoogle"
     style="display:block"
     data-ad-format="fluid"
     data-ad-layout="in-article"
     data-ad-client="ca-pub-9477874183990825"
     data-ad-slot="${slotId}"></ins>
</div>`;
}

const { renderRankingBlock } = require('../helpers/ranking-blocks');

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

const snapshotsDir = path.join(__dirname, '../../../snapshots/rankings');

// snapshots/rankings/*.csv에서 특정 기간의 게임 순위 데이터 로드
function loadGameRankHistory(gameSlug, startDate, endDate, category = 'grossing', market = 'ios') {
  if (!fs.existsSync(snapshotsDir)) return [];

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
  const platform = market === 'ios' ? 'ios' : 'aos';
  const expectedAppId = appIds[market] || appIds[`${market}:kr`];

  // 날짜 범위 생성
  const dates = [];
  const s = new Date(startDate);
  const e = new Date(endDate);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const result = [];
  const regions = ['kr', 'jp', 'us', 'cn', 'tw'];

  for (const date of dates) {
    const dayData = { date };

    for (const region of regions) {
      // 중국 Android는 없음
      if (platform === 'aos' && region === 'cn') continue;

      const csvFile = path.join(snapshotsDir, `${date}_${platform}_${region}_${category}.csv`);
      if (!fs.existsSync(csvFile)) continue;

      try {
        const content = fs.readFileSync(csvFile, 'utf8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('time,'));

        let bestRank = null;
        const regionAppId = appIds[market] || appIds[`${market}:${region}`];

        for (const line of lines) {
          // CSV 파싱: time,rank,id,title
          const match = line.match(/^[^,]+,(\d+),([^,]+),/);
          if (!match) continue;

          const rank = parseInt(match[1], 10);
          const appId = match[2].replace(/"/g, '');

          // appId 매칭
          if (regionAppId && String(appId) === String(regionAppId)) {
            if (bestRank === null || rank < bestRank) {
              bestRank = rank;
            }
          }
        }

        // appId 매칭 실패 시 이름 매칭 폴백
        if (bestRank === null) {
          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length < 4) continue;
            const rank = parseInt(parts[1], 10);
            const title = (parts[3] || '').replace(/"/g, '').toLowerCase().trim();
            if (allNames.includes(title)) {
              if (bestRank === null || rank < bestRank) {
                bestRank = rank;
              }
            }
          }
        }

        if (bestRank !== null) {
          dayData[region] = bestRank;
        }
      } catch (e) {
        // 파일 읽기 실패 무시
      }
    }

    // 최소 하나 이상의 지역 데이터가 있으면 추가
    if (Object.keys(dayData).length > 1) {
      result.push(dayData);
    }
  }

  return result;
}

// 비교 차트 생성 (ApexCharts) - ranking-line과 동일한 패턴
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

  // startDate~endDate 전체 날짜 생성
  const allDates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }

  // 게임별 색상
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

  // ApexCharts series 데이터 구성
  const rawSeries = [];
  gameDataList.forEach((game) => {
    const data = allDates.map(date => {
      const dayData = game.history.find(h => h.date === date);
      return (dayData && dayData.kr) ? dayData.kr : null;
    });
    const displayName = game.name.length > 12 ? game.name.substring(0, 12) + '...' : game.name;
    rawSeries.push({ name: displayName, data });
  });

  if (rawSeries.length === 0) {
    return '<div class="chart-error">순위 데이터가 없습니다</div>';
  }

  // 앞뒤 null 트리밍: 모든 시리즈에서 데이터가 시작/끝나는 범위만 남김
  let trimStart = allDates.length;
  let trimEnd = -1;
  rawSeries.forEach(s => {
    for (let i = 0; i < s.data.length; i++) {
      if (s.data[i] !== null) { trimStart = Math.min(trimStart, i); break; }
    }
    for (let i = s.data.length - 1; i >= 0; i--) {
      if (s.data[i] !== null) { trimEnd = Math.max(trimEnd, i); break; }
    }
  });
  if (trimStart > trimEnd) trimStart = 0;
  const labels = allDates.slice(trimStart, trimEnd + 1);
  const series = rawSeries.map(s => ({ name: s.name, data: s.data.slice(trimStart, trimEnd + 1) }));

  // 차트 제목
  const categoryLabel = category === 'grossing' ? '매출' : '인기';
  const marketLabel = market === 'ios' ? 'iOS' : 'Android';
  const chartTitle = title || `${marketLabel} ${categoryLabel} 순위 비교 (한국)`;

  const chartId = `comp-chart-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

  return `
    <div class="ranking-chart-wrapper">
      <h4 class="ranking-chart-title">${String(chartTitle).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</h4>
      <div id="${chartId}" class="ranking-chart"></div>
      <script>
        (function() {
          function init() {
            if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
            var el = document.getElementById('${chartId}');
            if (!el || el.dataset.rendered) return;
            el.dataset.rendered = 'true';
            var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            var labelColor = isDark ? '#adb5bd' : '#666';
            var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
            new ApexCharts(el, {
              series: ${JSON.stringify(series)},
              chart: { type: 'line', height: 350, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', zoom: { enabled: false }, foreColor: labelColor },
              colors: ${JSON.stringify(colors.slice(0, series.length))},
              stroke: { width: 3, curve: 'straight' },
              markers: { size: 4, hover: { size: 6 } },
              xaxis: { categories: ${JSON.stringify(labels)}, labels: { rotate: -45, style: { fontSize: '11px', colors: labelColor } }, tickAmount: 10 },
              yaxis: { reversed: true, min: 1, max: 200, labels: { style: { colors: labelColor }, formatter: function(v) { return Math.round(v) + '위'; } } },
              legend: { position: 'top', horizontalAlign: 'center', labels: { colors: labelColor } },
              tooltip: { y: { formatter: function(v) { return v ? v + '위' : '데이터 없음'; } } },
              grid: { borderColor: gridColor, strokeDashArray: 4 }
            }).render();
          }
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
          else init();
        })();
      </script>
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
const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001);

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

// 통합 relatedDocs → 관련 문서 HTML 렌더링 헬퍼
function renderParsedRelatedDocsHtml(parsedRelatedDocs) {
  if (!parsedRelatedDocs || parsedRelatedDocs.length === 0) return '';

  const items = parsedRelatedDocs.map(item => {
    let href, thumbSrc;
    if (item.type === 'issue') {
      href = `/magazine/issue/${item.slug}/`;
      thumbSrc = getLocalIssueImagePath(item.slug, item.thumbnail, 'thumbnail');
    } else if (item.type === 'insight') {
      href = `/magazine/insight/${item.slug}/`;
      thumbSrc = getLocalInsightImagePath(item.slug, item.thumbnail, 'thumbnail');
    } else if (item.type === 'hotpick') {
      href = `/magazine/hotpick/${item.slug}/`;
      thumbSrc = getLocalHotpickImagePath(item.slug, item.thumbnail, 'thumbnail');
    } else if (item.type === 'ranking') {
      href = `/magazine/ranking/${item.slug}/`;
      // ranking은 별도 이미지 디렉토리가 없을 수 있으므로 fixUrl 사용
      thumbSrc = item.thumbnail ? fixUrl(item.thumbnail) : '/favicon.svg';
    } else if (item.type === 'wiki') {
      href = `/wiki/${item.category}/${item.slug}/`;
      thumbSrc = getLocalWikiThumbPath(item.category, item.slug, item.thumbnail);
    } else if (item.type === 'tech') {
      href = `/tech/${item.category}/${item.slug}/`;
      thumbSrc = item.thumbnail ? fixUrl(item.thumbnail) : '/favicon.svg';
    } else {
      return '';
    }

    return `
          <a href="${href}" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${thumbSrc || '/favicon.svg'}" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
          </a>`;
  }).join('');

  return `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${items}
      </div>
    </div>
  `;
}

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

function generateIssueDetailPage({ post, nav = {}, parsedRelatedDocs = null, issueReports = [], insightReports = [], hotpickReports = [], rankingReports = [], wikiData = {}, techData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">포스트를 찾을 수 없습니다</div>', {
      currentPage: 'magazine',
      title: '게이머스크롤 | 이슈',
      description: '이슈를 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/issue/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const editorName = post.editor || 'Editor J';
  // 화면 표시용 dateModified (YYYY-MM-DD)
  const _displayDateModified = post && post.modifiedAt ? String(post.modifiedAt).slice(0, 10) : null;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  };
  const parseTableCell = (str) => parseMarkdownLinks(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '이슈 대표 이미지');

  // 마크다운 표 변환은 공통 helper(content-text)로 위임
  const parseMarkdownTable = (text) => parseMarkdownTableShared(text, { tableClass: 'blog-table-wrapper' });

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

    let sectionCount = 1;
    let adCount = 0;
    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text': {
          result.push(renderTextBlock(block.value, { tableClass: 'blog-table-wrapper' }));
          break;
        }

        case 'image':
          // 로컬 이미지 우선, 없으면 외부 URL
          const imgSrc = getLocalIssueImagePath(slug, block.src, 'content', imageIndex);
          imageIndex++;
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${escapeHtmlAttr(block.alt || block.caption || '')}" width="1200" height="675" loading="lazy" data-img-fallback="parent-hide">
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

        case 'note':
          result.push(`<div class="blog-note">${block.value}</div>`);
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
          sectionCount++;
          if (sectionCount % 2 === 0) {
            result.push(getInArticleAdHTML(adCount++));
          }
          result.push(`<h2 class="blog-heading">${block.value}</h2>`);
          break;

        case 'table':
          if (!block.headers || !block.rows) break;
          const tblHeaders = block.headers.map(h => `<th>${parseTableCell(h)}</th>`).join('');
          const tblRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseTableCell(cell)}</td>`).join('')}</tr>`
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="${g.name}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (parsedRelatedDocs 통합 우선, 없으면 레거시 폴백)
  let relatedDocsHtml = '';
  if (parsedRelatedDocs && parsedRelatedDocs.length > 0) {
    relatedDocsHtml = renderParsedRelatedDocsHtml(parsedRelatedDocs);
  } else {
    // 레거시 폴백: relatedIssues + relatedWiki + relatedTech
    const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
    const relatedIssuesList = (post.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);
    const findWikiBySlug = (category, slug) => {
      const articles = wikiData[category] || [];
      return articles.find(a => a.slug === slug);
    };
    const relatedWikiList = (post.relatedWiki || []).map(ref => {
      const [cat, slug] = ref.split('/');
      const article = findWikiBySlug(cat, slug);
      return article ? { ...article, category: cat } : null;
    }).filter(Boolean).slice(0, 4);
    const relatedTechList = (post.relatedTech || []).map(ref => {
      if (typeof ref !== 'string' || !ref.trim()) return null;
      const parts = ref.split('/');
      const category = parts.length > 1 ? parts[0] : 'ai';
      const articleSlug = parts.length > 1 ? parts[1] : parts[0];
      const article = (techData[category] || []).find(a => a.slug === articleSlug);
      return article ? { ...article, category } : null;
    }).filter(Boolean).slice(0, 4);
    const hasRelatedDocs = relatedIssuesList.length > 0 || relatedWikiList.length > 0 || relatedTechList.length > 0;
    relatedDocsHtml = hasRelatedDocs ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedIssuesList.map(issue => `
          <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')}" alt="${issue.title}" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${issue.title}</span></span>
          </a>
        `).join('')}
        ${relatedWikiList.map(wiki => `
          <a href="/wiki/${wiki.category}/${wiki.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalWikiThumbPath(wiki.category, wiki.slug, wiki.thumbnail)}" alt="${wiki.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${wiki.title}</span></span>
          </a>
        `).join('')}
        ${relatedTechList.map(tech => `
          <a href="/tech/${tech.category}/${tech.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${fixUrl(tech.thumbnail)}" alt="${tech.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${tech.title}</span></span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';
  }

  // 정보 출처
  const sources = post.sources || [];
  const sourcesHtml = sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="noopener">${s.name} - ${s.title}</a></li>
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
        var init = function() {
          if (!window.GSUtils || typeof window.GSUtils.toggleSidebarArticleTab !== 'function') return;
          window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
        };
        if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.toggleSidebarArticleTab === 'function') {
          init();
        } else if (typeof window.__gsOnReady === 'function') {
          window.__gsOnReady(init);
        } else if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
          init();
        }
      })();
    </script>
  ` : '';

  const pageContent = `
    <section class="section active" id="issue">

      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${topAds}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <span class="blog-editor">${editorName}</span>
                  ${_displayDateModified && _displayDateModified !== (date || '').slice(0, 10)
                    ? `<time class="blog-date">${formatDateKorean(date)} 발행</time><time class="blog-date">${formatDateKorean(_displayDateModified)} 최종 수정</time>`
                    : `<time class="blog-date">${formatDateKorean(date)}</time>`
                  }
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${getLocalIssueImagePath(slug, thumbnail, 'thumbnail')}" alt="${heroAlt}" loading="eager" fetchpriority="high">
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
    dateModified: resolveModifiedKST(post.modifiedAt),
    image: schemaImage,
    author: editorName
  };

  return wrapWithLayout(pageContent, {
    currentPage: 'magazine',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 분석, 이슈, 게임 이슈, 모바일 게임',
    canonical: `${siteBaseUrl}/magazine/issue/${slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/issue/${slug}/` }
    ],
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles },
    ogImage: schemaImage
  });
}

// ========== 인사이트 상세 페이지 ==========
function generateInsightDetailPage({ post, nav = {}, parsedRelatedDocs = null, insightReports = [], issueReports = [], hotpickReports = [], rankingReports = [], wikiData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">인사이트를 찾을 수 없습니다</div>', {
      currentPage: 'magazine',
      title: '게이머스크롤 | 인사이트',
      description: '인사이트를 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/insight/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const editorName = post.editor || 'Editor J';
  // 화면 표시용 dateModified (YYYY-MM-DD)
  const _displayDateModified = post && post.modifiedAt ? String(post.modifiedAt).slice(0, 10) : null;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  };
  const parseTableCell = (str) => parseMarkdownLinks(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '인사이트 대표 이미지');

  // 마크다운 표 변환은 공통 helper(content-text)로 위임
  const parseMarkdownTable = (text) => parseMarkdownTableShared(text, { tableClass: 'blog-table-wrapper' });

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

    let sectionCount = 1;
    let adCount = 0;
    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text': {
          result.push(renderTextBlock(block.value, { tableClass: 'blog-table-wrapper' }));
          break;
        }

        case 'image':
          const imgSrc = getLocalInsightImagePath(slug, block.src, 'content', imageIndex);
          imageIndex++;
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${escapeHtmlAttr(block.alt || block.caption || '')}" width="1200" height="675" loading="lazy" data-img-fallback="parent-hide">
              ${caption}
            </figure>
          `);
          break;

        case 'ad':
          break;

        case 'quote':
          result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
          break;

        case 'note':
          result.push(`<div class="blog-note">${block.value}</div>`);
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
          if (sectionCount % 2 === 0) {
            result.push(getInArticleAdHTML(adCount++));
          }
          result.push(`<h2 class="blog-heading">${block.value}</h2>`);
          break;

        case 'table':
          if (!block.headers || !block.rows) break;
          const tblHeaders = block.headers.map(h => `<th>${parseTableCell(h)}</th>`).join('');
          const tblRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseTableCell(cell)}</td>`).join('')}</tr>`
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="${g.name}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (parsedRelatedDocs 통합 우선, 없으면 레거시 폴백)
  let relatedDocsHtml = '';
  if (parsedRelatedDocs && parsedRelatedDocs.length > 0) {
    relatedDocsHtml = renderParsedRelatedDocsHtml(parsedRelatedDocs);
  } else {
    // 레거시 폴백: relatedInsights + relatedIssues + relatedWiki
    const findInsightBySlug = (slug) => insightReports.find(r => r.slug === slug);
    const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
    const relatedInsightsList = (post.relatedInsights || []).map(slug => findInsightBySlug(slug)).filter(Boolean).slice(0, 2);
    const relatedIssuesList = (post.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);
    const findWikiBySlug = (category, slug) => {
      const articles = wikiData[category] || [];
      return articles.find(a => a.slug === slug);
    };
    const relatedWikiList = (post.relatedWiki || []).map(ref => {
      const [cat, slug] = ref.split('/');
      const article = findWikiBySlug(cat, slug);
      return article ? { ...article, category: cat } : null;
    }).filter(Boolean).slice(0, 4);
    const hasRelatedDocs = relatedInsightsList.length > 0 || relatedIssuesList.length > 0 || relatedWikiList.length > 0;
    relatedDocsHtml = hasRelatedDocs ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedInsightsList.map(insight => `
          <a href="/magazine/insight/${insight.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalInsightImagePath(insight.slug, insight.thumbnail, 'thumbnail')}" alt="${insight.title}" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${insight.title}</span></span>
          </a>
        `).join('')}
        ${relatedIssuesList.map(issue => `
          <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')}" alt="${issue.title}" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${issue.title}</span></span>
          </a>
        `).join('')}
        ${relatedWikiList.map(wiki => `
          <a href="/wiki/${wiki.category}/${wiki.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalWikiThumbPath(wiki.category, wiki.slug, wiki.thumbnail)}" alt="${wiki.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${wiki.title}</span></span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';
  }

  // 정보 출처
  const sources = post.sources || [];
  const sourcesHtml = sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="noopener">${s.name} - ${s.title}</a></li>
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
        var init = function() {
          if (!window.GSUtils || typeof window.GSUtils.toggleSidebarArticleTab !== 'function') return;
          window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
        };
        if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.toggleSidebarArticleTab === 'function') {
          init();
        } else if (typeof window.__gsOnReady === 'function') {
          window.__gsOnReady(init);
        } else if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
          init();
        }
      })();
    </script>
  ` : '';

  const pageContent = `
    <section class="section active" id="insight">

      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${topAds}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <span class="blog-editor">${editorName}</span>
                  ${_displayDateModified && _displayDateModified !== (date || '').slice(0, 10)
                    ? `<time class="blog-date">${formatDateKorean(date)} 발행</time><time class="blog-date">${formatDateKorean(_displayDateModified)} 최종 수정</time>`
                    : `<time class="blog-date">${formatDateKorean(date)}</time>`
                  }
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${getLocalInsightImagePath(slug, thumbnail, 'thumbnail')}" alt="${heroAlt}" loading="eager" fetchpriority="high">
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
    dateModified: resolveModifiedKST(post.modifiedAt),
    image: schemaImage,
    author: editorName
  };

  return wrapWithLayout(pageContent, {
    currentPage: 'magazine',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 트렌드, 인사이트, 게임 분석, 모바일 게임',
    canonical: `${siteBaseUrl}/magazine/insight/${slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/insight/${slug}/` }
    ],
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles },
    ogImage: schemaImage
  });
}

// ========== 핫픽 상세 페이지 ==========
function generateHotpickDetailPage({ post, nav = {}, parsedRelatedDocs = null, hotpickReports = [], issueReports = [], insightReports = [], rankingReports = [], wikiData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">핫픽을 찾을 수 없습니다</div>', {
      currentPage: 'magazine',
      title: '게이머스크롤 | 핫픽',
      description: '핫픽을 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/hotpick/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const editorName = post.editor || 'Editor J';
  // 화면 표시용 dateModified (YYYY-MM-DD)
  const _displayDateModified = post && post.modifiedAt ? String(post.modifiedAt).slice(0, 10) : null;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  };
  const parseTableCell = (str) => parseMarkdownLinks(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '핫픽 대표 이미지');

  // 마크다운 표 변환은 공통 helper(content-text)로 위임
  const parseMarkdownTable = (text) => parseMarkdownTableShared(text, { tableClass: 'blog-table-wrapper' });

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

    let sectionCount = 1;
    let adCount = 0;
    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text': {
          result.push(renderTextBlock(block.value, { tableClass: 'blog-table-wrapper' }));
          break;
        }

        case 'image':
          const imgSrc = getLocalHotpickImagePath(slug, block.src, 'content', imageIndex);
          imageIndex++;
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${escapeHtmlAttr(block.alt || block.caption || '')}" width="1200" height="675" loading="lazy" data-img-fallback="parent-hide">
              ${caption}
            </figure>
          `);
          break;

        case 'ad':
          break;

        case 'quote':
          result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
          break;

        case 'note':
          result.push(`<div class="blog-note">${block.value}</div>`);
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
          if (sectionCount % 2 === 0) {
            result.push(getInArticleAdHTML(adCount++));
          }
          result.push(`<h2 class="blog-heading">${block.value}</h2>`);
          break;

        case 'table':
          if (!block.headers || !block.rows) break;
          const tblHeaders = block.headers.map(h => `<th>${parseTableCell(h)}</th>`).join('');
          const tblRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseTableCell(cell)}</td>`).join('')}</tr>`
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="${g.name}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (parsedRelatedDocs 통합 우선, 없으면 레거시 폴백)
  let relatedDocsHtml = '';
  if (parsedRelatedDocs && parsedRelatedDocs.length > 0) {
    relatedDocsHtml = renderParsedRelatedDocsHtml(parsedRelatedDocs);
  } else {
    // 레거시 폴백: relatedHotpicks + relatedInsights + relatedIssues + relatedWiki
    const findHotpickBySlug = (slug) => hotpickReports.find(r => r.slug === slug);
    const findInsightBySlug = (slug) => insightReports.find(r => r.slug === slug);
    const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
    const relatedHotpicksList = (post.relatedHotpicks || []).map(slug => findHotpickBySlug(slug)).filter(Boolean).slice(0, 2);
    const relatedInsightsList = (post.relatedInsights || []).map(slug => findInsightBySlug(slug)).filter(Boolean).slice(0, 2);
    const relatedIssuesList = (post.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);
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
    relatedDocsHtml = hasRelatedDocs ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${relatedHotpicksList.map(hotpick => `
          <a href="/magazine/hotpick/${hotpick.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalHotpickImagePath(hotpick.slug, hotpick.thumbnail, 'thumbnail')}" alt="${hotpick.title}" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${hotpick.title}</span></span>
          </a>
        `).join('')}
        ${relatedInsightsList.map(insight => `
          <a href="/magazine/insight/${insight.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalInsightImagePath(insight.slug, insight.thumbnail, 'thumbnail')}" alt="${insight.title}" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${insight.title}</span></span>
          </a>
        `).join('')}
        ${relatedIssuesList.map(issue => `
          <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalIssueImagePath(issue.slug, issue.thumbnail, 'thumbnail')}" alt="${issue.title}" loading="lazy">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${issue.title}</span></span>
          </a>
        `).join('')}
        ${relatedWikiList.map(wiki => `
          <a href="/wiki/${wiki.category}/${wiki.slug}/" class="blog-related-issue-card">
            <img class="blog-related-issue-thumb" src="${getLocalWikiThumbPath(wiki.category, wiki.slug, wiki.thumbnail)}" alt="${wiki.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${wiki.title}</span></span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';
  }

  // 정보 출처
  const sources = post.sources || [];
  const sourcesHtml = sources.length > 0 ? `
    <div class="blog-sources">
      <div class="blog-sources-title">정보 출처</div>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="noopener">${s.name} - ${s.title}</a></li>
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
        var init = function() {
          if (!window.GSUtils || typeof window.GSUtils.toggleSidebarArticleTab !== 'function') return;
          window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
        };
        if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.toggleSidebarArticleTab === 'function') {
          init();
        } else if (typeof window.__gsOnReady === 'function') {
          window.__gsOnReady(init);
        } else if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
          init();
        }
      })();
    </script>
  ` : '';

  const pageContent = `
    <section class="section active" id="hotpick">

      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${topAds}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <span class="blog-editor">${editorName}</span>
                  ${_displayDateModified && _displayDateModified !== (date || '').slice(0, 10)
                    ? `<time class="blog-date">${formatDateKorean(date)} 발행</time><time class="blog-date">${formatDateKorean(_displayDateModified)} 최종 수정</time>`
                    : `<time class="blog-date">${formatDateKorean(date)}</time>`
                  }
                </div>
              </header>
              ${thumbnail ? `
                <figure class="blog-figure">
                  <img class="blog-image" src="${getLocalHotpickImagePath(slug, thumbnail, 'thumbnail')}" alt="${heroAlt}" loading="eager" fetchpriority="high">
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
    dateModified: resolveModifiedKST(post.modifiedAt),
    image: schemaImage,
    author: editorName
  };

  return wrapWithLayout(pageContent, {
    currentPage: 'magazine',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 추천, 핫픽, 구매 가이드, 세일 추천',
    canonical: `${siteBaseUrl}/magazine/hotpick/${slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '브리핑', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/hotpick/${slug}/` }
    ],
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles },
    ogImage: schemaImage
  });
}

/**
 * 순위 분석 상세 페이지 생성
 */
function generateRankingDetailPage({ post, nav = {}, parsedRelatedDocs = null, rankingReports = [], issueReports = [], insightReports = [], hotpickReports = [], wikiData = {}, techData = {}, wikiCounts = {}, techCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">순위 분석을 찾을 수 없습니다</div>', {
      currentPage: 'magazine',
      title: '게이머스크롤 | 순위 분석',
      description: '순위 분석을 찾을 수 없습니다.',
      canonical: `${siteBaseUrl}/magazine/ranking/`,
      noindex: true
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;
  const editorName = post.editor || 'Editor J';
  // 화면 표시용 dateModified (YYYY-MM-DD)
  const _displayDateModified = post && post.modifiedAt ? String(post.modifiedAt).slice(0, 10) : null;
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const parseMarkdownLinks = (str) => {
    const escaped = escapeHtmlAttr(str);
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  };
  const parseTableCell = (str) => parseMarkdownLinks(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const heroAlt = escapeHtmlAttr(title ? `${title} 대표 이미지` : '순위 분석 대표 이미지');

  // 마크다운 표 변환은 공통 helper(content-text)로 위임
  const parseMarkdownTable = (text) => parseMarkdownTableShared(text, { tableClass: 'blog-table-wrapper' });

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

    let sectionCount = 1;
    let adCount = 0;
    processedContent.forEach((block) => {
      switch (block.type) {
        case 'text': {
          result.push(renderTextBlock(block.value, { tableClass: 'blog-table-wrapper' }));
          break;
        }
        case 'heading':
          sectionCount++;
          if (sectionCount % 2 === 0) {
            result.push(getInArticleAdHTML(adCount++));
          }
          // 순위 변동 지표 스타일 적용: (신규), (▲N), (▼N), (-)
          const headingHtml = escapeHtmlAttr(block.value)
            .replace(/\(신규\)/g, '<span class="heading-rank-badge heading-rank-new">신규</span>')
            .replace(/\(▲(\d+)\)/g, '<span class="heading-rank-badge heading-rank-up">▲$1</span>')
            .replace(/\(▼(\d+)\)/g, '<span class="heading-rank-badge heading-rank-down">▼$1</span>')
            .replace(/\(-\)/g, '<span class="heading-rank-badge heading-rank-same">-</span>');
          result.push(`<h2 class="blog-heading">${headingHtml}</h2>`);
          break;
        case 'image':
          const imgUrl = block.src?.startsWith('http')
            ? `https://wsrv.nl/?url=${encodeURIComponent(block.src)}&w=800&output=webp`
            : block.src;
          const imgCaption = block.caption ? `<figcaption class="blog-caption">${parseMarkdownLinks(block.caption)}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgUrl}" alt="${escapeHtmlAttr(block.alt || block.caption || title)}" width="1200" height="675" loading="lazy" data-img-fallback="parent-hide">
              ${imgCaption}
            </figure>
          `);
          imageIndex++;
          break;
        case 'quote':
          result.push(`<blockquote class="blog-quote">${parseMarkdownLinks(block.value)}</blockquote>`);
          break;
        case 'note':
          result.push(renderRankingBlock(block, { gamesMap, escapeHtmlAttr }));
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
            block.headers.forEach(h => { tableHtml += `<th>${parseTableCell(h)}</th>`; });
            tableHtml += '</tr></thead><tbody>';
            block.rows.forEach(row => {
              tableHtml += '<tr>';
              row.forEach(cell => {
                let cellHtml = parseTableCell(cell).replace(/\n/g, '<br>');
                cellHtml = cellHtml
                  .replace(/▲\s*(\d+)/g, '<span class="rank-up">▲$1</span>')
                  .replace(/▼\s*(\d+)/g, '<span class="rank-down">▼$1</span>');
                tableHtml += `<td>${cellHtml}</td>`;
              });
              tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>';
            result.push(tableHtml);
          }
          break;
        case 'chart':
          // 단일 차트 블록 (그룹화되지 않은 경우)
          result.push(renderRankingBlock(block, { gamesMap, escapeHtmlAttr }));
          break;
        case 'chart-group':
          // 연속 차트 블록 그룹 - 2열 그리드로 배치
          result.push(renderRankingBlock(block, { gamesMap, escapeHtmlAttr }));
          break;
        case 'link-group':
          const linkItems = block.links.map(link => {
            if (!link.url || !link.text) return '';
            let iconHtml = '';
            if (link.url.startsWith('/games/')) {
              const gameSlug = link.url.replace('/games/', '').replace(/\/$/, '');
              for (const [name, game] of Object.entries(gamesMap)) {
                if (game.slug === gameSlug && game.icon) {
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
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
                  iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${game.name}" loading="lazy">`;
                  break;
                }
              }
            }
            const subtext = block.subtext ? `<span class="blog-link-subtext">${block.subtext}</span>` : '';
            result.push(`<a href="${block.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${block.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
          }
          break;
        case 'ad':
          break;
        case 'ranking-bar':
          result.push(renderRankingBlock(block, { gamesMap, escapeHtmlAttr }));
          break;

        case 'ranking-line':
          // 여러 게임 순위 추이 비교 라인 차트
          const lineChartId = `ranking-line-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const lineGames = block.games || [];
          const lineMarket = block.market || 'ios';
          const lineCategory = block.category || 'grossing';
          const lineStart = block.startDate || '';
          const lineEnd = block.endDate || '';
          const lineColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

          // 게임별 데이터 수집
          const lineSeries = [];
          const lineLabels = [];
          lineGames.forEach((gameSlug, gIdx) => {
            let gameName = gameSlug;
            let gameData = [];
            for (const [name, game] of Object.entries(gamesMap)) {
              if (game.slug === gameSlug) {
                gameName = name.length > 12 ? name.substring(0, 12) + '...' : name;
                const historyKey = lineMarket === 'android' ? 'androidHistory' : 'iosHistory';
                const history = game[historyKey]?.[lineCategory] || [];
                history.forEach(h => {
                  if ((!lineStart || h.date >= lineStart) && (!lineEnd || h.date <= lineEnd)) {
                    gameData.push({ x: h.date, y: h.rank });
                    if (gIdx === 0) lineLabels.push(h.date);
                  }
                });
                break;
              }
            }
            if (gameData.length > 0) {
              lineSeries.push({ name: gameName, data: gameData.map(d => d.y) });
            }
          });

          if (lineSeries.length > 0) {
            result.push(`
              <div class="ranking-chart-wrapper">
                ${block.title ? `<h4 class="ranking-chart-title">${escapeHtmlAttr(block.title)}</h4>` : ''}
                <div id="${lineChartId}" class="ranking-chart"></div>
                <script>
                  (function() {
                    function init() {
                      if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
                      var el = document.getElementById('${lineChartId}');
                      if (!el || el.dataset.rendered) return;
                      el.dataset.rendered = 'true';
                      var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                      var labelColor = isDark ? '#adb5bd' : '#666';
                      var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
                      new ApexCharts(el, {
                        series: ${JSON.stringify(lineSeries)},
                        chart: { type: 'line', height: 350, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', zoom: { enabled: false }, foreColor: labelColor },
                        colors: ${JSON.stringify(lineColors.slice(0, lineSeries.length))},
                        stroke: { width: 3, curve: 'straight' },
                        markers: { size: 4, hover: { size: 6 } },
                        xaxis: { categories: ${JSON.stringify(lineLabels)}, labels: { rotate: -45, style: { fontSize: '11px', colors: labelColor } }, tickAmount: 10 },
                        yaxis: { reversed: true, min: 1, max: 200, labels: { style: { colors: labelColor }, formatter: function(v) { return Math.round(v) + '위'; } } },
                        legend: { position: 'top', horizontalAlign: 'center', labels: { colors: labelColor } },
                        tooltip: { y: { formatter: function(v) { return v ? v + '위' : '데이터 없음'; } } },
                        grid: { borderColor: gridColor, strokeDashArray: 4 }
                      }).render();
                    }
                    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
                    else init();
                  })();
                </script>
              </div>
            `);
          }
          break;

        case 'ranking-podium':
          // 1/2/3위 포디움 시각화
          const podiumItems = block.items || [];
          const top3 = podiumItems.slice(0, 3);

          const getPodiumIcon = (slug) => {
            for (const [name, game] of Object.entries(gamesMap)) {
              if (game.slug === slug && game.icon) return game.icon;
            }
            return '';
          };

          result.push(`
            <div class="ranking-podium">
              ${top3[1] ? `
                <div class="podium-item podium-2nd">
                  <div class="podium-medal">🥈</div>
                  <img class="podium-icon" src="${getPodiumIcon(top3[1].slug)}" alt="${escapeHtmlAttr(top3[1].name)}" loading="lazy">
                  <div class="podium-name">${escapeHtmlAttr(top3[1].name)}</div>
                  <div class="podium-score">${top3[1].score?.toLocaleString() || ''}점</div>
                  <div class="podium-bar podium-bar-2nd"></div>
                </div>
              ` : ''}
              ${top3[0] ? `
                <div class="podium-item podium-1st">
                  <div class="podium-medal">🥇</div>
                  <img class="podium-icon" src="${getPodiumIcon(top3[0].slug)}" alt="${escapeHtmlAttr(top3[0].name)}" loading="lazy">
                  <div class="podium-name">${escapeHtmlAttr(top3[0].name)}</div>
                  <div class="podium-score">${top3[0].score?.toLocaleString() || ''}점</div>
                  <div class="podium-bar podium-bar-1st"></div>
                </div>
              ` : ''}
              ${top3[2] ? `
                <div class="podium-item podium-3rd">
                  <div class="podium-medal">🥉</div>
                  <img class="podium-icon" src="${getPodiumIcon(top3[2].slug)}" alt="${escapeHtmlAttr(top3[2].name)}" loading="lazy">
                  <div class="podium-name">${escapeHtmlAttr(top3[2].name)}</div>
                  <div class="podium-score">${top3[2].score?.toLocaleString() || ''}점</div>
                  <div class="podium-bar podium-bar-3rd"></div>
                </div>
              ` : ''}
            </div>
          `);
          break;

        case 'ranking-card':
          result.push(renderRankingBlock(block, { gamesMap, escapeHtmlAttr }));
          break;

        case 'ranking-donut':
          // 비율 도넛 차트
          const donutChartId = `ranking-donut-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const donutItems = block.items || [];
          const donutLabels = donutItems.map(item => item.name);
          const donutValues = donutItems.map(item => item.value || item.score || 0);
          const donutColors = block.colors || ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

          result.push(`
            <div class="ranking-chart-wrapper ranking-chart-small">
              ${block.title ? `<h4 class="ranking-chart-title">${escapeHtmlAttr(block.title)}</h4>` : ''}
              <div id="${donutChartId}" class="ranking-chart"></div>
              <script>
                (function() {
                  function init() {
                    if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
                    var el = document.getElementById('${donutChartId}');
                    if (!el || el.dataset.rendered) return;
                    el.dataset.rendered = 'true';
                    var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                    var labelColor = isDark ? '#adb5bd' : '#666';
                    var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
                    new ApexCharts(el, {
                      series: ${JSON.stringify(donutValues)},
                      chart: { type: 'donut', height: 300, fontFamily: 'Pretendard Variable, sans-serif', foreColor: labelColor },
                      labels: ${JSON.stringify(donutLabels)},
                      colors: ${JSON.stringify(donutColors.slice(0, donutItems.length))},
                      legend: { position: 'bottom', labels: { colors: labelColor } },
                      dataLabels: { enabled: true, formatter: function(v) { return Math.round(v) + '%'; } },
                      plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: '총점', formatter: function(w) { return w.globals.seriesTotals.reduce((a,b) => a+b, 0).toLocaleString(); } } } } } },
                      tooltip: { y: { formatter: function(v) { return v.toLocaleString() + '점'; } } }
                    }).render();
                  }
                  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
                  else init();
                })();
              </script>
            </div>
          `);
          break;

        case 'ranking-summary':
          // 요약 통계 카드
          const summaryItems = block.items || [];
          result.push(`
            <div class="ranking-summary">
              ${summaryItems.map(item => `
                <div class="ranking-summary-item">
                  <div class="ranking-summary-value">${item.value}</div>
                  <div class="ranking-summary-label">${escapeHtmlAttr(item.label)}</div>
                </div>
              `).join('')}
            </div>
          `);
          break;

        case 'ranking-trend':
          // ApexCharts 단일 게임 순위 추이 (area chart)
          const trendChartId = `ranking-trend-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const trendSlug = block.game || (block.games && block.games[0]) || '';
          const trendMarket = block.market || 'ios';
          const trendCategory = block.category || 'grossing';
          const trendStart = block.startDate || '';
          const trendEnd = block.endDate || '';
          const trendColor = trendMarket === 'android' ? '#3DDC84' : '#007AFF';

          let trendName = trendSlug;
          let trendData = [];
          let trendLabels = [];
          let trendIcon = '';

          // 게임 정보 찾기
          for (const [name, game] of Object.entries(gamesMap)) {
            if (game.slug === trendSlug) {
              trendName = name.length > 20 ? name.substring(0, 20) + '...' : name;
              trendIcon = game.icon || '';
              break;
            }
          }

          // loadGameRankHistory로 데이터 로드
          const trendHistory = loadGameRankHistory(trendSlug, trendStart, trendEnd, trendCategory, trendMarket);
          trendHistory.forEach(h => {
            if (h.kr) {
              trendLabels.push(h.date.slice(5).replace('-', '/'));
              // 200위 밖은 null로 처리 (차트에서 숨김)
              trendData.push(h.kr <= 200 ? h.kr : null);
            }
          });

          if (trendData.length > 0) {
            const trendMin = Math.min(...trendData);
            const trendMax = Math.max(...trendData);
            result.push(`
              <div class="ranking-chart-wrapper">
                ${block.title ? `<h4 class="ranking-chart-title">${escapeHtmlAttr(block.title)}</h4>` : ''}
                <div id="${trendChartId}" class="ranking-chart"></div>
                <script>
                  (function() {
                    function init() {
                      if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
                      var el = document.getElementById('${trendChartId}');
                      if (!el || el.dataset.rendered) return;
                      el.dataset.rendered = 'true';
                      var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                      var labelColor = isDark ? '#adb5bd' : '#666';
                      var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
                      new ApexCharts(el, {
                        series: [{ name: '${escapeHtmlAttr(trendName)}', data: ${JSON.stringify(trendData)} }],
                        chart: { type: 'area', height: 280, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', zoom: { enabled: false }, sparkline: { enabled: false }, foreColor: labelColor },
                        colors: ['${trendColor}'],
                        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1, stops: [0, 90, 100] } },
                        stroke: { width: 3, curve: 'smooth' },
                        markers: { size: 0, hover: { size: 5 } },
                        xaxis: { categories: ${JSON.stringify(trendLabels)}, labels: { rotate: -45, style: { fontSize: '10px', colors: labelColor } }, tickAmount: Math.min(10, ${trendLabels.length}) },
                        yaxis: { reversed: true, min: 1, max: 200, labels: { style: { colors: labelColor }, formatter: function(v) { return Math.round(v) + '위'; } } },
                        tooltip: { y: { formatter: function(v) { return v + '위'; } } },
                        grid: { borderColor: gridColor, strokeDashArray: 4 },
                        annotations: { yaxis: [{ y: ${trendMin}, borderColor: '${trendColor}', label: { text: '최고 ${trendMin}위', style: { background: '${trendColor}', color: '#fff', fontSize: '11px' } } }] }
                      }).render();
                    }
                    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
                    else init();
                  })();
                </script>
              </div>
            `);
          }
          break;

        case 'ranking-compare':
          result.push(renderRankingBlock(block, { gamesMap, escapeHtmlAttr }));
          break;

        case 'ranking-heatmap':
          // 히트맵 (요일별/시간별 순위 분포)
          const heatChartId = `ranking-heatmap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const heatItems = block.items || [];

          if (heatItems.length > 0) {
            result.push(`
              <div class="ranking-chart-wrapper">
                ${block.title ? `<h4 class="ranking-chart-title">${escapeHtmlAttr(block.title)}</h4>` : ''}
                <div id="${heatChartId}" class="ranking-chart"></div>
                <script>
                  (function() {
                    function init() {
                      if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
                      var el = document.getElementById('${heatChartId}');
                      if (!el || el.dataset.rendered) return;
                      el.dataset.rendered = 'true';
                      var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                      var labelColor = isDark ? '#adb5bd' : '#666';
                      var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
                      new ApexCharts(el, {
                        series: ${JSON.stringify(heatItems)},
                        chart: { type: 'heatmap', height: 300, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', foreColor: labelColor },
                        dataLabels: { enabled: false },
                        colors: ['#008FFB'],
                        plotOptions: { heatmap: { shadeIntensity: 0.5, colorScale: { ranges: [
                          { from: 1, to: 10, color: '#00A100', name: 'TOP 10' },
                          { from: 11, to: 30, color: '#128FD9', name: '11-30위' },
                          { from: 31, to: 50, color: '#FFB200', name: '31-50위' },
                          { from: 51, to: 100, color: '#FF0000', name: '51-100위' },
                          { from: 101, to: 150, color: '#CC0000', name: '101-150위' },
                          { from: 151, to: 200, color: '#990000', name: '151-200위' }
                        ] } } },
                        xaxis: { labels: { style: { fontSize: '11px', colors: labelColor } } },
                        legend: { position: 'bottom', labels: { colors: labelColor } }
                      }).render();
                    }
                    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
                    else init();
                  })();
                </script>
              </div>
            `);
          }
          break;

        case 'ranking-radar':
          // 레이더 차트 (게임 스탯 비교)
          const radarChartId = `ranking-radar-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const radarSeries = block.series || [];
          const radarCategories = block.categories || [];

          if (radarSeries.length > 0) {
            result.push(`
              <div class="ranking-chart-wrapper ranking-chart-small">
                ${block.title ? `<h4 class="ranking-chart-title">${escapeHtmlAttr(block.title)}</h4>` : ''}
                <div id="${radarChartId}" class="ranking-chart"></div>
                <script>
                  (function() {
                    function init() {
                      if (typeof ApexCharts === 'undefined') { setTimeout(init, 100); return; }
                      var el = document.getElementById('${radarChartId}');
                      if (!el || el.dataset.rendered) return;
                      el.dataset.rendered = 'true';
                      var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                      var labelColor = isDark ? '#adb5bd' : '#666';
                      var gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
                      new ApexCharts(el, {
                        series: ${JSON.stringify(radarSeries)},
                        chart: { type: 'radar', height: 350, toolbar: { show: false }, fontFamily: 'Pretendard Variable, sans-serif', foreColor: labelColor },
                        colors: ['#FF6B6B', '#4ECDC4', '#45B7D1'],
                        xaxis: { categories: ${JSON.stringify(radarCategories)}, labels: { style: { colors: labelColor } } },
                        yaxis: { show: false },
                        legend: { position: 'bottom', labels: { colors: labelColor } },
                        markers: { size: 4 },
                        fill: { opacity: 0.2 },
                        stroke: { width: 2 }
                      }).render();
                    }
                    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
                    else init();
                  })();
                </script>
              </div>
            `);
          }
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
          <li><a href="${src.url}" target="_blank" rel="noopener">${src.title || src.name}</a></li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // 관련 문서 (parsedRelatedDocs 통합 우선, 없으면 레거시 폴백)
  let relatedDocsHtml = '';
  if (parsedRelatedDocs && parsedRelatedDocs.length > 0) {
    relatedDocsHtml = renderParsedRelatedDocsHtml(parsedRelatedDocs);
  } else {
    // 레거시 폴백: relatedIssues + relatedTech
    const legacyRelatedDocs = [];
    if (post.relatedIssues && post.relatedIssues.length > 0) {
      post.relatedIssues.forEach(issueSlug => {
        const issue = issueReports.find(i => i.slug === issueSlug);
        if (issue) {
          legacyRelatedDocs.push({ type: 'issue', title: issue.title, link: `/magazine/issue/${issue.slug}/`, thumbnail: issue.thumbnail, slug: issue.slug });
        }
      });
    }
    if (post.relatedTech && post.relatedTech.length > 0) {
      post.relatedTech.forEach(techPath => {
        const parts = techPath.split('/');
        const category = parts.length > 1 ? parts[0] : 'ai';
        const slug = parts.length > 1 ? parts[1] : parts[0];
        const techArticle = (techData[category] || []).find(a => a.slug === slug);
        if (techArticle) {
          legacyRelatedDocs.push({ type: 'tech', title: techArticle.title, link: `/tech/${category}/${slug}/`, thumbnail: techArticle.thumbnail, slug: slug });
        }
      });
    }
    relatedDocsHtml = legacyRelatedDocs.length > 0 ? `
    <div class="blog-related-issues">
      <div class="blog-related-title">관련 문서</div>
      <div class="blog-related-issues-list">
        ${legacyRelatedDocs.map(doc => {
          const thumbUrl = doc.thumbnail
            ? (doc.type === 'tech' ? fixUrl(doc.thumbnail) : getLocalIssueImagePath(doc.slug, doc.thumbnail, 'thumbnail'))
            : '';
          return `
            <a href="${doc.link}" class="blog-related-issue-card">
              <img class="blog-related-issue-thumb" src="${thumbUrl}" alt="${doc.title}" loading="lazy">
              <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${doc.title}</span></span>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';
  }

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
            <img class="blog-related-icon" src="${game.icon || '/favicon.svg'}" alt="${game.name}" loading="lazy" data-img-fallback-src="/favicon.svg">
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
        var init = function() {
          if (!window.GSUtils || typeof window.GSUtils.toggleSidebarArticleTab !== 'function') return;
          window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
        };
        if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.toggleSidebarArticleTab === 'function') {
          init();
        } else if (typeof window.__gsOnReady === 'function') {
          window.__gsOnReady(init);
        } else if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
          init();
        }
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
  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001);

  const pageContent = `
    <section class="section active" id="ranking">
      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${topAds}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${title}</h1>
                <div class="blog-meta">
                  <span class="blog-editor">${editorName}</span>
                  ${_displayDateModified && _displayDateModified !== (date || '').slice(0, 10)
                    ? `<time class="blog-date">${formatDateKorean(date)} 발행</time><time class="blog-date">${formatDateKorean(_displayDateModified)} 최종 수정</time>`
                    : `<time class="blog-date">${formatDateKorean(date)}</time>`
                  }
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
    dateModified: resolveModifiedKST(post.modifiedAt),
    image: schemaImage,
    author: editorName
  };

  return wrapWithLayout(pageContent, {
    currentPage: 'magazine',
    title: title,
    description: summary || title,
    keywords: post.keywords || '게임 순위, 순위 분석, 차트 분석, 게임 비교',
    canonical: `${siteBaseUrl}/magazine/ranking/${slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '매거진', url: `${siteBaseUrl}/magazine/` },
      { name: title, url: `${siteBaseUrl}/magazine/ranking/${slug}/` }
    ],
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles },
    ogImage: schemaImage
  });
}

module.exports = { generateIssueDetailPage, generateInsightDetailPage, generateHotpickDetailPage, generateRankingDetailPage };
