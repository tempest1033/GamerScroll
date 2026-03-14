/**
 * AIScroll 글 상세 페이지 템플릿
 * GamerScroll tech-article.js 스타일 적용
 */

const fs = require('fs');
const { wrapWithLayout, SITE_CONFIG, formatDateEn, escapeHtml, getThumbUrl } = require('./index');
const { AD_SLOTS, generateHomeAdPairSlot } = require('../layout');

/**
 * 이미지 경로 처리 (GamerScroll과 동일 방식)
 * - 상대경로 (./image.jpg): 그대로 사용 (기사 폴더에 이미지 복사됨)
 * - HTTP URL: wsrv.nl 프록시로 변환
 */
function getImageSrc(originalSrc) {
  if (!originalSrc) return '';

  // HTTP URL은 wsrv.nl 프록시로 변환
  if (originalSrc.startsWith('http')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(originalSrc)}&w=960&output=webp`;
  }

  // 상대경로는 그대로 사용 (빌드 시 이미지 파일 복사됨)
  return originalSrc;
}

/**
 * 슬러그 생성 (heading용 ID)
 */
const toSlug = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * 목차 생성
 */
const renderToc = (content = [], isEnglish = false) => {
  const headings = content.filter(b => b.type === 'heading' && b.value);
  if (headings.length < 3) return ''; // 3개 미만이면 목차 생략

  const items = headings.map(h => {
    const id = toSlug(h.value);
    return `<li><a href="#${id}">${escapeHtml(h.value)}</a></li>`;
  }).join('');

  return `
    <nav class="blog-toc">
      <div class="blog-toc-title">${isEnglish ? 'Table of Contents' : '목차'}</div>
      <ol>${items}</ol>
    </nav>
  `;
};

/**
 * 글 상세 페이지 생성
 */
function generateAIBlogArticle(article, data = {}) {
  const { popularArticles = [], latestArticles = [], allArticles = [] } = data;

  // AIScroll에 포함된 기사 slug 목록
  const validSlugs = new Set(allArticles.map(a => a.slug));

  function normalizeInternalHref(rawHref = '') {
    const href = String(rawHref || '').trim();
    if (!href || !href.startsWith('/')) return '';
    if (!href.startsWith('/article/')) return href;

    const pathOnly = href.split('#')[0].split('?')[0];
    const segments = pathOnly.split('/').filter(Boolean);
    const slug = segments.length >= 3 ? segments[2] : '';
    if (!slug) return href;
    return validSlugs.has(slug) ? href : '';
  }

  function renderInlineMarkdownLinks(text = '') {
    return String(text || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawHref) => {
      const href = String(rawHref || '').trim();
      const safeLabel = escapeHtml(label || '');
      if (!href || /^javascript:/i.test(href)) return safeLabel;

      if (href.startsWith('/')) {
        const normalized = normalizeInternalHref(href);
        if (!normalized) return safeLabel;
        return `<a href="${escapeHtml(normalized)}">${safeLabel}</a>`;
      }

      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${safeLabel}</a>`;
    });
  }

  // 인아티클 광고 슬롯 (5개 순환)
  const IN_ARTICLE_SLOTS = [
    AD_SLOTS.InArticle001, AD_SLOTS.InArticle002, AD_SLOTS.InArticle003,
    AD_SLOTS.InArticle004, AD_SLOTS.InArticle005
  ];
  function getInArticleAdHTML(adIndex) {
    const slotId = IN_ARTICLE_SLOTS[adIndex % IN_ARTICLE_SLOTS.length];
    return `
    <div class="blog-in-article-ad" style="margin:2rem 0;text-align:center;">
      <ins class="adsbygoogle"
           style="display:block; text-align:center;"
           data-ad-layout="in-article"
           data-ad-format="fluid"
           data-ad-client="ca-pub-9477874183990825"
           data-ad-slot="${slotId}"></ins>
      <script>
           (adsbygoogle = window.adsbygoogle || []).push({});
      </script>
    </div>`;
  }

  // 본문 렌더링 (GamerScroll 스타일)
  function renderContent(content) {
    if (!content || !Array.isArray(content)) return '';

    const result = [];
    let sectionCount = 1; // 서문 = 섹션1
    let adCount = 0;

    for (const block of content) {
      switch (block.type) {
        case 'text': {
          // 코드 펜스 변환 (```language ... ``` → <pre><code>)
          const codeBlocks_a = [];
          const textWithPlaceholders_a = String(block.value || '').replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const escaped = code
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/^(#.*)$/gm, '<span class="code-comment">$1</span>');
            const placeholder = `__CODE_BLOCK_${codeBlocks_a.length}__`;
            codeBlocks_a.push(`<figure class="blog-figure blog-code"><pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre></figure>`);
            return placeholder;
          });
          const formatTextFragment_a = (text) => {
            const t = text.trim();
            if (!t) return '';
            const formatted = renderInlineMarkdownLinks(t
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+:)\*\*/g, '<strong class="subheading">$1</strong>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/^- /gm, '• ')
              .replace(/\n- /g, '\n• ')
              .replace(/\n/g, '<br>')
              .replace(/class="subheading">([^<]+)<\/strong><br>/g, 'class="subheading">$1</strong>'));
            return `<p class="blog-paragraph">${formatted}</p>`;
          };
          const paragraphs = textWithPlaceholders_a.split('\n\n').map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            // 코드 블록 placeholder만으로 이루어진 단락
            const codePlaceholderMatch = trimmed.match(/^__CODE_BLOCK_(\d+)__$/);
            if (codePlaceholderMatch) return codeBlocks_a[parseInt(codePlaceholderMatch[1])];
            // 혼합 단락: 텍스트 + 코드 블록 placeholder가 섞인 경우
            if (/__CODE_BLOCK_\d+__/.test(trimmed)) {
              const parts = trimmed.split(/(__CODE_BLOCK_\d+__)/);
              return parts.map(part => {
                const m = part.match(/^__CODE_BLOCK_(\d+)__$/);
                if (m) return codeBlocks_a[parseInt(m[1])];
                return formatTextFragment_a(part);
              }).filter(x => x).join('');
            }
            return formatTextFragment_a(trimmed);
          }).filter(p => p).join('');
          result.push(paragraphs);
          break;
        }
        case 'heading': {
          sectionCount++;
          if (sectionCount % 3 === 0) {
            result.push(getInArticleAdHTML(adCount++));
          }
          const headingId = toSlug(block.value);
          result.push(`<h2 id="${headingId}" class="blog-heading">${escapeHtml(block.value)}</h2>`);
          break;
        }
        case 'subheading':
          result.push(`<h3 class="blog-subheading">${escapeHtml(block.value)}</h3>`);
          break;
        case 'image': {
          if (!block.src) break;
          const imgSrc = getImageSrc(block.src);
          const altText = escapeHtml(block.alt || block.caption || '');
          const caption = block.caption ? `<figcaption class="blog-caption">${escapeHtml(block.caption)}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${altText}" loading="lazy" onerror="this.parentElement.style.display='none'">
              ${caption}
            </figure>`);
          break;
        }
        case 'quote':
          result.push(`<blockquote class="blog-quote">${block.value}</blockquote>`);
          break;
        case 'list': {
          const items = Array.isArray(block.value) ? block.value : [block.value];
          result.push(`<ul class="blog-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`);
          break;
        }
        case 'table': {
          if (!block.headers || !block.rows) break;
          const fmtCell = (s) => renderInlineMarkdownLinks(String(s || '')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
          result.push(`
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtml(block.caption)}</div>` : ''}
              <table class="wiki-table">
                <thead><tr>${block.headers.map(h => `<th>${fmtCell(h)}</th>`).join('')}</tr></thead>
                <tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${fmtCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </figure>`);
          break;
        }
        case 'code': {
          if (!block.value) break;
          const lang = block.lang || '';
          const codeCaption = block.caption ? `<figcaption class="blog-caption">${escapeHtml(block.caption)}</figcaption>` : '';
          const escapedCode = String(block.value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/^(#.*)$/gm, '<span class="code-comment">$1</span>');
          result.push(`
            <figure class="blog-figure blog-code">
              <pre><code${lang ? ` class="language-${lang}"` : ''}>${escapedCode}</code></pre>
              ${codeCaption}
            </figure>`);
          break;
        }
        case 'aside': {
          if (!block.value) break;
          const asideTitle = block.title ? `<strong class="aside-title">${escapeHtml(block.title)}</strong>` : '';
          const asideFormatted = renderInlineMarkdownLinks(String(block.value)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>'));
          result.push(`
            <aside class="blog-aside">
              ${asideTitle}
              <p>${asideFormatted}</p>
            </aside>`);
          break;
        }
        case 'series': {
          // 시리즈 네비게이션 블록 (GamerScroll 스타일 클래스)
          if (!block.articles || !Array.isArray(block.articles)) break;
          const seriesTitleHtml = block.title ? `<div class="blog-related-title">${escapeHtml(block.title)}</div>` : '';
          const seriesCards = block.articles.map(item => {
            const partLabel = item.part === 0 ? 'Index' : (item.part ? `Part ${item.part}` : '');
            // 실제 기사 데이터에서 category 조회 (AI Blog 카테고리 매핑)
            const actualArticle = allArticles.find(a => a.slug === item.slug);
            if (!actualArticle) return '';
            const itemCategory = actualArticle.category || article.category || 'general';
            const href = `/article/${itemCategory}/${item.slug}/`;
            const seriesThumb = actualArticle.thumbnail || item.thumbnail || '';
            const thumbUrl = seriesThumb ? getThumbUrl(seriesThumb, 200) : '';
            return `
              <a href="${href}" class="blog-related-issue-card blog-series-card">
                <img class="blog-related-issue-thumb" src="${thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy">
                <span class="blog-series-tag">${partLabel}</span>
                <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${escapeHtml(item.title)}</span></span>
              </a>`;
          }).filter(Boolean).join('');
          if (!seriesCards) break;
          result.push(`
            <nav class="blog-series">
              ${seriesTitleHtml}
              <div class="blog-related-issues-list">${seriesCards}</div>
            </nav>`);
          break;
        }
        case 'video':
        case 'post': {
          const embedUrl = block.url || '';
          const embedCaption = block.caption ? `<figcaption class="blog-caption">${escapeHtml(block.caption)}</figcaption>` : '';

          // YouTube
          const ytMatch = embedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (ytMatch) {
            result.push(`
              <figure class="blog-figure blog-video">
                <div class="blog-video-wrapper">
                  <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                </div>
                ${embedCaption}
              </figure>`);
            break;
          }

          // Twitter/X
          const xMatch = embedUrl.match(/(?:twitter\.com|x\.com)\/(?:i\/|[^\/]+\/)status\/(\d+)/);
          if (xMatch) {
            result.push(`
              <figure class="blog-figure blog-tweet">
                <div class="blog-tweet-wrapper">
                  <blockquote class="twitter-tweet" data-dnt="true">
                    <a href="https://twitter.com/i/status/${xMatch[1]}"></a>
                  </blockquote>
                </div>
                ${embedCaption}
              </figure>`);
          }
          break;
        }
        default:
          break;
      }
    }
    return result.join('\n');
  }

  // 카테고리 메뉴
  function generateCategoryMenu() {
    const categories = [
      { id: 'general', label: 'General' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'google', label: 'Google' },
      { id: 'anthropic', label: 'Anthropic' },
      { id: 'vibecoding', label: 'Vibe Coding' }
    ];
    // 카테고리별 기사 개수 계산
    const countByCategory = {};
    allArticles.forEach(a => {
      const cat = a.category || 'general';
      countByCategory[cat] = (countByCategory[cat] || 0) + 1;
    });
    return `
      <div class="home-card" id="sidebar-categories">
        <div class="sidebar-category-group">
          <div class="home-card-header">
            <h3 class="home-card-title">Categories</h3>
          </div>
          <div class="sidebar-category-list">
            ${categories.map(cat => `
              <a href="/article/${cat.id}/" class="sidebar-category-item">
                <span class="sidebar-category-name">${cat.label} (${countByCategory[cat.id] || 0})</span>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // 사이드바: 인기/최신 토글
  function generateSidebarArticles() {
    const renderList = (items) => items.slice(0, 10).map((item, i) => `
      <a href="/article/${item.category || 'general'}/${item.slug}/" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
      </a>
    `).join('');
    const latestListHtml = renderList(latestArticles);

    return `
      ${generateCategoryMenu()}
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">Popular</button>
            <button class="tab-btn small" data-sidebar-tab="latest">Latest</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(popularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest"></div>
          <template id="sidebar-latest-template">${latestListHtml}</template>
        </div>
      </div>
    `;
  }

  // 관련 문서 (AIScroll에 포함된 기사만 표시)
  function generateRelatedArticles() {
    const related = article.relatedArticles || article.relatedDocs || [];
    if (!related || related.length === 0) return '';

    // slug 추출 함수 (tech:ai/slug, issue:slug, wiki:category/slug 등 처리)
    function extractSlug(item) {
      if (typeof item === 'object' && item.slug) return item.slug;
      if (typeof item !== 'string') return null;
      // tech:ai/slug → slug, issue:slug → slug, wiki:category/slug → slug
      const parts = item.split(':');
      if (parts.length === 2) {
        const pathPart = parts[1];
        const slugParts = pathPart.split('/');
        return slugParts[slugParts.length - 1];
      }
      return item;
    }

    // AIScroll에 포함된 기사만 필터링
    const filteredRelated = related
      .map(item => {
        const slug = extractSlug(item);
        return allArticles.find(a => a.slug === slug);
      })
      .filter(Boolean)
      .slice(0, 4);

    if (filteredRelated.length === 0) return '';

    return `
      <div class="blog-related-issues">
        <div class="blog-related-title">Related Articles</div>
        <div class="blog-related-issues-list">
          ${filteredRelated.map(item => `
            <a href="/article/${item.category || 'general'}/${item.slug}/" class="blog-related-issue-card">
              ${item.thumbnail ? `<img class="blog-related-issue-thumb" src="${getThumbUrl(item.thumbnail, 480)}" alt="${escapeHtml(item.title)}" loading="lazy">` : ''}
              <span class="blog-related-issue-title"><span class="blog-related-issue-title-text">${escapeHtml(item.title)}</span></span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Sources 섹션
  const sourcesHTML = article.sources && article.sources.length > 0
    ? `
      <div class="blog-sources">
        <div class="blog-sources-title">Sources</div>
        <ul class="blog-sources-list">
          ${article.sources.map(src => {
            const label = src.title ? `${src.name} - ${src.title}` : src.name;
            return `<li><a href="${src.url}" target="_blank" rel="noopener">${label}</a></li>`;
          }).join('')}
        </ul>
      </div>
    `
    : '';

  // 네비게이션 (이전/목록/다음)
  const sortedArticles = [...allArticles].sort((a, b) => new Date(b.date) - new Date(a.date));
  const currentCategory = article.category || 'general';
  const currentIndex = sortedArticles.findIndex(a => a.slug === article.slug && (a.category || 'general') === currentCategory);
  const prevArticle = currentIndex >= 0 ? sortedArticles[currentIndex + 1] : null;
  const nextArticle = currentIndex > 0 ? sortedArticles[currentIndex - 1] : null;
  const navHTML = `
    <div class="trend-detail-nav">
      ${prevArticle ? `<a href="/article/${prevArticle.category || 'general'}/${prevArticle.slug}/" class="trend-nav-btn prev">‹ Previous</a>` : '<span class="trend-nav-btn disabled">‹ Previous</span>'}
      <a href="/" class="trend-nav-btn list">List</a>
      ${nextArticle ? `<a href="/article/${nextArticle.category || 'general'}/${nextArticle.slug}/" class="trend-nav-btn next">Next ›</a>` : '<span class="trend-nav-btn disabled">Next ›</span>'}
    </div>
  `;

  // 사이드바 HTML
  const sidebarHTML = generateSidebarArticles();

  // 상단 광고
  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001);

  // 메인 콘텐츠 (GamerScroll 스타일 + 사이드바 레이아웃)
  const content = `
    <section class="section active" id="issue">
      <article class="page-container issue-container">
        <div class="article-layout">
          <div class="article-main">
            ${topAds}
            <div class="blog-card">
              <header class="blog-header">
                <h1 class="blog-title">${escapeHtml(article.title)}</h1>
                <div class="blog-meta">
                  <span class="blog-editor">${article.editor || 'Editor J'}</span>
                  ${(() => {
                    let dispModified = null;
                    if (article._jsonFilePath) {
                      try {
                        const mt = fs.statSync(article._jsonFilePath).mtime;
                        const kst = new Date(mt.getTime() + 9 * 60 * 60 * 1000);
                        dispModified = kst.toISOString().slice(0, 10);
                      } catch (e) { /* ignore */ }
                    }
                    const pubDate = (article.date || '').slice(0, 10);
                    if (dispModified && dispModified !== pubDate) {
                      return `<time class="blog-date">Published: ${formatDateEn(article.date)}</time><time class="blog-date">Updated: ${formatDateEn(dispModified)}</time>`;
                    }
                    return `<time class="blog-date">${formatDateEn(article.date)}</time>`;
                  })()}
                </div>
              </header>

              ${article.thumbnail ? `
              <figure class="blog-figure">
                <img src="${getThumbUrl(article.thumbnail, 1200)}" class="blog-image" alt="${escapeHtml(article.title)}" loading="eager" fetchpriority="high">
              </figure>
              ` : ''}

              ${article.summary ? `<p class="blog-summary">${escapeHtml(article.summary)}</p>` : ''}

              <div class="blog-content">
                ${article.toc ? renderToc(article.content, true) : ''}
                ${renderContent(article.content)}
              </div>

              ${generateRelatedArticles()}
              ${sourcesHTML}
            </div>

            ${navHTML}
          </div>
          <aside class="article-sidebar">
            <div class="article-sidebar-sticky">
              ${sidebarHTML}
            </div>
          </aside>
        </div>
      </article>
    </section>
  `;

  // 페이지 스크립트
  const pageScripts = `<script>
    (function() {
      var init = function() {
        if (!window.GSUtils) return;
        if (typeof window.GSUtils.toggleSidebarArticleTab === 'function') {
          window.GSUtils.toggleSidebarArticleTab('sidebarArticleTab');
        }
        if (typeof window.GSUtils.initSidebarLatestDefer === 'function') {
          window.GSUtils.initSidebarLatestDefer({
            tabId: 'sidebarArticleTab',
            latestListId: 'sidebar-latest',
            templateId: 'sidebar-latest-template',
            idleTimeout: 3200,
            fallbackDelay: 1600
          });
        }
      };
      if (window.GSUtils && window.GSUtils.__ready === true) {
        init();
      } else if (typeof window.__gsOnReady === 'function') {
        window.__gsOnReady(init);
      } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    })();
  </script>`;

  // 카테고리 라벨 매핑
  const categoryLabels = {
    general: 'General',
    openai: 'OpenAI',
    google: 'Google',
    anthropic: 'Anthropic',
    vibecoding: 'Coding'
  };
  const categoryLabel = categoryLabels[article.category] || 'General';

  // 날짜 ISO 형식 변환 (KST +09:00)
  const dateISO = (() => {
    const raw = article.date || '';
    if (!raw) return new Date().toISOString();
    const s = String(raw);
    // 이미 타임존이 있으면 그대로
    if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
    // YYYY-MM-DD → T00:00:00+09:00
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00+09:00';
    // YYYY-MM-DDTHH:MM → :00+09:00
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s + ':00+09:00';
    // YYYY-MM-DDTHH:MM:SS → +09:00
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s + '+09:00';
    return s;
  })();

  // dateModified: JSON 파일의 파일 시스템 수정 시간(mtime) 사용
  const dateModifiedISO = (() => {
    if (!article._jsonFilePath) return dateISO;
    try {
      const mtime = fs.statSync(article._jsonFilePath).mtime;
      // KST(+09:00) 기준 ISO 8601 변환
      const kst = new Date(mtime.getTime() + 9 * 60 * 60 * 1000);
      return kst.toISOString().replace('Z', '+09:00').replace(/\.\d{3}/, '');
    } catch (e) { return dateISO; }
  })();

  // 썸네일 절대 URL 변환 (소셜 크롤러용)
  const absoluteThumbnail = article.thumbnail
    ? (article.thumbnail.startsWith('http') || article.thumbnail.startsWith('//')
      ? article.thumbnail
      : `${SITE_CONFIG.baseUrl}${article.thumbnail}`)
    : null;

  // JSON-LD 구조화 데이터 (Article + BreadcrumbList)
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": article.title,
      "description": article.summary || '',
      "image": absoluteThumbnail || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`,
      "datePublished": dateISO,
      "dateModified": dateModifiedISO,
      "author": {
        "@type": "Person",
        "name": article.editor || 'Editor J'
      },
      "publisher": {
        "@type": "Organization",
        "name": SITE_CONFIG.name,
        "url": SITE_CONFIG.baseUrl,
        "logo": {
          "@type": "ImageObject",
          "url": `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `${SITE_CONFIG.baseUrl}/article/${article.category || 'general'}/${article.slug}/`
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": SITE_CONFIG.baseUrl
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": categoryLabel,
          "item": `${SITE_CONFIG.baseUrl}/article/${article.category || 'general'}/`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": article.title
        }
      ]
    }
  ];

  // Article OG meta
  const keywordTags = article.keywords
    ? article.keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5)
    : [];
  const articleMeta = {
    publishedTime: dateISO,
    modifiedTime: dateModifiedISO,
    section: categoryLabel,
    tags: keywordTags
  };

  // Title 트리밍: 60자 이내로
  const suffix = ` - ${SITE_CONFIG.name}`;
  const fullTitle = `${article.title}${suffix}`;
  const trimmedTitle = fullTitle.length > 60
    ? `${article.title.slice(0, 60 - suffix.length - 3)}...${suffix}`
    : fullTitle;

  // Description 트리밍: 155자 이내로
  const rawDescription = article.summary || SITE_CONFIG.description;
  const trimmedDescription = rawDescription.length > 155
    ? rawDescription.slice(0, 152).replace(/\s+\S*$/, '') + '...'
    : rawDescription;

  return wrapWithLayout(content, {
    title: trimmedTitle,
    description: trimmedDescription,
    keywords: article.keywords || SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}/article/${article.category || 'general'}/${article.slug}/`,
    pageScripts: pageScripts,
    jsonLd: jsonLd,
    ogImage: absoluteThumbnail,
    ogType: 'article',
    articleMeta: articleMeta,
    currentPage: article.category || 'general'
  });
}

module.exports = { generateAIBlogArticle };
