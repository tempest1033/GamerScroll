/**
 * AIScroll 글 상세 페이지 템플릿
 * GamerScroll tech-article.js 스타일 적용
 */

const { wrapWithLayout, SITE_CONFIG, formatDateEn, escapeHtml, getThumbUrl } = require('./index');

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

    return content.map(block => {
      switch (block.type) {
        case 'text':
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
          return paragraphs;
        case 'heading':
          return `<h2 class="blog-heading">${escapeHtml(block.value)}</h2>`;
        case 'subheading':
          return `<h3 class="blog-subheading">${escapeHtml(block.value)}</h3>`;
        case 'image':
          if (!block.src) return '';
          return `
            <figure class="blog-figure">
              <img class="blog-image" src="${getThumbUrl(block.src, 1200)}" alt="${escapeHtml(block.caption || block.alt || '')}" loading="lazy">
              ${block.caption ? `<figcaption class="blog-caption">${escapeHtml(block.caption)}</figcaption>` : ''}
            </figure>`;
        case 'quote':
          return `<blockquote class="blog-quote">${block.value}</blockquote>`;
        case 'list':
          const items = Array.isArray(block.value) ? block.value : [block.value];
          return `<ul class="blog-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
        case 'table':
          if (!block.headers || !block.rows) return '';
          return `
            <figure class="blog-figure blog-table">
              ${block.caption ? `<div class="table-title">${escapeHtml(block.caption)}</div>` : ''}
              <table class="wiki-table">
                <thead><tr>${block.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </figure>`;
        case 'code':
          return `<pre class="blog-code"><code>${escapeHtml(block.value)}</code></pre>`;
        default:
          return '';
      }
    }).join('\n');
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

  return wrapWithLayout(content, {
    title: `${article.title} - ${SITE_CONFIG.name}`,
    description: article.summary || SITE_CONFIG.description,
    keywords: article.keywords || SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}/article/${article.category || 'general'}/${article.slug}/`,
    pageScripts: pageScripts
  });
}

module.exports = { generateAIBlogArticle };
