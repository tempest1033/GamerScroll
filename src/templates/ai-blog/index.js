/**
 * AIScroll 공통 레이아웃 · 홈 · 카테고리/주제 · 검색 페이지 템플릿
 *
 * 디자인은 게이머스크롤 문법을 따른다: 흰 배경, 시스템 글꼴, 큰 제목과 가는 구분선, 회색 판.
 * 스타일은 src/aiscroll-styles, 모든 페이지가 함께 쓰는 동작(검색·광고·스와이프·피드 페이저)은
 * 한 번 받아 캐시되는 /assets/layout-core.js (src/aiscroll-ui/layout.js + site-runtime.js)가 맡는다.
 * 빌드는 CSS 링크를 페이지별 인라인 CSS로, loading="lazy" 이미지를 화면 근처 지연 로딩으로 바꾼다
 * (generate-ai-blog.js applyPageAssets).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCardFeedPagerScript, LAYOUT_CORE_ASSET, buildLayoutCoreBundle, AD_SLOTS, generateHomeAdPairSlot } = require('../../aiscroll-ui/layout');
const { lazyImageLoaderScript } = require('../../aiscroll-build/lazy-images');

// 광고 활성화 여부 (ADS_ENABLED=false면 비활성화)
const ADS_ENABLED = process.env.ADS_ENABLED !== 'false';

// 분류 체계 (카테고리 5개 + 주제 태그) — 라벨·URL·저자 규칙은 taxonomy.js가 단일 출처
const taxonomy = require('./taxonomy');
const {
  CATEGORY_IDS,
  DEFAULT_CATEGORY,
  CATEGORY_LABELS,
  TOPIC_LABELS,
  NAV_TOPIC_IDS,
  SITE_X_URL,
  PERSON_AUTHOR,
  normalizeCategory,
  categoryDescription,
  topicLabel,
  topicsOf,
} = taxonomy;

// 사이트 설정
const SITE_CONFIG = {
  name: 'AIScroll',
  baseUrl: 'https://aiscroll.io',
  title: 'AIScroll - AI reviews and dev logs by Plankton',
  description: 'A personal blog by Plankton, the developer behind the Mixdog coding agent: hands-on reviews of AI models and tools, researched analysis and news, and dev logs.',
  keywords: 'AI reviews, coding agents, dev log, Mixdog, AI tools, Plankton',
  favicon: '/favicon.svg',
  ogImage: '/og-image.png'
};

// i18n labels
const I18N = {
  en: {
    popular: 'Popular', latest: 'Latest', search: 'Search', closeSearch: 'Close search',
    searchPlaceholder: 'Search posts',
    privacy: 'Privacy Policy', categories: 'Categories', topics: 'Topics', about: 'About',
    published: 'Published', updated: 'Updated', toc: 'Table of Contents',
    noResults: 'No results found', sources: 'Sources', related: 'Related posts',
    previous: 'Previous', next: 'Next', list: 'All posts',
    categoryLabels: CATEGORY_LABELS.en,
    topicLabels: TOPIC_LABELS.en,
    navLabel: 'Sections',
    recent: 'Latest posts', recentFirst: 'Newest post', readArticle: 'Read post', viewAll: 'View all',
    newsHeading: 'News', mixdogKicker: 'The coding agent I build', mixdogDesc: 'Why I built it, how I use it, and what keeps changing.', mixdogMore: 'All Mixdog posts',
    prevPage: 'Previous page', nextPage: 'Next page', pages: 'Pages',
    share: 'Share this article', copyLink: 'Copy link', copied: 'Copied',
    loading: 'Loading…', searchHint: 'Enter at least two characters to search.',
    searchCount: '{n} results for “{q}”', searchNone: 'No results for “{q}”', searchFail: 'Could not load search results.',
    emptyCollection: 'No posts here yet.'
  },
  ko: {
    popular: '인기', latest: '최신', search: '검색', closeSearch: '검색 닫기',
    searchPlaceholder: '글 검색',
    privacy: '개인정보처리방침', categories: '카테고리', topics: '주제', about: '소개',
    published: '발행', updated: '수정', toc: '목차',
    noResults: '검색 결과가 없습니다', sources: '출처', related: '함께 읽을 글',
    previous: '이전 글', next: '다음 글', list: '목록',
    categoryLabels: CATEGORY_LABELS.ko,
    topicLabels: TOPIC_LABELS.ko,
    navLabel: '분류',
    recent: '최근 글', recentFirst: '가장 최근 글', readArticle: '글 읽기', viewAll: '전체 보기',
    newsHeading: '소식', mixdogKicker: '직접 만드는 코딩 에이전트', mixdogDesc: '왜 만들었고, 어떻게 쓰고, 무엇이 바뀌고 있는지 기록합니다.', mixdogMore: '믹스독 글 모아 보기',
    prevPage: '이전 페이지', nextPage: '다음 페이지', pages: '페이지',
    share: '이 글 공유', copyLink: '링크 복사', copied: '복사됨',
    loading: '불러오는 중…', searchHint: '검색어를 두 글자 이상 입력하세요.',
    searchCount: '“{q}” 검색 결과 {n}건', searchNone: '“{q}” 검색 결과가 없습니다', searchFail: '검색 결과를 불러오지 못했습니다.',
    emptyCollection: '아직 이 분류에 글이 없습니다.'
  }
};

function langPrefixOf(lang) { return lang === 'ko' ? '/ko' : ''; }
function normalizeLang(lang) { return lang === 'ko' ? 'ko' : 'en'; }
function pathForLang(pathname = '/', lang = 'en') {
  const prefix = langPrefixOf(normalizeLang(lang));
  const normalizedPath = `/${String(pathname || '/').replace(/^\/+/, '')}`;
  if (!prefix) return normalizedPath;
  return normalizedPath === '/' ? `${prefix}/` : `${prefix}${normalizedPath}`;
}
function articleHref(category = DEFAULT_CATEGORY, slug = '', lang = 'en') {
  return pathForLang(`/article/${normalizeCategory(category)}/${slug}/`, lang);
}
function categoryHref(category = DEFAULT_CATEGORY, lang = 'en') {
  return pathForLang(`/article/${normalizeCategory(category)}/`, lang);
}
function topicHref(topicId, lang = 'en') {
  return pathForLang(`/topic/${topicId}/`, lang);
}
function homeHref(lang = 'en') { return pathForLang('/', lang); }
function searchHref(lang = 'en') { return pathForLang('/search/', lang); }
function aboutHref(lang = 'en') { return pathForLang(PERSON_AUTHOR.path, lang); }

const AI_CATEGORY_IDS = CATEGORY_IDS;

// 로고: assets/aiscroll-logo.svg (점 4개 마크 + 워드마크 윤곽선). 인라인으로 넣어 currentColor 를 따른다.
// 좌표를 소수 첫째 자리로 줄인다(8.0KB → 약 2.9KB, 22px 높이에서 오차 0.04px 미만).
const AISCROLL_LOGO_SVG = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'assets', 'aiscroll-logo.svg'), 'utf8')
  .trim()
  .replace(/\s(?:width|height)="[^"]*"/g, '')
  .replace(/-?\d+\.\d{2,}/g, (n) => String(+Number(n).toFixed(1)));
const logoSvg = (className) => AISCROLL_LOGO_SVG.replace(/^<svg\b/, `<svg class="${className}"`);

const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>';
// 모바일에서 받지 않을 이미지 자리(<picture>의 source)에 쓰는 1px 투명 GIF
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// 상단 메뉴: 카테고리 5개 + 대표 주제(바이브코딩). kind로 URL·라벨 출처를 가른다.
const AI_NAV_ITEMS = [
  ...CATEGORY_IDS.map(id => ({ id, kind: 'category' })),
  ...NAV_TOPIC_IDS.map(id => ({ id, kind: 'topic' })),
  { id: 'about', kind: 'page' }
];

// 헤더: PC는 로고 · 메뉴 · 검색 한 줄, 모바일은 로고 · 돋보기 한 줄 + 메뉴 한 줄.
// 검색은 GET 폼이라 자바스크립트 없이도 검색 페이지로 간다. 런타임이 드롭다운 결과와 모바일 펼침을 붙인다.
function generateHeader(currentPage = 'home', lang = 'en', navCurrent = 'page') {
  const t = I18N[lang] || I18N.en;
  const items = AI_NAV_ITEMS.map(item => {
    const label = item.kind === 'page' ? t.about : item.kind === 'topic' ? topicLabel(item.id, lang) : t.categoryLabels[item.id];
    const href = item.kind === 'page' ? aboutHref(lang) : item.kind === 'topic' ? topicHref(item.id, lang) : categoryHref(item.id, lang);
    const current = item.id === currentPage ? ` aria-current="${navCurrent}"` : '';
    return `<a class="site-nav-item" href="${href}" data-nav-id="${item.id}"${current}>${escapeHtml(label)}</a>`;
  }).join('');
  return `
  <header class="site-header" id="site-header">
    <div class="site-header-in">
      <a class="site-logo" href="${homeHref(lang)}" aria-label="AIScroll">${logoSvg('site-logo-svg')}</a>
      <nav class="site-nav" aria-label="${t.navLabel}">${items}</nav>
      <form class="site-search" id="site-search" action="${searchHref(lang)}" method="get" role="search">
        <div class="site-search-box">
          <input class="search-input" type="search" name="q" placeholder="${t.searchPlaceholder}" aria-label="${t.search}" autocomplete="off" enterkeyhint="search">
          <button class="search-submit" type="submit" aria-label="${t.search}">${ICON_SEARCH}</button>
          <button class="search-close" type="button" aria-label="${t.closeSearch}">${ICON_CLOSE}</button>
        </div>
        <div class="search-dropdown" data-css-tokens="search-result-item search-no-results"></div>
      </form>
      <a class="search-toggle" href="${searchHref(lang)}" aria-label="${t.search}" aria-controls="site-search" aria-expanded="false">${ICON_SEARCH}</a>
    </div>
  </header>
  <script>(function(){var n=document.querySelector('.site-nav'),a=n&&n.querySelector('[aria-current]');if(!a||n.scrollWidth<=n.clientWidth+1)return;n.scrollLeft=Math.max(0,a.getBoundingClientRect().left-n.getBoundingClientRect().left+n.scrollLeft-(n.clientWidth-a.offsetWidth)/2);})();</script>`;
}

// 푸터: 회색 띠 한 줄 — © · 소개 · 개인정보. X 링크는 소개 페이지(rel=me)에 있다.
function generateFooter(lang = 'en') {
  const t = I18N[lang] || I18N.en;
  const sep = '<span class="site-footer-sep" aria-hidden="true">|</span>';
  return `
  <footer class="site-footer">
    <span>© ${new Date().getFullYear()} AIScroll</span>${sep}<a href="${aboutHref(lang)}">${t.about}</a>${sep}<a href="${pathForLang('/privacy/', lang)}">${t.privacy}</a>
  </footer>`;
}

// 날짜 포맷 헬퍼 (2026-01-30 → Jan 30, 2026)
function formatDateEn(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 카드 메타용 짧은 날짜 — ko: 2026.09.04 / en: Sep 4, 2026
function formatDateShort(dateStr, lang = 'en') {
  if (!dateStr) return '';
  if (lang !== 'ko') return formatDateEn(dateStr);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

// 기사 메타용 긴 날짜 — ko: 2026년 9월 4일 / en: Sep 4, 2026
function formatDateLong(dateStr, lang = 'en') {
  return lang === 'ko' ? formatDateKo(dateStr) : formatDateEn(dateStr);
}

// HTML 이스케이프
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 썸네일 URL: 외부 이미지는 wsrv.nl로 폭을 줄인 WebP, 로컬 이미지(/assets/…)는 그대로
function getThumbUrl(url, width = 480) {
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.startsWith('/assets/') || url.startsWith('/favicon')) {
    return url;
  }
  if (url.startsWith('http')) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp`;
  }
  return url;
}

// <img>의 src·srcset·sizes 속성. 외부 이미지는 폭별 후보를, 로컬 이미지(최대 640px 원본)는 원본 하나를 쓴다.
function thumbAttrs(url, widths = [480], sizes = '') {
  const raw = String(url || '');
  if (!raw) return '';
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
  if (!/^https?:/.test(absolute) || widths.length < 2) {
    return `src="${escapeHtml(getThumbUrl(absolute, widths[widths.length - 1]))}"`;
  }
  const srcset = widths.map(width => `${getThumbUrl(absolute, width)} ${width}w`).join(', ');
  return `src="${escapeHtml(getThumbUrl(absolute, widths[widths.length - 1]))}" srcset="${escapeHtml(srcset)}" sizes="${sizes}"`;
}

// 카드·목록 공통 메타: 분류 · 날짜
function renderMeta(item, lang = 'en') {
  const t = I18N[lang] || I18N.en;
  const label = t.categoryLabels[normalizeCategory(item.category)] || '';
  const date = formatDateShort(item.date, lang);
  const dateAttr = escapeHtml(String(item.date || '').slice(0, 10));
  return `<div class="meta"><span class="meta-cat">${escapeHtml(label)}</span>${date ? `<time datetime="${dateAttr}">${date}</time>` : ''}</div>`;
}

const FEED_PAGE_SIZE = 12; // 3열 × 4줄 — 마지막 줄이 비지 않게
// 첫 페이지는 전부 서버 렌더한다. 일부만 렌더하고 JS로 채우면 로드 후 그리드가 자라며
// 아래 요소(숨김 SEO 링크·페이지네이션)가 밀려 CLS가 생긴다 (라이브 측정 0.239).
const INITIAL_FEED_RENDER_COUNT = FEED_PAGE_SIZE;
const AI_LAYOUT_ASSET_VERSION = (() => {
  try {
    const coreBundle = buildLayoutCoreBundle();
    if (!coreBundle || typeof coreBundle !== 'string') return 'v1';
    return crypto.createHash('md5').update(coreBundle).digest('hex').slice(0, 10);
  } catch (_) {
    return 'v1';
  }
})();

// layout-core.js(defer)가 오기 전에 페이지 스크립트가 등록한 초기화 함수를 모아 둔다
const coreReadyBootstrapScript = `
  <script>
    (function() {
      if (typeof window.__gsOnReady !== 'function') {
        var readyQueue = [];
        window.__gsOnReady = function(fn) {
          if (typeof fn !== 'function') return;
          if (window.GSUtils && window.GSUtils.__ready === true) {
            try { fn(); } catch (e) {}
            return;
          }
          readyQueue.push(fn);
        };
        window.__gsFlushReadyQueue = function() {
          if (!window.GSUtils || window.GSUtils.__ready !== true) return;
          var queue = readyQueue.slice();
          readyQueue.length = 0;
          queue.forEach(function(fn) {
            try { fn(); } catch (e) {}
          });
        };
      }
    })();
  </script>`;

function extractSeoLinkFromCardHtml(cardHtml) {
  if (!cardHtml || typeof cardHtml !== 'string') return null;
  const hrefMatch = cardHtml.match(/<a[^>]*href="([^"]+)"/i);
  if (!hrefMatch || !hrefMatch[1]) return null;

  let title = '';
  const lazyTitleMatch = cardHtml.match(/alt="([^"]+)"/i);
  if (lazyTitleMatch && lazyTitleMatch[1]) title = lazyTitleMatch[1];
  if (!title) {
    const titleMatch = cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return {
    href: hrefMatch[1],
    title: title || hrefMatch[1]
  };
}

function serializeDeferredCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  return JSON.stringify(cards).replace(/</g, '\\u003c');
}

function renderDeferredSeoLinks(links, id = '') {
  if (!Array.isArray(links) || links.length === 0) return '';
  const idAttr = id ? ` id="${id}"` : '';
  return `<div class="visually-hidden"${idAttr}>${links.map((link) => `
    <a href="${escapeHtml(link.href)}">${escapeHtml(link.title || link.href)}</a>
  `).join('')}</div>`;
}

function buildDeferredCardPayload(cardHtmlList, pageSize = FEED_PAGE_SIZE, initialRenderCount = pageSize) {
  const safeCards = Array.isArray(cardHtmlList) ? cardHtmlList.filter(item => typeof item === 'string' && item.trim() !== '') : [];
  const safeInitialRenderCount = Math.max(1, Math.min(initialRenderCount, pageSize));
  const initialCards = safeCards.slice(0, safeInitialRenderCount);
  const deferredCards = safeCards.slice(safeInitialRenderCount);
  const deferredLinks = deferredCards.map(extractSeoLinkFromCardHtml).filter(Boolean);

  return {
    initialHtml: initialCards.join(''),
    deferredJson: serializeDeferredCards(deferredCards),
    deferredSeoLinksHtml: renderDeferredSeoLinks(deferredLinks)
  };
}

// 피드 카드 이미지: PC 3열(약 370px) · 모바일 목록 썸네일 96px
const FEED_CARD_SIZES = '(max-width: 768px) 96px, (max-width: 1099px) 46vw, 370px';

/**
 * 최신 기사 · 카테고리 · 주제 · 검색 결과 공용 카드
 * PC: 이미지 위 · 분류와 날짜 · 제목 · 요약 / 모바일: 왼쪽 썸네일 목록 (CSS만 다르다)
 * options.eagerCount: 앞에서부터 바로 받을 카드 수, options.highPriorityIndex: LCP 후보 카드
 */
function renderFeedCard(item, index, lang = 'en', options = {}) {
  const _lang = normalizeLang(lang);
  const eager = index < (Number.isFinite(options.eagerCount) ? options.eagerCount : 0);
  const high = Number.isFinite(options.highPriorityIndex) && index === options.highPriorityIndex;
  const image = item.thumbnail
    ? `<img ${thumbAttrs(item.thumbnail, [320, 640], FEED_CARD_SIZES)} width="640" height="360" alt="" ${eager ? 'loading="eager"' : 'loading="lazy"'}${high ? ' fetchpriority="high"' : ''} decoding="async" data-img-fallback="hide">`
    : '';
  return `
      <a class="feed-card" href="${articleHref(item.category, item.slug, _lang)}">
        <div class="feed-thumb">${image}</div>
        <div class="feed-body">
          ${renderMeta(item, _lang)}
          <h3 class="feed-title">${escapeHtml(item.title)}</h3>
          ${item.summary ? `<p class="feed-sum">${escapeHtml(item.summary)}</p>` : ''}
        </div>
      </a>`;
}

// PC 페이지 넘김. 한 페이지뿐이면 숨긴다(모바일은 피드 광고를 위해 페이저 스크립트가 그대로 돈다).
function renderFeedPager(id, total, lang = 'en') {
  const t = I18N[lang] || I18N.en;
  const totalPages = Math.ceil(total / FEED_PAGE_SIZE) || 1;
  return `
      <nav class="feed-pager" id="${id}" aria-label="${t.pages}" data-total="${total}" data-per-page="${FEED_PAGE_SIZE}"${totalPages > 1 ? '' : ' hidden'}>
        <button class="feed-page-btn feed-prev" type="button" aria-label="${t.prevPage}" disabled>‹</button>
        <span class="feed-page-info">1 / ${totalPages}</span>
        <button class="feed-page-btn feed-next" type="button" aria-label="${t.nextPage}"${totalPages > 1 ? '' : ' disabled'}>›</button>
      </nav>`;
}

function feedPagerScript(grid, pagination, deferredJson) {
  return buildCardFeedPagerScript({
    grid,
    pagination,
    deferredJson,
    itemSelector: '.feed-card',
    pageSize: FEED_PAGE_SIZE,
    hydrateLazyImages: false,
    mobileAds: true,
    prevSelector: '.feed-prev',
    nextSelector: '.feed-next',
    infoSelector: '.feed-page-info',
    adInterval: 6,
    initialRenderCount: INITIAL_FEED_RENDER_COUNT,
    idleFillFirstPage: false,
    idleFillDelay: 120,
    // 모바일 DOM 창은 2페이지(24장) 이상이어야 다음 묶음을 붙인다. 1이면 12장에서 멈춰 13번째 글부터 보이지 않았다.
    mobileDomWindowPages: 2,
    mobileInitialPages: 1,
    mobileLoadBatchPages: 1,
    eagerScrollAdPushLimit: 1
  });
}

// 카드 목록 + (2페이지부터는 외부 JSON으로 빼는) 지연 카드 + 페이저
function renderFeedList(items, lang, ids, cardOptions = {}) {
  const cards = items.map((item, i) => renderFeedCard(item, i, lang, cardOptions));
  const payload = buildDeferredCardPayload(cards, FEED_PAGE_SIZE, INITIAL_FEED_RENDER_COUNT);
  return `
      <div class="feed-grid" id="${ids.grid}">${payload.initialHtml}</div>
      ${payload.deferredJson ? `<script type="application/json" id="${ids.data}">${payload.deferredJson}</script>${payload.deferredSeoLinksHtml}` : ''}
      ${renderFeedPager(ids.pager, items.length, lang)}`;
}

const PANEL_IMAGE_SIZES = '(max-width: 1099px) 46vw, 480px';

/**
 * AIScroll 홈페이지 생성
 * 최근 글(목록 + PC 미리보기 판) → 종류별 구역(개발일지 · 믹스독 · 리뷰 · 분석 · 소식)
 */
function generateAIBlogIndex(data) {
  const { articles = [], popularArticles = [] } = data;
  const _lang = normalizeLang(data.lang);
  const _t = I18N[_lang];
  const _langPrefix = langPrefixOf(_lang);
  // 홈 구성: 최근 글(종류 구분 없이 5건 + 가장 최근 글 미리보기 판) → 개발일지 → 믹스독 → 리뷰 → 분석 → 소식.
  // 종류별 구역은 글이 5건을 넘어 '최근 글'만으로 다 보이지 않을 때부터, 그 종류에 글이 있을 때만 나온다.
  const sorted = [...articles].sort((a, b) => new Date(b.date) - new Date(a.date));
  const top = sorted.slice(0, 5);
  const lead = top[0];
  const byCategory = (id) => sorted.filter(a => normalizeCategory(a.category) === id);
  const showSections = sorted.length > top.length;
  const secHead = (title, categoryId) => `<div class="sec-head"><h2>${escapeHtml(title)}</h2><a class="sec-more" href="${categoryHref(categoryId, _lang)}">${_t.viewAll} →</a></div>`;
  const thumbRow = (item, rank) => `
          <li><a class="pop-item${rank === 1 ? ' is-lead' : ''}${item.thumbnail ? '' : ' no-thumb'}" href="${articleHref(item.category, item.slug, _lang)}">
            ${rank ? `<span class="pop-rank">${rank}</span>` : ''}
            ${item.thumbnail ? `<img class="pop-thumb" ${thumbAttrs(item.thumbnail, [320])} width="320" height="180" alt="" loading="lazy" decoding="async" data-img-fallback="hide">` : ''}
            <div class="pop-text"><h3 class="pop-title">${escapeHtml(item.title)}</h3>${renderMeta(item, _lang)}</div>
          </a></li>`;

  const popularRows = top.map((item, i) => thumbRow(item, i + 1)).join('');

  // PC 미리보기 판: 가장 최근 글. 모바일은 판을 숨기고 <picture>의 빈 source로 큰 이미지를 아예 받지 않는다.
  // 목록 1행과 같은 글이라 보조 기술에는 숨긴다.
  // 글이 서너 건뿐일 때는 순위 목록 + 큰 미리보기 판 대신 큰 카드로 나란히 보여 준다 (목록이 짧으면 판 옆이 텅 빈다)
  const fewPosts = sorted.length < 4;
  const leadImage = !fewPosts && lead && lead.thumbnail
    ? { attrs: thumbAttrs(lead.thumbnail, [640, 960], PANEL_IMAGE_SIZES) }
    : null;
  const panelHtml = lead ? `
        <a class="pop-panel" href="${articleHref(lead.category, lead.slug, _lang)}" aria-hidden="true" tabindex="-1">
          <span class="pop-panel-label">${_t.recentFirst}</span>
          ${leadImage ? `<picture class="pop-panel-media"><source media="(max-width: 768px)" srcset="${BLANK_GIF}"><img class="pop-panel-img" ${leadImage.attrs} width="960" height="540" alt="" fetchpriority="high" decoding="async" data-img-fallback="hide"></picture>` : ''}
          ${renderMeta(lead, _lang)}
          <h3 class="pop-panel-title">${escapeHtml(lead.title)}</h3>
          ${lead.summary ? `<p class="pop-panel-sum">${escapeHtml(lead.summary)}</p>` : ''}
          <span class="btn btn-dark">${_t.readArticle} →</span>
        </a>` : '';

  const recentSection = !top.length ? '' : fewPosts ? `
      <section class="home-sec" id="home-recent">
        <div class="sec-head"><h2>${_t.recent}</h2></div>
        <div class="feed-grid cols-${top.length}">${top.map((item, i) => renderFeedCard(item, i, _lang, { eagerCount: 3, highPriorityIndex: 0 })).join('')}
        </div>
      </section>` : `
      <section class="home-sec" id="home-recent">
        <div class="sec-head"><h2>${_t.recent}</h2></div>
        <div class="pop-grid">
          <ol class="pop-list">${popularRows}
          </ol>${panelHtml}
        </div>
      </section>`;

  // 개발일지: 썸네일 없이 쓰는 글이라 회차 · 제목 · 한 줄 설명 · 날짜만 있는 줄 목록
  const devlogs = byCategory('devlog');
  const devlogSection = showSections && devlogs.length ? `
      <section class="home-sec" id="home-devlog">
        ${secHead(_t.categoryLabels.devlog, 'devlog')}
        <ol class="log-list">${devlogs.slice(0, 5).map((item, i) => `
          <li><a class="log-item" href="${articleHref(item.category, item.slug, _lang)}">
            <span class="log-no">#${devlogs.length - i}</span>
            <div><h3 class="log-title">${escapeHtml(item.title)}</h3>${item.summary ? `<p class="log-sum">${escapeHtml(item.summary)}</p>` : ''}</div>
            <time class="log-date" datetime="${escapeHtml(String(item.date || '').slice(0, 10))}">${formatDateShort(item.date, _lang)}</time>
          </a></li>`).join('')}
        </ol>
      </section>` : '';

  const mixdogs = byCategory('mixdog');
  const mixdogSection = showSections && mixdogs.length ? `
      <section class="home-sec" id="home-mixdog">
        <div class="mix-panel">
          <div>
            <span class="pop-panel-label">${_t.mixdogKicker}</span>
            <h2>Mixdog</h2>
            <p>${_t.mixdogDesc}</p>
            <a class="btn btn-dark" href="${categoryHref('mixdog', _lang)}">${_t.mixdogMore} →</a>
          </div>
          <ul class="mix-notes">${mixdogs.slice(0, 3).map(item => `
            <li><a href="${articleHref(item.category, item.slug, _lang)}"><span>${escapeHtml(item.title)}</span><time datetime="${escapeHtml(String(item.date || '').slice(0, 10))}">${formatDateShort(item.date, _lang)}</time></a></li>`).join('')}
          </ul>
        </div>
      </section>` : '';

  const reviews = byCategory('reviews');
  const reviewSection = showSections && reviews.length ? `
      <section class="home-sec" id="home-reviews">
        ${secHead(_t.categoryLabels.reviews, 'reviews')}
        <div class="feed-grid">${reviews.slice(0, 3).map((item, i) => renderFeedCard(item, i, _lang)).join('')}
        </div>
      </section>` : '';

  const analyses = byCategory('analysis');
  const analysisSection = showSections && analyses.length ? `
      <section class="home-sec" id="home-analysis">
        ${secHead(_t.categoryLabels.analysis, 'analysis')}
        <div class="feed-grid">${analyses.slice(0, 3).map((item, i) => renderFeedCard(item, i, _lang)).join('')}
        </div>
      </section>` : '';

  const newsItems = byCategory('news');
  const newsSection = showSections && newsItems.length ? `
      <section class="home-sec" id="home-news">
        ${secHead(_t.newsHeading, 'news')}
        <ol class="news-list">${newsItems.slice(0, 8).map(item => thumbRow(item, 0)).join('')}
        </ol>
      </section>` : '';

  // 상단 광고: PC 빌보드 / 모바일 300×250 (광고 자리 바로 뒤에서 요청)
  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001, { billboard: true });
  const _homeTitle = _lang === 'ko' ? 'AIScroll - 플랑크톤의 AI 리뷰와 개발일지' : SITE_CONFIG.title;
  const _homeDescription = _lang === 'ko'
    ? '코딩 에이전트 믹스독을 만드는 개발자 플랑크톤의 블로그. 직접 써 본 AI 모델·도구 리뷰, 직접 조사한 분석과 소식, 개발일지를 올립니다.'
    : SITE_CONFIG.description;
  const _homeKeywords = _lang === 'ko' ? 'AI 리뷰, 코딩 에이전트, 개발일지, 믹스독, AI 도구, 플랑크톤' : SITE_CONFIG.keywords;

  // 맨 위는 배너 자리라 소개 문구를 두지 않는다. h1 은 검색엔진·보조 기술용으로만 둔다.
  const content = `
    <div class="page-wrap home" id="home">
      ${topAds}
      <h1 class="visually-hidden">AIScroll</h1>
      ${recentSection}
      ${devlogSection}
      ${mixdogSection}
      ${reviewSection}
      ${analysisSection}
      ${newsSection}
    </div>
  `;

  const pageScripts = '';

  // WebSite JSON-LD for homepage (includes SearchAction)
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": SITE_CONFIG.name,
    "alternateName": ["AI Scroll", "aiscroll"],
    "url": `${SITE_CONFIG.baseUrl}${homeHref(_lang)}`,
    "description": _homeDescription,
    "inLanguage": _lang === 'ko' ? 'ko-KR' : 'en-US',
    "publisher": {
      "@type": "Organization",
      "name": SITE_CONFIG.name,
      "url": SITE_CONFIG.baseUrl,
      "sameAs": [SITE_X_URL],
      "logo": {
        "@type": "ImageObject",
        "url": `${SITE_CONFIG.baseUrl}/icon-192.png`
      }
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${SITE_CONFIG.baseUrl}${searchHref(_lang)}?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  // LCP: PC는 미리보기 판 이미지. 모바일은 판을 숨기므로 미리 받지 않는다.
  const panelPreload = leadImage ? { ...imageAttrsForPreload(leadImage.attrs), media: '(min-width: 769px)' } : null;

  return wrapWithLayout(content, {
    title: _homeTitle,
    description: _homeDescription,
    keywords: _homeKeywords,
    canonical: SITE_CONFIG.baseUrl + _langPrefix + '/',
    pageScripts: pageScripts,
    jsonLd: websiteJsonLd,
    lang: _lang,
    alternates: data.alternates || null,
    preloadImage: panelPreload
  });
}

// <img> 속성 문자열에서 preload에 쓸 src·srcset·sizes를 꺼낸다 (HTML 이스케이프 해제)
function imageAttrsForPreload(attrs) {
  const read = (name) => {
    const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(String(attrs || ''));
    return match ? match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
  };
  const src = read('src');
  if (!src || src.startsWith('data:')) return null;
  return { src, srcset: read('srcset'), sizes: read('sizes') };
}

// 이미지 로드 실패 처리: data-img-fallback="hide" 이미지는 숨긴다 (캡처 단계라 지연 로딩 이미지도 잡는다)
const imageFallbackScript = `<script>document.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&t.getAttribute('data-img-fallback')==='hide')t.style.display='none';},true);</script>`;

/**
 * 레이아웃 래퍼
 * options.cssFilenames: 기본 ['/styles-core.css'], 기사·소개처럼 본문 스타일이 필요한 페이지는 styles-article.css 추가
 * options.navCurrent: 상단 메뉴 현재 표시 — 목록 페이지 'page', 기사 페이지 'true'(해당 분류 안)
 * options.preloadImage: { src, srcset, sizes, media } — 없으면 본문 첫 fetchpriority="high" 이미지를 쓴다
 */
function wrapWithLayout(content, options = {}) {
  const {
    title = SITE_CONFIG.title,
    description = SITE_CONFIG.description,
    keywords = SITE_CONFIG.keywords,
    canonical = SITE_CONFIG.baseUrl,
    pageScripts = '',
    currentPage = 'home',
    navCurrent = 'page',
    jsonLd = null,
    ogImage = null,
    // Article-specific OG tags
    articleMeta = null,  // { publishedTime, modifiedTime, section, author, tags }
    ogTitle = null,       // 전체 헤드라인 (og:title/twitter:title/og:image:alt용); null이면 title 재사용
    ogType = 'website',   // 'website' for homepage, 'article' for articles
    noindex = false,      // true이면 검색엔진 인덱싱 차단
    cssFilenames = null,
    lang = 'en',
    alternates = null,
    preloadImage = null
  } = options;
  const _lang = normalizeLang(lang);
  const isKo = _lang === 'ko';
  const ogLocale = isKo ? 'ko_KR' : 'en_US';
  const rssHref = isKo ? `${SITE_CONFIG.baseUrl}/ko/rss.xml` : `${SITE_CONFIG.baseUrl}/rss.xml`;
  const alternateEntries = Object.entries(alternates || {}).filter(([language, url]) => ['en', 'ko'].includes(language) && url);
  const hreflangLinks = alternateEntries.length ? '\n  ' + [
    ...alternateEntries.map(([language, url]) => `<link rel="alternate" hreflang="${language}" href="${escapeHtml(url)}">`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(alternates.en || alternates.ko)}">`
  ].join('\n  ') : '';

  const runtimeAssetVersion = encodeURIComponent(AI_LAYOUT_ASSET_VERSION || 'v1');
  const coreScriptUrl = `/assets/${LAYOUT_CORE_ASSET}?v=${runtimeAssetVersion}`;
  const shouldLoadTwitterWidget = /twitter-tweet/.test(content || '');
  const usesWsrv = /https:\/\/wsrv\.nl\//.test(content || '');
  const cssFiles = [...new Set((Array.isArray(cssFilenames) && cssFilenames.length > 0 ? cssFilenames : ['/styles-core.css'])
    .map(file => String(file || '').trim()).filter(Boolean))];
  const cssLinksHtml = cssFiles.map(file => `<link rel="stylesheet" href="${escapeHtml(file)}">`).join('\n  ');

  // Description 155자 제한 (모든 페이지 공통 적용)
  const safeDescription = description.length > 155
    ? description.slice(0, 152).replace(/\s+\S*$/, '') + '...'
    : description;

  // og:title/twitter:title은 전체 헤드라인 사용 (SNS 공유 카드 절단 방지)
  const effectiveOgTitle = ogTitle || title;

  // noindex 페이지(404 등)에는 AdSense 로드 금지 — 정책 + impression 가치 보호
  const _adsActive = ADS_ENABLED && !noindex;

  // LCP 이미지 preload: 광고 스크립트 다음 순서 (광고 우선), 본문 <img>와 같은 후보라 한 번만 받는다
  const preload = preloadImage || (() => {
    const tag = /<img\b[^>]*\bfetchpriority="high"[^>]*>/i.exec(String(content || ''));
    return tag ? imageAttrsForPreload(tag[0]) : null;
  })();
  const preloadHtml = preload && preload.src ? `
  <link rel="preload" as="image" fetchpriority="high" href="${escapeHtml(preload.src)}"${preload.srcset ? ` imagesrcset="${escapeHtml(preload.srcset)}"` : ''}${preload.sizes ? ` imagesizes="${escapeHtml(preload.sizes)}"` : ''}${preload.media ? ` media="${escapeHtml(preload.media)}"` : ''}>` : '';

  const ogImageUrl = ogImage || `${SITE_CONFIG.baseUrl}${SITE_CONFIG.ogImage}`;
  const ogImageWidth = options.ogImageWidth || 1200;
  const ogImageHeight = options.ogImageHeight || 630;
  const jsonLdScript = jsonLd ? `\n  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script>` : '';

  // Article OG tags
  const articleTagsMeta = (articleMeta?.tags || []).map(tag =>
    `<meta property="article:tag" content="${escapeHtml(tag)}">`
  ).join('\n  ');
  const articleOgTags = articleMeta ? '\n  ' + [
    `<meta property="article:published_time" content="${articleMeta.publishedTime}">`,
    articleMeta.modifiedTime ? `<meta property="article:modified_time" content="${articleMeta.modifiedTime}">` : '',
    `<meta property="article:section" content="${escapeHtml(articleMeta.section)}">`,
    `<meta property="article:author" content="${escapeHtml(articleMeta.author || SITE_CONFIG.name)}">`,
    articleTagsMeta
  ].filter(Boolean).join('\n  ') : '';

  return `<!DOCTYPE html>
<html lang="${_lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">${_adsActive ? `
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
  <link rel="preconnect" href="https://tpc.googlesyndication.com" crossorigin>
  <script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9477874183990825"></script>` : ''}${usesWsrv ? `
  <link rel="preconnect" href="https://wsrv.nl">` : ''}${preloadHtml}
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(safeDescription)}">
  <meta name="keywords" content="${escapeHtml(keywords)}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : `<meta name="robots" content="max-image-preview:large">
  <link rel="canonical" href="${canonical}">`}
  <link rel="icon" type="image/svg+xml" href="${SITE_CONFIG.favicon}">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <meta name="application-name" content="${SITE_CONFIG.name}">
  <meta name="apple-mobile-web-app-title" content="${SITE_CONFIG.name}">
  <meta name="theme-color" content="#ffffff">
  <meta name="color-scheme" content="light">
  <meta property="og:title" content="${escapeHtml(effectiveOgTitle)}">
  <meta property="og:description" content="${escapeHtml(safeDescription)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="${ogImageWidth}">
  <meta property="og:image:height" content="${ogImageHeight}">
  <meta property="og:image:alt" content="${escapeHtml(effectiveOgTitle)}">
  <meta property="og:locale" content="${ogLocale}">
  <meta property="og:locale:alternate" content="${isKo ? 'en_US' : 'ko_KR'}">
  <meta property="og:site_name" content="${SITE_CONFIG.name}">${articleOgTags}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aiscroll_io">
  <meta name="twitter:creator" content="@aiscroll_io">
  <meta name="twitter:title" content="${escapeHtml(effectiveOgTitle)}">
  <meta name="twitter:description" content="${escapeHtml(safeDescription)}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="twitter:image:alt" content="${escapeHtml(title)}">
  <link rel="alternate" type="application/rss+xml" title="${SITE_CONFIG.name} RSS Feed" href="${rssHref}">${hreflangLinks}
  <link rel="dns-prefetch" href="https://www.gstatic.com">${jsonLdScript}
  <!-- 메인 CSS -->
  ${cssLinksHtml}
  ${lazyImageLoaderScript}
  ${imageFallbackScript}
  <script>
    // 페이지뷰 큐 (Firebase 로드 전 이벤트 저장)
    (function() {
      if (window.location.hostname !== 'aiscroll.io') return;
      window.__asPageViewQueue = [];
      window.__asLogPageView = function(path) { window.__asPageViewQueue.push(path); };
    })();
  </script>
  <script type="module">
    (function() {
      if (window.location.hostname !== 'aiscroll.io') return;
      function initFirebase() {
        (async function() {
          try {
            const [{ initializeApp }, { getAnalytics, logEvent }] = await Promise.all([
              import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
              import('https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js')
            ]);
            const firebaseConfig = {
              apiKey: "AIzaSyBrklaUMi0oCBdwdAKidy-ZrZSNeHR9irg",
              authDomain: "aiscroll.firebaseapp.com",
              projectId: "aiscroll",
              storageBucket: "aiscroll.firebasestorage.app",
              messagingSenderId: "616378969440",
              appId: "1:616378969440:web:9a8e65a68fe990cc934205",
              measurementId: "G-RKW0H8HYMS"
            };
            const analytics = getAnalytics(initializeApp(firebaseConfig));
            (window.__asPageViewQueue || []).forEach(function(path) {
              logEvent(analytics, 'page_view', { page_path: path, page_location: window.location.origin + path });
            });
            window.__asLogPageView = function(path) {
              logEvent(analytics, 'page_view', { page_path: path, page_location: window.location.origin + path });
            };
          } catch (e) {}
        })();
      }
      // 페이지 load 뒤 상단 광고 결과(filled/unfilled)가 나오면 시작한다(최대 3초 대기):
      // 분석 스크립트(약 190KB)가 광고 소재와 대역폭·CPU를 나눠 쓰지 않게 한다.
      function afterTopAd() {
        var ad = document.querySelector('ins.adsbygoogle[data-gs-ad-pushed="1"]');
        if (!ad || ad.getAttribute('data-ad-status')) return initFirebase();
        var started = false;
        var observer = new MutationObserver(function() {
          if (ad.getAttribute('data-ad-status')) start();
        });
        function start() {
          if (started) return;
          started = true;
          observer.disconnect();
          initFirebase();
        }
        observer.observe(ad, { attributes: true, attributeFilter: ['data-ad-status'] });
        setTimeout(start, 3000);
      }
      if (document.readyState === 'complete') setTimeout(afterTopAd, 0);
      else window.addEventListener('load', afterTopAd);
    })();
  </script>
</head>
<body class="page-${escapeHtml(currentPage)}${ADS_ENABLED ? '' : ' ads-disabled'}" data-page="${escapeHtml(currentPage)}">
  <script>try{if(sessionStorage.getItem('ai-search-hidden')==='1'){document.body.classList.add('search-hidden');sessionStorage.removeItem('ai-search-hidden');}}catch(e){}</script>
  ${generateHeader(currentPage, _lang, navCurrent)}
  <main class="site-container">
    ${coreReadyBootstrapScript}
    ${content}
  </main>
  ${generateFooter(_lang)}
  ${pageScripts}
  <script defer src="${coreScriptUrl}"></script>
  ${shouldLoadTwitterWidget ? '<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>' : ''}
  <script>
    (function() {
      // 이전 페이지에서 헤더 윗줄을 접은 채 왔으면 같은 높이(60px)만큼 내려 메뉴 위치를 그대로 둔다
      if (document.body.classList.contains('search-hidden') && window.innerWidth <= 768) window.scrollTo(0, 60);
      if (!('serviceWorker' in navigator) || location.protocol !== 'https:' || location.hostname !== 'aiscroll.io') return;
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js').catch(function() {});
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * 검색 결과 페이지 생성 — /search/?q=
 * 결과는 articles.json을 받아 제목으로 거른 뒤 피드 카드와 같은 모양으로 그린다.
 */
function generateSearchPage(lang = 'en') {
  const _lang = normalizeLang(lang);
  const _t = I18N[_lang];
  const content = `
    <div class="page-wrap search-page" id="search">
      <header class="collection-head">
        <h1 class="collection-title">${_t.search}</h1>
      </header>
      <form class="search-page-form" action="${searchHref(_lang)}" method="get" role="search">
        <input class="search-page-input" type="search" name="q" placeholder="${_t.searchPlaceholder}" aria-label="${_t.search}" autocomplete="off" enterkeyhint="search">
        <button class="btn btn-dark search-page-btn" type="submit">${_t.search}</button>
      </form>
      <p class="search-page-count" id="searchCount" role="status" aria-live="polite"></p>
      <div class="feed-grid" id="searchResults" data-css-tokens="feed-card feed-thumb feed-body feed-title feed-sum meta meta-cat"></div>
      ${renderFeedPager('searchPager', 0, _lang)}
    </div>
  `;

  const searchText = {
    prefix: langPrefixOf(_lang),
    lang: _lang,
    labels: _t.categoryLabels,
    hint: _t.searchHint,
    loading: _t.loading,
    count: _t.searchCount,
    none: _t.searchNone,
    fail: _t.searchFail,
    sizes: FEED_CARD_SIZES
  };
  const pageScripts = `<script>
    (function() {
      var T = ${JSON.stringify(searchText).replace(/</g, '\\u003c')};
      var PER_PAGE = ${FEED_PAGE_SIZE};
      var query = (new URLSearchParams(location.search).get('q') || '').trim();
      var input = document.querySelector('.search-page-input');
      var count = document.getElementById('searchCount');
      var grid = document.getElementById('searchResults');
      var pager = document.getElementById('searchPager');
      if (input) input.value = query;
      if (query.length < 2) { count.textContent = T.hint; return; }
      count.textContent = T.loading;

      function esc(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
      function thumb(url, width) {
        var raw = String(url || '');
        if (raw.indexOf('//') === 0) raw = 'https:' + raw;
        if (raw.toLowerCase().indexOf('http') !== 0) return raw;
        return 'https://wsrv.nl/?url=' + encodeURIComponent(raw) + '&w=' + width + '&output=webp';
      }
      function date(value) {
        var d = new Date(value);
        if (!value || isNaN(d.getTime())) return '';
        if (T.lang !== 'ko') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
      }
      function card(a) {
        var raw = String(a.thumbnail || '');
        var remote = /^(https?:)?\\/\\//i.test(raw);
        var img = raw ? '<img src="' + esc(thumb(raw, 640)) + '"' + (remote ? ' srcset="' + esc(thumb(raw, 320) + ' 320w, ' + thumb(raw, 640) + ' 640w') + '" sizes="' + T.sizes + '"' : '') + ' width="640" height="360" alt="" loading="lazy" decoding="async" data-img-fallback="hide">' : '';
        var category = a.category || 'news';
        return '<a class="feed-card" href="' + T.prefix + '/article/' + encodeURIComponent(category) + '/' + encodeURIComponent(a.slug) + '/">' +
          '<div class="feed-thumb">' + img + '</div>' +
          '<div class="feed-body"><div class="meta"><span class="meta-cat">' + esc(T.labels[category] || '') + '</span>' +
          (a.date ? '<time datetime="' + esc(String(a.date).slice(0, 10)) + '">' + date(a.date) + '</time>' : '') + '</div>' +
          '<h3 class="feed-title">' + esc(a.title) + '</h3>' +
          (a.summary ? '<p class="feed-sum">' + esc(a.summary) + '</p>' : '') + '</div></a>';
      }

      var results = [];
      var page = 1;
      function render() {
        var pages = Math.ceil(results.length / PER_PAGE) || 1;
        grid.innerHTML = results.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(card).join('');
        pager.hidden = pages < 2;
        pager.querySelector('.feed-page-info').textContent = page + ' / ' + pages;
        pager.querySelector('.feed-prev').disabled = page <= 1;
        pager.querySelector('.feed-next').disabled = page >= pages;
      }
      pager.querySelector('.feed-prev').addEventListener('click', function() { if (page > 1) { page--; render(); scrollTo(0, 0); } });
      pager.querySelector('.feed-next').addEventListener('click', function() { if (page * PER_PAGE < results.length) { page++; render(); scrollTo(0, 0); } });

      fetch(T.prefix + '/articles.json', { credentials: 'same-origin' })
        .then(function(res) { if (!res.ok) throw new Error('articles'); return res.json(); })
        .then(function(list) {
          var needle = query.toLowerCase();
          results = (Array.isArray(list) ? list : []).filter(function(a) {
            return a && a.slug && String(a.title || '').toLowerCase().indexOf(needle) !== -1;
          });
          count.textContent = (results.length ? T.count : T.none).replace('{q}', query).replace('{n}', results.length);
          render();
        })
        .catch(function() { count.textContent = T.fail; });
    })();
  </script>`;

  const _searchTitle = _lang === 'ko' ? `검색 - ${SITE_CONFIG.name}` : `Search - ${SITE_CONFIG.name}`;
  const _searchDescription = _lang === 'ko' ? 'AIScroll 글 검색' : 'Search posts on AIScroll';
  return wrapWithLayout(content, {
    title: _searchTitle,
    description: _searchDescription,
    keywords: SITE_CONFIG.keywords,
    canonical: `${SITE_CONFIG.baseUrl}${langPrefixOf(_lang)}/search/`,
    pageScripts: pageScripts,
    currentPage: 'search',
    noindex: true,
    lang: _lang,
    alternates: { en: `${SITE_CONFIG.baseUrl}/search/`, ko: `${SITE_CONFIG.baseUrl}/ko/search/` }
  });
}

/**
 * 카테고리 페이지 생성. options.kind === 'topic'이면 같은 레이아웃으로 주제(/topic/<id>/) 페이지를 만든다.
 */
function generateCategoryPage(categoryId, categoryLabel, articles, popularArticles = [], latestArticles = [], lang = 'en', options = {}) {
  const _lang = normalizeLang(lang);
  const _langPrefix = langPrefixOf(_lang);
  const _t = I18N[_lang];
  const isTopicPage = options.kind === 'topic';
  const collectionPath = isTopicPage ? `/topic/${categoryId}/` : `/article/${categoryId}/`;
  const categoryArticles = isTopicPage
    ? articles.filter(a => topicsOf(a).includes(categoryId))
    : articles.filter(a => a.category === categoryId);

  // 첫 줄(PC 3칸) 이미지는 바로 받고, 첫 카드는 LCP 후보라 우선순위를 올린다
  const articleListHtml = categoryArticles.length > 0
    ? renderFeedList(categoryArticles, _lang, { grid: 'categoryGrid', data: 'categoryGridDeferredData', pager: 'categoryPager' }, { eagerCount: 3, highPriorityIndex: 0 })
    : `<p class="empty-note">${_t.emptyCollection}</p>`;

  const topAds = generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001, { billboard: true });
  const categoryIntro = isTopicPage ? '' : categoryDescription(categoryId, _lang);

  const content = `
    <div class="page-wrap collection" id="category">
      ${topAds}
      <header class="collection-head">
        <p class="collection-kicker">${escapeHtml(isTopicPage ? _t.topics : _t.categories)}</p>
        <h1 class="collection-title">${escapeHtml(categoryLabel)}</h1>
        ${categoryIntro ? `<p class="collection-desc">${escapeHtml(categoryIntro)}</p>` : ''}
      </header>
      ${articleListHtml}
    </div>
  `;

  const pageScripts = categoryArticles.length > 0 ? feedPagerScript('#categoryGrid', '#categoryPager', '#categoryGridDeferredData') : '';

  const _catInLanguage = _lang === 'ko' ? 'ko-KR' : 'en-US';
  // 언어별로 구분되는 제목·설명. 카테고리는 taxonomy 설명문, 주제는 "주제별 모아보기" 문구.
  const categoryTitle = isTopicPage
    ? (_lang === 'ko'
      ? `${categoryLabel} 리뷰·분석·개발일지 - ${SITE_CONFIG.name}`
      : `${categoryLabel}: Reviews, Analysis & Dev Logs - ${SITE_CONFIG.name}`)
    : `${categoryLabel} - ${SITE_CONFIG.name}`;
  const categoryDescriptionText = isTopicPage
    ? (_lang === 'ko'
      ? `${categoryLabel} 주제로 쓴 리뷰, 분석, 개발일지, 소식을 한곳에 모았습니다.`
      : `Everything on AIScroll about ${categoryLabel}: reviews, analysis, dev logs, and news.`)
    : categoryDescription(categoryId, _lang);
  const categoryKeywords = _lang === 'ko'
    ? [...new Set([categoryLabel, 'AI 리뷰', '코딩 에이전트', '개발일지', SITE_CONFIG.name])].join(', ')
    : `${categoryLabel}, ${SITE_CONFIG.keywords}`;
  // CollectionPage + BreadcrumbList JSON-LD for category pages
  const categoryJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": categoryLabel,
      "description": categoryDescriptionText,
      "inLanguage": _catInLanguage,
      "url": `${SITE_CONFIG.baseUrl}${_langPrefix}${collectionPath}`,
      "isPartOf": {
        "@type": "WebSite",
        "name": SITE_CONFIG.name,
        "url": `${SITE_CONFIG.baseUrl}${_langPrefix}/`
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": _lang === 'ko' ? '홈' : 'Home',
          "item": `${SITE_CONFIG.baseUrl}${_langPrefix}/`
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": categoryLabel,
          "item": `${SITE_CONFIG.baseUrl}${_langPrefix}${collectionPath}`
        }
      ]
    }
  ];

  return wrapWithLayout(content, {
    title: categoryTitle,
    description: categoryDescriptionText,
    keywords: categoryKeywords,
    canonical: `${SITE_CONFIG.baseUrl}${_langPrefix}${collectionPath}`,
    noindex: categoryArticles.length === 0,
    pageScripts,
    currentPage: categoryId,
    jsonLd: categoryJsonLd,
    lang: _lang,
    alternates: options.alternates || { en: `${SITE_CONFIG.baseUrl}${collectionPath}`, ko: `${SITE_CONFIG.baseUrl}/ko${collectionPath}` }
  });
}

/**
 * 주제(태그) 페이지 생성 — /topic/<id>/. 카테고리 페이지와 같은 레이아웃.
 */
function generateTopicPage(topicId, articles, popularArticles = [], latestArticles = [], lang = 'en', options = {}) {
  return generateCategoryPage(topicId, topicLabel(topicId, lang), articles, popularArticles, latestArticles, lang, { ...options, kind: 'topic' });
}

module.exports = {
  generateAIBlogIndex,
  generateSearchPage,
  generateCategoryPage,
  generateTopicPage,
  taxonomy,
  topicHref,
  aboutHref,
  wrapWithLayout,
  SITE_CONFIG,
  formatDateEn,
  formatDateKo,
  formatDateShort,
  formatDateLong,
  I18N,
  langPrefixOf,
  pathForLang,
  articleHref,
  categoryHref,
  homeHref,
  searchHref,
  AI_CATEGORY_IDS,
  escapeHtml,
  getThumbUrl,
  thumbAttrs,
  renderMeta
};
