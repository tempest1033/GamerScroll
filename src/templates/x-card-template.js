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
    return `
      <div class="issue">
        <span class="issue-num">${idx + 1}</span>
        <span class="issue-tag">${issue.tag || '게임'}</span>
        <h3 class="issue-title">${issue.title}</h3>
        <p class="issue-desc">${issue.desc}</p>
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
      padding: 32px;
    }
    .card {
      background: rgba(255,255,255,0.95);
      border-radius: 24px;
      width: 100%;
      height: 100%;
      padding: 36px 48px 28px;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(10px);
    }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .title {
      font-size: 54px;
      font-weight: 800;
      background: linear-gradient(90deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.1;
    }
    .logo-svg {
      height: 36px;
      width: auto;
      color: #1e293b;
    }
    .issues {
      display: flex;
      gap: 20px;
      flex: 1;
      margin-bottom: 20px;
    }
    .issue {
      flex: 1;
      border-radius: 20px;
      padding: 28px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      background: #fff;
      border: 2px solid #e2e8f0;
    }
    .issue-num {
      position: absolute;
      top: 16px;
      right: 24px;
      font-size: 90px;
      font-weight: 900;
      line-height: 1;
    }
    .issue:nth-child(1) .issue-num { color: rgba(102, 126, 234, 0.15); }
    .issue:nth-child(2) .issue-num { color: rgba(118, 75, 162, 0.15); }
    .issue:nth-child(3) .issue-num { color: rgba(236, 72, 153, 0.15); }
    .issue-tag {
      display: inline-flex;
      font-size: 18px;
      font-weight: 700;
      padding: 10px 18px;
      border-radius: 8px;
      margin-bottom: 16px;
      width: fit-content;
      color: #fff;
    }
    .issue:nth-child(1) .issue-tag { background: #667eea; }
    .issue:nth-child(2) .issue-tag { background: #764ba2; }
    .issue:nth-child(3) .issue-tag { background: #ec4899; }
    .issue-title {
      font-size: 26px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
      margin-bottom: 12px;
    }
    .issue-desc {
      font-size: 18px;
      font-weight: 500;
      color: #334155;
      line-height: 1.55;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      position: relative;
    }
    .date {
      background: linear-gradient(90deg, #667eea, #764ba2);
      padding: 12px 24px;
      border-radius: 100px;
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    .brand-name {
      font-size: 22px;
      font-weight: 800;
      color: #94a3b8;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
    .cta {
      font-size: 18px;
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
      <div class="date">${formattedDate} 데일리 인사이트</div>
      <span class="brand-name">게이머스크롤</span>
      <span class="cta">gamerscrawl.com</span>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { generateXCardHtml };
