/**
 * 홈/대시보드 페이지 템플릿
 * 각 섹션의 요약 카드를 표시
 */

const fs = require('fs');
const path = require('path');
const {
  wrapWithLayout,
  AD_SLOTS,
  generateHomeAdPairSlot,
  buildCardFeedPagerScript
} = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// docs 폴더 경로 (통합 빌드)
const docsDir = path.join(__dirname, '../../../docs');

// 위키 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
// size: 'xs' = 모바일용 (200px), 'sm' = PC리스트용 (480px), 'lg' = 상세 페이지용 (1200px)
function getLocalWikiThumbPath(category, slug, originalUrl, size = 'sm') {
  if (!category || !slug) return originalUrl || '';

  const sizeMap = { xs: 'thumbnail-xs.webp', sm: 'thumbnail-sm.webp', lg: 'thumbnail.webp' };
  const widthMap = { xs: 200, sm: 480, lg: 1200 };
  const filename = sizeMap[size] || sizeMap.sm;
  const localPath = `/assets/images/wiki/${category}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images/wiki', category, slug, filename);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 폴백: 기존 thumbnail.webp 확인 (sm/xs가 없을 경우)
  if (size === 'sm' || size === 'xs') {
    const fallbackPath = path.join(docsDir, 'assets/images/wiki', category, slug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/wiki/${category}/${slug}/thumbnail.webp`;
    }
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  const width = widthMap[size] || 480;
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp` : '';
}

// 위키 srcset 헬퍼 - 반응형 이미지용 (xs 200w, sm 480w)
function getLocalWikiThumbSrcset(category, slug, originalUrl) {
  const xsUrl = getLocalWikiThumbPath(category, slug, originalUrl, 'xs');
  const smUrl = getLocalWikiThumbPath(category, slug, originalUrl, 'sm');
  // xs와 sm이 같으면 srcset 불필요
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} 200w, ${smUrl} 480w`,
    sizes: '(max-width: 768px) 133px, 253px'
  };
}

// 테크 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
function getLocalTechThumbPath(category, slug, originalUrl, size = 'sm') {
  if (!category || !slug) return originalUrl || '';

  const sizeMap = { xs: 'thumbnail-xs.webp', sm: 'thumbnail-sm.webp', lg: 'thumbnail.webp' };
  const widthMap = { xs: 200, sm: 480, lg: 1200 };
  const filename = sizeMap[size] || sizeMap.sm;
  const localPath = `/assets/images/tech/${category}/${slug}/${filename}`;
  const fullPath = path.join(docsDir, 'assets/images/tech', category, slug, filename);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 폴백: 기존 thumbnail.webp 확인 (sm/xs가 없을 경우)
  if (size === 'sm' || size === 'xs') {
    const fallbackPath = path.join(docsDir, 'assets/images/tech', category, slug, 'thumbnail.webp');
    if (fs.existsSync(fallbackPath)) {
      return `/assets/images/tech/${category}/${slug}/thumbnail.webp`;
    }
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  const width = widthMap[size] || 480;
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}&w=${width}&output=webp` : '';
}

// 테크 srcset 헬퍼 - 반응형 이미지용 (xs 200w, sm 480w)
function getLocalTechThumbSrcset(category, slug, originalUrl) {
  const xsUrl = getLocalTechThumbPath(category, slug, originalUrl, 'xs');
  const smUrl = getLocalTechThumbPath(category, slug, originalUrl, 'sm');
  if (xsUrl === smUrl) return { src: smUrl, srcset: '' };
  return {
    src: smUrl,
    srcset: `${xsUrl} 200w, ${smUrl} 480w`,
    sizes: '(max-width: 768px) 133px, 253px'
  };
}

const { getLocalReportThumbnail, getLocalReportThumbnailSrcset } = require('../helpers/thumbnail');

function generateIndexPage(data) {
  const { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, popularGames = [], popularArticles = [], games = {}, issueReports = [], insightReports = [], hotpickReports = [], rankingReports = [], wikiData = {}, techData = {}, sidebarPopularArticles = [], sidebarLatestArticles = [] } = data;

  // 공통 counts 계산 (사이드바 + 모바일 메뉴용)
  const sidebarCounts = {
    issue: issueReports.length,
    insight: insightReports.length,
    hotpick: hotpickReports.length,
    ranking: rankingReports.length,
    history: (wikiData.history || []).length,
    knowledge: (wikiData.knowledge || []).length,
    business: (wikiData.business || []).length,
    normal: (techData?.normal || []).length,
    ai: (techData?.ai || []).length,
    vibecoding: (techData?.vibecoding || []).length
  };

  // AI 트렌드 데이터
  const aiInsight = insight?.ai || null;
  // 파일명 기준 날짜 (최신 리포트 링크용)
  const insightFileDate = insight?.insightDate || '';

  // URL 수정 헬퍼 (width: 용도별 크기 - 480 메인카드, 150 사이드바, 960 본문)
  const fixUrl = function(url, width = 480) {
    if (!url) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    // 모든 외부 이미지 프록시
    if (url.startsWith('http')) {
      const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=' + width + '&output=webp';
      return proxyUrl;
    }
    return url;
  };
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const FEED_IMAGE_DIMENSION_ATTRS = 'width="1600" height="900" decoding="async"';
  const POPULAR_IMAGE_DIMENSION_ATTRS = 'width="480" height="300" decoding="async"';
  const FEED_PAGE_SIZE = 15;
  const INITIAL_FEED_RENDER_COUNT = 9;
  const LCP_IMAGE_LOADING_ATTRS = 'loading="eager" fetchpriority="high"';
  const LAZY_IMAGE_LOADING_ATTRS = 'loading="lazy" fetchpriority="auto"';
  const createLcpImageAttrPicker = (highPriorityCount = 1) => {
    let remaining = Math.max(0, Number(highPriorityCount) || 0);
    return () => {
      if (remaining > 0) {
        remaining -= 1;
        return LCP_IMAGE_LOADING_ATTRS;
      }
      return LAZY_IMAGE_LOADING_ATTRS;
    };
  };
  const getFeedImagePerfAttrs = (pickLcpImageAttrs = null) => {
    const loadingAttrs = typeof pickLcpImageAttrs === 'function'
      ? pickLcpImageAttrs()
      : LAZY_IMAGE_LOADING_ATTRS;
    return `${loadingAttrs} ${FEED_IMAGE_DIMENSION_ATTRS}`;
  };
  const getPopularImagePerfAttrs = (pickLcpImageAttrs = null) => {
    const loadingAttrs = typeof pickLcpImageAttrs === 'function'
      ? pickLcpImageAttrs()
      : LAZY_IMAGE_LOADING_ATTRS;
    return `${loadingAttrs} ${POPULAR_IMAGE_DIMENSION_ATTRS}`;
  };
  // 홈 상단 카드 LCP 처리
  const pickLcpImageAttrs = createLcpImageAttrPicker(1);
  const extractSeoLinkFromCardHtml = (html) => {
    if (!html || typeof html !== 'string') return null;
    const hrefMatch = html.match(/<a[^>]*href="([^"]+)"/i);
    if (!hrefMatch || !hrefMatch[1]) return null;

    let title = '';
    const lazyTitleMatch = html.match(/data-lazy-img-alt="([^"]+)"/i);
    if (lazyTitleMatch && lazyTitleMatch[1]) title = lazyTitleMatch[1];
    if (!title) {
      const titleMatch = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    return {
      href: hrefMatch[1],
      title: title || hrefMatch[1]
    };
  };
  const renderDeferredSeoLinks = (links, id) => {
    if (!Array.isArray(links) || links.length === 0) return '';
    const idAttr = id ? ` id="${id}"` : '';
    return `<div class="visually-hidden"${idAttr}>${links.map((link) => `
      <a href="${escapeHtmlAttr(link.href)}">${escapeHtmlAttr(link.title || link.href)}</a>
    `).join('')}</div>`;
  };
  const serializeDeferredCards = (cards) => {
    if (!Array.isArray(cards) || cards.length === 0) return '';
    return JSON.stringify(cards).replace(/</g, '\\u003c');
  };

  // 날짜 포맷 헬퍼 (2026-01-01 → 2026년 1월 1일) - 모바일/PC 공용
  const formatDateKr = (dateStr) => {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateStr;
    return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
  };

  // 홈 인기 기사 (가로형 3개 - eyesmag 스타일)
  function generateHomePopular() {
    const categoryNames = { history: '히스토리', knowledge: '지식', business: '비즈니스' };

    // popularArticles에서 상세 정보 조회 후 상위 3개 선택 (매칭 안 되는 항목 제외)
    const popularItems = popularArticles.map(article => {
      if (article.type === 'issue') {
        const issue = issueReports.find(i => i.slug === article.slug);
        if (issue) {
          const thumbData = getLocalReportThumbnailSrcset('issue', issue.slug, issue.thumbnail);
          return {
            type: 'issue',
            title: issue.title,
            summary: issue.summary || '',
            thumbnail: thumbData.src,
            srcset: thumbData.srcset,
            sizes: thumbData.sizes,
            link: `/magazine/issue/${issue.slug}/`,
            badge: issue.date ? formatDateKr(issue.date) : '이슈'
          };
        }
      } else if (article.type === 'insight') {
        const insight = insightReports.find(i => i.slug === article.slug);
        if (insight) {
          const thumbData = getLocalReportThumbnailSrcset('insight', insight.slug, insight.thumbnail);
          return {
            type: 'insight',
            title: insight.title,
            summary: insight.summary || '',
            thumbnail: thumbData.src,
            srcset: thumbData.srcset,
            sizes: thumbData.sizes,
            link: `/magazine/insight/${insight.slug}/`,
            badge: insight.date ? formatDateKr(insight.date) : '인사이트'
          };
        }
      } else if (article.type === 'hotpick') {
        const hotpick = hotpickReports.find(h => h.slug === article.slug);
        if (hotpick) {
          const thumbData = getLocalReportThumbnailSrcset('hotpick', hotpick.slug, hotpick.thumbnail);
          return {
            type: 'hotpick',
            title: hotpick.title,
            summary: hotpick.summary || '',
            thumbnail: thumbData.src,
            srcset: thumbData.srcset,
            sizes: thumbData.sizes,
            link: `/magazine/hotpick/${hotpick.slug}/`,
            badge: hotpick.date ? formatDateKr(hotpick.date) : '핫픽'
          };
        }
      } else if (article.type === 'wiki' && article.category) {
        const wikiList = wikiData[article.category] || [];
        const wiki = wikiList.find(w => w.slug === article.slug);
        if (wiki) {
          const thumbData = getLocalWikiThumbSrcset(article.category, article.slug, wiki.thumbnail);
          return {
            type: 'wiki',
            title: wiki.title,
            summary: wiki.summary || '',
            thumbnail: thumbData.src,
            srcset: thumbData.srcset,
            sizes: thumbData.sizes,
            link: `/wiki/${article.category}/${article.slug}/`,
            badge: categoryNames[article.category] || article.category
          };
        }
      } else if (article.type === 'ranking') {
        const ranking = rankingReports.find(r => r.slug === article.slug);
        if (ranking) {
          const thumbData = getLocalReportThumbnailSrcset('ranking', ranking.slug, ranking.thumbnail);
          return {
            type: 'ranking',
            title: ranking.title,
            summary: ranking.summary || '',
            thumbnail: thumbData.src,
            srcset: thumbData.srcset,
            sizes: thumbData.sizes,
            link: `/magazine/ranking/${ranking.slug}/`,
            badge: ranking.date ? formatDateKr(ranking.date) : '순위 분석'
          };
        }
      } else if (article.type === 'tech' && article.category) {
        const techCategoryNames = { normal: '테크', ai: 'AI', vibecoding: '바이브코딩' };
        const techList = techData[article.category] || [];
        const tech = techList.find(t => t.slug === article.slug);
        if (tech) {
          const thumbData = getLocalTechThumbSrcset(article.category, article.slug, tech.thumbnail);
          return {
            type: 'tech',
            title: tech.title,
            summary: tech.summary || '',
            thumbnail: thumbData.src,
            srcset: thumbData.srcset,
            sizes: thumbData.sizes,
            link: `/tech/${article.category}/${article.slug}/`,
            badge: techCategoryNames[article.category] || article.category
          };
        }
      }
      return null;
    }).filter(Boolean).slice(0, 3);

    if (popularItems.length === 0) return '';

    const popularCards = popularItems.map((item, i) => {
      const imgAttrs = item.srcset
        ? `src="${item.thumbnail}" srcset="${item.srcset}" sizes="${item.sizes}"`
        : `src="${item.thumbnail}"`;
      return `
      <a href="${item.link}" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" ${getPopularImagePerfAttrs(pickLcpImageAttrs)}>` : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${item.title}</h3>
          ${item.summary ? `<p class="home-popular-summary">${item.summary}</p>` : ''}
        </div>
      </a>
    `;
    }).join('');
    const popularListId = 'homePopularList';

    return `
      <div class="home-card" id="home-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">인기</h2>
        </div>
        <div class="home-popular-list" id="${popularListId}">${popularCards}</div>
      </div>
    `;
  }

  // 홈 최신 기사 (3x5 그리드 + 페이지네이션 + 카테고리 필터)
  function generateHomeLatest() {
    const categoryNames = { history: '히스토리', knowledge: '지식', business: '비즈니스' };

    // 모든 기사 수집 (이슈 + 인사이트 + 위키)
    const allArticles = [];

    // 이슈 추가
    issueReports.forEach(issue => {
      allArticles.push({
        type: 'issue',
        category: 'issue',
        slug: issue.slug,
        originalThumbnail: issue.thumbnail,
        title: issue.title,
        link: `/magazine/issue/${issue.slug}/`,
        badge: '이슈',
        date: issue.date || ''
      });
    });

    // 인사이트 추가
    insightReports.forEach(insight => {
      allArticles.push({
        type: 'insight',
        category: 'insight',
        slug: insight.slug,
        originalThumbnail: insight.thumbnail,
        title: insight.title,
        link: `/magazine/insight/${insight.slug}/`,
        badge: '인사이트',
        date: insight.date || ''
      });
    });

    // 핫픽 추가
    hotpickReports.forEach(hotpick => {
      allArticles.push({
        type: 'hotpick',
        category: 'hotpick',
        slug: hotpick.slug,
        originalThumbnail: hotpick.thumbnail,
        title: hotpick.title,
        link: `/magazine/hotpick/${hotpick.slug}/`,
        badge: '핫픽',
        date: hotpick.date || ''
      });
    });

    // 순위 분석 추가
    rankingReports.forEach(ranking => {
      allArticles.push({
        type: 'ranking',
        category: 'ranking',
        slug: ranking.slug,
        originalThumbnail: ranking.thumbnail,
        title: ranking.title,
        link: `/magazine/ranking/${ranking.slug}/`,
        badge: '순위 분석',
        date: ranking.date || ''
      });
    });

    // 위키 추가
    const categoryOrder = ['history', 'knowledge', 'business'];
    categoryOrder.forEach(category => {
      (wikiData[category] || []).forEach(wiki => {
        allArticles.push({
          type: 'wiki',
          category: category,
          slug: wiki.slug,
          originalThumbnail: wiki.thumbnail,
          title: wiki.title,
          link: `/wiki/${category}/${wiki.slug}/`,
          badge: categoryNames[category],
          date: wiki.date || ''
        });
      });
    });

    // 테크 추가
    const techCategoryOrder = ['normal', 'ai', 'vibecoding'];
    const techCategoryNames = { normal: '일반', ai: 'AI', vibecoding: '바이브코딩' };
    techCategoryOrder.forEach(category => {
      (techData[category] || []).forEach(tech => {
        allArticles.push({
          type: 'tech',
          category: category,
          slug: tech.slug,
          originalThumbnail: tech.thumbnail,
          title: tech.title,
          link: `/tech/${category}/${tech.slug}/`,
          badge: techCategoryNames[category],
          date: tech.date || ''
        });
      });
    });

    // 날짜순 정렬 (최신순)
    allArticles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (allArticles.length === 0) return '';

    // 모든 카드 생성 (첫 페이지만 SSR, 나머지는 템플릿 지연 삽입)
    const latestCardEntries = allArticles.map((item, i) => {
      // 위키/테크는 srcset 사용
      let imgHtml = '';
      let lazyImgSrc = '';
      let lazyImgSrcset = '';
      let lazyImgSizes = '';
      if (item.type === 'wiki') {
        const thumbData = getLocalWikiThumbSrcset(item.category, item.slug, item.originalThumbnail);
        const imgAttrs = thumbData.srcset
          ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
          : `src="${thumbData.src}"`;
        lazyImgSrc = thumbData.src || '';
        lazyImgSrcset = thumbData.srcset || '';
        lazyImgSizes = thumbData.sizes || '';
        if (i < INITIAL_FEED_RENDER_COUNT && thumbData.src) {
          imgHtml = `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">`;
        }
      } else if (item.type === 'tech') {
        const thumbData = getLocalTechThumbSrcset(item.category, item.slug, item.originalThumbnail);
        const imgAttrs = thumbData.srcset
          ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
          : `src="${thumbData.src}"`;
        lazyImgSrc = thumbData.src || '';
        lazyImgSrcset = thumbData.srcset || '';
        lazyImgSizes = thumbData.sizes || '';
        if (i < INITIAL_FEED_RENDER_COUNT && thumbData.src) {
          imgHtml = `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">`;
        }
      } else if (item.originalThumbnail) {
        const thumbData = getLocalReportThumbnailSrcset(item.type, item.slug, item.originalThumbnail);
        const imgAttrs = thumbData.srcset
          ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
          : `src="${thumbData.src}"`;
        lazyImgSrc = thumbData.src || '';
        lazyImgSrcset = thumbData.srcset || '';
        lazyImgSizes = thumbData.sizes || '';
        if (i < INITIAL_FEED_RENDER_COUNT && thumbData.src) {
          imgHtml = `<img ${imgAttrs} alt="${escapeHtmlAttr(item.title)}" ${getFeedImagePerfAttrs(pickLcpImageAttrs)} data-img-fallback="hide">`;
        }
      }
      const lazySrcsetAttrs = lazyImgSrcset
        ? ` data-lazy-img-srcset="${escapeHtmlAttr(lazyImgSrcset)}" data-lazy-img-sizes="${escapeHtmlAttr(lazyImgSizes)}"`
        : '';
      const lazyAttrs = (!imgHtml && lazyImgSrc)
        ? ` data-lazy-img-src="${escapeHtmlAttr(lazyImgSrc)}"${lazySrcsetAttrs} data-lazy-img-alt="${escapeHtmlAttr(item.title)}"`
        : '';
      return {
        itemIndex: i,
        html: `
      <a href="${item.link}" class="home-trend-card home-latest-item" data-index="${i}"${lazyAttrs}>
        <div class="home-trend-card-image">
          ${imgHtml}
          <span class="home-trend-card-tag ${item.type}">${item.date ? formatDateKr(item.date) : item.badge}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${item.title}</span></h3>
      </a>
    `
      };
    });
    const initialCards = [];
    const deferredCards = [];
    const deferredSeoLinks = [];
    latestCardEntries.forEach(entry => {
      if (entry.itemIndex < INITIAL_FEED_RENDER_COUNT) initialCards.push(entry.html);
      else {
        deferredCards.push(entry.html);
        const seoLink = extractSeoLinkFromCardHtml(entry.html);
        if (seoLink) deferredSeoLinks.push(seoLink);
      }
    });
    const deferredCardsJson = serializeDeferredCards(deferredCards);

    const totalPages = Math.ceil(allArticles.length / FEED_PAGE_SIZE);

    return `
      <div class="home-card" id="home-latest">
        <div class="home-card-header">
          <h2 class="home-card-title">최신</h2>
        </div>
        <div class="home-latest-grid">${initialCards.join('')}</div>
        ${deferredCardsJson ? `<script type="application/json" id="homeLatestDeferredData">${deferredCardsJson}</script>${renderDeferredSeoLinks(deferredSeoLinks, 'homeLatestDeferredSeoLinks')}` : ''}
        <div class="home-pagination" data-total="${allArticles.length}" data-per-page="${FEED_PAGE_SIZE}">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바: 카테고리 메뉴 (리포트 + 위키 + 테크 그룹) - 링크 연결
  function generateSidebarCategories() {
    // 카테고리별 글 개수 계산
    const counts = {
      issue: issueReports.length,
      insight: insightReports.length,
      hotpick: hotpickReports.length,
      ranking: rankingReports.length,
      history: (wikiData.history || []).length,
      knowledge: (wikiData.knowledge || []).length,
      business: (wikiData.business || []).length,
      normal: (techData.normal || []).length,
      ai: (techData.ai || []).length,
      vibecoding: (techData.vibecoding || []).length
    };

    // 리포트 카테고리
    const issueCategories = [
      { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue },
      { id: 'insight', name: '인사이트', link: '/magazine/insight/', count: counts.insight },
      { id: 'hotpick', name: '핫픽', link: '/magazine/hotpick/', count: counts.hotpick },
      { id: 'ranking', name: '순위 분석', link: '/magazine/ranking/', count: counts.ranking }
    ];

    // 위키 카테고리 (에버그린)
    const wikiCategories = [
      { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
      { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
      { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
    ];

    // 테크 카테고리
    const techCategories = [
      { id: 'normal', name: '일반', link: '/tech/normal/', count: counts.normal },
      { id: 'ai', name: 'AI', link: '/tech/ai/', count: counts.ai },
      { id: 'vibecoding', name: '바이브코딩', link: '/tech/vibecoding/', count: counts.vibecoding }
    ];

    const renderItems = (items) => items.map(cat => `
      <a href="${cat.link}" class="sidebar-category-item">
        <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
      </a>
    `).join('');

    return `
      <div class="home-card" id="sidebar-categories">
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/magazine/issue/" class="home-card-title-link"><h2 class="home-card-title">리포트</h2></a></div>
          <div class="sidebar-category-list">${renderItems(issueCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/wiki/" class="home-card-title-link"><h2 class="home-card-title">위키</h2></a></div>
          <div class="sidebar-category-list">${renderItems(wikiCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><a href="/tech/" class="home-card-title-link"><h2 class="home-card-title">테크</h2></a></div>
          <div class="sidebar-category-list">${renderItems(techCategories)}</div>
        </div>
      </div>
    `;
  }

  // 사이드바: 인기글/최신글 TOP 10 토글 (공통 리스트 사용)
  function generateSidebarArticles() {
    const renderList = (items) => items.map((item, i) => `
      <a href="${item.link}" class="sidebar-article-item">
        <span class="sidebar-article-rank">${i + 1}</span>
        <span class="sidebar-article-title">${item.title}</span>
      </a>
    `).join('');

    return `
      <div class="home-card" id="sidebar-articles">
        <div class="home-card-header">
          <div class="home-chart-toggle sidebar-full-toggle" id="sidebarArticleTab">
            <button class="tab-btn small active" data-sidebar-tab="popular">인기</button>
            <button class="tab-btn small" data-sidebar-tab="latest">최신</button>
          </div>
        </div>
        <div class="home-card-body">
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles.slice(0, 10))}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles.slice(0, 10))}</div>
        </div>
      </div>
    `;
  }

  // 홈 위키 카드 (카테고리별 4개씩)
  function generateHomeWiki() {
    const categoryOrder = ['history', 'knowledge', 'business'];
    const categoryNames = {
      history: '히스토리',
      knowledge: '지식',
      business: '비즈니스'
    };

    const renderWikiCard = (wiki, category) => {
      const thumbData = getLocalWikiThumbSrcset(category, wiki.slug, wiki.thumbnail);
      const imgAttrs = thumbData.srcset
        ? `src="${thumbData.src}" srcset="${thumbData.srcset}" sizes="${thumbData.sizes}"`
        : `src="${thumbData.src}"`;
      return `
        <a href="/wiki/${category}/${wiki.slug}/" class="home-trend-card">
          <div class="home-trend-card-image">
            ${thumbData.src ? `<img ${imgAttrs} alt="${escapeHtmlAttr(wiki.title || '')}" loading="lazy" data-img-fallback="hide">` : ''}
            <span class="home-trend-card-tag wiki">${categoryNames[category]}</span>
          </div>
          <h3 class="home-trend-card-title">${wiki.title}</h3>
        </a>
      `;
    };

    // 각 카테고리별 카드 섹션 생성 (통합 반응형 - CSS로 모바일 스타일 처리)
    const sections = categoryOrder.map(category => {
      const articles = (wikiData[category] || []).slice(0, 4);
      if (articles.length === 0) return '';

      const cards = articles.map(wiki => renderWikiCard(wiki, category)).join('');

      return `
        <div class="home-card" id="home-wiki-${category}">
          <div class="home-card-header">
            <h2 class="home-card-title">${categoryNames[category]}</h2>
          </div>
          <div class="home-trend-grid">${cards}</div>
        </div>
      `;
    }).filter(s => s).join('');

    return sections;
  }

  // appId로 게임 slug 찾기 (iOS/Android)
  function findGameSlug(appId, platform) {
    if (!appId || !games) return null;
    var gamesList = Object.values(games);
    for (var i = 0; i < gamesList.length; i++) {
      var g = gamesList[i];
      if (!g.appIds) continue;
      if (platform === 'ios' && String(g.appIds.ios) === String(appId)) return g.slug;
      if (platform === 'android' && String(g.appIds.android) === String(appId)) return g.slug;
      // platform 없으면 둘 다 체크
      if (!platform && (String(g.appIds.ios) === String(appId) || String(g.appIds.android) === String(appId))) return g.slug;
    }
    return null;
  }

  // 스팀 게임 이름으로 slug 찾기
  function findGameSlugByName(name) {
    if (!name || !games) return null;
    var normalizedName = name.toLowerCase().trim();
    // Object.entries로 키(게임이름)와 값(게임객체)을 함께 가져옴
    var gamesEntries = Object.entries(games);
    for (var i = 0; i < gamesEntries.length; i++) {
      var gameName = gamesEntries[i][0];  // 키 = 게임 이름
      var g = gamesEntries[i][1];         // 값 = 게임 객체
      // 키(게임 이름)로 매칭
      if (gameName.toLowerCase().trim() === normalizedName) return g.slug;
      // aliases에서 매칭
      if (g.aliases) {
        for (var j = 0; j < g.aliases.length; j++) {
          if (g.aliases[j].toLowerCase().trim() === normalizedName) return g.slug;
        }
      }
    }
    return null;
  }

  // 홈 모바일 랭킹
  function generateHomeMobileRank() {
    var grossingKr = rankings?.grossing?.kr || {};
    var freeKr = rankings?.free?.kr || {};

    function renderList(items, platform) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(app, i) {
        var slug = findGameSlug(app.appId, platform);
        var storeLink = platform === 'ios'
          ? 'https://apps.apple.com/app/id' + app.appId
          : 'https://play.google.com/store/apps/details?id=' + app.appId;
        var link = slug ? '/games/' + slug + '/' : storeLink;
        var isExternal = !slug;
        return '<a class="home-rank-row" href="' + link + '"' + (isExternal ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-rank-icon" src="' + (app.icon || '') + '" alt="' + escapeHtmlAttr(app.title || '') + '" loading="lazy" data-img-fallback="hide-visibility">' +
          '<span class="home-rank-name">' + app.title + '</span>' +
          '</a>';
      }).join('');
    }

    return '<div class="home-rank-tabs">' +
      '<button class="home-rank-tab active" data-platform="ios"><img src="https://www.google.com/s2/favicons?domain=apple.com&sz=32" alt="">iOS</button>' +
      '<button class="home-rank-tab" data-platform="android"><img src="https://www.google.com/s2/favicons?domain=play.google.com&sz=32" alt="">Android</button>' +
      '</div>' +
      '<div class="home-rank-content">' +
      '<div class="home-rank-chart" id="home-chart-free">' +
      '<div class="home-rank-list active" id="home-rank-free-ios">' + renderList((freeKr.ios || []).slice(0, 10), 'ios') + '</div>' +
      '<div class="home-rank-list" id="home-rank-free-android">' + renderList((freeKr.android || []).slice(0, 10), 'android') + '</div>' +
      '</div>' +
      '<div class="home-rank-chart active" id="home-chart-grossing">' +
      '<div class="home-rank-list active" id="home-rank-grossing-ios">' + renderList((grossingKr.ios || []).slice(0, 10), 'ios') + '</div>' +
      '<div class="home-rank-list" id="home-rank-grossing-android">' + renderList((grossingKr.android || []).slice(0, 10), 'android') + '</div>' +
      '</div>' +
      '</div>';
  }

  // 사이드바: 모바일 순위
  function generateSidebarMobileRank() {
    return `
      <div class="home-card" id="sidebar-mobile-rank">
        <div class="home-card-header">
          <h2 class="home-card-title">모바일 순위</h2>
          <div class="home-card-controls">
            <div class="tab-group">
              <button class="tab-btn active" data-chart="grossing">매출</button>
              <button class="tab-btn" data-chart="free">인기</button>
            </div>
          </div>
        </div>
        <div class="home-card-body">
          ${generateHomeMobileRank()}
        </div>
      </div>
    `;
  }

  // 홈 스팀 순위
  function generateHomeSteam() {
    var mostPlayed = (steam?.mostPlayed || []).slice(0, 10);
    var topSellers = (steam?.topSellers || []).slice(0, 10);

    function renderList(items, showPlayers) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(game, i) {
        var slug = findGameSlugByName(game.name);
        var link = slug ? '/games/' + slug + '/' : (game.appid ? 'https://store.steampowered.com/app/' + game.appid : '#');
        var isExternal = !slug;
        return '<a class="home-steam-row" href="' + link + '"' + (isExternal ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-steam-icon" src="' + (game.img || '') + '" alt="' + escapeHtmlAttr(game.name || '') + '" loading="lazy" data-img-fallback-id="icon-square">' +
          '<span class="home-steam-name">' + (game.name || '') + '</span>' +
          '</a>';
      }).join('');
    }

    return '<div class="home-steam-chart" id="home-steam-mostplayed">' + renderList(mostPlayed, true) + '</div>' +
      '<div class="home-steam-chart active" id="home-steam-topsellers">' + renderList(topSellers, false) + '</div>';
  }

  // 홈 신규 게임
  function generateHomeUpcoming() {
    var platforms = {
      mobile: { name: '모바일', items: (upcoming?.mobile || []).slice(0, 10) },
      steam: { name: '스팀', items: (upcoming?.steam || []).slice(0, 10) },
      ps5: { name: 'PS5', items: (upcoming?.ps5 || []).slice(0, 10) },
      nintendo: { name: '닌텐도', items: (upcoming?.nintendo || []).slice(0, 10) }
    };

    function renderList(items) {
      if (!items || items.length === 0) return '<div class="home-empty">데이터 없음</div>';
      return items.map(function(game, i) {
        return '<a class="home-upcoming-row" href="' + (game.link || '#') + '" target="_blank" rel="noopener">' +
          '<span class="home-rank-num ' + (i < 3 ? 'top' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
          '<img class="home-upcoming-icon" src="' + (game.img || '') + '" alt="' + escapeHtmlAttr(game.name || game.title || '') + '" loading="lazy" data-img-fallback="hide-visibility">' +
          '<span class="home-upcoming-name">' + (game.name || game.title || '') + '</span>' +
          '</a>';
      }).join('');
    }

    return '<div class="home-upcoming-tabs">' +
      '<button class="home-upcoming-tab active" data-upcoming="steam">스팀</button>' +
      '<button class="home-upcoming-tab" data-upcoming="ps5">PS5</button>' +
      '<button class="home-upcoming-tab" data-upcoming="nintendo">닌텐도</button>' +
      '<button class="home-upcoming-tab" data-upcoming="mobile">모바일</button>' +
      '</div>' +
      '<div class="home-upcoming-content">' +
      '<div class="home-upcoming-list active" id="home-upcoming-steam">' + renderList(platforms.steam.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-ps5">' + renderList(platforms.ps5.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-nintendo">' + renderList(platforms.nintendo.items) + '</div>' +
      '<div class="home-upcoming-list" id="home-upcoming-mobile">' + renderList(platforms.mobile.items) + '</div>' +
      '</div>';
  }

  // 트렌드 카드 HTML
  var insightCardHtml = aiInsight ?
    '<div class="home-card" id="home-insight">' +
    '<div class="home-card-header">' +
    '<h2 class="home-card-title">정기</h2>' +
    '</div>' +
    '<div class="home-card-body">' + generateHomeInsight() + '</div>' +
    '</div>' : '';

  // 실시간 인기 TOP 3 띠 배너
  function generatePopularBanner() {
    if (!popularGames || popularGames.length === 0) return '';

    // games 데이터를 배열로 변환
    var gamesList = Object.entries(games).map(function(entry) {
      return {
        name: entry[0],
        slug: entry[1].slug,
        icon: entry[1].icon || '',
        appIds: entry[1].appIds || {}
      };
    });

    // `.` 포함된 이전 형식은 무시 (현재는 `-`로 통일)
    var filteredPopular = popularGames.filter(function(pg) { return !pg.slug.includes('.'); });

    // TOP 3 게임 정보 매칭 (slug 또는 appId로) - 중복 제거
    var top3 = [];
    var seenSlugs = {};

    for (var i = 0; i < filteredPopular.length && top3.length < 3; i++) {
      var pg = filteredPopular[i];

      // 먼저 slug로 매칭 시도
      var gameInfo = gamesList.find(function(g) { return g.slug === pg.slug; });

      // 없으면 appId로 매칭 (대소문자 무시)
      if (!gameInfo) {
        var gaSlug = pg.slug.replace(/-/g, '.').toLowerCase();
        gameInfo = gamesList.find(function(g) {
          return String(g.appIds.android || '').toLowerCase() === gaSlug ||
                 String(g.appIds.ios || '').toLowerCase() === gaSlug;
        });
      }

      if (!gameInfo) continue;

      // 이미 추가된 게임이면 스킵 (중복 제거)
      if (seenSlugs[gameInfo.slug]) continue;
      seenSlugs[gameInfo.slug] = true;

      top3.push({
        rank: top3.length + 1,
        name: gameInfo.name,
        slug: gameInfo.slug,
        icon: gameInfo.icon
      });
    }

    if (top3.length === 0) return '';

    var items = top3.map(function(game) {
      var rankClass = game.rank <= 3 ? ' top' + game.rank : '';
      return '<a class="popular-banner-item" href="/games/' + game.slug + '/">' +
        '<span class="popular-banner-rank' + rankClass + '">' + game.rank + '</span>' +
        (game.icon ? '<img class="popular-banner-icon" src="' + game.icon + '" alt="' + escapeHtmlAttr(game.name || '') + '" loading="lazy" data-img-fallback="hide">' : '') +
        '<span class="popular-banner-name">' + game.name + '</span>' +
        '</a>';
    }).join('');

    return '<div class="popular-banner">' +
      '<span class="popular-banner-label">인기 게임</span>' +
      '<div class="popular-banner-items">' + items + '</div>' +
      '</div>';
  }

  var popularBannerHtml = generatePopularBanner();

  // 모바일 사이드 패널 콘텐츠 (layout.js에서 공통 처리)
  var sidebarContent = generateSidebarCategories() + generateSidebarArticles();

  // 홈페이지 (통합 반응형 - PC 2컬럼 구조, 모바일은 CSS로 1컬럼 처리)
  var content = '<section class="home-section active" id="home">' +
    '<h1 class="visually-hidden">게이머스크롤 - 게임 트렌드, 게임 업계 소식, 게임 위키</h1>' +
    '<div class="page-container">' +
    '<div class="home-container">' +
    '<div class="home-main">' +
    generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001) +
    insightCardHtml +
    generateHomePopular() +
    generateHomeLatest() +
    '</div>' +
    '<div class="home-sidebar">' +
    '<div class="home-sidebar-sticky">' +
    generateSidebarCategories() +
    generateSidebarArticles() +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</section>';

  // 페이지 스크립트 (원본 html.js와 동일한 방식)
  var pageScripts = `<script>
    // 뉴스 패널 렌더링 함수 (lazy load용)
    // 홈 모바일 랭킹 - 인기/매출 탭 전환
    let homeCurrentChart = 'grossing';
    let homeCurrentPlatform = 'ios';
    const homeChartTab = document.getElementById('homeChartTab');
    homeChartTab?.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      homeChartTab.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      homeCurrentChart = btn.dataset.homeChart;
      document.querySelectorAll('.home-rank-chart').forEach(c => c.classList.remove('active'));
      const targetChart = document.getElementById('home-chart-' + homeCurrentChart);
      targetChart?.classList.add('active');
      targetChart?.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
      targetChart?.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
    });

    // 홈 모바일 랭킹 - iOS/Android 탭 전환
    document.querySelectorAll('.home-rank-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-rank-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        homeCurrentPlatform = tab.dataset.platform;
        document.querySelectorAll('.home-rank-chart').forEach(chart => {
          chart.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
          chart.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
        });
      });
    });

    // 사이드바 모바일 순위 - 매출/인기 탭 전환
    const sidebarMobileRank = document.getElementById('sidebar-mobile-rank');
    sidebarMobileRank?.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        sidebarMobileRank.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        homeCurrentChart = tab.dataset.chart;
        sidebarMobileRank.querySelectorAll('.home-rank-chart').forEach(c => c.classList.remove('active'));
        const targetChart = sidebarMobileRank.querySelector('#home-chart-' + homeCurrentChart);
        targetChart?.classList.add('active');
        targetChart?.querySelectorAll('.home-rank-list').forEach(l => l.classList.remove('active'));
        targetChart?.querySelector('#home-rank-' + homeCurrentChart + '-' + homeCurrentPlatform)?.classList.add('active');
      });
    });

    // 홈 스팀 서브탭 전환
    document.querySelectorAll('[data-home-steam]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-home-steam]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const steamType = btn.dataset.homeSteam;
        document.querySelectorAll('.home-steam-chart').forEach(c => c.classList.remove('active'));
        document.getElementById('home-steam-' + steamType)?.classList.add('active');
      });
    });

    // 홈 신규게임 서브탭 전환
    document.querySelectorAll('.home-upcoming-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.home-upcoming-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetUpcoming = tab.dataset.upcoming;
        document.querySelectorAll('.home-upcoming-list').forEach(l => l.classList.remove('active'));
        document.getElementById('home-upcoming-' + targetUpcoming)?.classList.add('active');
      });
    });

  </script>${buildCardFeedPagerScript({
    grid: '.home-latest-grid',
    pagination: '.home-pagination',
    deferredJson: '#homeLatestDeferredData',
    itemSelector: '.home-latest-item',
    pageSize: FEED_PAGE_SIZE,
    hydrateLazyImages: true,
    mobileAds: true,
    adInterval: 4,
    mobileDomWindowPages: 4,
    initialRenderCount: INITIAL_FEED_RENDER_COUNT,
    idleFillFirstPage: true,
    idleFillDelay: 120,
    sidebarTabId: 'sidebarArticleTab'
  })}`;

  return wrapWithLayout(content, {
    currentPage: 'home',  // 홈페이지 → 네비 선택 없음
    title: '게이머스크롤 - 모바일 게임 순위·스팀 게임 순위·게임 뉴스',
    description: '게이머스크롤 - 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스를 한눈에.',
    keywords: '게임 순위, 모바일 게임 순위, 스팀 게임 순위, 앱스토어 순위, 플레이스토어 순위, 메타크리틱, 게임 뉴스',
    canonical: `${siteBaseUrl}/`,
    pageScripts: pageScripts,
    sidebarContent: sidebarContent,
    sidebarCounts
  });
}

module.exports = { generateIndexPage };
