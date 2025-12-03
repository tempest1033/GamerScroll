const fs = require('fs');
const path = require('path');

const HISTORY_DIR = './history';

/**
 * 어제 날짜 문자열 반환
 */
function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * 오늘 날짜 문자열 반환
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 히스토리 파일 로드
 */
function loadHistory(date) {
  try {
    const filePath = path.join(HISTORY_DIR, `${date}.json`);
    if (fs.existsSync(filePath)) {
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

  // 순위 변동 분석
  const mobileChangesKR = analyzeRankingChanges(
    todayData.rankings,
    yesterdayData?.rankings,
    'kr',
    20
  );

  const mobileChangesUS = analyzeRankingChanges(
    todayData.rankings,
    yesterdayData?.rankings,
    'us',
    20
  );

  const steamChanges = analyzeSteamChanges(
    todayData.steam,
    yesterdayData?.steam,
    20
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
  <style>
    .insight-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .insight-header { text-align: center; margin-bottom: 40px; }
    .insight-date { font-size: 2rem; font-weight: 700; color: #fff; }
    .insight-subtitle { color: #9ca3af; margin-top: 8px; }

    .insight-section { background: #1f2937; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .section-title { font-size: 1.25rem; font-weight: 600; color: #fff; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }

    .summary-list { list-style: none; padding: 0; }
    .summary-list li { padding: 12px 16px; background: #374151; border-radius: 8px; margin-bottom: 8px; color: #e5e7eb; }

    .ranking-table { width: 100%; border-collapse: collapse; }
    .ranking-table th, .ranking-table td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #374151; }
    .ranking-table th { color: #9ca3af; font-weight: 500; }
    .ranking-table .rank { width: 40px; font-weight: 700; color: #fff; }
    .ranking-table .icon { width: 40px; }
    .ranking-table .icon img { width: 32px; height: 32px; border-radius: 8px; }
    .ranking-table .title { color: #e5e7eb; }
    .ranking-table .ccu { color: #9ca3af; }
    .ranking-table .change-cell { width: 60px; text-align: right; }

    .change { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .change.up { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .change.down { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .change.new { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .change.same { color: #6b7280; }

    .news-list, .community-list { display: flex; flex-direction: column; gap: 8px; }
    .news-item, .community-item { display: flex; gap: 12px; padding: 12px; background: #374151; border-radius: 8px; text-decoration: none; color: #e5e7eb; transition: background 0.2s; }
    .news-item:hover, .community-item:hover { background: #4b5563; }
    .news-item .source, .community-item .source { background: #4f46e5; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; flex-shrink: 0; }
    .news-item .title, .community-item .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .back-link { display: inline-block; margin-bottom: 20px; color: #9ca3af; text-decoration: none; }
    .back-link:hover { color: #fff; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }

    /* AI Insight */
    .ai-section { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); }
    .ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .ai-grid { grid-template-columns: 1fr; } }
    .ai-column { display: flex; flex-direction: column; gap: 16px; }
    .ai-card { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; border-left: 3px solid #818cf8; }
    .ai-card-tag { display: inline-block; background: #4f46e5; color: #fff; font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; }
    .ai-card-title { font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 8px; line-height: 1.4; }
    .ai-card-desc { font-size: 0.85rem; color: #c7d2fe; line-height: 1.7; white-space: pre-line; }
    .ai-trends { list-style: none; padding: 0; margin: 0; }
    .ai-trends li { padding: 12px 16px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; color: #c7d2fe; font-size: 0.9rem; border-left: 3px solid #818cf8; }
    .ai-badge { background: #818cf8; color: #1e1b4b; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; margin-right: 8px; font-weight: 700; }
  </style>
</head>
<body style="background: #111827; min-height: 100vh;">
  <div class="insight-container">
    <a href="../index.html" class="back-link">← GAMERS CRAWL로 돌아가기</a>

    <header class="insight-header">
      <div class="insight-date">${formatDate(date)}</div>
      <div class="insight-subtitle">Daily Gaming Insight</div>
    </header>

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
  </div>
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
