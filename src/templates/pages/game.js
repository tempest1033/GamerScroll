/**
 * 게임 대시보드 페이지 템플릿
 * 메인 페이지와 일관된 home-card 스타일 사용
 */

const { wrapWithLayout, SHOW_ADS, AD_SLOTS } = require('../layout');

// 광고 슬롯 (홈페이지와 동일한 분리 배치 방식) - game은 horizontal 슬롯 사용
const topAdMobile = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal mobile-only"><ins class="adsbygoogle" style="display:block;width:100%;max-height:100px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal5 + '" data-ad-format="horizontal"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';
const topAdPc = SHOW_ADS ? '<div class="ad-slot ad-slot-section ad-slot--horizontal pc-only"><ins class="adsbygoogle" style="display:block;width:100%;max-height:90px" data-ad-client="ca-pub-9477874183990825" data-ad-slot="' + AD_SLOTS.horizontal4 + '" data-ad-format="horizontal" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script></div>' : '';

// 공통 차트 설정 (모든 차트가 이 설정을 공유)
const CHART_CONFIG = {
  width: 400,
  height: 200,
  padding: { top: 6, right: 4, bottom: 18, left: 18 },
  xLabelPadding: 16,
  regions: [
    { id: 'kr', label: '한국', color: '#FF4757' },
    { id: 'jp', label: '일본', color: '#2ED573' },
    { id: 'us', label: '미국', color: '#3742FA' },
    { id: 'cn', label: '중국', color: '#FFA502' },
    { id: 'tw', label: '대만', color: '#A55EEA' }
  ]
};

// 공통 차트 헬퍼 함수
const chartHelpers = {
  getChartWidth: () => CHART_CONFIG.width - CHART_CONFIG.padding.left - CHART_CONFIG.padding.right,
  getChartHeight: () => CHART_CONFIG.height - CHART_CONFIG.padding.top - CHART_CONFIG.padding.bottom,
  getXLabelWidth: () => chartHelpers.getChartWidth() - CHART_CONFIG.xLabelPadding * 2,

  // Y축 좌표 계산
  getY: (rank, yMin, yMax) => {
    const chartHeight = chartHelpers.getChartHeight();
    const clampedRank = Math.min(Math.max(rank, yMin), yMax);
    return CHART_CONFIG.padding.top + ((clampedRank - yMin) / (yMax - yMin)) * chartHeight;
  },

  // X축 좌표 계산 (인덱스 기반)
  getXByIndex: (i, total) => {
    const xLabelWidth = chartHelpers.getXLabelWidth();
    return CHART_CONFIG.padding.left + CHART_CONFIG.xLabelPadding + (i / (total - 1 || 1)) * xLabelWidth;
  },

  // Y축 틱 계산
  getYTicks: (yMin, yMax) => {
    const yRange = yMax - yMin;
    const step = Math.ceil(yRange / 3);
    const ticks = [];
    for (let t = yMin; t <= yMax; t += step) {
      ticks.push(Math.round(t));
    }
    if (ticks[ticks.length - 1] < yMax) ticks.push(yMax);
    return ticks;
  },

  // 그리드 라인 생성
  createGridLines: (yTicks, yMin, yMax) => {
    const { width, padding } = CHART_CONFIG;
    return yTicks.map(tick => {
      const y = chartHelpers.getY(tick, yMin, yMax);
      return `<line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />`;
    }).join('');
  },

  // Y축 라벨 생성
  createYLabels: (yTicks, yMin, yMax) => {
    const { padding } = CHART_CONFIG;
    return yTicks.map(tick => {
      const y = chartHelpers.getY(tick, yMin, yMax);
      return `<text class="chart-ylabel" x="${padding.left - 4}" y="${y + 3}" text-anchor="end">${tick}</text>`;
    }).join('');
  }
};

/**
 * 게임 대시보드 페이지 생성
 */
function generateGamePage(gameData) {
  const { name, slug = '', platforms = [], developer = '', icon = null, rankings = {}, rankHistory = [], realtimeRanks = {}, steamHistory = [], news = [], community = [], steam = null, youtube = [], mentions = [] } = gameData;

  // 플랫폼 체크
  const hasMobilePlatform = platforms.some(p => p === 'ios' || p === 'android');
  const hasPcPlatform = platforms.includes('pc') || platforms.includes('steam');
  const hasMobileRankings = Object.keys(rankings).length > 0;
  // 스팀 데이터 표시: PC 플랫폼이 있거나, 모바일 플랫폼이 없으면서 스팀 데이터가 있는 경우
  const hasSteamData = (hasPcPlatform || !hasMobilePlatform) && steam && (steam.currentPlayers || steam.rank || steam.salesRank);
  const isSteamOnly = !hasMobileRankings && hasSteamData;
  // 모바일 순위 섹션 표시 여부 (모바일 플랫폼이 있거나 모바일 순위 데이터가 있을 때)
  const showMobileRanking = hasMobilePlatform || hasMobileRankings;

  // 플랫폼 배지
  const platformBadges = platforms.map(p => {
    const labels = { ios: 'iOS', android: 'Android', pc: 'PC', ps5: 'PlayStation', xbox: 'Xbox', switch: 'Switch' };
    return `<span class="game-platform-badge">${labels[p] || p}</span>`;
  }).join('');

  // 게임 아이콘
  const iconHtml = icon
    ? `<img class="game-hero-icon" src="${icon}" alt="${name}" loading="lazy" onerror="this.style.display='none'">`
    : '';

  // 순위 섹션 - iOS/Android 그리드 + 서브탭
  function generateRankingsSection() {
    const entries = Object.entries(rankings);
    const hasMobileData = entries.length > 0;
    const hasSteamDataLocal = (hasPcPlatform || !hasMobilePlatform) && steam && (steam.currentPlayers || steam.rank || steam.salesRank);

    if (!hasMobileData && !hasSteamDataLocal) {
      return '<div class="game-empty">현재 순위 데이터가 없습니다</div>';
    }

    // 5개국 고정
    const regions = ['kr', 'jp', 'us', 'cn', 'tw'];
    const regionLabels = { kr: '한국', jp: '일본', us: '미국', cn: '중국', tw: '대만' };
    const regionFlags = { kr: '🇰🇷', jp: '🇯🇵', us: '🇺🇸', cn: '🇨🇳', tw: '🇹🇼' };

    // 데이터 매핑
    const rankData = { grossing: { ios: {}, android: {} }, free: { ios: {}, android: {} } };
    for (const [key, data] of entries) {
      const [region, platform, category] = key.split('-');
      if (rankData[category] && rankData[category][platform]) {
        rankData[category][platform][region] = data;
      }
    }

    // 국가별 행 렌더링 (실시간 데이터 우선 사용)
    function renderRows(platformData, platform, category) {
      // realtimeRanks 키는 aos 사용 (android → aos 변환)
      const realtimePlatform = platform === 'android' ? 'aos' : platform;

      // 해당 플랫폼/카테고리에서 가장 최근 날짜 찾기
      let latestDate = null;
      regions.forEach(r => {
        const key = `${realtimePlatform}-${r}-${category}`;
        const data = realtimeRanks[key] || [];
        if (data.length > 0) {
          const lastDate = data[data.length - 1].date;
          if (!latestDate || lastDate > latestDate) {
            latestDate = lastDate;
          }
        }
      });

      // 해당 플랫폼/카테고리에 실시간 데이터가 있는지 확인
      const hasRealtimeForPlatform = latestDate !== null;

      return regions.map(region => {
        // 실시간 데이터에서 마지막 값 가져오기
        const realtimeKey = `${realtimePlatform}-${region}-${category}`;
        const realtimeData = realtimeRanks[realtimeKey] || [];
        const lastRealtime = realtimeData.length > 0 ? realtimeData[realtimeData.length - 1] : null;

        // 실시간 데이터가 있는 플랫폼이면 실시간만 사용
        // 단, 마지막 데이터가 가장 최근 날짜와 같아야만 표시 (어제 데이터는 제외)
        const data = platformData[region];
        let rankVal;
        if (hasRealtimeForPlatform) {
          // 마지막 데이터가 가장 최근 날짜와 같으면 표시, 아니면 '-'
          rankVal = (lastRealtime && lastRealtime.date === latestDate) ? lastRealtime.rank : '-';
        } else {
          rankVal = data?.rank ?? '-';
        }
        const changeVal = data?.change || 0;
        const changeClass = changeVal > 0 ? 'up' : changeVal < 0 ? 'down' : '';
        const changeHtml = changeVal !== 0
          ? `<span class="game-rank-change ${changeClass}">${changeVal > 0 ? '▲' : '▼'}${Math.abs(changeVal)}</span>`
          : '';
        return `<div class="game-rank-country-row">
          <span class="game-rank-country-flag">${regionFlags[region]}</span>
          <span class="game-rank-country-name">${regionLabels[region]}</span>
          <span class="game-rank-country-value">${rankVal !== '-' ? rankVal : '-'}</span>
          ${changeHtml}
        </div>`;
      }).join('');
    }

    // 실시간 데이터 존재 여부
    const hasRealtimeData = Object.keys(realtimeRanks).length > 0;

    // 실시간 차트 생성 함수
    function createRealtimeChart(category) {
      // 공통 차트 설정 사용
      const { width, height, padding, xLabelPadding, regions: regionConfigs } = CHART_CONFIG;
      const chartWidth = chartHelpers.getChartWidth();
      const chartHeight = chartHelpers.getChartHeight();
      const xLabelWidth = chartHelpers.getXLabelWidth();

      function createMarketSvg(marketId) {
        // 해당 마켓의 모든 데이터 수집
        let allRanks = [];
        regionConfigs.forEach(r => {
          const key = marketId + '-' + r.id + '-' + category;
          const data = realtimeRanks[key] || [];
          data.forEach(d => allRanks.push(d.rank));
        });

        if (allRanks.length === 0) return '';

        const minRank = Math.min(...allRanks);
        const maxRank = Math.max(...allRanks);
        const range = maxRank - minRank || 1;
        const yPad = Math.max(1, Math.ceil(range * 0.1));
        const yMin = Math.max(1, minRank - yPad);
        const yMax = maxRank + yPad;

        // 날짜+시간 추출 (date + time으로 unique한 시점들)
        let dateTimeLabels = [];
        regionConfigs.forEach(r => {
          const key = marketId + '-' + r.id + '-' + category;
          const data = realtimeRanks[key] || [];
          data.forEach(d => {
            const dt = d.date + ' ' + d.time;
            if (!dateTimeLabels.includes(dt)) dateTimeLabels.push(dt);
          });
        });
        dateTimeLabels.sort();
        dateTimeLabels = dateTimeLabels.slice(-48); // 30분 간격 * 48 = 24시간

        // 마지막 시간 기준 (데이터가 이미 KST)
        const lastDt = dateTimeLabels[dateTimeLabels.length - 1];
        const [lastDateStr, lastTimeStr] = lastDt.split(' ');
        const lastKstDate = new Date(lastDateStr + 'T' + lastTimeStr + ':00');
        const lastKstHour = lastKstDate.getHours();

        // 시간 레이블 (데이터가 이미 KST)
        const kstLabels = dateTimeLabels.map(dt => {
          const [date, time] = dt.split(' ');
          const kstDate = new Date(date + 'T' + time + ':00');
          return String(kstDate.getHours()).padStart(2, '0') + ':00';
        });

        // X좌표를 24시간 범위 기준으로 계산 (마지막 KST 시간 기준)
        const getX = (dt) => {
          const [date, time] = dt.split(' ');
          const kstDate = new Date(date + 'T' + time + ':00');
          const hoursDiff = (lastKstDate - kstDate) / (60 * 60 * 1000);
          const pos = Math.max(0, Math.min(1, 1 - (hoursDiff / 24)));
          return padding.left + xLabelPadding + pos * xLabelWidth;
        };
        const getY = (rank) => chartHelpers.getY(rank, yMin, yMax);

        // Y축 그리드 및 라벨 (공통 헬퍼 사용)
        const yTicks = chartHelpers.getYTicks(yMin, yMax);
        const gridLines = chartHelpers.createGridLines(yTicks, yMin, yMax);
        const yLabels = chartHelpers.createYLabels(yTicks, yMin, yMax);

        // 4시간 간격 시간 포인트 계산 (X축 라벨 위치와 동일)
        const fourHourPoints = [];
        for (let i = 0; i < 7; i++) {
          const hoursBack = 24 - i * 4;
          const labelKstDate = new Date(lastKstDate.getTime() - hoursBack * 60 * 60 * 1000);
          const x = padding.left + xLabelPadding + (i / 6) * xLabelWidth;
          fourHourPoints.push({ kstTime: labelKstDate.getTime(), x });
        }

        // 국가별 라인
        const renderOrder = [...regionConfigs].reverse();
        let lines = '';
        let dots = '';
        let labels = '';

        renderOrder.forEach(region => {
          const key = marketId + '-' + region.id + '-' + category;
          const data = realtimeRanks[key] || [];
          const validPoints = [];

          dateTimeLabels.forEach((dt, i) => {
            const item = data.find(d => (d.date + ' ' + d.time) === dt);
            if (item) {
              // 24시간 범위 체크 (데이터가 이미 KST)
              const [date, time] = dt.split(' ');
              const kstDate = new Date(date + 'T' + time + ':00');
              const hoursDiff = (lastKstDate - kstDate) / (60 * 60 * 1000);
              if (hoursDiff >= 0 && hoursDiff <= 24) {
                validPoints.push({ kstTime: kstDate.getTime(), rank: item.rank, x: getX(dt), y: getY(item.rank) });
              }
            }
          });

          // 4시간 간격 점들 찾기
          const fourHourDataPoints = [];
          fourHourPoints.forEach(fp => {
            // 해당 시간에 가장 가까운 데이터 찾기 (±1시간 이내)
            let closest = null;
            let minDiff = Infinity;
            validPoints.forEach(p => {
              const diff = Math.abs(p.kstTime - fp.kstTime);
              if (diff < minDiff && diff <= 60 * 60 * 1000) { // 1시간 이내
                minDiff = diff;
                closest = p;
              }
            });
            if (closest) {
              fourHourDataPoints.push({ x: fp.x, y: closest.y, rank: closest.rank });
            }
          });

          // 4시간 간격 점들끼리 라인 연결
          if (fourHourDataPoints.length > 1) {
            const linePoints = fourHourDataPoints.map(p => p.x + ',' + p.y).join(' ');
            lines += '<polyline class="chart-line" data-region="' + region.id + '" style="stroke:' + region.color + '" points="' + linePoints + '" />';
          }

          // 4시간 간격 점 표시
          fourHourDataPoints.forEach(p => {
            dots += '<circle class="chart-dot" data-region="' + region.id + '" style="fill:' + region.color + '" cx="' + p.x + '" cy="' + p.y + '" r="2.5" />';
          });
          // 라벨은 나중에 그려서 항상 앞에 표시
          fourHourDataPoints.forEach(p => {
            const labelY = p.y < 20 ? p.y + 14 : p.y - 6;
            labels += '<text class="chart-rank-label" data-region="' + region.id + '" x="' + p.x + '" y="' + labelY + '" style="fill:' + region.color + '" text-anchor="middle">' + p.rank + '</text>';
          });
        });

        // X축 라벨 (KST 기준 4시간 간격 7개 - 전날 같은 시간부터 오늘까지)
        let xLabels = '';
        // xLabelPadding, xLabelWidth는 위에서 이미 선언됨
        for (let i = 0; i < 7; i++) {
          // 24시간 전부터 4시간 간격으로 시간 계산
          const hoursBack = 24 - i * 4;
          const labelKstDate = new Date(lastKstDate.getTime() - hoursBack * 60 * 60 * 1000);
          const h = labelKstDate.getHours();
          const d = labelKstDate.getDate();

          // X 좌표: 안쪽 여백 적용
          const x = padding.left + xLabelPadding + (i / 6) * xLabelWidth;

          // "08일18시" 형식 (띄어쓰기 제거)
          const label = String(d).padStart(2, '0') + '일' + String(h).padStart(2, '0') + '시';

          xLabels += '<text class="chart-xlabel" x="' + x + '" y="' + (height - 2) + '" text-anchor="middle">' + label + '</text>';
        }

        return '<svg class="trend-chart-svg realtime-chart-svg" data-market="' + marketId + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">' +
          gridLines + yLabels + xLabels + lines + dots + labels +
          '</svg>';
      }

      return '<div class="chart-market-container">' +
        '<div class="chart-market-svg active" data-market="ios">' + createMarketSvg('ios') + '</div>' +
        '<div class="chart-market-svg" data-market="aos">' + createMarketSvg('aos') + '</div>' +
        '</div>';
    }

    let html = '';

    // 모바일 순위 섹션
    if (hasMobileData) {
      html += '<div class="rank-trend-section realtime-rank-section">';

      // 탭 행: 왼쪽 [매출][인기], 오른쪽 [요약][실시간]
      html += '<div class="trend-tab-row">';
      html += '<div class="tab-group trend-tabs-left">';
      html += '<button class="tab-btn active" data-realtime-cat="grossing">매출</button>';
      html += '<button class="tab-btn" data-realtime-cat="free">인기</button>';
      html += '</div>';
      html += '<div class="tab-group trend-tabs-right">';
      html += '<button class="tab-btn active" data-realtime-view="summary">요약</button>';
      html += '<button class="tab-btn' + (hasRealtimeData ? '' : ' disabled') + '" data-realtime-view="realtime"' + (hasRealtimeData ? '' : ' disabled') + '>실시간</button>';
      html += '</div>';
      html += '</div>';

      // 실시간 뷰: 마켓 토글 + 범례
      const regionLabelsHtml = [
        { id: 'kr', label: '한국', color: '#FF4757' },
        { id: 'jp', label: '일본', color: '#2ED573' },
        { id: 'us', label: '미국', color: '#3742FA' },
        { id: 'cn', label: '중국', color: '#FFA502' },
        { id: 'tw', label: '대만', color: '#A55EEA' }
      ].map(r => '<span class="trend-legend-item active" data-legend="' + r.id + '"><span class="legend-dot" style="background:' + r.color + '"></span>' + r.label + '</span>').join('');

      html += '<div class="trend-legend-row realtime-legend-row" style="display:none;">';
      html += '<div class="trend-legend">' + regionLabelsHtml + '</div>';
      html += '<div class="trend-market-toggle">';
      html += '<button class="market-toggle-btn active" data-market-toggle="ios">iOS</button>';
      html += '<button class="market-toggle-btn" data-market-toggle="aos">Android</button>';
      html += '</div>';
      html += '</div>';

      // 요약 컨텐츠 (기존 테이블)
      for (const cat of ['grossing', 'free']) {
        const isActive = cat === 'grossing';
        html += '<div class="realtime-content' + (isActive ? ' active' : '') + '" data-realtime-cat="' + cat + '" data-realtime-view="summary">';
        html += '<div class="game-rank-grid">';
        html += '<div class="game-rank-col">';
        html += '<div class="game-rank-col-header"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="">iOS</div>';
        html += '<div class="game-rank-rows">' + renderRows(rankData[cat].ios, 'ios', cat) + '</div>';
        html += '</div>';
        html += '<div class="game-rank-col">';
        html += '<div class="game-rank-col-header"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="">Android</div>';
        html += '<div class="game-rank-rows">' + renderRows(rankData[cat].android, 'android', cat) + '</div>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
      }

      // 실시간 컨텐츠 (차트)
      if (hasRealtimeData) {
        for (const cat of ['grossing', 'free']) {
          html += '<div class="realtime-content" data-realtime-cat="' + cat + '" data-realtime-view="realtime">';
          html += createRealtimeChart(cat);
          html += '</div>';
        }
      }

      html += '</div>'; // realtime-rank-section
    }

    // 스팀 섹션
    if (hasSteamDataLocal) {
      html += `<div class="game-rank-section steam">
        <div class="game-rank-section-header">
          <span class="game-rank-section-icon">🎮</span>
          <span class="game-rank-section-title">Steam</span>
        </div>
        <div class="game-steam-inline">`;

      if (steam.currentPlayers) {
        html += `<div class="game-steam-stat-inline">
          <span class="game-steam-stat-label">현재 플레이어</span>
          <span class="game-steam-stat-value">${steam.currentPlayers.toLocaleString()}</span>
        </div>`;
      }
      if (steam.peakPlayers) {
        html += `<div class="game-steam-stat-inline">
          <span class="game-steam-stat-label">24h 피크</span>
          <span class="game-steam-stat-value">${steam.peakPlayers.toLocaleString()}</span>
        </div>`;
      }
      if (steam.rank) {
        html += `<div class="game-steam-stat-inline">
          <span class="game-steam-stat-label">동접 순위</span>
          <span class="game-steam-stat-value">${steam.rank}위</span>
        </div>`;
      }

      html += `</div></div>`;
    }

    return html;
  }

  // 스팀 전용 순위 섹션 (심플)
  function generateSteamRankingsSection() {
    if (!steam) return '<div class="game-empty">스팀 순위 데이터가 없습니다</div>';

    return `<div class="game-rank-mobile">
      <div class="game-rank-grid">
        <div class="game-rank-col game-rank-col-full">
          <div class="game-rank-col-header"><img src="https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=32" alt="">Steam</div>
          <div class="game-rank-rows">
            <div class="game-rank-country-row">
              <span class="game-rank-country-name">동접 순위</span>
              <span class="game-rank-country-value">${steam.rank || '-'}</span>
            </div>
            <div class="game-rank-country-row">
              <span class="game-rank-country-name">현재 접속자</span>
              <span class="game-rank-country-value">${steam.currentPlayers ? steam.currentPlayers.toLocaleString() : '-'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // 스팀 차트 섹션 생성 (type: 'ccu' 또는 'sales')
  function generateSteamChartSection(type) {
    if (!steamHistory || steamHistory.length === 0) {
      return '<div class="game-empty">데이터가 없습니다</div>';
    }

    const width = 400;
    const height = 200;
    const padding = { top: 6, right: 4, bottom: 18, left: 18 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const rankKey = type === 'ccu' ? 'ccuRank' : 'salesRank';
    const color = type === 'ccu' ? '#FF4757' : '#3B82F6';
    const sectionId = 'steam-' + type + '-section';

    // 일간 데이터
    function generateDailyData() {
      const sorted = [...steamHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];
      const byDate = new Map();
      for (const item of sorted) {
        if (!byDate.has(item.date)) byDate.set(item.date, []);
        byDate.get(item.date).push(item);
      }
      const result = [];
      for (const [date, items] of byDate) {
        const ranks = items.map(d => d[rankKey]).filter(v => v);
        if (ranks.length > 0) result.push({ date, rank: Math.min(...ranks) });
      }
      return result.slice(-7);
    }

    // 주간 데이터
    function generateWeeklyData() {
      const sorted = [...steamHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];
      const result = [];
      const latest = new Date(sorted[sorted.length - 1].date + 'T12:00:00');
      for (let w = 6; w >= 0; w--) {
        const weekEnd = new Date(latest);
        weekEnd.setDate(weekEnd.getDate() - (w * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        const weekData = sorted.filter(d => d.date >= weekStart.toISOString().slice(0,10) && d.date <= weekEnd.toISOString().slice(0,10));
        if (weekData.length === 0) continue;
        const ranks = weekData.map(d => d[rankKey]).filter(v => v);
        if (ranks.length > 0) result.push({ date: weekEnd.toISOString().slice(0,10), rank: Math.min(...ranks) });
      }
      return result;
    }

    // 월간 데이터
    function generateMonthlyData() {
      const sorted = [...steamHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];
      const result = [];
      const latest = new Date(sorted[sorted.length - 1].date + 'T12:00:00');
      for (let m = 6; m >= 0; m--) {
        const targetDate = new Date(latest);
        targetDate.setMonth(targetDate.getMonth() - m);
        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().slice(0,10);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().slice(0,10);
        const monthData = sorted.filter(d => d.date >= monthStart && d.date <= monthEnd);
        if (monthData.length === 0) continue;
        const ranks = monthData.map(d => d[rankKey]).filter(v => v);
        if (ranks.length > 0) result.push({ date: monthEnd, rank: Math.min(...ranks) });
      }
      return result;
    }

    const periods = [
      { id: 'daily', label: '일', data: generateDailyData() },
      { id: 'weekly', label: '주', data: generateWeeklyData() },
      { id: 'monthly', label: '월', data: generateMonthlyData() }
    ];

    // 차트 생성 함수
    function createChart(data) {
      if (data.length === 0) return '<div class="game-empty">데이터 없음</div>';
      let minRank = Infinity, maxRank = 0;
      data.forEach(d => {
        if (d.rank < minRank) minRank = d.rank;
        if (d.rank > maxRank) maxRank = d.rank;
      });
      if (minRank === Infinity) return '<div class="game-empty">데이터 없음</div>';

      const rangePadding = Math.max(5, Math.ceil((maxRank - minRank) * 0.15));
      const yMin = Math.max(1, minRank - rangePadding);
      const yMax = maxRank + rangePadding;
      const yRange = yMax - yMin || 1;

      const xLabelPadding = 16; // X축 라벨 영역 안쪽 여백
      const xLabelWidth = chartWidth - xLabelPadding * 2;
      const points = data.map((d, i) => ({
        x: padding.left + xLabelPadding + (i / Math.max(1, data.length - 1)) * xLabelWidth,
        y: padding.top + ((d.rank - yMin) / yRange) * chartHeight,
        rank: d.rank,
        date: d.date
      }));

      let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" class="game-chart-svg">';
      // 그리드
      const gridCount = 4;
      const gridStep = Math.ceil(yRange / gridCount);
      for (let i = 0; i <= gridCount; i++) {
        const val = Math.round(yMin + i * gridStep);
        const y = padding.top + ((val - yMin) / yRange) * chartHeight;
        svg += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2,2"/>';
        svg += '<text x="' + (padding.left - 4) + '" y="' + (y + 4) + '" fill="rgba(255,255,255,0.5)" font-size="10" text-anchor="end">' + val + '</text>';
      }
      // X축 라벨
      data.forEach((d, i) => {
        const x = padding.left + xLabelPadding + (i / Math.max(1, data.length - 1)) * xLabelWidth;
        svg += '<text class="chart-xlabel" x="' + x + '" y="' + (height - 2) + '" text-anchor="middle">' + d.date.slice(8) + '</text>';
      });
      // 라인
      if (points.length > 1) {
        const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
        svg += '<path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="2"/>';
      }
      // 점 먼저 그리기
      points.forEach(p => {
        svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="' + color + '"/>';
      });
      // 라벨은 나중에 그려서 항상 앞에 표시
      points.forEach(p => {
        const labelY = p.y < 20 ? p.y + 16 : p.y - 8;
        svg += '<text x="' + p.x + '" y="' + labelY + '" fill="' + color + '" font-size="12" text-anchor="middle" font-weight="600">' + p.rank + '</text>';
      });
      svg += '</svg>';
      return svg;
    }

    // 기간별 컨텐츠 생성
    let chartContents = '';
    periods.forEach((period, i) => {
      chartContents += '<div class="trend-content' + (i === 0 ? ' active' : '') + '" data-period="' + period.id + '">' + createChart(period.data) + '</div>';
    });

    return '<div class="rank-trend-section ' + sectionId + '">' +
      '<div class="trend-tab-row"><div class="tab-group trend-tabs-right">' +
      periods.map((p, i) => '<button class="tab-btn' + (i === 0 ? ' active' : '') + '" data-trend-period="' + p.id + '">' + p.label + '</button>').join('') +
      '</div></div><div class="trend-charts">' + chartContents + '</div></div>' +
      '<script>(function(){var s=document.querySelector(".' + sectionId + '");if(!s)return;var ap="daily";' +
      's.querySelectorAll("[data-trend-period]").forEach(function(b){b.addEventListener("click",function(){' +
      's.querySelectorAll("[data-trend-period]").forEach(function(x){x.classList.remove("active")});' +
      'b.classList.add("active");ap=b.dataset.trendPeriod;' +
      's.querySelectorAll(".trend-content").forEach(function(c){c.classList.toggle("active",c.dataset.period===ap)});' +
      '});});})();</script>';
  }

  // 매출 추이 차트 섹션 (서브탭 + 라인차트)
  function generateRankTrendSection() {
    if (!rankHistory || rankHistory.length === 0) {
      return '<div class="game-empty">순위 추이 데이터가 없습니다</div>';
    }

    const regions = [
      { id: 'kr', label: '한국', color: '#FF4757' },
      { id: 'jp', label: '일본', color: '#2ED573' },
      { id: 'us', label: '미국', color: '#3742FA' },
      { id: 'cn', label: '중국', color: '#FFA502' },
      { id: 'tw', label: '대만', color: '#A55EEA' }
    ];

    // SVG 라인차트 생성 함수 (iOS/Android 각각 별도 Y축)
    function createLineChart(data, category, periodId) {
      if (data.length === 0) return '<div class="game-empty">데이터가 없습니다</div>';

      // 공통 차트 설정 사용
      const { width, height, padding, xLabelPadding, regions } = CHART_CONFIG;
      const chartWidth = chartHelpers.getChartWidth();
      const chartHeight = chartHelpers.getChartHeight();
      const xLabelWidth = chartHelpers.getXLabelWidth();
      const regionIds = regions.map(r => r.id);

      // 마켓별 SVG 생성
      function createMarketSvg(marketId) {
        // 해당 마켓의 min/max 계산
        let minRank = Infinity, maxRank = 0;
        regionIds.forEach(regionId => {
          const key = `${category}-${marketId}-${regionId}`;
          data.forEach(d => {
            if (d[key]) {
              if (d[key] < minRank) minRank = d[key];
              if (d[key] > maxRank) maxRank = d[key];
            }
          });
        });

        if (minRank === Infinity) minRank = 1;
        if (maxRank === 0) maxRank = 100;

        const range = maxRank - minRank || 1;
        const yPad = Math.max(1, Math.ceil(range * 0.1));
        const yMin = Math.max(1, minRank - yPad);
        const yMax = maxRank + yPad;

        const getX = (i) => chartHelpers.getXByIndex(i, data.length);
        const getY = (rank) => chartHelpers.getY(rank, yMin, yMax);

        // Y축 그리드 및 라벨 (공통 헬퍼 사용)
        const yTicks = chartHelpers.getYTicks(yMin, yMax);
        const gridLines = chartHelpers.createGridLines(yTicks, yMin, yMax);
        const yLabels = chartHelpers.createYLabels(yTicks, yMin, yMax);

        // 국가별 라인 (렌더링 순서: 대만→중국→미국→일본→한국)
        const renderOrder = [...regions].reverse();
        let lines = '';
        let dots = '';
        let labels = '';

        renderOrder.forEach(region => {
          const key = `${category}-${marketId}-${region.id}`;
          const validPoints = [];

          data.forEach((d, i) => {
            if (d[key]) {
              validPoints.push({ i, rank: d[key], x: getX(i), y: getY(d[key]) });
            }
          });

          if (validPoints.length > 0) {
            if (validPoints.length > 1) {
              const linePoints = validPoints.map(p => `${p.x},${p.y}`).join(' ');
              lines += `<polyline class="chart-line" data-region="${region.id}" style="stroke:${region.color}" points="${linePoints}" />`;
            }
            // 점 먼저 그리기
            validPoints.forEach(p => {
              dots += `<circle class="chart-dot" data-region="${region.id}" style="fill:${region.color}" cx="${p.x}" cy="${p.y}" r="2.5" />`;
            });
            // 라벨은 나중에 그려서 항상 앞에 표시
            validPoints.forEach(p => {
              const labelY = p.y < 20 ? p.y + 14 : p.y - 6;
              labels += `<text class="chart-rank-label" data-region="${region.id}" style="fill:${region.color}" x="${p.x}" y="${labelY}" text-anchor="middle">${p.rank}</text>`;
            });
          }
        });

        // X축 라벨 (기간별 형식)
        let xLabels = '';
        data.forEach((d, i) => {
          if (d && d.date) {
            const x = getX(i);
            const month = parseInt(d.date.slice(5, 7), 10);
            const day = parseInt(d.date.slice(8, 10), 10);
            // monthly: "12월", daily/weekly: "12월8일"
            const label = periodId === 'monthly' ? `${month}월` : `${month}월${day}일`;
            xLabels += `<text class="chart-xlabel" x="${x}" y="${height - 2}" text-anchor="middle">${label}</text>`;
          }
        });

        return `<svg class="trend-chart-svg" data-market="${marketId}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
          ${gridLines}${lines}${dots}${labels}${yLabels}${xLabels}
        </svg>`;
      }

      // iOS, Android 각각 생성
      return `
        <div class="chart-market-container">
          <div class="chart-market-svg active" data-market="ios">${createMarketSvg('ios')}</div>
          <div class="chart-market-svg" data-market="aos">${createMarketSvg('aos')}</div>
        </div>
      `;
    }

    // 일간: 같은 날짜의 AM/PM 중 최고 성적 (최대 7일)
    function generateDailyData() {
      const sorted = [...rankHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];

      // 날짜별로 그룹화하고 최고 순위 계산
      const byDate = new Map();
      for (const item of sorted) {
        const date = item.date;
        if (!byDate.has(date)) {
          byDate.set(date, []);
        }
        byDate.get(date).push(item);
      }

      const result = [];
      for (const [date, items] of byDate) {
        const bestRanks = { date };
        const rankKeys = Object.keys(items[0]).filter(k => k !== 'date');

        for (const key of rankKeys) {
          const values = items.map(d => d[key]).filter(v => v !== undefined && v !== null);
          if (values.length > 0) {
            bestRanks[key] = Math.min(...values); // AM/PM 중 최고 순위
          }
        }

        if (Object.keys(bestRanks).length > 1) {
          result.push(bestRanks);
        }
      }

      return result.slice(-7); // 최근 7일
    }

    // 주간: 해당 주의 최고 성적 (가장 좋은 순위)
    function generateWeeklyData() {
      const sorted = [...rankHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];

      const result = [];
      const latest = new Date(sorted[sorted.length - 1].date + 'T12:00:00');

      for (let w = 6; w >= 0; w--) {
        const weekEnd = new Date(latest);
        weekEnd.setDate(weekEnd.getDate() - (w * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        const weekEndStr = weekEnd.toISOString().slice(0, 10);
        const weekStartStr = weekStart.toISOString().slice(0, 10);

        // 해당 주의 모든 데이터
        const weekData = sorted.filter(d => d.date >= weekStartStr && d.date <= weekEndStr);
        if (weekData.length === 0) continue;

        // 각 순위 키별로 최고 성적(최소값) 계산
        const bestRanks = { date: weekEndStr };
        const rankKeys = Object.keys(weekData[0]).filter(k => k !== 'date');

        for (const key of rankKeys) {
          const values = weekData.map(d => d[key]).filter(v => v !== undefined && v !== null);
          if (values.length > 0) {
            bestRanks[key] = Math.min(...values); // 가장 좋은 순위 (낮은 숫자)
          }
        }

        if (Object.keys(bestRanks).length > 1) {
          result.push(bestRanks);
        }
      }
      return result;
    }

    // 월간: 해당 월의 최고 성적 (가장 좋은 순위)
    function generateMonthlyData() {
      const sorted = [...rankHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) return [];

      const result = [];
      const latest = new Date(sorted[sorted.length - 1].date + 'T12:00:00');

      for (let m = 6; m >= 0; m--) {
        const targetDate = new Date(latest);
        targetDate.setMonth(targetDate.getMonth() - m);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();

        // 해당 월의 시작일과 마지막일
        const monthStart = new Date(year, month, 1).toISOString().slice(0, 10);
        const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);

        // 해당 월의 모든 데이터
        const monthData = sorted.filter(d => d.date >= monthStart && d.date <= monthEnd);
        if (monthData.length === 0) continue;

        // 각 순위 키별로 최고 성적(최소값) 계산
        const bestRanks = { date: monthEnd };
        const rankKeys = Object.keys(monthData[0]).filter(k => k !== 'date');

        for (const key of rankKeys) {
          const values = monthData.map(d => d[key]).filter(v => v !== undefined && v !== null);
          if (values.length > 0) {
            bestRanks[key] = Math.min(...values); // 가장 좋은 순위 (낮은 숫자)
          }
        }

        if (Object.keys(bestRanks).length > 1) {
          result.push(bestRanks);
        }
      }
      return result;
    }

    // 기간별 데이터 (실제 데이터만)
    const periods = [
      { id: 'daily', label: '일', data: generateDailyData() },    // 최근 7일 (실제 데이터)
      { id: 'weekly', label: '주', data: generateWeeklyData() },  // 7주 간격 샘플링
      { id: 'monthly', label: '월', data: generateMonthlyData() } // 7개월 간격 샘플링
    ];

    // 카테고리별 차트 생성
    const categories = [
      { id: 'grossing', label: '매출' },
      { id: 'free', label: '인기' }
    ];

    // 범례 (클릭 가능)
    const legend = regions.map(r =>
      `<span class="trend-legend-item active" data-legend="${r.id}"><span class="legend-dot" style="background:${r.color}"></span>${r.label}</span>`
    ).join('');

    // 마켓 토글 (iOS/AOS 스위치)
    const marketToggle = `
      <div class="trend-market-toggle">
        <button class="market-toggle-btn active" data-market-toggle="ios">iOS</button>
        <button class="market-toggle-btn" data-market-toggle="aos">Android</button>
      </div>
    `;

    // 모든 조합의 차트 컨텐츠 생성
    let chartContents = '';
    categories.forEach(cat => {
      periods.forEach(period => {
        const isFirst = cat.id === 'grossing' && period.id === 'daily';
        chartContents += `
          <div class="trend-content${isFirst ? ' active' : ''}" data-cat="${cat.id}" data-period="${period.id}">
            ${createLineChart(period.data, cat.id, period.id)}
          </div>
        `;
      });
    });

    return `
      <div class="rank-trend-section mobile-trend-section">
        <div class="trend-tab-row">
          <div class="tab-group trend-tabs-left">
            ${categories.map((cat, i) =>
              `<button class="tab-btn${i === 0 ? ' active' : ''}" data-trend-cat="${cat.id}">${cat.label}</button>`
            ).join('')}
          </div>
          <div class="tab-group trend-tabs-right">
            ${periods.map((p, i) =>
              `<button class="tab-btn${i === 0 ? ' active' : ''}" data-trend-period="${p.id}">${p.label}</button>`
            ).join('')}
          </div>
        </div>
        <div class="trend-legend-row">
          <div class="trend-legend">${legend}</div>
          ${marketToggle}
        </div>
        <div class="trend-charts">${chartContents}</div>
      </div>
      <script>
        (function() {
          const section = document.querySelector('.mobile-trend-section');
          if (!section) return;

          let activeCat = 'grossing', activePeriod = 'daily';
          const activeRegions = new Set(['kr', 'jp', 'us', 'cn', 'tw']);
          let activeMarket = 'ios';

          function updateChart() {
            section.querySelectorAll('.trend-content').forEach(c => c.classList.remove('active'));
            const target = section.querySelector('.trend-content[data-cat="' + activeCat + '"][data-period="' + activePeriod + '"]');
            if (target) target.classList.add('active');
          }

          function updateVisibility() {
            // 마켓별 SVG 컨테이너 토글
            section.querySelectorAll('.chart-market-svg').forEach(el => {
              const isActive = el.dataset.market === activeMarket;
              el.classList.toggle('active', isActive);
            });
            // 국가별 요소 토글
            section.querySelectorAll('[data-region]').forEach(el => {
              const region = el.dataset.region;
              const visible = activeRegions.has(region);
              el.style.opacity = visible ? '1' : '0';
              el.style.pointerEvents = visible ? 'auto' : 'none';
            });
          }

          // 카테고리 탭
          section.querySelectorAll('[data-trend-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
              section.querySelectorAll('[data-trend-cat]').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              activeCat = btn.dataset.trendCat;
              updateChart();
            });
          });

          // 기간 탭
          section.querySelectorAll('[data-trend-period]').forEach(btn => {
            btn.addEventListener('click', () => {
              section.querySelectorAll('[data-trend-period]').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              activePeriod = btn.dataset.trendPeriod;
              updateChart();
            });
          });

          // 범례 클릭 (국가 토글)
          section.querySelectorAll('[data-legend]').forEach(item => {
            item.addEventListener('click', () => {
              const region = item.dataset.legend;
              if (activeRegions.has(region)) {
                activeRegions.delete(region);
                item.classList.remove('active');
              } else {
                activeRegions.add(region);
                item.classList.add('active');
              }
              updateVisibility();
            });
          });

          // 마켓 토글 (iOS/Android 전환)
          section.querySelectorAll('[data-market-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
              const market = btn.dataset.marketToggle;
              if (activeMarket !== market) {
                activeMarket = market;
                section.querySelectorAll('[data-market-toggle]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateVisibility();
              }
            });
          });

          // 초기 visibility 설정
          updateVisibility();
        })();
      </script>
    `;
  }

  // 뉴스 섹션
  function generateNewsSection() {
    if (!news || news.length === 0) {
      return '<div class="game-empty">관련 뉴스가 없습니다</div>';
    }
    return `<div class="game-news-list">${news.slice(0, 5).map(item => `
      <a class="game-news-item" href="${item.link}" target="_blank" rel="noopener">
        <span class="game-news-title">${item.title}</span>
        <span class="game-news-meta">${item.source || ''}</span>
      </a>
    `).join('')}</div>`;
  }

  // 커뮤니티 섹션
  function generateCommunitySection() {
    if (!community || community.length === 0) {
      return '<div class="game-empty">커뮤니티 게시물이 없습니다</div>';
    }
    return `<div class="game-community-list">${community.slice(0, 5).map(post => `
      <a class="game-community-item" href="${post.link}" target="_blank" rel="noopener">
        <span class="game-community-title">${post.title}</span>
        <span class="game-community-meta">${post.source || ''}</span>
      </a>
    `).join('')}</div>`;
  }

  // 스팀 섹션
  function generateSteamSection() {
    if (!steam) return '<div class="game-empty">스팀 데이터가 없습니다</div>';
    return `<div class="game-steam-stats">
      ${steam.currentPlayers ? `<div class="game-steam-stat"><span class="game-steam-value">${steam.currentPlayers.toLocaleString()}</span><span class="game-steam-label">현재 플레이어</span></div>` : ''}
      ${steam.peakPlayers ? `<div class="game-steam-stat"><span class="game-steam-value">${steam.peakPlayers.toLocaleString()}</span><span class="game-steam-label">피크 플레이어</span></div>` : ''}
      ${steam.rank ? `<div class="game-steam-stat"><span class="game-steam-value">${steam.rank}위</span><span class="game-steam-label">플레이어 순위</span></div>` : ''}
    </div>`;
  }

  // 유튜브 섹션
  function generateYoutubeSection() {
    if (!youtube || youtube.length === 0) {
      return '<div class="game-empty">관련 유튜브 영상이 없습니다</div>';
    }
    return `<div class="game-youtube-grid">${youtube.slice(0, 4).map(video => `
      <a class="game-youtube-item" href="${video.link}" target="_blank" rel="noopener">
        <div class="game-youtube-thumb"><img src="${video.thumbnail}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>
        <div class="game-youtube-info">
          <span class="game-youtube-title">${video.title}</span>
          <span class="game-youtube-channel">${video.channel}</span>
        </div>
      </a>
    `).join('')}</div>`;
  }

  // 리포트 Mentions 섹션 (전체/주간/월간 탭)
  function generateMentionsSection(wideLayout = false) {
    const containerClass = wideLayout ? 'gm-container gm-container-wide' : 'gm-container';
    const itemsClass = wideLayout ? 'gm-items gm-items-grid' : 'gm-items';

    const emptyTabsHtml = `
      <div class="tab-group">
        <button class="tab-btn active" data-gm-period="all">전체</button>
        <button class="tab-btn" data-gm-period="weekly">주간</button>
        <button class="tab-btn" data-gm-period="monthly">월간</button>
      </div>
    `;

    if (!mentions || mentions.length === 0) {
      return `<div class="${containerClass}">
        <div class="gm-tab-row">${emptyTabsHtml}</div>
        <div class="game-empty">리포트 인용이 없습니다</div>
      </div>`;
    }

    const typeLabels = {
      ranking: '순위',
      community: '커뮤니티',
      issue: '이슈',
      metric: '지표',
      streaming: '스트리밍',
      mvp: 'MVP',
      stock: '주가',
      industry: '업계',
      global: '글로벌',
      release: '출시'
    };

    // 기간별 필터링을 위한 날짜 계산
    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

    const toDateStr = (d) => d.toISOString().slice(0, 10);

    // 비교 가능한 날짜 추출 (주간 형식일 때는 종료일 기준)
    const getComparableDate = (dateStr) => {
      if (!dateStr) return '';
      if (dateStr.includes('~')) {
        return dateStr.split('~')[1].trim();
      }
      return dateStr;
    };

    // 각 아이템 렌더링 함수
    function renderItem(m) {
      let dateStr = '';
      if (m.date) {
        // 주간 날짜 형식 처리 (예: "2025-11-24 ~ 2025-11-30" → "11.24~11.30")
        if (m.date.includes('~')) {
          const parts = m.date.split('~').map(s => s.trim());
          dateStr = parts.map(p => p.slice(5).replace('-', '.')).join('~');
        } else {
          dateStr = m.date.slice(5).replace('-', '.');
        }
      }

      // 순위 타입일 경우 추이 표시
      let rankingBadge = '';
      if (m.type === 'ranking' && m.rank !== undefined) {
        const changeClass = m.change > 0 ? 'up' : m.change < 0 ? 'down' : '';
        const changeText = m.change ? (m.change > 0 ? `+${m.change}` : m.change) : '';
        const prevRankText = m.prevRank ? `${m.prevRank}위 → ` : '';
        rankingBadge = `<span class="gm-rank-badge ${changeClass}">${m.platform || ''} ${prevRankText}${m.rank}위${changeText ? ` (${changeText})` : ''}</span>`;
      }

      return `<div class="gm-item" data-type="${m.type}" data-date="${m.date}">
        <div class="gm-item-header">
          <span class="gm-item-title">${m.title || ''}</span>
          <span class="gm-item-date">${dateStr}</span>
        </div>
        <div class="gm-item-desc">${m.desc || ''}</div>
      </div>`;
    }

    // 기간별 아이템 필터링 (주간 형식은 종료일 기준)
    const weeklyItems = mentions.filter(m => getComparableDate(m.date) >= toDateStr(weekAgo));
    const monthlyItems = mentions.filter(m => getComparableDate(m.date) >= toDateStr(monthAgo));

    // 전체/주간/월간 탭 + 페이지네이션 컨트롤
    const tabsHtml = `
      <div class="tab-group">
        <button class="tab-btn active" data-gm-period="all">전체</button>
        <button class="tab-btn" data-gm-period="weekly">주간</button>
        <button class="tab-btn" data-gm-period="monthly">월간</button>
      </div>
      <div class="gm-pagination">
        <button class="gm-page-btn gm-prev" aria-label="이전">‹</button>
        <span class="gm-page-index">1/1</span>
        <button class="gm-page-btn gm-next" aria-label="다음">›</button>
      </div>
    `;

    // 데이터 없으면 전체로 폴백
    const weeklyData = weeklyItems.length > 0 ? weeklyItems : mentions;
    const monthlyData = monthlyItems.length > 0 ? monthlyItems : mentions;

    return `
      <div class="${containerClass}" data-all-count="${mentions.length}" data-weekly-count="${weeklyData.length}" data-monthly-count="${monthlyData.length}">
        <div class="gm-tab-row">${tabsHtml}</div>
        <div class="gm-period-content active" data-gm-content="all">
          <div class="${itemsClass}">${mentions.map(renderItem).join('')}</div>
        </div>
        <div class="gm-period-content" data-gm-content="weekly">
          <div class="${itemsClass}">${weeklyData.map(renderItem).join('')}</div>
        </div>
        <div class="gm-period-content" data-gm-content="monthly">
          <div class="${itemsClass}">${monthlyData.map(renderItem).join('')}</div>
        </div>
      </div>
    `;
  }

  // SVG 아이콘
  const icons = {
    rankings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>',
    community: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/></svg>',
    steam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h.01M18 12h.01"/><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 6v12"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    mentions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
  };

  const content = `
    <section class="section active" id="game">
      ${topAdMobile}
      <div class="game-page">
        ${topAdPc}
        <h1 class="visually-hidden">${name} 매출, ${hasMobilePlatform ? '모바일 게임 순위' : '게임 순위'}, 뉴스</h1>
      <!-- 게임 히어로 -->
      <div class="home-card game-hero">
        <div class="game-hero-content">
          ${iconHtml}
          <div class="game-hero-info">
            <div class="game-hero-title">${name}</div>
            ${developer ? `<div class="game-hero-developer">${developer}</div>` : ''}
            ${platforms.length > 0 ? `<div class="game-hero-platforms">${platformBadges}</div>` : ''}
          </div>
          <a href="/games/" class="game-back-btn" title="게임 DB로 돌아가기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </a>
          ${isSteamOnly && steam ? `
          <div class="game-hero-stats">
            <div class="game-hero-stat stat-ccu">
              <span class="game-hero-stat-label">동접 순위</span>
              <span class="game-hero-stat-value">${steam.rank || '-'}</span>
            </div>
            <div class="game-hero-stat stat-sales">
              <span class="game-hero-stat-label">판매 순위</span>
              <span class="game-hero-stat-value">${steam.salesRank || '-'}</span>
            </div>
            <div class="game-hero-stat stat-players">
              <span class="game-hero-stat-label">현재 접속자</span>
              <span class="game-hero-stat-value">${steam.currentPlayers ? steam.currentPlayers.toLocaleString() : '-'}</span>
            </div>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="game-grid">
        ${isSteamOnly ? `
        <!-- 스팀 게임 순위 -->
        <div class="home-card">
          <div class="home-card-header">
            <h2 class="home-card-title">${name} 스팀 게임 순위</h2>
          </div>
          <div class="home-card-body">${generateSteamChartSection('ccu')}</div>
        </div>
        <!-- 스팀 게임 순위 히스토리 -->
        <div class="home-card">
          <div class="home-card-header">
            <h2 class="home-card-title">${name} 스팀 게임 순위 히스토리</h2>
          </div>
          <div class="home-card-body">${generateSteamChartSection('sales')}</div>
        </div>
        ` : showMobileRanking ? `
        <!-- 모바일 게임 순위 카드 -->
        <div class="home-card">
          <div class="home-card-header">
            <h2 class="home-card-title">${name} 모바일 게임 순위</h2>
          </div>
          <div class="home-card-body">${generateRankingsSection()}</div>
        </div>

        <!-- 모바일 게임 순위 히스토리 카드 -->
        <div class="home-card">
          <div class="home-card-header">
            <h2 class="home-card-title">${name} 모바일 게임 순위 히스토리</h2>
          </div>
          <div class="home-card-body">${generateRankTrendSection()}</div>
        </div>
        ` : ''}

        <!-- 트렌드 리포트 상단 광고 (모바일 먼저 배치 - CLS 방지) -->
        ${SHOW_ADS ? `
        <div class="ad-slot ad-slot-section ad-slot--rectangle mobile-only ad-slot--no-reserve">
          <ins class="adsbygoogle" style="display:block;width:336px;height:280px;margin:0 auto" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${AD_SLOTS.rectangle3}"></ins>
        </div>
        <div class="ad-slot ad-slot-section ad-slot--horizontal pc-only home-card-full">
          <ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="ca-pub-9477874183990825" data-ad-slot="${AD_SLOTS.horizontal2}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
        </div>
        ` : ''}

        <!-- 뉴스 (풀 너비 2그리드) -->
        <div class="home-card home-card-full">
          <div class="home-card-header">
            <h2 class="home-card-title">${name} 뉴스</h2>
          </div>
          <div class="home-card-body">${generateMentionsSection(true)}</div>
        </div>
      </div>
    </div>
    </section>
  `;

  const pageScripts = `<script>
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => document.documentElement.classList.add('fonts-loaded'));
    } else {
      setTimeout(() => document.documentElement.classList.add('fonts-loaded'), 100);
    }
    if (typeof twemoji !== 'undefined') {
      twemoji.parse(document.body, { folder: 'svg', ext: '.svg' });
    }

    // 최근 본 게임 저장
    (function() {
      const RECENT_KEY = 'gamerscrawl_recent_searches';
      const MAX_RECENT = 8;
      const gameInfo = { name: '${name.replace(/'/g, "\\'")}', slug: '${slug}', icon: '${icon || ''}' };
      try {
        let recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
        recent = recent.filter(g => g.slug !== gameInfo.slug);
        recent.unshift(gameInfo);
        recent = recent.slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      } catch (e) {}
    })();

    // 실시간 모바일 순위 탭 전환
    (function() {
      const section = document.querySelector('.realtime-rank-section');
      if (!section) return;

      let activeCat = 'grossing';
      let activeView = 'summary';
      let activeMarket = 'ios';
      const activeRegions = new Set(['kr', 'jp', 'us', 'cn', 'tw']);

      const legendRow = section.querySelector('.realtime-legend-row');

      function updateContent() {
        section.querySelectorAll('.realtime-content').forEach(c => {
          const isCat = c.dataset.realtimeCat === activeCat;
          const isView = c.dataset.realtimeView === activeView;
          c.classList.toggle('active', isCat && isView);
        });
        // 실시간 뷰일 때만 범례 표시
        if (legendRow) {
          legendRow.style.display = activeView === 'realtime' ? 'flex' : 'none';
        }
      }

      function updateMarket() {
        section.querySelectorAll('.chart-market-svg').forEach(el => {
          el.classList.toggle('active', el.dataset.market === activeMarket);
        });
      }

      function updateRegions() {
        section.querySelectorAll('[data-region]').forEach(el => {
          const visible = activeRegions.has(el.dataset.region);
          el.style.opacity = visible ? '1' : '0';
          el.style.pointerEvents = visible ? 'auto' : 'none';
        });
      }

      // 카테고리 탭 (매출/인기)
      section.querySelectorAll('[data-realtime-cat]').forEach(tab => {
        if (tab.tagName === 'BUTTON') {
          tab.addEventListener('click', () => {
            activeCat = tab.dataset.realtimeCat;
            section.querySelectorAll('[data-realtime-cat]').forEach(t => {
              if (t.tagName === 'BUTTON') t.classList.toggle('active', t.dataset.realtimeCat === activeCat);
            });
            updateContent();
          });
        }
      });

      // 뷰 탭 (요약/실시간)
      section.querySelectorAll('[data-realtime-view]').forEach(tab => {
        if (tab.tagName === 'BUTTON' && !tab.disabled) {
          tab.addEventListener('click', () => {
            activeView = tab.dataset.realtimeView;
            section.querySelectorAll('[data-realtime-view]').forEach(t => {
              if (t.tagName === 'BUTTON') t.classList.toggle('active', t.dataset.realtimeView === activeView);
            });
            updateContent();
          });
        }
      });

      // 마켓 토글 (iOS/Android)
      section.querySelectorAll('[data-market-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeMarket = btn.dataset.marketToggle;
          section.querySelectorAll('[data-market-toggle]').forEach(b => {
            b.classList.toggle('active', b.dataset.marketToggle === activeMarket);
          });
          updateMarket();
        });
      });

      // 범례 클릭 (국가 토글)
      section.querySelectorAll('.trend-legend-item').forEach(item => {
        item.addEventListener('click', () => {
          const region = item.dataset.legend;
          if (activeRegions.has(region)) {
            if (activeRegions.size > 1) {
              activeRegions.delete(region);
              item.classList.remove('active');
            }
          } else {
            activeRegions.add(region);
            item.classList.add('active');
          }
          updateRegions();
        });
      });

      updateContent();
      updateMarket();
      updateRegions();
    })();

    // 트렌드 리포트 전체/주간/월간 탭 + 페이지네이션
    (function() {
      const container = document.querySelector('.gm-container');
      if (!container) return;

      const tabs = container.querySelectorAll('[data-gm-period]');
      const contents = container.querySelectorAll('[data-gm-content]');
      const prevBtn = container.querySelector('.gm-prev');
      const nextBtn = container.querySelector('.gm-next');
      const pageIndex = container.querySelector('.gm-page-index');

      // PC: 6개, 모바일: 3개
      const getPageSize = () => window.innerWidth <= 768 ? 3 : 6;
      let currentPage = { all: 0, weekly: 0, monthly: 0 };
      let currentPeriod = 'all';

      function updatePagination() {
        const activeContent = container.querySelector('[data-gm-content="' + currentPeriod + '"]');
        if (!activeContent) return;

        const items = activeContent.querySelectorAll('.gm-item');
        const pageSize = getPageSize();
        const totalPages = Math.ceil(items.length / pageSize) || 1;
        const page = currentPage[currentPeriod];

        // 아이템 표시/숨김
        items.forEach((item, i) => {
          const start = page * pageSize;
          const end = start + pageSize;
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });

        // 인덱스 업데이트
        pageIndex.textContent = (page + 1) + '/' + totalPages;

        // 버튼 활성화
        prevBtn.disabled = page <= 0;
        nextBtn.disabled = page >= totalPages - 1;
      }

      // 탭 전환
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          currentPeriod = tab.dataset.gmPeriod;
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          contents.forEach(c => c.classList.toggle('active', c.dataset.gmContent === currentPeriod));
          updatePagination();
        });
      });

      // 페이지 이동
      prevBtn.addEventListener('click', () => {
        if (currentPage[currentPeriod] > 0) {
          currentPage[currentPeriod]--;
          updatePagination();
        }
      });
      nextBtn.addEventListener('click', () => {
        const activeContent = container.querySelector('[data-gm-content="' + currentPeriod + '"]');
        const items = activeContent.querySelectorAll('.gm-item');
        const totalPages = Math.ceil(items.length / getPageSize());
        if (currentPage[currentPeriod] < totalPages - 1) {
          currentPage[currentPeriod]++;
          updatePagination();
        }
      });

      // 화면 리사이즈 시 재계산
      window.addEventListener('resize', () => {
        Object.keys(currentPage).forEach(k => currentPage[k] = 0);
        updatePagination();
      });

      // 초기화
      updatePagination();
    })();
  </script>`;

  // 멘션 없는 페이지는 noindex (thin content 방지)
  const hasMentions = mentions && mentions.length > 0;

  // 플랫폼별 SEO 메타 데이터
  const seoTitle = hasMobilePlatform
    ? `${name} 매출, 모바일 게임 순위, 뉴스`
    : `${name} 매출, 게임 순위, 뉴스`;

  const seoDescription = hasMobilePlatform
    ? `${name} 매출, 모바일 게임 순위와 뉴스, 히스토리를 한눈에.`
    : `${name} 매출, 스팀 게임 순위와 뉴스, 히스토리를 한눈에.`;

  const seoKeywords = hasMobilePlatform
    ? `${name}, ${name} 매출, ${name} 순위, 모바일 게임 순위, ${name} 앱스토어, ${name} 플레이스토어, 앱스토어 순위, 플레이스토어 순위, 앱스토어 매출 순위, 플레이스토어 매출 순위, 게임 뉴스`
    : `${name}, ${name} 매출, ${name} 순위, ${name} 스팀, 게임 순위, 스팀 게임 순위, 스팀 매출 순위, 스팀 인기 순위, 게임 뉴스`;

  return wrapWithLayout(content, {
    currentPage: 'game',
    title: seoTitle,
    description: seoDescription,
    keywords: seoKeywords,
    canonical: `https://gamerscrawl.com/games/${slug || encodeURIComponent(name.replace(/\s+/g, '-').toLowerCase())}/`,
    pageScripts,
    noindex: !hasMentions
  });
}

module.exports = { generateGamePage };
