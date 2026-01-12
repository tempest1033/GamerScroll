/**
 * SPA 라우터 스크립트
 * - 네비게이션 링크 클릭 가로채기
 * - HTML 추출 방식 (partial 파일 불필요)
 * - 광고 갱신
 * - 스와이프 애니메이션 (두 페이지 연결 슬라이드)
 */

const spaRouterScript = `
<script>
(function() {
  // SPA 지원 페이지 (메인 네비게이션)
  const NAV_PAGES = ['trend', 'games', 'rankings', 'steam', 'youtube', 'upcoming', 'metacritic', 'news'];
  const TRANSITION_MS = 200;

  let currentPage = getCurrentPage();
  let isNavigating = false;
  const pageCache = new Map();

  function getCurrentPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '/index.html') return 'home';
    for (const page of NAV_PAGES) {
      if (path.startsWith('/' + page)) return page;
    }
    return null;
  }

  function getPageIndex(page) {
    if (page === 'home') return -1;
    return NAV_PAGES.indexOf(page);
  }

  // HTML에서 main 콘텐츠 추출
  function extractMainContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const main = doc.querySelector('main.site-container');
    return main ? main.innerHTML : null;
  }

  // 페이지 fetch + 추출
  async function fetchPage(url) {
    if (pageCache.has(url)) {
      return pageCache.get(url);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Fetch failed');
      const html = await response.text();
      const content = extractMainContent(html);
      if (content) {
        pageCache.set(url, content);
      }
      return content;
    } catch (e) {
      console.warn('[SPA] Fetch failed:', url, e);
      return null;
    }
  }

  // 프리페치
  function prefetch(url) {
    if (!pageCache.has(url)) {
      fetch(url).then(r => r.text()).then(html => {
        const content = extractMainContent(html);
        if (content) pageCache.set(url, content);
      }).catch(() => {});
    }
  }

  // 광고 갱신
  function refreshAds() {
    document.querySelectorAll('.ad-card ins.adsbygoogle').forEach(function(ins) {
      ins.innerHTML = '';
      ins.removeAttribute('data-ad-status');
      ins.removeAttribute('data-ad-loaded');
      ins.style.display = 'block';
      ins.style.height = '';
      try {
        (adsbygoogle = window.adsbygoogle || []).push({});
      } catch(e) {}
    });
  }

  // 페이지 스크립트 재실행
  function executeScripts(container) {
    // 스크립트 목록을 배열로 복사 (DOM 변경 중 안전하게 순회)
    const scripts = Array.from(container.querySelectorAll('script'));
    scripts.forEach(function(oldScript) {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      // 기존 스크립트 제거 후 body에 추가 (확실한 실행 보장)
      oldScript.remove();
      document.body.appendChild(newScript);
    });
  }

  // nav active 업데이트
  function updateNavActive(page) {
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.classList.remove('active');
      const href = item.getAttribute('href') || '';
      if (page === 'home' && href === '/') {
        item.classList.add('active');
      } else if (href.startsWith('/' + page)) {
        item.classList.add('active');
      }
    });
  }

  // body 클래스 업데이트
  function updateBodyClass(page) {
    document.body.className = document.body.className.replace(/page-\\w+/g, '');
    document.body.classList.add('page-' + (page || 'home'));
  }

  // nav 캐러셀 위치 업데이트 (모바일)
  function updateNavCarousel(index) {
    var navInner = document.querySelector('.nav-inner');
    if (window.innerWidth <= 768 && navInner) {
      var offset = 0;
      if (index >= 4) offset = -40;
      else if (index === 3) offset = -20;
      navInner.style.transform = 'translateX(' + offset + '%)';
    }
  }

  // 슬라이드 애니메이션 (두 페이지 연결)
  function slideTransition(direction, newContent, callback) {
    const main = document.querySelector('main.site-container');
    if (!main) { callback(); return; }

    // 새 콘텐츠 컨테이너 생성
    const wrapper = document.createElement('div');
    wrapper.className = 'spa-slide-wrapper';

    const currentPane = document.createElement('div');
    currentPane.className = 'spa-pane spa-pane-current';
    currentPane.innerHTML = main.innerHTML;

    const newPane = document.createElement('div');
    newPane.className = 'spa-pane spa-pane-new';
    newPane.innerHTML = newContent;

    // 방향에 따라 배치
    if (direction === 'left') {
      wrapper.appendChild(currentPane);
      wrapper.appendChild(newPane);
      wrapper.style.transform = 'translateX(0)';
    } else {
      wrapper.appendChild(newPane);
      wrapper.appendChild(currentPane);
      wrapper.style.transform = 'translateX(-100%)';
    }

    main.innerHTML = '';
    main.appendChild(wrapper);

    // 강제 리플로우
    void wrapper.offsetHeight;

    // 애니메이션 시작
    wrapper.style.transition = 'transform ' + TRANSITION_MS + 'ms ease-out';
    wrapper.style.transform = direction === 'left' ? 'translateX(-100%)' : 'translateX(0)';

    setTimeout(function() {
      main.innerHTML = newContent;
      executeScripts(main);
      window.scrollTo(0, 0);
      callback();
    }, TRANSITION_MS);
  }

  // 페이지 전환
  async function navigateTo(url, options = {}) {
    if (isNavigating) return false;

    const { direction = 'left', pushState = true, skipUrlCheck = false } = options;

    // 같은 URL이면 무시 (popstate에서는 스킵)
    if (!skipUrlCheck && url === window.location.pathname) return false;

    isNavigating = true;

    // 콘텐츠 fetch
    const content = await fetchPage(url);
    if (!content) {
      isNavigating = false;
      window.location.href = url;
      return false;
    }

    // 새 페이지 정보
    const newPage = getCurrentPageFromUrl(url);

    // 모바일: 슬라이드 / PC: 즉시 교체
    if (window.innerWidth <= 768) {
      slideTransition(direction, content, finish);
    } else {
      const main = document.querySelector('main.site-container');
      if (main) {
        main.innerHTML = content;
        executeScripts(main);
      }
      window.scrollTo(0, 0);
      finish();
    }

    function finish() {
      if (pushState) {
        history.pushState({ url: url }, '', url);
      }
      var newIdx = getPageIndex(newPage);
      updateNavActive(newPage);
      updateBodyClass(newPage);
      updateNavCarousel(newIdx);
      currentPage = newPage;
      refreshAds();
      isNavigating = false;

      // 인접 페이지 프리페치
      prefetchAdjacent(newPage);
    }

    return true;
  }

  function getCurrentPageFromUrl(url) {
    if (url === '/' || url === '/index.html') return 'home';
    for (const page of NAV_PAGES) {
      if (url.startsWith('/' + page)) return page;
    }
    return null;
  }

  function prefetchAdjacent(page) {
    const idx = getPageIndex(page);
    if (idx > 0) prefetch('/' + NAV_PAGES[idx - 1] + '/');
    if (idx >= 0 && idx < NAV_PAGES.length - 1) prefetch('/' + NAV_PAGES[idx + 1] + '/');
    if (idx === 0) prefetch('/');
    if (page === 'home') prefetch('/' + NAV_PAGES[0] + '/');
  }

  // 네비게이션 클릭 가로채기
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    if (href.startsWith('http') && !href.includes(window.location.host)) return;
    if (link.hasAttribute('target')) return;

    // 내부 링크만 SPA 처리
    if (href.startsWith('/')) {
      const targetPage = getCurrentPageFromUrl(href);

      // SPA 미지원 페이지는 일반 이동
      if (targetPage === null) return;

      // 정확히 같은 URL이면 무시 (홈→홈, 같은 페이지 클릭 등)
      if (href === window.location.pathname || href === window.location.pathname + window.location.search) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const currentIdx = getPageIndex(currentPage);
      const targetIdx = getPageIndex(targetPage);
      const direction = targetIdx > currentIdx ? 'left' : 'right';
      navigateTo(href, { direction: direction });
    }
  });

  // 브라우저 뒤로가기/앞으로가기
  window.addEventListener('popstate', function(e) {
    const url = window.location.pathname + window.location.search;
    const targetPage = getCurrentPageFromUrl(url);

    // SPA 미지원 페이지면 새로고침
    if (targetPage === null) {
      window.location.reload();
      return;
    }

    const currentIdx = getPageIndex(currentPage);
    const targetIdx = getPageIndex(targetPage);
    const direction = targetIdx > currentIdx ? 'left' : 'right';
    navigateTo(url, { pushState: false, direction: direction, skipUrlCheck: true });
  });

  // 초기 상태
  history.replaceState({ url: window.location.pathname }, '', window.location.href);

  // 전역 노출
  window.spaNavigateTo = function(page, opts) {
    const url = page === 'home' ? '/' : '/' + page + '/';
    return navigateTo(url, opts);
  };
  window.spaGetCurrentPage = function() { return currentPage; };
  window.spaGetPageIndex = getPageIndex;
  window.NAV_PAGES = NAV_PAGES;

  // 초기 프리페치
  setTimeout(function() { prefetchAdjacent(currentPage); }, 500);
})();
</script>`;

// 슬라이드 애니메이션 CSS
const spaTransitionCss = `
<style>
/* SPA 슬라이드 애니메이션 */
.spa-slide-wrapper {
  display: flex;
  width: 200%;
}
.spa-pane {
  width: 50%;
  flex-shrink: 0;
}
</style>`;

module.exports = { spaRouterScript, spaTransitionCss };
