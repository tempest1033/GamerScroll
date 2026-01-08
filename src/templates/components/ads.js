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

  const adFormat = type === 'rectangle' ? 'rectangle' : 'auto';

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    `style="display:block;width:100%;min-width:${minWidth}px"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`,
    `data-ad-format="${adFormat}"`
  ];

  return `<div class="ad-card ad-card-${type}">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
