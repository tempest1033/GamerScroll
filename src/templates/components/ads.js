const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// 모바일 광고: ins에 최소 크기 설정 (컨테이너의 80% 이상만 허용)
const mobileAdScript = `(function(){if(innerWidth>=769)return;var c=document.currentScript.parentElement,ins=c.querySelector('ins'),w=c.offsetWidth,h=c.offsetHeight;ins.style.minWidth=(w*0.8)+'px';ins.style.minHeight=(h*0.8)+'px';})();`;

const vwToPxScript = {
  'mobile-200': mobileAdScript,
  'mobile-400': mobileAdScript
};

function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { type = 'mobile-200' } = options;
  const classMap = {
    'mobile-200': 'ad-top',
    'mobile-400': 'ad-mid',
    'vertical': 'ad-vertical',
    'rectangle': 'ad-rectangle'
  };
  const adClass = classMap[type] || classMap['mobile-200'];

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // 타입별 AdSense 속성 추가
  // mobile-200, mobile-400: format 미지정 (AdSense auto)
  if (type === 'rectangle') {
    attrs.push('data-ad-format="rectangle"');
  }
  if (type === 'vertical') {
    attrs.push('data-ad-format="vertical"');
  }

  // vw → px 변환 스크립트 (모바일 전용)
  const sizeScript = vwToPxScript[type] ? `<script>${vwToPxScript[type]}</script>` : '';

  return `<div class="ad-card ad-card-${type}">
  ${sizeScript}
  <ins ${attrs.join(' ')}></ins>
  <script>document.addEventListener('DOMContentLoaded', function() { (adsbygoogle = window.adsbygoogle || []).push({}); });</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
