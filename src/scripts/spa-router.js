/**
 * SPA 라우터 스크립트
 * - 네비게이션 링크 클릭 가로채기
 * - partial 콘텐츠 fetch + 교체
 * - 광고 갱신
 * - 스와이프 애니메이션
 */

const spaRouterScript = `
<script>
(function() {
  // SPA 지원 페이지 목록
  const SPA_PAGES = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic', 'news'];
  const TRANSITION_DURATION = 280;

  // 현재 페이지 정보
  let currentPage = getCurrentPage();
  let isNavigating = false;

  function getCurrentPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '/index.html') return 'home';
    for (const page of SPA_PAGES) {
      if (path.includes('/' + page)) return page;
    }
    return null;
  }

  function getPageIndex(page) {
    if (page === 'home') return -1;
    return SPA_PAGES.indexOf(page);
  }

  // partial 콘텐츠 캐시
  const pageCache = new Map();

  // partial URL 생성
  function getPartialUrl(page) {
    if (page === 'home') return '/partials/home.html';
    return '/partials/' + page + '.html';
  }

  // partial 콘텐츠 fetch
  async function fetchPartial(page) {
    if (pageCache.has(page)) {
      return pageCache.get(page);
    }

    const url = getPartialUrl(page);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Fetch failed');
      const html = await response.text();
      pageCache.set(page, html);
      return html;
    } catch (e) {
      console.warn('[SPA] Partial fetch failed:', page, e);
      return null;
    }
  }

  // 프리페치
  function prefetchPage(page) {
    if (!pageCache.has(page)) {
      fetchPartial(page);
    }
  }

  // 광고 갱신
  function refreshAds() {
    document.querySelectorAll('.ad-card ins.adsbygoogle').forEach(function(ins) {
      // 기존 광고 상태 초기화
      ins.innerHTML = '';
      ins.removeAttribute('data-ad-status');
      ins.removeAttribute('data-ad-loaded');
      ins.style.display = 'block';
      ins.style.height = '';

      // 새 광고 요청
      try {
        (adsbygoogle = window.adsbygoogle || []).push({});
      } catch(e) {
        console.warn('[SPA] Ad refresh error:', e.message);
      }
    });
  }

  // 페이지 스크립트 재실행
  function executePageScripts(container) {
    // 인라인 스크립트 실행
    container.querySelectorAll('script').forEach(function(oldScript) {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  // nav active 상태 업데이트
  function updateNavActive(page) {
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.classList.remove('active');
      const href = item.getAttribute('href') || '';
      if (page === 'home' && href === '/') {
        item.classList.add('active');
      } else if (href.includes('/' + page + '/') || href.includes('/' + page)) {
        item.classList.add('active');
      }
    });
  }

  // body 클래스 업데이트
  function updateBodyClass(page) {
    document.body.className = document.body.className.replace(/page-\\w+/g, '');
    document.body.classList.add('page-' + page);
  }

  // 페이지 전환 애니메이션
  function animateTransition(direction, callback) {
    const main = document.querySelector('main.site-container');
    if (!main) {
      callback();
      return;
    }

    // 전환 방향에 따른 클래스
    const outClass = direction === 'left' ? 'spa-slide-out-left' : 'spa-slide-out-right';
    const inClass = direction === 'left' ? 'spa-slide-in-right' : 'spa-slide-in-left';

    main.classList.add(outClass);

    setTimeout(function() {
      callback();
      main.classList.remove(outClass);
      main.classList.add(inClass);

      // 스크롤 맨 위로
      window.scrollTo(0, 0);

      setTimeout(function() {
        main.classList.remove(inClass);
      }, TRANSITION_DURATION);
    }, TRANSITION_DURATION);
  }

  // 페이지 전환 실행
  async function navigateTo(page, options = {}) {
    if (isNavigating || page === currentPage) return false;

    const { animate = true, pushState = true, direction = null } = options;
    isNavigating = true;

    // 방향 자동 결정
    let slideDirection = direction;
    if (!slideDirection) {
      const currentIdx = getPageIndex(currentPage);
      const targetIdx = getPageIndex(page);
      slideDirection = targetIdx > currentIdx ? 'left' : 'right';
    }

    // partial 콘텐츠 fetch
    const html = await fetchPartial(page);

    if (!html) {
      // fetch 실패 시 전통적 네비게이션
      isNavigating = false;
      const url = page === 'home' ? '/' : '/' + page + '/';
      window.location.href = url;
      return false;
    }

    function updateContent() {
      // 메인 콘텐츠 교체
      const main = document.querySelector('main.site-container');
      if (main) {
        main.innerHTML = html;
        executePageScripts(main);
      }

      // URL 업데이트
      if (pushState) {
        const url = page === 'home' ? '/' : '/' + page + '/';
        history.pushState({ page: page }, '', url);
      }

      // UI 업데이트
      updateNavActive(page);
      updateBodyClass(page);
      currentPage = page;

      // 광고 갱신 (약간 지연)
      setTimeout(refreshAds, 100);

      // 인접 페이지 프리페치
      const idx = getPageIndex(page);
      if (idx > 0) prefetchPage(SPA_PAGES[idx - 1]);
      if (idx < SPA_PAGES.length - 1) prefetchPage(SPA_PAGES[idx + 1]);
      if (page !== 'home') prefetchPage('home');

      isNavigating = false;
    }

    if (animate && window.innerWidth <= 768) {
      animateTransition(slideDirection, updateContent);
    } else {
      updateContent();
      window.scrollTo(0, 0);
    }

    return true;
  }

  // 네비게이션 클릭 가로채기
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a.nav-item');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // 외부 링크는 무시
    if (href.startsWith('http') && !href.includes(window.location.host)) return;

    // 페이지 판별
    let targetPage = null;
    if (href === '/' || href === '/index.html') {
      targetPage = 'home';
    } else {
      for (const page of SPA_PAGES) {
        if (href.includes('/' + page)) {
          targetPage = page;
          break;
        }
      }
    }

    if (targetPage && targetPage !== currentPage) {
      e.preventDefault();
      navigateTo(targetPage);
    }
  });

  // 브라우저 뒤로가기/앞으로가기
  window.addEventListener('popstate', function(e) {
    const page = (e.state && e.state.page) || getCurrentPage() || 'home';
    if (page !== currentPage) {
      navigateTo(page, { pushState: false, animate: true });
    }
  });

  // 초기 상태 저장
  history.replaceState({ page: currentPage }, '', window.location.href);

  // 전역으로 노출 (스와이프에서 사용)
  window.spaNavigateTo = navigateTo;
  window.spaGetCurrentPage = function() { return currentPage; };
  window.spaGetPageIndex = getPageIndex;
  window.SPA_PAGES = SPA_PAGES;

  // 인접 페이지 프리페치
  setTimeout(function() {
    const idx = getPageIndex(currentPage);
    if (idx > 0) prefetchPage(SPA_PAGES[idx - 1]);
    if (idx < SPA_PAGES.length - 1) prefetchPage(SPA_PAGES[idx + 1]);
    if (currentPage !== 'home') prefetchPage('home');
  }, 1000);
})();
</script>`;

// SPA 전환 애니메이션 CSS
const spaTransitionCss = `
<style>
/* SPA 페이지 전환 애니메이션 */
main.site-container {
  will-change: transform, opacity;
}

@media (max-width: 768px) {
  main.spa-slide-out-left {
    animation: slideOutLeft 280ms ease-out forwards;
  }
  main.spa-slide-out-right {
    animation: slideOutRight 280ms ease-out forwards;
  }
  main.spa-slide-in-left {
    animation: slideInLeft 280ms ease-out forwards;
  }
  main.spa-slide-in-right {
    animation: slideInRight 280ms ease-out forwards;
  }

  @keyframes slideOutLeft {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(-30%); opacity: 0; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(30%); opacity: 0; }
  }
  @keyframes slideInLeft {
    from { transform: translateX(-30%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideInRight {
    from { transform: translateX(30%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
}

/* PC에서는 fade만 */
@media (min-width: 769px) {
  main.spa-slide-out-left,
  main.spa-slide-out-right {
    animation: fadeOut 200ms ease-out forwards;
  }
  main.spa-slide-in-left,
  main.spa-slide-in-right {
    animation: fadeIn 200ms ease-out forwards;
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
</style>`;

module.exports = { spaRouterScript, spaTransitionCss };
