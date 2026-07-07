// Shared right-sidebar component (categories menu + popular/latest article lists).
// Single source of truth for the sidebar markup used by home, hub, and article pages.
// Unified to the homepage design: separate count badges, lists capped at 10.

const escapeHtml = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const REPORT_ITEMS = [
  { id: 'issue', name: '이슈', link: '/magazine/issue/' },
  { id: 'insight', name: '인사이트', link: '/magazine/insight/' },
  { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/' },
  { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/' },
  { id: 'weekly', name: '주간', link: '/magazine/weekly/' }
];

const WIKI_ITEMS = [
  { id: 'history', name: '히스토리', link: '/wiki/history/' },
  { id: 'knowledge', name: '지식', link: '/wiki/knowledge/' },
  { id: 'business', name: '비즈니스', link: '/wiki/business/' }
];

const TECH_ITEMS = [
  { id: 'normal', name: '일반', link: '/tech/normal/' },
  { id: 'ai', name: 'AI', link: '/tech/ai/' },
  { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/' }
];

// 테크 그룹은 테크 페이지 전용 (generate-html-report.js의
// stripTechSidebarFromNonTechDocs 규칙과 동일한 노출 정책)
const DEFAULT_GROUPS = [
  { title: '리포트', link: '/magazine/issue/', items: REPORT_ITEMS },
  { title: '위키', link: '/wiki/', items: WIKI_ITEMS }
];

const TECH_GROUP = { title: '테크', link: '/tech/', items: TECH_ITEMS };

// counts: { issue, insight, hotpick, ranking, history, knowledge, business, normal, ai, vibecoding }
// options.groups: custom [{ title, link, items: [{ id?, name, link, count? }] }] (defaults to 리포트+위키)
// options.includeTech: append the 테크 group (tech pages only)
function generateSidebarCategories(counts = {}, options = {}) {
  const groups = options.groups
    || (options.includeTech ? [...DEFAULT_GROUPS, TECH_GROUP] : DEFAULT_GROUPS);

  const renderItems = (items) => items.map((cat) => {
    const count = cat.count !== undefined ? cat.count : counts[cat.id];
    return `
      <a href="${cat.link}" class="sidebar-category-item">
        <span class="sidebar-category-name">${cat.name}</span>${count !== undefined ? `<span class="sidebar-category-count">${count}</span>` : ''}
      </a>`;
  }).join('');

  const renderGroup = (group) => `
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="${group.link}" class="home-card-title-link"><h2 class="home-card-title">${group.title}</h2></a></div>
          <div class="sidebar-category-list">${renderItems(group.items)}</div>
        </div>`;

  return `
      <div class="home-card" id="sidebar-categories">${groups.map(renderGroup).join('')}
      </div>`;
}

// popular/latest: [{ title, link|url|path }]
// options: { cap = 10, activeLink, tabId = 'sidebarArticleTab',
//            popularId = 'sidebar-popular', latestId = 'sidebar-latest' }
function generateSidebarArticles(popular = [], latest = [], options = {}) {
  const cap = options.cap !== undefined ? options.cap : 10;
  const tabId = options.tabId || 'sidebarArticleTab';
  const popularId = options.popularId || 'sidebar-popular';
  const latestId = options.latestId || 'sidebar-latest';
  const activeLink = options.activeLink || null;

  const renderList = (items) => (items || []).slice(0, cap).map((item, i) => {
    const link = item.link || item.url || item.path || '#';
    return `
      <a href="${link}" class="sidebar-article-item${activeLink && link === activeLink ? ' active' : ''}">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${escapeHtml(item.title)}</span>
      </a>`;
  }).join('');

  return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="${tabId}">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="${popularId}">${renderList(popular)}</div>
          <div class="sidebar-article-list" id="${latestId}">${renderList(latest)}</div>
        </div>
      </div>`;
}

// One-call convenience: categories + articles.
// opts: { counts, groups, popular, latest, cap, activeLink, tabId, popularId, latestId }
function generateSidebar(opts = {}) {
  return generateSidebarCategories(opts.counts || {}, opts)
    + generateSidebarArticles(opts.popular, opts.latest, opts);
}

module.exports = { generateSidebarCategories, generateSidebarArticles, generateSidebar };
