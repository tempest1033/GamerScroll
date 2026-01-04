/**
 * 트렌드 페이지 템플릿
 * NOTE: 복잡한 기능은 추후 추가 예정
 */

const fs = require('fs');
const path = require('path');
const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

// games.json 로드 (게임 아이콘용)
let gamesMap = {};
try {
  const gamesPath = path.join(__dirname, '../../../data/games.json');
  if (fs.existsSync(gamesPath)) {
    const data = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    gamesMap = data.games || {};
  }
} catch (e) {
  // 로드 실패 시 빈 객체
}

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

// 광고 슬롯 (홈페이지와 동일한 분리 배치 방식)
const topAdMobile = SHOW_ADS ? '<ins class="adsbygoogle mobile-only ad-slot-section" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '" data-ad-format="horizontal"></ins>' : '';
const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%;max-height:90px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins></div>' : '';

// URL 수정 헬퍼 (이미지 프록시)
const fixUrl = (url) => {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;

  // CORS 허용된 도메인은 직접 로드 (화이트리스트)
  const corsAllowed = [
    'steamstatic.com',
    'steamcdn-a.akamaihd.net',
    'googleusercontent.com',
    'gamerscrawl.com'
  ];
  if (corsAllowed.some(d => url.includes(d))) return url;

  // 나머지 외부 이미지는 프록시
  if (url.startsWith('http')) {
    const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url);
    // wsrv.nl은 avif 출력이 비활성화되어 있어 webp로 강제 변환
    if (/\.avif(?:$|[?#])/i.test(url)) return proxyUrl + '&output=webp';
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

// 중간 광고 슬롯 생성 (PC: horizontal, 모바일: rectangle)
// - 한 페이지 내 중복 슬롯ID 방지를 위해 호출부에서 slotId를 분리해서 넘겨주세요.
function generateMidAdSlot(pcSlotId, mobileSlotId) {
  if (!SHOW_ADS) return '';
  const pcSlot = pcSlotId || AD_SLOTS.horizontal2;
  const mobileSlot = mobileSlotId || AD_SLOTS.rectangle3;
  // 모바일 광고를 먼저 배치 (CLS 방지)
  return `
    <div class="ad-slot ad-slot-section ad-slot--rectangle mobile-only ad-slot--no-reserve">
      <ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${mobileSlot}" data-ad-format="rectangle" data-full-width-responsive="true"></ins>
    </div>
    <div class="ad-slot ad-slot-section ad-slot--horizontal pc-only">
      <ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${pcSlot}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
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

// SVG 아이콘 정의 (주간 리포트용)
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

// 주간 리포트 패널 생성 함수 (원본 html.js의 generateWeeklyReport와 동일)
function generateWeeklyPanel(weeklyInsight) {
  if (!weeklyInsight?.ai) {
    return '<div class="home-empty">주간 리포트를 불러올 수 없습니다</div>';
  }

  const wai = weeklyInsight.ai;
  const wInfo = weeklyInsight.weekInfo || {};
  const weekPeriod = wInfo.startDate && wInfo.endDate
    ? `${formatDateKorean(wInfo.startDate)} ~ ${formatDateKorean(wInfo.endDate)}`
    : (wai.date ? formatDateKorean(wai.date) : '');
  const weekNum = wInfo.weekNumber || wai.weekNumber || '';

  const { issues = [], industryIssues = [], metrics = [], rankings = [], community = [], streaming = [], stocks = {}, summary, mvp, releases = [], global = [] } = wai;

  // seoTitle 미리 계산
  const formatWeekTitle = (period, wNum) => {
    const match = period.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const month = parseInt(match[2]);
      const weekOfMonth = Math.ceil(parseInt(match[3]) / 7);
      return `${month}월 ${weekOfMonth}주차 게임 트렌드 리포트`;
    }
    return `${wNum}주차 게임 트렌드 리포트`;
  };
  const seoTitle = formatWeekTitle(weekPeriod, weekNum);

  // summary 객체에서 title과 desc 추출
  // summary에서 첫 문장 추출
  const extractFirst = (t) => t ? (t.split(/[.!?]/).filter(s => s.trim())[0]?.trim() || t.slice(0, 60)) : null;
  const summaryTitle = typeof summary === 'object' ? summary.title : (wai.headline || extractFirst(summary) || seoTitle);
  const summaryDesc = typeof summary === 'object' ? summary.desc : summary;

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
          const thumbnail = issue.thumbnail ? fixUrl(issue.thumbnail) : null;
          const thumbnailHtml = thumbnail
            ? `<div class="weekly-hot-thumb"><img src="${thumbnail}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
            : '';
          return `
          <div class="weekly-hot-card ${thumbnail ? 'has-thumb' : ''}">
            ${thumbnailHtml}
            <div class="weekly-hot-content">
              <h4 class="weekly-hot-title">${issue.title}</h4>
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
          const thumbUrl = item.thumbnail ? fixUrl(item.thumbnail) : null;
          const thumbHtml = thumbUrl
            ? `<div class="industry-thumb"><img src="${thumbUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
            : `<div class="industry-thumb thumb-fallback"></div>`;
          return `
          <div class="industry-card has-thumb">
            ${thumbHtml}
            <div class="industry-content">
              <h4 class="industry-title">${item.title || ''}</h4>
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
          const thumbUrl = m.thumbnail ? fixUrl(m.thumbnail) : null;
          const gameIcon = findGameIcon(m.title);
          const imageUrl = thumbUrl || gameIcon || '/favicon.svg';
          const thumbHtml = `<div class="metric-thumb"><img src="${imageUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`;
          return `
            <div class="weekly-metric-card has-thumb">
              ${thumbHtml}
              <div class="weekly-metric-content">
                <h4 class="weekly-metric-title">${m.title}</h4>
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
            <h4 class="weekly-community-title">${tagPrefix}${c.title}</h4>
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
              <h4 class="weekly-streaming-title">${s.title}</h4>
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
          const thumbUrl = g.thumbnail ? fixUrl(g.thumbnail) : null;
          const thumbHtml = thumbUrl
            ? `<div class="global-thumb"><img src="${thumbUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
            : `<div class="global-thumb thumb-fallback"></div>`;
          return `
          <div class="global-card has-thumb">
            ${thumbHtml}
            <div class="global-content">
              <h4 class="global-title">${g.title}</h4>
              <p class="global-desc">${g.desc}</p>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  ` : '';

  // 헤드라인 이미지
  const heroThumb = wai.thumbnail || null;
  const heroThumbUrl = heroThumb ? fixUrl(heroThumb) : null;

  return `
    <div class="weekly-report">
      <div class="weekly-header-card ${heroThumbUrl ? 'has-hero-image' : ''}">
        ${heroThumbUrl ? `<div class="weekly-header-image"><img src="${heroThumbUrl}" alt="" loading="eager" onerror="this.parentElement.classList.add('thumb-fallback')"></div>` : ''}
        <div class="weekly-header-text">
          <div class="weekly-header-title">${summaryTitle}</div>
          <div class="weekly-header-meta">
            <span class="weekly-header-period">${weekPeriod}</span>
            <span class="weekly-header-divider">·</span>
            <span class="weekly-header-week">${weekNum}주차</span>
          </div>
          ${summaryDesc ? `<p class="weekly-header-desc">${summaryDesc}</p>` : ''}
        </div>
      </div>

      ${hotIssuesSection}
      ${rankingsSection}
      ${generateMidAdSlot(AD_SLOTS.horizontal2, AD_SLOTS.rectangle3)}
      ${industrySection}
      ${metricsSection}
      ${globalSection}
      ${generateMidAdSlot(AD_SLOTS.horizontal3, AD_SLOTS.rectangle4)}
      ${stocksSection}
      ${releasesSection}
      ${communitySection}
      ${streamingSection}
    </div>
  `;
}

function generateTrendPage(data) {
  const { insight, rankings, steam, weeklyInsight, historyNews = [] } = data;
  const aiInsight = insight?.ai || null;

  if (!aiInsight) {
    const content = `
      <section class="section active" id="insight">
        <div class="home-empty">트렌드를 불러올 수 없습니다</div>
      </section>
    `;
    return wrapWithLayout(content, {
      currentPage: 'trend',
      title: '게이머스크롤 | 게임 트렌드 리포트',
      description: '게임 트렌드 리포트 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 일간·주간 리포트로 한눈에 확인하세요.',
      canonical: 'https://gamerscrawl.com/trend/'
    });
  }

  const getTagIcon = (tag) => tagIcons[tag] || '';
  const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

  // 아이템 렌더링 (일반) - 태그 제거, 제목만
  const renderItem = (item) => {
    // thumbnail 없으면 게임 아이콘 찾기
    const thumbnail = item.thumbnail || null;
    const gameIcon = !thumbnail ? findGameIcon(item.title) : null;
    const imageUrl = thumbnail ? fixUrl(thumbnail) : gameIcon;
    const imageHtml = imageUrl
      ? `<div class="weekly-hot-thumb${gameIcon ? ' is-icon' : ''}"><img src="${imageUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
      : '';
    return `
      <div class="weekly-hot-card ${imageUrl ? 'has-thumb' : ''}">
        ${imageHtml}
        <div class="weekly-hot-content">
          <h4 class="weekly-hot-title">${item.title || ''}</h4>
          <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
        </div>
      </div>
    `;
  };

  // 지표 아이템 렌더링 (썸네일 우선, 없으면 게임 아이콘)
  const renderMetricItem = (item) => {
    const thumbUrl = item.thumbnail ? fixUrl(item.thumbnail) : null;
    const gameIcon = findGameIcon(item.title);
    const imageUrl = thumbUrl || gameIcon || '/favicon.svg';
    const thumbHtml = `<div class="metric-thumb"><img src="${imageUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`;
    return `
      <div class="weekly-metric-card has-thumb">
        ${thumbHtml}
        <div class="weekly-metric-content">
          <h4 class="weekly-metric-title">${item.title || ''}</h4>
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

    const iconHtml = `<img class="title-icon" src="${gameIcon || '/favicon.svg'}" alt="" loading="lazy" onerror="this.src='/favicon.svg';this.onerror=null">`;

    return `
      <div class="weekly-hot-card ranking-item">
        <h4 class="weekly-hot-title">${iconHtml}${item.title || ''}</h4>
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
              ? `<div class="weekly-hot-thumb"><img src="${fixUrl(thumbnail)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
              : '';
            return `
            <div class="weekly-hot-card ${thumbnail ? 'has-thumb' : ''}">
              ${thumbnailHtml}
              <div class="weekly-hot-content">
                <h4 class="weekly-hot-title">${item.title || ''}</h4>
                <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
  };

  // 유저 반응 카드 그리드 렌더링 (주간 리포트 스타일)
  const renderCommunityCards = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => {
      const tagPrefix = item.tag ? `[${item.tag}] ` : '';
      return `
      <div class="weekly-community-card">
        <h4 class="weekly-community-title">${tagPrefix}${item.title || ''}</h4>
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

  // 스트리밍 트렌드 카드 그리드 렌더링 (주간 리포트 스타일)
  const renderStreamingCards = (title, items, iconSvg, desc) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => `
        <div class="weekly-streaming-card">
          <h4 class="weekly-streaming-title">${item.title || ''}</h4>
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
      const thumbUrl = thumb ? fixUrl(thumb) : null;
      const thumbHtml = thumbUrl
        ? `<div class="industry-thumb"><img src="${thumbUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
        : `<div class="industry-thumb thumb-fallback"></div>`;
      return `
      <div class="industry-card has-thumb">
        ${thumbHtml}
        <div class="industry-content">
          <h4 class="industry-title">${item.title || ''}</h4>
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

  // 게임주 현황 섹션 렌더링 (일간 리포트용)
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
          <img class="stock-chart" src="${candleChartUrl}" alt="${displayName} 일봉 차트" onerror="this.src='/favicon.svg';this.onerror=null">
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
  const summaryTitle = typeof aiInsight.summary === 'object' ? aiInsight.summary.title : (aiInsight.headline || '게임 트렌드 리포트');
  const summaryDesc = typeof aiInsight.summary === 'object' ? aiInsight.summary.desc : aiInsight.summary;

  const content = `
    <section class="section active" id="insight">
      ${topAdMobile}
      <div class="insight-page-container">
        ${topAdPc}
        <h1 class="visually-hidden">${summaryTitle}</h1>
        <div class="insight-tabs">
          <button class="insight-tab active" data-tab="daily">일간 리포트</button>
          <button class="insight-tab" data-tab="weekly">주간 리포트</button>
        </div>

        <div class="insight-panel active" id="panel-daily">
          <div class="weekly-header-card">
            <div class="weekly-header-title">${summaryTitle}</div>
            <div class="weekly-header-meta">
              <span class="weekly-header-period">${formatDateKorean(aiInsight.date || new Date().toISOString().split('T')[0])} 리포트</span>
            </div>
            ${summaryDesc ? `<p class="weekly-header-desc">${summaryDesc}</p>` : ''}
          </div>
          ${renderHotIssuesSection(issues, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>')}
          ${generateMidAdSlot(AD_SLOTS.horizontal2, AD_SLOTS.rectangle3)}
          ${renderIndustrySection('업계 동향', industryIssues, '', '국내 게임사들의 주요 발표와 업계 전반의 움직임을 살펴봅니다.', historyNews)}
          ${renderMetricsSection('주목할만한 지표', metrics, '오늘 주목할 만한 수치 변화와 시장 지표입니다.')}
          ${renderCategoryCard('순위 변동', rankingsData, 'weekly-section-rankings', '', true, '앱스토어/플레이스토어 매출 순위에서 주목할 만한 변동이 있었던 게임들입니다.')}
          ${generateMidAdSlot(AD_SLOTS.horizontal3, AD_SLOTS.rectangle4)}
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
    // 폰트 로딩
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }
    // twemoji
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
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
    title: '게이머스크롤 | 게임 트렌드 리포트',
    description: '게임 트렌드 리포트 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 일간·주간 리포트로 한눈에 확인하세요.',
    canonical: 'https://gamerscrawl.com/trend/',
    pageScripts
  });
}

/**
 * 일간 리포트 상세 페이지 생성 (개별 JSON → HTML)
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
        <div class="home-empty">일간 리포트를 불러올 수 없습니다</div>
      </section>
    `;
    return wrapWithLayout(content, {
      currentPage: 'trend',
      title: '게이머스크롤 | 게임 트렌드 리포트',
      description: '게임 트렌드 리포트를 찾을 수 없습니다.',
      canonical: `https://gamerscrawl.com/trend/daily/${slug}/`
    });
  }

  const getTagIcon = (tag) => tagIcons[tag] || '';
  const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

  // 아이템 렌더링 (일반, 이미지 포함)
  const renderItem = (item) => {
    // thumbnail 우선, 없으면 historyNews에서 찾기, 그래도 없으면 게임 아이콘
    const thumbnail = findThumbnail(item);
    const gameIcon = !thumbnail ? findGameIcon(item.title) : null;
    const imageUrl = thumbnail ? fixUrl(thumbnail) : gameIcon;
    const imageHtml = imageUrl
      ? `<div class="weekly-hot-thumb${gameIcon ? ' is-icon' : ''}"><img src="${imageUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
      : '';
    return `
      <div class="weekly-hot-card ${imageUrl ? 'has-thumb' : ''}">
        ${imageHtml}
        <div class="weekly-hot-content">
          <h4 class="weekly-hot-title">${item.title || ''}</h4>
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

    const iconHtml = `<img class="title-icon" src="${gameIcon || '/favicon.svg'}" alt="" loading="lazy" onerror="this.src='/favicon.svg';this.onerror=null">`;

    return `
      <div class="weekly-hot-card ranking-item">
        <h4 class="weekly-hot-title">${iconHtml}${item.title || ''}</h4>
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
    const thumbUrl = item.thumbnail ? fixUrl(item.thumbnail) : null;
    const gameIcon = findGameIcon(item.title);
    const imageUrl = thumbUrl || gameIcon || '/favicon.svg';
    const thumbHtml = `<div class="metric-thumb"><img src="${imageUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`;
    return `
      <div class="weekly-metric-card has-thumb">
        ${thumbHtml}
        <div class="weekly-metric-content">
          <h4 class="weekly-metric-title">${item.title || ''}</h4>
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
              ? `<div class="weekly-hot-thumb"><img src="${fixUrl(thumbnail)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
              : '';
            return `
            <div class="weekly-hot-card ${thumbnail ? 'has-thumb' : ''}">
              ${thumbnailHtml}
              <div class="weekly-hot-content">
                <h4 class="weekly-hot-title">${item.title || ''}</h4>
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
        <h4 class="weekly-community-title">${tagPrefix}${item.title || ''}</h4>
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
          <h4 class="weekly-streaming-title">${item.title || ''}</h4>
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
      const thumbUrl = thumb ? fixUrl(thumb) : null;
      const thumbHtml = thumbUrl
        ? `<div class="industry-thumb"><img src="${thumbUrl}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback')"></div>`
        : `<div class="industry-thumb thumb-fallback"></div>`;
      return `
      <div class="industry-card has-thumb">
        ${thumbHtml}
        <div class="industry-content">
          <h4 class="industry-title">${item.title || ''}</h4>
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
          <img class="stock-chart" src="${candleChartUrl}" alt="${displayName} 일봉 차트" onerror="this.src='/favicon.svg';this.onerror=null">
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
  const summaryTitle = typeof aiInsight.summary === 'object' ? aiInsight.summary.title : (aiInsight.headline || '게임 트렌드 리포트');
  const summaryDesc = typeof aiInsight.summary === 'object' ? aiInsight.summary.desc : aiInsight.summary;

  // 네비게이션 (이전/목록/다음 리포트) - 하단에만 표시
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/trend/daily/${nav.prev}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/trend/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/trend/daily/${nav.next}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  const content = `
    <section class="section active" id="insight">
      ${topAdMobile}
      <div class="insight-page-container">
        ${topAdPc}
        <h1 class="visually-hidden">${summaryTitle}</h1>
        ${(() => {
          // 헤드라인 이미지
          const heroThumb = aiInsight.thumbnail || null;
          const heroThumbUrl = heroThumb ? fixUrl(heroThumb) : null;
          return `
        <div class="weekly-header-card ${heroThumbUrl ? 'has-hero-image' : ''}">
          ${heroThumbUrl ? `<div class="weekly-header-image"><img src="${heroThumbUrl}" alt="" loading="eager" onerror="this.parentElement.classList.add('thumb-fallback')"></div>` : ''}
          <div class="weekly-header-text">
            <div class="weekly-header-title">${summaryTitle}</div>
            <div class="weekly-header-meta">
              <span class="weekly-header-period">${formatDateKorean(aiInsight.date || slug)} 리포트</span>
            </div>
            ${summaryDesc ? `<p class="weekly-header-desc">${summaryDesc}</p>` : ''}
          </div>
        </div>`;
        })()}
        ${renderHotIssuesSection(issues, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>')}
        ${generateMidAdSlot(AD_SLOTS.horizontal2, AD_SLOTS.rectangle3)}
        ${renderIndustrySection('업계 동향', industryIssues, '', '국내 게임사들의 주요 발표와 업계 전반의 움직임을 살펴봅니다.', historyNews)}
        ${renderMetricsSection('주목할만한 지표', metrics, '오늘 주목할 만한 수치 변화와 시장 지표입니다.')}
        ${renderCategoryCard('순위 변동', rankingsData, 'weekly-section-rankings', '', true, '앱스토어/플레이스토어 매출 순위에서 주목할 만한 변동이 있었던 게임들입니다.')}
        ${generateMidAdSlot(AD_SLOTS.horizontal3, AD_SLOTS.rectangle4)}
        ${renderStocksCard(stocksData, stockPrices)}
        ${renderCommunityCards('유저 반응', communityData, '', '디시인사이드, 아카라이브, 인벤 등 주요 게임 커뮤니티에서 화제가 된 이슈들입니다.')}
        ${renderStreamingCards('스트리밍 트렌드', streaming, '', '치지직, 유튜브 등 스트리밍 플랫폼에서의 게임 콘텐츠 동향입니다.')}
        ${navHtml}
      </div>
    </section>
  `;

  // SEO 정보
  const dateForTitle = aiInsight.date || slug;
  const summaryText = typeof aiInsight.summary === 'object' ? aiInsight.summary.title : aiInsight.summary;
  const descriptionText = summaryText || '게임 트렌드 리포트 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 한눈에 확인하세요.';
  const dynamicKeywords = issues.slice(0, 4).map(i => i.title).join(', ');
  const keywordsText = dynamicKeywords ? `게임 트렌드, ${dynamicKeywords}` : '게임 트렌드, 게임 업계 이슈, 게임 순위, 게임 뉴스';

  const pageScripts = `
  <script>
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
  </script>`;

  // Article JSON-LD 스키마
  const articleSchema = {
    headline: summaryTitle,
    description: descriptionText,
    datePublished: aiInsight.date || slug,
    dateModified: insight?.aiGeneratedAt?.split('T')[0] || aiInsight.date || slug,
    image: insight?.ai?.thumbnail || null
  };

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: summaryTitle,
    description: descriptionText,
    keywords: keywordsText,
    canonical: `https://gamerscrawl.com/trend/daily/${slug}/`,
    pageScripts,
    articleSchema
  });
}

/**
 * 주간 리포트 상세 페이지 생성 (개별 JSON → HTML)
 * @param {Object} params
 * @param {Object} params.weeklyInsight - 주간 인사이트 데이터 (ai, weekInfo 필드 포함)
 * @param {string} params.slug - URL slug (예: 2025-W51)
 * @param {Object} params.nav - 이전/다음 리포트 정보 (optional)
 */
function generateWeeklyDetailPage({ weeklyInsight, slug, nav = {} }) {
  if (!weeklyInsight?.ai) {
    const content = `
      <section class="section active" id="insight">
        <div class="home-empty">주간 리포트를 불러올 수 없습니다</div>
      </section>
    `;
    return wrapWithLayout(content, {
      currentPage: 'trend',
      title: '게이머스크롤 | 주간 게임 트렌드 리포트',
      description: '주간 게임 트렌드 리포트를 찾을 수 없습니다.',
      canonical: `https://gamerscrawl.com/trend/weekly/${slug}/`
    });
  }

  // 네비게이션 (이전/목록/다음 리포트) - 하단에만 표시
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/trend/weekly/${nav.prev}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/trend/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/trend/weekly/${nav.next}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  const weeklyPanelHtml = generateWeeklyPanel(weeklyInsight);
  const waiForH1 = weeklyInsight.ai;
  const h1Title = typeof waiForH1.summary === 'object' ? waiForH1.summary.title : (waiForH1.headline || waiForH1.summary || `${slug} 주간 게임 트렌드 리포트`);

  const content = `
    <section class="section active" id="insight">
      ${topAdMobile}
      <div class="insight-page-container">
        ${topAdPc}
        <h1 class="visually-hidden">${h1Title}</h1>
        ${weeklyPanelHtml}
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
  const summaryTitle = typeof wai.summary === 'object' ? wai.summary.title : (wai.headline || wai.summary);
  const descriptionText = summaryTitle || '주간 게임 트렌드 리포트 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 한눈에 확인하세요.';

  const pageScripts = `
  <script>
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
  </script>`;

  // 동적 키워드 (issues에서 4개 추출)
  const weeklyIssues = wai.issues || [];
  const dynamicKeywords = weeklyIssues.slice(0, 4).map(i => i.title).join(', ');
  const keywordsText = dynamicKeywords ? `게임 트렌드, ${dynamicKeywords}` : '게임 트렌드, 게임 업계 이슈, 게임 순위, 게임 뉴스';

  // Article JSON-LD 스키마
  const articleSchema = {
    headline: summaryTitle || `${weekNum}주차 주간 게임 트렌드 리포트`,
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
    canonical: `https://gamerscrawl.com/trend/weekly/${slug}/`,
    pageScripts,
    articleSchema
  });
}

/**
 * Deep Dive 심층 리포트 상세 페이지 생성
 * @param {Object} params
 * @param {Object} params.post - Deep Dive 포스트 데이터
 * @param {Object} params.nav - 이전/다음 포스트 정보
 */
function generateDeepDiveDetailPage({ post, nav = {} }) {
  if (!post) {
    return wrapWithLayout('<div class="home-empty">포스트를 찾을 수 없습니다</div>', {
      currentPage: 'trend',
      title: '게이머스크롤 | Deep Dive',
      description: 'Deep Dive를 찾을 수 없습니다.',
      canonical: 'https://gamerscrawl.com/trend/deep-dive/'
    });
  }

  const { slug, title, date, thumbnail, summary, content = [] } = post;

  // Deep Dive 중간 광고
  const DEEP_DIVE_PC_SLOTS = [AD_SLOTS.horizontal2, AD_SLOTS.horizontal3, AD_SLOTS.horizontal];
  const DEEP_DIVE_MOBILE_SLOTS = [AD_SLOTS.rectangle3, AD_SLOTS.rectangle4, AD_SLOTS.rectangle2, AD_SLOTS.rectangle];

  const generateDeepDiveAdSlot = (adIndex = 0) => {
    if (!SHOW_ADS) return '';
    const pcSlot = DEEP_DIVE_PC_SLOTS[adIndex % DEEP_DIVE_PC_SLOTS.length];
    const mobileSlot = DEEP_DIVE_MOBILE_SLOTS[adIndex % DEEP_DIVE_MOBILE_SLOTS.length];
    return `
      <div class="blog-ad">
        <div class="ad-slot ad-slot--rectangle mobile-only ad-slot--no-reserve">
          <ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${mobileSlot}" data-ad-format="rectangle" data-full-width-responsive="true"></ins>
        </div>
        <div class="ad-slot ad-slot--horizontal pc-only">
          <ins class="adsbygoogle" data-gc-ad="1" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${pcSlot}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
        </div>
      </div>
    `;
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
    return content.map((block) => {
      switch (block.type) {
        case 'text':
          const paragraphs = block.value.split('\n\n').map(p =>
            `<p class="blog-paragraph">${p.replace(/\n/g, '<br>')}</p>`
          ).join('');
          return paragraphs;

        case 'image':
          const imgSrc = fixUrl(block.src);
          const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          return `
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${block.caption || ''}" loading="lazy" onerror="this.parentElement.style.display='none'">
              ${caption}
            </figure>
          `;

        case 'ad':
          return generateDeepDiveAdSlot(adIndex++);

        case 'quote':
          return `<blockquote class="blog-quote">${block.value}</blockquote>`;

        case 'heading':
          return `<h2 class="blog-heading">${block.value}</h2>`;

        default:
          return '';
      }
    }).join('');
  };

  // 관련 게임
  const fullText = content.filter(b => b.type === 'text').map(b => b.value).join(' ');
  const relatedGames = findRelatedGames(fullText);
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <h3 class="blog-related-title">관련 게임</h3>
      <div class="blog-related-grid">
        ${relatedGames.map(g => `
          <a href="/games/${g.slug}/" class="blog-related-card">
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="" loading="lazy" onerror="this.src='/favicon.svg'">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 네비게이션
  const navHtml = `
    <div class="trend-detail-nav">
      ${nav.prev ? `<a href="/trend/deep-dive/${nav.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>` : '<span class="trend-nav-btn disabled">‹ 이전</span>'}
      <a href="/trend/" class="trend-nav-btn list">목록</a>
      ${nav.next ? `<a href="/trend/deep-dive/${nav.next.slug}/" class="trend-nav-btn next">다음 ›</a>` : '<span class="trend-nav-btn disabled">다음 ›</span>'}
    </div>
  `;

  const pageContent = `
    <section class="section active" id="deep-dive">
      ${topAdMobile}
      <article class="blog-article">
        ${topAdPc}

        <div class="blog-card">
          ${thumbnail ? `
            <div class="blog-hero">
              <img class="blog-hero-image" src="${fixUrl(thumbnail)}" alt="" loading="eager">
            </div>
          ` : ''}
          <header class="blog-header">
            <h1 class="blog-title">${title}</h1>
            <div class="blog-meta">
              <time class="blog-date">${formatDateKorean(date)}</time>
            </div>
            ${summary ? `<p class="blog-summary">${summary}</p>` : ''}
          </header>
        </div>

        <div class="blog-content">
          ${renderContent()}
        </div>

        ${relatedGamesHtml}
        ${navHtml}
      </article>
    </section>
  `;

  const pageScripts = `
  <script>
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }
  </script>`;

  const articleSchema = {
    headline: title,
    description: summary || title,
    datePublished: date,
    dateModified: date,
    image: thumbnail || null
  };

  return wrapWithLayout(pageContent, {
    currentPage: 'trend',
    title: `${title} | 게이머스크롤`,
    description: summary || title,
    keywords: '게임 분석, Deep Dive, 심층 리포트, 모바일 게임',
    canonical: `https://gamerscrawl.com/trend/deep-dive/${slug}/`,
    pageScripts,
    articleSchema
  });
}

module.exports = { generateTrendPage, generateDailyDetailPage, generateWeeklyDetailPage, generateDeepDiveDetailPage };
