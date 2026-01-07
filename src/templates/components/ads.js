/**
 * 광고(AdSense) 공통 헬퍼 - 카드 래퍼 방식
 */

const ADSENSE_CLIENT = 'ca-pub-9477874183990825';

/**
 * 광고 카드 생성
 * @param {string} slotId - 광고 슬롯 ID
 * @param {Object} options - 옵션
 * @param {number} options.width - 너비 (px)
 * @param {number} options.height - 높이 (px)
 * @param {string} options.format - 광고 포맷 (auto 등)
 * @param {boolean} options.fullWidthResponsive - 전체 너비 반응형
 */
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { width, height, format = 'auto', fullWidthResponsive = true } = options;

  // ins 스타일: 크기가 지정되면 고정, 아니면 block
  let insStyle = 'display:block';
  if (width && height) {
    insStyle = `display:inline-block;width:${width}px;height:${height}px`;
  }

  const attrs = [
    'class="adsbygoogle"',
    `style="${insStyle}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  if (format) attrs.push(`data-ad-format="${format}"`);
  if (fullWidthResponsive && !width) attrs.push('data-full-width-responsive="true"');

  return `<div class="ad-card">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
