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
            processed = processed.replace(/\n/g, '<br>');
            return `<p class="wiki-paragraph">${processed}</p>`;
          }
          return '';
        }).filter(p => p).join('\n');
        result.push(rendered);
        break;

      case 'image':
        const imgSrc = proxyImageUrl(block.src);
        const caption = block.caption ? `<figcaption class="wiki-caption">${block.caption}</figcaption>` : '';
        result.push(`
          <figure class="wiki-figure">
            <img class="wiki-image" src="${imgSrc}" alt="${escapeHtml(block.alt || block.caption)}" loading="lazy">
            ${caption}
          </figure>
        `);
        break;

      case 'heading':
        result.push(`<h2 class="wiki-heading">${block.value}</h2>`);
        break;

      case 'quote':
        result.push(`<blockquote class="wiki-quote">${block.value}</blockquote>`);
        break;

      case 'video':
        const videoMatch = (block.url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (videoMatch) {
          const videoCaption = block.caption ? `<figcaption class="wiki-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="wiki-figure wiki-video">
              <div class="wiki-video-wrapper">
                <iframe src="https://www.youtube.com/embed/${videoMatch[1]}"
                        title="${escapeHtml(block.caption)}"
                        frameborder="0" allowfullscreen loading="lazy"></iframe>
              </div>
              ${videoCaption}
            </figure>
          `);
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
    <div class="wiki-sources">
      <h3 class="wiki-sources-title">정보 출처</h3>
      <ul class="wiki-sources-list">
        ${sources.map(s => `
          <li><a href="${s.url}" target="_blank" rel="nofollow noopener">${s.name} - ${s.title}</a></li>
        `).join('')}
      </ul>
    </div>
  `;
}

/**
 * 미리보기 HTML 생성
 */
function generatePreviewHtml(report) {
  const { slug, title, date, thumbnail, summary, content = [], sources = [], category } = report;

  // CSS 로드
  let cssContent = '';
  if (fs.existsSync(STYLES_PATH)) {
    cssContent = fs.readFileSync(STYLES_PATH, 'utf-8');
  }

  const thumbnailHtml = thumbnail ? `
    <div class="wiki-hero">
      <img class="wiki-hero-image" src="${proxyImageUrl(thumbnail)}" alt="${escapeHtml(title)} 대표 이미지">
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[미리보기] ${escapeHtml(title)}</title>
  <style>
    ${cssContent}

    /* 미리보기 전용 스타일 - 다크 테마 최적화 */
    body {
      background: #0a0a0b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .preview-banner {
      background: linear-gradient(90deg, #10b981, #059669);
      color: #fff;
      padding: 12px 20px;
      text-align: center;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .preview-banner a {
      color: #fff;
      margin-left: 16px;
    }
    .preview-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .preview-meta {
      background: rgba(255,255,255,0.08);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
      color: #d4d4d8;
    }
    .preview-meta dt { color: #a1a1aa; font-weight: 500; }
    .preview-meta dd { margin: 0 0 8px 0; color: #e4e4e7; }
    .preview-meta code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; }

    /* 위키 스타일 */
    .wiki-card {
      background: #18181b;
      border-radius: 12px;
      border: 1px solid #3f3f46;
      overflow: hidden;
    }
    .wiki-hero {
      width: 100%;
      max-height: 280px;
      overflow: hidden;
    }
    .wiki-hero-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .wiki-header {
      padding: 24px;
    }
    .wiki-title {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 12px;
      color: #fafafa;
    }
    .wiki-meta {
      color: #a1a1aa;
      font-size: 0.875rem;
      margin-bottom: 16px;
    }
    .wiki-summary {
      color: #d4d4d8;
      line-height: 1.7;
      padding: 16px;
      background: rgba(16, 185, 129, 0.08);
      border-radius: 8px;
      border-left: 3px solid #10b981;
    }
    .wiki-content {
      padding: 24px;
    }
    .wiki-paragraph {
      line-height: 1.85;
      color: #e4e4e7;
      margin-bottom: 20px;
    }
    .wiki-heading {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 32px 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #3f3f46;
      color: #fafafa;
    }
    .wiki-heading:first-child {
      margin-top: 0;
    }
    .wiki-figure {
      margin: 24px 0;
    }
    .wiki-image {
      width: 100%;
      border-radius: 8px;
    }
    .wiki-caption {
      text-align: center;
      color: #a1a1aa;
      font-size: 0.875rem;
      margin-top: 8px;
    }
    .wiki-quote {
      margin: 24px 0;
      padding: 16px 20px;
      background: rgba(16, 185, 129, 0.12);
      border-left: 3px solid #10b981;
      border-radius: 0 8px 8px 0;
      font-style: italic;
      color: #d4d4d8;
    }
    .wiki-sources {
      padding: 24px;
      border-top: 1px solid #3f3f46;
    }
    .wiki-sources-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 12px;
      color: #e4e4e7;
    }
    .wiki-sources-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .wiki-sources-list li {
      margin-bottom: 8px;
      font-size: 0.875rem;
    }
    .wiki-sources-list a {
      color: #a1a1aa;
      text-decoration: none;
      transition: color 0.2s;
    }
    .wiki-sources-list a:hover {
      color: #34d399;
    }
    /* 표 스타일 */
    .wiki-table-wrapper {
      overflow-x: auto;
      margin: 24px 0;
      -webkit-overflow-scrolling: touch;
    }
    .wiki-table-wrapper table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      min-width: 500px;
    }
    .wiki-table-wrapper th,
    .wiki-table-wrapper td {
      padding: 12px;
      border: 1px solid #3f3f46;
      text-align: left;
    }
    .wiki-table-wrapper th {
      background: #27272a;
      font-weight: 600;
      color: #fafafa;
      white-space: nowrap;
    }
    .wiki-table-wrapper td {
      color: #d4d4d8;
    }
    .wiki-table-wrapper tr:hover td {
      background: rgba(255,255,255,0.03);
    }
    @media (max-width: 768px) {
      .wiki-table-wrapper {
        margin: 16px -16px;
        padding: 0 16px;
      }
    }
  </style>
</head>
<body>
  <div class="preview-banner">
    📚 위키 미리보기 - 이미지는 외부 프록시 사용 중
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

    <article class="wiki-card">
      ${thumbnailHtml}

      <header class="wiki-header">
        <h1 class="wiki-title">${escapeHtml(title)}</h1>
        <div class="wiki-meta">
          <time class="wiki-date">${formatDateKorean(date)}</time>
        </div>
        ${summary ? `<p class="wiki-summary">${escapeHtml(summary)}</p>` : ''}
      </header>

      <div class="wiki-content">
        ${renderContent(content)}
      </div>

      ${renderSources(sources)}
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
