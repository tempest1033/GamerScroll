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

  // 타입별 스타일 결정 (width/height 100% 제거 → 래퍼가 중앙정렬)
  const styleMap = {
    'mobile-200': 'min-width:300px;min-height:90px',
    'mobile-400': 'min-width:300px;min-height:250px',
    'pc': 'min-width:300px;min-height:90px',
    'vertical': 'min-width:160px;min-height:600px',
    'rectangle': 'min-width:300px;min-height:250px'
  };
  const styleValue = styleMap[type] || '';

  const attrs = [
    `class="adsbygoogle ${adClass}"`,
    `style="${styleValue}"`,
    `data-ad-client="${ADSENSE_CLIENT}"`,
    `data-ad-slot="${slotId}"`
  ];

  // 타입별 AdSense 속성 추가
  if (type === 'rectangle') {
    attrs.push('data-ad-format="rectangle"');
  }
  // vertical, mobile-400: format 없이 min-width/min-height로 처리

  return `<div class="ad-card ad-card-${type}">
  <ins ${attrs.join(' ')}></ins>
</div>`;
}

module.exports = { ADSENSE_CLIENT, renderAdCard };
