/**
 * 게임 위키 개별 항목 페이지
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

// 모바일 빌드 여부
const isMobileBuild = process.env.MOBILE_BUILD === 'true';
const siteBaseUrl = isMobileBuild ? 'https://m.gamerscroll.com' : 'https://gamerscroll.com';

// 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);
// 카테고리 정보
const categoryInfo = {
  business: { name: '비즈니스', desc: '업계 지표, 수익 구조, 성장 전략' },
  tech: { name: '기술', desc: '게임 엔진, 개발 기술, 제작 파이프라인' },
  history: { name: '히스토리', desc: '게임 역사, 주요 사건, 업계 변화' },
  knowledge: { name: '지식', desc: '장르, 용어, 기초 지식' }
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

// docs 폴더 경로 (모바일/PC 구분)
const docsDir = isMobileBuild
  ? path.join(__dirname, '../../../docs-mobile')
  : path.join(__dirname, '../../../docs');

/**
 * 로컬 위키 이미지 경로 반환 (폴백: 외부 URL)
 * @param {string} category - 카테고리 (business, tech, history, knowledge)
 * @param {string} slug - 문서 slug
 * @param {string} originalUrl - 원본 외부 URL
 * @param {string} imageType - 'thumbnail' 또는 인덱스 번호
 */
function getLocalWikiImagePath(category, slug, originalUrl, imageType) {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;

  const ext = '.webp';
  let localPath;
  if (imageType === 'thumbnail') {
    localPath = `/assets/images/wiki/${category}/${slug}/thumbnail${ext}`;
  } else {
    // content 이미지는 01, 02, 03... 형식
    const idx = String(imageType).padStart(2, '0');
    localPath = `/assets/images/wiki/${category}/${slug}/${idx}${ext}`;
  }

  // 로컬 파일이 존재하면 로컬 경로, 없으면 프록시 URL 폴백
  const fullPath = path.join(docsDir, localPath);
  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}`;
}

const renderContentBlocks = (content = [], category = '', slug = '') => {
  if (!Array.isArray(content) || content.length === 0) return '';
  const result = [];
  let imageIndex = 0;

  content.forEach((block) => {
    switch (block.type) {
      case 'text':
        const paragraphs = String(block.value || '').split('\n\n').map(p => {
          // 마크다운 볼드 변환: **텍스트** → <strong>텍스트</strong>
          const formatted = p
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
          return `<p class="blog-paragraph">${formatted}</p>`;
        }).join('');
        result.push(paragraphs);
        break;

      case 'image':
        if (!block.src) break;
        imageIndex++;
        const imgSrc = getLocalWikiImagePath(category, slug, block.src, imageIndex);
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
        const tableHeaders = block.headers.map(h => `<th>${h}</th>`).join('');
        const tableRows = block.rows.map(row =>
          `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
        ).join('');
        result.push(`
          <figure class="blog-figure blog-table">
            ${block.caption ? `<div class="table-title">${block.caption}</div>` : ''}
            <table class="wiki-table">
              <thead><tr>${tableHeaders}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </figure>
        `);
        break;

      case 'ad':
        break;

      default:
        break;
    }
  });

  return result.join('');
};

/**
 * 위키 개별 항목 페이지 생성
 * @param {Object} params
 * @param {Object} params.article - 위키 항목 데이터
 * @param {string} params.category - 카테고리 키 (business, tech, history, knowledge)
 * @param {Array} params.relatedArticles - 관련 항목 목록
 * @param {Object} params.prevNext - 이전/다음 항목 {prev, next}
 * @param {Array} params.issueReports - 이슈 리포트 목록
 * @param {Object} params.allWikiData - 전체 위키 데이터
 */
function generateWikiArticlePage({ article, category, relatedArticles = [], prevNext = {}, issueReports = [], allWikiData = {} }) {
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

  // 관련 게임 찾기 (키워드 매칭)
  const findRelatedGames = (text) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      if (text.includes(name) && game.slug) {
        found.push({ name, ...game });
        if (found.length >= 4) break;
      }
    }
    return found;
  };
  const fullText = (article.content || []).filter(b => b.type === 'text').map(b => b.value).join(' ') + ' ' + (article.title || '');
  const relatedGames = findRelatedGames(fullText);
  const relatedGamesHtml = relatedGames.length > 0 ? `
    <div class="blog-related-games">
      <h3 class="blog-related-title">관련 게임</h3>
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

  // 관련 이슈 리포트 (수동 지정)
  const findIssueBySlug = (slug) => issueReports.find(r => r.slug === slug);
  const relatedIssuesList = (article.relatedIssues || []).map(slug => findIssueBySlug(slug)).filter(Boolean).slice(0, 4);

  // 관련 문서 (위키 + 이슈 합침)
  const hasRelatedDocs = relatedArticles.length > 0 || relatedIssuesList.length > 0;
  const relatedHTML = hasRelatedDocs
    ? `
      <div class="blog-related-issues">
        <h3 class="blog-related-title">관련 문서</h3>
        <div class="blog-related-issues-list">
          ${relatedArticles.map(item => {
            const thumb = item.thumbnail
              ? getLocalWikiImagePath(item.category, item.slug, item.thumbnail, 'thumbnail')
              : '/favicon.svg';
            return `
            <a href="/wiki/${item.category}/${item.slug}/" class="blog-related-issue-card">
              <img class="blog-related-issue-thumb" src="${thumb}" alt="" loading="lazy" data-img-fallback-src="/favicon.svg">
              <span class="blog-related-issue-title">${item.title}</span>
            </a>
          `;
          }).join('')}
          ${relatedIssuesList.map(issue => `
            <a href="/trend/issue/${issue.slug}/" class="blog-related-issue-card">
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
        <h3 class="blog-sources-title">참고 자료</h3>
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
        ? `<a href="/wiki/${category}/${prevNext.prev.slug}/" class="trend-nav-btn prev">‹ 이전</a>`
        : '<span class="trend-nav-btn disabled">‹ 이전</span>'
      }
      <a href="/wiki/" class="trend-nav-btn list">목록</a>
      ${prevNext.next
        ? `<a href="/wiki/${category}/${prevNext.next.slug}/" class="trend-nav-btn next">다음 ›</a>`
        : '<span class="trend-nav-btn disabled">다음 ›</span>'
      }
    </div>
  `;

  const content = `
    <section class="section active" id="wiki-article">
      <article class="page-container issue-container">
        ${topAds}

        <div class="blog-card">
          ${article.thumbnail ? `
          <div class="blog-hero">
            <img src="${getLocalWikiImagePath(category, article.slug, article.thumbnail, 'thumbnail')}" class="blog-hero-image" alt="" loading="eager">
          </div>
          ` : ''}

          <header class="blog-header">
            <h1 class="blog-title">${article.title}</h1>
            ${metaHtml}
            ${article.summary ? `<p class="blog-summary">${article.summary}</p>` : ''}
          </header>

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

  const metaKeywords = keywordText || '게임 위키, 게임 용어';

  return wrapWithLayout(content, {
    currentPage: 'wiki',
    title: article.title,
    description: article.summary || `${article.title}에 대한 게임 업계 심층 분석`,
    keywords: metaKeywords,
    canonical: `${siteBaseUrl}/wiki/${category}/${article.slug}/`,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 위키', url: `${siteBaseUrl}/wiki/` },
      { name: catInfo.name, url: `${siteBaseUrl}/wiki/#${category}` },
      { name: article.title, url: `${siteBaseUrl}/wiki/${category}/${article.slug}/` }
    ]
  });
}

module.exports = { generateWikiArticlePage };
