/**
 * 테크 개별 항목 페이지
 * - 이슈 리포트와 동일한 블로그 스타일
 * - 블록 기반 콘텐츠 렌더링
 */

const path = require('path');
const fs = require('fs');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const {
  generateSidebarCategories: sharedSidebarCategories,
  generateSidebarArticles: sharedSidebarArticles
} = require('../components/sidebar');
const { renderTextBlock, parseMarkdownTable: parseMarkdownTableShared } = require('../helpers/content-text');
const { buildWsrvSrcsetAttrs } = require('../helpers/thumbnail');

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
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/**
 * 테이블 셀용 인라인 마크다운 변환 (볼드, 코드, 링크)
 */
function parseTableCell(str) {
  return parseMarkdownLinks(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// 마크다운 표 변환은 공통 helper(content-text)로 위임
const parseMarkdownTable = (text) => parseMarkdownTableShared(text, { tableClass: 'wiki-table-wrapper' });

// 한글/영문 텍스트를 URL-friendly slug로 변환
const toSlug = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// 목차 생성
const renderToc = (content = []) => {
  const headings = content.filter(b => b.type === 'heading' && b.value);
  if (headings.length < 3) return ''; // 3개 미만이면 목차 생략

  const items = headings.map(h => {
    const id = toSlug(h.value);
    return `<li><a href="#${id}">${h.value}</a></li>`;
  }).join('');

  return `
    <nav class="blog-toc">
      <div class="blog-toc-title">목차</div>
      <ol>${items}</ol>
    </nav>
  `;
};

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

// Article body ads keep the dedicated in-article slots; handling matches feed scroll ads.
const IN_ARTICLE_SLOTS = [
  AD_SLOTS.InArticle001, AD_SLOTS.InArticle002, AD_SLOTS.InArticle003, AD_SLOTS.InArticle004, AD_SLOTS.InArticle005
];
function getInArticleAdHTML(adIndex) {
  const slotId = IN_ARTICLE_SLOTS[adIndex % IN_ARTICLE_SLOTS.length];
  return `
  <div class="ad-card ad-card-scroll blog-in-article-ad" data-ad-index="${adIndex + 1}">
    <ins class="adsbygoogle"
         style="display:block"
         data-ad-format="fluid"
         data-ad-layout="in-article"
         data-ad-client="ca-pub-9477874183990825"
         data-ad-slot="${slotId}"></ins>
  </div>`;
}

const renderContentBlocks = (content = [], category = '', slug = '') => {
  if (!Array.isArray(content) || content.length === 0) return '';
  const result = [];
  let imageIndex = 0;
  let sectionCount = 1; // 서문 = 섹션1
  let adCount = 0;

  content.forEach((block) => {
    switch (block.type) {
      case 'text': {
        result.push(renderTextBlock(block.value, { tableClass: 'wiki-table-wrapper' }));
        break;
      }

      case 'image':
        if (!block.src) break;
        imageIndex++;
        const imgSrc = getLocalTechImagePath(category, slug, block.src, imageIndex);
        const altText = escapeHtmlAttr(block.alt || block.caption || '');
        const caption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
        result.push(`
          <figure class="blog-figure">
            <img class="blog-image" src="${imgSrc}"${buildWsrvSrcsetAttrs(imgSrc)} alt="${altText}" width="1200" height="675" loading="lazy" data-img-fallback="parent-hide">
            ${caption}
          </figure>
        `);
        break;

      case 'note':
      case 'chart':
      case 'chart-group':
      case 'ranking-bar':
      case 'ranking-card':
      case 'ranking-compare': {
        const { renderRankingBlock } = require('../helpers/ranking-blocks');
        const __rankingHtml = renderRankingBlock(block, { gamesMap, escapeHtmlAttr });
        if (__rankingHtml) result.push(__rankingHtml);
        break;
      }

      case 'quote':
        if (!block.value) break;
        result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
        break;

      case 'code':
        if (!block.value) break;
        const lang = block.lang || '';
        const codeCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';
        const escapedCode = String(block.value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/^(#.*)$/gm, '<span class="code-comment">$1</span>');
        result.push(`
          <figure class="blog-figure blog-code">
            <pre><code${lang ? ` class="language-${lang}"` : ''}>${escapedCode}</code></pre>
            ${codeCaption}
          </figure>
        `);
        break;

      case 'aside':
        if (!block.value) break;
        const asideTitle = block.title ? `<strong class="aside-title">${block.title}</strong>` : '';
        const asideFormatted = String(block.value)
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/\n/g, '<br>');
        result.push(`
          <aside class="blog-aside">
            ${asideTitle}
            <p>${asideFormatted}</p>
          </aside>
        `);
        break;

      case 'series':
        if (!block.articles || !Array.isArray(block.articles)) break;
        const seriesTitleHtml = block.title ? `<div class="blog-related-title">${block.title}</div>` : '';
        const seriesCards = block.articles.map(article => {
          const partLabel = article.part === 0 ? '목차' : (article.part ? `${article.part}부` : '');
          const articleCategory = article.category || category;
          const href = `/tech/${articleCategory}/${article.slug}/`;
          const thumbUrl = article.thumbnail || '';
          return `
            <a href="${href}" class="blog-related-issue-card blog-series-card">
              <img class="blog-related-issue-thumb" src="${thumbUrl}" alt="${article.title}" loading="lazy">
              <span class="blog-series-tag">${partLabel}</span>
              <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${article.title}</span></span>
            </a>
          `;
        }).join('');
        result.push(`
          <nav class="blog-series">
            ${seriesTitleHtml}
            <div class="blog-related-issues-list">${seriesCards}</div>
          </nav>
        `);
        break;

      case 'video':
        const videoUrl = block.url || '';
        const videoCaption = block.caption ? `<figcaption class="blog-caption">${block.caption}</figcaption>` : '';

        // YouTube
        const videoMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (videoMatch) {
          const videoId = videoMatch[1];
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
          break;
        }

        // Twitter/X
        const twitterMatch = videoUrl.match(/(?:twitter\.com|x\.com)\/(?:i\/|[^\/]+\/)status\/(\d+)/);
        if (twitterMatch) {
          const tweetId = twitterMatch[1];
          result.push(`
            <figure class="blog-figure blog-tweet">
              <div class="blog-tweet-wrapper">
                <blockquote class="twitter-tweet" data-dnt="true">
                  <a href="https://twitter.com/i/status/${tweetId}"></a>
                </blockquote>
              </div>
              ${videoCaption}
            </figure>
          `);
          break;
        }
        break;

      case 'heading':
        if (!block.value) break;
        sectionCount++;
        if (sectionCount % 2 === 0) {
          result.push(getInArticleAdHTML(adCount++));
        }
        const headingId = toSlug(block.value);
        result.push(`<h2 id="${headingId}" class="blog-heading">${block.value}</h2>`);
        break;

      case 'table':
        if (!block.headers || !block.rows) break;
        const tableHeaders = block.headers.map(h => `<th>${parseTableCell(h)}</th>`).join('');
        const tableRows = block.rows.map(row =>
          `<tr>${row.map(cell => `<td>${parseTableCell(cell)}</td>`).join('')}</tr>`
        ).join('');
        result.push(`
          <figure class="blog-figure blog-table">
            ${block.caption ? `<div class="table-title">${escapeHtmlAttr(block.caption)}</div>` : ''}
            <div class="table-scroll">
              <table class="wiki-table">
                <thead><tr>${tableHeaders}</tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
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
                iconHtml = `<img class="blog-link-icon" src="${game.icon}" alt="${name}" loading="lazy">`;
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
function generateTechArticlePage({ article, category, relatedDocs = [], prevNext = {}, issueReports = [], allTechData = {}, allWikiData = {}, reportCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
  const catInfo = categoryInfo[category] || { name: category, desc: '' };

  const keywordText = typeof article.keywords === 'string' ? article.keywords : '';

  // 화면 표시용 dateModified (YYYY-MM-DD): JSON 내부 modifiedAt 우선
  const displayDateModified = article.modifiedAt ? String(article.modifiedAt).slice(0, 10) : null;

  const editorName = article.editor || 'Editor J';
  const metaParts = [];
  metaParts.push(`<span class="blog-editor">${editorName}</span>`);
  if (catInfo.name) {
    metaParts.push(`<span class="blog-date">${catInfo.name}</span>`);
  }
  if (article.date) {
    const pubDate = article.date.slice(0, 10);
    if (displayDateModified && displayDateModified !== pubDate) {
      metaParts.push(`<time class="blog-date">${formatDateKorean(pubDate)} 발행</time>`);
      metaParts.push(`<time class="blog-date">${formatDateKorean(displayDateModified)} 최종 수정</time>`);
    } else {
      metaParts.push(`<time class="blog-date">${formatDateKorean(article.date)}</time>`);
    }
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

  // 수동 지정된 relatedGames가 있으면 사용 (최대 4개)
  let relatedGames = [];
  if (Array.isArray(article.relatedGames) && article.relatedGames.length > 0) {
    relatedGames = article.relatedGames.map(item => {
      const slugValue = typeof item === 'string' ? item : item.slug;
      const game = Object.entries(gamesMap).find(([_, g]) => g.slug === slugValue);
      if (game) return { name: game[0], ...game[1] };
      return null;
    }).filter(Boolean).slice(0, 4);
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
            <img class="blog-related-icon" src="${g.icon || '/favicon.svg'}" alt="${g.name}" loading="lazy" data-img-fallback-src="/favicon.svg">
            <span class="blog-related-name">${g.name}</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  // 관련 문서 (relatedDocs 통합 - wiki/tech/issue 지원)
  const relatedHTML = relatedDocs.length > 0
    ? `
      <div class="blog-related-issues">
        <div class="blog-related-title">관련 문서</div>
        <div class="blog-related-issues-list">
          ${relatedDocs.map(item => {
            if (item.type === 'wiki') {
              const thumb = item.thumbnail
                ? `/assets/images/wiki/${item.category}/${item.slug}/thumbnail.webp`
                : '/favicon.svg';
              return `
              <a href="/wiki/${item.category}/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="${thumb}" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            } else if (item.type === 'tech') {
              const thumb = item.thumbnail
                ? getLocalTechImagePath(item.category, item.slug, item.thumbnail, 'thumbnail')
                : '/favicon.svg';
              return `
              <a href="/tech/${item.category}/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="${thumb}" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            } else if (item.type === 'issue') {
              return `
              <a href="/magazine/issue/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="/assets/images/issue/${item.slug}/thumbnail.webp" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            } else if (item.type === 'insight') {
              return `
              <a href="/magazine/insight/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="/assets/images/insight/${item.slug}/thumbnail.webp" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            } else if (item.type === 'hotpick') {
              return `
              <a href="/magazine/hotpick/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="/assets/images/hotpick/${item.slug}/thumbnail.webp" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            } else if (item.type === 'ranking') {
              const thumb = item.thumbnail
                ? (item.thumbnail.startsWith('/') ? item.thumbnail : `/assets/images/ranking/${item.slug}/thumbnail.webp`)
                : '/favicon.svg';
              return `
              <a href="/magazine/ranking/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="${thumb}" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            }
            return '';
          }).join('')}
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

  // 사이드바: 카테고리 메뉴 (공용 컴포넌트)
  const generateSidebarCategories = () => {
    const counts = {
      issue: reportCounts.issue || 0,
      insight: reportCounts.insight || 0,
      hotpick: reportCounts.hotpick || 0,
      ranking: reportCounts.ranking || 0,
      history: (allWikiData.history || []).length,
      knowledge: (allWikiData.knowledge || []).length,
      business: (allWikiData.business || []).length,
      normal: (allTechData.normal || []).length,
      ai: (allTechData.ai || []).length,
      vibecoding: (allTechData.vibecoding || []).length
    };
    return sharedSidebarCategories(counts, { includeTech: true });
  };

  // 사이드바: 인기/최신 글 (공용 컴포넌트 - 현재 글 하이라이트 유지)
  const generateSidebarArticles = () => {
    if (sidebarPopularArticles.length === 0 && sidebarLatestArticles.length === 0) return '';
    return sharedSidebarArticles(sidebarPopularArticles, sidebarLatestArticles, {
      activeLink: `/tech/${category}/${article.slug}/`
    });
  };

  const sidebarCategoriesHTML = generateSidebarCategories();
  const sidebarArticlesHTML = generateSidebarArticles();
  const sidebarHTML = sidebarCategoriesHTML + sidebarArticlesHTML;

  const sidebarScript = sidebarHTML ? `
    <script>
      (function() {
        var init = function() {
          if (!window.GSUtils || typeof window.GSUtils.toggleSidebarArticleTab !== 'function') return;
          window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
        };
        if (window.GSUtils && window.GSUtils.__ready === true && typeof window.GSUtils.toggleSidebarArticleTab === 'function') {
          init();
        } else if (typeof window.__gsOnReady === 'function') {
          window.__gsOnReady(init);
        } else if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
          init();
        }
      })();
    </script>
  ` : '';

  const content = `
    <section class="section active" id="tech-article">
      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001, { narrow: true })}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${article.title}</h1>
                ${metaHtml}
              </header>

              ${article.thumbnail ? `
              <figure class="blog-figure">
                <img src="${getLocalTechImagePath(category, article.slug, article.thumbnail, 'thumbnail')}" class="blog-image" alt="${article.title}" loading="eager" fetchpriority="high">
              </figure>
              ` : ''}

              ${article.summary ? `<p class="blog-summary">${article.summary}</p>` : ''}

              <div class="blog-content">
                ${article.toc ? renderToc(article.content) : ''}
                ${renderContentBlocks(article.content, category, article.slug)}
              </div>

              ${relatedGamesHtml}
              ${relatedHTML}
              ${sourcesHTML}
            </div>

            ${navHTML}
          </div>

          ${sidebarHTML ? `
          <aside class="article-sidebar">
            <div class="article-sidebar-sticky">
              ${sidebarHTML}
            </div>
          </aside>
          ` : ''}
        </div>
      </article>
    </section>
    ${sidebarScript}
  `;

  const metaKeywords = keywordText || '테크, 기술, AI, 개발 도구';
  const descriptionText = article.summary || `${article.title}에 대한 심층 분석`;

  const thumbnailPath = article.thumbnail
    ? getLocalTechImagePath(category, article.slug, article.thumbnail, 'thumbnail')
    : null;
  const schemaImage = thumbnailPath
    ? (thumbnailPath.startsWith('/') ? `${siteBaseUrl}${thumbnailPath}` : thumbnailPath)
    : null;

  // dateModified: JSON 내부 modifiedAt만 사용 (없으면 null → 스키마 제외)
  const dateModifiedValue = article.modifiedAt || null;

  const articleSchema = {
    headline: article.title,
    description: descriptionText,
    datePublished: article.date,
    dateModified: dateModifiedValue,
    image: schemaImage,
    author: editorName
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
    ],
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles },
    ogImage: schemaImage
  });
}

module.exports = { generateTechArticlePage };
