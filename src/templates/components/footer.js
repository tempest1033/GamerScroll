/**
 * 푸터 컴포넌트 (개인정보처리방침 모달 포함)
 *
 * [SEO 주의사항]
 * - privacy-modal-body는 빈 상태로 유지 (동적 로드)
 * - /assets/privacy-content.html이 클릭 시 fetch됨 (layout.js)
 * - privacy-content.html에 H2/H3 태그 사용 금지 → .privacy-title, .privacy-section-title 클래스 사용
 * - 이유: 검색엔진이 privacy 내용을 본문 헤딩으로 오인하면 SEO에 악영향
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
