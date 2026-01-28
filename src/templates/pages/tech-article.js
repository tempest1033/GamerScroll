/**
 * 테크 개별 항목 페이지
 * - 이슈 리포트와 동일한 블로그 스타일
 * - 블록 기반 콘텐츠 렌더링
 */

const path = require('path');
const fs = require('fs');
const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateMultiplexAdSlot } = require('../layout');

// games.json 로드 (게임 아이콘용)
let gamesMap = {};
try {
  const gamesPath = path.join(__dirname, '../../../data/games.json');
  const data = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
  gamesMap = data.games || {};
} catch (e) {
  // games.json 없으면 무시
}

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);
// 카테고리 정보
const categoryInfo = {
  normal: { name: '일반', desc: '개발 도구, 기술 트렌드' },
  ai: { name: 'AI', desc: 'AI 기술, 도구, 활용법' },
  vibecoding: { name: '바이브코딩', desc: '바이브 코딩, AI 코딩' }
};

// 날짜 형식화 함수 (2026-01-01 → 2026년 1월 1일)
function formatDateKorean(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const year = parseInt(match[1]);
  const month = parseInt(match[2]);
  const day = parseInt(match[3]);
  return `${year}년 ${month}월 ${day}일`;
}

const escapeHtmlAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * 마크다운 링크를 HTML 앵커 태그로 변환
 */
function parseMarkdownLinks(str) {
  const escaped = escapeHtmlAttr(str);
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
}

/**
 * 마크다운 표를 HTML table로 변환
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
  html += '<thead><tr>';
  headers.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => { html += `<td>${cell}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

// docs 폴더 경로 (통합 빌드)
const docsDir = path.join(__dirname, '../../../docs');

/**
 * 로컬 테크 이미지 경로 반환 (폴백: 외부 URL)
 */
function getLocalTechImagePath(category, slug, originalUrl, imageType) {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;

  const ext = '.webp';
  let localPath;
  let width = 960;  // 본문 이미지 기본 크기

  if (imageType === 'thumbnail' || imageType === 'thumbnail-lg') {
    localPath = `/assets/images/tech/${category}/${slug}/thumbnail${ext}`;
    width = 1200;
  } else if (imageType === 'thumbnail-sm') {
    localPath = `/assets/images/tech/${category}/${slug}/thumbnail-sm${ext}`;
    width = 480;
  } else {
    const idx = String(imageType).padStart(2, '0');
    localPath = `/assets/images/tech/${category}/${slug}/${idx}${ext}`;
  }

  const fullPath = path.join(docsDir, localPath);
  if (fs.existsSync(fullPath)) {
    return localPath;
  }

  // thumbnail-sm 폴백: 기존 thumbnail.webp 확인
  if (imageType === 'thumbnail-sm') {
    const fallbackPath = path.join(docsDir, `/assets/images/tech/${category}/${slug}/thumbnail${ext}`);
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/tech/${category}/${slug}/thumbnail${ext}`;
    }
  }

  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp`;
}

const renderContentBlocks = (content = [], category = '', slug = '') => {
  if (!Array.isArray(content) || content.length === 0) return '';
  const result = [];
  let imageIndex = 0;

  content.forEach((block) => {
    switch (block.type) {
      case 'text':
        const paragraphs = String(block.value || '').split('\n\n').map(p => {
          const trimmed = p.trim();
          // 마크다운 표 처리
          if (trimmed.startsWith('|') && trimmed.includes('|---')) {
            const tableHtml = parseMarkdownTable(trimmed);
            if (tableHtml) return tableHtml;
          }
          const formatted = trimmed
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^- /gm, '• ')
            .replace(/\n- /g, '\n• ')
            .replace(/\n/g, '<br>');
          return trimmed ? `<p class="blog-paragraph">${formatted}</p>` : '';
        }).filter(p => p).join('');
        result.push(paragraphs);
        break;

      case 'image':
        if (!block.src) break;
        imageIndex++;
        const imgSrc = getLocalTechImagePath(category, slug, block.src, imageIndex);
        const altText = escapeHtmlAttr(block.alt || block.caption || '');
        const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
        result.push(`
          <figure class="blog-figure">
            <img class="blog-image" src="${imgSrc}" alt="${altText}" loading="lazy" data-img-fallback="parent-hide">
            ${caption}
          </figure>
        `);
        break;

      case 'quote':
        if (!block.value) break;
        result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
        break;

      case 'video':
        const videoUrl = block.url || '';
        const videoMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (videoMatch) {
          const videoId = videoMatch[1];
          const videoCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure blog-video">
              <div class="blog-video-wrapper">
                <iframe
                  src="https://www.youtube.com/embed/${videoId}"
                  title="${block.caption || 'YouTube video'}"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                  loading="lazy">
                </iframe>
              </div>
              ${videoCaption}
            </figure>
          `);
        }
        break;

      case 'heading':
        if (!block.value) break;
        result.push(`<h2 class="blog-heading">${block.value}</h2>`);
        break;

      case 'table':
        if (!block.headers || !block.rows) break;
        const tableHeaders = block.headers.map(h => `<th>${escapeHtmlAttr(h)}</th>`).join('');
        const tableRows = block.rows.map(row =>
          `<tr>${row.map(cell => `<td>${parseMarkdownLinks(cell)}</td>`).join('')}</tr>`
        ).join('');
        result.push(`
          <figure class="blog-figure blog-table">
            ${block.caption ? `<div class="table-title">${escapeHtmlAttr(block.caption)}</div>` : ''}
            <table class="wiki-table">
              <thead><tr>${tableHeaders}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </figure>
        `);
        break;

      case 'ad':
        break;

      case 'link':
        if (block.url && block.text) {
          let iconHtml = '';
          if (block.url.startsWith('/games/')) {
            const gameSlug = block.url.replace('/games/', '').replace(/\/$/, '');
            for (const [name, game] of Object.entries(gamesMap)) {
              if (game.slug === gameSlug && game.icon) {
                iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="" loading="lazy">`;
                break;
              }
            }
          }
          const subtext = block.subtext ? `<span class="blog-link-subtext">${block.subtext}</span>` : '';
          result.push(`<a href="${block.url}" class="blog-link-button">${iconHtml}<div class="blog-link-content"><span class="blog-link-text">${block.text}</span>${subtext}</div><span class="blog-link-arrow">›</span></a>`);
        }
        break;

      default:
        break;
    }
  });

  return result.join('');
};

/**
 * 테크 개별 항목 페이지 생성
 */
function generateTechArticlePage({ article, category, relatedArticles = [], prevNext = {}, issueReports = [], allTechData = {} }) {
  const catInfo = categoryInfo[category] || { name: category, desc: '' };

  const keywordText = typeof article.keywords === 'string' ? article.keywords : '';
  const metaParts = [];
  if (catInfo.name) {
    metaParts.push(`<span class="blog-date">${catInfo.name}</span>`);
  }
  if (article.date) {
    metaParts.push(`<time class="blog-date">${formatDateKorean(article.date)}</time>`);
  }
  const metaHtml = metaParts.length > 0 ? `<div class="blog-meta">${metaParts.join('')}</div>` : '';

  // 관련 게임 찾기
  const findRelatedGames = (text) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      const aliases = game.aliases || [];
      const allNames = [name, ...aliases];
      if (allNames.some(n => text.includes(n)) && game.slug) {
        found.push({ name, ...game });
        if (found.length >= 4) break;
      }
    }
    return found;
  };

  let relatedGames = [];
  if ('relatedGames' in article) {
    relatedGames = article.relatedGames.map(item => {
      const slugValue = typeof item === 'string' ? item : item.slug;
      const game = Object.entries(gamesMap).find(([_, g]) => g.slug === slugValue);
      if (game) return { name: game[0], ...game[1] };
      return null;
    }).filter(Boolean);
  } else {
    const fullText = (article.content || []).filter(b => b.type === 'text').map(b => b.value).join(' ') + ' ' + (article.title || '');
    relatedGames = findRelatedGames(fullText);
  }
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <div class="blog-related-title">관련 게임</div>
      <div class="blog-related-grid">
        ${relatedGames.map(g => `
          <a href="/games/${g.slug}/" class="blog-related-card">
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 이슈 리포트
  const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
  const relatedIssuesList = (article.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);

  // 관련 문서
  const hasRelatedDocs = relatedArticles.length > 0 || relatedIssuesList.length > 0;
  const relatedHTML = hasRelatedDocs
    ? `
      <div class="blog-related-issues">
        <div class="blog-related-title">관련 문서</div>
        <div class="blog-related-issues-list">
          ${relatedArticles.map(item => {
            const thumb = item.thumbnail
              ? getLocalTechImagePath(item.category, item.slug, item.thumbnail, 'thumbnail')
              : '/favicon.svg';
            return `
            <a href="/tech/${item.category}/${item.slug}/" class="blog-related-issue-card">
              <img class="blog-related-issue-thumb" src="${thumb}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
              <span class="blog-related-issue-title">${item.title}</span>
            </a>
          `;
          }).join('')}
          ${relatedIssuesList.map(issue => `
            <a href="/magazine/issue/${issue.slug}/" class="blog-related-issue-card">
              <img class="blog-related-issue-thumb" src="/assets/images/issue/${issue.slug}/thumbnail.webp" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
              <span class="blog-related-issue-title">${issue.title}</span>
            </a>
          `).join('')}
        </div>
      </div>
    `
    : '';

  const sources = article.sources || [];
  const sourcesHTML = sources.length > 0
    ? `
      <div class="blog-sources">
        <div class="blog-sources-title">참고 자료</div>
        <ul class="blog-sources-list">
          ${sources.map(src => {
            const label = src.title ? `${src.name} - ${src.title}` : src.name;
            return `<li><a href="${src.url}" target="_blank" rel="noopener">${label}</a></li>`;
          }).join('')}
        </ul>
      </div>
    `
    : '';

  const navHTML = `
    <div class="trend-detail-nav">
      ${prevNext.prev
        ? `<a href="/tech/${category}/${prevNext.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>`
        : '<span class="trend-nav-btn disabled">‹ 이전</span>'
      }
      <a href="/tech/" class="trend-nav-btn list">목록</a>
      ${prevNext.next
        ? `<a href="/tech/${category}/${prevNext.next.slug}/" class="trend-nav-btn next">다음 ›</a>`
        : '<span class="trend-nav-btn disabled">다음 ›</span>'
      }
    </div>
  `;

  const content = `
    <section class="section active" id="tech-article">
      <article class="page-container issue-container">
        ${topAds}

        <div class="blog-card">
          <header class="blog-header">
            <h1 class="blog-title">${article.title}</h1>
            ${metaHtml}
            ${article.summary ? `<p class="blog-summary">${article.summary}</p>` : ''}
          </header>

          ${article.thumbnail ? `
          <figure class="blog-figure">
            <img src="${getLocalTechImagePath(category, article.slug, article.thumbnail, 'thumbnail')}" class="blog-image" alt="" loading="eager">
          </figure>
          ` : ''}

          <div class="blog-content">
            ${renderContentBlocks(article.content, category, article.slug)}
          </div>

          ${relatedGamesHtml}
          ${relatedHTML}
          ${sourcesHTML}
        </div>

        ${generateMultiplexAdSlot(AD_SLOTS.Multiflex001)}
        ${navHTML}
      </article>
    </section>
  `;

  const metaKeywords = keywordText || '테크, 기술, AI, 개발 도구';
  const descriptionText = article.summary || `${article.title}에 대한 심층 분석`;

  const thumbnailPath = article.thumbnail
    ? getLocalTechImagePath(category, article.slug, article.thumbnail, 'thumbnail')
    : null;
  const schemaImage = thumbnailPath
    ? (thumbnailPath.startsWith('/') ? `${siteBaseUrl}${thumbnailPath}` : thumbnailPath)
    : null;

  const articleSchema = {
    headline: article.title,
    description: descriptionText,
    datePublished: article.date,
    dateModified: article.date,
    image: schemaImage
  };

  return wrapWithLayout(content, {
    currentPage: 'tech',
    title: article.title,
    description: descriptionText,
    keywords: metaKeywords,
    canonical: `${siteBaseUrl}/tech/${category}/${article.slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '테크', url: `${siteBaseUrl}/tech/` },
      { name: catInfo.name, url: `${siteBaseUrl}/tech/${category}/` },
      { name: article.title, url: `${siteBaseUrl}/tech/${category}/${article.slug}/` }
    ]
  });
}

module.exports = { generateTechArticlePage };
