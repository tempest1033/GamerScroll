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

  // vertical/rectangle: 구글 순정 방식 (CSS 개입 없음)
  if (type === 'vertical') {
    return `<div class="ad-card ad-card-vertical">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:600px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
  }
  if (type === 'rectangle') {
    return `<div class="ad-card ad-card-rectangle">
  <ins class="adsbygoogle"
       style="display:inline-block;width:300px;height:250px"
       data-ad-client="${ADSENSE_CLIENT}"
       data-ad-slot="${slotId}"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
  }

  // mobile-200/400: 기존 방식
  const classMap = {
    'mobile-200': 'ad-top',
    'mobile-400': 'ad-mid'
  };
  const adClass = classMap[type] || classMap['mobile-200'];

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // vw → px 변환 스크립트 (모바일 전용)
  const sizeScript = vwToPxScript[type] ? `<script>${vwToPxScript[type]}</script>` : '';

  return `<div class="ad-card ad-card-${type}">
  <ins ${attrs.join(' ')}></ins>
  ${sizeScript}
  <script>document.addEventListener('DOMContentLoaded', function() { (adsbygoogle = window.adsbygoogle || []).push({}); });</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
