/**
 * Throwaway: variant A (split editorial) — rebalanced (smaller black panel,
 * bigger/brighter image) × 4 label/text-position layouts.
 * Output: docs/images/x-card-A-L{1,2,3,4}.png
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SLUG = 'sol-enchant-dual-market-no1-launch';
const article = JSON.parse(fs.readFileSync(`./reports/issue/${SLUG}.json`, 'utf8'));

const stripMarkdown = (s) => !s ? '' : s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1').replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
  .replace(/\s+/g, ' ').trim();
const esc = (s) => !s ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const title = esc(article.title);
const summary = esc(stripMarkdown(article.summary || ''));
const img = esc(article.thumbnail || '');
const d = new Date(article.date || Date.now());
const date = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;

const FONT = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">`;
// image now occupies the right 700px; black text panel shrunk to 500px; fade is a thin seam only.
const base = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Pretendard',-apple-system,sans-serif;width:1200px;height:628px;overflow:hidden;position:relative;background:#0d0d0d}
.img{position:absolute;top:0;right:0;width:700px;height:100%;object-fit:cover;object-position:left center}
.fade{position:absolute;top:0;left:500px;width:300px;height:100%;background:linear-gradient(90deg,#0d0d0d 0%,rgba(13,13,13,.7) 22%,rgba(13,13,13,.2) 60%,rgba(13,13,13,0) 100%)}
.title{font-size:32px;font-weight:800;color:#fff;line-height:1.34;letter-spacing:-.5px;word-break:keep-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sum{font-size:16px;color:#9a9a9a;line-height:1.6;word-break:keep-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.accent{width:48px;height:5px;border-radius:3px;background:#10b981}
.pill{font-size:13px;font-weight:700;letter-spacing:1px;color:#10b981;border:1px solid #10b981;padding:6px 14px;border-radius:999px;align-self:flex-start}
.kicker{font-size:13px;font-weight:800;letter-spacing:3px;color:#10b981}
.ft{font-size:13px;color:#777}.ft b{color:#10b981;font-weight:800}`;

const head = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">${FONT}<style>${base}`;
const imgEl = `<img class="img" src="${img}" onerror="this.style.display='none'"><div class="fade"></div>`;
const PW = 500; // panel width

// L1 — pill pinned top, content vertically centered, footer bottom
const L1 = `${head}
.panel{position:absolute;inset:0;width:${PW}px;padding:44px;display:flex;flex-direction:column;justify-content:center}
.pill{position:absolute;top:44px;left:44px}.accent{margin-bottom:20px}.title{margin-bottom:18px}
.ft{position:absolute;bottom:40px;left:44px}
</style></head><body>${imgEl}
<div class="panel"><span class="pill">데일리 포커스</span><div class="accent"></div>
<h1 class="title">${title}</h1><p class="sum">${summary}</p></div>
<div class="ft">${date} · <b>게이머스크롤</b></div></body></html>`;

// L2 — tight kicker (no pill, no accent) grouped above title, centered
const L2 = `${head}
.panel{position:absolute;inset:0;width:${PW}px;padding:44px;display:flex;flex-direction:column;justify-content:center}
.kicker{margin-bottom:14px}.accent{display:none}.title{margin-bottom:16px}
.ft{position:absolute;bottom:40px;left:44px}
</style></head><body>${imgEl}
<div class="panel"><span class="kicker">데일리 포커스</span>
<h1 class="title">${title}</h1><p class="sum">${summary}</p></div>
<div class="ft">${date} · <b>게이머스크롤</b></div></body></html>`;

// L3 — top-anchored editorial stack
const L3 = `${head}
.panel{position:absolute;inset:0;width:${PW}px;padding:80px 44px;display:flex;flex-direction:column;justify-content:flex-start}
.pill{margin-bottom:22px}.accent{margin-bottom:20px}.title{margin-bottom:18px}
.ft{position:absolute;bottom:40px;left:44px}
</style></head><body>${imgEl}
<div class="panel"><span class="pill">데일리 포커스</span><div class="accent"></div>
<h1 class="title">${title}</h1><p class="sum">${summary}</p></div>
<div class="ft">${date} · <b>게이머스크롤</b></div></body></html>`;

// L4 — bottom-anchored block with footer divider
const L4 = `${head}
.panel{position:absolute;inset:0;width:${PW}px;padding:44px 44px 44px;display:flex;flex-direction:column;justify-content:flex-end}
.pill{margin-bottom:20px}.accent{margin-bottom:18px}.title{margin-bottom:16px}
.ftrow{display:flex;margin-top:24px;padding-top:16px;border-top:1px solid #242424}
</style></head><body>${imgEl}
<div class="panel"><span class="pill">데일리 포커스</span><div class="accent"></div>
<h1 class="title">${title}</h1><p class="sum">${summary}</p>
<div class="ftrow"><span class="ft">${date} · <b>게이머스크롤</b></span></div></div></body></html>`;

const outputs = { 'x-card-A-L1': L1, 'x-card-A-L2': L2, 'x-card-A-L3': L3, 'x-card-A-L4': L4 };

(async () => {
  const browser = await chromium.launch();
  for (const [name, html] of Object.entries(outputs)) {
    const tmp = `./temp-${name}.html`;
    fs.writeFileSync(tmp, html, 'utf8');
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1200, height: 628 });
    await page.goto(`file://${path.resolve(tmp)}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `./docs/images/${name}.png`, type: 'png' });
    await page.close();
    fs.unlinkSync(tmp);
    console.log(`rendered ${name}`);
  }
  await browser.close();
})();
