/**
 * 위키 초안 미리보기 스크립트
 * - 이미지 다운로드 없이 외부 URL 프록시로 바로 렌더링
 * - docs/preview/wiki-preview.html 생성
 *
 * 사용법:
 *   node scripts/preview-wiki.js                              # 최신 draft 미리보기
 *   node scripts/preview-wiki.js [category] [slug]            # 특정 slug 미리보기
 *   node scripts/preview-wiki.js --list                       # draft 목록 보기
 */

const fs = require('fs');
const path = require('path');

const WIKI_DIR = path.join(__dirname, '..', 'data', 'wiki');
const PREVIEW_DIR = path.join(__dirname, '..', 'docs', 'preview');
const STYLES_PATH = path.join(__dirname, '..', 'src', 'styles.css');
const GAMES_PATH = path.join(__dirname, '..', 'data', 'games.json');

// 게임 데이터 로드
let gamesData = {};
if (fs.existsSync(GAMES_PATH)) {
  let content = fs.readFileSync(GAMES_PATH, 'utf-8');
  // BOM 제거
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  const parsed = JSON.parse(content);
  // games.json 구조: { version, games: { ... }, lastUpdated }
  gamesData = parsed.games || parsed;
}

// CLI 인자 파싱
const args = process.argv.slice(2);

// --list 옵션
if (args.includes('--list')) {
  listDrafts();
  process.exit(0);
}

// category/slug 지정 또는 최신 draft
const targetCategory = args[0] || null;
const targetSlug = args[1] || null;

/**
 * draft 목록 출력
 */
function listDrafts() {
  console.log('\n📚 위키 목록\n');

  const categories = fs.readdirSync(WIKI_DIR).filter(f =>
    fs.statSync(path.join(WIKI_DIR, f)).isDirectory()
  );

  categories.forEach(category => {
    const categoryPath = path.join(WIKI_DIR, category);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));

    if (files.length === 0) return;

    console.log(`📁 ${category}/`);

    const reports = files.map(f => {
      const content = fs.readFileSync(path.join(categoryPath, f), 'utf-8').replace(/^\uFEFF/, '');
      const data = JSON.parse(content);
      return {
        slug: data.slug,
        title: data.title,
        status: data.status || 'draft',
        date: data.date
      };
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    reports.forEach(r => {
      const statusIcon = r.status === 'approved' ? '✅' : '📝';
      console.log(`  ${statusIcon} [${r.status}] ${r.title}`);
      console.log(`     slug: ${r.slug}\n`);
    });
  });
}

/**
 * 위키 로드
 */
function loadWiki(category, slug) {
  if (category && slug) {
    const filePath = path.join(WIKI_DIR, category, `${slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 파일을 찾을 수 없습니다: ${category}/${slug}.json`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    return { ...JSON.parse(content), category };
  }

  // 지정 없으면 최신 draft 찾기
  const categories = fs.readdirSync(WIKI_DIR).filter(f =>
    fs.statSync(path.join(WIKI_DIR, f)).isDirectory()
  );

  let latestDraft = null;
  let latestDate = '';
  let latestCategory = '';

  for (const cat of categories) {
    const categoryPath = path.join(WIKI_DIR, cat);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));

    for (const f of files) {
      const content = fs.readFileSync(path.join(categoryPath, f), 'utf-8').replace(/^\uFEFF/, '');
      const data = JSON.parse(content);
      if (data.status === 'draft' && (data.date || '') >= latestDate) {
        latestDate = data.date || '';
        latestDraft = data;
        latestCategory = cat;
      }
    }
  }

  if (!latestDraft) {
    console.error('❌ draft 상태의 위키가 없습니다.');
    process.exit(1);
  }

  return { ...latestDraft, category: latestCategory };
}

/**
 * 날짜 포맷 (2026-01-20 → 2026년 1월 20일)
 */
function formatDateKorean(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${parseInt(match[1])}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
}

/**
 * 이미지 URL 프록시 처리 (외부 이미지 → wsrv.nl 프록시)
 */
function proxyImageUrl(url) {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;

  // 이미 로컬이면 그대로
  if (url.startsWith('/')) return url;

  // 외부 URL은 프록시
  if (url.startsWith('http')) {
    return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=960&output=webp';
  }
  return url;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 마크다운 링크를 HTML 앵커 태그로 변환
 * [텍스트](URL) → <a href="URL">텍스트</a>
 */
function parseMarkdownLinks(str) {
  const escaped = escapeHtml(str);
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
}

/**
 * 마크다운 표를 HTML table로 변환
 */
function parseMarkdownTable(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;

  // 첫 줄이 | 로 시작하는지 확인
  if (!lines[0].trim().startsWith('|')) return null;

  // 구분선 (|---|---|) 찾기
  const separatorIndex = lines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line.trim()));
  if (separatorIndex < 1) return null;

  // | 로 split 후 앞뒤 빈 요소 제거하는 헬퍼
  function parseCells(line) {
    const cells = line.split('|');
    // 앞뒤 빈 요소 제거 (| 로 시작/끝나서 생기는 빈 문자열)
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(cell => cell.trim());
  }

  // 헤더 파싱
  const headers = parseCells(lines[0]);

  // 데이터 행 파싱
  const dataLines = lines.slice(separatorIndex + 1).filter(line => line.trim().startsWith('|'));
  const rows = dataLines.map(line => parseCells(line));

  // HTML 생성
  let html = '<div class="wiki-table-wrapper"><table>';
  html += '<thead><tr>';
  headers.forEach(h => {
    html += `<th>${h}</th>`;
  });
  html += '</tr></thead>';
  html += '<tbody>';
  rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => {
      html += `<td>${cell}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  return html;
}

/**
 * 본문 렌더링
 */
function renderContent(content) {
  const result = [];

  content.forEach(block => {
    switch (block.type) {
      case 'text':
        // 단락 분리 후 각각 처리
        const paragraphs = block.value.split('\n\n');
        const rendered = paragraphs.map(p => {
          const trimmed = p.trim();
          // 표인지 확인 (|로 시작하고 |---| 포함)
          if (trimmed.startsWith('|') && trimmed.includes('|---')) {
            const tableHtml = parseMarkdownTable(trimmed);
            if (tableHtml) return tableHtml;
          }
          // 일반 텍스트
          if (trimmed) {
            // 볼드 처리 (**text** → <strong>text</strong>)
            let processed = trimmed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            // HTML 태그 보존 (a 태그 등)
            processed = processed.replace(/\n/g, '<br>');
            return `<p class="blog-paragraph">${processed}</p>`;
          }
          return '';
        }).filter(p => p).join('\n');
        result.push(rendered);
        break;

      case 'image':
        const imgSrc = proxyImageUrl(block.src);
        const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
        result.push(`
          <figure class="blog-figure">
            <img class="blog-image" src="${imgSrc}" alt="${escapeHtml(block.alt || block.caption)}" loading="lazy">
            ${caption}
          </figure>
        `);
        break;

      case 'heading':
        result.push(`<h2 class="blog-heading">${block.value}</h2>`);
        break;

      case 'quote':
        result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
        break;

      case 'video':
        const videoMatch = (block.url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (videoMatch) {
          const videoCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure blog-video">
              <div class="blog-video-wrapper">
                <iframe src="https://www.youtube.com/embed/${videoMatch[1]}"
                        title="${escapeHtml(block.caption)}"
                        frameborder="0" allowfullscreen loading="lazy"></iframe>
              </div>
              ${videoCaption}
            </figure>
          `);
        }
        break;

      case 'table':
        if (block.headers && block.rows) {
          const tableHeaders = block.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
          const tableRows = block.rows.map(row =>
            `<tr>${row.map(cell => `<td>${parseMarkdownLinks(cell)}</td>`).join('')}</tr>`
          ).join('');
          result.push(`
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtml(block.caption)}</div>` : ''}
              <div class="blog-table-wrapper">
                <table class="wiki-table">
                  <thead><tr>${tableHeaders}</tr></thead>
                  <tbody>${tableRows}</tbody>
                </table>
              </div>
            </figure>
          `);
        }
        break;

      case 'link':
        if (block.url && block.text) {
          const subtext = block.subtext ? `<span class="blog-link-subtext">${escapeHtml(block.subtext)}</span>` : '';
          result.push(`<a href="${block.url}" class="blog-link-button"><div class="blog-link-content"><span class="blog-link-text">${escapeHtml(block.text)}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
        }
        break;
    }
  });

  return result.join('\n');
}

/**
 * 정보 출처 렌더링
 */
function renderSources(sources) {
  if (!sources || sources.length === 0) return '';

  return `
    <div class="blog-sources">
      <h3 class="blog-sources-title">정보 출처</h3>
      <ul class="blog-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="nofollow noopener">${s.name} - ${s.title}</a></li>
        `).join('')}
      </ul>
    </div>
  `;
}

/**
 * 관련 게임 렌더링
 */
function renderRelatedGames(gameSlugs) {
  if (!gameSlugs || gameSlugs.length === 0) return '';

  // slug 문자열을 게임 객체로 변환
  const games = gameSlugs.map(slug => {
    // gamesData에서 slug로 게임 찾기
    for (const [name, data] of Object.entries(gamesData)) {
      if (data.slug === slug) {
        return { slug: data.slug, title: name, icon: data.icon };
      }
    }
    // 못 찾으면 slug를 title로 사용
    return { slug, title: slug };
  });

  return `
    <div class="blog-related-games">
      <h3 class="blog-related-title">관련 게임</h3>
      <div class="blog-related-grid">
        ${games.map(g => `
          <a href="/games/${g.slug}/" class="blog-related-card">
            ${g.icon ? `<img src="${g.icon}" alt="${escapeHtml(g.title)}" class="blog-related-icon">` : ''}
            <span class="blog-related-name">${escapeHtml(g.title)}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 관련 문서 렌더링
 */
function renderRelatedArticles(articlePaths, currentCategory) {
  if (!articlePaths || articlePaths.length === 0) return '';

  // "category/slug" 또는 "slug"만 있는 문자열을 파싱하여 위키 파일에서 제목 가져오기
  const articles = articlePaths.map(pathStr => {
    let category, slug;
    if (pathStr.includes('/')) {
      [category, slug] = pathStr.split('/');
    } else {
      // slug만 있으면 현재 카테고리 사용
      category = currentCategory;
      slug = pathStr;
    }
    const wikiPath = path.join(WIKI_DIR, category, `${slug}.json`);
    let title = slug;
    if (fs.existsSync(wikiPath)) {
      try {
        let content = fs.readFileSync(wikiPath, 'utf-8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const data = JSON.parse(content);
        title = data.title || slug;
      } catch (e) {}
    }
    return { category, slug, title };
  });

  return `
    <div class="blog-related-games">
      <h3 class="blog-related-title">관련 문서</h3>
      <div class="blog-related-grid">
        ${articles.map(a => `
          <a href="/wiki/${a.category}/${a.slug}/" class="blog-related-card">
            <span class="blog-related-name">${escapeHtml(a.title)}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 미리보기 HTML 생성
 */
function generatePreviewHtml(report) {
  const { slug, title, date, thumbnail, summary, content = [], sources = [], relatedGames = [], relatedArticles = [], category } = report;

  const thumbnailHtml = thumbnail ? `
    <div class="blog-hero">
      <img class="blog-hero-image" src="${proxyImageUrl(thumbnail)}" alt="${escapeHtml(title)} 대표 이미지">
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[미리보기] ${escapeHtml(title)}</title>
  <style>
    /* CSS 변수 정의 - 다크모드 */
    :root {
      --bg: #0a0a0b;
      --bg-secondary: #18181b;
      --card: #18181b;
      --card-hover: #27272a;
      --border: #3f3f46;
      --text: #fafafa;
      --text-secondary: #d4d4d8;
      --text-muted: #a1a1aa;
      --primary: #f97316;
      --hover-bg: #27272a;
      --radius: 12px;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
      --font-2xl-size: 1.75rem;
      --font-xl-size: 1.5rem;
      --font-lg-size: 1.25rem;
      --font-title-size: 1rem;
      --font-body-size: 0.9375rem;
      --font-desc-size: 0.875rem;
      --font-meta-size: 0.8125rem;
      --font-small-size: 0.75rem;
      --font-badge-size: 0.6875rem;
    }

    /* 기본 스타일 */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
    }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { color: #34d399; }

    /* 프리뷰 배너 */
    .preview-banner {
      background: linear-gradient(90deg, #f97316, #ea580c);
      color: #fff;
      padding: 12px 20px;
      text-align: center;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .preview-banner a { color: #fff; margin-left: 16px; text-decoration: underline; }

    .preview-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .preview-meta {
      background: var(--hover-bg);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: var(--font-desc-size);
      border: 1px solid var(--border);
    }
    .preview-meta dt { color: var(--text-muted); font-weight: 500; margin-top: 8px; }
    .preview-meta dt:first-child { margin-top: 0; }
    .preview-meta dd { margin: 4px 0 0 0; color: var(--text-secondary); }
    .preview-meta code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: var(--font-small-size); }

    /* 블로그 카드 */
    .blog-card {
      background: var(--card);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      overflow: hidden;
    }

    /* 히어로 이미지 */
    .blog-hero {
      width: 100%;
      max-height: 280px;
      overflow: hidden;
      background: var(--bg-secondary);
    }
    .blog-hero-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* 헤더 */
    .blog-header {
      padding: 24px 24px 8px;
    }
    .blog-title {
      font-size: var(--font-2xl-size);
      font-weight: 700;
      line-height: 1.4;
      color: var(--text);
      margin-bottom: 16px;
    }
    .blog-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .blog-date {
      font-size: var(--font-meta-size);
      color: var(--text-muted);
    }
    .blog-summary {
      font-size: var(--font-body-size);
      line-height: 1.7;
      color: var(--text-secondary);
      padding: 16px;
      background: var(--hover-bg);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    /* 본문 */
    .blog-content {
      padding: 24px;
    }
    .blog-paragraph {
      font-size: var(--font-body-size);
      line-height: 1.85;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }
    .blog-paragraph:last-child { margin-bottom: 0; }

    .blog-heading {
      font-size: var(--font-lg-size);
      font-weight: 600;
      color: var(--text);
      margin: 32px 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .blog-heading:first-child { margin-top: 0; }

    /* 이미지 */
    .blog-figure {
      margin: 24px 0;
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
    }
    .blog-figure.blog-table {
      width: fit-content;
      max-width: 100%;
    }
    .blog-image {
      width: 100%;
      height: auto;
      max-height: 800px;
      object-fit: contain;
      display: block;
    }
    .blog-caption {
      padding: 12px 16px;
      font-size: var(--font-meta-size);
      color: var(--text-muted);
      text-align: center;
      background: var(--hover-bg);
      border-top: 1px solid var(--border);
    }

    /* 인용문 */
    .blog-quote {
      margin: 24px 0;
      padding: 16px 20px;
      background: rgba(249, 115, 22, 0.08);
      border-left: 3px solid #f97316;
      border-radius: 0 8px 8px 0;
      font-size: var(--font-body-size);
      line-height: 1.7;
      color: var(--text-secondary);
      font-style: italic;
    }

    /* 비디오 */
    .blog-video .blog-video-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      height: 0;
      overflow: hidden;
    }
    .blog-video .blog-video-wrapper iframe {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      border: none;
    }

    /* 표 */
    .table-title {
      padding: 12px 16px;
      font-size: var(--font-title-size);
      font-weight: 600;
      color: var(--text);
      background: var(--hover-bg);
      border-bottom: 1px solid var(--border);
    }
    .blog-table-wrapper {
      margin: 0;
      width: fit-content;
      max-width: 100%;
    }
    .wiki-table {
      width: auto;
      min-width: 50%;
      border-collapse: collapse;
      font-size: var(--font-body-size);
    }
    .wiki-table th, .wiki-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .wiki-table th {
      background: var(--hover-bg);
      font-weight: 600;
      color: var(--text);
    }
    .wiki-table td {
      color: var(--text-secondary);
    }
    .wiki-table tbody tr:hover {
      background: var(--hover-bg);
    }
    .wiki-table tbody tr:last-child td {
      border-bottom: none;
    }
    .wiki-table a {
      color: #60a5fa;
      font-weight: 500;
    }
    .wiki-table a:hover {
      color: #34d399;
    }

    /* 출처 */
    .blog-sources {
      padding: 24px;
      border-top: 1px solid var(--border);
    }
    .blog-sources-title {
      font-size: var(--font-title-size);
      font-weight: 600;
      color: var(--text);
      margin-bottom: 12px;
    }
    .blog-sources-list {
      list-style: disc;
      padding-left: 20px;
      margin: 0;
    }
    .blog-sources-list li {
      font-size: var(--font-small-size);
      line-height: 1.5;
      margin-bottom: 4px;
    }
    .blog-sources-list a {
      color: var(--text-secondary);
    }
    .blog-sources-list a:hover {
      color: var(--primary);
      text-decoration: underline;
    }

    /* 관련 게임/문서 */
    .blog-related-games {
      padding: 24px;
      border-top: 1px solid var(--border);
    }
    .blog-related-title {
      font-size: var(--font-title-size);
      font-weight: 600;
      color: var(--text);
      margin-bottom: 16px;
    }
    .blog-related-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }
    .blog-related-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: var(--hover-bg);
      border-radius: 8px;
      text-decoration: none;
      border: 1px solid transparent;
      transition: all 0.2s;
    }
    .blog-related-card:hover {
      background: var(--card-hover);
      border-color: var(--border);
    }
    .blog-related-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      object-fit: cover;
    }
    .blog-related-name {
      font-size: var(--font-desc-size);
      font-weight: 500;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 모바일 반응형 */
    @media (max-width: 768px) {
      .blog-header, .blog-content, .blog-related-games, .blog-sources {
        padding: 16px;
      }
      .blog-title { font-size: var(--font-xl-size); }
      .blog-heading { font-size: var(--font-title-size); }
      .blog-figure { margin: 16px -16px; border-radius: 0; border-left: none; border-right: none; }
      .blog-related-grid { grid-template-columns: repeat(2, 1fr); }
      .blog-figure.blog-table { width: 100%; margin: 16px 0; }
      .wiki-table { width: 100%; min-width: 400px; }
      .wiki-table th, .wiki-table td { padding: 10px 12px; font-size: var(--font-desc-size); }
    }
  </style>
</head>
<body>
  <div class="preview-banner">
    📚 위키 미리보기 - 실제 사이트 스타일 적용
    <a href="javascript:location.reload()">새로고침</a>
  </div>

  <div class="preview-container">
    <dl class="preview-meta">
      <dt>상태</dt>
      <dd><strong>${report.status || 'draft'}</strong></dd>
      <dt>카테고리</dt>
      <dd><code>${category}</code></dd>
      <dt>Slug</dt>
      <dd><code>${slug}</code></dd>
      <dt>키워드</dt>
      <dd>${report.keywords || '-'}</dd>
    </dl>

    <article class="blog-card">
      ${thumbnailHtml}

      <header class="blog-header">
        <h1 class="blog-title">${escapeHtml(title)}</h1>
        <div class="blog-meta">
          <time class="blog-date">${formatDateKorean(date)}</time>
        </div>
        ${summary ? `<p class="blog-summary">${summary}</p>` : ''}
      </header>

      <div class="blog-content">
        ${renderContent(content)}
      </div>

      ${renderSources(sources)}
      ${renderRelatedGames(relatedGames)}
      ${renderRelatedArticles(relatedArticles, category)}
    </article>
  </div>
</body>
</html>`;
}

/**
 * 메인 실행
 */
function main() {
  console.log('\n🔍 위키 미리보기 생성\n');

  // 위키 로드
  const report = loadWiki(targetCategory, targetSlug);
  console.log(`📄 ${report.title}`);
  console.log(`   category: ${report.category}`);
  console.log(`   slug: ${report.slug}`);
  console.log(`   status: ${report.status || 'draft'}\n`);

  // preview 폴더 생성
  if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  }

  // HTML 생성
  const html = generatePreviewHtml(report);
  const outputPath = path.join(PREVIEW_DIR, 'wiki-preview.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✅ 미리보기 생성 완료!`);
  console.log(`   ${outputPath}\n`);
  console.log(`💡 브라우저에서 열기:`);
  console.log(`   file://${outputPath.replace(/\\/g, '/')}\n`);

  // Windows에서 자동으로 브라우저 열기 시도
  const isWindows = process.platform === 'win32' || process.env.WSL_DISTRO_NAME;
  if (isWindows) {
    const winPath = outputPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
    console.log(`   또는 Windows 경로: ${winPath}\n`);
  }
}

main();
