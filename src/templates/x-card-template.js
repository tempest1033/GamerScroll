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

  const numColors = [
    'rgba(255, 180, 50, 0.85)',
    'rgba(160, 170, 190, 0.85)',
    'rgba(180, 120, 80, 0.85)'
  ];

  const issuesHtml = topIssues.map((issue, idx) => {
    const tag = issue.tag || '게임';
    const title = issue.title || '';
    const desc = issue.desc || '';
    const thumbnail = issue.thumbnail || '';

    return `
      <div class="issue">
        <div class="issue-media">
          ${thumbnail ? `<img class="issue-thumb" src="${thumbnail}" alt="${title}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="issue-media-overlay"></div>
          <span class="issue-num" style="background: ${numColors[idx]};">${idx + 1}</span>
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
      height: 628px;
      background: #111111;
      padding: 36px 40px;
      overflow: hidden;
    }
    .card {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .top-row {
      margin-bottom: 28px;
    }
    .title {
      font-size: 38px;
      font-weight: 900;
      color: #ffffff;
      line-height: 1;
      letter-spacing: -1px;
    }
    .issues {
      display: flex;
      gap: 20px;
      flex: 1;
      min-height: 0;
    }
    .issue {
      flex: 1;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #1e1e1e;
      border: 1px solid #2a2a2a;
    }
    .issue-media {
      position: relative;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #222222;
    }
    .issue-media-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.5) 100%);
      z-index: 2;
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
      left: 10px;
      font-size: 32px;
      font-weight: 900;
      line-height: 1;
      color: #ffffff;
      z-index: 3;
      width: 36px;
      height: 36px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .issue-tag {
      position: absolute;
      right: 10px;
      bottom: 10px;
      display: inline-flex;
      font-size: 14px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      color: #cccccc;
      z-index: 3;
      background: rgba(255,255,255,0.12);
    }
    .issue-body {
      padding: 14px 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .issue-title {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.35;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .issue-desc {
      font-size: 16px;
      font-weight: 400;
      color: #888888;
      line-height: 1.55;
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .footer {
      display: flex;
      align-items: center;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #1e1e1e;
    }
    .footer-date {
      flex: 1;
      text-align: left;
      font-size: 13px;
      font-weight: 500;
      color: #666666;
    }
    .footer-brand {
      flex: 1;
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      color: #444444;
    }
    .footer-url {
      flex: 1;
      text-align: right;
      font-size: 13px;
      font-weight: 500;
      color: #444444;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="top-row">
      <h1 class="title">오늘의 핫이슈 TOP 3</h1>
    </div>

    <div class="issues">
      ${issuesHtml}
    </div>

    <div class="footer">
      <span class="footer-date">${formattedDate}</span>
      <span class="footer-brand">게이머스크롤</span>
      <span class="footer-url">gamerscroll.com</span>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { generateXCardHtml };
