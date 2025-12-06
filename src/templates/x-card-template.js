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

  // 카테고리별 색상
  const categoryColors = {
    1: { bg: '#eef2ff', text: '#4f46e5', bar: '#4f46e5' },
    2: { bg: '#ecfeff', text: '#0891b2', bar: '#0891b2' },
    3: { bg: '#ecfdf5', text: '#059669', bar: '#059669' }
  };

  const issuesHtml = topIssues.map((issue, idx) => {
    const colors = categoryColors[idx + 1];
    return `
      <div class="issue">
        <span class="issue-rank">${idx + 1}</span>
        <span class="issue-tag" style="background: ${colors.bg}; color: ${colors.text};">${issue.tag || '게임'}</span>
        <h3 class="issue-title">${issue.title}</h3>
        <p class="issue-desc">${issue.desc}</p>
        <style>.issue:nth-child(${idx + 1})::before { background: ${colors.bar}; }</style>
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
      background: #fff;
      padding: 40px 48px;
    }

    .card {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      display: flex;
      align-items: flex-end;
      gap: 3px;
    }

    .brand-icon span {
      width: 6px;
      border-radius: 3px;
      background: linear-gradient(180deg, #4f46e5 0%, #06b6d4 100%);
    }

    .brand-icon span:nth-child(1) { height: 14px; opacity: 0.4; }
    .brand-icon span:nth-child(2) { height: 22px; opacity: 0.7; }
    .brand-icon span:nth-child(3) { height: 30px; }

    .brand-text {
      font-size: 18px;
      font-weight: 800;
      color: #1e293b;
      letter-spacing: -0.3px;
    }

    .date-badge {
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
      background: #f1f5f9;
      padding: 8px 16px;
      border-radius: 100px;
    }

    .title-section {
      text-align: center;
      margin-bottom: 28px;
    }

    .title {
      font-size: 46px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 16px;
      color: #94a3b8;
      font-weight: 500;
    }

    .issues {
      display: flex;
      gap: 20px;
      flex: 1;
    }

    .issue {
      flex: 1;
      background: #f8fafc;
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      position: relative;
      border: 1px solid #e2e8f0;
    }

    .issue::before {
      content: '';
      position: absolute;
      top: -1px;
      left: 20px;
      right: 20px;
      height: 4px;
      border-radius: 0 0 4px 4px;
    }

    .issue-rank {
      position: absolute;
      top: 16px;
      right: 20px;
      font-size: 56px;
      font-weight: 900;
      color: #e2e8f0;
      line-height: 1;
    }

    .issue-tag {
      display: inline-flex;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 6px;
      margin-bottom: 14px;
      width: fit-content;
    }

    .issue-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.4;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }

    .issue-desc {
      font-size: 13px;
      color: #64748b;
      line-height: 1.55;
      position: relative;
      z-index: 1;
    }

    .footer {
      margin-top: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
    }

    .footer-url {
      font-size: 15px;
      font-weight: 700;
      color: #cbd5e1;
    }

    .footer-arrow {
      color: #4f46e5;
      font-size: 14px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">
        <div class="brand-icon">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span class="brand-text">GAMERS CRAWL</span>
      </div>
      <div class="date-badge">${formattedDate}</div>
    </div>

    <div class="title-section">
      <h1 class="title">오늘의 핫이슈 TOP 3</h1>
      <p class="subtitle">게임 업계에서 가장 주목받은 소식</p>
    </div>

    <div class="issues">
      ${issuesHtml}
    </div>

    <div class="footer">
      <span class="footer-url">gamerscrawl.com</span>
      <span class="footer-arrow">→</span>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { generateXCardHtml };
