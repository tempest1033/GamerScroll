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
 * 본문 렌더링
 */
function renderContent(content) {
  const result = [];

  content.forEach(block => {
    switch (block.type) {
      case 'text':
        const paragraphs = block.value.split('\n\n').map(p =>
          `<p class="blog-paragraph">${p.replace(/\n/g, '<br>')}</p>`
        ).join('');
        result.push(paragraphs);
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
