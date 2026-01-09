const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

// vw → px 변환 인라인 스크립트 (모바일 전용)
const vwToPxScript = {
  'mobile-200': `(function(){if(window.innerWidth>=769)return;var vw=window.innerWidth/100,h=Math.round(50*vw),el=document.currentScript.parentElement;el.style.width=Math.round(80*vw)+'px';el.style.height=h+'px';})();`,
  'mobile-400': `(function(){if(window.innerWidth>=769)return;var vw=window.innerWidth/100,h=Math.round(85*vw),el=document.currentScript.parentElement;el.style.width=Math.round(90*vw)+'px';el.style.height=h+'px';})();`
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
  <script>window.addEventListener('load', function() { (adsbygoogle = window.adsbygoogle || []).push({}); });</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
