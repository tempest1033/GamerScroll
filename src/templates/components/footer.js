/**
 * 푸터 컴포넌트 (개인정보처리방침 모달 포함)
 */

function generateFooter() {
  const year = new Date().getFullYear();

  return `
	  <!-- Footer -->
	  <footer class="site-footer">
	    <span>© ${year} 게이머스크롤</span>
	    <span class="footer-divider">|</span>
	    <a href="/privacy/" class="footer-privacy-link" data-modal-open="privacy-modal">개인정보처리방침</a>
	  </footer>

	  <!-- Privacy Modal (content loaded dynamically) -->
	  <div id="privacy-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-hidden="true">
	    <div class="modal-content">
	      <button class="modal-close" type="button" data-modal-close="privacy-modal" aria-label="닫기">&times;</button>
	      <div class="privacy-modal-body"></div>
	    </div>
	  </div>
`;
}

module.exports = { generateFooter };
