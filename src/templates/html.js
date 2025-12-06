const { countries } = require('../crawlers/rankings');
const { getFavicon } = require('./components/favicons');

// 광고 표시 여부 (광고 승인 전까지 N)
const SHOW_ADS = false;

function generateHTML(rankings, news, steam, youtube, chzzk, community, upcoming, insight = null, historyData = null, metacritic = null, weeklyInsight = null) {
  const now = new Date();
  // 15분 단위로 내림 (21:37 → 21:30)
  const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
  const reportDate = `${now.getMonth() + 1}월 ${now.getDate()}일 ${String(now.getHours()).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  const reportTime = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // AI 인사이트 추출 (홈 카드용)
  const aiInsight = insight?.ai || null;

  // AI 인사이트 생성 시간 (AM/PM 태그용) - UTC를 KST로 변환
  const aiGeneratedAt = insight?.aiGeneratedAt ? new Date(insight.aiGeneratedAt) : null;
  const kstTime = aiGeneratedAt ? new Date(aiGeneratedAt.getTime() + 9 * 60 * 60 * 1000) : null;
  const insightDate = kstTime ? `${kstTime.getUTCMonth() + 1}월 ${kstTime.getUTCDate()}일` : '';
  const insightAmPm = kstTime ? (kstTime.getUTCHours() < 12 ? 'AM' : 'PM') : '';

  // 뉴스 HTML 생성 (커뮤니티와 동일한 스타일)
  function generateNewsSection(items, sourceName, sourceUrl) {
    if (!items || items.length === 0) {
      return '<div class="no-data">뉴스를 불러올 수 없습니다</div>';
    }
    return items.map((item, i) => `
      <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          <span class="news-title">${item.title}</span>
          <div class="news-tags"><span class="community-tag source-tag">${sourceName}</span></div>
        </div>
      </a>
    `).join('');
  }

  // Daily Insight 섹션 생성 (홈 인사이트 카드와 동일한 레이아웃)
  function generateInsightSection() {
    if (!aiInsight) {
      return `<div class="home-empty">AI 인사이트를 불러올 수 없습니다</div>`;
    }

    // 태그별 아이콘 및 클래스 매핑
    const tagIcons = {
      '모바일': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
      'PC': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      '콘솔': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M16 10h.01M18 14h.01"/></svg>',
      'e스포츠': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6-3 6 3"/><path d="M6 9v8l6 3 6-3V9"/><path d="M12 6v15"/></svg>'
    };
    // 고정형 태그 클래스 매핑 (상승/하락/신규 등 의미가 고정된 태그)
    const fixedTagClasses = {
      '급상승': 'tag-up', '급하락': 'tag-down', '신규진입': 'tag-new',
      '매출': 'tag-revenue', '동접': 'tag-players'
    };
    const getTagIcon = (tag) => tagIcons[tag] || '';
    const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

    // 아이템 렌더링 (주간 스타일)
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

    // 순위 변동 아이템 렌더링 (주간 스타일 + 순위 정보 포함)
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

    // 카테고리별 카드 렌더링 (그리드 배치 - 주간 스타일)
    const renderCategoryCard = (title, items, useRankingRenderer = false) => {
      if (!items || items.length === 0) return '';

      const renderer = useRankingRenderer ? renderRankingItem : renderItem;

      // 카테고리별 섹션 클래스 매핑 (주간 스타일)
      const sectionClass = {
        '오늘의 핫이슈': 'weekly-section-hot',
        '업계 동향': 'weekly-section-industry',
        '주목할만한 지표': 'weekly-section-metrics',
        '순위 변동': 'weekly-section-rankings',
        '유저 반응': 'weekly-section-community',
        '스트리밍 트렌드': 'weekly-section-streaming'
      }[title] || '';

      // 카테고리별 아이콘 SVG (주간 스타일)
      const sectionIcon = {
        '오늘의 핫이슈': '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/></svg>',
        '업계 동향': '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01"/></svg>',
        '주목할만한 지표': '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>',
        '순위 변동': '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>',
        '유저 반응': '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        '스트리밍 트렌드': '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
      }[title] || '';

      return `
        <div class="weekly-section ${sectionClass}">
          <div class="weekly-section-header">
            <div class="weekly-section-title-wrap">
              ${sectionIcon}
              <h3 class="weekly-section-title">${title}</h3>
            </div>
          </div>
          <div class="weekly-hot-issues">
            ${items.map(item => renderer(item)).join('')}
          </div>
        </div>
      `;
    };

    // 유저 반응 카드 그리드 렌더링 (주간 리포트 스타일)
    const renderCommunityCards = (title, items) => {
      if (!items || items.length === 0) return '';

      const sectionIcon = '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

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
              ${sectionIcon}
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
    const renderStreamingCards = (title, items) => {
      if (!items || items.length === 0) return '';

      const sectionIcon = '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';

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
              ${sectionIcon}
              <h3 class="weekly-section-title">${title}</h3>
            </div>
          </div>
          <div class="weekly-streaming-grid">
            ${cards}
          </div>
        </div>
      `;
    };

    // 업계 동향 타임라인 렌더링 (주간 리포트 스타일)
    const renderIndustryTimeline = (title, items) => {
      if (!items || items.length === 0) return '';

      const sectionIcon = '<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01"/></svg>';

      const timelineItems = items.map(item => `
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
              ${sectionIcon}
              <h3 class="weekly-section-title">${title}</h3>
            </div>
          </div>
          <div class="weekly-timeline">
            ${timelineItems}
          </div>
        </div>
      `;
    };

    const issues = aiInsight.issues || [];
    // 임시 업계 이슈 데이터 (AI 생성 전까지 사용)
    const industryIssues = aiInsight.industryIssues?.length > 0 ? aiInsight.industryIssues : [
      { tag: '넷마블', title: '넷마블, 2025년 신작 라인업 공개', desc: '넷마블이 2025년 상반기 출시 예정인 신작 5종을 공개했어요. 세븐나이츠 키우기 후속작과 신규 IP 기반 RPG가 포함되어 있어요.' },
      { tag: '정책', title: '게임산업진흥법 개정안 국회 통과', desc: '게임 셧다운제 폐지를 골자로 한 개정안이 본회의를 통과했어요. 청소년 자율규제 시스템으로 전환될 예정이에요.' }
    ];
    // 임시 주식 데이터 (AI 생성 전까지 사용)
    const stocksData = aiInsight.stocks?.length > 0 ? aiInsight.stocks : [
      { name: '크래프톤', comment: '배그 시즌 업데이트로 동접 신기록, 실적 기대감 상승' },
      { name: '넷마블', comment: '세븐나이츠 키우기 흥행 지속, 신작 라인업 관심' }
    ];
    const metrics = aiInsight.metrics || [];
    const rankingsData = aiInsight.rankings || [];
    const communityData = aiInsight.community || [];
    const streaming = aiInsight.streaming || [];

    // 실제 순위 데이터 (insight 객체에서 추출)
    const iosGrossing1 = insight?.mobile?.kr?.ios?.[0];
    const iosFree1 = rankings?.free?.kr?.ios?.[0];
    const androidGrossing1 = insight?.mobile?.kr?.android?.[0];
    const androidFree1 = rankings?.free?.kr?.android?.[0];
    const steamMostPlayed1 = steam?.mostPlayed?.[0];
    const steamTopSeller1 = steam?.topSellers?.[0];

    const renderInfoCard = (label, game, isSteam = false) => {
      const icon = isSteam ? game?.img : game?.icon;
      const title = isSteam ? game?.name : game?.title;
      const subtext = isSteam
        ? (game?.ccu ? game.ccu.toLocaleString() + '명' : game?.developer || '')
        : (game?.developer || '');
      return `
        <div class="insight-info-card with-icon">
          <span class="insight-info-label">${label}</span>
          ${icon ? `<img class="insight-info-icon" src="${icon}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">` : '<div class="insight-info-icon-placeholder"></div>'}
          <span class="insight-info-value">${title || '-'}</span>
          ${subtext ? `<span class="insight-info-sub">${subtext}</span>` : ''}
        </div>
      `;
    };

    const infographic = `
      <div class="insight-infographic">
        ${renderInfoCard('iOS 매출 1위', iosGrossing1)}
        ${renderInfoCard('iOS 인기 1위', iosFree1)}
        ${renderInfoCard('Android 매출 1위', androidGrossing1)}
        ${renderInfoCard('Android 인기 1위', androidFree1)}
        ${renderInfoCard('Steam 동접 1위', steamMostPlayed1, true)}
        ${renderInfoCard('Steam 판매 1위', steamTopSeller1, true)}
      </div>
    `;

    // 순위 변동 상세 차트 (실제 모바일 데이터에서 추출)
    const hasYesterdayData = insight?.hasYesterdayData === true;
    const allMobileForChart = [
      ...(insight?.mobile?.kr?.ios || []).map(g => ({ ...g, platform: 'iOS' })),
      ...(insight?.mobile?.kr?.android || []).map(g => ({ ...g, platform: 'Android' }))
    ];

    // 급상승: change > 0 (상위 3개)
    const upGamesReal = allMobileForChart
      .filter(g => g.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 3);

    // 급하락: change < 0 (상위 3개)
    const downGamesReal = allMobileForChart
      .filter(g => g.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 3);

    // 신규진입: 어제 데이터가 있을 때만 표시 (status === 'new' && change !== 0인 게임)
    const newGamesReal = hasYesterdayData
      ? allMobileForChart
          .filter(g => g.status === 'new')
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 3)
      : [];

    const renderChartItem = (game, type) => {
      const changeText = type === 'new' ? 'NEW' :
        (game.change > 0 ? `+${game.change}` : `${game.change}`);
      return `
        <div class="insight-chart-item ${type}">
          <img class="insight-chart-icon" src="${game.icon}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
          <div class="insight-chart-info">
            <span class="insight-chart-name">${game.title}</span>
            <span class="insight-chart-rank">${game.platform} ${game.rank}위 (${changeText})</span>
          </div>
        </div>
      `;
    };

    // 순위 변동 데이터가 있을 때 차트 표시
    const hasRankingChartData = upGamesReal.length > 0 || downGamesReal.length > 0 || newGamesReal.length > 0;
    const rankingChart = hasRankingChartData ? `
      <div class="insight-ranking-chart">
        <div class="insight-chart-column">
          <div class="insight-chart-header up">급상승</div>
          <div class="insight-chart-list">
            ${upGamesReal.length > 0 ? upGamesReal.map(g => renderChartItem(g, 'up')).join('') : '<div class="insight-chart-empty">없음</div>'}
          </div>
        </div>
        <div class="insight-chart-column">
          <div class="insight-chart-header down">급하락</div>
          <div class="insight-chart-list">
            ${downGamesReal.length > 0 ? downGamesReal.map(g => renderChartItem(g, 'down')).join('') : '<div class="insight-chart-empty">없음</div>'}
          </div>
        </div>
        <div class="insight-chart-column">
          <div class="insight-chart-header new">신규진입</div>
          <div class="insight-chart-list">
            ${newGamesReal.length > 0 ? newGamesReal.map(g => renderChartItem(g, 'new')).join('') : '<div class="insight-chart-empty">없음</div>'}
          </div>
        </div>
      </div>
    ` : '';

    // 게임주 현황 카드 (네이버 증권 차트 + AI 코멘트)
    const stockMap = insight?.stockMap || {};
    const renderStockItem = (stock) => {
      // AI가 여러 형태로 이름을 줄 수 있으므로 파싱: "엔씨소프트(036570)" 또는 "259960-크래프톤"
      const codeMatchParen = stock.name.match(/\((\d{6})\)/);
      const codeMatchHyphen = stock.name.match(/^(\d{6})-/);
      let displayName, code;
      if (codeMatchHyphen) {
        // "259960-크래프톤" 형식
        code = codeMatchHyphen[1];
        displayName = stock.name.replace(/^\d{6}-/, '').trim();
      } else if (codeMatchParen) {
        // "엔씨소프트(036570)" 형식
        code = codeMatchParen[1];
        displayName = stock.name.replace(/\(\d{6}\)/, '').trim();
      } else {
        // 코드 없이 이름만 있는 경우 stockMap에서 찾기
        displayName = stock.name.trim();
        code = stockMap[displayName] || stockMap[stock.name] || '';
      }
      if (!code) return ''; // 코드 없으면 렌더링 안함

      const candleChartUrl = `https://ssl.pstatic.net/imgfinance/chart/item/candle/day/${code}.png`;
      const stockUrl = `https://finance.naver.com/item/main.nhn?code=${code}`;
      // 주가 데이터는 insight.stockPrices에서 가져옴
      const priceData = insight?.stockPrices?.[code] || {};
      const price = priceData.price ? priceData.price.toLocaleString() + '원' : '-';
      const change = priceData.change || 0;
      const changePercent = priceData.changePercent || 0;
      const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : '';
      const changeSign = change > 0 ? '▲' : change < 0 ? '▼' : '';
      const changeText = change > 0 ? `+${changePercent.toFixed(2)}%` : change < 0 ? `${changePercent.toFixed(2)}%` : '0%';
      // 실제 스크래핑한 종가 날짜 사용 (예: "2025.12.03" → "12/3")
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
          <img class="stock-chart" src="${candleChartUrl}" alt="${displayName} 일봉 차트" loading="lazy" decoding="async" onerror="this.style.display='none'">
          <p class="stock-comment">${stock.comment}</p>
        </a>
      `;
    };

    const stocksCard = stocksData.length > 0 ? `
      <div class="weekly-section weekly-section-stocks">
        <div class="weekly-section-header">
          <div class="weekly-section-title-wrap">
            <svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <h3 class="weekly-section-title">게임주 현황</h3>
          </div>
        </div>
        <div class="stocks-split">
          ${stocksData.map(renderStockItem).join('')}
        </div>
      </div>
    ` : '';

    // 주간 리포트 컨텐츠 생성 (심층 보고서 형태)
    const weeklyAi = weeklyInsight?.ai || null;
    const weeklyInfo = weeklyInsight?.weekInfo || null;

    // 주간 게임주 렌더링 (상승/하락 종목용 - 이슈 설명 포함)
    const renderWeeklyStockRankItem = (stock, isUp) => {
      const code = stock.code || '';
      const displayName = stock.name || '';
      const price = stock.price ? stock.price.toLocaleString() : '-';
      const changePercent = stock.changePercent !== undefined ? stock.changePercent : 0;
      const changeClass = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : '';
      const changeSign = changePercent > 0 ? '+' : '';
      const comment = stock.comment || '';

      const stockUrl = code ? `https://finance.naver.com/item/main.nhn?code=${code}` : '#';

      return `
        <a class="weekly-stock-rank-item ${changeClass}" href="${stockUrl}" target="_blank" rel="noopener">
          <div class="weekly-stock-rank-header">
            <div class="weekly-stock-rank-name">${displayName}</div>
            <div class="weekly-stock-rank-change ${changeClass}">${changeSign}${changePercent.toFixed(2)}%</div>
          </div>
          <div class="weekly-stock-rank-price">${price}원</div>
          ${comment ? `<div class="weekly-stock-rank-comment">${comment}</div>` : ''}
        </a>
      `;
    };

    // 주간 리포트 생성 함수
    const generateWeeklyReport = (weekNum, weekPeriod, data, isDemo = false) => {
      const { issues, industryIssues, metrics, rankings, community, streaming, stocks, summary, mvp, releases, global } = data;

      // SVG 아이콘 정의
      const icons = {
        fire: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"/><path d="M12 12c0 2-1.5 3-1.5 5a1.5 1.5 0 0 0 3 0c0-2-1.5-3-1.5-5z"/></svg>`,
        chart: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>`,
        building: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></svg>`,
        metric: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`,
        community: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        stream: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
        stock: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
        edit: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        mobile: `<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
        pc: `<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
        console: `<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M16 10h.01M18 14h.01"/></svg>`,
        esports: `<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6-3 6 3"/><path d="M6 9v8l6 3 6-3V9"/><path d="M12 6v15"/></svg>`,
        trophy: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        calendar: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
        globe: `<svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
      };

      // 태그별 아이콘 매핑
      const getTagIcon = (tag) => {
        if (tag === '모바일') return icons.mobile;
        if (tag === 'PC') return icons.pc;
        if (tag === '콘솔') return icons.console;
        if (tag === 'e스포츠') return icons.esports;
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

      // 금주의 핫이슈 (메인 카드)
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
            ${issues.map((issue, idx) => `
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
                <div class="weekly-metric-card">
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

      // 게임주 동향 (주간 전용 - 랭킹 테이블 스타일)
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
      const formatWeekTitle = (period, weekNum) => {
        // period: "2025-12-02 ~ 2025-12-08" 형태
        const match = period.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const month = parseInt(match[2]);
          const weekOfMonth = Math.ceil(parseInt(match[3]) / 7);
          return `${month}월 ${weekOfMonth}주차 위클리 게임 인사이트`;
        }
        return `${weekNum}주차 위클리 게임 인사이트`;
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
    };

    let weeklyContent = '';

    if (weeklyAi) {
      const weekPeriod = weeklyInfo ? `${weeklyInfo.startDate} ~ ${weeklyInfo.endDate}` : weeklyAi.date || '';
      const weekNum = weeklyInfo?.weekNumber || weeklyAi.weekNumber || '';

      weeklyContent = generateWeeklyReport(weekNum, weekPeriod, {
        summary: weeklyAi.summary || null,
        issues: weeklyAi.issues || [],
        industryIssues: weeklyAi.industryIssues || [],
        metrics: weeklyAi.metrics || [],
        rankings: weeklyAi.rankings || [],
        community: weeklyAi.community || [],
        streaming: weeklyAi.streaming || [],
        stocks: weeklyAi.stocks || []
      });
    } else {
      // 임시 데이터로 레이아웃 확인
      const demoData = {
        summary: '지난 주는 니케 2주년 업데이트가 가장 큰 화제였습니다. 에반게리온 콜라보와 함께 진행된 대규모 업데이트로 양대 마켓 매출 1위를 기록하며 서브컬처 게임의 저력을 다시 한번 보여줬어요. PC 게임 시장에서는 스팀 가을 세일이 종료되면서 인디 게임들의 약진이 돋보였고, 특히 한국 인디 게임들이 글로벌 시장에서 좋은 반응을 얻었습니다. 업계에서는 넥슨의 2025년 신작 라인업 발표가 주목받았으며, 크래프톤과 넷마블도 각각 사업 확장과 조직 개편 소식을 전했습니다.',
        issues: [
          { tag: '모바일', title: '니케 2주년 업데이트로 매출 급상승', desc: '니케가 2주년 기념 대규모 업데이트를 진행했습니다. 에반게리온 콜라보레이션으로 아스카, 레이, 마리 등 인기 캐릭터가 추가되었고, 복각 이벤트와 무료 뽑기 지원으로 신규/복귀 유저 유입이 크게 늘었어요. 업데이트 직후 양대 마켓 매출 1위를 기록하며 서브컬처 게임의 저력을 다시 한번 입증했습니다.' },
          { tag: 'PC', title: '스팀 가을 세일 종료, 인디 게임 약진', desc: '스팀 가을 세일이 12월 4일 종료되었습니다. 이번 세일에서는 특히 인디 게임들의 판매량이 크게 늘었는데요, 한국 개발사의 "데이브 더 다이버"가 역대 최고 할인율로 판매되며 글로벌 판매 순위 상위권에 진입했어요. 인디 게임 시장에서 한국 게임의 위상이 높아지고 있음을 보여주는 사례입니다.' },
          { tag: '콘솔', title: 'PS5 프로 국내 정식 출시', desc: '소니가 11월 7일 PS5 프로를 국내에 정식 출시했습니다. 899,000원의 가격에도 불구하고 예약 판매가 완판되었으며, 현재는 품귀 현상 없이 원활하게 구매 가능한 상황이에요. 8K 업스케일링과 향상된 레이트레이싱 성능으로 하드코어 게이머들 사이에서 좋은 평가를 받고 있습니다.' },
          { tag: 'e스포츠', title: 'LoL 월드컵 결승전 시청률 역대 최고', desc: '2024 LoL 월드 챔피언십 결승전이 역대 최고 시청률을 기록했습니다. T1과 BLG의 결승전은 글로벌 동시 시청자 수 680만 명을 돌파했으며, 중국을 포함한 전체 시청자 수는 수천만 명에 달했어요. 페이커의 5번째 우승으로 한국 e스포츠의 위상을 다시 한번 높였습니다.' },
          { tag: '글로벌', title: 'GTA 6 트레일러 조회수 신기록', desc: '락스타 게임즈가 공개한 GTA 6 두 번째 트레일러가 24시간 만에 1억 뷰를 돌파했습니다. 2025년 가을 출시 예정인 GTA 6는 역대 가장 기대되는 게임으로 꼽히고 있어요. 한국 게이머들 사이에서도 뜨거운 반응이 이어지며 관련 커뮤니티 활동이 급증하고 있습니다.' }
        ],
        industryIssues: [
          { tag: '넥슨', title: '넥슨 2025년 신작 라인업 발표', desc: '넥슨이 연말 간담회를 통해 2025년 상반기 출시 예정인 신작 5종을 공개했습니다. 던전앤파이터 모바일의 글로벌 버전과 신규 IP 기반의 오픈월드 RPG가 포함되어 있으며, 특히 ARC Raiders의 2025년 상반기 얼리 액세스 출시가 확정되어 PC/콘솔 시장 진출에 대한 기대감이 높아지고 있어요.' },
          { tag: '크래프톤', title: '크래프톤 인디게임 퍼블리싱 확대', desc: '크래프톤이 인디 게임 퍼블리싱 레이블 "크래프톤 인디"를 통해 사업을 확대한다고 발표했습니다. 2025년까지 10개 이상의 인디 게임을 지원할 계획이며, 개발 자금부터 마케팅, 글로벌 퍼블리싱까지 전방위 지원을 제공한다고 해요. 배틀그라운드 의존도를 낮추고 포트폴리오 다각화를 꾀하는 전략으로 분석됩니다.' },
          { tag: '넷마블', title: '넷마블 조직 개편 단행', desc: '넷마블이 효율화를 위한 대규모 조직 개편을 단행했습니다. 개발 스튜디오를 통폐합하고 신작 개발에 집중하는 방향으로 재편되었어요. 최근 실적 부진으로 어려움을 겪고 있는 넷마블이 구조조정을 통해 체질 개선에 나선 것으로 보입니다. 2025년 "일곱 개의 대죄: ORIGIN" 등 신작 출시에 주력할 예정입니다.' }
        ],
        metrics: [
          { tag: '매출', title: 'iOS 매출 TOP10 중 8개가 국산 게임', desc: '지난 주 iOS 매출 순위 TOP10 중 8개가 국산 게임으로 채워졌습니다. 리니지M, 오딘: 발할라 라이징, 니케, 리니지W 등이 상위권을 차지했으며, 해외 게임으로는 원신과 클래시 오브 클랜만이 TOP10에 포함되었어요. 국산 게임의 강세가 지속되고 있음을 보여주는 지표입니다.' },
          { tag: '동접', title: 'Steam 한국 동접자 수 역대 최고', desc: 'Steam의 한국 지역 동시 접속자 수가 역대 최고치를 경신했습니다. 가을 세일 기간 중 한국 동접자 수가 50만 명을 돌파했으며, 이는 전년 동기 대비 23% 증가한 수치예요. PC 게임 시장에서 스팀의 영향력이 더욱 커지고 있음을 보여줍니다.' }
        ],
        rankings: [
          { tag: '급상승', title: '승리의 여신: 니케', prevRank: 15, rank: 1, change: 14, platform: 'iOS', desc: '2주년 기념 에반게리온 콜라보레이션이 대성공을 거뒀습니다. 아스카, 레이, 마리 등 인기 캐릭터 출시와 함께 파격적인 복귀/신규 유저 지원 이벤트가 매출 상승을 견인했어요. 콜라보 기간 동안 일매출이 평소 대비 5배 이상 증가한 것으로 추정됩니다.' },
          { tag: '급상승', title: '원신', prevRank: 25, rank: 3, change: 22, platform: 'Android', desc: '버전 5.0 "꽃이 피어나는 샘의 황야" 대규모 업데이트가 진행되었습니다. 신규 국가 나타란과 함께 5성 캐릭터 마비카, 키뇨가 추가되었어요. 새로운 지역 탐험 콘텐츠와 스토리에 대한 호평이 이어지며 복귀 유저들이 늘어나고 있습니다.' },
          { tag: '급하락', title: '리니지W', prevRank: 3, rank: 18, change: -15, platform: 'iOS', desc: '이전 주 진행되었던 대규모 업데이트 이벤트가 종료되면서 매출이 급격히 감소했습니다. 신규 클래스 출시 효과가 일시적이었다는 분석이 나오고 있어요. 다음 대규모 업데이트까지 매출 안정화가 필요한 상황입니다.' },
          { tag: '신규진입', title: '블루 아카이브', prevRank: null, rank: 8, change: null, platform: 'Android', desc: '3주년 기념 대규모 이벤트와 함께 픽업 가챠가 진행되었습니다. 한정 캐릭터에 대한 수요가 높아 TOP10에 신규 진입했어요. 서브컬처 게임 시장에서 니케, 블루 아카이브의 약진이 두드러지고 있습니다.' }
        ],
        community: [
          { tag: '니케', title: '에반게리온 콜라보 반응 폭발적', desc: '니케 x 에반게리온 콜라보레이션에 대한 유저 반응이 매우 뜨겁습니다. 원작의 캐릭터성을 잘 살린 스토리와 고퀄리티 일러스트가 호평받고 있어요.' },
          { tag: '메이플스토리', title: '윈터 업데이트 유저 반응 엇갈려', desc: '메이플스토리 윈터 업데이트에 대한 반응이 엇갈리고 있습니다. 신규 6차 스킬 강화 시스템은 호평받고 있지만, 일부 직업의 밸런스 패치에 대해서는 논란이 있어요.' },
          { tag: '로스트아크', title: '신규 레이드 난이도 논란', desc: '로스트아크 신규 에픽 레이드 "에키드나"의 난이도가 너무 높다는 의견이 많습니다. 하드 모드 클리어율이 역대 최저 수준이라는 분석이 나오고 있어요.' },
          { tag: 'ARC Raiders', title: '얼리 액세스 버그 제보 쏟아져', desc: '스팀 얼리 액세스로 출시된 ARC Raiders에 대한 버그 제보가 커뮤니티에 쏟아지고 있어요. 그럼에도 협동 플레이의 재미와 분위기에 대한 호평이 이어지고 있습니다.' }
        ],
        streaming: [
          { tag: '치지직', title: '게임 카테고리 동접 50만 돌파', desc: '치지직 게임 카테고리 동시 시청자가 50만 명을 돌파했습니다. 국내 게임 스트리밍 플랫폼으로서의 성장세가 뚜렷하며, 특히 리그 오브 레전드와 발로란트 카테고리의 성장이 두드러져요. 트위치에서 이적한 스트리머들의 영향력도 커지고 있습니다.' },
          { tag: '유튜브', title: '한국 게임 리뷰 채널 구독자 급증', desc: '한국 게임 리뷰 유튜브 채널들의 구독자가 급증하고 있습니다. "겜톨로지", "떵개떵" 등 게임 리뷰/공략 채널들이 연말 신작 게임 시즌을 맞아 빠르게 성장 중이에요. 숏폼 콘텐츠와 함께 딥다이브 리뷰 영상이 좋은 반응을 얻고 있습니다.' }
        ],
        stocks: {
          up: [
            { code: '259960', name: '크래프톤', price: 285000, changePercent: 8.52, comment: '배틀그라운드 글로벌 실적 호조와 2025년 신작 라인업 기대감으로 상승. 인조이 성공적 출시로 투자심리 개선.' },
            { code: '112040', name: '위메이드', price: 45200, changePercent: 6.34, comment: '위믹스 생태계 확장 소식에 상승. 신작 나이트 크로우 글로벌 출시 일정 확정 호재.' },
            { code: '192080', name: '더블유게임즈', price: 42300, changePercent: 4.25, comment: '소셜 카지노 게임 북미 시장 점유율 확대. 분기 실적 예상치 상회 전망.' }
          ],
          down: [
            { code: '036570', name: '엔씨소프트', price: 198500, changePercent: -5.71, comment: 'TL(쓰론 앤 리버티) 북미/유럽 초기 매출 부진 우려. 리니지 시리즈 매출 감소 지속.' },
            { code: '251270', name: '넷마블', price: 52800, changePercent: -4.89, comment: '하반기 신작 부재로 실적 우려 지속. 조직 개편 발표 후 불확실성 확대.' },
            { code: '078340', name: '컴투스', price: 35800, changePercent: -3.42, comment: '서머너즈 워 매출 역성장 우려. 신작 출시 지연으로 투자심리 악화.' }
          ]
        },
        // 주간 MVP
        mvp: {
          name: '승리의 여신: 니케',
          tag: '서브컬처 RPG',
          desc: '2주년 기념 에반게리온 콜라보레이션이 대성공을 거두며 양대 마켓 매출 1위를 석권했습니다. 아스카, 레이, 마리 등 인기 캐릭터의 고퀄리티 구현과 파격적인 유저 혜택으로 신규/복귀 유저가 대거 유입되었어요.',
          highlights: ['iOS/Android 매출 1위', '일매출 5배 증가', '에반게리온 콜라보']
        },
        // 신작/업데이트 캘린더
        releases: [
          { date: '12/03', title: '니케 2주년 업데이트', platform: '모바일', type: '업데이트' },
          { date: '12/04', title: '원신 5.0 나타란 업데이트', platform: '모바일/PC', type: '업데이트' },
          { date: '12/05', title: 'ARC Raiders 얼리 액세스', platform: 'PC', type: '신작' },
          { date: '12/06', title: '메이플스토리 윈터 업데이트', platform: 'PC', type: '업데이트' },
          { date: '12/07', title: 'Where Winds Meet 출시', platform: 'PC', type: '신작' }
        ],
        // 글로벌 트렌드
        global: [
          { tag: '북미', title: 'GTA 6 트레일러 24시간 1억뷰 돌파', desc: '락스타 게임즈의 GTA 6 두 번째 트레일러가 역대 최단 시간 1억 뷰를 기록했습니다. 2025년 가을 출시 예정으로 글로벌 게이머들의 기대감이 최고조에요.' },
          { tag: '일본', title: '원신 5.0 일본 앱스토어 매출 1위', desc: '호요버스의 원신이 버전 5.0 업데이트 후 일본 앱스토어 매출 1위를 탈환했습니다. 신규 국가 나타란과 캐릭터들이 일본 유저들에게 큰 호응을 얻고 있어요.' },
          { tag: '중국', title: '텐센트 게임즈 연간 실적 역대 최고 전망', desc: '텐센트가 2024년 게임 부문 연간 실적 역대 최고를 기록할 전망입니다. 왕자영요, 화평정영 등 자사 IP와 해외 투자 수익이 실적을 견인하고 있어요.' }
        ]
      };

      weeklyContent = generateWeeklyReport(49, '2025-12-02 ~ 2025-12-08', demoData, true);
    }

    return `
      <div class="insight-page-container">
        <!-- 탭 -->
        <div class="insight-tabs">
          <button class="insight-tab active" data-tab="daily">일간 리포트</button>
          <button class="insight-tab" data-tab="weekly">주간 리포트</button>
        </div>

        <!-- 일간 리포트 패널 -->
        <div class="insight-panel active" id="panel-daily">
          <div class="weekly-header-card">
            <h1 class="weekly-header-title">${insightDate || ''} 데일리 게임 인사이트</h1>
            <div class="weekly-header-meta">
              <span class="weekly-header-period">${insight?.ai?.date || new Date().toISOString().split('T')[0]}</span>
              ${insightAmPm ? `<span class="weekly-header-ampm-tag ${insightAmPm.toLowerCase()}">${insightAmPm}</span>` : ''}
            </div>
          </div>
          ${insight?.ai?.summary ? `
          <div class="weekly-section weekly-section-editor">
            <div class="weekly-section-header">
              <div class="weekly-section-title-wrap">
                <svg class="weekly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <h3 class="weekly-section-title">데일리 포커스</h3>
              </div>
            </div>
            <p class="weekly-section-desc">${insight.ai.summary}</p>
          </div>
          ` : ''}
          ${renderCategoryCard('오늘의 핫이슈', issues)}
          ${infographic}
          ${industryIssues.length > 0 ? renderIndustryTimeline('업계 동향', industryIssues) : ''}
          ${renderCategoryCard('주목할만한 지표', metrics)}
          ${rankingChart}
          ${rankingsData.length > 0 ? renderCategoryCard('순위 변동', rankingsData, true) : ''}
          ${stocksCard}
          ${renderCommunityCards('유저 반응', communityData)}
          ${renderStreamingCards('스트리밍 트렌드', streaming)}
        </div>

        <!-- 주간 리포트 패널 -->
        <div class="insight-panel" id="panel-weekly">
          ${weeklyContent}
        </div>
      </div>
    `;
  }

  // 플랫폼별 기본 로고 SVG
  const platformLogos = {
    steam: '<svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.26-.626.263-1.316.009-1.946-.254-.63-.729-1.121-1.354-1.38a2.51 2.51 0 0 0-1.921-.046l1.522.63a1.846 1.846 0 0 1-.943 3.538 1.846 1.846 0 0 1-.486-.061zm8.412-5.88a3.017 3.017 0 0 0 3.015-3.015 3.017 3.017 0 0 0-3.015-3.015 3.017 3.017 0 0 0-3.015 3.015 3.019 3.019 0 0 0 3.015 3.015zm0-5.426a2.411 2.411 0 1 1 0 4.822 2.411 2.411 0 0 1 0-4.822z"/></svg>',
    nintendo: '<svg viewBox="0 0 24 24" fill="#e60012"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>',
    ps5: '<svg viewBox="0 0 24 24" fill="#003791"><path d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.876c2.441 1.193 4.362-.002 4.362-3.153 0-3.237-.794-4.819-3.067-5.559-1.445-.454-3.764-1.771-3.764-1.771v18.37l-2.997-.97V2.596z"/><path d="M2.015 17.206c0 .688.343 1.152.984.913l6.258-2.204v-2.21l-4.636 1.615c-.49.171-.761-.056-.761-.746V8.45L2.015 9.3v7.906z"/><path d="M19.016 13.066c1.027-.478 1.969-.078 1.969 1.155v4.192c0 1.233-.942 1.634-1.969 1.155l-5.966-2.738v-2.21l5.966 2.733z"/></svg>',
    mobile: '<svg viewBox="0 0 24 24" fill="#34a853"><rect x="5" y="2" width="14" height="20" rx="2" stroke="#34a853" stroke-width="2" fill="none"/><circle cx="12" cy="18" r="1.5" fill="#34a853"/></svg>'
  };

  // 출시 예정 게임 HTML 생성 (게임명 > 발매일 > 회사 순서)
  function generateUpcomingSection(items, platform) {
    if (!items || items.length === 0) {
      return '<div class="upcoming-empty">출시 예정 정보를 불러올 수 없습니다</div>';
    }
    const defaultLogo = platformLogos[platform] || platformLogos.mobile;
    const header = `
      <div class="upcoming-table-header">
        <div>순위</div>
        <div>게임</div>
        <div>출시일</div>
      </div>
    `;
    const rows = items.map((game, i) => {
      // Steam 게임인 경우 대체 이미지 URL 시도
      const isSteam = platform === 'steam' && game.appid;
      const fallbackImg = isSteam ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/capsule_231x87.jpg` : '';
      const onerrorHandler = isSteam
        ? `if(!this.dataset.retry){this.dataset.retry='1';this.src='${fallbackImg}';}else{this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none';}`
        : `this.parentElement.querySelector('.upcoming-icon-placeholder')?.classList.remove('hidden');this.style.display='none'`;

      return `
      <a class="upcoming-item" href="${game.link || '#'}" target="_blank" rel="noopener">
        <div class="upcoming-col-rank">
          <span class="upcoming-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
        </div>
        <div class="upcoming-col-game">
          ${game.img ? `<img class="upcoming-icon" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="${onerrorHandler}">` : ''}<div class="upcoming-icon-placeholder ${game.img ? 'hidden' : ''}">${defaultLogo}</div>
          <div class="upcoming-info">
            <div class="upcoming-name">${game.name}</div>
            ${game.publisher ? `<div class="upcoming-publisher">${game.publisher}</div>` : ''}
          </div>
        </div>
        <div class="upcoming-col-date">${game.releaseDate || '-'}</div>
      </a>
    `;
    }).join('');
    return header + rows;
  }

  const invenNewsHTML = generateNewsSection(news.inven, '인벤');
  const ruliwebNewsHTML = generateNewsSection(news.ruliweb, '루리웹');
  const gamemecaNewsHTML = generateNewsSection(news.gamemeca, '게임메카');
  const thisisgameNewsHTML = generateNewsSection(news.thisisgame, '디게');

  // 커뮤니티 인기글 HTML 생성
  const communityUrls = {
    ruliweb: 'https://bbs.ruliweb.com/best/humor',
    arca: 'https://arca.live/b/live',
    dcinside: 'https://gall.dcinside.com/board/lists?id=dcbest',
    inven: 'https://www.inven.co.kr/board/webzine/2097'
  };

  const sourceNames = {
    dcinside: '디시인사이드',
    arca: '아카라이브',
    inven: '인벤',
    ruliweb: '루리웹'
  };

  function generateCommunitySection(items, source) {
    if (!items || items.length === 0) {
      return '<div class="no-data">인기글을 불러올 수 없습니다</div>';
    }
    const sourceName = sourceNames[source] || source;
    return items.map((item, i) => {
      const channelTag = item.channel ? `<span class="community-tag channel-tag">${item.channel}</span>` : '';
      const sourceTag = `<span class="community-tag source-tag source-${source}">${sourceName}</span>`;
      return `
      <a class="news-item clickable" href="${item.link}" target="_blank" rel="noopener">
        <span class="news-num">${i + 1}</span>
        <div class="news-content">
          <span class="news-title">${item.title}</span>
          <div class="news-tags">${sourceTag}${channelTag}</div>
        </div>
      </a>
    `;
    }).join('');
  }

  const ruliwebCommunityHTML = generateCommunitySection(community?.ruliweb || [], 'ruliweb');
  const arcaCommunityHTML = generateCommunitySection(community?.arca || [], 'arca');
  const dcsideCommunityHTML = generateCommunitySection(community?.dcinside || [], 'dcinside');
  const invenCommunityHTML = generateCommunitySection(community?.inven || [], 'inven');

  // 메타크리틱 섹션 생성 (포스터 그리드 + 컨테이너)
  function generateMetacriticSection(data) {
    if (!data || !data.games || data.games.length === 0) {
      return '<div class="metacritic-empty">메타크리틱 데이터를 불러올 수 없습니다</div>';
    }

    const year = data.year || new Date().getFullYear();
    const games = data.games;

    // 점수별 색상 계산
    const getScoreColor = (score) => {
      if (score >= 90) return '#66cc33'; // green
      if (score >= 75) return '#ffcc33'; // yellow
      if (score >= 50) return '#ff6600'; // orange
      return '#ff0000'; // red
    };

    const gameCards = games.slice(0, 30).map((game, i) => {
      const scoreColor = getScoreColor(game.score);
      const rankClass = i < 3 ? 'top' + (i + 1) : '';

      return `
      <div class="metacritic-card">
        <div class="metacritic-card-rank ${rankClass}">${i + 1}</div>
        <div class="metacritic-card-poster">
          ${game.img ? `<img src="${game.img}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="metacritic-card-score" style="background:${scoreColor}">${game.score}</div>
        </div>
        <div class="metacritic-card-info">
          <div class="metacritic-card-title">${game.title}</div>
          ${game.platform ? `<div class="metacritic-card-platform">${game.platform}</div>` : ''}
        </div>
      </div>
    `;
    }).join('');

    return `
      <div class="metacritic-card-container">
        <div class="metacritic-header">
          <div class="metacritic-title">${year}년 메타크리틱 TOP 30</div>
        </div>
        <div class="metacritic-grid">${gameCards}</div>
      </div>
    `;
  }

  // ========== 홈 서머리 섹션 생성 ==========

  // 홈 뉴스 요약 (좌: 카드, 우: 리스트)
  function generateHomeNews() {
    // 홈에서는 인벤 제외 (이미지 로드 이슈)
    const sources = [
      { key: 'thisisgame', items: news.thisisgame || [], name: '디스이즈게임', icon: '${getFavicon('thisisgame.com')}' },
      { key: 'gamemeca', items: news.gamemeca || [], name: '게임메카', icon: '${getFavicon('gamemeca.com')}' },
      { key: 'ruliweb', items: news.ruliweb || [], name: '루리웹', icon: '${getFavicon('ruliweb.com')}' }
    ];

    const fixUrl = (url) => {
      if (!url) return url;
      if (url.startsWith('//')) url = 'https:' + url;
      if (url.includes('inven.co.kr')) return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
      return url;
    };

    // 뉴스 컨텐츠 생성 함수
    function renderNewsContent(items, sourceName = null) {
      if (items.length === 0) {
        return '<div class="home-empty">뉴스를 불러올 수 없습니다</div>';
      }
      const withThumb = items.filter(item => item.thumbnail);
      const mainCard = withThumb[0];
      const subCard = withThumb[1];
      const listItems = withThumb.slice(2, 9);

      return `
        <div class="home-news-split">
          <div class="home-news-cards">
            ${mainCard ? `
              <a class="home-news-card home-news-card-main" href="${mainCard.link}" target="_blank" rel="noopener">
                <div class="home-news-card-thumb">
                  <img src="${fixUrl(mainCard.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>'">
                </div>
                <div class="home-news-card-info">
                  <span class="home-news-card-title">${mainCard.title}</span>
                  <span class="home-news-card-source">${sourceName || mainCard.source}</span>
                </div>
              </a>
            ` : ''}
            ${subCard ? `
              <a class="home-news-card home-news-card-sub" href="${subCard.link}" target="_blank" rel="noopener">
                <div class="home-news-card-thumb">
                  <img src="${fixUrl(subCard.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 80%22><rect fill=%22%23374151%22 width=%22120%22 height=%2280%22/></svg>'">
                </div>
                <div class="home-news-card-info">
                  <span class="home-news-card-title">${subCard.title}</span>
                  <span class="home-news-card-source">${sourceName || subCard.source}</span>
                </div>
              </a>
            ` : ''}
          </div>
          <div class="home-news-list">
            ${listItems.map(item => `
              <a class="home-news-item" href="${item.link}" target="_blank" rel="noopener">
                <div class="home-news-item-thumb">
                  <img src="${fixUrl(item.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">
                </div>
                <div class="home-news-item-info">
                  <span class="home-news-title">${item.title}</span>
                  <span class="home-news-source-tag">${sourceName || item.source}</span>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 전체 탭용 데이터 (각 소스에서 섞어서 + 랜덤 셔플)
    let allCombined = [];
    sources.forEach(src => {
      src.items.slice(0, 4).forEach(item => {
        allCombined.push({ ...item, source: src.name, icon: src.icon });
      });
    });
    // 랜덤 셔플
    for (let i = allCombined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCombined[i], allCombined[j]] = [allCombined[j], allCombined[i]];
    }

    // 탭 버튼 + 컨텐츠 (iOS/Android 스타일) - 인벤 제외
    return `
      <div class="home-news-tabs">
        <button class="home-news-tab active" data-news="all">전체</button>
        <button class="home-news-tab" data-news="thisisgame">
          <img src="${getFavicon('thisisgame.com')}" alt="">디스이즈게임
        </button>
        <button class="home-news-tab" data-news="gamemeca">
          <img src="${getFavicon('gamemeca.com')}" alt="">게임메카
        </button>
        <button class="home-news-tab" data-news="ruliweb">
          <img src="${getFavicon('ruliweb.com')}" alt="">루리웹
        </button>
      </div>
      <div class="home-news-body">
        <div class="home-news-panel active" id="home-news-all">${renderNewsContent(allCombined)}</div>
        <div class="home-news-panel" id="home-news-thisisgame">${renderNewsContent(sources[0].items.map(item => ({ ...item, source: '디스이즈게임' })), '디스이즈게임')}</div>
        <div class="home-news-panel" id="home-news-gamemeca">${renderNewsContent(sources[1].items.map(item => ({ ...item, source: '게임메카' })), '게임메카')}</div>
        <div class="home-news-panel" id="home-news-ruliweb">${renderNewsContent(sources[2].items.map(item => ({ ...item, source: '루리웹' })), '루리웹')}</div>
      </div>
    `;
  }

  // 홈 인사이트 (서브탭: 이슈/트렌드)
  function generateHomeInsight() {
    if (!aiInsight) {
      return '<div class="home-empty">인사이트를 불러올 수 없습니다</div>';
    }

    // 임시 업계 이슈 데이터 (AI 생성 전까지 사용)
    const industryIssues = aiInsight.industryIssues?.length > 0 ? aiInsight.industryIssues : [
      { tag: '넷마블', title: '넷마블, 2025년 신작 라인업 공개', desc: '넷마블이 2025년 상반기 출시 예정인 신작 5종을 공개했어요. 세븐나이츠 키우기 후속작과 신규 IP 기반 RPG가 포함되어 있어요.' },
      { tag: '정책', title: '게임산업진흥법 개정안 국회 통과', desc: '게임 셧다운제 폐지를 골자로 한 개정안이 본회의를 통과했어요. 청소년 자율규제 시스템으로 전환될 예정이에요.' }
    ];

    // 모든 인사이트 아이템 수집 (rankings 데이터가 있으면 포함)
    const allItems = [
      ...(aiInsight.issues || []),
      ...industryIssues,
      ...(aiInsight.metrics || []),
      ...(aiInsight.rankings || []),
      ...(aiInsight.community || []),
      ...(aiInsight.streaming || [])
    ];

    if (allItems.length < 2) {
      return '<div class="home-empty">인사이트를 불러올 수 없습니다</div>';
    }

    // 5분 고정 시드 (현재 시간을 5분 단위로 내림)
    const now = new Date();
    const seed = Math.floor(now.getTime() / (5 * 60 * 1000));

    // 시드 기반 랜덤 선택 (2개)
    const seededRandom = (s) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };

    const idx1 = Math.floor(seededRandom(seed) * allItems.length);
    let idx2 = Math.floor(seededRandom(seed + 1) * allItems.length);
    if (idx2 === idx1) idx2 = (idx2 + 1) % allItems.length;

    const selected = [allItems[idx1], allItems[idx2]];

    // 태그별 아이콘 및 클래스 매핑
    const tagIcons = {
      '모바일': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
      'PC': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      '콘솔': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M8 10v4M16 10h.01M18 14h.01"/></svg>',
      'e스포츠': '<svg class="weekly-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6-3 6 3"/><path d="M6 9v8l6 3 6-3V9"/><path d="M12 6v15"/></svg>'
    };
    // 고정형 태그 클래스 매핑
    const fixedTagClasses = {
      '급상승': 'tag-up', '급하락': 'tag-down', '신규진입': 'tag-new',
      '매출': 'tag-revenue', '동접': 'tag-players'
    };
    const getTagIcon = (tag) => tagIcons[tag] || '';
    const getFixedTagClass = (tag) => fixedTagClasses[tag] || '';

    const renderItem = (item) => {
      const tagIcon = getTagIcon(item.tag);
      const fixedClass = getFixedTagClass(item.tag);
      return `
        <div class="weekly-hot-card">
          <div class="home-insight-title-row">
            <div class="weekly-hot-tag ${fixedClass}">${tagIcon}${item.tag || ''}</div>
            <h4 class="weekly-hot-title">${item.title || ''}</h4>
          </div>
          <p class="weekly-hot-desc">${(item.desc || '').replace(/\. /g, '.\n')}</p>
        </div>
      `;
    };

    // 데일리 포커스 문구
    const focusSummary = aiInsight.summary || '';

    return `
      ${focusSummary ? `<div class="home-daily-focus">
        <p class="home-daily-focus-text">${focusSummary}</p>
      </div>` : ''}
      <div class="weekly-hot-issues home-insight-grid">
        ${selected.map(item => renderItem(item)).join('')}
      </div>
    `;
  }

  // 홈 커뮤니티 요약 (탭 + 좌우 5개씩 총 10개)
  function generateHomeCommunity() {
    const sources = [
      { key: 'dcinside', items: community?.dcinside || [], name: '디시인사이드', icon: '${getFavicon('dcinside.com')}' },
      { key: 'arca', items: community?.arca || [], name: '아카라이브', icon: '${getFavicon('arca.live')}' },
      { key: 'inven', items: community?.inven || [], name: '인벤', icon: '${getFavicon('inven.co.kr')}' },
      { key: 'ruliweb', items: community?.ruliweb || [], name: '루리웹', icon: '${getFavicon('ruliweb.com')}' }
    ];

    // 전체 탭용 데이터 (각 소스에서 섞어서 + 랜덤 셔플)
    let allCombined = [];
    sources.forEach(src => {
      src.items.slice(0, 3).forEach(item => {
        allCombined.push({ ...item, source: src.name, icon: src.icon });
      });
    });
    // 랜덤 셔플
    for (let i = allCombined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCombined[i], allCombined[j]] = [allCombined[j], allCombined[i]];
    }
    allCombined = allCombined.slice(0, 10);

    // 좌우 분할 렌더링 함수
    function renderCommunitySplit(items, sourceName = null) {
      if (items.length === 0) {
        return '<div class="home-empty">인기글을 불러올 수 없습니다</div>';
      }
      const leftItems = items.slice(0, 5);
      const rightItems = items.slice(5, 10);

      function renderColumn(columnItems) {
        return columnItems.map(item => `
          <a class="home-community-item" href="${item.link}" target="_blank" rel="noopener">
            <span class="home-community-title">${item.title}</span>
            <span class="home-community-meta">
              <img src="${item.icon}" alt="" loading="lazy" decoding="async">
              <span class="home-community-source">${sourceName || item.source}</span>
              ${item.channel ? `<span class="home-community-channel">· ${item.channel}</span>` : ''}
            </span>
          </a>
        `).join('');
      }

      return `
        <div class="home-community-split">
          <div class="home-community-column">${renderColumn(leftItems)}</div>
          <div class="home-community-column">${renderColumn(rightItems)}</div>
        </div>
      `;
    }

    return `
      <div class="home-community-tabs">
        <button class="home-community-tab active" data-community="all">전체</button>
        <button class="home-community-tab" data-community="dcinside">
          <img src="${getFavicon('dcinside.com')}" alt=""><span class="tab-text-dcinside">디시인사이드</span>
        </button>
        <button class="home-community-tab" data-community="arca">
          <img src="${getFavicon('arca.live')}" alt=""><span class="tab-text-arca">아카라이브</span>
        </button>
        <button class="home-community-tab" data-community="inven">
          <img src="${getFavicon('inven.co.kr')}" alt="">인벤
        </button>
        <button class="home-community-tab" data-community="ruliweb">
          <img src="${getFavicon('ruliweb.com')}" alt="">루리웹
        </button>
      </div>
      <div class="home-community-body">
        <div class="home-community-panel active" id="home-community-all">${renderCommunitySplit(allCombined)}</div>
        <div class="home-community-panel" id="home-community-dcinside">${renderCommunitySplit(sources[0].items.slice(0, 10).map(item => ({ ...item, icon: sources[0].icon })), '디시인사이드')}</div>
        <div class="home-community-panel" id="home-community-arca">${renderCommunitySplit(sources[1].items.slice(0, 10).map(item => ({ ...item, icon: sources[1].icon })), '아카라이브')}</div>
        <div class="home-community-panel" id="home-community-inven">${renderCommunitySplit(sources[2].items.slice(0, 10).map(item => ({ ...item, icon: sources[2].icon })), '인벤')}</div>
        <div class="home-community-panel" id="home-community-ruliweb">${renderCommunitySplit(sources[3].items.slice(0, 10).map(item => ({ ...item, icon: sources[3].icon })), '루리웹')}</div>
      </div>
    `;
  }

  // 홈 영상 요약 (유튜브 인기 / 치지직 탭)
  function generateHomeVideo() {
    const youtubeItems = (youtube?.gaming || []).slice(0, 9).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: `https://www.youtube.com/watch?v=${item.videoId}`,
      platform: 'youtube'
    }));

    const chzzkItems = (chzzk || []).slice(0, 9).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: `https://chzzk.naver.com/live/${item.channelId}`,
      platform: 'chzzk',
      viewers: item.viewers
    }));

    function renderVideoGrid(items) {
      if (items.length === 0) {
        return '<div class="home-empty">영상을 불러올 수 없습니다</div>';
      }
      const mainItem = items[0];
      const subItem = items[1];
      const listItems = items.slice(2, 9);
      return `
        <div class="home-video-split">
          <div class="home-video-cards">
            <a class="home-video-card home-video-card-main" href="${mainItem.link}" target="_blank" rel="noopener">
              <div class="home-video-card-thumb">
                <img src="${mainItem.thumbnail}" alt="" loading="lazy">
                ${mainItem.viewers ? `<span class="home-video-live">🔴 LIVE ${mainItem.viewers.toLocaleString()}</span>` : ''}
              </div>
              <div class="home-video-card-info">
                <div class="home-video-card-title">${mainItem.title}</div>
                <div class="home-video-card-channel">${mainItem.channel}</div>
              </div>
            </a>
            ${subItem ? `
              <a class="home-video-card home-video-card-sub" href="${subItem.link}" target="_blank" rel="noopener">
                <div class="home-video-card-thumb">
                  <img src="${subItem.thumbnail}" alt="" loading="lazy">
                  ${subItem.viewers ? `<span class="home-video-live">🔴 ${subItem.viewers.toLocaleString()}</span>` : ''}
                </div>
                <div class="home-video-card-info">
                  <div class="home-video-card-title">${subItem.title}</div>
                  <div class="home-video-card-channel">${subItem.channel}</div>
                </div>
              </a>
            ` : ''}
          </div>
          <div class="home-video-list">
            ${listItems.map(item => `
              <a class="home-video-item" href="${item.link}" target="_blank" rel="noopener">
                <div class="home-video-item-thumb">
                  <img src="${item.thumbnail}" alt="" loading="lazy">
                  ${item.viewers ? `<span class="home-video-live-sm">🔴 ${item.viewers.toLocaleString()}</span>` : ''}
                </div>
                <div class="home-video-item-info">
                  <div class="home-video-item-title">${item.title}</div>
                  <div class="home-video-item-channel">${item.channel}</div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="home-video-tabs">
        <button class="home-video-tab active" data-video="youtube">
          <img src="${getFavicon('youtube.com')}" alt="">인기 동영상
        </button>
        <button class="home-video-tab" data-video="chzzk">
          <img src="${getFavicon('chzzk.naver.com')}" alt="">치지직
        </button>
      </div>
      <div class="home-video-body">
        <div class="home-video-panel active" id="home-video-youtube">${renderVideoGrid(youtubeItems)}</div>
        <div class="home-video-panel" id="home-video-chzzk">${renderVideoGrid(chzzkItems)}</div>
      </div>
    `;
  }

  // 홈 모바일 랭킹 (한국 iOS/Android 매출/인기 Top 10)
  function generateHomeMobileRank() {
    const grossingKr = rankings?.grossing?.kr || {};
    const freeKr = rankings?.free?.kr || {};

    function renderList(items) {
      if (items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map((app, i) => `
        <div class="home-rank-row">
          <span class="home-rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="home-rank-icon" src="${app.icon || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span class="home-rank-name">${app.title}</span>
        </div>
      `).join('');
    }

    return `
      <div class="home-rank-tabs">
        <button class="home-rank-tab active" data-platform="ios">
          <img src="${getFavicon('apple.com')}" alt="">iOS
        </button>
        <button class="home-rank-tab" data-platform="android">
          <img src="${getFavicon('play.google.com')}" alt="">Android
        </button>
      </div>
      <div class="home-rank-content">
        <!-- 인기 순위 -->
        <div class="home-rank-chart active" id="home-chart-free">
          <div class="home-rank-list active" id="home-rank-free-ios">${renderList((freeKr.ios || []).slice(0, 10))}</div>
          <div class="home-rank-list" id="home-rank-free-android">${renderList((freeKr.android || []).slice(0, 10))}</div>
        </div>
        <!-- 매출 순위 -->
        <div class="home-rank-chart" id="home-chart-grossing">
          <div class="home-rank-list active" id="home-rank-grossing-ios">${renderList((grossingKr.ios || []).slice(0, 10))}</div>
          <div class="home-rank-list" id="home-rank-grossing-android">${renderList((grossingKr.android || []).slice(0, 10))}</div>
        </div>
      </div>
    `;
  }

  // 홈 스팀 순위 (인기/매출 Top 10)
  function generateHomeSteam() {
    const mostPlayed = (steam?.mostPlayed || []).slice(0, 10);
    const topSellers = (steam?.topSellers || []).slice(0, 10);

    function renderList(items, showPlayers = false) {
      if (items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map((game, i) => {
        const link = game.appid ? `https://store.steampowered.com/app/${game.appid}` : '#';
        return `
        <a class="home-steam-row" href="${link}" target="_blank" rel="noopener">
          <span class="home-rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="home-steam-icon" src="${game.img || ''}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23374151%22 width=%2240%22 height=%2240%22 rx=%228%22/><text x=%2250%%22 y=%2255%%22 font-size=%2216%22 fill=%22%239ca3af%22 text-anchor=%22middle%22>🎮</text></svg>'">
          <div class="home-steam-info">
            <span class="home-steam-name">${game.name || ''}</span>
            ${showPlayers ? `<span class="home-steam-players">${game.ccu?.toLocaleString() || '-'} 명</span>` : ''}
          </div>
        </a>
      `}).join('');
    }

    return `
      <div class="home-steam-chart active" id="home-steam-mostplayed">${renderList(mostPlayed, true)}</div>
      <div class="home-steam-chart" id="home-steam-topsellers">${renderList(topSellers, false)}</div>
    `;
  }

  // 홈 신규 게임 (모바일/스팀/PS5/닌텐도 탭)
  function generateHomeUpcoming() {
    const platforms = {
      mobile: { name: '모바일', items: (upcoming?.mobile || []).slice(0, 10) },
      steam: { name: '스팀', items: (upcoming?.steam || []).slice(0, 10) },
      ps5: { name: 'PS5', items: (upcoming?.ps5 || []).slice(0, 10) },
      nintendo: { name: '닌텐도', items: (upcoming?.nintendo || []).slice(0, 10) }
    };

    function renderList(items) {
      if (items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map((game, i) => `
        <a class="home-upcoming-row" href="${game.link || '#'}" target="_blank" rel="noopener">
          <span class="home-rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
          <img class="home-upcoming-icon" src="${game.img || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="home-upcoming-info">
            <span class="home-upcoming-name">${game.name || game.title || ''}</span>
            ${game.releaseDate ? `<span class="home-upcoming-date">${game.releaseDate}</span>` : ''}
          </div>
        </a>
      `).join('');
    }

    return `
      <div class="home-upcoming-tabs">
        <button class="home-upcoming-tab active" data-upcoming="mobile">모바일</button>
        <button class="home-upcoming-tab" data-upcoming="steam">스팀</button>
        <button class="home-upcoming-tab" data-upcoming="ps5">PS5</button>
        <button class="home-upcoming-tab" data-upcoming="nintendo">닌텐도</button>
      </div>
      <div class="home-upcoming-content">
        <div class="home-upcoming-list active" id="home-upcoming-mobile">${renderList(platforms.mobile.items)}</div>
        <div class="home-upcoming-list" id="home-upcoming-steam">${renderList(platforms.steam.items)}</div>
        <div class="home-upcoming-list" id="home-upcoming-ps5">${renderList(platforms.ps5.items)}</div>
        <div class="home-upcoming-list" id="home-upcoming-nintendo">${renderList(platforms.nintendo.items)}</div>
      </div>
    `;
  }

  // 순위 컬럼 생성 (별도 컬럼)
  function generateRankColumn(maxItems = 200) {
    const rows = Array.from({length: maxItems}, (_, i) =>
      `<div class="rank-row rank-only"><span class="rank-num ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span></div>`
    ).join('');
    return `<div class="country-column rank-column"><div class="column-header"><span class="country-name">순위</span></div><div class="rank-list">${rows}</div></div>`;
  }

  // 국가별 컬럼 생성 함수 (순위 아이콘 없이) - iOS는 100위까지
  function generateCountryColumns(chartData) {
    const rankCol = generateRankColumn(100);
    const countryCols = countries.map(c => {
      const items = chartData[c.code]?.ios || [];
      const rows = items.length > 0 ? items.map((app, i) =>
        `<div class="rank-row"><img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"><div class="app-info"><div class="app-name">${app.title}</div><div class="app-dev">${app.developer}</div></div></div>`
      ).join('') : '<div class="no-data">데이터 없음</div>';
      return `<div class="country-column"><div class="column-header"><span class="flag">${c.flag}</span><span class="country-name">${c.name}</span></div><div class="rank-list">${rows}</div></div>`;
    }).join('');
    return rankCol + countryCols;
  }

  function generateAndroidColumns(chartData) {
    const rankCol = generateRankColumn();
    const countryCols = countries.map(c => {
      const items = chartData[c.code]?.android || [];
      let rows;
      if (c.code === 'cn') {
        rows = '';
      } else if (items.length > 0) {
        rows = items.map((app, i) =>
          `<div class="rank-row"><img class="app-icon" src="${app.icon || ''}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"><div class="app-info"><div class="app-name">${app.title}</div><div class="app-dev">${app.developer}</div></div></div>`
        ).join('');
      } else {
        rows = '<div class="no-data">데이터 없음</div>';
      }
      return `<div class="country-column"><div class="column-header"><span class="flag">${c.flag}</span><span class="country-name">${c.name}</span></div><div class="rank-list">${rows}</div></div>`;
    }).join('');
    return rankCol + countryCols;
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>게이머스크롤 | 데일리 게임 인사이트</title>
  <!-- SEO -->
  <meta name="description" content="데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에">
  <meta name="keywords" content="게임 순위, 모바일 게임, 스팀 순위, 게임 뉴스, 앱스토어 순위, 플레이스토어 순위, 게임 업계, 게임주, 게이머스크롤">
  <!-- Open Graph / SNS 공유 -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="게이머스크롤 | 데일리 게임 인사이트">
  <meta property="og:description" content="모바일/스팀 순위, 게임 뉴스, AI 인사이트를 한눈에">
  <meta property="og:image" content="https://gamerscrawl.com/og-image.png">
  <meta property="og:url" content="https://gamerscrawl.com">
  <meta property="og:site_name" content="게이머스크롤">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="게이머스크롤 | 데일리 게임 인사이트">
  <meta name="twitter:description" content="모바일/스팀 순위, 게임 뉴스, AI 인사이트를 한눈에">
  <meta name="twitter:image" content="https://gamerscrawl.com/og-image.png">
  <!-- Theme & Favicon - 라이트/다크모드 분리 -->
  <meta name="theme-color" content="#f5f7fa" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
  <link rel="icon" type="image/png" sizes="32x32" href="icon-192.png">
  <link rel="icon" type="image/png" sizes="16x16" href="icon-192.png">
  <link rel="apple-touch-icon" href="icon-192.png">
  <!-- 폰트 preload로 FOUT 방지 -->
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <!-- 이미지 도메인 preconnect -->
  <link rel="preconnect" href="https://play-lh.googleusercontent.com">
  <link rel="preconnect" href="https://is1-ssl.mzstatic.com">
  <link rel="preconnect" href="https://i.ytimg.com">
  <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com">
  <link rel="preconnect" href="https://www.google.com">
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-SemiBold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="styles.css">
  <script src="https://unpkg.com/twemoji@14.0.2/dist/twemoji.min.js" crossorigin="anonymous"></script>
  <!-- Firebase Analytics -->
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
    import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";
    const firebaseConfig = {
      apiKey: "AIzaSyBlVfvAGVrhEEMPKpDKJBrOPF7BINleV7I",
      authDomain: "gamerscrawl-b104b.firebaseapp.com",
      projectId: "gamerscrawl-b104b",
      storageBucket: "gamerscrawl-b104b.firebasestorage.app",
      messagingSenderId: "831886529376",
      appId: "1:831886529376:web:2d9f0f64782fa5e5e80405",
      measurementId: "G-2269FV044J"
    };
    const app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);
  </script>
  ${SHOW_ADS ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825"
     crossorigin="anonymous"></script>` : ''}
  <script>
    // 전체 크롤링 데이터 (랜덤 선택용)
    const allNewsData = ${JSON.stringify([
      ...(news.inven || []).map(item => ({ ...item, source: '인벤', icon: '${getFavicon('inven.co.kr')}' })),
      ...(news.thisisgame || []).map(item => ({ ...item, source: '디스이즈게임', icon: '${getFavicon('thisisgame.com')}' })),
      ...(news.gamemeca || []).map(item => ({ ...item, source: '게임메카', icon: '${getFavicon('gamemeca.com')}' })),
      ...(news.ruliweb || []).map(item => ({ ...item, source: '루리웹', icon: '${getFavicon('ruliweb.com')}' }))
    ].filter(item => item.thumbnail))};
    const allCommunityData = ${JSON.stringify([
      ...(community?.dcinside || []).map(item => ({ ...item, source: '디시인사이드', icon: '${getFavicon('dcinside.com')}' })),
      ...(community?.arca || []).map(item => ({ ...item, source: '아카라이브', icon: '${getFavicon('arca.live')}' })),
      ...(community?.inven || []).map(item => ({ ...item, source: '인벤', icon: '${getFavicon('inven.co.kr')}' })),
      ...(community?.ruliweb || []).map(item => ({ ...item, source: '루리웹', icon: '${getFavicon('ruliweb.com')}' }))
    ])};
    const allYoutubeData = ${JSON.stringify((youtube?.gaming || []).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: 'https://www.youtube.com/watch?v=' + item.videoId
    })))};
    const allChzzkData = ${JSON.stringify((chzzk || []).map(item => ({
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail,
      link: 'https://chzzk.naver.com/live/' + item.channelId,
      viewers: item.viewers
    })))};
  </script>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <h1 class="header-title" id="logo-home" style="cursor: pointer;">
        <svg class="logo-svg" viewBox="0 0 660 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#4f46e5" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
          </defs>

          <!-- 중앙 정렬 텍스트 -->
          <!-- dominant-baseline을 사용하여 수직 중앙 정렬 보정 -->
          <text class="logo-text-svg" x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="62" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">GAMERS CRAWL</text>

          <!-- 장식: Tech Signals (Bar Width: 10px, Corner: 5px) -->
          <!-- 높이 72px 기준 수직 중앙 정렬 (Y = (72-H)/2) -->

          <!-- 왼쪽 안테나 -->
          <rect x="8" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
          <rect x="26" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
          <rect x="44" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>

          <!-- 오른쪽 안테나 (왼쪽과 완벽 대칭) -->
          <rect x="606" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
          <rect x="624" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
          <rect x="642" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
        </svg>
      </h1>
    </div>
  </header>

  <nav class="nav">
    <div class="nav-inner">
      <div class="nav-item" data-section="insight">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
        인사이트
      </div>
      <div class="nav-item" data-section="news">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
        주요 뉴스
      </div>
      <div class="nav-item" data-section="community">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>
        커뮤니티
      </div>
      <div class="nav-item" data-section="youtube">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        영상 순위
      </div>
      <div class="nav-item" data-section="rankings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        모바일 순위
      </div>
      <div class="nav-item" data-section="steam">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>
        스팀 순위
      </div>
      <div class="nav-item" data-section="upcoming">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        출시 게임
      </div>
      <div class="nav-item" data-section="metacritic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        메타크리틱
      </div>
    </div>
  </nav>

  <main class="container">
    <!-- Daily Insight 섹션 -->
    <section class="home-section" id="insight">
      ${generateInsightSection()}
    </section>

    <!-- 홈 서머리 섹션 -->
    <section class="home-section active" id="home">
      <div class="home-container">
        <!-- 좌측 메인 영역 -->
        <div class="home-main">
          ${SHOW_ADS ? `<!-- 상단 광고 (좌측 컬럼 위) -->
          <div class="ad-slot home-main-ad">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
          </div>` : ''}

          <!-- 인사이트 (1순위) -->
          ${aiInsight ? `
          <div class="home-card" id="home-insight">
            <div class="home-card-header">
              <div class="home-card-title">${insightDate ? `${insightDate} ` : ''}데일리 게임 인사이트${insightAmPm ? ` <span class="home-card-ampm-underline ${insightAmPm.toLowerCase()}">${insightAmPm}</span>` : ''}</div>
              <a href="#" class="home-card-more" data-goto="insight">더보기 →</a>
            </div>
            <div class="home-card-body">${generateHomeInsight()}</div>
          </div>
          ` : ''}

          <!-- 뉴스 요약 -->
          <div class="home-card" id="home-news">
            <div class="home-card-header">
              <div class="home-card-title">주요 뉴스</div>
              <a href="#" class="home-card-more" data-goto="news">더보기 →</a>
            </div>
            <div class="home-card-body">${generateHomeNews()}</div>
          </div>

          <!-- 커뮤니티 요약 -->
          <div class="home-card" id="home-community">
            <div class="home-card-header">
              <div class="home-card-title">커뮤니티 베스트</div>
              <a href="#" class="home-card-more" data-goto="community">더보기 →</a>
            </div>
            <div class="home-card-body">${generateHomeCommunity()}</div>
          </div>

          ${SHOW_ADS ? `<!-- 광고 슬롯 2 -->
          <div class="ad-slot">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
          </div>` : ''}

          <!-- 영상 요약 -->
          <div class="home-card" id="home-video">
            <div class="home-card-header">
              <div class="home-card-title">영상 순위</div>
              <a href="#" class="home-card-more" data-goto="youtube">더보기 →</a>
            </div>
            <div class="home-card-body">${generateHomeVideo()}</div>
          </div>
        </div>

        <!-- 우측 사이드바 -->
        <div class="home-sidebar">
          <!-- 모바일 랭킹 (한국 Top 10) -->
          <div class="home-card" id="home-mobile-rank">
            <div class="home-card-header">
              <div class="home-card-title">모바일 랭킹</div>
              <div class="home-card-controls">
                <div class="home-chart-toggle" id="homeChartTab">
                  <button class="tab-btn small active" data-home-chart="free">인기</button>
                  <button class="tab-btn small" data-home-chart="grossing">매출</button>
                </div>
                <a href="#" class="home-card-more" data-goto="rankings">더보기 →</a>
              </div>
            </div>
            <div class="home-card-body">${generateHomeMobileRank()}</div>
          </div>

          ${SHOW_ADS ? `<!-- 우측 광고 A -->
          <div class="ad-slot">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="rectangle" data-full-width-responsive="true"></ins>
          </div>` : ''}

          <!-- 스팀 순위 -->
          <div class="home-card" id="home-steam">
            <div class="home-card-header">
              <div class="home-card-title">스팀 순위</div>
              <div class="home-card-controls">
                <div class="home-chart-toggle" id="homeSteamTab">
                  <button class="tab-btn small active" data-home-steam="mostplayed">인기</button>
                  <button class="tab-btn small" data-home-steam="topsellers">매출</button>
                </div>
                <a href="#" class="home-card-more" data-goto="steam">더보기 →</a>
              </div>
            </div>
            <div class="home-card-body">${generateHomeSteam()}</div>
          </div>

          ${SHOW_ADS ? `<!-- 우측 광고 B (PC only) -->
          <div class="ad-slot pc-only">
            <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="rectangle" data-full-width-responsive="true"></ins>
          </div>` : ''}

          <!-- 신규 게임 -->
          <div class="home-card" id="home-upcoming">
            <div class="home-card-header">
              <div class="home-card-title">신규 게임</div>
              <a href="#" class="home-card-more" data-goto="upcoming">더보기 →</a>
            </div>
            <div class="home-card-body">${generateHomeUpcoming()}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 주요 뉴스 섹션 -->
    <section class="section" id="news">
      ${SHOW_ADS ? `<!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="newsTab">
            <button class="tab-btn active" data-news="inven"><img src="${getFavicon('inven.co.kr')}" alt="" class="news-favicon">인벤</button>
            <button class="tab-btn" data-news="thisisgame"><img src="${getFavicon('thisisgame.com')}" alt="" class="news-favicon">디스이즈게임</button>
            <button class="tab-btn" data-news="gamemeca"><img src="${getFavicon('gamemeca.com')}" alt="" class="news-favicon">게임메카</button>
            <button class="tab-btn" data-news="ruliweb"><img src="${getFavicon('ruliweb.com')}" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card">
        <div class="news-container">
          <div class="news-panel active" id="news-inven">
            <div class="news-panel-header">
              <img src="${getFavicon('inven.co.kr')}" alt="" class="news-favicon">
              <span class="news-panel-title">인벤</span>
              <a href="https://www.inven.co.kr/webzine/news/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-thisisgame">
            <div class="news-panel-header">
              <img src="${getFavicon('thisisgame.com')}" alt="" class="news-favicon">
              <span class="news-panel-title">디스이즈게임</span>
              <a href="https://www.thisisgame.com/webzine/news/nboard/4/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${thisisgameNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-gamemeca">
            <div class="news-panel-header">
              <img src="${getFavicon('gamemeca.com')}" alt="" class="news-favicon">
              <span class="news-panel-title">게임메카</span>
              <a href="https://www.gamemeca.com/news.php" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${gamemecaNewsHTML}</div>
          </div>
          <div class="news-panel" id="news-ruliweb">
            <div class="news-panel-header">
              <img src="${getFavicon('ruliweb.com')}" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹</span>
              <a href="https://bbs.ruliweb.com/news" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebNewsHTML}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 커뮤니티 인기글 섹션 -->
    <section class="section" id="community">
      ${SHOW_ADS ? `<!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="news-controls">
        <div class="control-group">
          <div class="tab-group" id="communityTab">
            <button class="tab-btn active" data-community="dcinside"><img src="${getFavicon('dcinside.com')}" alt="" class="news-favicon">디시인사이드</button>
            <button class="tab-btn" data-community="arca"><img src="${getFavicon('arca.live')}" alt="" class="news-favicon">아카라이브</button>
            <button class="tab-btn" data-community="inven"><img src="${getFavicon('inven.co.kr')}" alt="" class="news-favicon">인벤</button>
            <button class="tab-btn" data-community="ruliweb"><img src="${getFavicon('ruliweb.com')}" alt="" class="news-favicon">루리웹</button>
          </div>
        </div>
      </div>
      <div class="news-card community-card">
        <div class="community-section-header">
          <span class="community-section-title">커뮤니티</span>
        </div>
        <div class="news-container">
          <div class="news-panel active" id="community-dcinside">
            <div class="news-panel-header">
              <img src="${getFavicon('dcinside.com')}" alt="" class="news-favicon">
              <span class="news-panel-title">디시 실시간 베스트</span>
              <a href="https://gall.dcinside.com/board/lists?id=dcbest" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${dcsideCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-arca">
            <div class="news-panel-header">
              <img src="${getFavicon('arca.live')}" alt="" class="news-favicon">
              <span class="news-panel-title">아카라이브 베스트</span>
              <a href="https://arca.live/b/live" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${arcaCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-inven">
            <div class="news-panel-header">
              <img src="${getFavicon('inven.co.kr')}" alt="" class="news-favicon">
              <span class="news-panel-title">인벤 핫이슈</span>
              <a href="https://hot.inven.co.kr/" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${invenCommunityHTML}</div>
          </div>
          <div class="news-panel" id="community-ruliweb">
            <div class="news-panel-header">
              <img src="${getFavicon('ruliweb.com')}" alt="" class="news-favicon">
              <span class="news-panel-title">루리웹 게임 베스트</span>
              <a href="https://bbs.ruliweb.com/best/game?orderby=recommend&range=24h" target="_blank" class="news-more-link">더보기 →</a>
            </div>
            <div class="news-list">${ruliwebCommunityHTML}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 마켓 순위 섹션 -->
    <section class="section" id="rankings">
      ${SHOW_ADS ? `<!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="rankings-controls">
        <div class="control-group">
          <div class="tab-group" id="storeTab">
            <button class="tab-btn ios-btn active" data-store="ios"><img src="${getFavicon('apple.com')}" alt="" class="news-favicon">App Store</button>
            <button class="tab-btn android-btn" data-store="android"><img src="${getFavicon('play.google.com')}" alt="" class="news-favicon">Google Play</button>
          </div>
        </div>
        <div class="control-group">
          <div class="tab-group" id="chartTab">
            <button class="tab-btn grossing-btn active" data-chart="grossing">매출 순위</button>
            <button class="tab-btn free-btn" data-chart="free">인기 순위</button>
          </div>
        </div>
      </div>

      <div class="rankings-card">
        <div class="chart-section active" id="ios-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="ios-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateCountryColumns(rankings.free)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-grossing">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.grossing)}</div>
          </div>
        </div>
        <div class="chart-section" id="android-free">
          <div class="chart-scroll">
            <div class="columns-grid">${generateAndroidColumns(rankings.free)}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 스팀 순위 섹션 -->
    <section class="section" id="steam">
      ${SHOW_ADS ? `<!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="steam-controls">
        <div class="tab-group" id="steamTab">
          <button class="tab-btn steam-btn active" data-steam="mostplayed"><img src="${getFavicon('store.steampowered.com')}" alt="" class="news-favicon">최다 플레이</button>
          <button class="tab-btn steam-btn" data-steam="topsellers"><img src="${getFavicon('store.steampowered.com')}" alt="" class="news-favicon">최고 판매</button>
        </div>
      </div>

      <!-- 최다 플레이 -->
      <div class="steam-section active" id="steam-mostplayed">
        <div class="steam-table">
          <div class="steam-table-header">
            <div>순위</div>
            <div>게임</div>
            <div>접속자수</div>
          </div>
          ${steam.mostPlayed.map((game, i) => `
            <div class="steam-table-row">
              <div class="steam-col-rank">
                <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="steam-col-game">
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="steam-img-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg></div>
                <div class="steam-game-info">
                  <div class="steam-game-name">${game.name}</div>
                  <div class="steam-game-dev">${game.developer}</div>
                </div>
              </div>
              <div class="steam-col-players">${game.ccu.toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 최고 판매 -->
      <div class="steam-section" id="steam-topsellers">
        <div class="steam-table">
          <div class="steam-table-header">
            <div>순위</div>
            <div>게임</div>
            <div>가격</div>
          </div>
          ${steam.topSellers.map((game, i) => `
            <div class="steam-table-row">
              <div class="steam-col-rank">
                <span class="steam-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="steam-col-game">
                <img class="steam-img" src="${game.img}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="steam-img-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="#66c0f4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.007l2.862-4.145v-.058c0-2.495 2.03-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.104.004.156 0 1.871-1.52 3.393-3.393 3.393-1.618 0-2.974-1.14-3.305-2.658l-4.6-1.903C1.463 19.63 6.27 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0z"/></svg></div>
                <div class="steam-game-info">
                  <div class="steam-game-name">${game.name}</div>
                  <div class="steam-game-dev">${game.developer}</div>
                </div>
              </div>
              <div class="steam-col-players steam-price-info">${game.discount ? `<span class="steam-discount">${game.discount}</span>` : ''}<span class="steam-price">${game.price}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- 영상 섹션 -->
    <section class="section" id="youtube">
      ${SHOW_ADS ? `<!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="video-controls">
        <div class="tab-group" id="videoTab">
          <button class="tab-btn active" data-video="gaming"><img src="${getFavicon('youtube.com')}" alt="" class="news-favicon">유튜브 인기</button>
          <button class="tab-btn" data-video="chzzk"><img src="${getFavicon('chzzk.naver.com')}" alt="" class="news-favicon">치지직 라이브</button>
        </div>
      </div>

      <!-- 게임 (유튜브 게임 카테고리) -->
      <div class="video-section active" id="video-gaming">
        ${youtube.gaming.length > 0 ? `
        <div class="youtube-grid">
          ${youtube.gaming.map((video, i) => `
            <a class="youtube-card" href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank">
              <div class="youtube-thumbnail">
                <img src="${video.thumbnail}" alt="" loading="lazy" decoding="async">
                <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
              </div>
              <div class="youtube-info">
                <div class="youtube-title">${video.title}</div>
                <div class="youtube-channel">${video.channel}</div>
                <div class="youtube-views">조회수 ${video.views.toLocaleString()}회</div>
              </div>
            </a>
          `).join('')}
        </div>
        ` : `<div class="youtube-empty"><p>데이터를 불러올 수 없습니다.</p></div>`}
      </div>

      <!-- 치지직 라이브 -->
      <div class="video-section" id="video-chzzk">
        ${chzzk.length > 0 ? `
        <div class="youtube-grid">
          ${chzzk.map((live, i) => `
            <a class="youtube-card" href="https://chzzk.naver.com/live/${live.channelId}" target="_blank">
              <div class="youtube-thumbnail">
                <img src="${live.thumbnail}" alt="" loading="lazy" decoding="async">
                <span class="youtube-rank ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
                <span class="live-badge">LIVE</span>
              </div>
              <div class="youtube-info">
                <div class="youtube-title">${live.title}</div>
                <div class="youtube-channel">${live.channel}</div>
                <div class="youtube-views">시청자 ${live.viewers.toLocaleString()}명</div>
              </div>
            </a>
          `).join('')}
        </div>
        ` : `<div class="youtube-empty"><p>치지직 데이터를 불러올 수 없습니다.</p></div>`}
      </div>

    </section>

    <!-- 출시 게임 섹션 -->
    <section class="section" id="upcoming">
      ${SHOW_ADS ? `<!-- 상단 광고 -->
      <div class="ad-slot ad-slot-section">
        <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-9477874183990825" data-ad-slot="auto" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
      </div>` : ''}
      <div class="upcoming-controls">
        <div class="tab-group" id="upcomingTab">
          <button class="tab-btn active" data-upcoming="mobile">
            <img src="${getFavicon('apple.com')}" alt="" class="news-favicon">모바일
          </button>
          <button class="tab-btn" data-upcoming="steam">
            <img src="${getFavicon('store.steampowered.com')}" alt="" class="news-favicon">스팀
          </button>
          <button class="tab-btn" data-upcoming="ps5">
            <img src="${getFavicon('playstation.com')}" alt="" class="news-favicon">PS5
          </button>
          <button class="tab-btn" data-upcoming="nintendo">
            <svg viewBox="0 0 24 24" fill="#e60012" class="news-favicon" style="width:20px;height:20px"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="12" r="3" fill="#fff"/><circle cx="7" cy="12" r="1.5" fill="#e60012"/><rect x="15" y="9" width="4" height="6" rx="1" fill="#fff"/></svg>닌텐도
          </button>
        </div>
      </div>

      <div class="upcoming-card">
        <div class="upcoming-section active" id="upcoming-mobile">
          ${generateUpcomingSection(upcoming?.mobile || [], 'mobile')}
        </div>
        <div class="upcoming-section" id="upcoming-steam">
          ${generateUpcomingSection(upcoming?.steam || [], 'steam')}
        </div>
        <div class="upcoming-section" id="upcoming-ps5">
          ${generateUpcomingSection(upcoming?.ps5 || [], 'ps5')}
        </div>
        <div class="upcoming-section" id="upcoming-nintendo">
          ${generateUpcomingSection(upcoming?.nintendo || [], 'nintendo')}
        </div>
      </div>
    </section>

    <!-- 메타크리틱 섹션 -->
    <section class="section" id="metacritic">
      ${generateMetacriticSection(metacritic)}
    </section>
  </main>

  <script>
    // 폰트 로딩 완료 감지 - FOUT 방지
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      // fallback: 100ms 후 표시
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 100);
    }

    // 로고 클릭 시 홈으로 이동
    document.getElementById('logo-home')?.addEventListener('click', () => {
      // nav 활성화 해제
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      // 모든 섹션 숨기기
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
      // 홈 섹션 표시
      document.getElementById('home')?.classList.add('active');
      document.body.classList.remove('detail-page'); // 헤더 보이기
      // 모든 탭 초기화
      resetSubTabs();
      window.scrollTo(0, 0);
    });

    // 홈 더보기 클릭 시 해당 섹션으로 이동
    document.querySelectorAll('.home-card-more').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetSection = link.dataset.goto;
        if (!targetSection) return;

        // 홈 숨기기 (모든 home-section)
        document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
        document.body.classList.add('detail-page'); // 헤더 숨기기
        // nav 활성화
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('.nav-item[data-section="' + targetSection + '"]')?.classList.add('active');
        // 해당 섹션 표시
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(targetSection)?.classList.add('active');
        window.scrollTo(0, 0);
      });
    });

    // 홈 뉴스 서브탭 전환
    document.querySelectorAll('.home-news-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-news-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetNews = tab.dataset.news;
        document.querySelectorAll('.home-news-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-news-' + targetNews)?.classList.add('active');
      });
    });

    // 홈 인사이트 서브탭 전환
    document.querySelectorAll('.home-insight-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-insight-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetInsight = tab.dataset.insightTab;
        document.querySelectorAll('.home-insight-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-insight-' + targetInsight)?.classList.add('active');
      });
    });

    // 홈 커뮤니티 서브탭 전환
    document.querySelectorAll('.home-community-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-community-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetCommunity = tab.dataset.community;
        document.querySelectorAll('.home-community-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-community-' + targetCommunity)?.classList.add('active');
      });
    });

    // 홈 영상 서브탭 전환
    document.querySelectorAll('.home-video-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-video-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetVideo = tab.dataset.video;
        document.querySelectorAll('.home-video-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('home-video-' + targetVideo)?.classList.add('active');
      });
    });

    // 홈 모바일 랭킹 - 인기/매출 탭 전환
    let homeCurrentChart = 'free';
    let homeCurrentPlatform = 'ios';
    const homeChartTab = document.getElementById('homeChartTab');
    homeChartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      homeChartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      homeCurrentChart = btn.dataset.homeChart;
      // 차트 전환
      document.querySelectorAll('.home-rank-chart').forEach(c => c.classList.remove('active'));
      const targetChart = document.getElementById('home-chart-' + homeCurrentChart);
      targetChart?.classList.add('active');
      // 현재 플랫폼 리스트도 active 설정
      targetChart?.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
      targetChart?.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
    });

    // 홈 모바일 랭킹 - iOS/Android 탭 전환
    document.querySelectorAll('.home-rank-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-rank-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        homeCurrentPlatform = tab.dataset.platform;
        // 현재 활성화된 차트 내에서 플랫폼 전환
        document.querySelectorAll('.home-rank-chart').forEach(chart => {
          chart.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
          const targetList = chart.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform);
          targetList?.classList.add('active');
        });
      });
    });

    // 홈 스팀 순위 - 인기/매출 탭 전환
    const homeSteamTab = document.getElementById('homeSteamTab');
    homeSteamTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      homeSteamTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const steamChart = btn.dataset.homeSteam;
      document.querySelectorAll('.home-steam-chart').forEach(c => c.classList.remove('active'));
      document.getElementById('home-steam-' + steamChart)?.classList.add('active');
    });

    // 홈 신규 게임 - 플랫폼 탭 전환
    document.querySelectorAll('.home-upcoming-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-upcoming-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const platform = tab.dataset.upcoming;
        document.querySelectorAll('.home-upcoming-list').forEach(l => l.classList.remove('active'));
        document.getElementById('home-upcoming-' + platform)?.classList.add('active');
      });
    });

    // 뉴스 탭 요소
    const newsTab = document.getElementById('newsTab');
    const newsContainer = document.querySelector('.news-container');

    // 커뮤니티 탭 요소
    const communityTab = document.getElementById('communityTab');
    const communityContainer = document.querySelector('#community .news-container');

    // 마켓 순위 탭 요소
    const storeTab = document.getElementById('storeTab');
    const chartTab = document.getElementById('chartTab');
    let currentStore = 'ios';
    let currentChart = 'grossing';

    // Steam 탭 요소
    const steamTab = document.getElementById('steamTab');

    // 출시 게임 탭 요소
    const upcomingTab = document.getElementById('upcomingTab');

    // 전체 탭 랜덤 셔플 함수 (5분 주기, 내용만 변경)
    function shuffleAllTabs() {
      const SHUFFLE_INTERVAL = 5 * 60 * 1000; // 5분
      const now = Date.now();
      let shuffleCache = null;

      try {
        shuffleCache = JSON.parse(localStorage.getItem('shuffleCache'));
      } catch(e) {}

      // 5분 이내면 캐시 사용, 아니면 새로 셔플
      if (!shuffleCache || (now - shuffleCache.timestamp) > SHUFFLE_INTERVAL) {
        // 뉴스 랜덤 선택 (9개)
        const newsIndices = [];
        const newsPool = [...Array(allNewsData.length).keys()];
        for (let i = newsPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newsPool[i], newsPool[j]] = [newsPool[j], newsPool[i]];
        }
        shuffleCache = {
          timestamp: now,
          newsIndices: newsPool.slice(0, 9),
          communityIndices: []
        };
        // 커뮤니티 랜덤 선택 (10개)
        const commPool = [...Array(allCommunityData.length).keys()];
        for (let i = commPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [commPool[i], commPool[j]] = [commPool[j], commPool[i]];
        }
        shuffleCache.communityIndices = commPool.slice(0, 10);
        // 유튜브 랜덤 선택 (6개)
        const ytPool = [...Array(allYoutubeData.length).keys()];
        for (let i = ytPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ytPool[i], ytPool[j]] = [ytPool[j], ytPool[i]];
        }
        shuffleCache.youtubeIndices = ytPool.slice(0, 9);
        // 치지직 랜덤 선택 (9개)
        const chzzkPool = [...Array(allChzzkData.length).keys()];
        for (let i = chzzkPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [chzzkPool[i], chzzkPool[j]] = [chzzkPool[j], chzzkPool[i]];
        }
        shuffleCache.chzzkIndices = chzzkPool.slice(0, 9);
        localStorage.setItem('shuffleCache', JSON.stringify(shuffleCache));
      }

      // 뉴스 전체 탭 내용 업데이트
      const newsItems = shuffleCache.newsIndices.map(i => allNewsData[i]).filter(Boolean);
      const newsAllPanel = document.getElementById('home-news-all');
      if (newsAllPanel && newsItems.length >= 9) {
        const fixUrl = (url) => {
      if (!url) return url;
      if (url.startsWith('//')) url = 'https:' + url;
      if (url.includes('inven.co.kr')) return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
      return url;
    };
        // 메인 카드 (1개)
        const mainCard = newsAllPanel.querySelector('.home-news-card-main');
        if (mainCard && newsItems[0]) {
          mainCard.href = newsItems[0].link;
          mainCard.querySelector('.home-news-card-thumb img').src = fixUrl(newsItems[0].thumbnail);
          mainCard.querySelector('.home-news-card-title').textContent = newsItems[0].title;
          mainCard.querySelector('.home-news-card-source').textContent = newsItems[0].source;
        }
        // 서브 카드 (2개)
        const subCards = newsAllPanel.querySelectorAll('.home-news-card-sub');
        subCards.forEach((card, i) => {
          if (newsItems[i + 1]) {
            card.href = newsItems[i + 1].link;
            card.querySelector('.home-news-card-thumb img').src = fixUrl(newsItems[i + 1].thumbnail);
            card.querySelector('.home-news-card-title').textContent = newsItems[i + 1].title;
            card.querySelector('.home-news-card-source').textContent = newsItems[i + 1].source;
          }
        });
        // 리스트 아이템 (6개)
        const listItems = newsAllPanel.querySelectorAll('.home-news-item');
        listItems.forEach((item, i) => {
          if (newsItems[i + 3]) {
            item.href = newsItems[i + 3].link;
            item.querySelector('.home-news-item-thumb img').src = fixUrl(newsItems[i + 3].thumbnail);
            item.querySelector('.home-news-title').textContent = newsItems[i + 3].title;
            item.querySelector('.home-news-source-tag').textContent = newsItems[i + 3].source;
          }
        });
      }

      // 커뮤니티 전체 탭 내용 업데이트
      const commItems = shuffleCache.communityIndices.map(i => allCommunityData[i]).filter(Boolean);
      const communityAllPanel = document.getElementById('home-community-all');
      if (communityAllPanel && commItems.length >= 10) {
        const allCommItems = communityAllPanel.querySelectorAll('.home-community-item');
        allCommItems.forEach((item, i) => {
          if (commItems[i]) {
            item.href = commItems[i].link;
            item.querySelector('.home-community-title').textContent = commItems[i].title;
            item.querySelector('.home-community-meta img').src = commItems[i].icon;
            item.querySelector('.home-community-source').textContent = commItems[i].source;
            const channelEl = item.querySelector('.home-community-channel');
            if (channelEl) channelEl.textContent = commItems[i].channel ? '· ' + commItems[i].channel : '';
          }
        });
      }

      // 유튜브 영상 내용 업데이트
      const ytItems = (shuffleCache.youtubeIndices || []).map(i => allYoutubeData[i]).filter(Boolean);
      const ytPanel = document.getElementById('home-video-youtube');
      if (ytPanel && ytItems.length >= 9) {
        // 메인 카드 (1개)
        const mainCard = ytPanel.querySelector('.home-video-card-main');
        if (mainCard && ytItems[0]) {
          mainCard.href = ytItems[0].link;
          mainCard.querySelector('.home-video-card-thumb img').src = ytItems[0].thumbnail;
          mainCard.querySelector('.home-video-card-title').textContent = ytItems[0].title;
          mainCard.querySelector('.home-video-card-channel').textContent = ytItems[0].channel;
        }
        // 서브 카드 (2개)
        const subCards = ytPanel.querySelectorAll('.home-video-card-sub');
        subCards.forEach((card, i) => {
          if (ytItems[i + 1]) {
            card.href = ytItems[i + 1].link;
            card.querySelector('.home-video-card-thumb img').src = ytItems[i + 1].thumbnail;
            card.querySelector('.home-video-card-title').textContent = ytItems[i + 1].title;
            card.querySelector('.home-video-card-channel').textContent = ytItems[i + 1].channel;
          }
        });
        // 리스트 아이템 (6개)
        const listItems = ytPanel.querySelectorAll('.home-video-item');
        listItems.forEach((item, i) => {
          if (ytItems[i + 3]) {
            item.href = ytItems[i + 3].link;
            item.querySelector('.home-video-item-thumb img').src = ytItems[i + 3].thumbnail;
            item.querySelector('.home-video-item-title').textContent = ytItems[i + 3].title;
            item.querySelector('.home-video-item-channel').textContent = ytItems[i + 3].channel;
          }
        });
      }

      // 치지직 영상 내용 업데이트
      const chzzkItems = (shuffleCache.chzzkIndices || []).map(i => allChzzkData[i]).filter(Boolean);
      const chzzkPanel = document.getElementById('home-video-chzzk');
      if (chzzkPanel && chzzkItems.length >= 9) {
        // 메인 카드 (1개)
        const mainCard = chzzkPanel.querySelector('.home-video-card-main');
        if (mainCard && chzzkItems[0]) {
          mainCard.href = chzzkItems[0].link;
          mainCard.querySelector('.home-video-card-thumb img').src = chzzkItems[0].thumbnail;
          mainCard.querySelector('.home-video-card-title').textContent = chzzkItems[0].title;
          mainCard.querySelector('.home-video-card-channel').textContent = chzzkItems[0].channel;
          const liveEl = mainCard.querySelector('.home-video-live');
          if (liveEl) liveEl.textContent = chzzkItems[0].viewers ? '🔴 LIVE ' + chzzkItems[0].viewers.toLocaleString() : '';
        }
        // 서브 카드 (2개)
        const subCards = chzzkPanel.querySelectorAll('.home-video-card-sub');
        subCards.forEach((card, i) => {
          if (chzzkItems[i + 1]) {
            card.href = chzzkItems[i + 1].link;
            card.querySelector('.home-video-card-thumb img').src = chzzkItems[i + 1].thumbnail;
            card.querySelector('.home-video-card-title').textContent = chzzkItems[i + 1].title;
            card.querySelector('.home-video-card-channel').textContent = chzzkItems[i + 1].channel;
            const liveEl = card.querySelector('.home-video-live');
            if (liveEl) liveEl.textContent = chzzkItems[i + 1].viewers ? '🔴 ' + chzzkItems[i + 1].viewers.toLocaleString() : '';
          }
        });
        // 리스트 아이템 (6개)
        const listItems = chzzkPanel.querySelectorAll('.home-video-item');
        listItems.forEach((item, i) => {
          if (chzzkItems[i + 3]) {
            item.href = chzzkItems[i + 3].link;
            item.querySelector('.home-video-item-thumb img').src = chzzkItems[i + 3].thumbnail;
            item.querySelector('.home-video-item-title').textContent = chzzkItems[i + 3].title;
            item.querySelector('.home-video-item-channel').textContent = chzzkItems[i + 3].channel;
            const liveSmEl = item.querySelector('.home-video-live-sm');
            if (liveSmEl) liveSmEl.textContent = chzzkItems[i + 3].viewers ? '🔴 ' + chzzkItems[i + 3].viewers.toLocaleString() : '';
          }
        });
      }
    }

    // 서브탭 초기화 함수
    function resetSubTabs() {
      // 전체 탭 랜덤 셔플
      shuffleAllTabs();
      // 홈 뉴스 서브탭 초기화
      document.querySelectorAll('.home-news-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-news-tab[data-news="all"]')?.classList.add('active');
      document.querySelectorAll('.home-news-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-news-all')?.classList.add('active');
      // 홈 인사이트 서브탭 초기화
      document.querySelectorAll('.home-insight-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-insight-tab[data-insight-tab="issues"]')?.classList.add('active');
      document.querySelectorAll('.home-insight-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-insight-issues')?.classList.add('active');
      // 홈 커뮤니티 서브탭 초기화
      document.querySelectorAll('.home-community-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-community-tab[data-community="all"]')?.classList.add('active');
      document.querySelectorAll('.home-community-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-community-all')?.classList.add('active');
      // 홈 영상 서브탭 초기화
      document.querySelectorAll('.home-video-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.home-video-tab[data-video="youtube"]')?.classList.add('active');
      document.querySelectorAll('.home-video-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('home-video-youtube')?.classList.add('active');
      // 홈 모바일 랭킹 플랫폼 탭 초기화
      document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.platform-tab[data-platform="ios"]')?.classList.add('active');
      document.querySelectorAll('.platform-content').forEach(c => c.classList.remove('active'));
      document.getElementById('ios-rankings')?.classList.add('active');
      // 홈 국가 탭 초기화
      document.querySelectorAll('.country-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.country-tab[data-country="kr"]')?.classList.add('active');
      document.querySelectorAll('.country-content').forEach(c => c.classList.remove('active'));
      document.getElementById('kr-rankings')?.classList.add('active');
      // 인사이트 페이지 일간/주간 탭 초기화
      document.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.insight-tab[data-tab="daily"]')?.classList.add('active');
      document.querySelectorAll('.insight-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-daily')?.classList.add('active');
      // 뉴스 탭 초기화
      newsTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('#news .news-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
      // 커뮤니티 탭 초기화
      communityTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('#community .news-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
      // 마켓 순위 탭 초기화
      storeTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      chartTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      currentStore = 'ios';
      currentChart = 'grossing';
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById('ios-grossing')?.classList.add('active');
      // 스팀 탭 초기화
      steamTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
      document.getElementById('steam-mostplayed')?.classList.add('active');
      // 영상 탭 초기화
      document.getElementById('videoTab')?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
      document.getElementById('video-gaming')?.classList.add('active');
      // 출시 게임 탭 초기화
      upcomingTab?.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
      document.getElementById('upcoming-mobile')?.classList.add('active');
    }

    // 메인 네비게이션 - 캐러셀 슬라이드 기능
    const navInner = document.querySelector('.nav-inner');
    const allNavItems = document.querySelectorAll('.nav-item');
    const totalNavCount = allNavItems.length; // 8개
    const visibleCount = 5;

    function updateNavCarousel(index) {
      // 모바일에서만 슬라이드 (5개 보이고, 8개 메뉴)
      // 각 nav-item이 20% 차지 (CSS: flex: 0 0 20%)
      if (window.innerWidth <= 768 && navInner) {
        // index 0-3: 0% (메뉴 0-4 보임)
        // index 4: -20% (메뉴 1-5 보임)
        // index 5: -40% (메뉴 2-6 보임)
        // index 6-7: -60% (메뉴 3-7 보임)
        let offset = 0;
        if (index >= 6) offset = -60;
        else if (index >= 5) offset = -40;
        else if (index >= 4) offset = -20;
        navInner.style.transform = 'translateX(' + offset + '%)';
      }
    }

    document.querySelectorAll('.nav-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        // 스와이프 직후 클릭 무시
        if (typeof isSwiping !== 'undefined' && isSwiping) return;
        // 홈 섹션 숨기기 (모든 home-section에서 active 제거)
        document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
        document.body.classList.add('detail-page'); // 헤더 숨기기
        // nav 활성화
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(item.dataset.section)?.classList.add('active');
        resetSubTabs();
        resetCountryColumns();
        updateNavCarousel(idx);
        window.scrollTo(0, 0);
      });
    });

    // 뉴스 탭 - 선택한 패널부터 순서대로 배치
    const newsTypes = ['inven', 'thisisgame', 'gamemeca', 'ruliweb'];
    newsTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const selectedType = btn.dataset.news;
      const selectedIndex = newsTypes.indexOf(selectedType);

      // 탭 버튼 active 토글
      newsTab.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === selectedIndex);
      });

      // 패널 active 토글 + order 설정 (선택한 패널부터 순서대로)
      newsTypes.forEach((type, i) => {
        const panel = document.getElementById('news-' + type);
        if (panel) {
          panel.classList.toggle('active', type === selectedType);
          // order: 선택된 패널이 0, 그 다음이 1, 2, 3...
          panel.style.order = (i - selectedIndex + newsTypes.length) % newsTypes.length;
        }
      });
    });

    // 커뮤니티 탭 - 선택한 패널부터 순서대로 배치
    const communityTypes = ['dcinside', 'arca', 'inven', 'ruliweb'];
    let currentCommunityIndex = 0;

    function switchCommunity(index) {
      if (index < 0) index = communityTypes.length - 1;
      if (index >= communityTypes.length) index = 0;
      currentCommunityIndex = index;

      // 탭 버튼 active 토글
      communityTab.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === index);
      });

      // 패널 active 토글 + order 설정 (선택한 패널부터 순서대로)
      communityTypes.forEach((type, i) => {
        const panel = document.getElementById('community-' + type);
        if (panel) {
          panel.classList.toggle('active', i === index);
          // order: 선택된 패널이 0, 그 다음이 1, 2, 3...
          panel.style.order = (i - index + communityTypes.length) % communityTypes.length;
        }
      });
    }

    communityTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const index = communityTypes.indexOf(btn.dataset.community);
      if (index !== -1) switchCommunity(index);
    });

    // 모바일 스와이프 기능 - 메인 메뉴 전환 (홈 포함)
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false; // 스와이프 플래그
    const navItems = document.querySelectorAll('.nav-item');
    const navSections = ['insight', 'news', 'community', 'youtube', 'rankings', 'steam', 'upcoming', 'metacritic'];

    // 홈이 활성화되어 있는지 확인
    function isHomeActive() {
      return document.getElementById('home')?.classList.contains('active');
    }

    function getCurrentNavIndex() {
      if (isHomeActive()) return -1; // 홈은 -1
      const activeNav = document.querySelector('.nav-item.active');
      if (!activeNav) return -1;
      const section = activeNav.dataset.section;
      return navSections.indexOf(section);
    }

    // 홈으로 이동
    function goToHome() {
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
      document.getElementById('home')?.classList.add('active');
      document.body.classList.remove('detail-page'); // 헤더 보이기
      resetSubTabs();
      resetCountryColumns();
      window.scrollTo(0, 0);
    }

    function switchNavSection(index) {
      // 홈으로 이동 (index < 0)
      if (index < 0) {
        goToHome();
        return;
      }
      // 마지막 섹션에서 다음으로 가면 홈으로
      if (index >= navSections.length) {
        goToHome();
        return;
      }

      // 홈 숨기기 (모든 home-section)
      document.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
      document.body.classList.add('detail-page'); // 헤더 숨기기

      const targetSection = navSections[index];
      navItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

      document.querySelector('.nav-item[data-section="' + targetSection + '"]')?.classList.add('active');
      document.getElementById(targetSection)?.classList.add('active');

      // 캐러셀 슬라이드 업데이트 (각 nav-item이 20% 차지, 8개 메뉴)
      const navInner = document.querySelector('.nav-inner');
      if (window.innerWidth <= 768 && navInner) {
        // index 0-3: 0% (메뉴 0-4 보임)
        // index 4: -20% (메뉴 1-5 보임)
        // index 5: -40% (메뉴 2-6 보임)
        // index 6-7: -60% (메뉴 3-7 보임)
        let offset = 0;
        if (index >= 6) offset = -60;
        else if (index >= 5) offset = -40;
        else if (index >= 4) offset = -20;
        navInner.style.transform = 'translateX(' + offset + '%)';
      }

      // 상단으로 즉시 스크롤
      window.scrollTo(0, 0);
    }

    // 전체 페이지에서 스와이프
    let touchedElement = null;
    let previousElement = null;
    let isTouchMoving = false;
    document.body.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      isTouchMoving = false;
      // 터치된 nav-item 또는 tab-btn 추적
      touchedElement = e.target.closest('.nav-item, .tab-btn');
    }, { passive: true });

    // 터치 이동 시 nav-item 포커스/선택 해제 (스와이프 시 선택 상태 방지)
    document.body.addEventListener('touchmove', (e) => {
      const diffX = Math.abs(touchStartX - e.changedTouches[0].screenX);
      const diffY = Math.abs(touchStartY - e.changedTouches[0].screenY);
      // 일정 거리 이상 이동하면 포커스 해제
      if (diffX > 10 || diffY > 10) {
        isTouchMoving = true;
        // body에 swiping 클래스 추가 (모든 hover 비활성화)
        document.body.classList.add('is-swiping');

        document.activeElement?.blur();

        // 터치된 요소의 hover 상태 강제 해제
        if (touchedElement) {
          touchedElement.style.pointerEvents = 'none';
          touchedElement.classList.add('swiping');
        }
      }
    }, { passive: true });

    // 터치 종료 시 swiping 클래스 제거
    document.body.addEventListener('touchcancel', () => {
      document.body.classList.remove('is-swiping');
      if (touchedElement) {
        touchedElement.style.pointerEvents = '';
        touchedElement.classList.remove('swiping');
        touchedElement = null;
      }
      isTouchMoving = false;
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      // 수평 이동이 수직보다 커야 스와이프로 인식 (표준 감도)
      if (Math.abs(diffX) <= Math.abs(diffY)) return;

      if (Math.abs(diffX) > 75) { // 75px 이상 수평 스와이프 (표준)
        // 스와이프 플래그 설정 (클릭 이벤트 방지)
        isSwiping = true;
        setTimeout(() => { isSwiping = false; }, 300);

        const currentIndex = getCurrentNavIndex();

        if (currentIndex === -1) {
          // 홈에서 스와이프
          if (diffX > 0) {
            // 왼쪽으로 스와이프 → 첫 번째 섹션 (community)
            switchNavSection(0);
          } else {
            // 오른쪽으로 스와이프 → 마지막 섹션 (upcoming)
            switchNavSection(navSections.length - 1);
          }
        } else {
          if (diffX > 0) {
            // 왼쪽으로 스와이프 → 다음 섹션
            switchNavSection(currentIndex + 1);
          } else {
            // 오른쪽으로 스와이프 → 이전 섹션
            switchNavSection(currentIndex - 1);
          }
        }
      }
      // swiping 클래스 제거 (스와이프한 경우만)
      if (isTouchMoving && touchedElement) {
        const swipedElement = touchedElement;
        // DOM 변경 후 hover 상태 완전 해제
        requestAnimationFrame(() => {
          swipedElement.style.pointerEvents = 'none';
          swipedElement.classList.add('swiping');
          document.activeElement?.blur();

          // 300ms 후 복원
          setTimeout(() => {
            document.body.classList.remove('is-swiping');
            swipedElement.style.pointerEvents = '';
            swipedElement.classList.remove('swiping');
          }, 300);
        });
        touchedElement = null;
      } else {
        // 탭인 경우 즉시 정리
        touchedElement = null;
      }
      isTouchMoving = false;
    }, { passive: true });

    function updateRankings() {
      document.querySelectorAll('.chart-section').forEach(s => s.classList.remove('active'));
      document.getElementById(currentStore + '-' + currentChart)?.classList.add('active');
    }

    // 국가 컬럼 초기화 함수
    function resetCountryColumns() {
      document.querySelectorAll('.country-column').forEach(c => {
        c.classList.remove('expanded', 'collapsed');
      });
    }

    storeTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      storeTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStore = btn.dataset.store;
      updateRankings();
      resetCountryColumns();
    });

    chartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      chartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChart = btn.dataset.chart;
      updateRankings();
      resetCountryColumns();
    });

    // Steam 탭 이벤트
    steamTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      steamTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.steam-section').forEach(s => s.classList.remove('active'));
      document.getElementById('steam-' + btn.dataset.steam)?.classList.add('active');
    });

    // 출시 게임 탭 이벤트
    upcomingTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      upcomingTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.upcoming-section').forEach(s => s.classList.remove('active'));
      document.getElementById('upcoming-' + btn.dataset.upcoming)?.classList.add('active');
    });

    // 영상 탭 이벤트
    const videoTab = document.getElementById('videoTab');
    videoTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      videoTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.video-section').forEach(s => s.classList.remove('active'));
      document.getElementById('video-' + btn.dataset.video)?.classList.add('active');
    });

    // 모바일 디바이스 감지 (터치 + 포인터)
    const isMobileDevice = () => {
      return window.matchMedia('(pointer: coarse)').matches ||
             'ontouchstart' in window ||
             navigator.maxTouchPoints > 0;
    };

    // 모바일에서 국가 컬럼 클릭 시 펼치기 (768px 이하)
    document.querySelectorAll('.columns-grid').forEach(grid => {
      grid.addEventListener('click', (e) => {
        if (window.innerWidth > 768) return;
        const column = e.target.closest('.country-column');
        if (!column || column.classList.contains('rank-column')) return;
        // rank-column 제외한 국가 컬럼만 선택
        const countryColumns = grid.querySelectorAll('.country-column:not(.rank-column)');
        const firstCountry = countryColumns[0];
        const isFirstCountry = column === firstCountry;
        countryColumns.forEach(c => c.classList.remove('expanded'));
        if (isFirstCountry) {
          firstCountry.classList.remove('collapsed');
        } else {
          firstCountry.classList.add('collapsed');
          column.classList.add('expanded');
        }
      });
    });

    // 페이지 로드 시 전체 탭 랜덤 셔플
    shuffleAllTabs();

    // Twemoji로 국기 이모지 렌더링
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, {
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
        folder: 'svg',
        ext: '.svg'
      });
    }
  </script>

  <!-- Footer -->
  <footer class="site-footer">
    <span>© ${new Date().getFullYear()} 게이머스크롤</span>
    <span class="footer-divider">|</span>
    <a href="#" onclick="document.getElementById('privacy-modal').style.display='flex'; return false;">개인정보처리방침</a>
  </footer>

  <!-- Privacy Modal -->
  <div id="privacy-modal" class="modal-overlay" onclick="if(event.target===this) this.style.display='none'">
    <div class="modal-content">
      <button class="modal-close" onclick="document.getElementById('privacy-modal').style.display='none'">&times;</button>
      <h2>개인정보처리방침</h2>
      <p>게이머스크롤(이하 "본 사이트")은 「개인정보 보호법」 및 관련 법령에 따라 이용자의 개인정보를 보호하고, 이와 관련된 고충을 신속하게 처리하기 위해 다음과 같은 개인정보처리방침을 수립·공개합니다.</p>

      <h3>1. 개인정보의 수집 항목 및 방법</h3>
      <p>본 사이트는 별도의 회원가입 절차 없이 모든 서비스를 이용할 수 있으며, 이용자로부터 이름, 이메일, 연락처 등의 개인정보를 직접 수집하지 않습니다.</p>

      <h3>2. 자동으로 수집되는 정보</h3>
      <p>서비스 이용 과정에서 아래와 같은 정보가 자동으로 생성되어 수집될 수 있습니다:</p>
      <ul style="margin: 10px 0; padding-left: 20px; font-size: 13px;">
        <li>접속 기기 정보 (기기 유형, 운영체제, 브라우저 종류)</li>
        <li>접속 로그 (접속 일시, 방문 페이지, 체류 시간)</li>
        <li>IP 주소 (익명화 처리됨)</li>
      </ul>
      <p>이 정보는 Google Analytics를 통해 수집되며, 개인을 식별할 수 없는 통계 형태로만 활용됩니다.</p>

      <h3>3. 개인정보의 보유 및 이용 기간</h3>
      <p>자동 수집된 정보는 수집일로부터 최대 26개월간 보관되며, 이후 자동으로 파기됩니다.</p>

      <h3>4. 쿠키(Cookie)의 사용</h3>
      <p>본 사이트는 이용자의 편의를 위해 쿠키를 사용합니다. 쿠키는 웹사이트 운영에 필요한 기술적 정보를 저장하며, 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있습니다.</p>

      <h3>5. 개인정보의 제3자 제공</h3>
      <p>본 사이트는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, Google Analytics 서비스 이용을 위해 익명화된 통계 데이터가 Google에 전송될 수 있습니다.</p>

      <h3>6. 정책 변경</h3>
      <p>본 개인정보처리방침은 법령 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 본 페이지를 통해 공지합니다.</p>

      <p style="margin-top: 20px; color: #666; font-size: 12px;">시행일자: 2025년 12월 4일</p>
    </div>
  </div>

  <style>
    .site-footer {
      text-align: center;
      padding: 20px;
      margin-top: 40px;
      border-top: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 12px;
    }
    .site-footer a { color: var(--text-secondary); text-decoration: none; }
    .site-footer a:hover { color: var(--text); }
    .footer-divider { margin: 0 8px; }
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    .modal-content {
      background: #1a1a1a;
      padding: 30px;
      border-radius: 12px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
      color: #ddd;
    }
    .modal-content h2 { margin-top: 0; color: #fff; }
    .modal-content h3 { color: #aaa; margin-top: 20px; font-size: 14px; }
    .modal-content p { font-size: 13px; line-height: 1.6; }
    .modal-close {
      position: absolute;
      top: 10px; right: 15px;
      background: none;
      border: none;
      color: #888;
      font-size: 24px;
      cursor: pointer;
    }
    .modal-close:hover { color: #fff; }
  </style>

  <script>
    // 인사이트 탭 전환 기능
    document.querySelectorAll('.insight-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // 모든 탭 비활성화
        document.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.insight-panel').forEach(p => p.classList.remove('active'));

        // 클릭한 탭 활성화
        tab.classList.add('active');
        const panelId = 'panel-' + tab.dataset.tab;
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');
      });
    });
  </script>
</body>
</html>`;
}

module.exports = { generateHTML };
