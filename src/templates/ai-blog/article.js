/**
 * AIScroll 글 상세 페이지 템플릿
 */

const { wrapWithLayout, SITE_CONFIG, formatDateEn, escapeHtml, getThumbUrl } = require('./index');

/**
 * 글 상세 페이지 생성
 */
function generateAIBlogArticle(article, data = {}) {
  const { popularArticles = [], latestArticles = [] } = data;

  // 본문 렌더링
  function renderContent(content) {
    if (!content || !Array.isArray(content)) return '';

    return content.map(block => {
      switch (block.type) {
        case 'text':
          return `<p>${block.value}</p>`;
        case 'heading':
          return `<h2>${escapeHtml(block.value)}</h2>`;
        case 'subheading':
          return `<h3>${escapeHtml(block.value)}</h3>`;
        case 'image':
          return `<figure class="article-image">
            <img src="${getThumbUrl(block.value, 1200)}" alt="${escapeHtml(block.caption || '')}" loading="lazy">
            ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}
          </figure>`;
        case 'quote':
          return `<blockquote>${block.value}</blockquote>`;
        case 'list':
          const items = Array.isArray(block.value) ? block.value : [block.value];
          return `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
        case 'table':
          if (!block.headers || !block.rows) return '';
          return `<div class="table-wrapper">
            ${block.caption ? `<div class="table-caption">${escapeHtml(block.caption)}</div>` : ''}
            <table>
              <thead><tr>${block.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
              <tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>`;
        case 'code':
          return `<pre><code>${escapeHtml(block.value)}</code></pre>`;
        default:
          return '';
      }
    }).join('\n');
  }

  // 사이드바: 인기/최신 토글
  function generateSidebarArticles() {
    const renderList = (items) => items.slice(0, 10).map((item, i) => `
      <a href="/article/${item.slug}/" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
      </a>
    `).join('');

    return `
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

  // 관련 글
  function generateRelatedArticles() {
    if (!article.relatedArticles || article.relatedArticles.length === 0) return '';

    // TODO: 관련 글 데이터 조회
    return '';
  }

  // 메인 콘텐츠
  const content = `
    <article class="article-page">
      <div class="page-container">
        <div class="article-container">
          <div class="article-main">
            <header class="article-header">
              <h1 class="article-title">${escapeHtml(article.title)}</h1>
              <div class="article-meta">
                <time datetime="${article.date}">${formatDateEn(article.date)}</time>
              </div>
              ${article.summary ? `<p class="article-summary">${escapeHtml(article.summary)}</p>` : ''}
            </header>

            ${article.thumbnail ? `
              <figure class="article-hero">
                <img src="${getThumbUrl(article.thumbnail, 1200)}" alt="${escapeHtml(article.title)}" loading="eager">
              </figure>
            ` : ''}

            <div class="article-content">
              ${renderContent(article.content)}
            </div>

            ${article.sources && article.sources.length > 0 ? `
              <footer class="article-sources">
                <h3>Sources</h3>
                <ul>
                  ${article.sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.name)}: ${escapeHtml(s.title)}</a></li>`).join('')}
                </ul>
              </footer>
            ` : ''}

            ${generateRelatedArticles()}
          </div>

          <aside class="article-sidebar">
            <div class="home-sidebar-sticky">
              ${generateSidebarArticles()}
            </div>
          </aside>
        </div>
      </div>
    </article>
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
    canonical: `${SITE_CONFIG.baseUrl}/article/${article.slug}/`,
    pageScripts: pageScripts
  });
}

module.exports = { generateAIBlogArticle };
