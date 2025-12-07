/**
 * 트렌드 페이지 템플릿
 * NOTE: 복잡한 기능은 추후 추가 예정
 */

const { wrapWithLayout, SHOW_ADS } = require('../layout');

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
  const weekPeriod = wInfo.startDate && wInfo.endDate ? `${wInfo.startDate} ~ ${wInfo.endDate}` : wai.date || '';
  const weekNum = wInfo.weekNumber || wai.weekNumber || '';

  const { issues = [], industryIssues = [], metrics = [], rankings = [], community = [], streaming = [], stocks = {}, summary, mvp, releases = [], global = [] } = wai;

  // 태그별 아이콘 매핑
  const getTagIcon = (tag) => {
    if (tag === '모바일') return tagIcons['모바일'];
    if (tag === 'PC') return tagIcons['PC'];
    if (tag === '콘솔') return tagIcons['콘솔'];
    if (tag === 'e스포츠') return tagIcons['e스포츠'];
    return '';
  };

  // 주간 요약 (에디터스 노트)
  const weeklyIntro = summary ? `
    <div class="weekly-intro">
      <div class="weekly-intro-header">
        ${icons.edit}
        <span class="weekly-intro-label">위클리 포커스</span>
      </div>
      <p class="weekly-intro-text">${summary}</p>
    </div>
  ` : '';

  // 금주의 핫이슈 (메인 카드) - 최대 5개
  const hotIssuesSection = issues.length > 0 ? `
    <div class="weekly-section weekly-section-hot">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.fire}
          <h3 class="weekly-section-title">금주의 핫이슈</h3>
        </div>
        <p class="weekly-section-desc">지난 주 게임 업계에서 가장 주목받은 소식들을 정리했습니다.</p>
      </div>
      <div class="weekly-hot-issues">
        ${issues.slice(0, 5).map((issue, idx) => `
          <div class="weekly-hot-card ${idx === 0 ? 'featured' : ''}">
            <div class="weekly-hot-tag">${getTagIcon(issue.tag)}${issue.tag}</div>
            <h4 class="weekly-hot-title">${issue.title}</h4>
            <p class="weekly-hot-desc">${issue.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 순위 변동 분석 (비주얼 차트)
  const rankingsSection = rankings.length > 0 ? `
    <div class="weekly-section weekly-section-rankings">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.chart}
          <h3 class="weekly-section-title">순위 변동 분석</h3>
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

  // 업계 동향 (타임라인)
  const industrySection = industryIssues.length > 0 ? `
    <div class="weekly-section weekly-section-industry">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.building}
          <h3 class="weekly-section-title">업계 동향</h3>
        </div>
        <p class="weekly-section-desc">국내 게임사들의 주요 발표와 업계 전반의 움직임을 살펴봅니다.</p>
      </div>
      <div class="weekly-timeline">
        ${industryIssues.map(item => `
          <div class="weekly-timeline-item">
            <div class="weekly-timeline-marker"></div>
            <div class="weekly-timeline-content">
              <span class="weekly-timeline-tag">${item.tag}</span>
              <h4 class="weekly-timeline-title">${item.title}</h4>
              <p class="weekly-timeline-desc">${item.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 주간 지표 (큰 숫자 강조형 카드)
  const metricsSection = metrics.length > 0 ? `
    <div class="weekly-section weekly-section-metrics">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.metric}
          <h3 class="weekly-section-title">주간 지표</h3>
        </div>
        <p class="weekly-section-desc">지난 주 주목할 만한 수치 변화와 시장 지표입니다.</p>
      </div>
      <div class="weekly-metrics-row">
        ${metrics.map((m, idx) => {
          const colors = ['#6366f1', '#22c55e', '#f97316', '#ec4899'];
          const color = colors[idx % colors.length];
          return `
            <div class="weekly-metric-card" style="--metric-color: ${color}">
              <div class="weekly-metric-content">
                <div class="weekly-metric-tag">${m.tag}</div>
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
          ${icons.community}
          <h3 class="weekly-section-title">커뮤니티 반응</h3>
        </div>
        <p class="weekly-section-desc">디시인사이드, 아카라이브, 인벤 등 주요 게임 커뮤니티에서 화제가 된 이슈들입니다.</p>
      </div>
      <div class="weekly-community-grid">
        ${community.map(c => `
          <div class="weekly-community-card">
            <div class="weekly-community-game">${c.tag}</div>
            <h4 class="weekly-community-title">${c.title}</h4>
            <p class="weekly-community-desc">${c.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 스트리밍 트렌드 (카드형 그리드)
  const streamingSection = streaming.length > 0 ? `
    <div class="weekly-section weekly-section-streaming">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.stream}
          <h3 class="weekly-section-title">스트리밍 트렌드</h3>
        </div>
        <p class="weekly-section-desc">치지직, 유튜브 등 스트리밍 플랫폼에서의 게임 콘텐츠 동향입니다.</p>
      </div>
      <div class="weekly-streaming-grid">
        ${streaming.map(s => {
          const platformIcon = s.tag === '치지직' ?
            `<svg viewBox="0 0 24 24" fill="#00FFA3"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-5" stroke="#000" stroke-width="2" fill="none"/></svg>` :
            s.tag === '유튜브' ?
            `<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.7 3.5 12 3.5 12 3.5s-7.7 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 8 0 12 0 12s0 4 .5 5.8c.3 1 1 1.8 2 2.1 1.8.6 9.5.6 9.5.6s7.7 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.8.5-5.8.5-5.8s0-4-.5-5.8z"/><path d="M9.5 15.5l6-3.5-6-3.5v7z" fill="#FFF"/></svg>` :
            `<svg viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43z"/></svg>`;
          return `
            <div class="weekly-streaming-card">
              <div class="weekly-streaming-platform">
                ${platformIcon}
                <span>${s.tag}</span>
              </div>
              <h4 class="weekly-streaming-title">${s.title}</h4>
              <p class="weekly-streaming-desc">${s.desc}</p>
            </div>
          `;
        }).join('')}
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
          ${icons.stock}
          <h3 class="weekly-section-title">주간 게임주 분석</h3>
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

  // 주간 MVP 섹션
  const mvpSection = mvp ? `
    <div class="weekly-section weekly-section-mvp">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.trophy}
          <h3 class="weekly-section-title">주간 MVP</h3>
        </div>
        <p class="weekly-section-desc">지난 주 가장 주목받은 게임을 선정했습니다.</p>
      </div>
      <div class="weekly-mvp-card">
        <div class="weekly-mvp-badge">MVP</div>
        <div class="weekly-mvp-content">
          <div class="weekly-mvp-tag">${mvp.tag}</div>
          <h4 class="weekly-mvp-name">${mvp.name}</h4>
          <p class="weekly-mvp-desc">${mvp.desc}</p>
          ${mvp.highlights ? `
          <div class="weekly-mvp-highlights">
            ${mvp.highlights.map(h => `<span class="weekly-mvp-highlight">${h}</span>`).join('')}
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  ` : '';

  // 신작/업데이트 캘린더 섹션
  const releasesSection = releases && releases.length > 0 ? `
    <div class="weekly-section weekly-section-releases">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.calendar}
          <h3 class="weekly-section-title">이번 주 신작/업데이트</h3>
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

  // 글로벌 트렌드 섹션
  const globalSection = global && global.length > 0 ? `
    <div class="weekly-section weekly-section-global">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          ${icons.globe}
          <h3 class="weekly-section-title">글로벌 트렌드</h3>
        </div>
        <p class="weekly-section-desc">해외 게임 시장의 주요 동향을 살펴봅니다.</p>
      </div>
      <div class="weekly-global-grid">
        ${global.map(g => `
          <div class="weekly-global-card">
            <div class="weekly-global-region">${g.tag}</div>
            <h4 class="weekly-global-title">${g.title}</h4>
            <p class="weekly-global-desc">${g.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 날짜 포맷팅 (12월 1주차 형태)
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

  return `
    <div class="weekly-report">
      <div class="weekly-header-card">
        <h1 class="weekly-header-title">${seoTitle}</h1>
        <div class="weekly-header-meta">
          <span class="weekly-header-period">${weekPeriod}</span>
          <span class="weekly-header-divider">·</span>
          <span class="weekly-header-week">${weekNum}주차</span>
        </div>
      </div>

      ${weeklyIntro}
      ${mvpSection}
      ${hotIssuesSection}
      ${rankingsSection}
      ${releasesSection}
      ${industrySection}
      ${metricsSection}
      ${communitySection}
      ${streamingSection}
      ${globalSection}
      ${stocksSection}
    </div>
  `;
}

function generateTrendPage(data) {
  const { insight, rankings, steam, weeklyInsight } = data;
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
      canonical: 'https://gamerscrawl.com/trend'
    });
  }

  const getTagIcon = (tag) => tagIcons[tag] || '';
  const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

  // 아이템 렌더링 (일반)
  const renderItem = (item) => {
    const tagIcon = getTagIcon(item.tag);
    const fixedClass = getFixedTagClass(item.tag);
    return `
      <div class="weekly-hot-card">
        <div class="weekly-hot-tag ${fixedClass}">${tagIcon}${item.tag || ''}</div>
        <h4 class="weekly-hot-title">${item.title || ''}</h4>
        <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
      </div>
    `;
  };

  // 순위 변동 아이템 렌더링 (순위 정보 포함)
  const renderRankingItem = (item) => {
    const hasRankInfo = item.prevRank !== undefined && item.rank !== undefined;
    const changeText = item.change > 0 ? `+${item.change}` : item.change < 0 ? `${item.change}` : '0';
    const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : '';
    const platformText = item.platform ? `${item.platform} ` : '';
    const tagIcon = getTagIcon(item.tag);
    const fixedClass = getFixedTagClass(item.tag);

    const rankBadge = hasRankInfo ? `
      <span class="weekly-ranking-badge ${changeClass}">
        ${platformText}${item.prevRank}위 → ${item.rank}위 (${changeText})
      </span>
    ` : '';

    return `
      <div class="weekly-hot-card ranking-item">
        <div class="weekly-hot-tag ${fixedClass}">${tagIcon}${item.tag || ''}</div>
        <h4 class="weekly-hot-title">${item.title || ''}</h4>
        ${rankBadge}
        <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
      </div>
    `;
  };

  // 카테고리 카드 렌더링 (일반)
  const renderCategoryCard = (title, items, sectionClass, iconSvg, useRankingRenderer = false) => {
    if (!items || items.length === 0) return '';
    const renderer = useRankingRenderer ? renderRankingItem : renderItem;
    return `
      <div class="weekly-section ${sectionClass}">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            ${iconSvg}
            <h3 class="weekly-section-title">${title}</h3>
          </div>
        </div>
        <div class="weekly-hot-issues">
          ${items.map(item => renderer(item)).join('')}
        </div>
      </div>
    `;
  };

  // 오늘의 핫이슈 렌더링 (주간 스타일 - featured 카드 + 설명)
  const renderHotIssuesSection = (items, iconSvg) => {
    if (!items || items.length === 0) return '';
    const limitedItems = items.slice(0, 5); // 최대 5개
    return `
      <div class="weekly-section weekly-section-hot">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            ${iconSvg}
            <h3 class="weekly-section-title">오늘의 핫이슈</h3>
          </div>
          <p class="weekly-section-desc">오늘 게임 업계에서 가장 주목받은 소식들을 정리했습니다.</p>
        </div>
        <div class="weekly-hot-issues">
          ${limitedItems.map((item, idx) => {
            const tagIcon = getTagIcon(item.tag);
            const fixedClass = getFixedTagClass(item.tag);
            return `
              <div class="weekly-hot-card ${idx === 0 ? 'featured' : ''}">
                <div class="weekly-hot-tag ${fixedClass}">${tagIcon}${item.tag || ''}</div>
                <h4 class="weekly-hot-title">${item.title || ''}</h4>
                <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  // 유저 반응 카드 그리드 렌더링 (주간 리포트 스타일)
  const renderCommunityCards = (title, items, iconSvg) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => `
      <div class="weekly-community-card">
        <div class="weekly-community-game">${item.tag || ''}</div>
        <h4 class="weekly-community-title">${item.title || ''}</h4>
        <p class="weekly-community-desc">${item.desc || ''}</p>
      </div>
    `).join('');
    return `
      <div class="weekly-section weekly-section-community">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            ${iconSvg}
            <h3 class="weekly-section-title">${title}</h3>
          </div>
        </div>
        <div class="weekly-community-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 스트리밍 트렌드 카드 그리드 렌더링 (주간 리포트 스타일)
  const renderStreamingCards = (title, items, iconSvg) => {
    if (!items || items.length === 0) return '';
    const cards = items.map(item => {
      const platformIcon = item.tag === '치지직' ?
        `<svg viewBox="0 0 24 24" fill="#00FFA3"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-5" stroke="#000" stroke-width="2" fill="none"/></svg>` :
        item.tag === '유튜브' ?
        `<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.7 3.5 12 3.5 12 3.5s-7.7 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 8 0 12 0 12s0 4 .5 5.8c.3 1 1 1.8 2 2.1 1.8.6 9.5.6 9.5.6s7.7 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.8.5-5.8.5-5.8s0-4-.5-5.8z"/><path d="M9.5 15.5l6-3.5-6-3.5v7z" fill="#FFF"/></svg>` :
        `<svg viewBox="0 0 24 24" fill="#9146FF"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43z"/></svg>`;
      return `
        <div class="weekly-streaming-card">
          <div class="weekly-streaming-platform">
            ${platformIcon}
            <span>${item.tag || ''}</span>
          </div>
          <h4 class="weekly-streaming-title">${item.title || ''}</h4>
          <p class="weekly-streaming-desc">${item.desc || ''}</p>
        </div>
      `;
    }).join('');
    return `
      <div class="weekly-section weekly-section-streaming">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            ${iconSvg}
            <h3 class="weekly-section-title">${title}</h3>
          </div>
        </div>
        <div class="weekly-streaming-grid">
          ${cards}
        </div>
      </div>
    `;
  };

  // 업계 동향 타임라인 렌더링 (일간 리포트용)
  const renderIndustryTimeline = (title, items, iconSvg) => {
    if (!items || items.length === 0) return '';
    const timeline = items.map(item => `
      <div class="weekly-timeline-item">
        <div class="weekly-timeline-marker"></div>
        <div class="weekly-timeline-content">
          <span class="weekly-timeline-tag">${item.tag || ''}</span>
          <h4 class="weekly-timeline-title">${item.title || ''}</h4>
          <p class="weekly-timeline-desc">${item.desc || ''}</p>
        </div>
      </div>
    `).join('');
    return `
      <div class="weekly-section weekly-section-industry">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            ${iconSvg}
            <h3 class="weekly-section-title">${title}</h3>
          </div>
        </div>
        <div class="weekly-timeline">
          ${timeline}
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
          <img class="stock-chart" src="${candleChartUrl}" alt="${displayName} 일봉 차트" onerror="this.style.display='none'">
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
            <svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <h3 class="weekly-section-title">게임주 현황</h3>
          </div>
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

  // AI 트렌드 생성 시간 (AM/PM 태그용) - UTC를 KST로 변환
  const aiGeneratedAt = insight?.aiGeneratedAt ? new Date(insight.aiGeneratedAt) : null;
  const kstTime = aiGeneratedAt ? new Date(aiGeneratedAt.getTime() + 9 * 60 * 60 * 1000) : null;
  const insightDate = kstTime ? `${kstTime.getUTCMonth() + 1}월 ${kstTime.getUTCDate()}일` : '';
  const insightAmPm = kstTime ? (kstTime.getUTCHours() < 12 ? 'AM' : 'PM') : '';

  // 데일리 포커스 (요약)
  const dailySummaryHtml = aiInsight.summary ? `
    <div class="weekly-section weekly-section-editor">
      <div class="weekly-section-header">
        <div class="weekly-section-title-wrap">
          <svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <h3 class="weekly-section-title">데일리 포커스</h3>
        </div>
      </div>
      <p class="weekly-section-desc">${aiInsight.summary}</p>
    </div>
  ` : '';

  const content = `
    <section class="section active" id="insight">
      ${SHOW_ADS ? `<div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}

      <div class="insight-page-container">
        <div class="insight-tabs">
          <button class="insight-tab active" data-tab="daily">일간 리포트</button>
          <button class="insight-tab" data-tab="weekly">주간 리포트</button>
        </div>

        <div class="insight-panel active" id="panel-daily">
          <div class="weekly-header-card">
            <h1 class="weekly-header-title">${insightDate || ''} 게임 트렌드 리포트</h1>
            <div class="weekly-header-meta">
              <span class="weekly-header-period">${aiInsight.date || new Date().toISOString().split('T')[0]}</span>
              ${insightAmPm ? `<span class="weekly-header-ampm-tag ${insightAmPm.toLowerCase()}">${insightAmPm}</span>` : ''}
            </div>
          </div>
          ${dailySummaryHtml}
          ${renderHotIssuesSection(issues, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>')}
          ${renderIndustryTimeline('업계 동향', industryIssues, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></svg>')}
          ${renderCategoryCard('주목할만한 지표', metrics, 'weekly-section-metrics', '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>')}
          ${renderCategoryCard('순위 변동', rankingsData, 'weekly-section-rankings', '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>', true)}
          ${renderStocksCard(stocksData, stockPrices)}
          ${renderCommunityCards('유저 반응', communityData, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>')}
          ${renderStreamingCards('스트리밍 트렌드', streaming, '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>')}
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
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'trend',
    title: '게이머스크롤 | 게임 트렌드 리포트',
    description: '게임 트렌드 리포트 - 모바일/PC 게임 순위 변동, 뉴스, 커뮤니티 반응, 게임주 동향까지 일간·주간 리포트로 한눈에 확인하세요.',
    canonical: 'https://gamerscrawl.com/trend',
    pageScripts
  });
}

module.exports = { generateTrendPage };
