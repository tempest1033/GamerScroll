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

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    'style="display:block"',
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // 타입별 AdSense 속성 추가
  if (type === 'rectangle') {
    attrs.push('data-ad-format="rectangle"');
  } else if (type === 'vertical') {
    attrs.push('data-ad-format="auto"');
    attrs.push('data-full-width-responsive="true"');
  } else if (type === 'mobile-400') {
    attrs.push('data-ad-format="auto"');
    attrs.push('data-full-width-responsive="true"');
  }

  // 상단 광고(mobile-200)는 즉시 로드, 나머지는 lazy load
  const isLazy = type !== 'mobile-200';
  const pushScript = isLazy
    ? '' // lazy load는 Intersection Observer에서 처리
    : '<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>';

  return `<div class="ad-card ad-card-${type}"${isLazy ? ' data-ad-lazy="true"' : ''}>
  <ins ${attrs.join(' ')}></ins>
  ${pushScript}
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
