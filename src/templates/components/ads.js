const ADSENSE_CLIENT = 'ca-pub-9477874183990825';
function renderAdCard(slotId, options = {}) {
  if (!slotId) return '';

  const { type = 'mobile' } = options;
  const classMap = {
    'mobile': 'ad-top',
    'mobile-500': 'ad-mid',
    'pc': 'ad-pc',
    'vertical': 'ad-vertical',
    'rectangle': 'ad-rectangle'
  };
  const adClass = classMap[type] || classMap['mobile'];

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    'style="display:block"',
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // 타입별 AdSense 속성 추가
  if (type === 'rectangle') {
    attrs.push('data-ad-format="rectangle"');
  } else {
    attrs.push('data-ad-format="auto"');
    attrs.push('data-full-width-responsive="true"');
  }

  return `<div class="ad-card ad-card-${type}">
  <ins ${attrs.join(' ')}></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
