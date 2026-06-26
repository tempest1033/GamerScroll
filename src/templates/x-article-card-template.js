/**
 * X(Twitter) 개별 기사 카드 이미지용 HTML 템플릿 생성 (한국어)
 * 상단 이미지 밴드 + 솔리드 텍스트 패널 (1200x628)
 */

const generateXArticleCardHtml = (data) => {
  const { title, thumbnail, date, intro, summary } = data;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  const formattedDate = formatDate(date);

  // 링크/강조 마크다운이 카드에 원문 그대로 새지 않도록 제거.
  const stripMarkdown = (str) => {
    if (!str) return '';
    return str
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')        // images
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // [text](url) -> text
      .replace(/\*\*([^*]+)\*\*/g, '$1')             // **bold**
      .replace(/\*([^*]+)\*/g, '$1')                 // *italic*
      .replace(/`([^`]+)`/g, '$1')                   // `code`
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')         // _emphasis_
      .replace(/\s+/g, ' ')
      .trim();
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // 큐레이션된 요약 우선, 없으면 첫 문단(마크다운 제거)로 폴백.
  const blurb = escapeHtml(stripMarkdown(summary || intro || ''));

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
      background: #0d0d0d;
    }
    .image-band {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 372px;
      overflow: hidden;
      background: #1a1a1a;
    }
    .image-band img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .image-fade {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 372px;
      background: linear-gradient(
        180deg,
        rgba(13,13,13,0.05) 0%,
        rgba(13,13,13,0) 38%,
        rgba(13,13,13,0.55) 78%,
        rgba(13,13,13,1) 100%
      );
    }
    .label {
      position: absolute;
      top: 30px; left: 44px;
      z-index: 2;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #ffffff;
      background: rgba(0,0,0,0.42);
      padding: 9px 18px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .panel {
      position: absolute;
      bottom: 0; left: 0;
      width: 100%;
      height: 286px;
      padding: 0 48px 40px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .accent {
      width: 56px;
      height: 5px;
      border-radius: 3px;
      background: #10b981;
      margin-bottom: 20px;
    }
    .title {
      font-size: 42px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.28;
      letter-spacing: -0.5px;
      margin-bottom: 16px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .summary {
      font-size: 19px;
      font-weight: 400;
      color: #aaaaaa;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .footer {
      display: flex;
      align-items: center;
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid #242424;
    }
    .footer-date {
      flex: 1;
      text-align: left;
      font-size: 14px;
      font-weight: 500;
      color: #6b6b6b;
    }
    .footer-brand {
      flex: 1;
      text-align: center;
      font-size: 17px;
      font-weight: 800;
      color: #10b981;
      letter-spacing: 0.5px;
    }
    .footer-url {
      flex: 1;
      text-align: right;
      font-size: 14px;
      font-weight: 500;
      color: #6b6b6b;
    }
  </style>
</head>
<body>
  <div class="image-band">
    <img src="${escapeHtml(thumbnail)}" alt="" onerror="this.style.display='none';">
  </div>
  <div class="image-fade"></div>
  <span class="label">데일리 포커스</span>
  <div class="panel">
    <div class="accent"></div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <p class="summary">${blurb}</p>
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
