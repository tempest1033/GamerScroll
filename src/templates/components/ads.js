const ADSENSE_CLIENT = 'ca-pub-9477874183990825';
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { type = 'mobile-200' } = options;
  const classMap = {
    'mobile-200': 'ad-top',
    'mobile-400': 'ad-mid',
    'pc': 'ad-pc',
    'vertical': 'ad-vertical',
    'rectangle': 'ad-rectangle'
  };
  const adClass = classMap[type] || classMap['mobile-200'];

  // 타입별 min-width (AdSense availableWidth 계산용)
  const minWidthMap = {
    'mobile-200': 300,
    'mobile-400': 300,
    'pc': 728,
    'vertical': 300,
    'rectangle': 300
  };
  const minWidth = minWidthMap[type] || 300;

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    `style="display:block;min-width:${minWidth}px"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // 타입별 AdSense 속성 추가 (CSS로 크기 제어하므로 format 최소화)
  if (type === 'rectangle') {
    attrs.push('data-ad-format="rectangle"');
  }

  return `<div class="ad-card ad-card-${type}">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
