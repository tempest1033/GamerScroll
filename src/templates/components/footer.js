/**
 * 푸터 컴포넌트
 *
 * 2026-09-09: 개인정보처리방침 모달 제거. 모달이 fetch하던 /assets/privacy-content.html 은 어디서도
 * 생성되지 않아 "내용을 불러올 수 없습니다"만 떴다. 링크는 템플릿 페이지 /privacy/ 로 바로 간다.
 */

function generateFooter() {
  const year = new Date().getFullYear();

  return `
	  <!-- Footer -->
	  <footer class="site-footer">
	    <span>© ${year} 게이머스크롤</span>
	    <span class="footer-divider">|</span>
	    <a href="/about/" class="footer-about-link">소개</a>
	    <span class="footer-divider">|</span>
	    <a href="https://x.com/gamerscroll" class="footer-x-link" rel="me noopener" target="_blank">X</a>
	    <span class="footer-divider">|</span>
	    <a href="/privacy/" class="footer-privacy-link">개인정보처리방침</a>
	  </footer>
`;
}

module.exports = { generateFooter };
