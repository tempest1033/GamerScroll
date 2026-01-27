/**
 * 통합 미리보기 스크립트 (위키, 테크, 매거진)
 * - 이미지 다운로드 없이 외부 URL 프록시로 바로 렌더링
 * - docs/preview/{type}-preview.html 생성
 *
 * 사용법:
 *   node scripts/preview.js wiki [category] [slug]   # 위키 미리보기
 *   node scripts/preview.js tech [category] [slug]   # 테크 미리보기
 *   node scripts/preview.js issue [slug]             # 이슈 미리보기
 *   node scripts/preview.js hotpick [slug]           # 핫픽 미리보기
 *   node scripts/preview.js --list                   # 전체 목록
 *   node scripts/preview.js --list wiki              # 위키만 목록
 */

const fs = require('fs');
const path = require('path');

// 경로 설정
const DATA_DIRS = {
  wiki: path.join(__dirname, '..', 'data', 'wiki'),
  tech: path.join(__dirname, '..', 'data', 'tech'),
  issue: path.join(__dirname, '..', 'reports', 'issue'),
  hotpick: path.join(__dirname, '..', 'reports', 'hotpick')
};
const PREVIEW_DIR = path.join(__dirname, '..', 'docs', 'preview');
const GAMES_PATH = path.join(__dirname, '..', 'data', 'games.json');

// 타입별 설정
const TYPE_CONFIG = {
  wiki: {
    name: '위키',
    emoji: '📚',
    urlPrefix: '/wiki/',
    bannerColor: 'linear-gradient(90deg, #f97316, #ea580c)',
    quoteColor: '#f97316',
    hasCategory: true
  },
  tech: {
    name: '테크',
    emoji: '🔧',
    urlPrefix: '/tech/',
    bannerColor: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
    quoteColor: '#3b82f6',
    hasCategory: true
  },
  issue: {
    name: '이슈',
    emoji: '📰',
    urlPrefix: '/trends/',
    bannerColor: 'linear-gradient(90deg, #10b981, #059669)',
    quoteColor: '#10b981',
    hasCategory: false
  },
  hotpick: {
    name: '핫픽',
    emoji: '🔥',
    urlPrefix: '/trends/hotpick/',
    bannerColor: 'linear-gradient(90deg, #f59e0b, #d97706)',
    quoteColor: '#f59e0b',
    hasCategory: false
  }
};

// 게임 데이터 로드
let gamesData = {};
if (fs.existsSync(GAMES_PATH)) {
  let content = fs.readFileSync(GAMES_PATH, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const parsed = JSON.parse(content);
  gamesData = parsed.games || parsed;
}

// CLI 인자 파싱
const args = process.argv.slice(2);

// --list 옵션
if (args.includes('--list')) {
  const filterType = args.find(a => a !== '--list' && !a.startsWith('-'));
  listDrafts(filterType);
  process.exit(0);
}

// 타입 파싱
const docType = args[0] || 'wiki';
if (!TYPE_CONFIG[docType]) {
  console.error(`❌ 알 수 없는 타입: ${docType}`);
  console.log('사용 가능한 타입: wiki, tech, issue, hotpick');
  process.exit(1);
}

const config = TYPE_CONFIG[docType];
const targetCategory = config.hasCategory ? args[1] : null;
const targetSlug = config.hasCategory ? args[2] : args[1];

/**
 * draft 목록 출력
 */
function listDrafts(filterType) {
  console.log('\n📋 문서 목록\n');

  const types = filterType ? [filterType] : Object.keys(TYPE_CONFIG);

  types.forEach(type => {
    const cfg = TYPE_CONFIG[type];
    if (!cfg) return;

    const dataDir = DATA_DIRS[type];
    if (!fs.existsSync(dataDir)) return;

    console.log(`${cfg.emoji} === ${cfg.name} ===`);

    if (cfg.hasCategory) {
      // 위키, 테크 (카테고리 있음)
      const categories = fs.readdirSync(dataDir).filter(f =>
        fs.statSync(path.join(dataDir, f)).isDirectory()
      );

      categories.forEach(category => {
        const categoryPath = path.join(dataDir, category);
        const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));
        if (files.length === 0) return;

        console.log(`  📁 ${category}/`);
        const docs = files.map(f => {
          const content = fs.readFileSync(path.join(categoryPath, f), 'utf-8').replace(/^\uFEFF/, '');
          const data = JSON.parse(content);
          return { slug: data.slug, title: data.title, status: data.status || 'draft', date: data.date };
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        docs.forEach(d => {
          const icon = d.status === 'approved' ? '✅' : '📝';
          console.log(`    ${icon} [${d.status}] ${d.title}`);
          console.log(`       → ${type} ${category} ${d.slug}\n`);
        });
      });
    } else {
      // 이슈, 핫픽 (카테고리 없음)
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      const docs = files.map(f => {
        const content = fs.readFileSync(path.join(dataDir, f), 'utf-8').replace(/^\uFEFF/, '');
        const data = JSON.parse(content);
        return { slug: data.slug, title: data.title, status: data.status || 'draft', date: data.date };
      }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      docs.forEach(d => {
        const icon = d.status === 'approved' ? '✅' : '📝';
        console.log(`  ${icon} [${d.status}] ${d.title}`);
        console.log(`     → ${type} ${d.slug}\n`);
      });
    }
  });
}

/**
 * 문서 로드
 */
function loadDocument(type, category, slug) {
  const cfg = TYPE_CONFIG[type];
  const dataDir = DATA_DIRS[type];

  if (cfg.hasCategory && category && slug) {
    // 위키/테크: 카테고리 + slug 지정
    const filePath = path.join(dataDir, category, `${slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 파일을 찾을 수 없습니다: ${category}/${slug}.json`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    return { ...JSON.parse(content), category };
  }

  if (!cfg.hasCategory && slug) {
    // 이슈/핫픽: slug만 지정
    const filePath = path.join(dataDir, `${slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 파일을 찾을 수 없습니다: ${slug}.json`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    return JSON.parse(content);
  }

  // 지정 없으면 최신 draft 찾기
  let latestDraft = null;
  let latestDate = '';
  let latestCategory = '';

  if (cfg.hasCategory) {
    const categories = fs.readdirSync(dataDir).filter(f =>
      fs.statSync(path.join(dataDir, f)).isDirectory()
    );

    for (const cat of categories) {
      const categoryPath = path.join(dataDir, cat);
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
      console.error(`❌ draft 상태의 ${cfg.name} 문서가 없습니다.`);
      process.exit(1);
    }
    return { ...latestDraft, category: latestCategory };
  } else {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

    for (const f of files) {
      const content = fs.readFileSync(path.join(dataDir, f), 'utf-8').replace(/^\uFEFF/, '');
      const data = JSON.parse(content);
      if (data.status === 'draft' && (data.date || '') >= latestDate) {
        latestDate = data.date || '';
        latestDraft = data;
      }
    }

    if (!latestDraft) {
      console.error(`❌ draft 상태의 ${cfg.name} 문서가 없습니다.`);
      process.exit(1);
    }
    return latestDraft;
  }
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
 * 이미지 URL 프록시 처리
 */
function proxyImageUrl(url) {
  if (!url) return url;
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.startsWith('/')) return url;
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
 * 마크다운 링크 → HTML
 */
function parseMarkdownLinks(str) {
  const escaped = escapeHtml(str);
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
}

/**
 * 마크다운 표 → HTML
 */
function parseMarkdownTable(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  if (!lines[0].trim().startsWith('|')) return null;

  const separatorIndex = lines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line.trim()));
  if (separatorIndex < 1) return null;

  function parseCells(line) {
    const cells = line.split('|');
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(cell => cell.trim());
  }

  const headers = parseCells(lines[0]);
  const dataLines = lines.slice(separatorIndex + 1).filter(line => line.trim().startsWith('|'));
  const rows = dataLines.map(line => parseCells(line));

  let html = '<div class="wiki-table-wrapper"><table>';
  html += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
  html += '<tbody>';
  rows.forEach(row => {
    html += '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
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
        const paragraphs = block.value.split('\n\n');
        const rendered = paragraphs.map(p => {
          const trimmed = p.trim();
          if (trimmed.startsWith('|') && trimmed.includes('|---')) {
            const tableHtml = parseMarkdownTable(trimmed);
            if (tableHtml) return tableHtml;
          }
          if (trimmed) {
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

      case 'ad':
        result.push(`<div class="preview-ad-placeholder">[광고 영역]</div>`);
        break;

      case 'list':
        if (block.items && Array.isArray(block.items)) {
          const listItems = block.items.map(item => `<li>${item}</li>`).join('');
          result.push(`<ul class="blog-list">${listItems}</ul>`);
        }
        break;

      case 'game-ranking':
        if (block.items && Array.isArray(block.items)) {
          const rankingItems = block.items.map(item => `
            <div class="game-ranking-item">
              <span class="game-ranking-rank">${item.rank}</span>
              <div class="game-ranking-thumb">
                <img src="${proxyImageUrl(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">
              </div>
              <div class="game-ranking-info">
                <div class="game-ranking-name">${item.name}${item.price ? ` <span class="game-ranking-price">(${item.price})</span>` : ''}</div>
                ${item.desc ? `<div class="game-ranking-desc">${item.desc}</div>` : ''}
              </div>
            </div>
          `).join('');
          result.push(`
            <div class="game-ranking-list">
              ${block.caption ? `<div class="game-ranking-title">${block.caption}</div>` : ''}
              ${rankingItems}
            </div>
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

  const games = gameSlugs.map(slug => {
    for (const [name, data] of Object.entries(gamesData)) {
      if (data.slug === slug) {
        return { slug: data.slug, title: name, icon: data.icon };
      }
    }
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
function renderRelatedArticles(articlePaths, currentCategory, type) {
  if (!articlePaths || articlePaths.length === 0) return '';

  const cfg = TYPE_CONFIG[type];
  const dataDir = DATA_DIRS[type];

  const articles = articlePaths.map(pathStr => {
    let category, slug;
    if (pathStr.includes('/')) {
      [category, slug] = pathStr.split('/');
    } else {
      category = currentCategory;
      slug = pathStr;
    }

    const docPath = cfg.hasCategory
      ? path.join(dataDir, category, `${slug}.json`)
      : path.join(dataDir, `${slug}.json`);

    let title = slug;
    let thumbnail = null;
    if (fs.existsSync(docPath)) {
      try {
        let content = fs.readFileSync(docPath, 'utf-8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const data = JSON.parse(content);
        title = data.title || slug;
        thumbnail = data.thumbnail;
      } catch (e) {}
    }
    return { category, slug, title, thumbnail };
  });

  const urlBase = cfg.hasCategory ? cfg.urlPrefix : cfg.urlPrefix;

  return `
    <div class="blog-related-games">
      <h3 class="blog-related-title">관련 문서</h3>
      <div class="blog-related-grid">
        ${articles.map(a => {
          const href = cfg.hasCategory ? `${cfg.urlPrefix}${a.category}/${a.slug}/` : `${cfg.urlPrefix}${a.slug}/`;
          return `
          <a href="${href}" class="blog-related-card">
            ${a.thumbnail ? `<img src="${proxyImageUrl(a.thumbnail)}" alt="" class="blog-related-icon">` : ''}
            <span class="blog-related-name">${escapeHtml(a.title)}</span>
          </a>
        `;}).join('')}
      </div>
    </div>
  `;
}

/**
 * 미리보기 HTML 생성
 */
function generatePreviewHtml(doc, type) {
  const cfg = TYPE_CONFIG[type];
  const { slug, title, date, thumbnail, summary, content = [], sources = [], relatedGames = [], relatedArticles = [], relatedIssues = [], category } = doc;

  const thumbnailHtml = thumbnail ? `
    <div class="blog-hero">
      <img class="blog-hero-image" src="${proxyImageUrl(thumbnail)}" alt="${escapeHtml(title)} 대표 이미지">
    </div>
  ` : '';

  const categoryHtml = cfg.hasCategory ? `
    <dt>카테고리</dt>
    <dd><code>${category}</code></dd>
  ` : '';

  // relatedArticles 또는 relatedIssues 사용
  const relatedDocs = relatedArticles.length > 0 ? relatedArticles : relatedIssues;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[미리보기] ${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #0a0a0b;
      --bg-secondary: #18181b;
      --card: #18181b;
      --card-hover: #27272a;
      --border: #3f3f46;
      --text: #fafafa;
      --text-secondary: #d4d4d8;
      --text-muted: #a1a1aa;
      --primary: ${cfg.quoteColor};
      --hover-bg: #27272a;
      --radius: 12px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
    }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { color: #34d399; }

    .preview-banner {
      background: ${cfg.bannerColor};
      color: #fff;
      padding: 12px 20px;
      text-align: center;
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .preview-banner a { color: #fff; margin-left: 16px; text-decoration: underline; }

    .preview-container { max-width: 800px; margin: 0 auto; padding: 20px; }

    .preview-meta {
      background: var(--hover-bg);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 0.875rem;
      border: 1px solid var(--border);
    }
    .preview-meta dt { color: var(--text-muted); font-weight: 500; margin-top: 8px; }
    .preview-meta dt:first-child { margin-top: 0; }
    .preview-meta dd { margin: 4px 0 0 0; color: var(--text-secondary); }
    .preview-meta code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; }

    .blog-card {
      background: var(--card);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .blog-hero { width: 100%; max-height: 280px; overflow: hidden; background: var(--bg-secondary); }
    .blog-hero-image { width: 100%; height: 100%; object-fit: cover; display: block; }

    .blog-header { padding: 24px 24px 8px; }
    .blog-title { font-size: 1.75rem; font-weight: 700; line-height: 1.4; color: var(--text); margin-bottom: 16px; }
    .blog-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    .blog-date { font-size: 0.8125rem; color: var(--text-muted); }
    .blog-summary { font-size: 0.9375rem; line-height: 1.7; color: var(--text-secondary); padding: 16px; background: var(--hover-bg); border-radius: 8px; margin-bottom: 16px; }

    .blog-content { padding: 24px; }
    .blog-paragraph { font-size: 0.9375rem; line-height: 1.85; color: var(--text-secondary); margin-bottom: 20px; }
    .blog-paragraph:last-child { margin-bottom: 0; }

    .blog-heading { font-size: 1.25rem; font-weight: 600; color: var(--text); margin: 32px 0 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
    .blog-heading:first-child { margin-top: 0; }

    .blog-figure { margin: 24px 0; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); border: 1px solid var(--border); }
    .blog-figure.blog-table { width: fit-content; max-width: 100%; }
    .blog-image { width: 100%; height: auto; max-height: 800px; object-fit: contain; display: block; }
    .blog-caption { padding: 12px 16px; font-size: 0.8125rem; color: var(--text-muted); text-align: center; background: var(--hover-bg); border-top: 1px solid var(--border); }

    .blog-quote { margin: 24px 0; padding: 16px 20px; background: rgba(${cfg.quoteColor === '#f97316' ? '249, 115, 22' : cfg.quoteColor === '#3b82f6' ? '59, 130, 246' : cfg.quoteColor === '#10b981' ? '16, 185, 129' : '245, 158, 11'}, 0.08); border-left: 3px solid var(--primary); border-radius: 0 8px 8px 0; font-size: 0.9375rem; line-height: 1.7; color: var(--text-secondary); font-style: italic; }

    .blog-video .blog-video-wrapper { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; }
    .blog-video .blog-video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }

    .table-title { padding: 12px 16px; font-size: 1rem; font-weight: 600; color: var(--text); background: var(--hover-bg); border-bottom: 1px solid var(--border); }
    .blog-table-wrapper, .wiki-table-wrapper { margin: 0; width: fit-content; max-width: 100%; overflow-x: auto; }
    .wiki-table { width: auto; min-width: 50%; border-collapse: collapse; font-size: 0.9375rem; }
    .wiki-table th, .wiki-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
    .wiki-table th { background: var(--hover-bg); font-weight: 600; color: var(--text); }
    .wiki-table td { color: var(--text-secondary); }
    .wiki-table tbody tr:hover { background: var(--hover-bg); }
    .wiki-table tbody tr:last-child td { border-bottom: none; }
    .wiki-table a { color: #60a5fa; font-weight: 500; }
    .wiki-table a:hover { color: #34d399; }

    .blog-sources { padding: 24px; border-top: 1px solid var(--border); }
    .blog-sources-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 12px; }
    .blog-sources-list { list-style: disc; padding-left: 20px; margin: 0; }
    .blog-sources-list li { font-size: 0.75rem; line-height: 1.5; margin-bottom: 4px; }
    .blog-sources-list a { color: var(--text-secondary); }
    .blog-sources-list a:hover { color: var(--primary); text-decoration: underline; }

    .blog-related-games { padding: 24px; border-top: 1px solid var(--border); }
    .blog-related-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 16px; }
    .blog-related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .blog-related-card { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--hover-bg); border-radius: 8px; text-decoration: none; border: 1px solid transparent; transition: all 0.2s; }
    .blog-related-card:hover { background: var(--card-hover); border-color: var(--border); }
    .blog-related-icon { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
    .blog-related-name { font-size: 0.875rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .blog-list { margin: 16px 0; padding-left: 24px; }
    .blog-list li { margin-bottom: 8px; color: var(--text-secondary); }

    .preview-ad-placeholder { background: rgba(255,255,255,0.05); border: 2px dashed rgba(255,255,255,0.2); padding: 40px; text-align: center; color: rgba(255,255,255,0.4); margin: 24px 0; border-radius: 8px; }

    .game-ranking-list { margin: 24px 0; }
    .game-ranking-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 12px; }
    .game-ranking-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--hover-bg); border-radius: 8px; margin-bottom: 8px; }
    .game-ranking-rank { font-size: 1.25rem; font-weight: 700; color: var(--primary); width: 32px; text-align: center; }
    .game-ranking-thumb { width: 48px; height: 48px; border-radius: 8px; overflow: hidden; }
    .game-ranking-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .game-ranking-info { flex: 1; }
    .game-ranking-name { font-weight: 500; color: var(--text); }
    .game-ranking-price { color: var(--text-muted); font-size: 0.875rem; }
    .game-ranking-desc { font-size: 0.8125rem; color: var(--text-muted); margin-top: 4px; }

    .blog-link-button { display: flex; align-items: center; justify-content: space-between; padding: 16px; background: var(--hover-bg); border-radius: 8px; margin: 16px 0; border: 1px solid var(--border); transition: all 0.2s; }
    .blog-link-button:hover { background: var(--card-hover); border-color: var(--primary); }
    .blog-link-content { flex: 1; }
    .blog-link-text { font-weight: 500; color: var(--text); }
    .blog-link-subtext { display: block; font-size: 0.8125rem; color: var(--text-muted); margin-top: 4px; }
    .blog-link-arrow { font-size: 1.5rem; color: var(--text-muted); }

    @media (max-width: 768px) {
      .blog-header, .blog-content, .blog-related-games, .blog-sources { padding: 16px; }
      .blog-title { font-size: 1.5rem; }
      .blog-heading { font-size: 1rem; }
      .blog-figure { margin: 16px -16px; border-radius: 0; border-left: none; border-right: none; }
      .blog-related-grid { grid-template-columns: repeat(2, 1fr); }
      .blog-figure.blog-table { width: 100%; margin: 16px 0; }
      .wiki-table { width: 100%; min-width: 400px; }
      .wiki-table th, .wiki-table td { padding: 10px 12px; font-size: 0.875rem; }
    }
  </style>
</head>
<body>
  <div class="preview-banner">
    ${cfg.emoji} ${cfg.name} 미리보기 - 실제 사이트 스타일 적용
    <a href="javascript:location.reload()">새로고침</a>
  </div>

  <div class="preview-container">
    <dl class="preview-meta">
      <dt>상태</dt>
      <dd><strong>${doc.status || 'draft'}</strong></dd>
      ${categoryHtml}
      <dt>Slug</dt>
      <dd><code>${slug}</code></dd>
      <dt>키워드</dt>
      <dd>${doc.keywords || '-'}</dd>
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
      ${renderRelatedArticles(relatedDocs, category, type)}
    </article>
  </div>
</body>
</html>`;
}

/**
 * 메인 실행
 */
function main() {
  const cfg = TYPE_CONFIG[docType];
  console.log(`\n🔍 ${cfg.name} 미리보기 생성\n`);

  const doc = loadDocument(docType, targetCategory, targetSlug);
  console.log(`📄 ${doc.title}`);
  if (cfg.hasCategory) {
    console.log(`   category: ${doc.category}`);
  }
  console.log(`   slug: ${doc.slug}`);
  console.log(`   status: ${doc.status || 'draft'}\n`);

  if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  }

  const html = generatePreviewHtml(doc, docType);
  const outputPath = path.join(PREVIEW_DIR, `${docType}-preview.html`);
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✅ 미리보기 생성 완료!`);
  console.log(`   ${outputPath}\n`);
  console.log(`💡 브라우저에서 열기:`);
  console.log(`   file://${outputPath.replace(/\\/g, '/')}\n`);

  const isWindows = process.platform === 'win32' || process.env.WSL_DISTRO_NAME;
  if (isWindows) {
    const winPath = outputPath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
    console.log(`   또는 Windows 경로: ${winPath}\n`);
  }
}

main();
