/**
 * X(Twitter) 카드 이미지용 HTML 템플릿 생성
 * AI 인사이트 데이터를 받아서 HTML을 생성
 */

const generateXCardHtml = (data) => {
  const { date, issues } = data;

  // 날짜 포맷팅
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const formattedDate = formatDate(date);

  // 이슈 3개만 사용
  const topIssues = issues.slice(0, 3);

  const issuesHtml = topIssues.map((issue, idx) => {
    const tag = issue.tag || '게임';
    const title = issue.title || '';
    const desc = issue.desc || '';
    const thumbnail = issue.thumbnail || '';

    return `
      <div class="issue">
        <div class="issue-media">
          ${thumbnail ? `<img class="issue-thumb" src="${thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="issue-num">${idx + 1}</span>
          <span class="issue-tag">${tag}</span>
        </div>
        <div class="issue-body">
          <h3 class="issue-title">${title}</h3>
          <p class="issue-desc">${desc}</p>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
      width: 1200px;
      height: 675px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.96);
      border-radius: 24px;
      width: 100%;
      height: 100%;
      padding: 24px 28px 20px;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(10px);
    }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .title {
      font-size: 42px;
      font-weight: 800;
      background: linear-gradient(90deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.1;
    }
    .logo-svg {
      height: 30px;
      width: auto;
      color: #1e293b;
    }
    .issues {
      display: flex;
      gap: 16px;
      flex: 1;
      margin-bottom: 16px;
    }
    .issue {
      flex: 1;
      border-radius: 18px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #fff;
      border: 1px solid #e2e8f0;
    }
    .issue-media {
      position: relative;
      aspect-ratio: 16 / 9;
      background: linear-gradient(135deg, #94a3b8 0%, #e2e8f0 100%);
      overflow: hidden;
    }
    .issue-media::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.05) 0%, rgba(15, 23, 42, 0.4) 100%);
    }
    .issue-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      position: relative;
      z-index: 1;
    }
    .issue-num {
      position: absolute;
      top: 10px;
      right: 12px;
      font-size: 32px;
      font-weight: 800;
      line-height: 1;
      color: #fff;
      background: rgba(15, 23, 42, 0.55);
      padding: 6px 10px;
      border-radius: 10px;
      backdrop-filter: blur(6px);
      z-index: 2;
    }
    .issue-tag {
      position: absolute;
      left: 12px;
      bottom: 12px;
      display: inline-flex;
      font-size: 13px;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 8px;
      color: #fff;
      z-index: 2;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(6px);
    }
    .issue:nth-child(1) .issue-tag { background: rgba(102, 126, 234, 0.9); }
    .issue:nth-child(2) .issue-tag { background: rgba(118, 75, 162, 0.9); }
    .issue:nth-child(3) .issue-tag { background: rgba(236, 72, 153, 0.9); }
    .issue:nth-child(1) .issue-media { background: linear-gradient(135deg, #c7d2fe 0%, #e0e7ff 100%); }
    .issue:nth-child(2) .issue-media { background: linear-gradient(135deg, #ddd6fe 0%, #ede9fe 100%); }
    .issue:nth-child(3) .issue-media { background: linear-gradient(135deg, #fbcfe8 0%, #fce7f3 100%); }
    .issue-body {
      padding: 12px 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .issue-title {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .issue-desc {
      font-size: 17px;
      font-weight: 500;
      color: #334155;
      line-height: 1.65;
      margin: 0;
      overflow: hidden;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      position: relative;
    }
    .date {
      background: linear-gradient(90deg, #667eea, #764ba2);
      padding: 10px 18px;
      border-radius: 100px;
      font-size: 15px;
      font-weight: 600;
      color: #fff;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 800;
      color: #94a3b8;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
    .cta {
      font-size: 15px;
      font-weight: 600;
      color: #764ba2;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="top-row">
      <h1 class="title">오늘의 핫이슈 TOP 3</h1>
      <svg class="logo-svg" viewBox="0 0 660 72" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#667eea" />
            <stop offset="100%" stop-color="#764ba2" />
          </linearGradient>
        </defs>
        <text x="50%" y="50%" dy="2" font-family="'Pretendard', -apple-system, sans-serif" font-size="62" font-weight="900" fill="currentColor" text-anchor="middle" dominant-baseline="middle" letter-spacing="-0.5">GAMERS CRAWL</text>
        <rect x="8" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
        <rect x="26" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
        <rect x="44" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
        <rect x="606" y="6" width="10" height="60" rx="5" fill="url(#techGrad)"/>
        <rect x="624" y="15" width="10" height="42" rx="5" fill="url(#techGrad)" opacity="0.7"/>
        <rect x="642" y="24" width="10" height="24" rx="5" fill="url(#techGrad)" opacity="0.4"/>
      </svg>
    </div>

    <div class="issues">
      ${issuesHtml}
    </div>

    <div class="footer">
      <div class="date">${formattedDate} 데일리 리포트</div>
      <span class="brand-name">게이머스크롤</span>
      <span class="cta">gamerscrawl.com</span>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { generateXCardHtml };
