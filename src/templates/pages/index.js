/**
 * 홈/대시보드 페이지 템플릿
 * 각 섹션의 요약 카드를 표시
 */

const fs = require('fs');
const path = require('path');
const {
  wrapWithLayout,
  AD_SLOTS,
  generateAdSlot,
  generateAdPairSlot,
  generateHomeAdPairSlot,
  generateMobileOnlyMidAdSlot,
  generateVerticalAdSlot,
  generateRectangleAdSlot,
  generateNativeAdSlot
} = require('../layout');

// 통합 반응형 빌드 - 단일 도메인
const siteBaseUrl = 'https://gamerscroll.com';

// docs 폴더 경로 (통합 빌드)
const docsDir = path.join(__dirname, '../../../docs');

// 위키 썸네일 로컬 경로 헬퍼 (폴백: 프록시 URL)
function getLocalWikiThumbPath(category, slug, originalUrl) {
  if (!category || !slug) return originalUrl || '';

  const localPath = `/assets/images/wiki/${category}/${slug}/thumbnail.webp`;
  const fullPath = path.join(docsDir, 'assets/images/wiki', category, slug, 'thumbnail.webp');

  if (fs.existsSync(fullPath)) {
    return localPath;
  }
  // 외부 URL은 wsrv.nl 프록시로 핫링크 차단 우회
  return originalUrl ? `https://wsrv.nl/?url=${encodeURIComponent(originalUrl)}` : '';
}

function generateIndexPage(data) {
  const { rankings, news, steam, youtube, chzzk, community, upcoming, insight, metacritic, weeklyInsight, popularGames = [], popularArticles = [], games = {}, issueReports = [], wikiData = {}, dailyReportsCount = 0, weeklyReportsCount = 0, sidebarPopularArticles = [], sidebarLatestArticles = [] } = data;

  // AI 트렌드 데이터
  const aiInsight = insight?.ai || null;
  // 파일명 기준 날짜 (최신 리포트 링크용)
  const insightFileDate = insight?.insightDate || '';

  // URL 수정 헬퍼
  const fixUrl = function(url) {
    if (!url) return url;
    if (url.startsWith('//')) url = 'https:' + url;
    // 모든 외부 이미지 프록시
    if (url.startsWith('http')) {
      const proxyUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=960&output=webp';
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

  const dailyInsightThumbnail = fixUrl(aiInsight?.thumbnail) || '';
  const weeklyInsightThumbnail = fixUrl(weeklyInsight?.ai?.thumbnail) || '';

  // 날짜 포맷 헬퍼 (2026-01-01 → 2026년 1월 1일) - 모바일/PC 공용
  const formatDateKr = (dateStr) => {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateStr;
    return `${match[1]}년 ${parseInt(match[2])}월 ${parseInt(match[3])}일`;
  };

  // 홈 트렌드 (일간/주간 2컬럼 그리드)
  function generateHomeInsight() {

    // 일간 데이터 (링크는 파일명 기준, 뱃지는 AI 응답 기준)
    const dailyHeadline = aiInsight?.headline || '일간';
    const dailySummary = aiInsight?.summary || '';
    const dailySlug = insightFileDate || '';
    const dailyLink = dailySlug ? `/magazine/daily/${dailySlug}/` : '/magazine/';
    const dailyBadgeText = insightFileDate ? `${formatDateKr(insightFileDate)} 일간` : '일간';

    // 주간 데이터
    const wai = weeklyInsight?.ai || null;
    const wInfo = weeklyInsight?.weekInfo || {};
    const weeklyHeadline = wai?.headline || (typeof wai?.summary === 'object' ? wai.summary.title : null) || '주간';
    const weeklySummary = typeof wai?.summary === 'object' ? wai.summary.desc : (wai?.summary || '');
    const weekNum = wInfo.weekNumber || wai?.weekNumber || '';
    const weekYear = wInfo.year || (wInfo.startDate ? wInfo.startDate.slice(0, 4) : new Date().getFullYear());
    const weeklySlug = weekNum ? `${weekYear}-W${String(weekNum).padStart(2, '0')}` : '';
    const weeklyLink = weeklySlug ? `/magazine/weekly/${weeklySlug}/` : '/magazine/';
    // 주간 뱃지: "2025년 12월 15일 ~ 12월 21일 주간"
    const weeklyBadgeText = wInfo.startDate && wInfo.endDate
      ? `${formatDateKr(wInfo.startDate)} ~ ${parseInt(wInfo.endDate.slice(5, 7))}월 ${parseInt(wInfo.endDate.slice(8, 10))}일 주간`
      : '주간';

    // 썸네일 (없으면 CSS gradient 배경만 보임) - fixUrl로 프록시 처리
    const dailyThumbnail = dailyInsightThumbnail;
    const weeklyThumbnail = weeklyInsightThumbnail;

    // 일간 카드 (이미지 + 헤드라인)
    const dailyCard = dailyHeadline ? `
      <a href="${dailyLink}" class="home-trend-card">
        <div class="home-trend-card-image">
          ${dailyThumbnail ? `<img src="${dailyThumbnail}" alt="${escapeHtmlAttr(dailyHeadline)}" loading="eager" fetchpriority="high" decoding="async" data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag">${dailyBadgeText}</span>
        </div>
        <h3 class="home-trend-card-title">${dailyHeadline}</h3>
      </a>
    ` : '';

    // 주간 카드 (이미지 + 헤드라인)
    const weeklyCard = wai ? `
      <a href="${weeklyLink}" class="home-trend-card">
        <div class="home-trend-card-image">
          ${weeklyThumbnail ? `<img src="${weeklyThumbnail}" alt="${escapeHtmlAttr(weeklyHeadline)}" loading="eager" fetchpriority="auto" decoding="async" data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag weekly">${weeklyBadgeText}</span>
        </div>
        <h3 class="home-trend-card-title">${weeklyHeadline}</h3>
      </a>
    ` : '';

    if (!dailyCard && !weeklyCard) {
      return '<div class="home-empty">매거진을 불러올 수 없습니다</div>';
    }

    // 일간 + 주간만 반환 (2컬럼 그리드)
    return `<div class="home-trend-grid">${dailyCard}${weeklyCard}</div>`;
  }

  // 홈 인기 기사 (가로형 3개 - eyesmag 스타일)
  function generateHomePopular() {
    const categoryNames = { history: '히스토리', knowledge: '지식', tech: '기술', business: '비즈니스' };

    // popularArticles에서 상위 3개의 상세 정보 조회
    const popularItems = popularArticles.slice(0, 3).map(article => {
      if (article.type === 'issue') {
        const issue = issueReports.find(i => i.slug === article.slug);
        if (issue) {
          return {
            type: 'issue',
            title: issue.title,
            summary: issue.summary || '',
            thumbnail: fixUrl(issue.thumbnail) || '',
            link: `/magazine/issue/${issue.slug}/`,
            badge: issue.date ? formatDateKr(issue.date) : '이슈'
          };
        }
      } else if (article.type === 'wiki' && article.category) {
        const wikiList = wikiData[article.category] || [];
        const wiki = wikiList.find(w => w.slug === article.slug);
        if (wiki) {
          return {
            type: 'wiki',
            title: wiki.title,
            summary: wiki.summary || '',
            thumbnail: getLocalWikiThumbPath(article.category, article.slug, wiki.thumbnail),
            link: `/wiki/${article.category}/${article.slug}/`,
            badge: categoryNames[article.category] || article.category
          };
        }
      }
      return null;
    }).filter(Boolean);

    // 인기 데이터가 부족하면 최신 이슈로 채우기
    if (popularItems.length < 3) {
      const remaining = 3 - popularItems.length;
      const usedSlugs = popularItems.map(p => p.link);
      issueReports.slice(0, remaining + 3).forEach(issue => {
        if (popularItems.length >= 3) return;
        const link = `/magazine/issue/${issue.slug}/`;
        if (!usedSlugs.includes(link)) {
          popularItems.push({
            type: 'issue',
            title: issue.title,
            summary: issue.summary || '',
            thumbnail: fixUrl(issue.thumbnail) || '',
            link,
            badge: issue.date ? formatDateKr(issue.date) : '이슈'
          });
          usedSlugs.push(link);
        }
      });
    }

    if (popularItems.length === 0) return '';

    const popularCards = popularItems.map((item, i) => `
      <a href="${item.link}" class="home-popular-card">
        <div class="home-popular-thumb">
          ${item.thumbnail ? `<img src="${item.thumbnail}" alt="${escapeHtmlAttr(item.title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
        </div>
        <div class="home-popular-info">
          <h3 class="home-popular-title">${item.title}</h3>
          ${item.summary ? `<p class="home-popular-summary">${item.summary}</p>` : ''}
        </div>
      </a>
    `).join('');

    return `
      <div class="home-card" id="home-popular">
        <div class="home-card-header">
          <h2 class="home-card-title">인기</h2>
        </div>
        <div class="home-popular-list">${popularCards}</div>
      </div>
    `;
  }

  // 홈 최신 기사 (3x5 그리드 + 페이지네이션 + 카테고리 필터)
  function generateHomeLatest() {
    const categoryNames = { history: '히스토리', knowledge: '지식', tech: '기술', business: '비즈니스' };

    // 모든 기사 수집 (이슈 + 위키)
    const allArticles = [];

    // 이슈 추가
    issueReports.forEach(issue => {
      allArticles.push({
        type: 'issue',
        category: 'issue',
        title: issue.title,
        thumbnail: fixUrl(issue.thumbnail) || '',
        link: `/magazine/issue/${issue.slug}/`,
        badge: '이슈',
        date: issue.date || ''
      });
    });

    // 위키 추가
    const categoryOrder = ['history', 'knowledge', 'tech', 'business'];
    categoryOrder.forEach(category => {
      (wikiData[category] || []).forEach(wiki => {
        allArticles.push({
          type: 'wiki',
          category: category,
          title: wiki.title,
          thumbnail: getLocalWikiThumbPath(category, wiki.slug, wiki.thumbnail),
          link: `/wiki/${category}/${wiki.slug}/`,
          badge: categoryNames[category],
          date: wiki.date || ''
        });
      });
    });

    // 날짜순 정렬 (최신순)
    allArticles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (allArticles.length === 0) return '';

    // 모든 카드 생성 (JS로 페이지네이션 + 카테고리 필터)
    const latestCards = allArticles.map((item, i) => `
      <a href="${item.link}" class="home-trend-card home-latest-item" data-index="${i}" data-category="${item.category}">
        <div class="home-trend-card-image">
          ${item.thumbnail ? `<img src="${item.thumbnail}" alt="${escapeHtmlAttr(item.title)}" loading="lazy" data-img-fallback="hide">` : ''}
          <span class="home-trend-card-tag ${item.type}">${item.date ? formatDateKr(item.date) : item.badge}</span>
        </div>
        <h3 class="home-trend-card-title"><span class="home-trend-card-title-text">${item.title}</span></h3>
      </a>
    `).join('');

    const totalPages = Math.ceil(allArticles.length / 15);

    return `
      <div class="home-card" id="home-latest">
        <div class="home-card-header">
          <h2 class="home-card-title">최신</h2>
        </div>
        <div class="home-latest-grid">${latestCards}</div>
        <div class="home-pagination" data-total="${allArticles.length}" data-per-page="15">
          <button class="home-page-btn home-page-prev" disabled>‹</button>
          <span class="home-page-info">1 / ${totalPages}</span>
          <button class="home-page-btn home-page-next">›</button>
        </div>
      </div>
    `;
  }

  // 사이드바: 카테고리 메뉴 (매거진 + 위키 그룹) - 링크 연결
  function generateSidebarCategories() {
    // 카테고리별 글 개수 계산
    const counts = {
      daily: dailyReportsCount,
      weekly: weeklyReportsCount,
      issue: issueReports.length,
      history: (wikiData.history || []).length,
      knowledge: (wikiData.knowledge || []).length,
      tech: (wikiData.tech || []).length,
      business: (wikiData.business || []).length
    };

    // 매거진 카테고리 (시의성)
    const magazineCategories = [
      { id: 'daily', name: '일간', link: '/magazine/daily/', count: counts.daily },
      { id: 'weekly', name: '주간', link: '/magazine/weekly/', count: counts.weekly },
      { id: 'issue', name: '이슈', link: '/magazine/issue/', count: counts.issue }
    ];

    // 위키 카테고리 (에버그린)
    const wikiCategories = [
      { id: 'history', name: '히스토리', link: '/wiki/history/', count: counts.history },
      { id: 'knowledge', name: '지식', link: '/wiki/knowledge/', count: counts.knowledge },
      { id: 'tech', name: '기술', link: '/wiki/tech/', count: counts.tech },
      { id: 'business', name: '비즈니스', link: '/wiki/business/', count: counts.business }
    ];

    const renderItems = (items) => items.map(cat => `
      <a href="${cat.link}" class="sidebar-category-item">
        <span class="sidebar-category-name">${cat.name}${cat.count !== undefined ? ` (${cat.count})` : ''}</span>
      </a>
    `).join('');

    return `
      <div class="home-card" id="sidebar-categories">
        <div class="sidebar-category-group">
          <div class="home-card-header"><h2 class="home-card-title">매거진</h2></div>
          <div class="sidebar-category-list">${renderItems(magazineCategories)}</div>
        </div>
        <div class="sidebar-category-group">
          <div class="home-card-header"><h2 class="home-card-title">위키</h2></div>
          <div class="sidebar-category-list">${renderItems(wikiCategories)}</div>
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
          <div class="sidebar-article-list active" id="sidebar-popular">${renderList(sidebarPopularArticles)}</div>
          <div class="sidebar-article-list" id="sidebar-latest">${renderList(sidebarLatestArticles)}</div>
        </div>
      </div>
    `;
  }

  // 홈 위키 카드 (카테고리별 4개씩)
  function generateHomeWiki() {
    const categoryOrder = ['history', 'knowledge', 'tech', 'business'];
    const categoryNames = {
      history: '히스토리',
      knowledge: '지식',
      tech: '기술',
      business: '비즈니스'
    };

    const renderWikiCard = (wiki, category) => {
      const thumbPath = getLocalWikiThumbPath(category, wiki.slug, wiki.thumbnail);
      return `
        <a href="/wiki/${category}/${wiki.slug}/" class="home-trend-card">
          <div class="home-trend-card-image">
            ${thumbPath ? `<img src="${thumbPath}" alt="${escapeHtmlAttr(wiki.title || '')}" loading="lazy" data-img-fallback="hide">` : ''}
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
  var insightCardHtml = (aiInsight || weeklyInsight) ?
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

  // 홈페이지 (통합 반응형 - PC 2컬럼 구조, 모바일은 CSS로 1컬럼 처리)
  var content = '<section class="home-section active" id="home">' +
    '<h1 class="visually-hidden">게이머스크롤 - 게임 트렌드, 게임 업계 소식, 게임 위키</h1>' +
    '<div class="page-container">' +
    generateHomeAdPairSlot(AD_SLOTS.PCHome001, AD_SLOTS.Mobile001) +
    '<div class="home-container">' +
    '<div class="home-main">' +
    insightCardHtml +
    generateHomePopular() +
    generateNativeAdSlot(AD_SLOTS.Article001) +
    generateHomeLatest() +
    '</div>' +
    '<div class="home-sidebar">' +
    generateSidebarMobileRank() +
    '<div class="home-sidebar-sticky">' +
    generateSidebarCategories() +
    generateSidebarArticles() +
    generateVerticalAdSlot(AD_SLOTS.PCHome002) +
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

    // 최신 기사 페이지네이션 + 카테고리 필터
    (function() {
      const pagination = document.querySelector('.home-pagination');
      const categoryMenu = document.getElementById('sidebar-categories');
      const popularCard = document.getElementById('home-popular');
      const insightCard = document.getElementById('home-insight');
      const latestCard = document.getElementById('home-latest');
      const latestTitle = latestCard?.querySelector('.home-card-title');
      if (!pagination) return;

      const categoryNames = { issue: '이슈', history: '히스토리', knowledge: '지식', tech: '기술', business: '비즈니스' };
      const perPage = parseInt(pagination.dataset.perPage, 10);
      const allItems = Array.from(document.querySelectorAll('.home-latest-item'));
      const prevBtn = pagination.querySelector('.home-page-prev');
      const nextBtn = pagination.querySelector('.home-page-next');
      const pageInfo = pagination.querySelector('.home-page-info');
      let currentPage = 1;
      let currentCategory = null;
      let filteredItems = allItems;

      function filterByCategory(category) {
        // 같은 카테고리 다시 클릭하면 해제 (전체로 복귀)
        if (currentCategory === category) {
          currentCategory = null;
          filteredItems = allItems;
          categoryMenu.querySelectorAll('.sidebar-category-item').forEach(b => b.classList.remove('active'));
          // 인기/인사이트 카드 복원
          if (popularCard) popularCard.style.display = '';
          if (insightCard) insightCard.style.display = '';
          // 타이틀 복원
          if (latestTitle) latestTitle.textContent = '최신';
        } else {
          currentCategory = category;
          filteredItems = allItems.filter(item => item.dataset.category === category);
          // 인기/인사이트 카드 숨기기
          if (popularCard) popularCard.style.display = 'none';
          if (insightCard) insightCard.style.display = 'none';
          // 타이틀 변경
          if (latestTitle) latestTitle.textContent = categoryNames[category] || category;
        }
        currentPage = 1;
        updatePagination();
      }

      function updatePagination() {
        const totalPages = Math.ceil(filteredItems.length / perPage) || 1;
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;

        // 모든 아이템 숨기기
        allItems.forEach(item => item.style.display = 'none');

        // 필터링된 아이템 중 현재 페이지만 표시
        filteredItems.forEach((item, i) => {
          item.style.display = (i >= start && i < end) ? '' : 'none';
        });

        pageInfo.textContent = currentPage + ' / ' + totalPages;
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
      }

      prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; updatePagination(); }
      });
      nextBtn?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredItems.length / perPage);
        if (currentPage < totalPages) { currentPage++; updatePagination(); }
      });

      // 사이드바 카테고리 메뉴 클릭
      categoryMenu?.addEventListener('click', (e) => {
        const btn = e.target.closest('.sidebar-category-item');
        if (!btn) return;
        const isActive = btn.classList.contains('active');
        categoryMenu.querySelectorAll('.sidebar-category-item').forEach(b => b.classList.remove('active'));
        if (!isActive) btn.classList.add('active');
        filterByCategory(btn.dataset.filterCategory);
      });

      updatePagination();
    })();

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
    currentPage: 'home',  // 홈페이지 → 네비 선택 없음
    title: '게이머스크롤 - 모바일 게임 순위·스팀 게임 순위·게임 뉴스',
    description: '게이머스크롤 - 게임 순위, 모바일 게임 순위, 스팀 게임 순위, 게임 뉴스를 한눈에.',
    keywords: '게임 순위, 모바일 게임 순위, 스팀 게임 순위, 앱스토어 순위, 플레이스토어 순위, 메타크리틱, 게임 뉴스',
    canonical: `${siteBaseUrl}/`,
    pageScripts: pageScripts,
    preloadImages: [dailyInsightThumbnail, weeklyInsightThumbnail].filter(Boolean)
  });
}

module.exports = { generateIndexPage };
