/**
 * 이슈 리포트 초안 미리보기 스크립트
 * - 이미지 다운로드 없이 외부 URL 프록시로 바로 렌더링
 * - docs/preview/issue-preview.html 생성
 *
 * 사용법:
 *   node scripts/preview-issue.js                    # 최신 draft 미리보기
 *   node scripts/preview-issue.js [slug]             # 특정 slug 미리보기
 *   node scripts/preview-issue.js --list             # draft 목록 보기
 */

const fs = require('fs');
const path = require('path');

const ISSUE_DIR = path.join(__dirname, '..', 'reports', 'issue');
const PREVIEW_DIR = path.join(__dirname, '..', 'docs', 'preview');
const STYLES_PATH = path.join(__dirname, '..', 'src', 'styles.css');

// CLI 인자 파싱
const args = process.argv.slice(2);

// --list 옵션
if (args.includes('--list')) {
  listDrafts();
  process.exit(0);
}

// slug 지정 또는 최신 draft
const targetSlug = args[0] || null;

/**
 * draft 목록 출력
 */
function listDrafts() {
  const files = fs.readdirSync(ISSUE_DIR).filter(f => f.endsWith('.json'));

  console.log('\n📋 이슈 리포트 목록\n');

  const reports = files.map(f => {
    const content = fs.readFileSync(path.join(ISSUE_DIR, f), 'utf-8').replace(/^\uFEFF/, '');
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
}

/**
 * 이슈 리포트 로드
 */
function loadIssueReport(slug) {
  if (slug) {
    const filePath = path.join(ISSUE_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 파일을 찾을 수 없습니다: ${slug}.json`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(content);
  }

  // slug 없으면 최신 draft 찾기
  const files = fs.readdirSync(ISSUE_DIR).filter(f => f.endsWith('.json'));
  let latestDraft = null;
  let latestDate = '';

  for (const f of files) {
    const content = fs.readFileSync(path.join(ISSUE_DIR, f), 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(content);
    if (data.status === 'draft' && (data.date || '') >= latestDate) {
      latestDate = data.date || '';
      latestDraft = data;
    }
  }

  if (!latestDraft) {
    console.error('❌ draft 상태의 이슈 리포트가 없습니다.');
    process.exit(1);
  }

  return latestDraft;
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
  let html = '<div class="blog-table-wrapper"><table>';
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
            <img class="blog-image" src="${imgSrc}" alt="${escapeHtml(block.caption)}" loading="lazy">
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

      case 'ad':
        // 미리보기에서는 광고 플레이스홀더
        result.push(`<div class="preview-ad-placeholder">[광고 영역]</div>`);
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
 * 미리보기 HTML 생성
 */
function generatePreviewHtml(report) {
  const { slug, title, date, thumbnail, summary, content = [], sources = [] } = report;

  // CSS 로드
  let cssContent = '';
  if (fs.existsSync(STYLES_PATH)) {
    cssContent = fs.readFileSync(STYLES_PATH, 'utf-8');
  }

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
    ${cssContent}

    /* 미리보기 전용 스타일 */
    body {
      background: var(--bg-primary, #0a0a0b);
      color: var(--text-primary, #e4e4e7);
    }
    .preview-banner {
      background: linear-gradient(90deg, #f59e0b, #d97706);
      color: #000;
      padding: 12px 20px;
      text-align: center;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .preview-banner a {
      color: #000;
      margin-left: 16px;
    }
    .preview-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .preview-ad-placeholder {
      background: rgba(255,255,255,0.05);
      border: 2px dashed rgba(255,255,255,0.2);
      padding: 40px;
      text-align: center;
      color: rgba(255,255,255,0.4);
      margin: 24px 0;
      border-radius: 8px;
    }
    /* 표 스타일 */
    .blog-table-wrapper {
      overflow-x: auto;
      margin: 24px 0;
      -webkit-overflow-scrolling: touch;
    }
    .blog-table-wrapper table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      min-width: 500px;
    }
    .blog-table-wrapper th,
    .blog-table-wrapper td {
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.15);
      text-align: left;
    }
    .blog-table-wrapper th {
      background: rgba(255,255,255,0.08);
      font-weight: 600;
      color: #fafafa;
      white-space: nowrap;
    }
    .blog-table-wrapper td {
      color: #d4d4d8;
    }
    .blog-table-wrapper tr:hover td {
      background: rgba(255,255,255,0.03);
    }
    @media (max-width: 768px) {
      .blog-table-wrapper {
        margin: 16px -16px;
        padding: 0 16px;
      }
    }
    .preview-meta {
      background: rgba(255,255,255,0.05);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .preview-meta dt { color: rgba(255,255,255,0.5); }
    .preview-meta dd { margin: 0 0 8px 0; }
  </style>
</head>
<body>
  <div class="preview-banner">
    📝 미리보기 모드 - 이미지는 외부 프록시 사용 중
    <a href="javascript:location.reload()">새로고침</a>
  </div>

  <div class="preview-container">
    <dl class="preview-meta">
      <dt>상태</dt>
      <dd><strong>${report.status || 'draft'}</strong></dd>
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
        ${summary ? `<p class="blog-summary">${escapeHtml(summary)}</p>` : ''}
      </header>

      <div class="blog-content">
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
  console.log('\n🔍 이슈 리포트 미리보기 생성\n');

  // 리포트 로드
  const report = loadIssueReport(targetSlug);
  console.log(`📄 ${report.title}`);
  console.log(`   slug: ${report.slug}`);
  console.log(`   status: ${report.status || 'draft'}\n`);

  // preview 폴더 생성
  if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  }

  // HTML 생성
  const html = generatePreviewHtml(report);
  const outputPath = path.join(PREVIEW_DIR, 'issue-preview.html');
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
