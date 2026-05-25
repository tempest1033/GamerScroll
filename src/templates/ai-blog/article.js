/**
 * AIScroll 글 상세 페이지 템플릿
 * GamerScroll tech-article.js 스타일 적용
 */

const fs = require('fs');
const path = require('path');
const {
  wrapWithLayout,
  SITE_CONFIG,
  formatDateEn,
  escapeHtml,
  getThumbUrl,
  I18N,
  AI_CATEGORY_IDS,
  articleHref,
  categoryHref,
  homeHref
} = require('./index');
const { AD_SLOTS, generateHomeAdPairSlot } = require('../layout');
const { renderRankingBlock } = require('../helpers/ranking-blocks');
const { renderTextBlock } = require('../helpers/content-text');

// games.json 로드 (ranking 블록 아이콘용)
let gamesMap = {};
try {
  const gamesPath = path.join(__dirname, '../../../data/games.json');
  if (fs.existsSync(gamesPath)) {
    gamesMap = (JSON.parse(fs.readFileSync(gamesPath, 'utf8').replace(/^﻿/, '')).games) || {};
  }
} catch (e) {}

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
  const _lang = data.lang === 'ko' ? 'ko' : 'en';
  const _langPrefix = _lang === 'ko' ? '/ko' : '';
  const _t = I18N[_lang] || I18N.en;
  const socialThumbnail = article.thumbnail
    ? String(article.thumbnail).replace(/\/thumbnail-sm\.webp($|\?)/, '/thumbnail.webp$1')
    : '';

  // AIScroll에 포함된 기사 slug 목록
  const validSlugs = new Set(allArticles.map(a => a.slug));

  function normalizeInternalHref(rawHref = '') {
    let href = String(rawHref || '').trim();
    if (!href || !href.startsWith('/')) return '';
    if (href.startsWith('/ko/article/')) href = href.replace(/^\/ko/, '');
    if (!href.startsWith('/article/')) return href;

    const suffixIndex = href.search(/[?#]/);
    const pathOnly = suffixIndex >= 0 ? href.slice(0, suffixIndex) : href;
    const suffix = suffixIndex >= 0 ? href.slice(suffixIndex) : '';
    const segments = pathOnly.split('/').filter(Boolean);
    const category = segments.length >= 2 ? segments[1] : 'general';
    const slug = segments.length >= 3 ? segments[2] : '';
    if (!slug) return href;
    return validSlugs.has(slug) ? `${articleHref(category, slug, _lang)}${suffix}` : '';
  }

  // AIScroll 전용 링크 렌더러—레이블 escape + closure로 묶인 slug validator 적용.
  // 공통 helper(content-text)의 linkRenderer 옵션으로 주입되어 text 블록에서 재사용.
  const linkRenderer = (label, rawHref) => {
    const href = String(rawHref || '').trim();
    const safeLabel = escapeHtml(label || '');
    if (!href || /^javascript:/i.test(href)) return safeLabel;
    if (href.startsWith('/')) {
      const normalized = normalizeInternalHref(href);
      if (!normalized) return safeLabel;
      return `<a href="${escapeHtml(normalized)}">${safeLabel}</a>`;
    }
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${safeLabel}</a>`;
  };

  function renderInlineMarkdownLinks(text = '') {
    return String(text || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => linkRenderer(label, href));
  }

  // Article body ads keep the dedicated in-article slots; handling matches feed scroll ads.
  const IN_ARTICLE_SLOTS = [
    AD_SLOTS.InArticle001, AD_SLOTS.InArticle002
  ];
  function getInArticleAdHTML(adIndex) {
    const slotId = IN_ARTICLE_SLOTS[adIndex % IN_ARTICLE_SLOTS.length];
    return `
    <div class="ad-card ad-card-scroll blog-in-article-ad" data-ad-index="${adIndex + 1}">
      <ins class="adsbygoogle"
           style="display:block;text-align:center"
           data-ad-format="fluid"
           data-ad-layout="in-article"
           data-ad-client="ca-pub-9477874183990825"
           data-ad-slot="${slotId}"></ins>
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
          result.push(renderTextBlock(block.value, { tableClass: 'blog-table-wrapper', linkRenderer }));
          break;
        }
        case 'heading': {
          sectionCount++;
          if (sectionCount % 2 === 0) {
            result.push(getInArticleAdHTML(adCount++));
          }
          const headingId = toSlug(block.value);
          result.push(`<h2 id="${headingId}" class="blog-heading">${escapeHtml(block.value)}</h2>`);
          break;
        }
        case 'subheading':
          result.push(`<h3 class="blog-subheading">${escapeHtml(block.value)}</h3>`);
          break;
        case 'note':
        case 'chart':
        case 'chart-group':
        case 'ranking-bar':
        case 'ranking-card':
        case 'ranking-compare': {
          const __rankingHtml = renderRankingBlock(block, { gamesMap, escapeHtmlAttr: escapeHtml });
          if (__rankingHtml) result.push(__rankingHtml);
          break;
        }
        case 'image': {
          if (!block.src) break;
          const imgSrc = getImageSrc(block.src);
          const altText = escapeHtml(block.alt || block.caption || '');
          const caption = block.caption ? `<figcaption class="blog-caption">${escapeHtml(block.caption)}</figcaption>` : '';
          result.push(`
            <figure class="blog-figure">
              <img class="blog-image" src="${imgSrc}" alt="${altText}" width="1200" height="675" loading="lazy" onerror="this.parentElement.style.display='none'">
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
            const href = articleHref(itemCategory, item.slug, _lang);
            const seriesThumb = actualArticle.thumbnail || item.thumbnail || '';
            const thumbUrl = seriesThumb ? getThumbUrl(seriesThumb, 200) : '';
            return `
              <a href="${href}" class="blog-related-issue-card blog-series-card">
                <img class="blog-related-issue-thumb" src="${thumbUrl}" width="200" height="113" alt="${escapeHtml(item.title)}" loading="lazy">
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
    const categories = AI_CATEGORY_IDS.map(id => ({
      id,
      label: id === 'vibecoding' ? (_t.vibeCoding || _t.categoryLabels[id]) : _t.categoryLabels[id]
    }));
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
            <h3 class="home-card-title">${_t.categories}</h3>
          </div>
          <div class="sidebar-category-list">
            ${categories.map(cat => `
              <a href="${categoryHref(cat.id, _lang)}" class="sidebar-category-item">
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
      <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="sidebar-article-item">
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
            <button class="tab-btn small active" data-sidebar-tab="popular">${_t.popular}</button>
            <button class="tab-btn small" data-sidebar-tab="latest">${_t.latest}</button>
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
        <div class="blog-related-title">${_t.related}</div>
        <div class="blog-related-issues-list">
          ${filteredRelated.map(item => `
            <a href="${articleHref(item.category || 'general', item.slug, _lang)}" class="blog-related-issue-card">
              ${item.thumbnail ? `<img class="blog-related-issue-thumb" src="${getThumbUrl(item.thumbnail, 480)}" width="480" height="270" alt="${escapeHtml(item.title)}" loading="lazy">` : ''}
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
        <div class="blog-sources-title">${_t.sources}</div>
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
      ${prevArticle ? `<a href="${articleHref(prevArticle.category || 'general', prevArticle.slug, _lang)}" class="trend-nav-btn prev">‹ ${_t.previous}</a>` : `<span class="trend-nav-btn disabled">‹ ${_t.previous}</span>`}
      <a href="${homeHref(_lang)}" class="trend-nav-btn list">${_t.list}</a>
      ${nextArticle ? `<a href="${articleHref(nextArticle.category || 'general', nextArticle.slug, _lang)}" class="trend-nav-btn next">${_t.next} ›</a>` : `<span class="trend-nav-btn disabled">${_t.next} ›</span>`}
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
                    const dispModified = article.modifiedAt ? String(article.modifiedAt).slice(0, 10) : null;
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
                <img src="${getThumbUrl(socialThumbnail || article.thumbnail, 1200)}" class="blog-image" width="1200" height="675" alt="${escapeHtml(article.title)}" loading="eager" fetchpriority="high">
              </figure>
              ` : ''}

              ${article.summary ? `<p class="blog-summary">${escapeHtml(article.summary)}</p>` : ''}

              <div class="blog-content">
                ${article.toc ? renderToc(article.content, _lang === 'en') : ''}
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
  const categoryLabels = _t.categoryLabels;
  const categoryLabel = categoryLabels[article.category] || categoryLabels.general;

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

  // dateModified: JSON 내부 modifiedAt만 사용 (없으면 null 반환 → 스키마 제외)
  const dateModifiedISO = (() => {
    const raw = article.modifiedAt;
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00+09:00';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s + ':00+09:00';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s + '+09:00';
    return s;
  })();

  // 썸네일 절대 URL 변환 (소셜 크롤러용)
  const absoluteThumbnail = socialThumbnail
    ? (socialThumbnail.startsWith('http') || socialThumbnail.startsWith('//')
      ? socialThumbnail
      : `${SITE_CONFIG.baseUrl}${socialThumbnail}`)
    : null;

  // JSON-LD 구조화 데이터 (Article + BreadcrumbList)
  const _jsonLdLang = data.lang === 'ko' ? 'ko' : 'en';
  const _jsonLdPrefix = _jsonLdLang === 'ko' ? '/ko' : '';
  const _jsonLdLocale = _jsonLdLang === 'ko' ? 'ko-KR' : 'en-US';
  const _jsonLdSelfUrl = `${SITE_CONFIG.baseUrl}${_jsonLdPrefix}/article/${article.category || 'general'}/${article.slug}/`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "inLanguage": _jsonLdLocale,
      "headline": article.title,
      "description": article.summary || '',
      "image": absoluteThumbnail || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`,
      "datePublished": dateISO,
      ...(dateModifiedISO ? { "dateModified": dateModifiedISO } : {}),
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
          "url": `${SITE_CONFIG.baseUrl}/icon-192.png`,
          "width": 192,
          "height": 192
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": _jsonLdSelfUrl,
        "inLanguage": _jsonLdLocale
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": _jsonLdLang === 'ko' ? '홈' : 'Home',
          "item": `${SITE_CONFIG.baseUrl}${_jsonLdPrefix}/`
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": categoryLabel,
          "item": `${SITE_CONFIG.baseUrl}${_jsonLdPrefix}/article/${article.category || 'general'}/`
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

  // Title 분리: <title> 태그는 SERP 노출 고려해 절단(60자),
  // og:title/twitter:title/JSON-LD headline은 전체 헤드라인 유지
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

  const lang = data.lang === 'ko' ? 'ko' : 'en';
  const langPrefix = lang === 'ko' ? '/ko' : '';
  return wrapWithLayout(content, {
    title: trimmedTitle,
    ogTitle: fullTitle,
    description: trimmedDescription,
    keywords: article.keywords || SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}${langPrefix}/article/${article.category || 'general'}/${article.slug}/`,
    pageScripts: pageScripts,
    jsonLd: jsonLd,
    ogImage: absoluteThumbnail,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogType: 'article',
    articleMeta: articleMeta,
    currentPage: article.category || 'general',
    lang,
    alternates: data.alternates || null
  });
}

module.exports = { generateAIBlogArticle };
