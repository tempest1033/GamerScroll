/**
 * 게임 위키 허브 페이지 (목록)
 * - 피드 카드 스타일 (썸네일 + 제목)
 * - 카테고리별 섹션 분리 (business, tech, history, knowledge)
 * - 각 섹션별 페이지네이션
 */

const path = require('path');
const fs = require('fs');
const { wrapWithLayout, AD_SLOTS, generateAdPairSlot, generateNativeAdSlot } = require('../layout');

// 모바일 빌드 여부
const isMobileBuild = process.env.MOBILE_BUILD === 'true';

// docs 폴더 경로 (모바일/PC 구분)
const docsDir = isMobileBuild
  ? path.join(__dirname, '../../../docs-mobile')
  : path.join(__dirname, '../../../docs');
const siteBaseUrl = isMobileBuild ? 'https://m.gamerscrawl.com' : 'https://gamerscrawl.com';

// 광고 슬롯
const topAds = generateAdPairSlot(AD_SLOTS.ResponsivePC001, AD_SLOTS.Mobile001);
const nativeAd1 = generateNativeAdSlot(AD_SLOTS.Article001);

// 날짜 포맷 헬퍼 (2026-01-01 → 2026년 1월 1일)
const formatDateKr = (dateStr) => {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
};

// 카테고리 정보
const categories = [
  { key: 'history', name: '히스토리', desc: '게임 역사, 주요 사건, 업계 변화' },
  { key: 'knowledge', name: '지식', desc: '장르, 용어, 기초 지식' },
  { key: 'tech', name: '기술', desc: '게임 엔진, 개발 기술, 제작 파이프라인' },
  { key: 'business', name: '비즈니스', desc: '업계 지표, 수익 구조, 성장 전략' }
];

/**
 * 로컬 위키 이미지 경로 반환 (폴백: 프록시 URL)
 */
function getLocalWikiImagePath(category, slug, originalUrl) {
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;

  const localPath = `/assets/images/wiki/${category}/${slug}/thumbnail.webp`;
  const fullPath = path.join(docsDir, localPath);

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  return `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}`;
}

/**
 * 위키 허브 페이지 생성
 * @param {Object} params
 * @param {Object} params.wikiData - 카테고리별 위키 항목 {business: [], tech: [], history: [], knowledge: []}
 */
function generateWikiHubPage({ wikiData = {} }) {
  // 위키 카드 렌더링
  const renderWikiCard = (article, category) => {
    const thumbnail = article.thumbnail
      ? getLocalWikiImagePath(category, article.slug, article.thumbnail)
      : '';
    const catName = categories.find(c => c.key === category)?.name || '';
    const badgeText = article.date ? formatDateKr(article.date) : catName;

    return `
      <a href="/wiki/${category}/${article.slug}/" class="trend-feed-card" data-type="wiki">
        <div class="trend-feed-card-image">
          ${thumbnail ? `<img src="${thumbnail}" alt="" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="trend-feed-card-tag">${badgeText}</span>
        </div>
        <h3 class="trend-feed-card-title"><span class="trend-feed-card-title-text">${article.title}</span></h3>
      </a>
    `;
  };

  // 카테고리별 섹션 생성
  const generateCategorySection = (category) => {
    const articles = wikiData[category.key] || [];

    const cardsHTML = articles.map(article => renderWikiCard(article, category.key)).join('');
    const totalPages = Math.max(1, Math.ceil(articles.length / 4));

    return `
      <div class="home-card home-card-full trend-section" data-section="${category.key}">
        <div class="home-card-header">
          <h2 class="home-card-title">${category.name}</h2>
          <div class="trend-pagination">
            <button class="trend-page-btn trend-prev" aria-label="이전">‹</button>
            <span class="trend-page-index">1/${totalPages}</span>
            <button class="trend-page-btn trend-next" aria-label="다음">›</button>
          </div>
        </div>
        <div class="home-card-body">
          ${articles.length > 0
            ? `<div class="trend-feed-grid">${cardsHTML}</div>`
            : '<div class="trend-empty">아직 등록된 항목이 없습니다</div>'}
        </div>
      </div>
    `;
  };

  const content = `
    <section class="section active" id="wiki-hub">

      <div class="page-container">
        ${topAds}
        <h1 class="visually-hidden">게임 위키 - 게임 업계 지식백과</h1>

        <!-- Business 섹션 -->
        ${generateCategorySection(categories[0])}

        <!-- Tech 섹션 -->
        ${generateCategorySection(categories[1])}

        ${nativeAd1}

        <!-- History 섹션 -->
        ${generateCategorySection(categories[2])}

        <!-- Knowledge 섹션 -->
        ${generateCategorySection(categories[3])}
      </div>
    </section>
  `;

  const pageScripts = `
  <script>
    // 위키 섹션별 페이지네이션
    document.addEventListener('DOMContentLoaded', function() {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const pageSize = isMobile ? 1 : 4;

      const trendStateMap = new Map();

      function updateTrendPagination(state) {
        const start = state.currentPage * state.pageSize;
        const end = start + state.pageSize;

        state.items.forEach((item, i) => {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });

        if (state.pageIndex) {
          state.pageIndex.textContent = (state.currentPage + 1) + '/' + state.totalPages;
        }
        if (state.prevBtn) {
          state.prevBtn.disabled = state.currentPage <= 0;
        }
        if (state.nextBtn) {
          state.nextBtn.disabled = state.currentPage >= state.totalPages - 1;
        }
      }

      document.querySelectorAll('.trend-section').forEach(section => {
        const prevBtn = section.querySelector('.trend-prev');
        const nextBtn = section.querySelector('.trend-next');
        const pageIndex = section.querySelector('.trend-page-index');
        const items = Array.from(section.querySelectorAll('.trend-feed-card'));

        if (!prevBtn || !nextBtn || !pageIndex) return;

        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

        const state = {
          section,
          prevBtn,
          nextBtn,
          pageIndex,
          items,
          pageSize,
          totalPages,
          currentPage: 0
        };

        trendStateMap.set(section, state);
        updateTrendPagination(state);
      });

      document.addEventListener('click', (event) => {
        const trendBtn = event.target.closest('.trend-prev, .trend-next');
        if (!trendBtn || trendBtn.disabled) return;

        const section = trendBtn.closest('.trend-section');
        const state = trendStateMap.get(section);
        if (!state) return;

        if (trendBtn.classList.contains('trend-prev')) {
          if (state.currentPage > 0) state.currentPage--;
        } else {
          if (state.currentPage < state.totalPages - 1) state.currentPage++;
        }

        updateTrendPagination(state);
      });
    });
  </script>`;

  return wrapWithLayout(content, {
    currentPage: 'wiki',
    title: '게임 위키 - 게임 업계 지식백과',
    description: '게임 업계 비즈니스, 기술, 역사, 용어를 심층적으로 다루는 게임 위키입니다.',
    keywords: '게임 위키, 게임 용어, 게임 비즈니스, ARPU, ROAS, 게임 엔진, 게임 역사',
    canonical: `${siteBaseUrl}/wiki/`,
    pageScripts,
    breadcrumbs: [
      { name: '홈', url: `${siteBaseUrl}/` },
      { name: '게임 위키', url: `${siteBaseUrl}/wiki/` }
    ]
  });
}

module.exports = { generateWikiHubPage };
