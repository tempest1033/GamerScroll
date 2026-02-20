/**
 * 게임 위키 개별 항목 페이지
 * - 이슈 리포트와 동일한 블로그 스타일
 * - 블록 기반 콘텐츠 렌더링
 */

const path = require('path');
const fs = require('fs');
const { wrapWithLayout, AD_SLOTS, generateHomeAdPairSlot } = require('../layout');

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
// 카테고리 정보 (tech는 별도 메뉴로 분리됨)
const categoryInfo = {
  business: { name: '비즈니스', desc: '업계 지표, 수익 구조, 성장 전략' },
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

/**
 * 마크다운 링크를 HTML 앵커 태그로 변환
 */
function parseMarkdownLinks(str) {
  const escaped = escapeHtmlAttr(str);
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
}

/**
 * 테이블 셀용 인라인 마크다운 변환 (볼드, 코드, 링크)
 */
function parseTableCell(str) {
  return parseMarkdownLinks(str)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
 * 로컬 위키 이미지 경로 반환 (폴백: 외부 URL)
 * @param {string} category - 카테고리 (business, tech, history, knowledge)
 * @param {string} slug - 문서 slug
 * @param {string} originalUrl - 원본 외부 URL
 * @param {string} imageType - 'thumbnail' 또는 인덱스 번호
 */
// imageType: 'thumbnail' | 'thumbnail-sm' | index number
// 상세 페이지는 기본 lg (1200px), 리스트용은 sm (480px)
function getLocalWikiImagePath(category, slug, originalUrl, imageType) {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;

  const ext = '.webp';
  let localPath;
  let width = 960;  // 본문 이미지 기본 크기

  if (imageType === 'thumbnail' || imageType === 'thumbnail-lg') {
    // 상세 페이지 hero 이미지 (큰 버전)
    localPath = `/assets/images/wiki/${category}/${slug}/thumbnail${ext}`;
    width = 1200;
  } else if (imageType === 'thumbnail-sm') {
    // 리스트용 작은 썸네일
    localPath = `/assets/images/wiki/${category}/${slug}/thumbnail-sm${ext}`;
    width = 480;
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

  // thumbnail-sm 폴백: 기존 thumbnail.webp 확인
  if (imageType === 'thumbnail-sm') {
    const fallbackPath = path.join(docsDir, `/assets/images/wiki/${category}/${slug}/thumbnail${ext}`);
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/wiki/${category}/${slug}/thumbnail${ext}`;
    }
  }

  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp`;
}

// heading을 slug로 변환
const toSlug = (text) => {
  return text
    .replace(/^\d+\.\s*/, '') // "1. " 같은 번호 제거
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '-')
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
          // 마크다운 볼드 변환: **텍스트** → <strong>텍스트</strong>
          // 마크다운 리스트 변환: "- " → "• "
          const formatted = trimmed
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+:)\*\*/g, '<strong class="subheading">$1</strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^- /gm, '• ')
            .replace(/\n- /g, '\n• ')
            .replace(/\n/g, '<br>')
            .replace(/class="subheading">([^<]+)<\/strong><br>/g, 'class="subheading">$1</strong>');
          return trimmed ? `<p class="blog-paragraph">${formatted}</p>` : '';
        }).filter(p => p).join('');
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
            <table class="wiki-table">
              <thead><tr>${tableHeaders}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </figure>
        `);
        break;

      case 'ad':
        break;

      case 'series':
        if (!block.articles || !Array.isArray(block.articles)) break;
        const seriesTitle = block.title || '시리즈';
        const seriesCards = block.articles.map(article => {
          const partLabel = article.part ? `${article.part}부` : '';
          const href = `/wiki/knowledge/${article.slug}/`;
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
            <div class="blog-related-title">${seriesTitle}</div>
            <div class="blog-related-issues-list">${seriesCards}</div>
          </nav>
        `);
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
 * 위키 개별 항목 페이지 생성
 * @param {Object} params
 * @param {Object} params.article - 위키 항목 데이터
 * @param {string} params.category - 카테고리 키 (business, tech, history, knowledge)
 * @param {Array} params.relatedArticles - 관련 항목 목록
 * @param {Object} params.prevNext - 이전/다음 항목 {prev, next}
 * @param {Array} params.issueReports - 이슈 리포트 목록
 * @param {Object} params.allWikiData - 전체 위키 데이터
 */
function generateWikiArticlePage({ article, category, relatedDocs = [], prevNext = {}, issueReports = [], allWikiData = {}, allTechData = {}, reportCounts = {}, magazineCounts = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] }) {
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
  // 수동 지정 relatedGames 우선, 없으면 자동 매칭
  const findRelatedGames = (text) => {
    if (!text || !Object.keys(gamesMap).length) return [];
    const found = [];
    for (const [name, game] of Object.entries(gamesMap)) {
      // 게임 이름 또는 aliases 매칭
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
  if ('relatedGames' in article) {
    relatedGames = article.relatedGames.map(item => {
      // 객체 형식 { title, slug } 또는 문자열 slug 둘 다 지원
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
                ? getLocalWikiImagePath(item.category, item.slug, item.thumbnail, 'thumbnail')
                : '/favicon.svg';
              return `
              <a href="/wiki/${item.category}/${item.slug}/" class="blog-related-issue-card">
                <img class="blog-related-issue-thumb" src="${thumb}" alt="${item.title}" loading="lazy" data-img-fallback-src="/favicon.svg">
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${item.title}</span></span>
              </a>`;
            } else if (item.type === 'tech') {
              const thumb = item.thumbnail
                ? (item.thumbnail.startsWith('http') ? item.thumbnail : `/assets/images/tech/${item.category}/${item.slug}/thumbnail.webp`)
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

  // 사이드바: 카테고리 메뉴 (숫자 포함)
  const generateSidebarCategories = () => {
    // 위키 카운트 계산
    const wikiCounts = {
      history: (allWikiData.history || []).length,
      knowledge: (allWikiData.knowledge || []).length,
      business: (allWikiData.business || []).length
    };
    // 테크 카운트 계산
    const techCounts = {
      normal: (allTechData.normal || []).length,
      ai: (allTechData.ai || []).length,
      vibecoding: (allTechData.vibecoding || []).length
    };

    return `
      <div class="home-card" id="sidebar-categories">
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/magazine/" class="home-card-title-link"><h2 class="home-card-title">정기 매거진</h2></a></div>
          <div class="sidebar-category-list">
            <a href="/magazine/daily/" class="sidebar-category-item"><span class="sidebar-category-name">일간 (${magazineCounts.daily || 0})</span></a>
          </div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
          <div class="sidebar-category-list">
            <a href="/magazine/issue/" class="sidebar-category-item"><span class="sidebar-category-name">이슈 (${reportCounts.issue || 0})</span></a>
            <a href="/magazine/insight/" class="sidebar-category-item"><span class="sidebar-category-name">인사이트 (${reportCounts.insight || 0})</span></a>
            <a href="/magazine/hotpick/" class="sidebar-category-item"><span class="sidebar-category-name">핫픽 (${reportCounts.hotpick || 0})</span></a>
            <a href="/magazine/ranking/" class="sidebar-category-item"><span class="sidebar-category-name">순위 분석 (${reportCounts.ranking || 0})</span></a>
          </div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
          <div class="sidebar-category-list">
            <a href="/wiki/history/" class="sidebar-category-item"><span class="sidebar-category-name">히스토리 (${wikiCounts.history})</span></a>
            <a href="/wiki/knowledge/" class="sidebar-category-item"><span class="sidebar-category-name">지식 (${wikiCounts.knowledge})</span></a>
            <a href="/wiki/business/" class="sidebar-category-item"><span class="sidebar-category-name">비즈니스 (${wikiCounts.business})</span></a>
          </div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
          <div class="sidebar-category-list">
            <a href="/tech/normal/" class="sidebar-category-item"><span class="sidebar-category-name">일반 (${techCounts.normal})</span></a>
            <a href="/tech/ai/" class="sidebar-category-item"><span class="sidebar-category-name">AI (${techCounts.ai})</span></a>
            <a href="/tech/vibecoding/" class="sidebar-category-item"><span class="sidebar-category-name">바이브코딩 (${techCounts.vibecoding})</span></a>
          </div>
        </div>
      </div>
    `;
  };

  // 사이드바: 인기/최신 글 (위키만 - GA4 기반 데이터 사용)
  const generateSidebarArticles = () => {
    const currentLink = `/wiki/${category}/${article.slug}/`;

    if (sidebarPopularArticles.length === 0 && sidebarLatestArticles.length === 0) return '';

    const renderList = (items) => items.map((item, i) => {
      const isCurrent = item.link === currentLink;
      const activeClass = isCurrent ? ' active' : '';
      return `
      <a href="${item.link}" class="sidebar-article-item${activeClass}">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `;
    }).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
        </div>
      </div>
    `;
  };

  const sidebarCategoriesHTML = generateSidebarCategories();
  const sidebarArticlesHTML = generateSidebarArticles();
  const sidebarHTML = sidebarCategoriesHTML + sidebarArticlesHTML;

  // 사이드바 탭 토글 스크립트
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
    <section class="section active" id="wiki-article">
      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001)}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${article.title}</h1>
                ${metaHtml}
              </header>

              ${article.thumbnail ? `
              <figure class="blog-figure">
                <img src="${getLocalWikiImagePath(category, article.slug, article.thumbnail, 'thumbnail')}" class="blog-image" alt="${escapeHtmlAttr(article.title)}" loading="lazy" fetchpriority="auto">
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

  const metaKeywords = keywordText || '게임 위키, 게임 용어';
  const descriptionText = article.summary || `${article.title}에 대한 게임 업계 심층 분석`;

  // 썸네일 이미지 경로 (스키마용 절대 URL)
  const thumbnailPath = article.thumbnail
    ? getLocalWikiImagePath(category, article.slug, article.thumbnail, 'thumbnail')
    : null;
  const schemaImage = thumbnailPath
    ? (thumbnailPath.startsWith('/') ? `${siteBaseUrl}${thumbnailPath}` : thumbnailPath)
    : null;

  // Article JSON-LD 스키마
  const articleSchema = {
    headline: article.title,
    description: descriptionText,
    datePublished: article.date,
    dateModified: article.date,
    image: schemaImage
  };

  return wrapWithLayout(content, {
    currentPage: 'wiki',
    title: article.title,
    description: descriptionText,
    keywords: metaKeywords,
    canonical: `${siteBaseUrl}/wiki/${category}/${article.slug}/`,
    articleSchema,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 위키', url: `${siteBaseUrl}/wiki/` },
      { name: catInfo.name, url: `${siteBaseUrl}/wiki/${category}/` },
      { name: article.title, url: `${siteBaseUrl}/wiki/${category}/${article.slug}/` }
    ],
    sidebarArticles: { popular: sidebarPopularArticles, latest: sidebarLatestArticles }
  });
}

module.exports = { generateWikiArticlePage };
