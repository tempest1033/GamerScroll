/**
 * X(Twitter) Article Card HTML Template (English)
 * Top image band + solid text panel (1200x628)
 */

const generateXArticleCardHtmlEn = (data) => {
  const { title, thumbnail, date, intro, summary } = data;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  const formattedDate = formatDate(date);

  // Strip markdown so links/emphasis never leak into the card as raw syntax.
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

  // Prefer the curated summary; fall back to the first paragraph (markdown-stripped).
  const blurb = escapeHtml(stripMarkdown(summary || intro || ''));

  return `<!DOCTYPE html>
<html lang="en">
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
      letter-spacing: 2px;
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
      font-size: 46px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.25;
      letter-spacing: -0.5px;
      margin-bottom: 16px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .summary {
      font-size: 20px;
      font-weight: 400;
      color: #aaaaaa;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .footer {
      display: flex;
      align-items: center;
      margin-top: 24px;
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
  <span class="label">AISCROLL</span>
  <div class="panel">
    <div class="accent"></div>
    <h1 class="title">${escapeHtml(title)}</h1>
    <p class="summary">${blurb}</p>
    <div class="footer">
      <span class="footer-date">${formattedDate}</span>
      <span class="footer-brand">AIScroll</span>
      <span class="footer-url">aiscroll.io</span>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { generateXArticleCardHtmlEn };
