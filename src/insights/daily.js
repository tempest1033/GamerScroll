const fs = require('fs');
const path = require('path');

const HISTORY_DIR = './history';

/**
 * 어제 날짜 문자열 반환
 */
function getYesterdayDate() {
  const now = new Date();
  // KST (UTC+9) 기준
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  kst.setDate(kst.getDate() - 1);
  return kst.toISOString().split('T')[0];
}

/**
 * 오늘 날짜 문자열 반환
 */
function getTodayDate() {
  const now = new Date();
  // KST (UTC+9) 기준
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kst.toISOString().split('T')[0];
}

/**
 * 히스토리 파일 로드
 * @param {string} date - YYYY-MM-DD 형식
 */
function loadHistory(date) {
  try {
    const filename = `${date}.json`;
    const filePath = path.join(HISTORY_DIR, filename);
    if (fs.existsSync(filePath)) {
      console.log(`📂 히스토리 로드: ${filename}`);
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`⚠️ 히스토리 로드 실패: ${date}`, err.message);
  }
  return null;
}

/**
 * 순위 변동 분석 (iOS/Android 매출 순위)
 */
function analyzeRankingChanges(todayRankings, yesterdayRankings, country = 'kr', limit = 20) {
  const changes = { ios: [], android: [] };

  ['ios', 'android'].forEach(platform => {
    const todayList = todayRankings?.grossing?.[country]?.[platform] || [];
    const yesterdayList = yesterdayRankings?.grossing?.[country]?.[platform] || [];

    // 어제 순위 맵 생성
    const yesterdayMap = {};
    yesterdayList.forEach((app, idx) => {
      yesterdayMap[app.title] = idx + 1;
    });

    // 오늘 순위와 비교
    todayList.slice(0, limit).forEach((app, idx) => {
      const todayRank = idx + 1;
      const yesterdayRank = yesterdayMap[app.title];

      let change = 0;
      let status = 'same';

      if (!yesterdayRank) {
        status = 'new';
      } else {
        change = yesterdayRank - todayRank;
        if (change > 0) status = 'up';
        else if (change < 0) status = 'down';
      }

      changes[platform].push({
        rank: todayRank,
        title: app.title,
        developer: app.developer,
        icon: app.icon,
        change,
        status,
        yesterdayRank
      });
    });
  });

  return changes;
}

/**
 * Steam 순위 변동 분석
 */
function analyzeSteamChanges(todaySteam, yesterdaySteam, limit = 20) {
  const todayList = todaySteam?.mostPlayed || [];
  const yesterdayList = yesterdaySteam?.mostPlayed || [];

  const yesterdayMap = {};
  yesterdayList.forEach((game, idx) => {
    yesterdayMap[game.name] = { rank: idx + 1, ccu: game.ccu };
  });

  return todayList.slice(0, limit).map((game, idx) => {
    const todayRank = idx + 1;
    const yesterday = yesterdayMap[game.name];

    let change = 0;
    let status = 'same';
    let ccuChange = 0;

    if (!yesterday) {
      status = 'new';
    } else {
      change = yesterday.rank - todayRank;
      ccuChange = (game.ccu || 0) - (yesterday.ccu || 0);
      if (change > 0) status = 'up';
      else if (change < 0) status = 'down';
    }

    return {
      rank: todayRank,
      name: game.name,
      ccu: game.ccu,
      ccuChange,
      change,
      status,
      image: game.image || game.img
    };
  });
}

/**
 * 뉴스 하이라이트 추출
 */
function extractNewsHighlights(news, limit = 5) {
  const highlights = [];
  const sources = ['inven', 'ruliweb', 'gamemeca', 'thisisgame'];

  sources.forEach(source => {
    const items = news?.[source] || [];
    items.slice(0, 2).forEach(item => {
      highlights.push({
        source,
        title: item.title,
        link: item.link,
        thumbnail: item.thumbnail
      });
    });
  });

  return highlights.slice(0, limit);
}

/**
 * 커뮤니티 핫토픽 추출
 */
function extractCommunityHot(community, limit = 5) {
  const hot = [];
  const sources = ['ruliweb', 'arca', 'dcinside', 'inven'];

  sources.forEach(source => {
    const items = community?.[source] || [];
    items.slice(0, 2).forEach(item => {
      hot.push({
        source,
        title: item.title,
        link: item.link,
        channel: item.channel
      });
    });
  });

  return hot.slice(0, limit);
}

/**
 * 주요 변동 요약 생성
 */
function generateSummary(mobileChanges, steamChanges) {
  const summary = [];

  // iOS 급상승 게임
  const iosRisers = mobileChanges.ios.filter(g => g.status === 'up' && g.change >= 3).slice(0, 3);
  iosRisers.forEach(g => {
    summary.push(`iOS: "${g.title}" ${g.change}단계 상승 (현재 ${g.rank}위)`);
  });

  // iOS 신규 진입
  const iosNew = mobileChanges.ios.filter(g => g.status === 'new').slice(0, 2);
  iosNew.forEach(g => {
    summary.push(`iOS: "${g.title}" TOP${mobileChanges.ios.length} 신규 진입 (${g.rank}위)`);
  });

  // Android 급상승
  const androidRisers = mobileChanges.android.filter(g => g.status === 'up' && g.change >= 3).slice(0, 3);
  androidRisers.forEach(g => {
    summary.push(`Android: "${g.title}" ${g.change}단계 상승 (현재 ${g.rank}위)`);
  });

  // Steam 신규 진입
  const steamNew = steamChanges.filter(g => g.status === 'new').slice(0, 2);
  steamNew.forEach(g => {
    summary.push(`Steam: "${g.name}" TOP${steamChanges.length} 신규 진입 (${g.rank}위)`);
  });

  return summary;
}

/**
 * 데일리 인사이트 생성
 */
function generateDailyInsight(todayData, yesterdayData) {
  const today = getTodayDate();

  // 순위 변동 분석 (TOP 100)
  const mobileChangesKR = analyzeRankingChanges(
    todayData.rankings,
    yesterdayData?.rankings,
    'kr',
    100
  );

  const mobileChangesUS = analyzeRankingChanges(
    todayData.rankings,
    yesterdayData?.rankings,
    'us',
    100
  );

  const steamChanges = analyzeSteamChanges(
    todayData.steam,
    yesterdayData?.steam,
    100
  );

  // 하이라이트
  const newsHighlights = extractNewsHighlights(todayData.news);
  const communityHot = extractCommunityHot(todayData.community);

  // 요약
  const summary = generateSummary(mobileChangesKR, steamChanges);

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    hasYesterdayData: !!yesterdayData,
    summary,
    mobile: {
      kr: mobileChangesKR,
      us: mobileChangesUS
    },
    steam: steamChanges,
    news: newsHighlights,
    community: communityHot
  };
}

/**
 * 인사이트 리포트 HTML 생성
 */
function generateInsightHTML(insight) {
  const { date, summary, mobile, steam, news, community, hasYesterdayData, ai } = insight;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  };

  const getWeekInfo = (dateStr) => {
    const d = new Date(dateStr);
    const weekNum = Math.ceil(d.getDate() / 7);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${year}년 ${month}월 ${weekNum}주차`;
  };

  const renderChangeIcon = (status, change) => {
    if (status === 'new') return '<span class="change new">NEW</span>';
    if (status === 'up') return `<span class="change up">▲${change}</span>`;
    if (status === 'down') return `<span class="change down">▼${Math.abs(change)}</span>`;
    return '<span class="change same">-</span>';
  };

  const summaryHTML = summary.length > 0
    ? summary.map(s => `<li>${s}</li>`).join('')
    : '<li>어제 데이터가 없어 변동 분석이 제한됩니다.</li>';

  const mobileKRHTML = mobile.kr.ios.slice(0, 10).map(g => `
    <tr>
      <td class="rank">${g.rank}</td>
      <td class="icon"><img src="${g.icon}" alt="" onerror="this.style.display='none'"></td>
      <td class="title">${g.title}</td>
      <td class="change-cell">${renderChangeIcon(g.status, g.change)}</td>
    </tr>
  `).join('');

  const steamHTML = steam.slice(0, 10).map(g => `
    <tr>
      <td class="rank">${g.rank}</td>
      <td class="icon"><img src="${g.image}" alt="" onerror="this.style.display='none'"></td>
      <td class="title">${g.name}</td>
      <td class="ccu">${g.ccu?.toLocaleString() || '-'}</td>
      <td class="change-cell">${renderChangeIcon(g.status, g.change)}</td>
    </tr>
  `).join('');

  const newsHTML = news.map(n => `
    <a href="${n.link}" target="_blank" class="news-item">
      <span class="source">${n.source}</span>
      <span class="title">${n.title}</span>
    </a>
  `).join('');

  const communityHTML = community.map(c => `
    <a href="${c.link}" target="_blank" class="community-item">
      <span class="source">${c.source}</span>
      <span class="title">${c.title}</span>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Insight - ${date} | GAMERS CRAWL</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body class="page-daily-insight">
  <div class="insight-container">
    <a href="/" class="back-link">← GAMERS CRAWL로 돌아가기</a>

    <header class="insight-header">
      <div class="insight-date">${formatDate(date)}</div>
      <div class="insight-subtitle">Gaming Insight Report</div>
    </header>

    <!-- 탭 -->
    <div class="insight-tabs">
      <button class="insight-tab active" data-tab="daily">일간 리포트</button>
      <button class="insight-tab" data-tab="weekly">주간 리포트</button>
    </div>

    <!-- 일간 리포트 패널 -->
    <div class="insight-panel active" id="panel-daily">

    <section class="insight-section">
      <h2 class="section-title">오늘의 핵심</h2>
      <ul class="summary-list">${summaryHTML}</ul>
    </section>

    ${ai ? `
    <section class="insight-section ai-section">
      <h2 class="section-title">🤖 오늘의 이슈</h2>
      <div class="ai-grid">
        <div class="ai-column">
          ${(ai.issues || []).slice(0, 2).map(issue => `
          <div class="ai-card">
            <div class="ai-card-tag">${issue.tag}</div>
            <div class="ai-card-title">${issue.title}</div>
            <div class="ai-card-desc">${(issue.desc || '').replace(/\. /g, '.\n')}</div>
          </div>
          `).join('')}
        </div>
        <div class="ai-column">
          ${(ai.issues || []).slice(2, 4).map(issue => `
          <div class="ai-card">
            <div class="ai-card-tag">${issue.tag}</div>
            <div class="ai-card-title">${issue.title}</div>
            <div class="ai-card-desc">${(issue.desc || '').replace(/\. /g, '.\n')}</div>
          </div>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="insight-section ai-section">
      <h2 class="section-title">📈 트렌드</h2>
      <ul class="ai-trends">
        ${(ai.trends || []).map(trend => `<li><span class="ai-badge">TREND</span>${trend}</li>`).join('')}
      </ul>
    </section>
    ` : ''}

    <div class="grid-2">
      <section class="insight-section">
        <h2 class="section-title">📱 모바일 매출 순위 (한국 iOS)</h2>
        <table class="ranking-table">
          <thead><tr><th>순위</th><th></th><th>게임</th><th>변동</th></tr></thead>
          <tbody>${mobileKRHTML}</tbody>
        </table>
      </section>

      <section class="insight-section">
        <h2 class="section-title">🎮 Steam 동시접속</h2>
        <table class="ranking-table">
          <thead><tr><th>순위</th><th></th><th>게임</th><th>CCU</th><th>변동</th></tr></thead>
          <tbody>${steamHTML}</tbody>
        </table>
      </section>
    </div>

    <div class="grid-2">
      <section class="insight-section">
        <h2 class="section-title">📰 주요 뉴스</h2>
        <div class="news-list">${newsHTML}</div>
      </section>

      <section class="insight-section">
        <h2 class="section-title">💬 커뮤니티 핫토픽</h2>
        <div class="community-list">${communityHTML}</div>
      </section>
    </div>
    </div><!-- /panel-daily -->

    <!-- 주간 리포트 패널 -->
    <div class="insight-panel" id="panel-weekly">
      <div class="weekly-header">
        <div class="weekly-title">📊 ${getWeekInfo(date)}</div>
        <div class="weekly-period">주간 게이밍 인사이트 리포트</div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card primary">
          <div class="metric-label">모바일 1위 유지</div>
          <div class="metric-value">${mobile.kr.ios[0]?.title || '-'}</div>
          <div class="metric-sub">iOS 매출 순위</div>
        </div>
        <div class="metric-card accent">
          <div class="metric-label">Steam 최다 동접</div>
          <div class="metric-value">${steam[0]?.name || '-'}</div>
          <div class="metric-sub">${steam[0]?.ccu?.toLocaleString() || '-'} CCU</div>
        </div>
        <div class="metric-card success">
          <div class="metric-label">주간 급상승</div>
          <div class="metric-value">${mobile.kr.ios.filter(g => g.status === 'up' && g.change >= 5)[0]?.title || '-'}</div>
          <div class="metric-sub">iOS TOP 100 기준</div>
        </div>
        <div class="metric-card blue">
          <div class="metric-label">신규 진입</div>
          <div class="metric-value">${mobile.kr.ios.filter(g => g.status === 'new')[0]?.title || '-'}</div>
          <div class="metric-sub">TOP 100 신규</div>
        </div>
      </div>

      <section class="insight-section">
        <h2 class="section-title">🎯 금주 하이라이트</h2>
        <div class="highlights-grid">
          <div class="highlight-card">
            <span class="highlight-tag mobile">모바일</span>
            <div class="highlight-title">iOS 매출 순위 동향</div>
            <div class="highlight-desc">
              ${mobile.kr.ios.slice(0, 3).map((g, i) => `${i + 1}위: ${g.title}`).join(' / ')}
            </div>
          </div>
          <div class="highlight-card">
            <span class="highlight-tag pc">PC</span>
            <div class="highlight-title">Steam 동시접속 TOP 3</div>
            <div class="highlight-desc">
              ${steam.slice(0, 3).map((g, i) => `${i + 1}위: ${g.name} (${g.ccu?.toLocaleString() || '-'})`).join(' / ')}
            </div>
          </div>
          <div class="highlight-card">
            <span class="highlight-tag industry">순위 변동</span>
            <div class="highlight-title">주요 순위 변동 게임</div>
            <div class="highlight-desc">
              ${mobile.kr.ios.filter(g => g.status !== 'same').slice(0, 3).map(g => `${g.title} (${g.status === 'up' ? '▲' : g.status === 'down' ? '▼' : ''}${Math.abs(g.change)})`).join(', ') || '변동 없음'}
            </div>
          </div>
          <div class="highlight-card">
            <span class="highlight-tag esports">뉴스</span>
            <div class="highlight-title">금주 주요 뉴스</div>
            <div class="highlight-desc">
              ${news.slice(0, 2).map(n => n.title).join(' / ') || '주요 뉴스 없음'}
            </div>
          </div>
        </div>
      </section>

      <div class="grid-2">
        <section class="insight-section">
          <h2 class="section-title">📱 모바일 TOP 10 (주간)</h2>
          <table class="ranking-table">
            <thead><tr><th>순위</th><th></th><th>게임</th><th>변동</th></tr></thead>
            <tbody>${mobileKRHTML}</tbody>
          </table>
        </section>

        <section class="insight-section">
          <h2 class="section-title">🎮 Steam TOP 10 (주간)</h2>
          <table class="ranking-table">
            <thead><tr><th>순위</th><th></th><th>게임</th><th>CCU</th><th>변동</th></tr></thead>
            <tbody>${steamHTML}</tbody>
          </table>
        </section>
      </div>

      <div class="weekly-coming-soon">
        <h3>📈 더 많은 주간 분석 데이터가 곧 추가됩니다</h3>
        <p>주간 트렌드, 장르별 분석, 커뮤니티 핫이슈 등</p>
      </div>
    </div><!-- /panel-weekly -->

  </div>

  <script>
    // 탭 전환 기능
    document.querySelectorAll('.insight-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // 모든 탭 비활성화
        document.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.insight-panel').forEach(p => p.classList.remove('active'));

        // 클릭한 탭 활성화
        tab.classList.add('active');
        const panelId = 'panel-' + tab.dataset.tab;
        document.getElementById(panelId).classList.add('active');
      });
    });
  </script>
</body>
</html>`;
}

module.exports = {
  generateDailyInsight,
  generateInsightHTML,
  loadHistory,
  getTodayDate,
  getYesterdayDate
};
