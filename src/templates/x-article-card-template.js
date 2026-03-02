/**
 * X(Twitter) 개별 기사 카드 이미지용 HTML 템플릿 생성
 * 이미지 오버레이 스타일 (1200x628)
 */

const generateXArticleCardHtml = (data) => {
  const { title, thumbnail, date, intro } = data;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const formattedDate = formatDate(date);

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

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
      overflow: hidden;
      position: relative;
      background: #111111;
    }
    .bg-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gradient-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        180deg,
        rgba(17, 17, 17, 0.4) 0%,
        rgba(17, 17, 17, 0) 12%,
        rgba(17, 17, 17, 0.15) 20%,
        rgba(17, 17, 17, 0.6) 35%,
        rgba(17, 17, 17, 0.95) 55%,
        rgba(17, 17, 17, 0.98) 100%
      );
    }
    .content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 0 40px 36px;
    }
    .text-area {
      margin-bottom: 20px;
    }
    .title {
      font-size: 44px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.3;
      margin-bottom: 14px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      letter-spacing: -0.5px;
    }
    .intro {
      font-size: 18px;
      font-weight: 400;
      color: #bbbbbb;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .footer {
      display: flex;
      align-items: center;
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
    .label {
      position: absolute;
      top: 32px;
      left: 40px;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 1px;
      background: rgba(255, 255, 255, 0.15);
      padding: 8px 18px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <img class="bg-image" src="${escapeHtml(thumbnail)}" alt="" onerror="this.style.display='none';">
  <div class="gradient-overlay"></div>
  <div class="content">
    <span class="label">데일리 포커스</span>
    <div class="text-area">
      <h1 class="title">${escapeHtml(title)}</h1>
      <p class="intro">${escapeHtml(intro)}</p>
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

module.exports = { generateXArticleCardHtml };
