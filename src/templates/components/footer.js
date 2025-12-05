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
    <a href="#" onclick="document.getElementById('privacy-modal').style.display='flex'; return false;">개인정보처리방침</a>
  </footer>

  <!-- Privacy Modal -->
  <div id="privacy-modal" class="modal-overlay" onclick="if(event.target===this) this.style.display='none'">
    <div class="modal-content">
      <button class="modal-close" onclick="document.getElementById('privacy-modal').style.display='none'">&times;</button>
      <h2>개인정보처리방침</h2>
      <p>게이머스크롤(이하 "본 사이트")은 「개인정보 보호법」 및 관련 법령에 따라 이용자의 개인정보를 보호하고, 이와 관련된 고충을 신속하게 처리하기 위해 다음과 같은 개인정보처리방침을 수립·공개합니다.</p>

      <h3>1. 개인정보의 수집 항목 및 방법</h3>
      <p>본 사이트는 별도의 회원가입 절차 없이 모든 서비스를 이용할 수 있으며, 이용자로부터 이름, 이메일, 연락처 등의 개인정보를 직접 수집하지 않습니다.</p>

      <h3>2. 자동으로 수집되는 정보</h3>
      <p>서비스 이용 과정에서 아래와 같은 정보가 자동으로 생성되어 수집될 수 있습니다:</p>
      <ul style="margin: 10px 0; padding-left: 20px; font-size: 13px;">
        <li>접속 기기 정보 (기기 유형, 운영체제, 브라우저 종류)</li>
        <li>접속 로그 (접속 일시, 방문 페이지, 체류 시간)</li>
        <li>IP 주소 (익명화 처리됨)</li>
      </ul>
      <p>이 정보는 Google Analytics를 통해 수집되며, 개인을 식별할 수 없는 통계 형태로만 활용됩니다.</p>

      <h3>3. 개인정보의 보유 및 이용 기간</h3>
      <p>자동 수집된 정보는 수집일로부터 최대 26개월간 보관되며, 이후 자동으로 파기됩니다.</p>

      <h3>4. 쿠키(Cookie)의 사용</h3>
      <p>본 사이트는 이용자의 편의를 위해 쿠키를 사용합니다. 쿠키는 웹사이트 운영에 필요한 기술적 정보를 저장하며, 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있습니다.</p>

      <h3>5. 개인정보의 제3자 제공</h3>
      <p>본 사이트는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, Google Analytics 서비스 이용을 위해 익명화된 통계 데이터가 Google에 전송될 수 있습니다.</p>

      <h3>6. 정책 변경</h3>
      <p>본 개인정보처리방침은 법령 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 본 페이지를 통해 공지합니다.</p>

      <p style="margin-top: 20px; color: #666; font-size: 12px;">시행일자: 2025년 12월 4일</p>
    </div>
  </div>

  <style>
    .site-footer {
      text-align: center;
      padding: 20px;
      margin-top: 40px;
      border-top: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 12px;
    }
    .site-footer a { color: var(--text-secondary); text-decoration: none; }
    .site-footer a:hover { color: var(--text); }
    .footer-divider { margin: 0 8px; }
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    .modal-content {
      background: #1a1a1a;
      padding: 30px;
      border-radius: 12px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
      color: #ddd;
    }
    .modal-content h2 { margin-top: 0; color: #fff; }
    .modal-content h3 { color: #aaa; margin-top: 20px; font-size: 14px; }
    .modal-content p { font-size: 13px; line-height: 1.6; }
    .modal-close {
      position: absolute;
      top: 10px; right: 15px;
      background: none;
      border: none;
      color: #888;
      font-size: 24px;
      cursor: pointer;
    }
    .modal-close:hover { color: #fff; }
  </style>`;
}

module.exports = { generateFooter };
