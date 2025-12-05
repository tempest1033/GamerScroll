/**
 * 레이아웃 조합기
 * 공통 컴포넌트를 조합하여 완전한 HTML 페이지를 생성
 */

const { generateHead, SHOW_ADS } = require('./components/head');
const { generateHeader } = require('./components/header');
const { generateNav } = require('./components/nav');
const { generateFooter } = require('./components/footer');

/**
 * 페이지를 레이아웃으로 감싸기
 * @param {string} content - 메인 콘텐츠 HTML
 * @param {Object} options - 옵션
 * @param {string} options.currentPage - 현재 페이지 ID (nav active 표시용)
 * @param {string} options.title - 페이지 제목
 * @param {string} options.description - 페이지 설명 (SEO)
 * @param {string} options.canonical - 페이지 URL
 * @param {string} options.pageScripts - 페이지별 추가 스크립트
 * @param {Object} options.pageData - 페이지별 데이터 (JSON)
 */
// 공통 스와이프 스크립트
const swipeScript = `
<script>
(function() {
  // 네비게이션 섹션 정의
  const navSections = ['insight', 'news', 'community', 'youtube', 'rankings', 'steam', 'upcoming', 'metacritic'];
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let touchedElement = null;
  let isTouchMoving = false;

  function getCurrentNavIndex() {
    const path = window.location.pathname;
    for (let i = 0; i < navSections.length; i++) {
      if (path.includes(navSections[i])) return i;
    }
    return -1; // 홈
  }

  function switchNavSection(index) {
    if (index < 0 || index >= navSections.length) {
      window.location.href = '/';
      return;
    }
    window.location.href = '/' + navSections[index];
  }

  // 스크롤 가능한 요소 찾기
  function findScrollableElement(el) {
    while (el && el !== document.body) {
      if (el.classList.contains('chart-scroll') && el.scrollWidth > el.clientWidth) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  let scrollableEl = null;

  // 터치 이벤트
  document.body.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    isTouchMoving = false;
    touchedElement = e.target.closest('.nav-item, .tab-btn');
    scrollableEl = findScrollableElement(e.target);
  }, { passive: true });

  document.body.addEventListener('touchmove', (e) => {
    const diffX = Math.abs(touchStartX - e.changedTouches[0].screenX);
    const diffY = Math.abs(touchStartY - e.changedTouches[0].screenY);
    if (diffX > 10 || diffY > 10) {
      isTouchMoving = true;
      document.body.classList.add('is-swiping');
      document.activeElement?.blur();
      if (touchedElement) {
        touchedElement.style.pointerEvents = 'none';
        touchedElement.classList.add('swiping');
      }
    }
  }, { passive: true });

  document.body.addEventListener('touchcancel', () => {
    document.body.classList.remove('is-swiping');
    if (touchedElement) {
      touchedElement.style.pointerEvents = '';
      touchedElement.classList.remove('swiping');
      touchedElement = null;
    }
    isTouchMoving = false;
  }, { passive: true });

  // 네비게이션 캐러셀 위치 조정
  function updateNavCarousel(index) {
    const navInner = document.querySelector('.nav-inner');
    if (window.innerWidth <= 768 && navInner) {
      let offset = 0;
      if (index >= 6) offset = -60;
      else if (index >= 5) offset = -40;
      else if (index >= 4) offset = -20;
      navInner.style.transform = 'translateX(' + offset + '%)';
    }
  }

  // 페이지 로드 시 nav 위치 조정
  const currentIdx = getCurrentNavIndex();
  if (currentIdx >= 0) updateNavCarousel(currentIdx);

  document.body.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;

    if (Math.abs(diffX) <= Math.abs(diffY)) {
      cleanup();
      return;
    }

    // 스크롤 영역 경계 체크
    if (scrollableEl) {
      const isAtStart = scrollableEl.scrollLeft <= 1;
      const isAtEnd = scrollableEl.scrollLeft + scrollableEl.clientWidth >= scrollableEl.scrollWidth - 1;
      // 왼쪽 스와이프(다음 페이지) - 오른쪽 끝에서만 허용
      if (diffX > 0 && !isAtEnd) { cleanup(); return; }
      // 오른쪽 스와이프(이전 페이지) - 왼쪽 끝에서만 허용
      if (diffX < 0 && !isAtStart) { cleanup(); return; }
    }

    if (Math.abs(diffX) > 75) {
      isSwiping = true;
      setTimeout(() => { isSwiping = false; }, 300);

      const currentIndex = getCurrentNavIndex();
      if (currentIndex === -1) {
        if (diffX > 0) switchNavSection(0);
        else switchNavSection(navSections.length - 1);
      } else {
        if (diffX > 0) switchNavSection(currentIndex + 1);
        else switchNavSection(currentIndex - 1);
      }
    }
    cleanup();

    function cleanup() {
      if (isTouchMoving && touchedElement) {
        const el = touchedElement;
        requestAnimationFrame(() => {
          el.style.pointerEvents = 'none';
          el.classList.add('swiping');
          setTimeout(() => {
            document.body.classList.remove('is-swiping');
            el.style.pointerEvents = '';
            el.classList.remove('swiping');
          }, 300);
        });
      }
      touchedElement = null;
      isTouchMoving = false;
    }
  }, { passive: true });
})();
</script>`;

function wrapWithLayout(content, options = {}) {
  const {
    currentPage = 'home',
    title = '게이머스크롤 | 데일리 게임 인사이트',
    description = '데일리 게임 인사이트 – 랭킹·뉴스·커뮤니티 반응까지, 모든 게임 정보를 한 눈에',
    canonical = 'https://gamerscrawl.com',
    pageScripts = '',
    pageData = {}
  } = options;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  ${generateHead({ title, description, canonical, pageData })}
</head>
<body>
  ${generateHeader()}
  ${generateNav(currentPage)}
  <main class="container">
    ${content}
  </main>
  ${generateFooter()}
  ${pageScripts}
  ${swipeScript}
</body>
</html>`;
}

module.exports = { wrapWithLayout, SHOW_ADS };
