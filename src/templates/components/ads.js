/**
 * 광고(AdSense) 공통 헬퍼 - 카드 래퍼 방식
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 광고 카드 생성
 * - 크기는 CSS(.ad-card)로 제어
 * - ins는 항상 display:block + fullWidthResponsive
 * @param {string} slotId - 광고 슬롯 ID
 * @param {Object} options - 옵션 (하위 호환용, 무시됨)
 */
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const attrs = [
    'class="adsbygoogle"',
    'style="display:block"',
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`,
    'data-ad-format="auto"',
    'data-full-width-responsive="true"'
  ];

  return `<div class="ad-card">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * 사이드바 300x600 광고 카드
 */
function renderAdCard300x600(slotId) {
  if (!slotId) return '';

  const attrs = [
    'class="adsbygoogle"',
    'style="display:block"',
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`,
    'data-ad-format="auto"',
    'data-full-width-responsive="true"'
  ];

  return `<div class="ad-card ad-card-300x600">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

/**
 * 사이드바 300x250 광고 카드 (rectangle 타입)
 */
function renderAdCard300x250(slotId) {
  if (!slotId) return '';

  const attrs = [
    'class="adsbygoogle"',
    'style="display:block"',
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`,
    'data-ad-format="rectangle"'
  ];

  return `<div class="ad-card ad-card-300x250">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard, renderAdCard300x600, renderAdCard300x250 };
