/**
 * AIScroll 글 상세 페이지 템플릿
 * GamerScroll tech-article.js 스타일 적용
 */

const { wrapWithLayout, SITE_CONFIG, formatDateEn, escapeHtml, getThumbUrl } = require('./index');

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
 * 글 상세 페이지 생성
 */
function generateAIBlogArticle(article, data = {}) {
  const { popularArticles = [], latestArticles = [], allArticles = [] } = data;

  // AIScroll에 포함된 기사 slug 목록
  const validSlugs = new Set(allArticles.map(a => a.slug));

  // 본문 렌더링 (GamerScroll 스타일)
  function renderContent(content) {
    if (!content || !Array.isArray(content)) return '';

    const result = [];

    for (const block of content) {
      switch (block.type) {
        case 'text': {
          const paragraphs = String(block.value || '').split('\n\n').map(p => {
            const trimmed = p.trim();
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
        }
        case 'heading':
          result.push(`<h2 class="blog-heading">${escapeHtml(block.value)}</h2>`);
          break;
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
        case 'table':
          if (!block.headers || !block.rows) break;
          result.push(`
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtml(block.caption)}</div>` : ''}
              <table class="wiki-table">
                <thead><tr>${block.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </figure>`);
          break;
        case 'code':
          result.push(`<pre class="blog-code"><code>${escapeHtml(block.value)}</code></pre>`);
          break;
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
      { id: 'anthropic', label: 'Anthropic' }
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
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(latestArticles)}</div>
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
              ${item.thumbnail ? `<img class="blog-related-issue-thumb" src="${getThumbUrl(item.thumbnail, 480)}" alt="" loading="lazy">` : ''}
              <span class="blog-related-issue-title">${escapeHtml(item.title)}</span>
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

  // 네비게이션 (목록으로)
  const navHTML = `
    <div class="trend-detail-nav">
      <a href="/" class="trend-nav-btn list">Back to List</a>
    </div>
  `;

  // 메인 콘텐츠 (GamerScroll 스타일)
  const content = `
    <section class="home-section active" id="ai-article">
      <article class="page-container issue-container">
        <div class="blog-card">
          <header class="blog-header">
            <h1 class="blog-title">${escapeHtml(article.title)}</h1>
            <div class="blog-meta">
              <time class="blog-date">${formatDateEn(article.date)}</time>
            </div>
          </header>

          ${article.thumbnail ? `
          <figure class="blog-figure">
            <img src="${getThumbUrl(article.thumbnail, 1200)}" class="blog-image" alt="" loading="eager">
          </figure>
          ` : ''}

          ${article.summary ? `<p class="blog-summary">${escapeHtml(article.summary)}</p>` : ''}

          <div class="blog-content">
            ${renderContent(article.content)}
          </div>

          ${generateRelatedArticles()}
          ${sourcesHTML}
        </div>

        ${navHTML}
      </article>
    </section>
  `;

  // 페이지 스크립트
  const pageScripts = `<script>
    // 사이드바 인기/최신 토글
    (function() {
      const sidebarTab = document.getElementById('sidebarArticleTab');
      if (!sidebarTab) return;
      sidebarTab.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        sidebarTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.sidebarTab;
        document.querySelectorAll('.sidebar-article-list').forEach(l => l.classList.remove('active'));
        document.getElementById('sidebar-' + target)?.classList.add('active');
      });
    })();
  </script>`;

  // 카테고리 라벨 매핑
  const categoryLabels = {
    general: 'General',
    openai: 'OpenAI',
    google: 'Google',
    anthropic: 'Anthropic'
  };
  const categoryLabel = categoryLabels[article.category] || 'General';

  // 날짜 ISO 형식 변환
  const dateISO = article.date ? new Date(article.date).toISOString() : new Date().toISOString();

  // JSON-LD 구조화 데이터 (Article + BreadcrumbList)
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": article.title,
      "description": article.summary || '',
      "image": article.thumbnail || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`,
      "datePublished": dateISO,
      "dateModified": dateISO,
      "author": {
        "@type": "Organization",
        "name": SITE_CONFIG.name,
        "url": SITE_CONFIG.baseUrl
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
  const articleMeta = {
    publishedTime: dateISO,
    modifiedTime: dateISO,
    section: categoryLabel
  };

  return wrapWithLayout(content, {
    title: `${article.title} - ${SITE_CONFIG.name}`,
    description: article.summary || SITE_CONFIG.description,
    keywords: article.keywords || SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}/article/${article.category || 'general'}/${article.slug}/`,
    pageScripts: pageScripts,
    jsonLd: jsonLd,
    ogImage: article.thumbnail,
    ogType: 'article',
    articleMeta: articleMeta
  });
}

module.exports = { generateAIBlogArticle };
